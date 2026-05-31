import { create } from "zustand";
import {
	DEFAULT_SPAWN,
	MANA_PER_SECOND,
	MAX_OFFLINE_MS,
	STATE_VERSION,
} from "@/game/constants";
import { posToHex } from "@/game/lib/hex";
import { localAdapter } from "@/game/storage/local-adapter";
import { rootReduce } from "@/game/store/reducer";
import type { GameEvent, GameState, Player } from "@/game/types";

const MS_PER_SECOND = 1000;

const DEFAULT_PLAYER: Player = {
	id: "player",
	name: "Wanderer",
	level: 1,
	xp: 0,
	rank: "E",
	statPoints: 0,
	stats: { str: 5, agi: 5, vit: 5, int: 5, per: 5 },
	skillPoints: 0,
	unlockedSkills: [],
	unlockedPowers: ["striker"],
	equippedPower: "striker",
	hp: 100,
	maxHp: 100,
	stamina: 100,
	maxStamina: 100,
	combatMana: 50,
	maxCombatMana: 50,
	bankedSteps: 0,
};

export function initialGameState(): GameState {
	const now = Date.now();
	const { lat, lng } = DEFAULT_SPAWN;
	return {
		version: STATE_VERSION,
		lastTick: now,
		player: { ...DEFAULT_PLAYER, stats: { ...DEFAULT_PLAYER.stats } },
		resources: { mana: 0, materials: {} },
		position: { lat, lng, hex: posToHex(lat, lng) },
		homeHex: null,
		useRealGps: false,
		deeds: {},
		captureMeters: {},
		journal: {},
		gates: {},
		beacons: {},
		plots: {},
		estates: [],
		shadows: [],
		inventory: { items: {} },
		world: {
			timeOfDay: "day",
			weather: "clear",
			theme: "bright_day",
			ghost: { active: false, secondsRemaining: 0, lastReset: now },
		},
		activeGate: null,
		activeBoss: null,
		debug: { enabled: false, contentSource: "procedural" },
		meta: {
			quests: [],
			supplyDrops: [],
			chests: [],
			vehicles: [{ id: "walk", kind: "walk" }],
			sieges: [],
			daily: {
				lastShrineReset: now,
				lastDailyQuestReset: now,
				ghostSecondsUsedToday: 0,
			},
			notifications: [],
			onboarded: false,
			contentCacheMeta: {},
		},
	};
}

// Credit offline mana accrual for the elapsed interval since the last tick,
// capped to MAX_OFFLINE_MS, then advance lastTick to now.
function applyOfflineAccrual(state: GameState, now: number): GameState {
	const elapsedMs = Math.min(MAX_OFFLINE_MS, Math.max(0, now - state.lastTick));
	const elapsedSeconds = elapsedMs / MS_PER_SECOND;
	let perSecond = 0;
	for (const deed of Object.values(state.deeds)) {
		if (deed.owner === "player" && deed.capturePct >= 100) {
			perSecond += MANA_PER_SECOND[deed.hexClass];
		}
	}
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + perSecond * elapsedSeconds,
		},
		lastTick: now,
	};
}

interface GameStore {
	dispatch: (event: GameEvent) => void;
	ready: boolean;
	state: GameState;
}

function persist(next: GameState, event: GameEvent): void {
	localAdapter.saveSnapshot(next).catch(() => {
		// Persistence is best-effort; in-memory state remains authoritative.
	});
	localAdapter.appendEvent(event).catch(() => {
		// Event-log append is best-effort.
	});
}

export const useGameStore = create<GameStore>((set, get) => ({
	state: initialGameState(),
	ready: false,
	dispatch: (event: GameEvent) => {
		const next = rootReduce(get().state, event);
		persist(next, event);
		set({ state: next });
	},
}));

// Load the persisted snapshot, credit offline accrual, and mark the store ready.
// Safe to call once on the client; no-ops gracefully on the server.
export async function hydrate(): Promise<void> {
	if (typeof window === "undefined") {
		return;
	}
	const snapshot = await localAdapter.loadSnapshot();
	const fresh = initialGameState();
	// Merge defaults so snapshots written by an earlier schema gain any new
	// top-level / meta fields without crashing amplifier reducers.
	const base: GameState = snapshot
		? {
				...fresh,
				...snapshot,
				meta: { ...fresh.meta, ...(snapshot.meta ?? {}) },
				world: { ...fresh.world, ...(snapshot.world ?? {}) },
				player: { ...fresh.player, ...(snapshot.player ?? {}) },
			}
		: fresh;
	const hydrated = applyOfflineAccrual(base, Date.now());
	console.log(
		`[FIX] hydrate: snapshot=${snapshot ? "present" : "null"} xp=${hydrated.player.xp} level=${hydrated.player.level} useRealGps=${hydrated.useRealGps}`
	);
	useGameStore.setState({ state: hydrated, ready: true });
	localAdapter.saveSnapshot(hydrated).catch(() => {
		// Best-effort persist of the hydrated state.
	});
}

export function useGameState(): GameState {
	return useGameStore((s) => s.state);
}

export function useDispatch(): (event: GameEvent) => void {
	return useGameStore((s) => s.dispatch);
}

export function useGameReady(): boolean {
	return useGameStore((s) => s.ready);
}
