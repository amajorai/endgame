import { posToHex } from "@/game/lib/hex";
import type {
	GameEvent,
	GameState,
	InventoryItem,
	Rank,
	SystemReducer,
	TimeOfDay,
	WeatherType,
} from "@/game/types";

// Local discriminated union of the events this system owns. The GameEvent union
// is OPEN, so a `type` check alone does NOT narrow payload fields; this guard
// gives the reducer typed access to each event's payload.
type DebugAdminEvent =
	| { type: "DEBUG_FORCE_WEATHER"; weather: WeatherType }
	| { type: "DEBUG_FORCE_TIME"; time: TimeOfDay }
	| { type: "DEBUG_GRANT_MANA"; amount: number }
	| { type: "DEBUG_GRANT_XP"; amount: number }
	| { type: "DEBUG_SET_RANK"; rank: Rank }
	| {
			type: "DEBUG_GRANT_ITEM";
			name: string;
			kind: string;
			rarity: string;
			qty: number;
	  }
	| { type: "DEBUG_FAST_FORWARD"; ms: number }
	| { type: "DEBUG_SPOOF_GPS"; lat: number; lng: number }
	| { type: "DEBUG_TRIGGER_SUPPLY" }
	| { type: "DEBUG_RESET" };

const DEBUG_ADMIN_TYPES: Set<string> = new Set([
	"DEBUG_FORCE_WEATHER",
	"DEBUG_FORCE_TIME",
	"DEBUG_GRANT_MANA",
	"DEBUG_GRANT_XP",
	"DEBUG_SET_RANK",
	"DEBUG_GRANT_ITEM",
	"DEBUG_FAST_FORWARD",
	"DEBUG_SPOOF_GPS",
	"DEBUG_TRIGGER_SUPPLY",
	"DEBUG_RESET",
]);

const isDebugAdminEvent = (event: GameEvent): event is DebugAdminEvent =>
	DEBUG_ADMIN_TYPES.has(event.type);

// XP required to clear a single level. Kept simple and deterministic so granting
// XP produces predictable level-ups in the dev panel.
const XP_PER_LEVEL = 100;

const SUPPLY_LIFETIME_MS = 5 * 60 * 1000;
const SUPPLY_DROP_TIER = "standard";

function applyLevelUps(
	level: number,
	xp: number
): { level: number; xp: number } {
	let nextLevel = level;
	let nextXp = xp;
	while (nextXp >= XP_PER_LEVEL) {
		nextXp -= XP_PER_LEVEL;
		nextLevel += 1;
	}
	return { level: nextLevel, xp: nextXp };
}

function slugify(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, "_");
}

function grantItem(
	state: GameState,
	event: Extract<DebugAdminEvent, { type: "DEBUG_GRANT_ITEM" }>
): GameState {
	const id = `item:${slugify(event.name)}:${event.rarity}`;
	const existing = state.inventory.items[id];
	const nextItem: InventoryItem = existing
		? { ...existing, qty: existing.qty + event.qty }
		: {
				id,
				name: event.name,
				kind: event.kind,
				rarity: event.rarity,
				qty: event.qty,
			};
	return {
		...state,
		inventory: {
			...state.inventory,
			items: { ...state.inventory.items, [id]: nextItem },
		},
	};
}

function triggerSupply(state: GameState): GameState {
	const now = state.lastTick;
	const { lat, lng, hex } = state.position;
	const id = `supply:${hex}:${now}`;
	return {
		...state,
		meta: {
			...state.meta,
			supplyDrops: [
				...state.meta.supplyDrops,
				{
					id,
					hex,
					lat,
					lng,
					tier: SUPPLY_DROP_TIER,
					landsAt: now + SUPPLY_LIFETIME_MS,
					claimed: false,
				},
			],
		},
	};
}

// Full client-side wipe lives in the panel (clearing localStorage + IndexedDB +
// reload). As a pure reducer this can only blank the in-memory derived state, so
// DEBUG_RESET here returns state unchanged and defers the destructive wipe to the
// panel. Listed in the guard for completeness/discoverability.
export const debugAdminReducer: SystemReducer = (state, event) => {
	if (!isDebugAdminEvent(event)) {
		return state;
	}

	switch (event.type) {
		case "DEBUG_FORCE_WEATHER":
			return {
				...state,
				debug: { ...state.debug, forcedWeather: event.weather },
				world: { ...state.world, weather: event.weather },
			};

		case "DEBUG_FORCE_TIME":
			return {
				...state,
				debug: { ...state.debug, forcedTime: event.time },
				world: { ...state.world, timeOfDay: event.time },
			};

		case "DEBUG_GRANT_MANA":
			return {
				...state,
				resources: {
					...state.resources,
					mana: state.resources.mana + event.amount,
				},
			};

		case "DEBUG_GRANT_XP": {
			const totalXp = state.player.xp + event.amount;
			const { level, xp } = applyLevelUps(state.player.level, totalXp);
			return { ...state, player: { ...state.player, level, xp } };
		}

		case "DEBUG_SET_RANK":
			return { ...state, player: { ...state.player, rank: event.rank } };

		case "DEBUG_GRANT_ITEM":
			return grantItem(state, event);

		case "DEBUG_FAST_FORWARD":
			// Move the clock backward so the next TICK sees a large elapsed delta and
			// credits the simulated offline interval (mana accrual, decay, growth).
			return { ...state, lastTick: state.lastTick - event.ms };

		case "DEBUG_SPOOF_GPS": {
			const hex = posToHex(event.lat, event.lng);
			return {
				...state,
				position: { lat: event.lat, lng: event.lng, hex },
			};
		}

		case "DEBUG_TRIGGER_SUPPLY":
			return triggerSupply(state);

		default:
			// DEBUG_RESET and any unmatched owned event: no pure in-memory change.
			return state;
	}
};
