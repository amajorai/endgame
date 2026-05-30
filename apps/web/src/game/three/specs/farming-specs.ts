// Farming spec provider (wave 2). Maps every Plot in GameState to in-world 3D
// entities the EntityRenderer draws on the live map:
//   - a flat tilled-ground tile under each plot (groundTileUrl), and
//   - for a planted plot, a crop model whose model + scale reflect the current
//     growth stage (sprout -> growing -> mature), so growth is visible over time.
//
// Tapping a GROWN crop dispatches { type: "PLOT_HARVEST", hex }. Tapping any
// other plot (empty or still-growing) dispatches { type: "PLOT_TAP", hex } - an
// open-union UI signal the reducer ignores. Because the renderer's pick() only
// DISPATCHES the spec's event and we cannot edit central files, this module also
// exports a tiny `plotSelection` singleton plus `handlePlotTapEvent` so the
// integration agent can route PLOT_TAP into the selection that drives the plant
// prompt overlay.
//
// ===========================================================================
// INTEGRATION CONTRACT (one line for the integration agent)
// ---------------------------------------------------------------------------
// The renderer dispatches a spec's `event` on tap. Add ONE line where dispatch
// is centralised (e.g. the store's dispatch wrapper or the play-client pick
// handler) so PLOT_TAP opens the prompt:
//
//     import { handlePlotTapEvent } from "@/game/three/specs/farming-specs";
//     // ...wherever a GameEvent is dispatched/observed:
//     handlePlotTapEvent(event);
//
// handlePlotTapEvent is a no-op for every non-PLOT_TAP event, so it is safe to
// call unconditionally on every dispatched event. It updates `plotSelection`,
// which <PlantPrompt /> subscribes to. (PLOT_HARVEST/PLOT_PLANT remain real
// reducer events and need no wiring here.)
// ===========================================================================

import { hexCenter } from "@/game/lib/hex";
import { growthFraction, isGrown } from "@/game/systems/farming";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameEvent, GameState, Plot } from "@/game/types";

// ---------------------------------------------------------------------------
// Asset paths. Raw spaces in "GLB format" are intentional and match the
// existing core specs (e.g. GATE_MODEL); the loader handles them unencoded.
// ---------------------------------------------------------------------------

// Flat hex tile laid under every plot to read as tilled ground.
const PLOT_GROUND_TILE =
	"/assets/kaykit/medieval_hexagon/assets/gltf/tiles/base/hex_grass.gltf";

// Generic staged plant models (sprout -> growing) used for crops that lack a
// themed early-stage prop. trees_A_small/medium give a clear size progression.
const SPROUT_MODEL =
	"/assets/kaykit/medieval_hexagon/assets/gltf/decoration/nature/trees_A_small.gltf";
const GROWING_MODEL =
	"/assets/kaykit/medieval_hexagon/assets/gltf/decoration/nature/trees_A_medium.gltf";
// Themed early stage for wetland crops (kelp grown in water-type hexes).
const SPROUT_MODEL_WATER =
	"/assets/kaykit/medieval_hexagon/assets/gltf/decoration/nature/waterplant_A.gltf";
const GROWING_MODEL_WATER =
	"/assets/kaykit/medieval_hexagon/assets/gltf/decoration/nature/waterplant_B.gltf";

const FOOD_KIT = "/assets/kenney/food-kit/Models/GLB format";

// Mature model per crop id (food-kit veggies). Fallback handles unknown ids.
const MATURE_MODEL_BY_CROP: Record<string, string> = {
	manaroot: `${FOOD_KIT}/carrot.glb`,
	sunwheat: `${FOOD_KIT}/corn.glb`,
	tidekelp: `${FOOD_KIT}/leek.glb`,
	emberbloom: `${FOOD_KIT}/eggplant.glb`,
	starpetal: `${FOOD_KIT}/broccoli.glb`,
};
const MATURE_MODEL_FALLBACK = `${FOOD_KIT}/cabbage.glb`;

// ---------------------------------------------------------------------------
// Growth staging. Fraction is growthFraction(plot, now) in [0, 1].
// ---------------------------------------------------------------------------

type GrowthStage = "sprout" | "growing" | "mature";

// Stage boundaries on the growth fraction. Mature is reached only at full
// growth (handled via isGrown so it matches the reducer's harvest gate exactly).
const GROWING_THRESHOLD = 0.34;

// On-map crop footprint (metres) per stage, so the plant visibly grows.
const SPROUT_SIZE_M = 2;
const GROWING_SIZE_M = 4;
const MATURE_SIZE_M = 6;

const SIZE_BY_STAGE: Record<GrowthStage, number> = {
	sprout: SPROUT_SIZE_M,
	growing: GROWING_SIZE_M,
	mature: MATURE_SIZE_M,
};

// On-map footprint (metres) for the flat plot tile. The hex_grass model is a
// low-profile hexagon, so normalised to this footprint it reads as flat ground.
const PLOT_TILE_SIZE_M = 8;

const WETLAND_BIOME = "wetland";

function stageFor(plot: Plot, now: number): GrowthStage {
	if (isGrown(plot, now)) {
		return "mature";
	}
	return growthFraction(plot, now) < GROWING_THRESHOLD ? "sprout" : "growing";
}

function cropModelFor(plot: Plot, stage: GrowthStage): string {
	if (stage === "mature") {
		const cropId = plot.crop ?? "";
		return MATURE_MODEL_BY_CROP[cropId] ?? MATURE_MODEL_FALLBACK;
	}
	const isWater = plot.biome === WETLAND_BIOME;
	if (stage === "sprout") {
		return isWater ? SPROUT_MODEL_WATER : SPROUT_MODEL;
	}
	return isWater ? GROWING_MODEL_WATER : GROWING_MODEL;
}

// ---------------------------------------------------------------------------
// Plot selection singleton. The renderer's pick() only dispatches a spec's
// event, so a PLOT_TAP is surfaced to the prompt through this module-level
// store. handlePlotTapEvent (wired once by the integration agent) calls
// select(); <PlantPrompt /> subscribes to render the contextual overlay.
// ---------------------------------------------------------------------------

type PlotSelectionListener = (hex: string | null) => void;

let selectedPlotHex: string | null = null;
const selectionListeners = new Set<PlotSelectionListener>();

function notifySelection(): void {
	for (const listener of selectionListeners) {
		listener(selectedPlotHex);
	}
}

export const plotSelection = {
	clear(): void {
		if (selectedPlotHex === null) {
			return;
		}
		selectedPlotHex = null;
		notifySelection();
	},
	get(): string | null {
		return selectedPlotHex;
	},
	select(hex: string): void {
		if (selectedPlotHex === hex) {
			return;
		}
		selectedPlotHex = hex;
		notifySelection();
	},
	subscribe(listener: PlotSelectionListener): () => void {
		selectionListeners.add(listener);
		return () => {
			selectionListeners.delete(listener);
		};
	},
};

// Route a dispatched event into the plot selection. Safe to call on EVERY
// dispatched event: it ignores anything that is not a PLOT_TAP with a string
// hex. This is the single hook the integration agent wires in (see the
// INTEGRATION CONTRACT header above).
export function handlePlotTapEvent(event: GameEvent): void {
	if (event.type !== "PLOT_TAP") {
		return;
	}
	const { hex } = event as { hex?: unknown };
	if (typeof hex === "string") {
		plotSelection.select(hex);
	}
}

// ---------------------------------------------------------------------------
// Spec provider
// ---------------------------------------------------------------------------

function plotSpec(plot: Plot, lat: number, lng: number): WorldEntitySpec {
	// Flat tilled-ground tile under the plot. An EMPTY plot's tile opens the
	// plant prompt on tap. A PLANTED plot's tile is decorative (no event) so the
	// crop model - emitted at the same hex center - owns the tap (harvest when
	// grown, prompt while growing); otherwise pick()'s strict-< tie-break would
	// let this tile, inserted first, shadow the crop's event.
	return {
		key: `plot:${plot.hex}`,
		kind: "plot",
		modelUrl: PLOT_GROUND_TILE,
		scaleM: PLOT_TILE_SIZE_M,
		lat,
		lng,
		event: plot.crop ? undefined : { type: "PLOT_TAP", hex: plot.hex },
	};
}

function cropSpec(
	plot: Plot,
	lat: number,
	lng: number,
	now: number
): WorldEntitySpec {
	const stage = stageFor(plot, now);
	// Stage is encoded in the key so a stage change forces the renderer to swap
	// the model (remove old, add new) - that is how growth becomes visible.
	const event: GameEvent =
		stage === "mature"
			? { type: "PLOT_HARVEST", hex: plot.hex }
			: { type: "PLOT_TAP", hex: plot.hex };
	return {
		key: `crop:${plot.hex}:${stage}`,
		kind: "crop",
		modelUrl: cropModelFor(plot, stage),
		scaleM: SIZE_BY_STAGE[stage],
		lat,
		lng,
		event,
	};
}

export function collectFarmingSpecs(state: GameState): WorldEntitySpec[] {
	const specs: WorldEntitySpec[] = [];
	const now = state.lastTick;
	for (const plot of Object.values(state.plots)) {
		const { lat, lng } = hexCenter(plot.hex);
		specs.push(plotSpec(plot, lat, lng));
		if (plot.crop) {
			specs.push(cropSpec(plot, lat, lng, now));
		}
	}
	return specs;
}

// Side-effect registration: importing this module wires farming entities into
// the renderer's spec registry. Idempotent per function identity.
registerSpecProvider(collectFarmingSpecs);
