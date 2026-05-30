import { VEHICLE_SPECS } from "@/game/data/vehicles";
import { hexClassFor, posToHex } from "@/game/lib/hex";
import type {
	GameEvent,
	GameState,
	GhostMode,
	SystemReducer,
	VehicleKind,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Ghost mode: an out-of-body projection the player can pilot away from their
// real GPS position to scout, with a strict daily time budget. v1 physics are
// intentionally simple: NO OpenStreetMap polygon blocking yet (stubbed below),
// just three hard rules enforced here:
//   1. Ghosts CANNOT capture wildland hexes (no land grab while projecting).
//   2. Movement and vehicles drain a finite, daily-refreshing time budget.
//   3. Vehicles set a speed multiplier and cost budget to engage.
// ---------------------------------------------------------------------------

// Daily free ghost allowance: 1 hour.
const DAILY_BUDGET_SECONDS = 60 * 60;
// Hard ceiling on banked ghost time: 8 hours.
const MAX_BUDGET_SECONDS = 8 * 60 * 60;
// Banked-step refill: +5 minutes per 1000 banked steps.
const REFILL_STEPS_PER_BLOCK = 1000;
const REFILL_SECONDS_PER_BLOCK = 5 * 60;

const MS_PER_SECOND = 1000;

// Local discriminated union of THIS system's events plus the spine TICK it
// piggybacks on. The open GameEvent union does not narrow payloads by type, so
// we carry our own guard.
type GhostEvent =
	| { type: "GHOST_TOGGLE" }
	| { type: "GHOST_MOVE"; lat: number; lng: number }
	| { type: "VEHICLE_USE"; kind: VehicleKind }
	| { type: "VEHICLE_ACQUIRE"; kind: VehicleKind }
	| { type: "TICK"; now: number };

const GHOST_EVENT_TYPES: Set<string> = new Set([
	"GHOST_TOGGLE",
	"GHOST_MOVE",
	"VEHICLE_USE",
	"VEHICLE_ACQUIRE",
	"TICK",
]);

const isGhostEvent = (event: GameEvent): event is GhostEvent =>
	GHOST_EVENT_TYPES.has(event.type);

// Local-midnight epoch for the day containing `now`.
function startOfLocalDay(now: number): number {
	const date = new Date(now);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

// Convert banked steps into refillable ghost seconds.
function refillFromSteps(bankedSteps: number): number {
	const blocks = Math.floor(bankedSteps / REFILL_STEPS_PER_BLOCK);
	return blocks * REFILL_SECONDS_PER_BLOCK;
}

// Reset the daily budget if we have crossed local midnight since lastReset.
// Returns the (possibly) refreshed ghost block and the new daily-used counter.
function applyDailyReset(
	ghost: GhostMode,
	dailyUsedToday: number,
	bankedSteps: number,
	now: number
): { ghost: GhostMode; ghostSecondsUsedToday: number; didReset: boolean } {
	const todayStart = startOfLocalDay(now);
	const lastResetStart = startOfLocalDay(ghost.lastReset);
	if (todayStart <= lastResetStart && ghost.lastReset !== 0) {
		return {
			ghost,
			ghostSecondsUsedToday: dailyUsedToday,
			didReset: false,
		};
	}
	const refill = refillFromSteps(bankedSteps);
	const replenished = Math.min(
		MAX_BUDGET_SECONDS,
		DAILY_BUDGET_SECONDS + refill
	);
	return {
		ghost: {
			...ghost,
			secondsRemaining: replenished,
			lastReset: now,
		},
		ghostSecondsUsedToday: 0,
		didReset: true,
	};
}

// Drain elapsed seconds from the ghost budget while active; auto-exit at zero.
function drainBudget(
	ghost: GhostMode,
	dailyUsedToday: number,
	elapsedSeconds: number
): { ghost: GhostMode; ghostSecondsUsedToday: number } {
	if (!ghost.active || elapsedSeconds <= 0) {
		return { ghost, ghostSecondsUsedToday: dailyUsedToday };
	}
	const spent = Math.min(ghost.secondsRemaining, elapsedSeconds);
	const remaining = Math.max(0, ghost.secondsRemaining - elapsedSeconds);
	return {
		ghost: {
			...ghost,
			secondsRemaining: remaining,
			// Drop out of ghost mode the moment the budget hits zero.
			active: remaining > 0,
		},
		ghostSecondsUsedToday: dailyUsedToday + spent,
	};
}

function tickGhost(state: GameState, now: number): GameState {
	const elapsedSeconds = Math.max(0, now - state.lastTick) / MS_PER_SECOND;

	const reset = applyDailyReset(
		state.world.ghost,
		state.meta.daily.ghostSecondsUsedToday,
		state.player.bankedSteps,
		now
	);
	const drained = drainBudget(
		reset.ghost,
		reset.ghostSecondsUsedToday,
		elapsedSeconds
	);

	if (
		!reset.didReset &&
		drained.ghost === state.world.ghost &&
		drained.ghostSecondsUsedToday === state.meta.daily.ghostSecondsUsedToday
	) {
		return state;
	}

	return {
		...state,
		world: { ...state.world, ghost: drained.ghost },
		meta: {
			...state.meta,
			daily: {
				...state.meta.daily,
				ghostSecondsUsedToday: drained.ghostSecondsUsedToday,
			},
		},
	};
}

// Spend the budget cost of engaging a vehicle, if the player owns it and can
// afford it. Walking is always free and always available.
function engageVehicle(state: GameState, kind: VehicleKind): GameState {
	const spec = VEHICLE_SPECS[kind];
	const owns =
		kind === "walk" ||
		state.meta.vehicles.some((vehicle) => vehicle.kind === kind);
	if (!(owns && state.world.ghost.active)) {
		return state;
	}
	if (state.world.ghost.secondsRemaining < spec.budgetCostSeconds) {
		return state;
	}
	const remaining = state.world.ghost.secondsRemaining - spec.budgetCostSeconds;
	return {
		...state,
		world: {
			...state.world,
			ghost: {
				...state.world.ghost,
				secondsRemaining: remaining,
				active: remaining > 0,
			},
		},
		meta: {
			...state.meta,
			daily: {
				...state.meta.daily,
				ghostSecondsUsedToday:
					state.meta.daily.ghostSecondsUsedToday + spec.budgetCostSeconds,
			},
		},
	};
}

// Grant the player a vehicle kind. Idempotent: re-acquiring is a no-op.
function acquireVehicle(state: GameState, kind: VehicleKind): GameState {
	if (state.meta.vehicles.some((vehicle) => vehicle.kind === kind)) {
		return state;
	}
	return {
		...state,
		meta: {
			...state.meta,
			vehicles: [...state.meta.vehicles, { id: kind, kind }],
		},
	};
}

// Toggle ghost mode. Entering is only allowed from the real GPS position and
// only when there is budget to spend; it stamps lastReset so a same-day re-entry
// keeps the running budget. Exiting snaps the projection back implicitly (the
// integration restores the real position).
function toggleGhost(state: GameState): GameState {
	const ghost = state.world.ghost;
	if (ghost.active) {
		return {
			...state,
			world: { ...state.world, ghost: { ...ghost, active: false } },
		};
	}
	if (ghost.secondsRemaining <= 0) {
		// No budget: cannot enter ghost mode.
		return state;
	}
	return {
		...state,
		world: { ...state.world, ghost: { ...ghost, active: true } },
	};
}

// Move the ghost projection. Updates position, but ENFORCES that ghosts cannot
// capture wildland hexes: any in-progress capture meter on the destination wild
// hex that the player does not already own is wiped so the spine tick cannot
// advance a land grab while projecting.
//
// STUB: real OSM polygon collision (water/buildings blocking the ghost) is not
// implemented in v1. Only the no-wild-capture, budget, and vehicle rules are
// enforced. A later pass can reject GHOST_MOVE targets that fall inside blocked
// geometry.
function moveGhost(state: GameState, lat: number, lng: number): GameState {
	if (!state.world.ghost.active) {
		return state;
	}
	const hex = posToHex(lat, lng);
	const hexClass = hexClassFor(hex);
	const existingDeed = state.deeds[hex];
	const ownedByPlayer = existingDeed?.owner === "player";

	let deeds = state.deeds;
	let captureMeters = state.captureMeters;

	// Block any wildland land grab: strip a non-owned wild deed's progress and
	// clear its meter so the spine's TICK capture cannot complete here.
	if (hexClass === "wildland" && !ownedByPlayer && existingDeed) {
		deeds = {
			...state.deeds,
			[hex]: {
				...existingDeed,
				owner: existingDeed.owner === "rival" ? "rival" : "neutral",
				capturePct:
					existingDeed.owner === "rival" ? existingDeed.capturePct : 0,
			},
		};
		if (state.captureMeters[hex]) {
			const next = { ...state.captureMeters };
			delete next[hex];
			captureMeters = next;
		}
	}

	return {
		...state,
		position: { lat, lng, hex },
		deeds,
		captureMeters,
	};
}

export const ghostReducer: SystemReducer = (state, event) => {
	if (!isGhostEvent(event)) {
		return state;
	}

	switch (event.type) {
		case "GHOST_TOGGLE":
			return toggleGhost(state);
		case "GHOST_MOVE":
			return moveGhost(state, event.lat, event.lng);
		case "VEHICLE_USE":
			return engageVehicle(state, event.kind);
		case "VEHICLE_ACQUIRE":
			return acquireVehicle(state, event.kind);
		case "TICK":
			return tickGhost(state, event.now);
		default:
			return state;
	}
};

// Exposed constants so the panel and integration share the same budget math.
export const GHOST_BUDGET = {
	dailySeconds: DAILY_BUDGET_SECONDS,
	maxSeconds: MAX_BUDGET_SECONDS,
	refillStepsPerBlock: REFILL_STEPS_PER_BLOCK,
	refillSecondsPerBlock: REFILL_SECONDS_PER_BLOCK,
} as const;

// While projecting, damage dealt and loot earned are halved. There is no
// contract field to persist a per-action flag, so combat/loot systems read the
// live ghost flag and scale through this helper. Pure and side-effect free.
export const GHOST_PENALTY_MULTIPLIER = 0.5;

export function ghostPenalty(state: GameState, base: number): number {
	return state.world.ghost.active ? base * GHOST_PENALTY_MULTIPLIER : base;
}

export function isGhostActive(state: GameState): boolean {
	return state.world.ghost.active;
}
