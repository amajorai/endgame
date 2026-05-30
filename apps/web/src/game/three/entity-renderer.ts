import type maplibregl from "maplibre-gl";
import { Box3, type Object3D, Vector3 } from "three";
import { HEX_VIEW_RING, METERS_PER_DEGREE_LAT } from "@/game/constants";
import { hexDistance } from "@/game/lib/hex";
import { loadModelInstance } from "@/game/three/asset-loader";
import { createPortal, type Portal } from "@/game/three/vfx/portal";
import type { GameEvent, GameState } from "@/game/types";

// Renders world entities (gates, beacons, supply drops, field boss) as 3D models
// in the scene, positioned in metres relative to the moving scene origin. Click
// dispatch is handled by projecting each entity's lng/lat to screen space via
// MapLibre (independent of the custom three.js camera) and picking the nearest.

const DEG = Math.PI / 180;
const PICK_RADIUS_PX = 32;

// Target on-map footprint per entity kind, in metres. Models are normalised to
// this so wildly different source scales read consistently.
const TARGET_SIZE_M: Record<EntityKind, number> = {
	gate: 12,
	beacon: 6,
	drop: 4,
	boss: 14,
};

type EntityKind = "gate" | "beacon" | "drop" | "boss";

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

interface EntityRecord {
	event: GameEvent;
	lat: number;
	lng: number;
	// A swirling portal VFX, present only for gates.
	portal?: Portal;
	// Null until the model finishes loading; the slot is reserved synchronously
	// so concurrent syncs don't double-add the same entity.
	root: Object3D | null;
}

// Portal disc centre height. The disc has radius PORTAL_RADIUS (4m) and stands
// upright, so its centre must clear that radius plus headroom to avoid clipping
// into the ground/road.
const PORTAL_HEIGHT_M = 7;

// What a hex+entity should resolve to: a model URL, a stable key, the click
// event to dispatch, and its world position.
interface EntitySpec {
	event: GameEvent;
	key: string;
	kind: EntityKind;
	lat: number;
	lng: number;
	// Gates carry portal colours; undefined for other kinds.
	portalColors?: { primary: number; secondary: number };
	url: string;
}

const PORTAL_ANCHORED = { primary: 0x35_e0_ff, secondary: 0x12_4a_6b };
const PORTAL_UNANCHORED = { primary: 0xff_b0_3c, secondary: 0x6b_3a_12 };

function beaconEvent(tier: string, id: string): GameEvent {
	return tier === "shrine"
		? { type: "BEACON_SPIN", id }
		: { type: "BEACON_CLAIM", id };
}

// Collect every entity within the view ring that should have a model. Culling to
// HEX_VIEW_RING (matching the old 2D markers) is essential: the content system
// spawns fresh gates/beacons around the player on every move, so without this
// the scene fills with hundreds of accumulated models that read as "following".
function collectSpecs(state: GameState): EntitySpec[] {
	const specs: EntitySpec[] = [];
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
			url: GATE_MODEL,
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
			url: BEACON_MODEL_BY_TIER[beacon.tier] ?? BEACON_MODEL_BY_TIER.cache,
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
			url: DROP_MODEL,
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
			url: BOSS_MODEL,
			lat: boss.lat,
			lng: boss.lng,
			event: { type: "BOSS_ATTACK" },
		});
	}
	return specs;
}

// Scale a freshly loaded model so its largest horizontal dimension matches the
// target footprint, and drop it so its base sits on the ground plane.
function normaliseModel(root: Object3D, kind: EntityKind): void {
	const box = new Box3().setFromObject(root);
	const size = new Vector3();
	box.getSize(size);
	const footprint = Math.max(size.x, size.z) || 1;
	const scale = TARGET_SIZE_M[kind] / footprint;
	root.scale.setScalar(scale);
	root.position.y = -box.min.y * scale;
}

export class EntityRenderer {
	private readonly group: Object3D;
	private readonly records = new Map<string, EntityRecord>();
	private originLng: number;
	private originLat: number;
	// Supplies the boss's live (per-frame) position so its model tracks the chase
	// smoothly between the coarser hex-change BOSS_MOVE dispatches.
	private bossLivePos: (() => { lat: number; lng: number } | null) | null =
		null;

	constructor(group: Object3D, originLng: number, originLat: number) {
		this.group = group;
		this.originLng = originLng;
		this.originLat = originLat;
	}

	setBossPositionProvider(
		provider: () => { lat: number; lng: number } | null
	): void {
		this.bossLivePos = provider;
	}

	// Reconcile the live model set with game state: add new, remove gone.
	sync(state: GameState): void {
		const specs = collectSpecs(state);
		const wanted = new Set(specs.map((spec) => spec.key));

		for (const [key, record] of this.records) {
			if (!wanted.has(key)) {
				if (record.root) {
					this.group.remove(record.root);
				}
				if (record.portal) {
					this.group.remove(record.portal.mesh);
				}
				this.records.delete(key);
			}
		}

		for (const spec of specs) {
			const existing = this.records.get(spec.key);
			if (existing) {
				existing.lat = spec.lat;
				existing.lng = spec.lng;
				continue;
			}
			// Reserve the slot synchronously so concurrent syncs don't double-add.
			const record: EntityRecord = {
				event: spec.event,
				lat: spec.lat,
				lng: spec.lng,
				root: null,
			};
			// Gates get a swirling portal VFX mounted upright at their location.
			if (spec.portalColors) {
				const portal = createPortal(
					spec.portalColors.primary,
					spec.portalColors.secondary
				);
				portal.mesh.position.y = PORTAL_HEIGHT_M;
				record.portal = portal;
				this.group.add(portal.mesh);
				this.placeOne(portal.mesh, spec.lat, spec.lng);
			}
			this.records.set(spec.key, record);
			loadModelInstance(spec.url)
				.then((root) => {
					if (this.records.get(spec.key) !== record) {
						return;
					}
					normaliseModel(root, spec.kind);
					this.placeOne(root, record.lat, record.lng);
					this.group.add(root);
					record.root = root;
				})
				.catch(() => {
					// A missing entity model is non-fatal; it just won't appear.
					if (this.records.get(spec.key) === record) {
						this.records.delete(spec.key);
					}
				});
		}
	}

	// Reposition all entity models relative to the current scene origin. Called
	// every frame as the origin tracks the player. The boss uses its live chase
	// position (if provided) so its model moves smoothly, not in hex jumps.
	syncPositions(originLng: number, originLat: number): void {
		this.originLng = originLng;
		this.originLat = originLat;
		const bossPos = this.bossLivePos?.() ?? null;
		for (const [key, record] of this.records) {
			const isBoss = key.startsWith("boss:");
			const lat = isBoss && bossPos ? bossPos.lat : record.lat;
			const lng = isBoss && bossPos ? bossPos.lng : record.lng;
			if (record.root) {
				this.placeOne(record.root, lat, lng);
			}
			if (record.portal) {
				this.placeOne(record.portal.mesh, lat, lng);
			}
		}
	}

	// Advance VFX animation (portal swirl). Driven from the render loop.
	update(dt: number): void {
		for (const record of this.records.values()) {
			record.portal?.update(dt);
		}
	}

	// Dispatch the entity nearest a click, if within the pick radius.
	pick(
		map: maplibregl.Map,
		x: number,
		y: number,
		dispatch: (event: GameEvent) => void
	): boolean {
		let bestKey: string | null = null;
		let bestDist = PICK_RADIUS_PX;
		let bestEvent: GameEvent | null = null;
		for (const [key, record] of this.records) {
			const point = map.project([record.lng, record.lat]);
			const dist = Math.hypot(point.x - x, point.y - y);
			if (dist < bestDist) {
				bestDist = dist;
				bestKey = key;
				bestEvent = record.event;
			}
		}
		if (bestKey && bestEvent) {
			dispatch(bestEvent);
			return true;
		}
		return false;
	}

	private placeOne(root: Object3D, lat: number, lng: number): void {
		const dNorth = (lat - this.originLat) * METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.originLat * DEG);
		const dEast = (lng - this.originLng) * (lngScale || METERS_PER_DEGREE_LAT);
		// Scene convention (matches the player at the origin): x=east, y=up,
		// z=north. The model's own y offset (base on ground) is preserved.
		root.position.x = dEast;
		root.position.z = dNorth;
	}
}
