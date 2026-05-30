import { HEX_VIEW_RING } from "@/game/constants";
import { hexDistance } from "@/game/lib/hex";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameEvent, GameState } from "@/game/types";

// Core spec provider: the original hard-coded gate/beacon/drop/boss entities,
// extracted verbatim from EntityRenderer.collectSpecs so behaviour is identical
// (same model URLs, footprints, portal colours, HEX_VIEW_RING culling, events).
// Registered at module top-level below so importing this module wires the core
// content into the registry before the first sync.

// Target on-map footprint per kind, in metres. Models are normalised to this so
// wildly different source scales read consistently. These match the renderer's
// former TARGET_SIZE_M exactly.
const GATE_SIZE_M = 12;
const BEACON_SIZE_M = 6;
const DROP_SIZE_M = 4;
const BOSS_SIZE_M = 14;

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

const PORTAL_ANCHORED = { primary: 0x35_e0_ff, secondary: 0x12_4a_6b };
const PORTAL_UNANCHORED = { primary: 0xff_b0_3c, secondary: 0x6b_3a_12 };

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
		specs.push({
			key: `gate:${gate.hex}`,
			kind: "gate",
			modelUrl: GATE_MODEL,
			scaleM: GATE_SIZE_M,
			lat: gate.lat,
			lng: gate.lng,
			event: { type: "GATE_ENTER", hex: gate.hex },
			portalColors: gate.anchored ? PORTAL_ANCHORED : PORTAL_UNANCHORED,
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
			key: `boss:${boss.id}`,
			kind: "boss",
			modelUrl: BOSS_MODEL,
			scaleM: BOSS_SIZE_M,
			lat: boss.lat,
			lng: boss.lng,
			event: { type: "BOSS_ATTACK" },
		});
	}
	return specs;
}

registerSpecProvider(collectCoreSpecs);
