import {
	CAPTURE_SECONDS,
	DECAY_RATE_PER_DAY,
	DECAY_WINDOW_MS,
	MANA_PER_SECOND,
	MS_PER_DAY,
	RANK_CAPTURE_SPEED,
	TICK_MS,
} from "@/game/constants";
import { hexClassFor, posToHex } from "@/game/lib/hex";
import type {
	CaptureMeter,
	Deed,
	GameState,
	HexClass,
	JournalEntry,
	SystemReducer,
} from "@/game/types";
import { isSpineEvent } from "@/game/types";

const FULL_CAPTURE = 100;
const EMPTY_CAPTURE = 0;
const TICK_SECONDS = TICK_MS / 1000;
const MS_PER_SECOND = 1000;

function ensureDeed(state: GameState, hex: string): Deed {
	const existing = state.deeds[hex];
	if (existing) {
		return existing;
	}
	return {
		hex,
		owner: "neutral",
		hexClass: hexClassFor(hex),
		capturePct: EMPTY_CAPTURE,
		capturedAt: null,
		lastVisited: state.lastTick,
	};
}

function captureDeltaPct(
	hexClass: HexClass,
	rank: GameState["player"]["rank"]
): number {
	const seconds = CAPTURE_SECONDS[hexClass];
	const speed = RANK_CAPTURE_SPEED[rank];
	return (FULL_CAPTURE / seconds) * speed * TICK_SECONDS;
}

function advanceCapture(deed: Deed, delta: number, now: number): Deed {
	// Rival-held hexes must first be drained to zero before the player can claim.
	if (deed.owner === "rival" && deed.capturePct > EMPTY_CAPTURE) {
		const drained = Math.max(EMPTY_CAPTURE, deed.capturePct - delta);
		if (drained > EMPTY_CAPTURE) {
			return { ...deed, capturePct: drained, lastVisited: now };
		}
		return {
			...deed,
			owner: "neutral",
			capturePct: EMPTY_CAPTURE,
			capturedAt: null,
			lastVisited: now,
		};
	}

	const next = Math.min(FULL_CAPTURE, deed.capturePct + delta);
	if (next >= FULL_CAPTURE) {
		return {
			...deed,
			owner: "player",
			capturePct: FULL_CAPTURE,
			capturedAt: deed.owner === "player" ? deed.capturedAt : now,
			lastVisited: now,
		};
	}
	return { ...deed, capturePct: next, lastVisited: now };
}

function meterFor(deed: Deed): CaptureMeter {
	return {
		hex: deed.hex,
		progress: deed.capturePct,
		owner: deed.owner,
		contested: deed.owner === "rival" && deed.capturePct > EMPTY_CAPTURE,
	};
}

function decayWindowMs(_hexClass: HexClass): number {
	// Spine deeds only carry a hex class; estate/manor windows apply once the
	// estate system tags holdings. Default to the wildland grace window.
	return DECAY_WINDOW_MS.wildland;
}

function decayDeed(deed: Deed, now: number): Deed {
	if (deed.owner !== "player" || deed.capturePct <= EMPTY_CAPTURE) {
		return deed;
	}
	const idleMs = now - deed.lastVisited;
	const windowMs = decayWindowMs(deed.hexClass);
	if (idleMs <= windowMs) {
		return deed;
	}
	const daysPastWindow = (idleMs - windowMs) / MS_PER_DAY;
	const lost = FULL_CAPTURE * DECAY_RATE_PER_DAY * daysPastWindow;
	const next = Math.max(EMPTY_CAPTURE, deed.capturePct - lost);
	if (next === deed.capturePct) {
		return deed;
	}
	if (next <= EMPTY_CAPTURE) {
		return {
			...deed,
			owner: "neutral",
			capturePct: EMPTY_CAPTURE,
			capturedAt: null,
		};
	}
	return { ...deed, capturePct: next };
}

function applyDecay(state: GameState, now: number): GameState {
	let changed = false;
	const deeds: Record<string, Deed> = {};
	const captureMeters = { ...state.captureMeters };
	for (const [hex, deed] of Object.entries(state.deeds)) {
		const decayed = decayDeed(deed, now);
		deeds[hex] = decayed;
		if (decayed !== deed) {
			changed = true;
			captureMeters[hex] = meterFor(decayed);
		}
	}
	if (!changed) {
		return state;
	}
	return { ...state, deeds, captureMeters };
}

export const captureReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event)) {
		return state;
	}

	if (event.type === "CLAIM_PROGRESS") {
		const hex = event.hex;
		const deed = ensureDeed(state, hex);
		const delta = captureDeltaPct(deed.hexClass, state.player.rank);
		const advanced = advanceCapture(deed, delta, state.lastTick);
		return {
			...state,
			deeds: { ...state.deeds, [hex]: advanced },
			captureMeters: { ...state.captureMeters, [hex]: meterFor(advanced) },
		};
	}

	if (event.type !== "TICK") {
		return state;
	}

	const now = event.now;
	const hex = state.position.hex;
	const deed = ensureDeed(state, hex);
	const delta = captureDeltaPct(deed.hexClass, state.player.rank);
	const advanced = advanceCapture(deed, delta, now);
	const withCapture: GameState = {
		...state,
		deeds: { ...state.deeds, [hex]: advanced },
		captureMeters: { ...state.captureMeters, [hex]: meterFor(advanced) },
	};
	return applyDecay(withCapture, now);
};

export const manaReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event)) {
		return state;
	}

	if (event.type === "COLLECT_MANA") {
		// Mana auto-accrues on TICK; collecting just stamps the moment.
		return { ...state, lastTick: state.lastTick };
	}

	if (event.type !== "TICK") {
		return state;
	}

	const elapsedMs = Math.max(0, event.now - state.lastTick);
	const elapsedSeconds = elapsedMs / MS_PER_SECOND;
	if (elapsedSeconds <= 0) {
		return state;
	}

	let perSecond = 0;
	for (const deed of Object.values(state.deeds)) {
		if (deed.owner === "player" && deed.capturePct >= FULL_CAPTURE) {
			perSecond += MANA_PER_SECOND[deed.hexClass];
		}
	}
	if (perSecond <= 0) {
		return state;
	}

	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + perSecond * elapsedSeconds,
		},
	};
};

function makeBeenEntry(
	hex: string,
	lat: number,
	lng: number,
	now: number
): JournalEntry {
	return {
		id: `been:${hex}`,
		hex,
		name: hex,
		status: "been",
		lat,
		lng,
		createdAt: now,
	};
}

export const movementReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event) || event.type !== "MOVE") {
		return state;
	}

	const { lat, lng } = event;
	const hex = posToHex(lat, lng);
	const now = state.lastTick;

	const journalKey = `been:${hex}`;
	const journal = state.journal[journalKey]
		? state.journal
		: { ...state.journal, [journalKey]: makeBeenEntry(hex, lat, lng, now) };

	const existingDeed = state.deeds[hex];
	const visitedDeed: Deed = existingDeed
		? { ...existingDeed, lastVisited: now }
		: { ...ensureDeed(state, hex), lastVisited: now };

	return {
		...state,
		position: { lat, lng, hex },
		homeHex: state.homeHex ?? hex,
		journal,
		deeds: { ...state.deeds, [hex]: visitedDeed },
	};
};

export const journalReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event)) {
		return state;
	}

	if (event.type === "JOURNAL_ADD") {
		const entry = event.entry;
		return {
			...state,
			journal: { ...state.journal, [entry.id]: entry },
		};
	}

	if (event.type === "JOURNAL_SET_STATUS") {
		const existing = state.journal[event.id];
		if (!existing) {
			return state;
		}
		return {
			...state,
			journal: {
				...state.journal,
				[event.id]: { ...existing, status: event.status },
			},
		};
	}

	return state;
};

export const gpsDebugReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event)) {
		return state;
	}

	if (event.type === "SET_GPS_MODE") {
		return { ...state, useRealGps: event.on };
	}

	if (event.type === "SET_HOME") {
		return { ...state, homeHex: event.hex };
	}

	if (event.type === "DEBUG_TOGGLE") {
		return {
			...state,
			debug: { ...state.debug, enabled: !state.debug.enabled },
		};
	}

	if (event.type === "DEBUG_SET_CONTENT_SOURCE") {
		return {
			...state,
			debug: { ...state.debug, contentSource: event.source },
		};
	}

	return state;
};

// Advances the simulation clock. Registered LAST so accrual reducers (mana)
// read the elapsed delta against the previous lastTick before it moves forward.
export const clockReducer: SystemReducer = (state, event) => {
	if (!isSpineEvent(event) || event.type !== "TICK") {
		return state;
	}
	if (event.now === state.lastTick) {
		return state;
	}
	return { ...state, lastTick: event.now };
};
