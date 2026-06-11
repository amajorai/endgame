import { ENEMY_ANIM_URL, HEX_VIEW_RING } from "@/game/constants";
import { hexDistance } from "@/game/lib/hex";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameEvent, GameState, Rank } from "@/game/types";

// Core spec provider: the original hard-coded gate/beacon/drop/boss entities,
// extracted verbatim from EntityRenderer.collectSpecs so behaviour is identical
// (same model URLs, footprints, portal colours, HEX_VIEW_RING culling, events).
// Registered at module top-level below so importing this module wires the core
// content into the registry before the first sync.

// Target on-map footprint per kind, in metres. Models are normalised to this so
// wildly different source scales read consistently. Gates and the field boss are
// deliberately oversized so they read as landmarks from a distance and stay
// legible against a bright daytime basemap; the arch is scaled uniformly, so a
// larger footprint also makes the gate stand much taller.
const GATE_SIZE_M = 55;
const BEACON_SIZE_M = 6;
const DROP_SIZE_M = 4;
const BOSS_SIZE_M = 30;
const GATE_PICK_RADIUS_PX = 72;

// Model URLs per kind. Beacons vary their prop by tier.
const GATE_MODEL =
	"/assets/kenney/fantasy-town-kit/Models/GLB format/wall-arch.glb";
const BOSS_MODEL =
	"/assets/kaykit/skeletons/characters/gltf/Skeleton_Warrior.glb";
const DROP_MODEL = "/assets/kaykit/dungeon/assets/gltf/chest_gold.gltf";
const BEACON_MODEL_BY_TIER: Record<string, string> = {
	shrine: "/assets/kaykit/dungeon/assets/gltf/pillar_decorated.gltf",
	cache: "/assets/kaykit/dungeon/assets/gltf/chest.gltf",
	raid: "/assets/kaykit/dungeon/assets/gltf/pillar.gltf",
	vault: "/assets/kaykit/dungeon/assets/gltf/barrel_large_decorated.gltf",
};
const SKELETON_FORWARD_OFFSET_RAD = Math.PI;

// Gate difficulty palette (Solo-Leveling style, leaning on item-rarity colours).
// Higher rank reads as a rarer, more dangerous colour so a gate's threat is
// obvious at a glance, even in daylight. `tint` recolours the stone arch (the
// renderer also feeds it to the material's emissive, which keeps it visible
// against a bright map); `portal` drives the swirling portal VFX in the same
// colour family for extra pop. The rank set is E (lowest) through S (highest).
interface GateStyle {
	portal: { primary: number; secondary: number };
	tint: number;
}
const GATE_STYLE_BY_RANK: Record<Rank, GateStyle> = {
	// Normal - blue
	E: {
		tint: 0x3c_a0_ff,
		portal: { primary: 0x5c_c8_ff, secondary: 0x10_3a_6b },
	},
	// Uncommon - green
	D: {
		tint: 0x36_d0_72,
		portal: { primary: 0x66_ff_9a, secondary: 0x0e_5a_2c },
	},
	// Epic - purple
	C: {
		tint: 0xa8_4c_ff,
		portal: { primary: 0xc8_7c_ff, secondary: 0x36_10_6b },
	},
	// Legendary - gold/yellow
	B: {
		tint: 0xff_c4_3c,
		portal: { primary: 0xff_e2_6c, secondary: 0x6b_4a_10 },
	},
	// Elite - red
	A: {
		tint: 0xff_3c_3c,
		portal: { primary: 0xff_6c_5c, secondary: 0x6b_10_10 },
	},
	// God - void black with a bright violet glow (pure black would vanish)
	S: {
		tint: 0x20_14_30,
		portal: { primary: 0xc0_3c_ff, secondary: 0x08_03_10 },
	},
};

function beaconEvent(tier: string, id: string): GameEvent {
	return tier === "shrine"
		? { type: "BEACON_SPIN", id }
		: { type: "BEACON_CLAIM", id };
}

// Collect every core entity within the view ring that should have a model.
// Culling to HEX_VIEW_RING (matching the old 2D markers) is essential: the
// content system spawns fresh gates/beacons around the player on every move, so
// without this the scene fills with hundreds of accumulated models that read as
// "following".
function collectCoreSpecs(state: GameState): WorldEntitySpec[] {
	const specs: WorldEntitySpec[] = [];
	const playerHex = state.position.hex;
	const inRange = (hex: string): boolean => {
		try {
			return hexDistance(playerHex, hex) <= HEX_VIEW_RING;
		} catch {
			return false;
		}
	};

	for (const gate of Object.values(state.gates)) {
		if (!inRange(gate.hex)) {
			continue;
		}
		const style = GATE_STYLE_BY_RANK[gate.rank] ?? GATE_STYLE_BY_RANK.E;
		specs.push({
			key: `gate:${gate.hex}`,
			kind: "gate",
			modelUrl: GATE_MODEL,
			scaleM: GATE_SIZE_M,
			pickRadiusPx: GATE_PICK_RADIUS_PX,
			lat: gate.lat,
			lng: gate.lng,
			event: { type: "GATE_ENTER", hex: gate.hex },
			tintHex: style.tint,
			portalColors: style.portal,
		});
	}
	for (const beacon of Object.values(state.beacons)) {
		if (!inRange(beacon.hex)) {
			continue;
		}
		specs.push({
			key: `beacon:${beacon.id}`,
			kind: "beacon",
			modelUrl: BEACON_MODEL_BY_TIER[beacon.tier] ?? BEACON_MODEL_BY_TIER.cache,
			scaleM: BEACON_SIZE_M,
			lat: beacon.lat,
			lng: beacon.lng,
			event: beaconEvent(beacon.tier, beacon.id),
		});
	}
	const now = state.lastTick;
	for (const drop of state.meta.supplyDrops) {
		if (drop.claimed || drop.landsAt > now || !inRange(drop.hex)) {
			continue;
		}
		specs.push({
			key: `drop:${drop.id}`,
			kind: "drop",
			modelUrl: DROP_MODEL,
			scaleM: DROP_SIZE_M,
			lat: drop.lat,
			lng: drop.lng,
			event: { type: "SUPPLY_CLAIM", id: drop.id },
		});
	}
	const boss = state.activeBoss;
	if (boss && boss.status !== "defeated" && inRange(boss.hex)) {
		specs.push({
			animation: {
				clip: "walk",
				url: ENEMY_ANIM_URL,
				yawOffsetRad: SKELETON_FORWARD_OFFSET_RAD,
			},
			key: `boss:${boss.id}`,
			kind: "boss",
			modelUrl: BOSS_MODEL,
			scaleM: BOSS_SIZE_M,
			lat: boss.lat,
			lng: boss.lng,
			event: { type: "BOSS_ENGAGE" },
		});
	}
	return specs;
}

registerSpecProvider(collectCoreSpecs);
