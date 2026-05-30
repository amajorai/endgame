import { METERS_PER_DEGREE_LAT } from "@/game/constants";
import { hexCenter } from "@/game/lib/hex";
import {
	registerSpecProvider,
	type WorldEntitySpec,
} from "@/game/three/world-entities";
import type { GameState } from "@/game/types";

// Shadow spec provider. Each shadow with an `assignedHex` is a deployed sentinel
// standing guard on that hex. We render it as a dark-tinted skeleton soldier at
// the hex centre; tapping it dispatches SHADOW_RECALL to pull it back into the
// idle roster. Sentinels appear/disappear purely with assignment state (no
// proximity culling), and the roster is bounded by MAX_SLOTS so the count is
// small. Assignment itself stays in the Shadow Army panel ("Deploy here").
// Registered at module top-level so importing this module wires the provider in.

// Distinct from the field-boss model (Skeleton_Warrior) so a sentinel never
// reads as a boss.
const SENTINEL_MODEL =
	"/assets/kaykit/skeletons/characters/gltf/Skeleton_Rogue.glb";

// Humanoid footprint in metres. Intentionally modest so a friendly garrison
// reads as smaller than a hostile field boss (which renders at ~14m).
const SENTINEL_SIZE_M = 2.5;

// Deep indigo / near-black so the soldier reads as a shadow.
const SHADOW_TINT = 0x1a_10_30;

// Spread metres for multiple sentinels sharing one hex, so they ring the centre
// instead of overlapping. Small relative to an ~80m hex.
const SPREAD_RADIUS_M = 2;

const FULL_CIRCLE = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

// Offset a hex-centre lat/lng by a metric vector, accounting for longitude
// convergence at the given latitude.
function offsetLatLng(
	lat: number,
	lng: number,
	eastM: number,
	northM: number
): { lat: number; lng: number } {
	const dLat = northM / METERS_PER_DEGREE_LAT;
	const lngScale = METERS_PER_DEGREE_LAT * Math.cos(lat * DEG_TO_RAD);
	const dLng = lngScale === 0 ? 0 : eastM / lngScale;
	return { lat: lat + dLat, lng: lng + dLng };
}

// Build a deployed sentinel spec for one shadow. `indexOnHex` is the shadow's
// position among others on the same hex (0-based), used for a deterministic
// angular offset so co-located sentinels don't stack. Returns null when the
// assigned hex can't be resolved to a centre, so one bad hex drops only its own
// sentinel rather than blanking the whole frame.
function sentinelSpec(
	id: string,
	hex: string,
	indexOnHex: number,
	totalOnHex: number
): WorldEntitySpec | null {
	let center: { lat: number; lng: number };
	try {
		center = hexCenter(hex);
	} catch {
		return null;
	}

	let lat = center.lat;
	let lng = center.lng;
	if (totalOnHex > 1) {
		const angle = (indexOnHex / totalOnHex) * FULL_CIRCLE;
		const eastM = Math.cos(angle) * SPREAD_RADIUS_M;
		const northM = Math.sin(angle) * SPREAD_RADIUS_M;
		const offset = offsetLatLng(lat, lng, eastM, northM);
		lat = offset.lat;
		lng = offset.lng;
	}

	return {
		key: `shadow:${id}`,
		kind: "sentinel",
		modelUrl: SENTINEL_MODEL,
		scaleM: SENTINEL_SIZE_M,
		tintHex: SHADOW_TINT,
		lat,
		lng,
		event: { type: "SHADOW_RECALL", id },
	};
}

// Collect a sentinel spec for every deployed shadow. Two passes over the stable
// `state.shadows` array: first to count occupants per hex, then to emit with a
// per-hex index. Array order only changes on extract (append) and recall (clears
// `assignedHex`), so the index assignment is deterministic across syncs.
export function collectShadowSpecs(state: GameState): WorldEntitySpec[] {
	const totalByHex = new Map<string, number>();
	for (const shadow of state.shadows) {
		if (shadow.assignedHex) {
			totalByHex.set(
				shadow.assignedHex,
				(totalByHex.get(shadow.assignedHex) ?? 0) + 1
			);
		}
	}

	const specs: WorldEntitySpec[] = [];
	const indexByHex = new Map<string, number>();
	for (const shadow of state.shadows) {
		const hex = shadow.assignedHex;
		if (!hex) {
			continue;
		}
		const indexOnHex = indexByHex.get(hex) ?? 0;
		indexByHex.set(hex, indexOnHex + 1);
		const spec = sentinelSpec(
			shadow.id,
			hex,
			indexOnHex,
			totalByHex.get(hex) ?? 1
		);
		if (spec) {
			specs.push(spec);
		}
	}
	return specs;
}

registerSpecProvider(collectShadowSpecs);
