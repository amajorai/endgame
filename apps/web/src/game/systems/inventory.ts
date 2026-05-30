import {
	POTION_EFFECTS,
	RECIPE_BY_ID,
	type RecipeCost,
} from "@/game/data/recipes";
import type { GameEvent, GameState, InventoryItem } from "@/game/types";

// Reserved inventory id that persists which equipment item is currently
// equipped. Its `name` holds the equipped item's id (empty string = nothing).
// The panel filters this id out of the visible grid. This keeps equip state on
// GameState without editing the frozen InventoryItem shape.
export const EQUIPPED_MARKER_ID = "__equipped__";

// ---------------------------------------------------------------------------
// Local discriminated union of THIS system's events plus a type guard. The
// GameEvent union is open, so `event.type === 'X'` does not narrow payloads.
// ---------------------------------------------------------------------------
type InventoryEvent =
	| { type: "ITEM_USE"; id: string }
	| { type: "ITEM_CRAFT"; recipeId: string }
	| { type: "ITEM_EQUIP"; id: string }
	| { type: "ITEM_DROP"; id: string };

const INVENTORY_TYPES: Set<string> = new Set([
	"ITEM_USE",
	"ITEM_CRAFT",
	"ITEM_EQUIP",
	"ITEM_DROP",
]);

const isInventoryEvent = (event: GameEvent): event is InventoryEvent =>
	INVENTORY_TYPES.has(event.type);

// Reads the id of the currently equipped item from the reserved marker.
export function equippedItemId(state: GameState): string | null {
	const marker = state.inventory.items[EQUIPPED_MARKER_ID];
	const id = marker?.name ?? "";
	return id.length > 0 ? id : null;
}

// Returns how many of a cost an inventory currently holds, from the right pool.
function ownedFor(state: GameState, cost: RecipeCost): number {
	if (cost.source === "material") {
		return state.resources.materials[cost.key] ?? 0;
	}
	return state.inventory.items[cost.key]?.qty ?? 0;
}

// True when every ingredient of the recipe is affordable.
export function canCraft(state: GameState, recipeId: string): boolean {
	const recipe = RECIPE_BY_ID[recipeId];
	if (!recipe) {
		return false;
	}
	for (const cost of recipe.costs) {
		if (ownedFor(state, cost) < cost.qty) {
			return false;
		}
	}
	return true;
}

// Clamps a pool value upward to a max, never above it.
const restore = (current: number, amount: number, max: number): number =>
	Math.min(max, current + amount);

function applyPotion(state: GameState, item: InventoryItem): GameState {
	const effect = POTION_EFFECTS[item.id];
	if (!effect) {
		return state;
	}
	const player = state.player;
	const nextPlayer = {
		...player,
		hp: effect.hp ? restore(player.hp, effect.hp, player.maxHp) : player.hp,
		stamina: effect.stamina
			? restore(player.stamina, effect.stamina, player.maxStamina)
			: player.stamina,
		combatMana: effect.combatMana
			? restore(player.combatMana, effect.combatMana, player.maxCombatMana)
			: player.combatMana,
	};
	return { ...state, player: nextPlayer };
}

// Removes one unit of an item by id, deleting the entry when it hits zero.
function decrementItem(
	items: Record<string, InventoryItem>,
	id: string
): Record<string, InventoryItem> {
	const existing = items[id];
	if (!existing) {
		return items;
	}
	const nextQty = existing.qty - 1;
	const next = { ...items };
	if (nextQty <= 0) {
		delete next[id];
		return next;
	}
	next[id] = { ...existing, qty: nextQty };
	return next;
}

function handleUse(state: GameState, id: string): GameState {
	const item = state.inventory.items[id];
	if (!item || item.qty <= 0) {
		return state;
	}
	// Only consumable potions are usable out of combat; others are inert.
	if (item.kind !== "potion") {
		return state;
	}
	const healed = applyPotion(state, item);
	return {
		...healed,
		inventory: {
			...healed.inventory,
			items: decrementItem(healed.inventory.items, id),
		},
	};
}

function spendCosts(
	state: GameState,
	costs: RecipeCost[]
): { materials: Record<string, number>; items: Record<string, InventoryItem> } {
	const materials = { ...state.resources.materials };
	let items = { ...state.inventory.items };
	for (const cost of costs) {
		if (cost.source === "material") {
			materials[cost.key] = (materials[cost.key] ?? 0) - cost.qty;
			if (materials[cost.key] <= 0) {
				delete materials[cost.key];
			}
		} else {
			const existing = items[cost.key];
			if (existing) {
				const nextQty = existing.qty - cost.qty;
				if (nextQty <= 0) {
					const copy = { ...items };
					delete copy[cost.key];
					items = copy;
				} else {
					items = { ...items, [cost.key]: { ...existing, qty: nextQty } };
				}
			}
		}
	}
	return { materials, items };
}

function handleCraft(state: GameState, recipeId: string): GameState {
	const recipe = RECIPE_BY_ID[recipeId];
	if (!(recipe && canCraft(state, recipeId))) {
		return state;
	}
	const { materials, items } = spendCosts(state, recipe.costs);
	const out = recipe.output;
	const existing = items[out.id];
	const merged: InventoryItem = existing
		? { ...existing, qty: existing.qty + out.qty }
		: {
				id: out.id,
				kind: out.kind,
				name: out.name,
				qty: out.qty,
				rarity: out.rarity,
			};
	return {
		...state,
		resources: { ...state.resources, materials },
		inventory: { ...state.inventory, items: { ...items, [out.id]: merged } },
	};
}

function handleEquip(state: GameState, id: string): GameState {
	const item = state.inventory.items[id];
	if (!item || item.kind !== "equipment") {
		return state;
	}
	const current = equippedItemId(state);
	// Toggle: equipping the already-equipped item unequips it.
	const nextEquippedId = current === id ? "" : id;
	const marker: InventoryItem = {
		id: EQUIPPED_MARKER_ID,
		kind: "cosmetic",
		name: nextEquippedId,
		qty: 0,
		rarity: "common",
	};
	return {
		...state,
		inventory: {
			...state.inventory,
			items: { ...state.inventory.items, [EQUIPPED_MARKER_ID]: marker },
		},
	};
}

function handleDrop(state: GameState, id: string): GameState {
	if (id === EQUIPPED_MARKER_ID || !state.inventory.items[id]) {
		return state;
	}
	const items = decrementItem(state.inventory.items, id);
	// Dropping the last unit of the equipped item also clears the equip marker.
	let nextItems = items;
	if (!items[id] && equippedItemId(state) === id) {
		const marker = nextItems[EQUIPPED_MARKER_ID];
		if (marker) {
			nextItems = {
				...nextItems,
				[EQUIPPED_MARKER_ID]: { ...marker, name: "" },
			};
		}
	}
	return {
		...state,
		inventory: { ...state.inventory, items: nextItems },
	};
}

export const inventoryReducer = (
	state: GameState,
	event: GameEvent
): GameState => {
	if (!isInventoryEvent(event)) {
		return state;
	}
	switch (event.type) {
		case "ITEM_USE":
			return handleUse(state, event.id);
		case "ITEM_CRAFT":
			return handleCraft(state, event.recipeId);
		case "ITEM_EQUIP":
			return handleEquip(state, event.id);
		case "ITEM_DROP":
			return handleDrop(state, event.id);
		default:
			return state;
	}
};
