// Crafting recipes for the inventory system. Pure data, no logic.
// Recipes refine harvested materials (state.resources.materials) and/or other
// inventory items into potions, equipment, and trade goods.

export type ItemKind = "material" | "potion" | "equipment" | "cosmetic";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

// A single ingredient cost. `source` decides where the quantity is drawn from:
// "material" pulls from state.resources.materials[key]; "item" pulls from
// state.inventory.items[key].qty.
export interface RecipeCost {
	key: string;
	qty: number;
	source: "material" | "item";
}

// The item produced by a recipe. Mirrors InventoryItem minus the live qty/id.
export interface RecipeOutput {
	id: string; // stable inventory item id; quantities stack on this id
	kind: ItemKind;
	name: string;
	qty: number;
	rarity: Rarity;
}

export interface Recipe {
	costs: RecipeCost[];
	description: string;
	id: string;
	name: string;
	output: RecipeOutput;
}

// Effects applied when a potion item is used out of combat. All optional; a
// potion may restore several pools at once. Values are flat amounts.
export interface PotionEffect {
	combatMana?: number;
	hp?: number;
	stamina?: number;
}

// Out-of-combat use effects keyed by the produced item id. Items not present
// here are inert when used (e.g. equipment, cosmetics, raw trade goods).
export const POTION_EFFECTS: Record<string, PotionEffect> = {
	potion_minor_heal: { hp: 40 },
	potion_major_heal: { hp: 120 },
	potion_stamina: { stamina: 60 },
	potion_mana_draught: { combatMana: 35 },
	potion_panacea: { hp: 80, stamina: 80, combatMana: 80 },
};

// Equipment stat bonuses keyed by produced item id. Read by the panel for
// display; stat application is left to the player/progression system, so the
// inventory reducer only tracks the equipped id.
export const EQUIPMENT_BONUS: Record<string, string> = {
	gear_iron_blade: "+4 STR",
	gear_scout_boots: "+4 AGI",
	gear_ward_charm: "+4 VIT",
};

// Rarity ordering used for color/value comparisons in the panel.
export const RARITY_ORDER: Rarity[] = [
	"common",
	"uncommon",
	"rare",
	"epic",
	"legendary",
];

// Tailwind text colors per rarity, Solo-Leveling palette.
export const RARITY_COLOR: Record<string, string> = {
	common: "text-slate-300",
	uncommon: "text-emerald-300",
	rare: "text-cyan-300",
	epic: "text-fuchsia-300",
	legendary: "text-amber-300",
};

// Border accent per rarity for item tiles.
export const RARITY_BORDER: Record<string, string> = {
	common: "border-slate-500/40",
	uncommon: "border-emerald-400/40",
	rare: "border-cyan-400/40",
	epic: "border-fuchsia-400/40",
	legendary: "border-amber-400/40",
};

// The recipe book. Costs reference harvested materials by their material key.
// Material keys here are the canonical harvested-resource names other systems
// deposit into state.resources.materials (herb, ore, essence, cloth, crystal).
export const RECIPES: Recipe[] = [
	{
		id: "recipe_minor_heal",
		name: "Minor Healing Potion",
		description: "Refine herbs into a quick out-of-combat heal.",
		costs: [{ key: "herb", qty: 2, source: "material" }],
		output: {
			id: "potion_minor_heal",
			kind: "potion",
			name: "Minor Healing Potion",
			qty: 1,
			rarity: "common",
		},
	},
	{
		id: "recipe_major_heal",
		name: "Major Healing Potion",
		description: "Concentrate herbs and essence for a deep heal.",
		costs: [
			{ key: "herb", qty: 4, source: "material" },
			{ key: "essence", qty: 1, source: "material" },
		],
		output: {
			id: "potion_major_heal",
			kind: "potion",
			name: "Major Healing Potion",
			qty: 1,
			rarity: "uncommon",
		},
	},
	{
		id: "recipe_stamina",
		name: "Stamina Tonic",
		description: "Brew cloth fibres into a stamina restorative.",
		costs: [{ key: "cloth", qty: 3, source: "material" }],
		output: {
			id: "potion_stamina",
			kind: "potion",
			name: "Stamina Tonic",
			qty: 1,
			rarity: "common",
		},
	},
	{
		id: "recipe_mana_draught",
		name: "Mana Draught",
		description: "Distil crystal dust into combat mana.",
		costs: [{ key: "crystal", qty: 2, source: "material" }],
		output: {
			id: "potion_mana_draught",
			kind: "potion",
			name: "Mana Draught",
			qty: 1,
			rarity: "uncommon",
		},
	},
	{
		id: "recipe_panacea",
		name: "Panacea",
		description: "A legendary brew that mends body, wind, and will.",
		costs: [
			{ key: "herb", qty: 6, source: "material" },
			{ key: "essence", qty: 3, source: "material" },
			{ key: "crystal", qty: 3, source: "material" },
		],
		output: {
			id: "potion_panacea",
			kind: "potion",
			name: "Panacea",
			qty: 1,
			rarity: "epic",
		},
	},
	{
		id: "recipe_iron_blade",
		name: "Iron Blade",
		description: "Forge ore into a striker's blade. +4 STR.",
		costs: [
			{ key: "ore", qty: 5, source: "material" },
			{ key: "essence", qty: 1, source: "material" },
		],
		output: {
			id: "gear_iron_blade",
			kind: "equipment",
			name: "Iron Blade",
			qty: 1,
			rarity: "rare",
		},
	},
	{
		id: "recipe_scout_boots",
		name: "Scout Boots",
		description: "Stitch cloth and ore into swift boots. +4 AGI.",
		costs: [
			{ key: "cloth", qty: 4, source: "material" },
			{ key: "ore", qty: 2, source: "material" },
		],
		output: {
			id: "gear_scout_boots",
			kind: "equipment",
			name: "Scout Boots",
			qty: 1,
			rarity: "rare",
		},
	},
	{
		id: "recipe_ward_charm",
		name: "Ward Charm",
		description: "Bind crystal and essence into a warding charm. +4 VIT.",
		costs: [
			{ key: "crystal", qty: 3, source: "material" },
			{ key: "essence", qty: 2, source: "material" },
		],
		output: {
			id: "gear_ward_charm",
			kind: "equipment",
			name: "Ward Charm",
			qty: 1,
			rarity: "epic",
		},
	},
	{
		id: "recipe_trade_bundle",
		name: "Trade Bundle",
		description: "Bale raw materials into a sellable trade good.",
		costs: [
			{ key: "ore", qty: 3, source: "material" },
			{ key: "cloth", qty: 3, source: "material" },
		],
		output: {
			id: "trade_bundle",
			kind: "material",
			name: "Trade Bundle",
			qty: 1,
			rarity: "common",
		},
	},
];

// Fast lookup by recipe id.
export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(
	RECIPES.map((recipe) => [recipe.id, recipe])
);
