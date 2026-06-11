import { ENEMY_ANIM_URL, ENEMY_MODEL_URL } from "@/game/constants";
import { ENEMY_SIZE_M } from "@/game/data/gate-combat";
import { enemyPositions } from "@/game/three/gate-combat-controller";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameState } from "@/game/types";

// Spec provider for an active gate run's enemies. Emits one skeleton model per
// LIVING enemy while the run is active, positioned from the controller's live
// singleton when available (smooth per-frame motion) else the enemy's stored
// lat/lng (the deterministic spawn ring). Enemies are visual threats, not attack
// buttons; the combat HUD owns player actions.
//
// Registered at module top-level below. The integration agent must ensure this
// module is imported for its side effect (like core-specs) or no enemies render.

const SKELETON_FORWARD_OFFSET_RAD = Math.PI;

function collectGateCombatSpecs(state: GameState): WorldEntitySpec[] {
	const run = state.activeGate;
	if (!run || run.status !== "active") {
		return [];
	}
	const specs: WorldEntitySpec[] = [];
	for (const enemy of run.enemies) {
		if (enemy.hp <= 0) {
			continue;
		}
		const live = enemyPositions.get(enemy.id);
		const lat = live?.lat ?? enemy.lat;
		const lng = live?.lng ?? enemy.lng;
		// An enemy with no position yet (no live entry and no stored lat/lng) can't
		// be placed; skip it this frame rather than drawing at the null island.
		if (lat === undefined || lng === undefined) {
			continue;
		}
		specs.push({
			animation: {
				clip: "walk",
				url: ENEMY_ANIM_URL,
				yawOffsetRad: SKELETON_FORWARD_OFFSET_RAD,
			},
			key: `gate-enemy:${enemy.id}`,
			kind: "gate-enemy",
			modelUrl: ENEMY_MODEL_URL[enemy.kind],
			scaleM: ENEMY_SIZE_M[enemy.kind],
			lat,
			lng,
		});
	}
	return specs;
}

export { collectGateCombatSpecs };

registerSpecProvider(collectGateCombatSpecs);
