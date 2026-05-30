import type maplibregl from "maplibre-gl";
import { posToHex } from "@/game/lib/hex";
import {
	BuildingObstacles,
	type ChaseParams,
	chaseStep,
} from "@/game/three/nav";
import type { GameEvent, GameState } from "@/game/types";

// Drives the field boss as an on-map chaser. Each frame it steers the boss's
// live lng/lat toward the player, avoiding OpenFreeMap building footprints
// (queried from the vector tiles via the shared nav helpers - real obstacle
// polygons, not a fake navmesh). The store stays the source of truth for the
// boss's existence/HP; this owns only the live position, syncing it back on hex
// change (like the player).

const BOSS_SPEED_MPS = 9; // a touch slower than the player's walk
const ENGAGE_RANGE_M = 8; // within this, the boss attacks
const ATTACK_INTERVAL_MS = 1500;
const REPATH_PROBE_M = 6; // look-ahead distance for obstacle avoidance
const AVOID_TURN_DEG = 35; // how hard to veer when blocked
const BUILDING_REFRESH_MS = 1500;

// Chase tunables handed to the shared nav step. Unchanged from the boss's
// original inline constants.
const BOSS_CHASE: ChaseParams = {
	speedMps: BOSS_SPEED_MPS,
	probeM: REPATH_PROBE_M,
	avoidTurnDeg: AVOID_TURN_DEG,
};

export interface BossDeps {
	dispatch: (event: GameEvent) => void;
	getPlayer: () => { lat: number; lng: number };
	getState: () => GameState;
	map: maplibregl.Map;
}

export class BossController {
	private readonly deps: BossDeps;
	private liveLat = 0;
	private liveLng = 0;
	private activeId: string | null = null;
	private lastHex = "";
	private lastAttack = 0;
	private readonly buildings: BuildingObstacles;

	constructor(deps: BossDeps) {
		this.deps = deps;
		this.buildings = new BuildingObstacles(deps.map, BUILDING_REFRESH_MS);
	}

	// The boss's current visual position (for the renderer to place the model).
	get position(): { lat: number; lng: number } | null {
		return this.activeId ? { lat: this.liveLat, lng: this.liveLng } : null;
	}

	get bossId(): string | null {
		return this.activeId;
	}

	// Advance the chase one frame.
	update(dt: number, timeMs: number): void {
		const boss = this.deps.getState().activeBoss;
		if (!boss || boss.status === "defeated") {
			this.activeId = null;
			return;
		}
		// New boss (or first sight): seed live position from the store.
		if (boss.id !== this.activeId) {
			this.activeId = boss.id;
			this.liveLat = boss.lat;
			this.liveLng = boss.lng;
			this.lastHex = boss.hex;
		}

		this.buildings.refresh(timeMs);

		const player = this.deps.getPlayer();
		const next = chaseStep({
			fromLat: this.liveLat,
			fromLng: this.liveLng,
			targetLat: player.lat,
			targetLng: player.lng,
			dt,
			obstacles: this.buildings.rings,
			params: BOSS_CHASE,
		});

		if (next.distance <= ENGAGE_RANGE_M) {
			this.attack(timeMs);
			return;
		}

		this.liveLat = next.lat;
		this.liveLng = next.lng;

		// Keep the store's boss hex roughly current so range/turf logic tracks the
		// chase, without dispatching every frame.
		const hex = posToHex(this.liveLat, this.liveLng);
		if (hex !== this.lastHex) {
			this.lastHex = hex;
			this.deps.dispatch({
				type: "BOSS_MOVE",
				lat: this.liveLat,
				lng: this.liveLng,
				hex,
			});
		}
	}

	private attack(timeMs: number): void {
		if (timeMs - this.lastAttack < ATTACK_INTERVAL_MS) {
			return;
		}
		this.lastAttack = timeMs;
		// Engage + chip: the reducer applies boss damage to the player on tick,
		// but a proximity hit makes the on-map fight immediate.
		this.deps.dispatch({ type: "BOSS_ENGAGE" });
	}
}
