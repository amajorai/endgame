import { RANKS } from "@/game/constants";
import { mulberry32, seededFromHex } from "@/game/lib/rng";
import type {
	GameEvent,
	GameState,
	Rank,
	Shadow,
	SystemReducer,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Shadows system. Defeated bosses can be extracted into shadow soldiers. Each
// shadow may be deployed to an owned hex to defend it (slowing rival
// neutralization) or to work a farm plot (boosting crop growth). The roster of
// deployable slots scales with player level and shadow-themed skills.
// ---------------------------------------------------------------------------

// Local discriminated union of the events THIS system owns. The global
// GameEvent union is open, so "event.type === 'X'" does not narrow payload
// fields. We guard on a Set of our own types, then switch.
type ShadowEvent =
	| {
			type: "SHADOW_EXTRACT";
			name?: string;
			sourceMonster?: string;
			rank?: Rank;
	  }
	| { type: "SHADOW_ASSIGN"; id: string; hex: string }
	| { type: "SHADOW_RECALL"; id: string }
	| { type: "SHADOW_RENAME"; id: string; name: string };

const SHADOW_EVENT_TYPES: Set<string> = new Set([
	"SHADOW_EXTRACT",
	"SHADOW_ASSIGN",
	"SHADOW_RECALL",
	"SHADOW_RENAME",
]);

const isShadowEvent = (event: GameEvent): event is ShadowEvent =>
	SHADOW_EVENT_TYPES.has(event.type);

// --- Slot math -------------------------------------------------------------

const BASE_SLOTS = 2;
const LEVELS_PER_SLOT = 5;
const MAX_SLOTS = 12;

// Skills that grant an extra deployable shadow slot when unlocked.
const SHADOW_SLOT_SKILLS: Set<string> = new Set([
	"shadow_command",
	"shadow_army",
	"monarch_authority",
]);

// How many shadows the player can have deployed at once. Scales with level and
// any unlocked shadow-command skills. Pure selector other systems may read.
export const shadowSlots = (state: GameState): number => {
	const fromLevel = Math.floor(state.player.level / LEVELS_PER_SLOT);
	let fromSkills = 0;
	for (const skill of state.player.unlockedSkills) {
		if (SHADOW_SLOT_SKILLS.has(skill)) {
			fromSkills += 1;
		}
	}
	return Math.min(MAX_SLOTS, BASE_SLOTS + fromLevel + fromSkills);
};

// Count of shadows currently deployed to a hex.
export const deployedShadowCount = (state: GameState): number => {
	let count = 0;
	for (const shadow of state.shadows) {
		if (shadow.assignedHex) {
			count += 1;
		}
	}
	return count;
};

// Remaining free deployment slots (never negative).
export const availableShadowSlots = (state: GameState): number =>
	Math.max(0, shadowSlots(state) - deployedShadowCount(state));

// --- Defense / growth selectors --------------------------------------------

const RANK_POWER: Record<Rank, number> = {
	E: 1,
	D: 2,
	C: 3,
	B: 4,
	A: 5,
	S: 6,
};

// Total rank-weighted power of all shadows garrisoned on a hex.
const garrisonPower = (state: GameState, hex: string): number => {
	let power = 0;
	for (const shadow of state.shadows) {
		if (shadow.assignedHex === hex) {
			power += RANK_POWER[shadow.rank];
		}
	}
	return power;
};

const MIN_DEFENSE_MULTIPLIER = 0.25;
const DEFENSE_PER_POWER = 0.12;

// Multiplier (<=1) applied to rival neutralization speed on a defended hex.
// Lower means the rival drains the player's capture more slowly. 1 means no
// shadows present. Other systems (rival/capture decay) may read this.
export const shadowDefenseMultiplier = (
	state: GameState,
	hex: string
): number => {
	const power = garrisonPower(state, hex);
	if (power <= 0) {
		return 1;
	}
	return Math.max(MIN_DEFENSE_MULTIPLIER, 1 - power * DEFENSE_PER_POWER);
};

const GROWTH_PER_POWER = 0.15;
const MAX_GROWTH_MULTIPLIER = 2.5;

// Multiplier (>=1) applied to plot growth speed on a hex worked by shadows.
// 1 means no shadows present. Farm system may read this.
export const shadowGrowthMultiplier = (
	state: GameState,
	hex: string
): number => {
	const power = garrisonPower(state, hex);
	if (power <= 0) {
		return 1;
	}
	return Math.min(MAX_GROWTH_MULTIPLIER, 1 + power * GROWTH_PER_POWER);
};

// --- Extraction helpers ----------------------------------------------------

// Pool of evocative default shadow names, picked deterministically.
const SHADOW_NAMES = [
	"Igris",
	"Tank",
	"Iron",
	"Beru",
	"Tusk",
	"Kaisel",
	"Greed",
	"Bellion",
	"Fang",
	"Cerberus",
	"Vesper",
	"Onyx",
] as const;

const DEFAULT_SOURCE = "Unknown Monster";
const DEFAULT_RANK: Rank = "E";

const isRank = (value: unknown): value is Rank =>
	typeof value === "string" && (RANKS as readonly string[]).includes(value);

// Deterministic id + fallback name for a freshly extracted shadow. Seeds off
// the existing roster size and source so repeated extractions stay stable.
const makeShadow = (
	state: GameState,
	event: Extract<ShadowEvent, { type: "SHADOW_EXTRACT" }>
): Shadow => {
	const source = event.sourceMonster ?? DEFAULT_SOURCE;
	const seedBase = seededFromHex(`${source}:${state.shadows.length}`)();
	const rng = mulberry32(
		Math.floor(seedBase * 1_000_000) + state.shadows.length
	);
	const nameIndex = Math.floor(rng() * SHADOW_NAMES.length);
	const fallbackName = `${SHADOW_NAMES[nameIndex]}-${state.shadows.length + 1}`;
	const rank = isRank(event.rank) ? event.rank : DEFAULT_RANK;
	return {
		id: `shadow:${state.lastTick}:${state.shadows.length}`,
		name: event.name ?? fallbackName,
		sourceMonster: source,
		rank,
	};
};

// --- Reducer ---------------------------------------------------------------

export const shadowsReducer: SystemReducer = (state, event) => {
	if (!isShadowEvent(event)) {
		return state;
	}

	switch (event.type) {
		case "SHADOW_EXTRACT": {
			const shadow = makeShadow(state, event);
			return { ...state, shadows: [...state.shadows, shadow] };
		}

		case "SHADOW_ASSIGN": {
			const target = state.shadows.find((s) => s.id === event.id);
			if (!target) {
				return state;
			}
			// Reassigning an already-deployed shadow does not consume a new slot.
			const isRedeploy = Boolean(target.assignedHex);
			if (!isRedeploy && availableShadowSlots(state) <= 0) {
				return state;
			}
			return {
				...state,
				shadows: state.shadows.map((s) =>
					s.id === event.id ? { ...s, assignedHex: event.hex } : s
				),
			};
		}

		case "SHADOW_RECALL": {
			const target = state.shadows.find((s) => s.id === event.id);
			if (!target?.assignedHex) {
				return state;
			}
			return {
				...state,
				shadows: state.shadows.map((s) =>
					s.id === event.id ? { ...s, assignedHex: undefined } : s
				),
			};
		}

		case "SHADOW_RENAME": {
			const trimmed = event.name.trim();
			if (trimmed.length === 0) {
				return state;
			}
			const target = state.shadows.find((s) => s.id === event.id);
			if (!target || target.name === trimmed) {
				return state;
			}
			return {
				...state,
				shadows: state.shadows.map((s) =>
					s.id === event.id ? { ...s, name: trimmed } : s
				),
			};
		}

		default:
			return state;
	}
};
