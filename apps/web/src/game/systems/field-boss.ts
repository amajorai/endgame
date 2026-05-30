// Field-boss system: dungeon breaks rupture stale gates into roaming field
// bosses, the player fights them down through phases, and being downed drops a
// reclaimable Soul Cache while corrupting break turf. Pure reducer, immutable.

import {
	BOSS_BASE_HP,
	BOSS_HIT_DAMAGE,
	BOSS_NAME_BY_THEME,
	BOSS_PHASES,
	BOSS_REWARD_MANA,
	BOSS_REWARD_XP,
	BOSS_SKILLS,
} from "@/game/data/field-boss";
import { hexCenter, hexDisk } from "@/game/lib/hex";
import { hashStringToInt, mulberry32 } from "@/game/lib/rng";
import type {
	Deed,
	FieldBoss,
	GameEvent,
	GameState,
	InventoryItem,
	Player,
	Rank,
	SystemReducer,
} from "@/game/types";

// --- Local discriminated union of THIS system's events. -------------------
type FieldBossEvent =
	| { type: "TICK"; now: number }
	| { type: "BOSS_TICK"; now: number }
	| { type: "BOSS_SPAWN"; hex: string }
	| { type: "BOSS_ATTACK" }
	| { type: "BOSS_SKILL"; slot: number }
	| { type: "BOSS_DODGE" }
	| { type: "BOSS_FLEE" }
	| { type: "BOSS_DEFEAT" }
	| { type: "BOSS_MOVE"; lat: number; lng: number; hex: string }
	| { type: "BOSS_ENGAGE" }
	| { type: "SOUL_CACHE_RECLAIM"; id: string };

const FIELD_BOSS_TYPES: Set<string> = new Set([
	"TICK",
	"BOSS_TICK",
	"BOSS_SPAWN",
	"BOSS_ATTACK",
	"BOSS_SKILL",
	"BOSS_DODGE",
	"BOSS_FLEE",
	"BOSS_DEFEAT",
	"BOSS_MOVE",
	"BOSS_ENGAGE",
	"SOUL_CACHE_RECLAIM",
]);

const isFieldBossEvent = (e: GameEvent): e is FieldBossEvent =>
	FIELD_BOSS_TYPES.has(e.type);

// --- Tuning constants. ----------------------------------------------------
const ZERO = 0;
const SOUL_CACHE_KIND = "soul_cache";
// How often (ms) a stale gate may rupture into a dungeon break.
const RUPTURE_INTERVAL_MS = 90_000;
// Boss chips the player on this cadence while engaged.
const BOSS_CHIP_INTERVAL_MS = 3000;
// Phase HP is total HP split evenly; a phase ends when its slice is gone.
const HP_FLOOR = 0;
// Dodge halves the next chip and costs stamina.
const DODGE_STAMINA_COST = 12;
const DODGE_MITIGATION = 0.5;
// Vitality reduces incoming damage: each point shaves this fraction, capped.
const VIT_MITIGATION_PER_POINT = 0.01;
const MAX_MITIGATION = 0.6;
// Revive vitals after a down.
const REVIVE_HP_FRACTION = 0.5;
const REVIVE_STAMINA_FRACTION = 0.5;
// Fraction of a boss's mana reward stored in its Soul Cache when downed.
const SOUL_CACHE_FRACTION = 0.4;
// Regen sips per chip tick so attrition fights aren't unrecoverable.
const STAMINA_REGEN_PER_TICK = 3;

// --- Helpers. -------------------------------------------------------------

function rankOf(state: GameState): Rank {
	return state.player.rank;
}

// Deterministic per-hex roll, stable across ticks for the same hex + bucket.
function hexRoll(hex: string, bucket: number): number {
	return mulberry32(hashStringToInt(`${hex}:${bucket}`))();
}

function makeBoss(
	hex: string,
	rank: Rank,
	theme: GameState["gates"][string]["theme"],
	lat: number,
	lng: number,
	fromDungeonBreak: boolean,
	seedTag: string
): FieldBoss {
	const totalPhases = BOSS_PHASES[rank];
	const maxHp = BOSS_BASE_HP[rank];
	const id = `boss:${hex}:${seedTag}`;
	return {
		id,
		hex,
		name: BOSS_NAME_BY_THEME[theme],
		rank,
		theme,
		hp: maxHp,
		maxHp,
		phase: 1,
		totalPhases,
		status: "roaming",
		lat,
		lng,
		fromDungeonBreak,
	};
}

// Selects the stalest unanchored gate as the rupture candidate, if any.
function pickRuptureGate(state: GameState): GameState["gates"][string] | null {
	let best: GameState["gates"][string] | null = null;
	let bestScore = -1;
	for (const gate of Object.values(state.gates)) {
		if (gate.anchored) {
			continue;
		}
		// Deterministic staleness score so the same gate is consistently chosen.
		const score = hashStringToInt(gate.hex) % 1000;
		if (score > bestScore) {
			best = gate;
			bestScore = score;
		}
	}
	return best;
}

function damageReduction(player: Player): number {
	const raw = player.stats.vit * VIT_MITIGATION_PER_POINT;
	return Math.min(MAX_MITIGATION, raw);
}

// Applies incoming damage to player vitals, draining stamina then HP.
function chipPlayer(
	player: Player,
	rawDamage: number,
	mitigationMultiplier: number
): Player {
	const reduced =
		rawDamage * (1 - damageReduction(player)) * mitigationMultiplier;
	const dmg = Math.max(ZERO, Math.round(reduced));
	const nextHp = Math.max(HP_FLOOR, player.hp - dmg);
	const stamina = Math.min(
		player.maxStamina,
		player.stamina + STAMINA_REGEN_PER_TICK
	);
	return { ...player, hp: nextHp, stamina };
}

// Advances boss HP/phase after a hit. Phase pips track which slice is active.
function applyHitToBoss(boss: FieldBoss, damage: number): FieldBoss {
	const nextHp = Math.max(
		HP_FLOOR,
		boss.hp - Math.max(ZERO, Math.round(damage))
	);
	const sliceSize = boss.maxHp / boss.totalPhases;
	const phasesCleared = boss.totalPhases - Math.ceil(nextHp / sliceSize);
	const phase = Math.min(boss.totalPhases, Math.max(1, phasesCleared + 1));
	return {
		...boss,
		hp: nextHp,
		phase,
		status: nextHp <= HP_FLOOR ? "defeated" : "engaged",
	};
}

function soulCacheItem(boss: FieldBoss): InventoryItem {
	const reward = Math.round(BOSS_REWARD_MANA[boss.rank] * SOUL_CACHE_FRACTION);
	return {
		id: `soul_cache:${boss.id}`,
		name: `Soul Cache (${boss.name})`,
		kind: SOUL_CACHE_KIND,
		qty: reward,
		rarity: boss.rank,
	};
}

// Neutralizes/corrupts the break hex and its immediate ring on a down. Owned
// turf reverts to neutral and loses capture; the epicenter is marked corrupt.
function corruptBreakTurf(
	state: GameState,
	boss: FieldBoss
): GameState["deeds"] {
	if (!boss.fromDungeonBreak) {
		return state.deeds;
	}
	const ring = hexDisk(boss.hex, 1);
	const deeds = { ...state.deeds };
	for (const hex of ring) {
		const deed = deeds[hex];
		if (!deed || deed.owner !== "player") {
			continue;
		}
		const corrupted: Deed = {
			...deed,
			owner: "neutral",
			capturePct: ZERO,
			capturedAt: null,
		};
		deeds[hex] = corrupted;
	}
	return deeds;
}

// Revive at home/sanctum. Falls back to current position if no home is set.
function respawnPlayer(state: GameState): Player {
	const player = state.player;
	return {
		...player,
		hp: Math.max(1, Math.round(player.maxHp * REVIVE_HP_FRACTION)),
		stamina: Math.round(player.maxStamina * REVIVE_STAMINA_FRACTION),
	};
}

function respawnPosition(state: GameState): GameState["position"] {
	const target = state.homeHex ?? state.position.hex;
	const center = hexCenter(target);
	return { lat: center.lat, lng: center.lng, hex: target };
}

// --- Sub-handlers. --------------------------------------------------------

function handleDungeonBreak(state: GameState, now: number): GameState {
	if (state.activeBoss) {
		return state;
	}
	// Only rupture on a rupture-interval boundary so breaks are paced.
	const bucket = Math.floor(now / RUPTURE_INTERVAL_MS);
	const prevBucket = Math.floor(state.lastTick / RUPTURE_INTERVAL_MS);
	if (bucket === prevBucket) {
		return state;
	}
	const gate = pickRuptureGate(state);
	if (!gate) {
		return state;
	}
	// Coin-flip per boundary keyed on the bucket so it is deterministic but not
	// guaranteed every interval.
	if (hexRoll(gate.hex, bucket) < DODGE_MITIGATION) {
		return state;
	}
	const boss = makeBoss(
		gate.hex,
		gate.rank,
		gate.theme,
		gate.lat,
		gate.lng,
		true,
		String(bucket)
	);
	return { ...state, activeBoss: boss };
}

function handleBossChip(state: GameState, now: number): GameState {
	const boss = state.activeBoss;
	if (!boss || boss.status === "defeated") {
		return state;
	}
	if (boss.status !== "engaged") {
		return state;
	}
	const bucket = Math.floor(now / BOSS_CHIP_INTERVAL_MS);
	const prevBucket = Math.floor(state.lastTick / BOSS_CHIP_INTERVAL_MS);
	if (bucket === prevBucket) {
		return state;
	}
	const chippedPlayer = chipPlayer(state.player, BOSS_HIT_DAMAGE[boss.rank], 1);
	if (chippedPlayer.hp > HP_FLOOR) {
		return { ...state, player: chippedPlayer };
	}
	return downPlayer({ ...state, player: chippedPlayer });
}

// Player HP hit zero: drop Soul Cache, corrupt break turf, respawn home.
function downPlayer(state: GameState): GameState {
	const boss = state.activeBoss;
	if (!boss) {
		return state;
	}
	const cache = soulCacheItem(boss);
	const deeds = corruptBreakTurf(state, boss);
	return {
		...state,
		activeBoss: null,
		player: respawnPlayer(state),
		position: respawnPosition(state),
		deeds,
		inventory: {
			...state.inventory,
			items: { ...state.inventory.items, [cache.id]: cache },
		},
	};
}

function handleSpawn(state: GameState, hex: string): GameState {
	if (state.activeBoss) {
		return state;
	}
	const gate = state.gates[hex];
	const rank: Rank = gate?.rank ?? rankOf(state);
	const theme = gate?.theme ?? "abyss";
	const center = hexCenter(hex);
	const lat = gate?.lat ?? center.lat;
	const lng = gate?.lng ?? center.lng;
	const boss = makeBoss(hex, rank, theme, lat, lng, Boolean(gate), "manual");
	return { ...state, activeBoss: boss };
}

function spendAndHit(
	state: GameState,
	damage: number,
	mana: number,
	stamina: number
): GameState {
	const boss = state.activeBoss;
	if (!boss || boss.status === "defeated") {
		return state;
	}
	if (state.player.combatMana < mana || state.player.stamina < stamina) {
		return state;
	}
	const player: Player = {
		...state.player,
		combatMana: state.player.combatMana - mana,
		stamina: state.player.stamina - stamina,
	};
	const hitBoss = applyHitToBoss({ ...boss, status: "engaged" }, damage);
	const next: GameState = { ...state, player, activeBoss: hitBoss };
	if (hitBoss.hp <= HP_FLOOR) {
		return defeatBoss(next);
	}
	return next;
}

function handleDodge(state: GameState): GameState {
	const boss = state.activeBoss;
	if (!boss) {
		return state;
	}
	if (state.player.stamina < DODGE_STAMINA_COST) {
		return state;
	}
	// Dodge pre-mitigates one chip's worth of damage immediately and engages.
	const player = chipPlayer(
		{ ...state.player, stamina: state.player.stamina - DODGE_STAMINA_COST },
		BOSS_HIT_DAMAGE[boss.rank],
		DODGE_MITIGATION
	);
	const engaged: FieldBoss = { ...boss, status: "engaged" };
	if (player.hp <= HP_FLOOR) {
		return downPlayer({ ...state, player, activeBoss: engaged });
	}
	return { ...state, player, activeBoss: engaged };
}

// Boss defeated: grant rewards, clear it, leave a note for the shadow system.
function defeatBoss(state: GameState): GameState {
	const boss = state.activeBoss;
	if (!boss) {
		return state;
	}
	const player: Player = {
		...state.player,
		xp: state.player.xp + BOSS_REWARD_XP[boss.rank],
	};
	return {
		...state,
		activeBoss: null,
		player,
		resources: {
			...state.resources,
			mana: state.resources.mana + BOSS_REWARD_MANA[boss.rank],
		},
	};
}

function handleReclaim(state: GameState, id: string): GameState {
	const item = state.inventory.items[id];
	if (!item || item.kind !== SOUL_CACHE_KIND) {
		return state;
	}
	const items = { ...state.inventory.items };
	delete items[id];
	return {
		...state,
		inventory: { ...state.inventory, items },
		resources: { ...state.resources, mana: state.resources.mana + item.qty },
	};
}

// --- Reducer. -------------------------------------------------------------

export const fieldBossReducer: SystemReducer = (state, event) => {
	if (!isFieldBossEvent(event)) {
		return state;
	}

	switch (event.type) {
		case "TICK":
		case "BOSS_TICK": {
			const now = event.now;
			const broken = handleDungeonBreak(state, now);
			return handleBossChip(broken, now);
		}
		case "BOSS_SPAWN":
			return handleSpawn(state, event.hex);
		case "BOSS_ATTACK": {
			const skill = BOSS_SKILLS[0];
			if (!skill) {
				return state;
			}
			return spendAndHit(
				state,
				skill.damage,
				skill.manaCost,
				skill.staminaCost
			);
		}
		case "BOSS_SKILL": {
			const skill = BOSS_SKILLS[event.slot];
			if (!skill) {
				return state;
			}
			return spendAndHit(
				state,
				skill.damage,
				skill.manaCost,
				skill.staminaCost
			);
		}
		case "BOSS_DODGE":
			return handleDodge(state);
		case "BOSS_MOVE":
			// On-map chase: update the boss's live position/hex from the render
			// loop. Does not change combat status.
			return state.activeBoss
				? {
						...state,
						activeBoss: {
							...state.activeBoss,
							lat: event.lat,
							lng: event.lng,
							hex: event.hex,
						},
					}
				: state;
		case "BOSS_ENGAGE":
			// Proximity engage: the boss caught up to the player on the map.
			return state.activeBoss && state.activeBoss.status !== "defeated"
				? { ...state, activeBoss: { ...state.activeBoss, status: "engaged" } }
				: state;
		case "BOSS_FLEE":
			// Disengage: boss resumes roaming, player keeps current vitals.
			return state.activeBoss
				? { ...state, activeBoss: { ...state.activeBoss, status: "roaming" } }
				: state;
		case "BOSS_DEFEAT":
			return defeatBoss(state);
		case "SOUL_CACHE_RECLAIM":
			return handleReclaim(state, event.id);
		default:
			return state;
	}
};

// Re-exported so the panel can identify Soul Cache items without a string dup.
export const SOUL_CACHE_ITEM_KIND = SOUL_CACHE_KIND;
