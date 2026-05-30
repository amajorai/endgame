// Beacons & Loot amplifier system.
// Owns: shrine spins (daily), cache/raid/vault claims (tiered loot), supply
// drops (server-wide ~2h cadence), wandering chests near the player, ambient
// sparkle mana trickle, and expiry of stale drops/chests. All randomness is
// seeded (seededFromHex / mulberry32) so rolls are reproducible.

import { MS_PER_DAY } from "@/game/constants";
import { hexCenter, hexDisk } from "@/game/lib/hex";
import { hashStringToInt, mulberry32 } from "@/game/lib/rng";
import type {
	BeaconTier,
	Chest,
	GameEvent,
	GameState,
	InventoryItem,
	SupplyDrop,
	SystemReducer,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Event contract (local discriminated union + guard, per the spine rules).
// ---------------------------------------------------------------------------

type BeaconsLootEvent =
	| { type: "BEACON_SPIN"; id: string }
	| { type: "BEACON_CLAIM"; id: string }
	| { type: "SUPPLY_CLAIM"; id: string }
	| { type: "CHEST_OPEN"; id: string }
	| { type: "AMBIENT_COLLECT" };

const BEACONS_LOOT_TYPES: Set<string> = new Set([
	"BEACON_SPIN",
	"BEACON_CLAIM",
	"SUPPLY_CLAIM",
	"CHEST_OPEN",
	"AMBIENT_COLLECT",
]);

const isBeaconsLootEvent = (e: GameEvent): e is BeaconsLootEvent =>
	BEACONS_LOOT_TYPES.has(e.type);

const isTick = (e: GameEvent): e is { type: "TICK"; now: number } =>
	e.type === "TICK";

// ---------------------------------------------------------------------------
// Tuning constants.
// ---------------------------------------------------------------------------

const SHRINE_COOLDOWN_MS = MS_PER_DAY; // shrine spins once per 24h.
const SUPPLY_CADENCE_MS = 2 * 60 * 60 * 1000; // ~2h server-wide supply cadence.
const SUPPLY_LEAD_MS = 5 * 60 * 1000; // a drop "lands" 5 min after spawn.
const SUPPLY_LIFETIME_MS = 30 * 60 * 1000; // claimable for 30 min after landing.
const CHEST_LIFETIME_MS = 20 * 60 * 1000; // chests linger 20 min before fading.
const CHEST_SPAWN_INTERVAL_MS = 8 * 60 * 1000; // chest spawn cadence bucket.
const CHEST_SPAWN_CHANCE = 0.5; // per bucket, roughly half spawn a chest.
const CHEST_SPAWN_RING = 3; // chests appear within k=3 of the player.

const AMBIENT_MANA_PER_TICK = 0.05; // tiny passive sparkle mana per tick.
const AMBIENT_BURST_MANA = 8; // manual sparkle tap reward.
const AMBIENT_BURST_XP = 3;

const MAX_SUPPLY_DROPS = 6;
const MAX_CHESTS = 8;

// ---------------------------------------------------------------------------
// Loot tables. Materials use string keys merged into resources.materials;
// items merge into inventory.items by id (qty accumulates).
// ---------------------------------------------------------------------------

interface ItemDrop {
	id: string;
	kind: string;
	name: string;
	qty: number;
	rarity: string;
}

interface LootRoll {
	items: ItemDrop[];
	mana: number;
	materials: Record<string, number>;
}

interface TierTable {
	itemChance: number;
	itemPool: ItemDrop[];
	manaMax: number;
	manaMin: number;
	materialKeys: string[];
	materialMax: number;
	materialMin: number;
}

const COMMON_MATERIALS = ["essence", "stone", "fiber"];
const RARE_MATERIALS = ["crystal", "ember", "ichor"];
const PRIME_MATERIALS = ["adamant", "starlight", "voidshard"];

const TIER_TABLES: Record<BeaconTier, TierTable> = {
	shrine: {
		manaMin: 20,
		manaMax: 60,
		materialKeys: COMMON_MATERIALS,
		materialMin: 1,
		materialMax: 4,
		itemChance: 0.35,
		itemPool: [
			{
				id: "minor_potion",
				name: "Minor Potion",
				kind: "potion",
				rarity: "common",
				qty: 1,
			},
			{
				id: "rune_shard",
				name: "Rune Shard",
				kind: "material",
				rarity: "uncommon",
				qty: 1,
			},
		],
	},
	cache: {
		manaMin: 40,
		manaMax: 120,
		materialKeys: [...COMMON_MATERIALS, ...RARE_MATERIALS],
		materialMin: 2,
		materialMax: 6,
		itemChance: 0.6,
		itemPool: [
			{
				id: "greater_potion",
				name: "Greater Potion",
				kind: "potion",
				rarity: "uncommon",
				qty: 1,
			},
			{
				id: "sigil_fragment",
				name: "Sigil Fragment",
				kind: "key",
				rarity: "rare",
				qty: 1,
			},
		],
	},
	raid: {
		manaMin: 100,
		manaMax: 260,
		materialKeys: [...RARE_MATERIALS, ...PRIME_MATERIALS],
		materialMin: 3,
		materialMax: 9,
		itemChance: 0.85,
		itemPool: [
			{
				id: "war_relic",
				name: "War Relic",
				kind: "relic",
				rarity: "rare",
				qty: 1,
			},
			{
				id: "shadow_core",
				name: "Shadow Core",
				kind: "core",
				rarity: "epic",
				qty: 1,
			},
		],
	},
	vault: {
		manaMin: 200,
		manaMax: 500,
		materialKeys: PRIME_MATERIALS,
		materialMin: 5,
		materialMax: 14,
		itemChance: 1,
		itemPool: [
			{
				id: "monarch_sigil",
				name: "Monarch Sigil",
				kind: "key",
				rarity: "epic",
				qty: 1,
			},
			{
				id: "ascendant_gem",
				name: "Ascendant Gem",
				kind: "gem",
				rarity: "legendary",
				qty: 1,
			},
		],
	},
};

const SUPPLY_TIERS = ["standard", "reinforced", "elite"] as const;

// ---------------------------------------------------------------------------
// Roll helpers. A `rng` is always a seeded mulberry32 generator.
// ---------------------------------------------------------------------------

const rollInt = (rng: () => number, min: number, max: number): number =>
	min + Math.floor(rng() * (max - min + 1));

const pick = <T>(rng: () => number, arr: readonly T[]): T =>
	arr[Math.floor(rng() * arr.length)] as T;

function rollTier(tier: BeaconTier, rng: () => number): LootRoll {
	const table = TIER_TABLES[tier];
	const mana = rollInt(rng, table.manaMin, table.manaMax);

	const materials: Record<string, number> = {};
	const key = pick(rng, table.materialKeys);
	materials[key] = rollInt(rng, table.materialMin, table.materialMax);
	// Second material draw for richer tiers.
	if (rng() < 0.5) {
		const key2 = pick(rng, table.materialKeys);
		materials[key2] =
			(materials[key2] ?? 0) +
			rollInt(rng, table.materialMin, table.materialMax);
	}

	const items: ItemDrop[] = [];
	if (rng() < table.itemChance) {
		const drop = pick(rng, table.itemPool);
		items.push({ ...drop, qty: drop.qty });
	}

	return { mana, materials, items };
}

// ---------------------------------------------------------------------------
// Apply a LootRoll to state immutably (merge mana, materials, items).
// ---------------------------------------------------------------------------

function applyLoot(state: GameState, loot: LootRoll): GameState {
	const materials = { ...state.resources.materials };
	for (const [k, v] of Object.entries(loot.materials)) {
		materials[k] = (materials[k] ?? 0) + v;
	}

	const items: Record<string, InventoryItem> = { ...state.inventory.items };
	for (const drop of loot.items) {
		const existing = items[drop.id];
		items[drop.id] = existing
			? { ...existing, qty: existing.qty + drop.qty }
			: {
					id: drop.id,
					name: drop.name,
					kind: drop.kind,
					qty: drop.qty,
					rarity: drop.rarity,
				};
	}

	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + loot.mana,
			materials,
		},
		inventory: { items },
	};
}

// ---------------------------------------------------------------------------
// Public: describe a beacon's loot deterministically (for panel preview).
// A shrine re-rolls per day; chests/caches roll once per spawn id.
// ---------------------------------------------------------------------------

export function previewBeaconLoot(tier: BeaconTier, seedKey: string): LootRoll {
	const rng = mulberry32(hashStringToInt(`${tier}:${seedKey}`));
	return rollTier(tier, rng);
}

// ---------------------------------------------------------------------------
// Event handlers.
// ---------------------------------------------------------------------------

function spinBeacon(state: GameState, id: string): GameState {
	const beacon = state.beacons[id];
	if (!beacon || beacon.tier !== "shrine") {
		return state;
	}
	const now = state.lastTick;
	if (
		beacon.lastSpun !== undefined &&
		now - beacon.lastSpun < SHRINE_COOLDOWN_MS
	) {
		return state; // still on cooldown.
	}
	// Re-rollable: seed by hex + which 24h window we are in.
	const window = Math.floor(now / SHRINE_COOLDOWN_MS);
	const rng = mulberry32(hashStringToInt(`shrine:${beacon.hex}:${window}`));
	const loot = rollTier("shrine", rng);
	const withLoot = applyLoot(state, loot);
	return {
		...withLoot,
		beacons: {
			...withLoot.beacons,
			[id]: { ...beacon, lastSpun: now },
		},
	};
}

function claimBeacon(state: GameState, id: string): GameState {
	const beacon = state.beacons[id];
	if (!beacon || beacon.tier === "shrine") {
		return state; // shrines are spun, not claimed.
	}
	const rng = mulberry32(hashStringToInt(`claim:${beacon.id}:${beacon.hex}`));
	const loot = rollTier(beacon.tier, rng);
	const withLoot = applyLoot(state, loot);
	// One-shot beacon: remove after claim.
	const beacons = { ...withLoot.beacons };
	delete beacons[id];
	return { ...withLoot, beacons };
}

function claimSupply(state: GameState, id: string): GameState {
	const drop = state.meta.supplyDrops.find((d) => d.id === id);
	if (!drop || drop.claimed) {
		return state;
	}
	if (state.lastTick < drop.landsAt) {
		return state; // not landed yet.
	}
	// Tier maps to a beacon-like roll: standard->cache, reinforced->raid, elite->vault.
	const tierMap: Record<string, BeaconTier> = {
		standard: "cache",
		reinforced: "raid",
		elite: "vault",
	};
	const lootTier = tierMap[drop.tier] ?? "cache";
	const rng = mulberry32(hashStringToInt(`supply:${drop.id}`));
	const loot = rollTier(lootTier, rng);
	const withLoot = applyLoot(state, loot);
	const supplyDrops = withLoot.meta.supplyDrops.map((d) =>
		d.id === id ? { ...d, claimed: true } : d
	);
	return { ...withLoot, meta: { ...withLoot.meta, supplyDrops } };
}

function openChest(state: GameState, id: string): GameState {
	const chest = state.meta.chests.find((c) => c.id === id);
	if (!chest || chest.opened) {
		return state;
	}
	if (state.lastTick > chest.expiresAt) {
		return state; // already expired.
	}
	// Chest loot quality scales by a seeded roll into cache/raid.
	const rng = mulberry32(hashStringToInt(`chest:${chest.id}`));
	const tier: BeaconTier = rng() < 0.2 ? "raid" : "cache";
	const loot = rollTier(tier, rng);
	const withLoot = applyLoot(state, loot);
	const chests = withLoot.meta.chests.map((c) =>
		c.id === id ? { ...c, opened: true } : c
	);
	return { ...withLoot, meta: { ...withLoot.meta, chests } };
}

function collectAmbient(state: GameState): GameState {
	const rng = mulberry32(
		hashStringToInt(`ambient:${state.position.hex}:${state.lastTick}`)
	);
	const bonus = Math.floor(rng() * AMBIENT_BURST_MANA);
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + AMBIENT_BURST_MANA + bonus,
		},
		player: { ...state.player, xp: state.player.xp + AMBIENT_BURST_XP },
	};
}

// ---------------------------------------------------------------------------
// TICK: spawn supply drops on cadence, spawn chests near player, expire stale
// content, trickle ambient mana. All bucketed off epoch ms so spawn rate is
// independent of tick frequency.
// ---------------------------------------------------------------------------

function makeSupplyDrop(
	now: number,
	bucket: number,
	playerHex: string
): SupplyDrop {
	const rng = mulberry32(hashStringToInt(`supplydrop:${bucket}`));
	// Land it somewhere in the player's wider neighbourhood (deterministic).
	const disk = hexDisk(playerHex, CHEST_SPAWN_RING + 2);
	const hex = disk[Math.floor(rng() * disk.length)] ?? playerHex;
	const center = hexCenter(hex);
	const tier =
		SUPPLY_TIERS[Math.floor(rng() * SUPPLY_TIERS.length)] ?? "standard";
	return {
		id: `supply-${bucket}`,
		hex,
		lat: center.lat,
		lng: center.lng,
		landsAt: now + SUPPLY_LEAD_MS,
		tier,
		claimed: false,
	};
}

function makeChest(now: number, bucket: number, playerHex: string): Chest {
	const rng = mulberry32(hashStringToInt(`chestspawn:${bucket}:${playerHex}`));
	const disk = hexDisk(playerHex, CHEST_SPAWN_RING);
	const hex = disk[Math.floor(rng() * disk.length)] ?? playerHex;
	const center = hexCenter(hex);
	return {
		id: `chest-${bucket}-${hex}`,
		hex,
		lat: center.lat,
		lng: center.lng,
		expiresAt: now + CHEST_LIFETIME_MS,
		opened: false,
	};
}

function spawnSupply(state: GameState, now: number): GameState {
	const bucket = Math.floor(now / SUPPLY_CADENCE_MS);
	const id = `supply-${bucket}`;
	const exists = state.meta.supplyDrops.some((d) => d.id === id);
	if (exists) {
		return state;
	}
	const drop = makeSupplyDrop(now, bucket, state.position.hex);
	const supplyDrops = [...state.meta.supplyDrops, drop].slice(
		-MAX_SUPPLY_DROPS
	);
	return { ...state, meta: { ...state.meta, supplyDrops } };
}

function spawnChest(state: GameState, now: number): GameState {
	const bucket = Math.floor(now / CHEST_SPAWN_INTERVAL_MS);
	// Deterministic gate: only spawn on some buckets.
	const gate = mulberry32(hashStringToInt(`chestgate:${bucket}`))();
	if (gate >= CHEST_SPAWN_CHANCE) {
		return state;
	}
	const chest = makeChest(now, bucket, state.position.hex);
	const exists = state.meta.chests.some((c) => c.id === chest.id);
	if (exists) {
		return state;
	}
	const chests = [...state.meta.chests, chest].slice(-MAX_CHESTS);
	return { ...state, meta: { ...state.meta, chests } };
}

function expireStale(state: GameState, now: number): GameState {
	const supplyDrops = state.meta.supplyDrops.filter(
		(d) => !d.claimed && now - d.landsAt < SUPPLY_LIFETIME_MS
	);
	const chests = state.meta.chests.filter(
		(c) => !c.opened && now <= c.expiresAt
	);
	if (
		supplyDrops.length === state.meta.supplyDrops.length &&
		chests.length === state.meta.chests.length
	) {
		return state;
	}
	return { ...state, meta: { ...state.meta, supplyDrops, chests } };
}

function trickleAmbient(state: GameState): GameState {
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + AMBIENT_MANA_PER_TICK,
		},
	};
}

function handleTick(state: GameState, now: number): GameState {
	let next = spawnSupply(state, now);
	next = spawnChest(next, now);
	next = expireStale(next, now);
	next = trickleAmbient(next);
	return next;
}

// ---------------------------------------------------------------------------
// Reducer.
// ---------------------------------------------------------------------------

export const beaconsLootReducer: SystemReducer = (state, event) => {
	if (isTick(event)) {
		return handleTick(state, event.now);
	}
	if (!isBeaconsLootEvent(event)) {
		return state;
	}
	switch (event.type) {
		case "BEACON_SPIN":
			return spinBeacon(state, event.id);
		case "BEACON_CLAIM":
			return claimBeacon(state, event.id);
		case "SUPPLY_CLAIM":
			return claimSupply(state, event.id);
		case "CHEST_OPEN":
			return openChest(state, event.id);
		case "AMBIENT_COLLECT":
			return collectAmbient(state);
		default:
			return state;
	}
};

// ---------------------------------------------------------------------------
// Panel helpers (pure, exported for the UI).
// ---------------------------------------------------------------------------

export function shrineCooldownRemainingMs(
	lastSpun: number | undefined,
	now: number
): number {
	if (lastSpun === undefined) {
		return 0;
	}
	return Math.max(0, SHRINE_COOLDOWN_MS + lastSpun - now);
}

export function supplyCountdownMs(landsAt: number, now: number): number {
	return landsAt - now;
}

export function supplyExpiresInMs(landsAt: number, now: number): number {
	return SUPPLY_LIFETIME_MS + landsAt - now;
}

export function chestExpiresInMs(expiresAt: number, now: number): number {
	return expiresAt - now;
}

// Lightweight loot summary string for previews.
export function summarizeLoot(loot: LootRoll): string {
	const parts: string[] = [];
	if (loot.mana > 0) {
		parts.push(`${loot.mana} mana`);
	}
	for (const [k, v] of Object.entries(loot.materials)) {
		parts.push(`${v} ${k}`);
	}
	for (const item of loot.items) {
		parts.push(item.name);
	}
	return parts.join(", ");
}

export type { ItemDrop, LootRoll };
export {
	CHEST_LIFETIME_MS,
	SHRINE_COOLDOWN_MS,
	SUPPLY_CADENCE_MS,
	SUPPLY_LIFETIME_MS,
};
