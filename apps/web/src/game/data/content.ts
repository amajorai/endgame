// Static tables for the content system: OSM-like tag -> GateTheme mapping,
// rank/tier weighting, and theme-flavoured naming. Pure data, no side effects.

import type { BeaconTier, GateTheme, Rank } from "@/game/types";

// A small catalogue of OSM-like "tags" the procedural generator deterministically
// assigns to a hex. Overpass enrichment maps real OSM tags onto the same themes.
export interface OsmTag {
	// Composite OSM key=value, e.g. "amenity=cafe".
	key: string;
	// Human label used when naming a gate ("Cafe Gate").
	label: string;
	theme: GateTheme;
}

// Deterministic pool the procedural generator draws from per hex. Ordered so the
// weighted index roll below favours common, mundane places.
export const OSM_TAG_POOL: readonly OsmTag[] = [
	{ key: "amenity=cafe", label: "Cafe", theme: "domestic" },
	{ key: "shop=convenience", label: "Corner Shop", theme: "domestic" },
	{ key: "amenity=restaurant", label: "Kitchen", theme: "domestic" },
	{ key: "leisure=park", label: "Park", theme: "nature" },
	{ key: "natural=wood", label: "Grove", theme: "nature" },
	{ key: "leisure=garden", label: "Garden", theme: "nature" },
	{ key: "amenity=library", label: "Library", theme: "knowledge" },
	{ key: "amenity=school", label: "Schoolyard", theme: "knowledge" },
	{ key: "amenity=university", label: "Lecture Hall", theme: "knowledge" },
	{ key: "leisure=fitness_centre", label: "Gym", theme: "trial" },
	{ key: "leisure=pitch", label: "Arena", theme: "trial" },
	{ key: "railway=station", label: "Station", theme: "transit" },
	{ key: "amenity=bus_station", label: "Terminal", theme: "transit" },
	{ key: "historic=monument", label: "Monument", theme: "relic" },
	{ key: "tourism=museum", label: "Gallery", theme: "relic" },
	{ key: "amenity=place_of_worship", label: "Shrine", theme: "sacred" },
	{ key: "amenity=hospital", label: "Ward", theme: "abyss" },
	{ key: "man_made=bridge", label: "Crossing", theme: "liminal" },
] as const;

// Maps an arbitrary real OSM tag string ("amenity=cafe") to a GateTheme. Used by
// the Overpass enrichment path. Falls back to "liminal" for unknown tags.
const OSM_KEY_TO_THEME: Record<string, GateTheme> = {
	"amenity=cafe": "domestic",
	"amenity=restaurant": "domestic",
	"amenity=fast_food": "domestic",
	"shop=convenience": "domestic",
	"shop=supermarket": "domestic",
	"leisure=park": "nature",
	"leisure=garden": "nature",
	"natural=wood": "nature",
	"natural=water": "nature",
	"amenity=library": "knowledge",
	"amenity=school": "knowledge",
	"amenity=university": "knowledge",
	"amenity=college": "knowledge",
	"leisure=fitness_centre": "trial",
	"leisure=sports_centre": "trial",
	"leisure=pitch": "trial",
	"railway=station": "transit",
	"railway=subway_entrance": "transit",
	"amenity=bus_station": "transit",
	"historic=monument": "relic",
	"historic=memorial": "relic",
	"tourism=museum": "relic",
	"amenity=place_of_worship": "sacred",
	"amenity=hospital": "abyss",
	"man_made=bridge": "liminal",
};

const DEFAULT_THEME: GateTheme = "liminal";

export function themeForOsmTag(key: string): GateTheme {
	return OSM_KEY_TO_THEME[key] ?? DEFAULT_THEME;
}

// Friendly label for an arbitrary OSM tag, used to name Overpass-sourced gates.
const OSM_KEY_TO_LABEL: Record<string, string> = {
	"amenity=cafe": "Cafe",
	"amenity=restaurant": "Kitchen",
	"amenity=fast_food": "Hawker",
	"shop=convenience": "Corner Shop",
	"shop=supermarket": "Market",
	"leisure=park": "Park",
	"leisure=garden": "Garden",
	"natural=wood": "Grove",
	"natural=water": "Pool",
	"amenity=library": "Library",
	"amenity=school": "Schoolyard",
	"amenity=university": "Lecture Hall",
	"amenity=college": "Lecture Hall",
	"leisure=fitness_centre": "Gym",
	"leisure=sports_centre": "Sports Hall",
	"leisure=pitch": "Arena",
	"railway=station": "Station",
	"railway=subway_entrance": "Underpass",
	"amenity=bus_station": "Terminal",
	"historic=monument": "Monument",
	"historic=memorial": "Memorial",
	"tourism=museum": "Gallery",
	"amenity=place_of_worship": "Shrine",
	"amenity=hospital": "Ward",
	"man_made=bridge": "Crossing",
};

const DEFAULT_LABEL = "Wayside";

export function labelForOsmTag(key: string): string {
	return OSM_KEY_TO_LABEL[key] ?? DEFAULT_LABEL;
}

// Display copy for each theme, used in the Explore panel.
export const THEME_META: Record<GateTheme, { glyph: string; blurb: string }> = {
	nature: { glyph: "🌿", blurb: "Overgrown wilds" },
	domestic: { glyph: "☕", blurb: "Everyday haunts" },
	knowledge: { glyph: "📚", blurb: "Halls of lore" },
	trial: { glyph: "⚔️", blurb: "Proving grounds" },
	transit: { glyph: "🚉", blurb: "Ways between" },
	relic: { glyph: "🏺", blurb: "Old powers" },
	sacred: { glyph: "⛩️", blurb: "Hallowed ground" },
	abyss: { glyph: "🕳️", blurb: "Deep dark" },
	liminal: { glyph: "🌫️", blurb: "Thresholds" },
};

// Rank weighting: heavily skewed toward low ranks. Index-aligned with RANKS.
// E and D dominate; S is a rare spike.
export const RANK_WEIGHTS: Record<Rank, number> = {
	E: 46,
	D: 28,
	C: 15,
	B: 7,
	A: 3,
	S: 1,
};

// Beacon tier weighting: mostly shrines, some caches, rare raid/vault.
export const BEACON_TIER_WEIGHTS: Record<BeaconTier, number> = {
	shrine: 62,
	cache: 26,
	raid: 9,
	vault: 3,
};

export const BEACON_TIER_META: Record<
	BeaconTier,
	{ glyph: string; blurb: string }
> = {
	shrine: { glyph: "🔆", blurb: "Spin for mana" },
	cache: { glyph: "📦", blurb: "Stashed materials" },
	raid: { glyph: "💥", blurb: "Group threat" },
	vault: { glyph: "🔐", blurb: "Sealed riches" },
};

// Probability a given un-generated hex hosts a gate / a beacon at all.
export const GATE_SPAWN_CHANCE = 0.32;
export const BEACON_SPAWN_CHANCE = 0.22;

// Picks a weighted key from a weight map using a roll in [0, 1). Deterministic
// given a deterministic roll. Returns the last key if rounding leaves remainder.
export function weightedPick<K extends string>(
	weights: Record<K, number>,
	roll: number
): K {
	const entries = Object.entries(weights) as [K, number][];
	let total = 0;
	for (const [, weight] of entries) {
		total += weight;
	}
	let cursor = roll * total;
	for (const [key, weight] of entries) {
		cursor -= weight;
		if (cursor < 0) {
			return key;
		}
	}
	const last = entries.at(-1);
	if (!last) {
		throw new Error("weightedPick called with empty weight map");
	}
	return last[0];
}
