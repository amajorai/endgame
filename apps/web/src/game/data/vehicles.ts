import type { VehicleKind } from "@/game/types";

// Static catalog describing each vehicle kind. Ghost-mode movement uses the
// speed multiplier to convert a real-world step budget into projected reach,
// and the budget cost to drain the ghost time allowance per use.
export interface VehicleSpec {
	// Seconds of ghost budget consumed when this vehicle is engaged.
	budgetCostSeconds: number;
	// Short blurb shown in the panel.
	description: string;
	// Emoji glyph for the panel list.
	glyph: string;
	kind: VehicleKind;
	// Human label.
	label: string;
	// Movement speed multiplier relative to walking.
	speedMultiplier: number;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
	walk: {
		kind: "walk",
		label: "On Foot",
		glyph: "🚶",
		speedMultiplier: 1,
		budgetCostSeconds: 0,
		description: "Free roaming. Costs no ghost budget.",
	},
	bicycle: {
		kind: "bicycle",
		label: "Bicycle",
		glyph: "🚲",
		speedMultiplier: 3,
		budgetCostSeconds: 30,
		description: "Triple reach. Light on the budget.",
	},
	car: {
		kind: "car",
		label: "Car",
		glyph: "🚗",
		speedMultiplier: 8,
		budgetCostSeconds: 90,
		description: "Cover ground fast on any road.",
	},
	train: {
		kind: "train",
		label: "Train",
		glyph: "🚆",
		speedMultiplier: 20,
		budgetCostSeconds: 180,
		description: "Long hauls between distant districts.",
	},
	boat: {
		kind: "boat",
		label: "Boat",
		glyph: "⛵",
		speedMultiplier: 12,
		budgetCostSeconds: 150,
		description: "Cross water the legs cannot.",
	},
	helicopter: {
		kind: "helicopter",
		label: "Helicopter",
		glyph: "🚁",
		speedMultiplier: 30,
		budgetCostSeconds: 300,
		description: "Ignore terrain. Heavy budget cost.",
	},
	plane: {
		kind: "plane",
		label: "Plane",
		glyph: "✈️",
		speedMultiplier: 60,
		budgetCostSeconds: 420,
		description: "Continental leaps. The deepest drain.",
	},
};

// Ordered list for stable rendering in the panel.
export const VEHICLE_ORDER: VehicleKind[] = [
	"walk",
	"bicycle",
	"car",
	"train",
	"boat",
	"helicopter",
	"plane",
];
