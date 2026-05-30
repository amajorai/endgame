import type maplibregl from "maplibre-gl";
import {
	Box3,
	type Color,
	type Material,
	type Mesh,
	type MeshStandardMaterial,
	type Object3D,
	Vector3,
} from "three";
import { METERS_PER_DEGREE_LAT } from "@/game/constants";
import { loadModelInstance } from "@/game/three/asset-loader";
import { createPortal, type Portal } from "@/game/three/vfx/portal";
// Side-effect import: registering the core gate/beacon/drop/boss provider on the
// registry the moment the renderer module loads. The renderer is constructed by
// SceneLayer, so this guarantees the core content is registered before the first
// sync(). Per-system providers register themselves the same way from their own
// modules (added by later agents).
import "@/game/three/specs/core-specs";
import { collectAll, type WorldEntitySpec } from "@/game/three/world-entities";
import type { GameEvent, GameState } from "@/game/types";

// Renders world entities (gates, beacons, supply drops, field boss, and any
// system-registered props) as 3D models in the scene, positioned in metres
// relative to the moving scene origin. The set of entities comes from the
// spec-provider registry (collectAll), not hard-coded lists. Click dispatch is
// handled by projecting each entity's lng/lat to screen space via MapLibre
// (independent of the custom three.js camera) and picking the nearest.

const DEG = Math.PI / 180;
const PICK_RADIUS_PX = 32;

// Fallback target footprint (metres) when a spec omits scaleM, keyed by kind.
// Core specs always set scaleM explicitly; this is belt-and-suspenders for
// system providers that don't, and matches today's gate/beacon/drop/boss sizes.
const DEFAULT_SIZE_M: Record<string, number> = {
	gate: 12,
	beacon: 6,
	drop: 4,
	boss: 14,
};
// Last-resort footprint for an unknown kind with no scaleM.
const GENERIC_SIZE_M = 6;
// Ground tiles read as flat plots a few metres across.
const GROUND_TILE_SIZE_M = 8;

interface EntityRecord {
	event?: GameEvent;
	// Optional flat ground tile laid under the entity (e.g. a farm plot).
	ground: Object3D | null;
	lat: number;
	lng: number;
	// A swirling portal VFX, present only for entities with portalColors.
	portal?: Portal;
	// Null until the model finishes loading; the slot is reserved synchronously
	// so concurrent syncs don't double-add the same entity.
	root: Object3D | null;
}

// Portal disc centre height. The disc has radius PORTAL_RADIUS (4m) and stands
// upright, so its centre must clear that radius plus headroom to avoid clipping
// into the ground/road.
const PORTAL_HEIGHT_M = 7;

function targetSizeFor(spec: WorldEntitySpec): number {
	return spec.scaleM ?? DEFAULT_SIZE_M[spec.kind] ?? GENERIC_SIZE_M;
}

// Scale a freshly loaded model so its largest horizontal dimension matches the
// target footprint, and drop it so its base sits on the ground plane.
function normaliseModel(root: Object3D, sizeM: number): void {
	const box = new Box3().setFromObject(root);
	const size = new Vector3();
	box.getSize(size);
	const footprint = Math.max(size.x, size.z) || 1;
	const scale = sizeM / footprint;
	root.scale.setScalar(scale);
	root.position.y = -box.min.y * scale;
}

// Normalise a flat ground tile to GROUND_TILE_SIZE_M and rest its top on y=0.
function normaliseGround(root: Object3D): void {
	const box = new Box3().setFromObject(root);
	const size = new Vector3();
	box.getSize(size);
	const footprint = Math.max(size.x, size.z) || 1;
	const scale = GROUND_TILE_SIZE_M / footprint;
	root.scale.setScalar(scale);
	root.position.y = -box.max.y * scale;
}

// Apply a colour tint to every mesh material in the model. Materials are CLONED
// first because loadModelInstance shares materials from the cached source scene
// (only nodes are cloned), so mutating in place would tint every instance.
function tintModel(root: Object3D, tintHex: number): void {
	root.traverse((node) => {
		const mesh = node as Mesh;
		if (!mesh.isMesh) {
			return;
		}
		const material = mesh.material;
		if (Array.isArray(material)) {
			mesh.material = material.map((m) => applyTint(m, tintHex));
		} else if (material) {
			mesh.material = applyTint(material, tintHex);
		}
	});
}

function applyTint(material: Material, tintHex: number): Material {
	const cloned = material.clone();
	const colored = cloned as unknown as { color?: Color };
	colored.color?.set(tintHex);
	const standard = cloned as Partial<MeshStandardMaterial>;
	standard.emissive?.set(tintHex);
	if (standard.emissive && typeof standard.emissiveIntensity === "number") {
		standard.emissiveIntensity = 0.15;
	}
	return cloned;
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
		const specs = collectAll(state);
		const wanted = new Set(specs.map((spec) => spec.key));

		for (const [key, record] of this.records) {
			if (!wanted.has(key)) {
				this.removeRecord(record);
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
			this.addSpec(spec);
		}
	}

	private removeRecord(record: EntityRecord): void {
		if (record.root) {
			this.group.remove(record.root);
		}
		if (record.portal) {
			this.group.remove(record.portal.mesh);
		}
		if (record.ground) {
			this.group.remove(record.ground);
		}
	}

	private addSpec(spec: WorldEntitySpec): void {
		// Reserve the slot synchronously so concurrent syncs don't double-add.
		const record: EntityRecord = {
			event: spec.event,
			lat: spec.lat,
			lng: spec.lng,
			ground: null,
			root: null,
		};
		// Entities with portal colours get a swirling portal VFX mounted upright.
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
		if (spec.groundTileUrl) {
			this.loadGround(spec, record);
		}
		this.loadRoot(spec, record);
	}

	private loadRoot(spec: WorldEntitySpec, record: EntityRecord): void {
		const sizeM = targetSizeFor(spec);
		loadModelInstance(spec.modelUrl)
			.then((root) => {
				if (this.records.get(spec.key) !== record) {
					return;
				}
				normaliseModel(root, sizeM);
				if (typeof spec.yawRad === "number") {
					root.rotation.y = spec.yawRad;
				}
				if (typeof spec.tintHex === "number") {
					tintModel(root, spec.tintHex);
				}
				this.placeOne(root, record.lat, record.lng);
				this.group.add(root);
				record.root = root;
			})
			.catch(() => {
				// A missing entity model is non-fatal; it just won't appear. Drop the
				// whole record (and tear down any portal/ground already mounted) so a
				// later sync can cleanly re-create it - matching the original behaviour
				// where a failed load deleted the record outright (no orphaned VFX).
				if (this.records.get(spec.key) === record) {
					this.removeRecord(record);
					this.records.delete(spec.key);
				}
			});
	}

	private loadGround(spec: WorldEntitySpec, record: EntityRecord): void {
		const url = spec.groundTileUrl;
		if (!url) {
			return;
		}
		loadModelInstance(url)
			.then((ground) => {
				if (this.records.get(spec.key) !== record) {
					return;
				}
				normaliseGround(ground);
				this.placeOne(ground, record.lat, record.lng);
				this.group.add(ground);
				record.ground = ground;
			})
			.catch(() => {
				// Missing ground tile is non-fatal; the entity still renders.
			});
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
			if (record.ground) {
				this.placeOne(record.ground, lat, lng);
			}
		}
	}

	// Advance VFX animation (portal swirl). Driven from the render loop.
	update(dt: number): void {
		for (const record of this.records.values()) {
			record.portal?.update(dt);
		}
	}

	// Dispatch the entity nearest a click, if within the pick radius. Entities
	// without an event (decorative props, ground tiles) are not pickable.
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
			if (!record.event) {
				continue;
			}
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
