import { describe, expect, it } from "bun:test";
import { ENEMY_ANIM_URL, ENEMY_MODEL_URL } from "@/game/constants";
import { initialGameState } from "@/game/store/store";
import { collectGateCombatSpecs } from "@/game/three/specs/gate-combat-specs";
import type { GateRun } from "@/game/types";

function activeRun(): GateRun {
	return {
		elapsedMs: 0,
		enemies: [
			{
				hp: 10,
				id: "enemy-1",
				kind: "fodder",
				lat: 1.3522,
				lng: 103.8199,
				maxHp: 10,
				name: "Test Skeleton",
				x: 0.5,
				y: 0.5,
			},
		],
		gateHex: "test-hex",
		mana: 0,
		playerHp: 100,
		playerMaxHp: 100,
		potionsUsed: 0,
		power: "striker",
		purchasedPotionsUsed: 0,
		rank: "E",
		stamina: 100,
		starsEarned: 0,
		startedAt: 0,
		status: "active",
		theme: "abyss",
		totalWaves: 1,
		wave: 1,
	};
}

describe("collectGateCombatSpecs", () => {
	it("marks living skeleton enemies as animated world entities", () => {
		const state = { ...initialGameState(), activeGate: activeRun() };

		const [spec] = collectGateCombatSpecs(state);

		expect(spec).toMatchObject({
			animation: {
				clip: "walk",
				url: ENEMY_ANIM_URL,
				yawOffsetRad: Math.PI,
			},
			key: "gate-enemy:enemy-1",
			kind: "gate-enemy",
			modelUrl: ENEMY_MODEL_URL.fodder,
		});
	});
});
