// Farming content tables. Pure data: crop definitions, biome derivation inputs,
// and the Gate-gated growth rules (design Gap-3). No game-state logic here.

import type { HexClass } from "@/game/types";

export type CropYieldKind = "material" | "potion";

export interface CropDef {
	// Biomes in which this crop may be planted at all.
	biomes: string[];
	// Gap-3 Gate-gating: when set, the crop only ADVANCES growth while the plot
	// sits on a hex whose derived poi type matches one of these. Empty => always.
	gatePoiTypes: string[];
	glyph: string;
	// Real-time growth duration at base speed (no shadow), in milliseconds.
	growthMs: number;
	// Stable crop id used in events and Plot.crop.
	id: string;
	// Display name with a leading glyph for the panel.
	name: string;
	// Mana cost to plant a seed of this crop.
	plantCost: number;
	// For materials: the material key in resources.materials.
	// For potions: the inventory item id/name produced.
	yieldId: string;
	// What a single harvest produces.
	yieldKind: CropYieldKind;
	yieldName: string;
	// Units produced per harvest at base. Shadow assignment can boost this.
	yieldQty: number;
	yieldRarity: string;
}

const MINUTE_MS = 60_000;

// The biome assigned to a plot is derived deterministically from the deed it is
// built on: its hex class plus any POI tag. Kept here so the reducer and panel
// agree on the mapping.
export function biomeForDeed(
	hexClass: HexClass,
	poiName: string | undefined,
	poiType: string | undefined
): string {
	const tag = (poiType ?? poiName ?? "").toLowerCase();
	if (tag.includes("water") || tag.includes("river") || tag.includes("coast")) {
		return "wetland";
	}
	if (
		tag.includes("park") ||
		tag.includes("forest") ||
		tag.includes("garden")
	) {
		return "grove";
	}
	if (hexClass === "sanctum") {
		return "ley_field";
	}
	if (hexClass === "control_point") {
		return "terrace";
	}
	return "meadow";
}

// Human-facing biome labels for the panel.
export const BIOME_LABELS: Record<string, string> = {
	meadow: "🌾 Meadow",
	terrace: "🪜 Terrace",
	ley_field: "✨ Ley Field",
	grove: "🌳 Grove",
	wetland: "💧 Wetland",
};

// All plantable crops. Ordered roughly by tier.
export const CROPS: CropDef[] = [
	{
		id: "manaroot",
		name: "Manaroot",
		glyph: "🌱",
		growthMs: 5 * MINUTE_MS,
		plantCost: 5,
		yieldKind: "material",
		yieldId: "manaroot",
		yieldName: "Manaroot",
		yieldRarity: "common",
		yieldQty: 3,
		biomes: ["meadow", "terrace", "grove", "ley_field", "wetland"],
		gatePoiTypes: [],
	},
	{
		id: "sunwheat",
		name: "Sunwheat",
		glyph: "🌾",
		growthMs: 10 * MINUTE_MS,
		plantCost: 8,
		yieldKind: "material",
		yieldId: "sunwheat",
		yieldName: "Sunwheat",
		yieldRarity: "common",
		yieldQty: 5,
		biomes: ["meadow", "terrace"],
		gatePoiTypes: [],
	},
	{
		id: "tidekelp",
		name: "Tidekelp",
		glyph: "🌿",
		growthMs: 12 * MINUTE_MS,
		plantCost: 10,
		yieldKind: "material",
		yieldId: "tidekelp",
		yieldName: "Tidekelp",
		yieldRarity: "uncommon",
		yieldQty: 4,
		biomes: ["wetland", "grove"],
		// Gap-3: only matures while sitting on a water-type POI hex.
		gatePoiTypes: ["water", "river", "coast"],
	},
	{
		id: "emberbloom",
		name: "Emberbloom",
		glyph: "🌺",
		growthMs: 15 * MINUTE_MS,
		plantCost: 14,
		yieldKind: "potion",
		yieldId: "potion_health",
		yieldName: "Health Potion",
		yieldRarity: "uncommon",
		yieldQty: 1,
		biomes: ["meadow", "terrace", "ley_field"],
		gatePoiTypes: [],
	},
	{
		id: "starpetal",
		name: "Starpetal",
		glyph: "🌟",
		growthMs: 25 * MINUTE_MS,
		plantCost: 22,
		yieldKind: "potion",
		yieldId: "potion_mana",
		yieldName: "Mana Potion",
		yieldRarity: "rare",
		yieldQty: 1,
		biomes: ["ley_field", "grove"],
		// Gap-3: only matures while sitting on a park/forest/garden POI hex.
		gatePoiTypes: ["park", "forest", "garden"],
	},
];

export function cropById(id: string | undefined): CropDef | undefined {
	if (!id) {
		return;
	}
	return CROPS.find((crop) => crop.id === id);
}

// Crops that can be planted in a given biome (ignores Gate-gating).
export function cropsForBiome(biome: string): CropDef[] {
	return CROPS.filter((crop) => crop.biomes.includes(biome));
}

// Does a derived poi tag satisfy a crop's Gate-gating requirement?
export function poiMatchesGate(
	gatePoiTypes: string[],
	poiName: string | undefined,
	poiType: string | undefined
): boolean {
	if (gatePoiTypes.length === 0) {
		return true;
	}
	const tag = (poiType ?? poiName ?? "").toLowerCase();
	if (tag.length === 0) {
		return false;
	}
	return gatePoiTypes.some((needle) => tag.includes(needle));
}

// Crops actually plantable on a specific plot: biome must allow it AND, for
// Gate-gated crops (Gap-3), the plot's own POI tag must match. This makes the
// gate a build-location decision; once planted, growth is pure time-based and
// therefore correct online and offline with no tick ordering dependency.
export function cropsForPlot(
	biome: string,
	poiName: string | undefined,
	poiType: string | undefined
): CropDef[] {
	return cropsForBiome(biome).filter((crop) =>
		poiMatchesGate(crop.gatePoiTypes, poiName, poiType)
	);
}
