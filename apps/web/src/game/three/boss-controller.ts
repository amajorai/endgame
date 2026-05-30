import type maplibregl from "maplibre-gl";
import { METERS_PER_DEGREE_LAT } from "@/game/constants";
import { posToHex } from "@/game/lib/hex";
import type { GameEvent, GameState } from "@/game/types";

// Drives the field boss as an on-map chaser. Each frame it steers the boss's
// live lng/lat toward the player, avoiding OpenFreeMap building footprints
// (queried from the vector tiles — real obstacle polygons, not a fake navmesh).
// The store stays the source of truth for the boss's existence/HP; this owns
// only the live position, syncing it back on hex change (like the player).

const DEG = Math.PI / 180;
const BOSS_SPEED_MPS = 9; // a touch slower than the player's walk
const ENGAGE_RANGE_M = 8; // within this, the boss attacks
const ATTACK_INTERVAL_MS = 1500;
const REPATH_PROBE_M = 6; // look-ahead distance for obstacle avoidance
const AVOID_TURN_DEG = 35; // how hard to veer when blocked
const BUILDING_REFRESH_MS = 1500;

interface Obstacle {
	// Polygon ring in [lng, lat] pairs (building footprint).
	ring: [number, number][];
}

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
	private obstacles: Obstacle[] = [];
	private lastBuildingRefresh = 0;

	constructor(deps: BossDeps) {
		this.deps = deps;
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

		this.refreshObstacles(timeMs);

		const player = this.deps.getPlayer();
		const { dEast, dNorth, distance } = metresBetween(
			this.liveLat,
			this.liveLng,
			player.lat,
			player.lng
		);

		if (distance <= ENGAGE_RANGE_M) {
			this.attack(timeMs);
			return;
		}

		// Desired heading toward the player, nudged to avoid buildings ahead.
		let dirEast = dEast / distance;
		let dirNorth = dNorth / distance;
		[dirEast, dirNorth] = this.avoidBuildings(dirEast, dirNorth);

		const step = BOSS_SPEED_MPS * dt;
		this.liveLat += (dirNorth * step) / METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.liveLat * DEG);
		this.liveLng += (dirEast * step) / (lngScale || METERS_PER_DEGREE_LAT);

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

	// Steer the desired direction away from any building footprint within a short
	// look-ahead. Tries the straight line first, then fans out left/right.
	private avoidBuildings(east: number, north: number): [number, number] {
		if (!this.isBlocked(east, north)) {
			return [east, north];
		}
		for (let i = 1; i <= 3; i += 1) {
			const angle = i * AVOID_TURN_DEG * DEG;
			const left = rotate(east, north, angle);
			if (!this.isBlocked(left[0], left[1])) {
				return left;
			}
			const right = rotate(east, north, -angle);
			if (!this.isBlocked(right[0], right[1])) {
				return right;
			}
		}
		// Fully boxed in: hold direction (rare; better than freezing).
		return [east, north];
	}

	// Is the look-ahead point inside any building footprint?
	private isBlocked(east: number, north: number): boolean {
		const lat = this.liveLat + (north * REPATH_PROBE_M) / METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.liveLat * DEG);
		const lng = this.liveLng + (east * REPATH_PROBE_M) / (lngScale || 1);
		for (const obstacle of this.obstacles) {
			if (pointInRing(lng, lat, obstacle.ring)) {
				return true;
			}
		}
		return false;
	}

	// Pull current building footprints from the basemap as obstacle polygons.
	private refreshObstacles(timeMs: number): void {
		if (timeMs - this.lastBuildingRefresh < BUILDING_REFRESH_MS) {
			return;
		}
		this.lastBuildingRefresh = timeMs;
		const next: Obstacle[] = [];
		try {
			const feats = this.deps.map.querySourceFeatures("openmaptiles", {
				sourceLayer: "building",
			});
			for (const feat of feats) {
				if (feat.geometry?.type === "Polygon") {
					next.push({
						ring: feat.geometry.coordinates[0] as [number, number][],
					});
				}
			}
		} catch {
			// Source not ready yet; keep the previous obstacle set.
			return;
		}
		this.obstacles = next;
	}
}

// East/north metre offsets and straight-line distance between two lng/lat points.
function metresBetween(
	fromLat: number,
	fromLng: number,
	toLat: number,
	toLng: number
): { dEast: number; dNorth: number; distance: number } {
	const dNorth = (toLat - fromLat) * METERS_PER_DEGREE_LAT;
	const lngScale = METERS_PER_DEGREE_LAT * Math.cos(fromLat * DEG);
	const dEast = (toLng - fromLng) * lngScale;
	return { dEast, dNorth, distance: Math.hypot(dEast, dNorth) || 1 };
}

// Rotate a 2D (east, north) vector by `angle` radians.
function rotate(east: number, north: number, angle: number): [number, number] {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return [east * cos - north * sin, east * sin + north * cos];
}

// Ray-cast point-in-polygon for a [lng, lat] ring.
function pointInRing(
	lng: number,
	lat: number,
	ring: [number, number][]
): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersects =
			yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersects) {
			inside = !inside;
		}
	}
	return inside;
}
