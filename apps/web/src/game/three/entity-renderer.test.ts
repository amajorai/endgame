import { describe, expect, it } from "bun:test";
import { Group } from "three";
import { INTERACT_RADIUS_M, METERS_PER_DEGREE_LAT } from "@/game/constants";
import { posToHex } from "@/game/lib/hex";
import { initialGameState } from "@/game/store/store";
import {
	EntityRenderer,
	yawForLatLngDelta,
} from "@/game/three/entity-renderer";
import type { FieldBoss, GameEvent, GameState, Gate } from "@/game/types";

// The interaction ring gate: a world entity is only interactable when it sits
// within INTERACT_RADIUS_M of the player. interactableKeys() is the pure
// predicate behind both the ring visual and pick(); these tests drive it
// directly (no map / WebGL needed, so they run headlessly).

// Build a gate `metresNorth` due north of the player, keyed by its own hex.
function gateNorthOf(lat: number, lng: number, metresNorth: number): Gate {
	const gateLat = lat + metresNorth / METERS_PER_DEGREE_LAT;
	return {
		anchored: false,
		hex: posToHex(gateLat, lng),
		lat: gateLat,
		lng,
		name: "Test Gate",
		rank: "E",
		stars: 0,
		theme: "nature",
	};
}

function stateWithGates(gates: Record<string, Gate>): GameState {
	return { ...initialGameState(), gates };
}

// Build a field boss whose stored (record) position is `metresNorth` of the
// player. Its live chase position is supplied separately via the position
// provider, so the two can diverge - which is exactly what the gate must honour.
function bossNorthOf(lat: number, lng: number, metresNorth: number): FieldBoss {
	const bossLat = lat + metresNorth / METERS_PER_DEGREE_LAT;
	return {
		fromDungeonBreak: false,
		hex: posToHex(bossLat, lng),
		hp: 100,
		id: "b1",
		lat: bossLat,
		lng,
		maxHp: 100,
		name: "Test Boss",
		phase: 1,
		rank: "E",
		status: "roaming",
		theme: "abyss",
		totalPhases: 1,
	};
}

describe("EntityRenderer.interactableKeys (interaction ring gate)", () => {
	it("includes entities inside the ring and excludes those outside", () => {
		const { lat, lng } = initialGameState().position;
		// Near gate well inside the radius; far gate well beyond it.
		const near = gateNorthOf(lat, lng, INTERACT_RADIUS_M / 2);
		const far = gateNorthOf(lat, lng, INTERACT_RADIUS_M * 3);
		const state = stateWithGates({ near, far });

		// Construct with the origin AT the player (the scene always keeps the
		// origin on the player, so origin == live player position).
		const renderer = new EntityRenderer(new Group(), lng, lat, {
			loadModels: false,
		});
		renderer.sync(state);

		const keys = renderer.interactableKeys();
		expect(keys).toContain(`gate:${near.hex}`);
		expect(keys).not.toContain(`gate:${far.hex}`);
	});

	it("a far entity becomes interactable once the player moves within range", () => {
		const { lat, lng } = initialGameState().position;
		const far = gateNorthOf(lat, lng, INTERACT_RADIUS_M * 3);
		const state = stateWithGates({ far });

		const renderer = new EntityRenderer(new Group(), lng, lat, {
			loadModels: false,
		});
		renderer.sync(state);
		expect(renderer.interactableKeys()).not.toContain(`gate:${far.hex}`);

		// Walk the origin onto the far gate; it now sits inside the ring.
		renderer.syncPositions(far.lng, far.lat);
		expect(renderer.interactableKeys()).toContain(`gate:${far.hex}`);
	});

	it("gates a moving boss by its LIVE chase position, not its stored hex", () => {
		const { lat, lng } = initialGameState().position;
		// Stored position is far (a stale hex writeback), but the live chaser is
		// right next to the player - so the boss must be interactable.
		const boss = bossNorthOf(lat, lng, INTERACT_RADIUS_M * 3);
		const state = { ...initialGameState(), activeBoss: boss };

		const renderer = new EntityRenderer(new Group(), lng, lat, {
			loadModels: false,
		});
		renderer.sync(state);

		// With no live provider it falls back to the (far) record position: excluded.
		expect(renderer.interactableKeys()).not.toContain(`boss:${boss.id}`);

		// Live position close to the player: now reachable.
		const nearLat = lat + INTERACT_RADIUS_M / 2 / METERS_PER_DEGREE_LAT;
		renderer.setBossPositionProvider(() => ({ lat: nearLat, lng }));
		expect(renderer.interactableKeys()).toContain(`boss:${boss.id}`);

		// Live position far away again: excluded, even if the record were near.
		renderer.setBossPositionProvider(() => ({
			lat: lat + (INTERACT_RADIUS_M * 3) / METERS_PER_DEGREE_LAT,
			lng,
		}));
		expect(renderer.interactableKeys()).not.toContain(`boss:${boss.id}`);
	});

	it("uses the larger gate pick radius before map clicks fall through", () => {
		const { lat, lng } = initialGameState().position;
		const gate = gateNorthOf(lat, lng, INTERACT_RADIUS_M / 2);
		const renderer = new EntityRenderer(new Group(), lng, lat, {
			loadModels: false,
		});
		renderer.sync(stateWithGates({ [gate.hex]: gate }));

		const map = {
			project: () => ({ x: 100, y: 100 }),
		};
		const picked: GameEvent[] = [];

		const hit = renderer.pick(map as never, 160, 100, (event) => {
			picked.push(event);
		});

		expect(hit).toBe(true);
		expect(picked).toEqual([{ type: "GATE_ENTER", hex: gate.hex }]);
	});
});

describe("yawForLatLngDelta", () => {
	it("matches the scene yaw convention for north and east travel", () => {
		const { lat, lng } = initialGameState().position;
		const northLat = lat + 1 / METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(lat * (Math.PI / 180));
		const eastLng = lng + 1 / lngScale;

		expect(yawForLatLngDelta(lat, lng, northLat, lng)).toBeCloseTo(0);
		expect(yawForLatLngDelta(lat, lng, lat, eastLng)).toBeCloseTo(Math.PI / 2);
		expect(yawForLatLngDelta(lat, lng, lat, lng)).toBeNull();
	});
});
