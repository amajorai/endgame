import {
	cellToBoundary,
	cellToLatLng,
	gridDisk,
	gridDistance,
	latLngToCell,
} from "h3-js";
import { H3_RESOLUTION } from "@/game/constants";
import { seededFromHex } from "@/game/lib/rng";
import type { H3Index, HexClass } from "@/game/types";

// Convert a lat/lng pair to its H3 cell at the game resolution.
export function posToHex(lat: number, lng: number): H3Index {
	return latLngToCell(lat, lng, H3_RESOLUTION);
}

// Geographic center of a hex.
export function hexCenter(hex: H3Index): { lat: number; lng: number } {
	const [lat, lng] = cellToLatLng(hex);
	return { lat, lng };
}

// Closed boundary ring of a hex in GeoJSON [lng, lat] order.
export function hexBoundary(hex: H3Index): [number, number][] {
	const ring = cellToBoundary(hex, true) as [number, number][];
	if (ring.length === 0) {
		return ring;
	}
	const first = ring[0];
	const last = ring.at(-1);
	if (last && (last[0] !== first[0] || last[1] !== first[1])) {
		return [...ring, [first[0], first[1]]];
	}
	return ring;
}

// All hexes within grid radius k of a hex (inclusive of the center).
export function hexDisk(hex: H3Index, k: number): H3Index[] {
	return gridDisk(hex, k);
}

// Grid distance (in hexes) between two cells.
export function hexDistance(a: H3Index, b: H3Index): number {
	return gridDistance(a, b);
}

const CONTROL_POINT_CHANCE = 0.15;
const SANCTUM_CHANCE = 0.03;

// Deterministic hex classification: mostly wildland, some control points, rare
// sanctums. Pure and stable per hex via a seeded PRNG.
export function hexClassFor(hex: H3Index): HexClass {
	const roll = seededFromHex(hex)();
	if (roll < SANCTUM_CHANCE) {
		return "sanctum";
	}
	if (roll < SANCTUM_CHANCE + CONTROL_POINT_CHANCE) {
		return "control_point";
	}
	return "wildland";
}
