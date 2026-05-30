// Gate-combat system: the wave-based 60-180s instanced run.
// Owns the lifecycle of state.activeGate (a GateRun) plus the reward payout and
// star scoring when a run is exited. Deterministic via seededFromHex.

import {
	BOSS_NAMES,
	ENEMY_BASE_HP,
	ENEMY_DPS,
	ENEMY_HP_PER_RANK,
	ENEMY_NAMES,
	FODDER_PER_WAVE,
	POWER_THEME,
	parMsForRank,
	profileFor,
	RANK_ORDINAL,
	WAVES_BY_RANK,
} from "@/game/data/gate-combat";
import { mulberry32, seededFromHex } from "@/game/lib/rng";
import type {
	EnemyKind,
	GameEvent,
	GameState,
	Gate,
	GateEnemy,
	GateRun,
	Player,
	PowerId,
	Rank,
	SystemReducer,
} from "@/game/types";

// --- Local discriminated union of THIS system's events. -------------------
// The GameState GameEvent union is open, so "event.type === 'X'" does NOT narrow
// payload fields. We define a local union + guard for type-safe access.

type GateCombatEvent =
	| { type: "GATE_ENTER"; hex: string }
	| { type: "GATE_ATTACK"; enemyId?: string }
	| { type: "GATE_SKILL"; slot: number }
	| { type: "GATE_DODGE" }
	| { type: "GATE_USE_POTION"; purchased?: boolean }
	| { type: "GATE_TICK"; now: number }
	| { type: "GATE_EXIT" };

const GATE_COMBAT_TYPES: Set<string> = new Set([
	"GATE_ENTER",
	"GATE_ATTACK",
	"GATE_SKILL",
	"GATE_DODGE",
	"GATE_USE_POTION",
	"GATE_TICK",
	"GATE_EXIT",
]);

function isGateCombatEvent(event: GameEvent): event is GateCombatEvent {
	return GATE_COMBAT_TYPES.has(event.type);
}

// GateRun plus transient run-only fields. These extra keys are inert to the rest
// of the game (the contract's GateRun does not require them) and let combat track
// regen caps and the active dodge window without a new GameState field.
type GateRunInternal = GateRun & {
	dodgeUntil?: number;
	maxStamina?: number;
	maxMana?: number;
};

// --- Tunables. -------------------------------------------------------------

const MS_PER_SECOND = 1000;
const HP_GOOD_FRACTION = 0.75; // 75%+ hp kept => one star
const POTION_HEAL = 40;
const STAMINA_PER_DODGE = 18;
const STAMINA_REGEN_PER_SECOND = 6;
const MANA_REGEN_PER_SECOND = 2;
const DODGE_MITIGATION_MS = 1200; // window where incoming damage is halved
const DODGE_DAMAGE_FACTOR = 0.4;
const MAX_STARS = 5;
const FULL_HP_FRACTION = 1;

// Reward base values, multiplied by (rankOrdinal + 1) and star count.
const BASE_XP_REWARD = 40;
const BASE_MANA_REWARD = 20;
const BASE_MATERIAL_REWARD = 2;

// Arena positions are normalized 0-1. Enemies cluster in the upper arena.
const ARENA_MIN_X = 0.12;
const ARENA_SPAN_X = 0.76;
const ARENA_MIN_Y = 0.16;
const ARENA_SPAN_Y = 0.34;

// --- Enemy / wave construction (deterministic). ----------------------------

function enemyHp(kind: EnemyKind, rank: Rank): number {
	const ord = RANK_ORDINAL[rank];
	return Math.round(ENEMY_BASE_HP[kind] + ENEMY_HP_PER_RANK[kind] * ord);
}

function pickName(pool: string[], rng: () => number, index: number): string {
	if (pool.length === 0) {
		return "Gate Foe";
	}
	const base = pool[Math.floor(rng() * pool.length)] ?? pool[0];
	return `${base} ${index + 1}`;
}

// Build the enemy list for a given wave. The final wave (wave === totalWaves) is
// a single boss. Earlier waves are fodder plus an occasional elite.
export function buildWave(
	gateHex: string,
	theme: GateRun["theme"],
	rank: Rank,
	wave: number,
	totalWaves: number
): GateEnemy[] {
	// Derive a per-wave seed from the gate seed so each wave is stable but unique.
	const gateSeed = seededFromHex(gateHex)();
	const WAVE_SEED_SPREAD = 1_000_003;
	const rng = mulberry32(
		Math.floor(gateSeed * 0xff_ff_ff) + wave * WAVE_SEED_SPREAD
	);

	if (wave >= totalWaves) {
		const hp = enemyHp("boss", rank);
		return [
			{
				id: `${gateHex}:w${wave}:boss`,
				name: BOSS_NAMES[theme],
				kind: "boss",
				hp,
				maxHp: hp,
				x: 0.5,
				y: ARENA_MIN_Y + ARENA_SPAN_Y * 0.2,
			},
		];
	}

	const count = FODDER_PER_WAVE[rank];
	const namePool = ENEMY_NAMES[theme];
	const enemies: GateEnemy[] = [];
	// One elite appears from the second wave onward.
	const ELITE_CHANCE = 0.5;
	const hasElite = wave >= 2 && rng() < ELITE_CHANCE;

	for (let i = 0; i < count; i++) {
		const isElite = hasElite && i === 0;
		const kind: EnemyKind = isElite ? "elite" : "fodder";
		const hp = enemyHp(kind, rank);
		const slot = count <= 1 ? 0.5 : i / (count - 1);
		enemies.push({
			id: `${gateHex}:w${wave}:e${i}`,
			name: isElite
				? `Elite ${pickName(namePool, rng, i)}`
				: pickName(namePool, rng, i),
			kind,
			hp,
			maxHp: hp,
			x: ARENA_MIN_X + ARENA_SPAN_X * slot,
			y: ARENA_MIN_Y + ARENA_SPAN_Y * rng(),
		});
	}
	return enemies;
}

// --- Player damage output. -------------------------------------------------

function statValue(
	player: Player,
	stat: "str" | "agi" | "int" | "per"
): number {
	return player.stats[stat];
}

// Per-hit damage for a basic attack, scaled by the equipped power's stat.
export function attackDamage(player: Player, power: PowerId): number {
	const profile = profileFor(power);
	const stat = statValue(player, profile.scaleStat);
	const ranks = RANK_ORDINAL[player.rank];
	const RANK_DAMAGE_BONUS = 0.12;
	const raw =
		(profile.baseDamage + stat * profile.scaleCoeff) *
		(1 + ranks * RANK_DAMAGE_BONUS);
	return Math.max(1, Math.round(raw));
}

// --- Run lifecycle helpers. ------------------------------------------------

function startRun(state: GameState, gate: Gate): GameState {
	const power = state.player.equippedPower;
	const totalWaves = WAVES_BY_RANK[gate.rank];
	const wave = 1;
	const enemies = buildWave(gate.hex, gate.theme, gate.rank, wave, totalWaves);
	const run: GateRunInternal = {
		gateHex: gate.hex,
		theme: gate.theme,
		rank: gate.rank,
		power,
		wave,
		totalWaves,
		enemies,
		startedAt: state.lastTick,
		playerHp: state.player.maxHp,
		playerMaxHp: state.player.maxHp,
		mana: state.player.maxCombatMana,
		stamina: state.player.maxStamina,
		potionsUsed: 0,
		purchasedPotionsUsed: 0,
		status: "active",
		elapsedMs: 0,
		starsEarned: 0,
		maxStamina: state.player.maxStamina,
		maxMana: state.player.maxCombatMana,
	};
	return { ...state, activeGate: run };
}

function nearestAliveEnemy(run: GateRun): GateEnemy | undefined {
	// Auto-target: the topmost (smallest y) living enemy reads as "nearest".
	let best: GateEnemy | undefined;
	for (const enemy of run.enemies) {
		if (enemy.hp <= 0) {
			continue;
		}
		if (!best || enemy.y < best.y) {
			best = enemy;
		}
	}
	return best;
}

function damageEnemy(
	run: GateRunInternal,
	targetId: string | undefined,
	amount: number
): GateRunInternal {
	const focus = targetId
		? run.enemies.find((e) => e.id === targetId && e.hp > 0)
		: undefined;
	const target = focus ?? nearestAliveEnemy(run);
	if (!target) {
		return run;
	}
	const enemies = run.enemies.map((e) =>
		e.id === target.id ? { ...e, hp: Math.max(0, e.hp - amount) } : e
	);
	return { ...run, enemies };
}

function allCleared(run: GateRun): boolean {
	return run.enemies.every((e) => e.hp <= 0);
}

// Mark a run won and stamp starsEarned so the results card can read it before
// GATE_EXIT pays out. Idempotent for an already-won run.
function finalizeWin(run: GateRunInternal): GateRunInternal {
	const won: GateRunInternal = { ...run, status: "won" };
	return { ...won, starsEarned: computeStars(won) };
}

// Advance the run by an elapsed delta: enemy chip damage, regen, wave spawn,
// win/lose resolution. dodgeUntil tracks the active dodge mitigation window.
function tickRun(run: GateRunInternal, deltaMs: number): GateRunInternal {
	if (run.status !== "active") {
		return run;
	}
	const deltaSeconds = deltaMs / MS_PER_SECOND;
	const nextElapsed = run.elapsedMs + deltaMs;

	// Wave cleared: spawn the next wave or, if that was the boss wave, win.
	if (allCleared(run)) {
		if (run.wave >= run.totalWaves) {
			return finalizeWin({ ...run, elapsedMs: nextElapsed });
		}
		const nextWave = run.wave + 1;
		const enemies = buildWave(
			run.gateHex,
			run.theme,
			run.rank,
			nextWave,
			run.totalWaves
		);
		return { ...run, elapsedMs: nextElapsed, wave: nextWave, enemies };
	}

	// Enemy formation chips the player. Dodge window halves incoming damage.
	let incoming = 0;
	for (const enemy of run.enemies) {
		if (enemy.hp > 0) {
			incoming += ENEMY_DPS[enemy.kind];
		}
	}
	const dodgeActive = run.dodgeUntil;
	const mitigation =
		dodgeActive && nextElapsed < dodgeActive ? DODGE_DAMAGE_FACTOR : 1;
	const hpLost = incoming * deltaSeconds * mitigation;
	const playerHp = Math.max(0, run.playerHp - hpLost);

	const staminaCap = run.maxStamina ?? run.stamina;
	const manaCap = run.maxMana ?? run.mana;
	const stamina = Math.min(
		staminaCap,
		run.stamina + STAMINA_REGEN_PER_SECOND * deltaSeconds
	);
	const mana = Math.min(
		manaCap,
		run.mana + MANA_REGEN_PER_SECOND * deltaSeconds
	);

	const next: GateRunInternal = {
		...run,
		elapsedMs: nextElapsed,
		playerHp,
		stamina,
		mana,
	};

	if (playerHp <= 0) {
		return { ...next, playerHp: 0, status: "lost" };
	}
	return next;
}

// --- Star scoring. ---------------------------------------------------------

// Compute stars earned for a won run per the 5-star rules:
// 1) complete (always, since this only runs on a win)
// 2) under par time
// 3) kept 75%+ hp
// 4) used no potions
// 5) class challenge: gate theme matches the equipped power's preferred theme.
export function computeStars(run: GateRun): number {
	if (run.status !== "won") {
		return 0;
	}
	let stars = 1; // complete
	if (run.elapsedMs <= parMsForRank(run.rank)) {
		stars += 1;
	}
	if (run.playerHp >= run.playerMaxHp * HP_GOOD_FRACTION) {
		stars += 1;
	}
	if (run.potionsUsed === 0) {
		stars += 1;
	}
	if (POWER_THEME[run.power] === run.theme) {
		stars += 1;
	}
	return Math.min(MAX_STARS, stars);
}

interface RunRewards {
	mana: number;
	materials: number;
	xp: number;
}

function rewardsFor(run: GateRun, stars: number): RunRewards {
	const tier = RANK_ORDINAL[run.rank] + 1;
	const starFactor = Math.max(1, stars);
	return {
		xp: BASE_XP_REWARD * tier * starFactor,
		mana: BASE_MANA_REWARD * tier * starFactor,
		materials: BASE_MATERIAL_REWARD * tier * starFactor,
	};
}

const GATE_MATERIAL_KEY = "gate_core";

function payoutWin(state: GameState, run: GateRun): GameState {
	const stars = computeStars(run);
	const rewards = rewardsFor(run, stars);
	const existingGate = state.gates[run.gateHex];
	const bestStars = Math.max(existingGate?.stars ?? 0, stars);

	const gates = existingGate
		? {
				...state.gates,
				[run.gateHex]: { ...existingGate, stars: bestStars, anchored: true },
			}
		: state.gates;

	const materials = {
		...state.resources.materials,
		[GATE_MATERIAL_KEY]:
			(state.resources.materials[GATE_MATERIAL_KEY] ?? 0) + rewards.materials,
	};

	return {
		...state,
		activeGate: null,
		gates,
		resources: {
			...state.resources,
			mana: state.resources.mana + rewards.mana,
			materials,
		},
		player: {
			...state.player,
			xp: state.player.xp + rewards.xp,
		},
	};
}

// --- The reducer. ----------------------------------------------------------

function handleGateTick(state: GameState, now: number): GameState {
	const run = state.activeGate;
	if (!run || run.status !== "active") {
		return state;
	}
	const deltaMs = Math.max(0, now - run.startedAt - run.elapsedMs);
	if (deltaMs <= 0) {
		return state;
	}
	const ticked = tickRun(run, deltaMs);
	if (ticked === run) {
		return state;
	}
	return { ...state, activeGate: ticked };
}

// Active run if present and still in progress, else null.
function activeRun(state: GameState): GateRunInternal | null {
	const run = state.activeGate;
	if (!run || run.status !== "active") {
		return null;
	}
	return run;
}

// Apply a damage result and resolve an immediate boss-wave win.
function withDamage(
	state: GameState,
	run: GateRunInternal,
	dmg: number,
	enemyId: string | undefined
): GameState {
	let next = damageEnemy(run, enemyId, dmg);
	if (allCleared(next) && next.wave >= next.totalWaves) {
		next = finalizeWin(next);
	}
	return { ...state, activeGate: next };
}

function handleEnter(state: GameState, hex: string): GameState {
	if (state.activeGate) {
		return state;
	}
	const gate = state.gates[hex];
	if (!gate) {
		return state;
	}
	return startRun(state, gate);
}

function handleAttack(
	state: GameState,
	enemyId: string | undefined
): GameState {
	const run = activeRun(state);
	if (!run) {
		return state;
	}
	return withDamage(state, run, attackDamage(state.player, run.power), enemyId);
}

function handleSkill(state: GameState): GameState {
	const run = activeRun(state);
	if (!run) {
		return state;
	}
	const profile = profileFor(run.power);
	if (run.mana < profile.skillCost) {
		return state;
	}
	const dmg = Math.round(
		attackDamage(state.player, run.power) * profile.skillMultiplier
	);
	const spent: GateRunInternal = {
		...run,
		mana: Math.max(0, run.mana - profile.skillCost),
	};
	return withDamage(state, spent, dmg, undefined);
}

function handleDodge(state: GameState): GameState {
	const run = activeRun(state);
	if (!run || run.stamina < STAMINA_PER_DODGE) {
		return state;
	}
	const next: GateRunInternal = {
		...run,
		stamina: run.stamina - STAMINA_PER_DODGE,
		dodgeUntil: run.elapsedMs + DODGE_MITIGATION_MS,
	};
	return { ...state, activeGate: next };
}

function handlePotion(state: GameState, purchased: boolean): GameState {
	const run = activeRun(state);
	if (!run || run.playerHp >= run.playerMaxHp * FULL_HP_FRACTION) {
		return state;
	}
	const next: GateRunInternal = {
		...run,
		playerHp: Math.min(run.playerMaxHp, run.playerHp + POTION_HEAL),
		potionsUsed: run.potionsUsed + 1,
		purchasedPotionsUsed: purchased
			? run.purchasedPotionsUsed + 1
			: run.purchasedPotionsUsed,
	};
	return { ...state, activeGate: next };
}

function handleExit(state: GameState): GameState {
	const run = state.activeGate;
	if (!run) {
		return state;
	}
	if (run.status === "won") {
		return payoutWin(state, run);
	}
	// Loss or abandon: clear the run, no rewards.
	return { ...state, activeGate: null };
}

export const gateCombatReducer: SystemReducer = (state, event) => {
	// Also advance the run on the spine TICK so combat progresses with the clock.
	if (event.type === "TICK") {
		return handleGateTick(state, (event as { now: number }).now);
	}

	if (!isGateCombatEvent(event)) {
		return state;
	}

	switch (event.type) {
		case "GATE_ENTER":
			return handleEnter(state, event.hex);
		case "GATE_ATTACK":
			return handleAttack(state, event.enemyId);
		case "GATE_SKILL":
			return handleSkill(state);
		case "GATE_DODGE":
			return handleDodge(state);
		case "GATE_USE_POTION":
			return handlePotion(state, event.purchased === true);
		case "GATE_TICK":
			return handleGateTick(state, event.now);
		case "GATE_EXIT":
			return handleExit(state);
		default:
			return state;
	}
};
