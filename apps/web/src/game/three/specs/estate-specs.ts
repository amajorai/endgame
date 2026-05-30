import { HEX_VIEW_RING } from "@/game/constants";
import { hexCenter, hexDistance } from "@/game/lib/hex";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameEvent, GameState } from "@/game/types";

// Estate spec provider. Each player deed that carries a `building` string gets a
// distinct 3D model placed at its hex centre. The models track ownership: when a
// deed's `building` is set the model appears, and when it is cleared (or the deed
// is lost) the spec drops out and the renderer removes the model.
//
// New file only: registered at module top-level below so importing it wires the
// estate buildings into the shared WorldEntitySpec registry.

// On-map footprint per building, in metres. Buildings read larger than props so
// an owned, developed hex is legible at a glance.
const BANNER_SIZE_M = 5;
const PLOT_SIZE_M = 6;
const SHOP_SIZE_M = 8;
const TOWER_SIZE_M = 12;
const GATE_ANCHOR_SIZE_M = 7;

// Model URL per estate building. These are confirmed-present assets:
//   banner      -> fantasy-town-kit banner-green (confirmed by foundation)
//   plot        -> fantasy-town-kit fence (a small fenced patch reads as a plot)
//   shop        -> fantasy-town-kit stall-green (a market stall reads as a shop)
//   tower       -> castle-kit tower-square (a complete standing tower)
//   gate_anchor -> dungeon pillar (the same family used for beacon shrines)
const BUILDING_MODELS: Record<string, string> = {
	banner: "/assets/kenney/fantasy-town-kit/Models/GLB format/banner-green.glb",
	plot: "/assets/kenney/fantasy-town-kit/Models/GLB format/fence.glb",
	shop: "/assets/kenney/fantasy-town-kit/Models/GLB format/stall-green.glb",
	tower: "/assets/kenney/castle-kit/Models/GLB format/tower-square.glb",
	gate_anchor: "/assets/kaykit/dungeon/assets/gltf/pillar.gltf",
};

// Footprint per building, falling back to the plot size for any unknown string.
const BUILDING_SIZES: Record<string, number> = {
	banner: BANNER_SIZE_M,
	plot: PLOT_SIZE_M,
	shop: SHOP_SIZE_M,
	tower: TOWER_SIZE_M,
	gate_anchor: GATE_ANCHOR_SIZE_M,
};

function buildingTapEvent(hex: string): GameEvent {
	// Open-union UI signal. No reducer handles it today, so it is a safe no-op
	// that a later manage/demolish affordance can pick up.
	return { type: "BUILDING_TAP", hex };
}

// Collect a model spec for every player deed that has a building, culled to the
// view ring for consistency with the core provider (cheap, and keeps the scene
// graph bounded even if a future system ever bulk-stamps buildings).
export function collectEstateSpecs(state: GameState): WorldEntitySpec[] {
	const specs: WorldEntitySpec[] = [];
	const playerHex = state.position.hex;

	for (const deed of Object.values(state.deeds)) {
		const building = deed.building;
		if (!building) {
			continue;
		}
		const modelUrl = BUILDING_MODELS[building];
		if (!modelUrl) {
			continue;
		}
		try {
			if (hexDistance(playerHex, deed.hex) > HEX_VIEW_RING) {
				continue;
			}
		} catch {
			continue;
		}
		const { lat, lng } = hexCenter(deed.hex);
		specs.push({
			key: `building:${deed.hex}`,
			kind: "building",
			modelUrl,
			scaleM: BUILDING_SIZES[building] ?? PLOT_SIZE_M,
			lat,
			lng,
			event: buildingTapEvent(deed.hex),
		});
	}
	return specs;
}

registerSpecProvider(collectEstateSpecs);
