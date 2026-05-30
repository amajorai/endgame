import type maplibregl from "maplibre-gl";
import { METERS_PER_DEGREE_LAT } from "@/game/constants";

// Shared on-map navigation primitives. Extracted from BossController so multiple
// chasers (field boss, gate-combat enemies) can reuse the same geometry and the
// same real-building avoidance against the basemap's vector tiles. This module
// owns only pure geometry + obstacle querying; the per-entity DECISION logic
// (engage range, attacks, dispatches) stays with each controller.

const DEG = Math.PI / 180;

// Building footprint as a polygon ring in [lng, lat] pairs.
export interface Obstacle {
	ring: [number, number][];
}

// East/north metre offsets and straight-line distance between two lng/lat
// points. Distance is floored at 1 so callers can divide by it safely.
export function metresBetween(
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
export function rotate(
	east: number,
	north: number,
	angle: number
): [number, number] {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return [east * cos - north * sin, east * sin + north * cos];
}

// Ray-cast point-in-polygon for a [lng, lat] ring.
export function pointInRing(
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

// Pulls current building footprints from the basemap as obstacle polygons,
// throttled so we don't re-query the vector tiles every frame. On a query error
// (source not ready) it keeps the previous obstacle set rather than clearing it,
// matching the boss's original behaviour.
export class BuildingObstacles {
	private readonly map: maplibregl.Map;
	private readonly refreshMs: number;
	private obstacles: Obstacle[] = [];
	private lastRefresh = 0;

	constructor(map: maplibregl.Map, refreshMs: number) {
		this.map = map;
		this.refreshMs = refreshMs;
	}

	get rings(): Obstacle[] {
		return this.obstacles;
	}

	refresh(timeMs: number): void {
		if (timeMs - this.lastRefresh < this.refreshMs) {
			return;
		}
		this.lastRefresh = timeMs;
		const next: Obstacle[] = [];
		try {
			const feats = this.map.querySourceFeatures("openmaptiles", {
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

// Tunables for a single chase step. Passed in by each controller so the field
// boss keeps its exact constants while gate enemies can pick their own.
export interface ChaseParams {
	// How hard to veer (degrees) when the straight path is blocked.
	avoidTurnDeg: number;
	// Look-ahead distance for obstacle probing, in metres.
	probeM: number;
	// Forward speed in metres/second.
	speedMps: number;
}

// Advance a chaser one frame toward (targetLat, targetLng): pick the heading
// toward the target, fan out left/right around buildings if the straight path is
// blocked, and step forward. Returns the new lat/lng plus the distance to the
// target (so the caller can decide to engage instead). Pure with respect to the
// passed position - it returns a new position rather than mutating.
export function chaseStep(args: {
	fromLat: number;
	fromLng: number;
	targetLat: number;
	targetLng: number;
	dt: number;
	obstacles: Obstacle[];
	params: ChaseParams;
}): { lat: number; lng: number; distance: number } {
	const { fromLat, fromLng, targetLat, targetLng, dt, obstacles, params } =
		args;
	const { dEast, dNorth, distance } = metresBetween(
		fromLat,
		fromLng,
		targetLat,
		targetLng
	);

	let dirEast = dEast / distance;
	let dirNorth = dNorth / distance;
	[dirEast, dirNorth] = avoidBuildings(
		dirEast,
		dirNorth,
		fromLat,
		fromLng,
		obstacles,
		params
	);

	const step = params.speedMps * dt;
	const lat = fromLat + (dirNorth * step) / METERS_PER_DEGREE_LAT;
	const lngScale = METERS_PER_DEGREE_LAT * Math.cos(lat * DEG);
	const lng = fromLng + (dirEast * step) / (lngScale || METERS_PER_DEGREE_LAT);
	return { lat, lng, distance };
}

// Is the look-ahead point inside any building footprint?
function isBlocked(
	east: number,
	north: number,
	fromLat: number,
	fromLng: number,
	obstacles: Obstacle[],
	probeM: number
): boolean {
	const lat = fromLat + (north * probeM) / METERS_PER_DEGREE_LAT;
	const lngScale = METERS_PER_DEGREE_LAT * Math.cos(fromLat * DEG);
	const lng = fromLng + (east * probeM) / (lngScale || 1);
	for (const obstacle of obstacles) {
		if (pointInRing(lng, lat, obstacle.ring)) {
			return true;
		}
	}
	return false;
}

// Steer the desired direction away from any building within a short look-ahead.
// Tries the straight line first, then fans out left/right in fixed steps.
function avoidBuildings(
	east: number,
	north: number,
	fromLat: number,
	fromLng: number,
	obstacles: Obstacle[],
	params: ChaseParams
): [number, number] {
	if (!isBlocked(east, north, fromLat, fromLng, obstacles, params.probeM)) {
		return [east, north];
	}
	for (let i = 1; i <= 3; i += 1) {
		const angle = i * params.avoidTurnDeg * DEG;
		const left = rotate(east, north, angle);
		if (
			!isBlocked(left[0], left[1], fromLat, fromLng, obstacles, params.probeM)
		) {
			return left;
		}
		const right = rotate(east, north, -angle);
		if (
			!isBlocked(right[0], right[1], fromLat, fromLng, obstacles, params.probeM)
		) {
			return right;
		}
	}
	// Fully boxed in: hold direction (rare; better than freezing).
	return [east, north];
}
