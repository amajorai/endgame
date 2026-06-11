import { describe, expect, it } from "bun:test";
import { CircleGeometry, type Mesh, RingGeometry } from "three";
import { InteractionRing } from "@/game/three/interaction-ring";

// Construction-level checks for the interaction ring. These can't confirm it
// LOOKS right (WebGL can't be rasterised headlessly), but they catch a ring
// built at the wrong size, with no geometry, or fully transparent - i.e. a ring
// the player would never see at the radius the gate actually uses.

const RADIUS_M = 60;
// Must mirror EDGE_BAND in interaction-ring.ts.
const EDGE_BAND = 0.04;

describe("InteractionRing", () => {
	it("builds a fill disc and an edge band sized to the radius", () => {
		const ring = new InteractionRing(RADIUS_M);
		const meshes = ring.group.children as Mesh[];
		expect(meshes).toHaveLength(2);

		const fill = meshes.find(
			(m) => m.geometry instanceof CircleGeometry
		) as Mesh;
		const edge = meshes.find((m) => m.geometry instanceof RingGeometry) as Mesh;
		expect(fill).toBeDefined();
		expect(edge).toBeDefined();

		const fillGeom = fill.geometry as CircleGeometry;
		expect(fillGeom.parameters.radius).toBe(RADIUS_M);

		const edgeGeom = edge.geometry as RingGeometry;
		expect(edgeGeom.parameters.outerRadius).toBe(RADIUS_M);
		expect(edgeGeom.parameters.innerRadius).toBeCloseTo(
			RADIUS_M * (1 - EDGE_BAND)
		);

		ring.dispose();
	});

	it("keeps the edge visible (opacity > 0) as the pulse animates", () => {
		const ring = new InteractionRing(RADIUS_M);
		const edge = (ring.group.children as Mesh[]).find(
			(m) => m.geometry instanceof RingGeometry
		) as Mesh;
		const material = edge.material as { opacity: number };

		// Sample the pulse across a couple of seconds; opacity must stay positive.
		for (let i = 0; i < 10; i++) {
			ring.update(0.25);
			expect(material.opacity).toBeGreaterThan(0);
		}
		ring.dispose();
	});
});
