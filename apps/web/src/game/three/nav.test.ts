import { describe, expect, it } from "bun:test";
import { type Obstacle, resolveMove } from "@/game/three/nav";

// Build a rectangular building footprint as a [lng, lat] ring. Coordinates here
// are abstract (resolveMove's geometry is unit-agnostic), chosen for clarity.
function rect(
	lngMin: number,
	lngMax: number,
	latMin: number,
	latMax: number
): Obstacle {
	return {
		ring: [
			[lngMin, latMin],
			[lngMax, latMin],
			[lngMax, latMax],
			[lngMin, latMax],
		],
	};
}

// A single square building covering lng[10,20] x lat[10,20].
const BUILDING: Obstacle[] = [rect(10, 20, 10, 20)];

describe("resolveMove", () => {
	it("takes the whole step when the destination is clear", () => {
		// Both points sit well outside the footprint.
		expect(resolveMove(0, 0, 1, 1, BUILDING)).toEqual({ lat: 1, lng: 1 });
	});

	it("does not block a mover already inside a footprint (escape hatch)", () => {
		// Starts inside the building; must still move freely so it can walk out.
		expect(resolveMove(15, 15, 15, 25, BUILDING)).toEqual({ lat: 15, lng: 25 });
	});

	it("slides along the east/west axis when blocked head-on", () => {
		// cur (lat5,lng5) is south-west and outside; next (lat15,lng15) lands
		// inside. The east/west slide point (nextLng15, curLat5) is still south of
		// the building, so the mover skims east along lat5 instead of sticking.
		expect(resolveMove(5, 5, 15, 15, BUILDING)).toEqual({ lat: 5, lng: 15 });
	});

	it("slides along the north/south axis when the east/west slide is blocked", () => {
		// cur (lat11,lng5) is due west; next (lat19,lng15) is inside. The east/west
		// slide point (nextLng15, curLat11) is also inside, so it falls through to
		// the north/south slide, keeping lng5 and advancing to lat19.
		expect(resolveMove(11, 5, 19, 15, BUILDING)).toEqual({ lat: 19, lng: 5 });
	});

	it("holds position when boxed in on both axes", () => {
		// Three footprints arranged so the destination and both axis-slide probes
		// each land inside a different building, while the start sits in none. The
		// only safe move is to hold (defensive branch; unreachable for one convex
		// footprint but possible among several).
		const boxed: Obstacle[] = [
			rect(10, 20, 10, 20), // destination (15,15)
			rect(10, 20, 0, 8), // east/west slide probe (15,5)
			rect(0, 8, 10, 20), // north/south slide probe (5,15)
		];
		expect(resolveMove(5, 5, 15, 15, boxed)).toEqual({ lat: 5, lng: 5 });
	});
});
