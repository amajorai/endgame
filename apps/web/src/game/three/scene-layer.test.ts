import { describe, expect, it } from "bun:test";
import { Vector3 } from "three";
import { createSceneLocalMatrix } from "@/game/three/scene-layer";

describe("SceneLayer local transform", () => {
	it("maps the local game axes onto Mercator axes", () => {
		const scale = 0.01;
		const matrix = createSceneLocalMatrix(10, 20, 30, scale);

		const origin = new Vector3(0, 0, 0).applyMatrix4(matrix);
		const east = new Vector3(1, 0, 0).applyMatrix4(matrix);
		const up = new Vector3(0, 1, 0).applyMatrix4(matrix);
		const north = new Vector3(0, 0, 1).applyMatrix4(matrix);

		expect(east.x - origin.x).toBeCloseTo(scale);
		expect(east.y - origin.y).toBeCloseTo(0);
		expect(up.z - origin.z).toBeCloseTo(scale);
		expect(north.y - origin.y).toBeCloseTo(-scale);
	});
});
