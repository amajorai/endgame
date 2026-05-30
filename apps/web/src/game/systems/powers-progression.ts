// Powers & progression system. Owns leveling, stat allocation, skill-tree
// unlocks, power equip/unlock, rank promotion, and respec. Pure and immutable;
// early-returns unchanged state for events it does not handle.
//
// Determinism: progression is fully deterministic, no RNG. Timestamps use the
// epoch clock via Date.now(), which is the sanctioned clock for app code.

import { RANKS } from "@/game/constants";
import {
	ALL_SKILL_IDS,
	POWER_BY_ID,
	SKILL_COST_BY_ID,
} from "@/game/data/powers";
import type {
	GameEvent,
	GameState,
	PlayerStats,
	PowerId,
	Rank,
	SystemReducer,
} from "@/game/types";

// --- Tunables -------------------------------------------------------------

const SKILL_POINTS_PER_LEVEL = 1;
const STAT_POINTS_PER_LEVEL = 3;
const POWER_UNLOCK_SKILL_COST = 3;

// Weekly-free respec; afterwards mana cost. Persisted timestamp lives in
// meta.contentCacheMeta under a reserved non-hex key (spine writes hex keys
// only, so this never collides).
const RESPEC_LAST_FREE_KEY = "respec:lastFree";
const RESPEC_FREE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RESPEC_MANA_COST = 250;

// Derived stat scaling. Base pools plus per-point contribution from stats.
const BASE_HP = 50;
const HP_PER_VIT = 10;
const BASE_STAMINA = 50;
const STAMINA_PER_AGI = 10;
const BASE_COMBAT_MANA = 20;
const COMBAT_MANA_PER_INT = 6;

// Universal skill bonuses that scale derived pools (matches data descriptions).
const VIGOR_HP_MULT = 1.1;
const ENDURANCE_STAMINA_MULT = 1.1;
const FOCUS_MANA_MULT = 1.1;

// XP curve. Threshold to go from level L to L+1. Quadratic-ish ramp.
const XP_BASE = 100;
const XP_GROWTH = 50;

// Rank ladder unlocked by level milestones. Index aligns with RANKS.
const RANK_LEVEL_REQUIREMENT: Record<Rank, number> = {
	E: 1,
	D: 5,
	C: 10,
	B: 18,
	A: 28,
	S: 40,
};

// --- Pure helpers ---------------------------------------------------------

// XP required to advance FROM the given level to the next.
export function xpForNextLevel(level: number): number {
	return XP_BASE + XP_GROWTH * (level - 1);
}

// Highest rank the player qualifies for at a given level.
export function eligibleRank(level: number): Rank {
	let best: Rank = "E";
	for (const rank of RANKS) {
		if (level >= RANK_LEVEL_REQUIREMENT[rank]) {
			best = rank;
		}
	}
	return best;
}

// True when the player can promote above their current rank.
export function canPromote(level: number, currentRank: Rank): boolean {
	const target = eligibleRank(level);
	return RANKS.indexOf(target) > RANKS.indexOf(currentRank);
}

interface DerivedPools {
	maxCombatMana: number;
	maxHp: number;
	maxStamina: number;
}

// Compute derived max pools from stats and unlocked universal skills.
export function deriveMaxPools(
	stats: PlayerStats,
	unlockedSkills: string[]
): DerivedPools {
	const skills = new Set(unlockedSkills);
	let maxHp = BASE_HP + stats.vit * HP_PER_VIT;
	let maxStamina = BASE_STAMINA + stats.agi * STAMINA_PER_AGI;
	let maxCombatMana = BASE_COMBAT_MANA + stats.int * COMBAT_MANA_PER_INT;
	if (skills.has("u:vigor")) {
		maxHp *= VIGOR_HP_MULT;
	}
	if (skills.has("u:endurance")) {
		maxStamina *= ENDURANCE_STAMINA_MULT;
	}
	if (skills.has("u:focus")) {
		maxCombatMana *= FOCUS_MANA_MULT;
	}
	return {
		maxHp: Math.round(maxHp),
		maxStamina: Math.round(maxStamina),
		maxCombatMana: Math.round(maxCombatMana),
	};
}

// Re-derive max pools and clamp current values so they never exceed the new max.
function applyDerivedStats(player: GameState["player"]): GameState["player"] {
	const pools = deriveMaxPools(player.stats, player.unlockedSkills);
	return {
		...player,
		maxHp: pools.maxHp,
		maxStamina: pools.maxStamina,
		maxCombatMana: pools.maxCombatMana,
		hp: Math.min(player.hp, pools.maxHp),
		stamina: Math.min(player.stamina, pools.maxStamina),
		combatMana: Math.min(player.combatMana, pools.maxCombatMana),
	};
}

// Apply an XP gain, looping through every level threshold crossed.
function applyXpGain(
	player: GameState["player"],
	amount: number
): GameState["player"] {
	if (amount <= 0) {
		return player;
	}
	let { level, xp, skillPoints, statPoints } = player;
	xp += amount;
	let threshold = xpForNextLevel(level);
	while (xp >= threshold) {
		xp -= threshold;
		level += 1;
		skillPoints += SKILL_POINTS_PER_LEVEL;
		statPoints += STAT_POINTS_PER_LEVEL;
		threshold = xpForNextLevel(level);
	}
	const leveled = level > player.level;
	const next = { ...player, level, xp, skillPoints, statPoints };
	const derived = applyDerivedStats(next);
	// A level-up is a moment of renewal: refill to the new max pools.
	if (leveled) {
		return {
			...derived,
			hp: derived.maxHp,
			stamina: derived.maxStamina,
			combatMana: derived.maxCombatMana,
		};
	}
	return derived;
}

// True if a skill id belongs to the universal tree or the player's equipped
// power tree (the only trees they may currently spend into).
function isSkillAvailable(skillId: string, equippedPower: PowerId): boolean {
	if (!ALL_SKILL_IDS.has(skillId)) {
		return false;
	}
	if (skillId.startsWith("u:")) {
		return true;
	}
	const def = POWER_BY_ID[equippedPower];
	return def.skills.some((node) => node.id === skillId);
}

const STAT_KEYS: Set<string> = new Set(["str", "agi", "vit", "int", "per"]);

function isStatKey(value: string): value is keyof PlayerStats {
	return STAT_KEYS.has(value);
}

// --- Local event union + guard --------------------------------------------

type ProgressionEvent =
	| { type: "GAIN_XP"; amount: number }
	| { type: "POWER_EQUIP"; power: PowerId }
	| { type: "POWER_UNLOCK"; power: PowerId }
	| { type: "SKILL_UNLOCK"; skillId: string }
	| { type: "STAT_ALLOCATE"; stat: keyof PlayerStats }
	| { type: "RANK_TEST" }
	| { type: "RESPEC" };

const PROGRESSION_TYPES: Set<string> = new Set([
	"GAIN_XP",
	"POWER_EQUIP",
	"POWER_UNLOCK",
	"SKILL_UNLOCK",
	"STAT_ALLOCATE",
	"RANK_TEST",
	"RESPEC",
]);

function isProgressionEvent(event: GameEvent): event is ProgressionEvent {
	return PROGRESSION_TYPES.has(event.type);
}

// --- Per-event handlers ---------------------------------------------------

function handleGainXp(state: GameState, amount: number): GameState {
	if (typeof amount !== "number" || amount <= 0) {
		return state;
	}
	const player = applyXpGain(state.player, amount);
	if (player === state.player) {
		return state;
	}
	return { ...state, player };
}

function handlePowerEquip(state: GameState, power: PowerId): GameState {
	if (
		!state.player.unlockedPowers.includes(power) ||
		state.player.equippedPower === power
	) {
		return state;
	}
	return { ...state, player: { ...state.player, equippedPower: power } };
}

function handlePowerUnlock(state: GameState, power: PowerId): GameState {
	if (!POWER_BY_ID[power]) {
		return state;
	}
	if (state.player.unlockedPowers.includes(power)) {
		return state;
	}
	if (state.player.skillPoints < POWER_UNLOCK_SKILL_COST) {
		return state;
	}
	return {
		...state,
		player: {
			...state.player,
			skillPoints: state.player.skillPoints - POWER_UNLOCK_SKILL_COST,
			unlockedPowers: [...state.player.unlockedPowers, power],
		},
	};
}

function handleSkillUnlock(state: GameState, skillId: string): GameState {
	if (state.player.unlockedSkills.includes(skillId)) {
		return state;
	}
	if (!isSkillAvailable(skillId, state.player.equippedPower)) {
		return state;
	}
	const cost = SKILL_COST_BY_ID[skillId] ?? 0;
	if (state.player.skillPoints < cost) {
		return state;
	}
	const player = {
		...state.player,
		skillPoints: state.player.skillPoints - cost,
		unlockedSkills: [...state.player.unlockedSkills, skillId],
	};
	// Some universal skills change derived pools; re-derive.
	return { ...state, player: applyDerivedStats(player) };
}

function handleStatAllocate(
	state: GameState,
	stat: keyof PlayerStats
): GameState {
	if (state.player.statPoints <= 0) {
		return state;
	}
	const player = {
		...state.player,
		statPoints: state.player.statPoints - 1,
		stats: { ...state.player.stats, [stat]: state.player.stats[stat] + 1 },
	};
	return { ...state, player: applyDerivedStats(player) };
}

function handleRankTest(state: GameState): GameState {
	if (!canPromote(state.player.level, state.player.rank)) {
		return state;
	}
	const promoted = eligibleRank(state.player.level);
	return { ...state, player: { ...state.player, rank: promoted } };
}

function handleRespec(state: GameState): GameState {
	const now = Date.now();
	const lastFree = state.meta.contentCacheMeta[RESPEC_LAST_FREE_KEY] ?? 0;
	const isFree = now - lastFree >= RESPEC_FREE_WINDOW_MS;

	if (!isFree && state.resources.mana < RESPEC_MANA_COST) {
		return state;
	}

	// Refund every spent skill point. Each skill carries its own cost.
	let refunded = 0;
	for (const skillId of state.player.unlockedSkills) {
		refunded += SKILL_COST_BY_ID[skillId] ?? 0;
	}

	const player = applyDerivedStats({
		...state.player,
		skillPoints: state.player.skillPoints + refunded,
		unlockedSkills: [],
	});

	const contentCacheMeta = isFree
		? { ...state.meta.contentCacheMeta, [RESPEC_LAST_FREE_KEY]: now }
		: state.meta.contentCacheMeta;

	const mana = isFree
		? state.resources.mana
		: state.resources.mana - RESPEC_MANA_COST;

	return {
		...state,
		player,
		resources: { ...state.resources, mana },
		meta: { ...state.meta, contentCacheMeta },
	};
}

// --- Reducer --------------------------------------------------------------

export const progressionReducer: SystemReducer = (state, event) => {
	if (!isProgressionEvent(event)) {
		return state;
	}
	switch (event.type) {
		case "GAIN_XP":
			return handleGainXp(state, event.amount);
		case "POWER_EQUIP":
			return handlePowerEquip(state, event.power);
		case "POWER_UNLOCK":
			return handlePowerUnlock(state, event.power);
		case "SKILL_UNLOCK":
			return handleSkillUnlock(state, event.skillId);
		case "STAT_ALLOCATE":
			return isStatKey(event.stat)
				? handleStatAllocate(state, event.stat)
				: state;
		case "RANK_TEST":
			return handleRankTest(state);
		case "RESPEC":
			return handleRespec(state);
		default:
			return state;
	}
};
