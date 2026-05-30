// Farming system. Owns plot building, planting, growth (real-time, offline-safe,
// Gate-gated per design Gap-3), shadow-assisted growth, and harvesting into the
// inventory / materials. Pure SystemReducer; returns new state objects only.

import {
	biomeForDeed,
	type CropDef,
	cropById,
	poiMatchesGate,
} from "@/game/data/farming";
// poiMatchesGate enforces Gate-gating (Gap-3) at PLANT time.
import { hexClassFor } from "@/game/lib/hex";
import type {
	Deed,
	GameEvent,
	GameState,
	InventoryItem,
	Plot,
	Shadow,
	SystemReducer,
} from "@/game/types";

// Mana cost to build (clear and till) a plot on an owned hex.
export const PLOT_BUILD_COST = 25;

// A shadow assigned to a plot multiplies growth speed by this factor.
export const SHADOW_GROWTH_MULTIPLIER = 2;

// A shadow assigned to a plot adds this many bonus yield units at harvest.
const SHADOW_BONUS_YIELD = 1;

const FULL_CAPTURE = 100;
const GROWTH_COMPLETE = 1;
const GROWTH_START = 0;

// ---------------------------------------------------------------------------
// Local event union + guard. The GameEvent union is open, so "event.type === X"
// does NOT narrow payload fields. Narrow through this guard first.
// ---------------------------------------------------------------------------

type FarmEvent =
	| { type: "PLOT_BUILD"; hex: string }
	| { type: "PLOT_PLANT"; hex: string; crop: string }
	| { type: "PLOT_HARVEST"; hex: string }
	| { type: "PLOT_ASSIGN_SHADOW"; hex: string; shadowId: string }
	| { type: "TICK"; now: number };

const FARM_EVENT_TYPES: Set<string> = new Set([
	"PLOT_BUILD",
	"PLOT_PLANT",
	"PLOT_HARVEST",
	"PLOT_ASSIGN_SHADOW",
	"TICK",
]);

function isFarmEvent(event: GameEvent): event is FarmEvent {
	return FARM_EVENT_TYPES.has(event.type);
}

// ---------------------------------------------------------------------------
// Growth math. Progress is a pure function of the frozen Plot shape:
//   growthMs  -> effective total duration (base / shadow speed) to maturity.
//   plantedAt -> epoch-ms anchor; fraction = (now - plantedAt) / growthMs.
// Because it is pure time-based, growth advances correctly while the app is
// open AND across offline gaps, with no dependency on tick ordering. Gate-gating
// (Gap-3) is enforced once, at PLANT time, by restricting where a gated crop may
// be planted (see handlePlant), so no per-tick freezing is needed.
// ---------------------------------------------------------------------------

export function growthFraction(plot: Plot, now: number): number {
	if (!(plot.crop && plot.plantedAt && plot.growthMs) || plot.growthMs <= 0) {
		return GROWTH_START;
	}
	const elapsed = now - plot.plantedAt;
	if (elapsed <= 0) {
		return GROWTH_START;
	}
	return Math.min(GROWTH_COMPLETE, elapsed / plot.growthMs);
}

export function isGrown(plot: Plot, now: number): boolean {
	return Boolean(plot.crop) && growthFraction(plot, now) >= GROWTH_COMPLETE;
}

function effectiveGrowthMs(crop: CropDef, hasShadow: boolean): number {
	return hasShadow ? crop.growthMs / SHADOW_GROWTH_MULTIPLIER : crop.growthMs;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOwnedHex(state: GameState, hex: string): boolean {
	const deed: Deed | undefined = state.deeds[hex];
	return Boolean(
		deed && deed.owner === "player" && deed.capturePct >= FULL_CAPTURE
	);
}

function deedBiome(state: GameState, hex: string): string {
	const deed = state.deeds[hex];
	const hexClass = deed?.hexClass ?? hexClassFor(hex);
	return biomeForDeed(hexClass, deed?.poiName, deedPoiType(deed));
}

// The journal records a poiType per visited hex; fall back to the deed name.
function deedPoiType(deed: Deed | undefined): string | undefined {
	return deed?.poiName;
}

function shadowById(state: GameState, id: string): Shadow | undefined {
	return state.shadows.find((shadow) => shadow.id === id);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleBuild(state: GameState, hex: string): GameState {
	if (state.plots[hex] || !isOwnedHex(state, hex)) {
		return state;
	}
	if (state.resources.mana < PLOT_BUILD_COST) {
		return state;
	}
	const plot: Plot = { hex, biome: deedBiome(state, hex) };
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana - PLOT_BUILD_COST,
		},
		plots: { ...state.plots, [hex]: plot },
	};
}

function handlePlant(state: GameState, hex: string, cropId: string): GameState {
	const plot = state.plots[hex];
	if (!plot || plot.crop) {
		return state;
	}
	const crop = cropById(cropId);
	if (!crop?.biomes.includes(plot.biome)) {
		return state;
	}
	// Gap-3: Gate-gated crops may only be planted on a plot whose hex POI matches.
	// Growth is then pure time-based, so it is correct online AND offline.
	const deed = state.deeds[hex];
	if (!poiMatchesGate(crop.gatePoiTypes, deed?.poiName, deedPoiType(deed))) {
		return state;
	}
	if (state.resources.mana < crop.plantCost) {
		return state;
	}
	const hasShadow = Boolean(plot.assignedShadow);
	const planted: Plot = {
		...plot,
		crop: crop.id,
		plantedAt: state.lastTick,
		growthMs: effectiveGrowthMs(crop, hasShadow),
	};
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana - crop.plantCost,
		},
		plots: { ...state.plots, [hex]: planted },
	};
}

function addMaterial(
	state: GameState,
	key: string,
	qty: number
): GameState["resources"]["materials"] {
	const current = state.resources.materials[key] ?? 0;
	return { ...state.resources.materials, [key]: current + qty };
}

function addInventory(
	state: GameState,
	crop: CropDef,
	qty: number
): Record<string, InventoryItem> {
	const existing = state.inventory.items[crop.yieldId];
	const item: InventoryItem = existing
		? { ...existing, qty: existing.qty + qty }
		: {
				id: crop.yieldId,
				name: crop.yieldName,
				kind: "potion",
				qty,
				rarity: crop.yieldRarity,
			};
	return { ...state.inventory.items, [crop.yieldId]: item };
}

function handleHarvest(state: GameState, hex: string): GameState {
	const plot = state.plots[hex];
	if (!(plot?.crop && isGrown(plot, state.lastTick))) {
		return state;
	}
	const crop = cropById(plot.crop);
	if (!crop) {
		return state;
	}
	const bonus = plot.assignedShadow ? SHADOW_BONUS_YIELD : 0;
	const qty = crop.yieldQty + bonus;

	// Clear the crop but keep the plot (and any assigned shadow) for replanting.
	const cleared: Plot = {
		hex: plot.hex,
		biome: plot.biome,
		assignedShadow: plot.assignedShadow,
	};
	const plots = { ...state.plots, [hex]: cleared };

	if (crop.yieldKind === "material") {
		return {
			...state,
			plots,
			resources: {
				...state.resources,
				materials: addMaterial(state, crop.yieldId, qty),
			},
		};
	}
	return {
		...state,
		plots,
		inventory: { items: addInventory(state, crop, qty) },
	};
}

function handleAssignShadow(
	state: GameState,
	hex: string,
	shadowId: string
): GameState {
	const plot = state.plots[hex];
	if (!plot) {
		return state;
	}
	const shadow = shadowById(state, shadowId);
	if (!shadow) {
		return state;
	}

	// Reassigning the same shadow is a no-op.
	if (plot.assignedShadow === shadowId) {
		return state;
	}

	// Update the plot's assignment and rescale any in-progress growth so the
	// already-completed fraction is preserved at the new (faster) rate.
	let nextPlot: Plot = { ...plot, assignedShadow: shadowId };
	const crop = cropById(plot.crop);
	if (crop && plot.plantedAt && plot.growthMs) {
		const fraction = growthFraction(plot, state.lastTick);
		const nextTotal = effectiveGrowthMs(crop, true);
		const newElapsed = nextTotal * fraction;
		nextPlot = {
			...nextPlot,
			growthMs: nextTotal,
			plantedAt: state.lastTick - newElapsed,
		};
	}

	// Detach the shadow from any other plot it was assigned to, and stamp its
	// own assignedHex so other systems see it occupied.
	const plots: Record<string, Plot> = {};
	for (const [key, existing] of Object.entries(state.plots)) {
		if (key !== hex && existing.assignedShadow === shadowId) {
			plots[key] = { ...existing, assignedShadow: undefined };
		} else {
			plots[key] = existing;
		}
	}
	plots[hex] = nextPlot;

	const shadows = state.shadows.map((s) =>
		s.id === shadowId ? { ...s, assignedHex: hex } : s
	);

	return { ...state, plots, shadows };
}

export const farmingReducer: SystemReducer = (state, event) => {
	if (!isFarmEvent(event)) {
		return state;
	}
	switch (event.type) {
		case "PLOT_BUILD":
			return handleBuild(state, event.hex);
		case "PLOT_PLANT":
			return handlePlant(state, event.hex, event.crop);
		case "PLOT_HARVEST":
			return handleHarvest(state, event.hex);
		case "PLOT_ASSIGN_SHADOW":
			return handleAssignShadow(state, event.hex, event.shadowId);
		case "TICK":
			// Growth is pure time-based (read at render/harvest), so no per-tick
			// work is required. Handled here to satisfy the spine contract.
			return state;
		default:
			return state;
	}
};
