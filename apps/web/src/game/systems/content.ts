// Content system: populates nearby gates and beacons around the player.
//
// PROCEDURAL (default) generation is synchronous and deterministic, seeded per
// hex via seededFromHex, so the same hex always yields the same content. The
// OVERPASS path enriches with real-world POIs via an async helper the panel /
// integration calls; results are folded back in through CONTENT_OVERPASS_RESULT.

import { HEX_VIEW_RING } from "@/game/constants";
import {
	BEACON_SPAWN_CHANCE,
	BEACON_TIER_WEIGHTS,
	GATE_SPAWN_CHANCE,
	labelForOsmTag,
	OSM_TAG_POOL,
	RANK_WEIGHTS,
	themeForOsmTag,
	weightedPick,
} from "@/game/data/content";
import { hexCenter, hexClassFor, hexDisk, posToHex } from "@/game/lib/hex";
import { seededFromHex } from "@/game/lib/rng";
import type {
	Beacon,
	Deed,
	GameEvent,
	GameState,
	Gate,
	SystemReducer,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Local discriminated union of content events (the GameEvent union is OPEN, so
// event.type === 'X' does NOT narrow payload fields without this guard).
// ---------------------------------------------------------------------------

interface ContentGenerateEvent {
	center?: { lat: number; lng: number };
	type: "CONTENT_GENERATE";
	[k: string]: unknown;
}

interface ContentOverpassResultEvent {
	beacons: Beacon[];
	gates: Gate[];
	type: "CONTENT_OVERPASS_RESULT";
	[k: string]: unknown;
}

type ContentEvent = ContentGenerateEvent | ContentOverpassResultEvent;

const CONTENT_TYPES = new Set<string>([
	"CONTENT_GENERATE",
	"CONTENT_OVERPASS_RESULT",
]);

function isContentEvent(event: GameEvent): event is ContentEvent {
	return CONTENT_TYPES.has(event.type);
}

function isMoveEvent(
	event: GameEvent
): event is { type: "MOVE"; lat: number; lng: number } {
	return event.type === "MOVE";
}

function isTickEvent(event: GameEvent): event is { type: "TICK"; now: number } {
	return event.type === "TICK";
}

// ---------------------------------------------------------------------------
// Deterministic procedural generation.
// ---------------------------------------------------------------------------

// Sub-seed stream offsets so independent decisions for one hex stay decorrelated.
const SPAWN_GATE = 0;
const TAG_PICK = 1;
const RANK_PICK = 2;
const STAR_PICK = 3;
const SPAWN_BEACON = 4;
const TIER_PICK = 5;

const MAX_STARS = 5;

// Draws n successive rolls from a hex's seeded stream and returns the nth.
function rollAt(hex: string, index: number): number {
	const rng = seededFromHex(hex);
	let value = rng();
	for (let i = 0; i < index; i++) {
		value = rng();
	}
	return value;
}

function buildGateForHex(hex: string): Gate {
	const tagPool = OSM_TAG_POOL;
	const tagRoll = rollAt(hex, TAG_PICK);
	const tag = tagPool[Math.floor(tagRoll * tagPool.length)] ?? tagPool[0];
	const rank = weightedPick(RANK_WEIGHTS, rollAt(hex, RANK_PICK));
	const stars = Math.floor(rollAt(hex, STAR_PICK) * (MAX_STARS + 1));
	const { lat, lng } = hexCenter(hex);
	return {
		hex,
		theme: tag.theme,
		rank,
		anchored: false,
		stars,
		lat,
		lng,
		name: `${tag.label} Gate`,
	};
}

function buildBeaconForHex(hex: string): Beacon {
	const tier = weightedPick(BEACON_TIER_WEIGHTS, rollAt(hex, TIER_PICK));
	const { lat, lng } = hexCenter(hex);
	return {
		id: `beacon:${hex}`,
		hex,
		tier,
		lat,
		lng,
	};
}

// Always-present gate for a wishlisted location (journal status want_to_go).
function buildGlowingGate(hex: string, lat: number, lng: number): Gate {
	const rank = weightedPick(RANK_WEIGHTS, rollAt(hex, RANK_PICK));
	return {
		hex,
		theme: "liminal",
		rank,
		anchored: true,
		stars: 0,
		lat,
		lng,
		name: "Glowing Gate",
	};
}

interface GeneratedBatch {
	beacons: Record<string, Beacon>;
	cacheMeta: Record<string, number>;
	changed: boolean;
	deeds: Record<string, Deed>;
	gates: Record<string, Gate>;
}

// Generates content for every hex within HEX_VIEW_RING of `centerHex` that has
// not already been generated (tracked via meta.contentCacheMeta). Pure: takes a
// snapshot of current maps and returns the additions plus a changed flag.
function generateAround(
	state: GameState,
	centerHex: string,
	now: number
): GeneratedBatch {
	const gates: Record<string, Gate> = {};
	const beacons: Record<string, Beacon> = {};
	const deeds: Record<string, Deed> = {};
	const cacheMeta: Record<string, number> = {};
	let changed = false;

	for (const hex of hexDisk(centerHex, HEX_VIEW_RING)) {
		if (state.meta.contentCacheMeta[hex] !== undefined) {
			continue;
		}
		cacheMeta[hex] = now;
		changed = true;

		if (rollAt(hex, SPAWN_GATE) < GATE_SPAWN_CHANCE && !state.gates[hex]) {
			gates[hex] = buildGateForHex(hex);
		}

		const beaconId = `beacon:${hex}`;
		if (
			rollAt(hex, SPAWN_BEACON) < BEACON_SPAWN_CHANCE &&
			!state.beacons[beaconId]
		) {
			beacons[beaconId] = buildBeaconForHex(hex);
		}

		// Tag control points / sanctums onto deeds that are not yet recorded, so
		// the map can surface them even before the player visits.
		const hexClass = hexClassFor(hex);
		if (hexClass !== "wildland" && !state.deeds[hex]) {
			deeds[hex] = {
				hex,
				owner: "neutral",
				hexClass,
				capturePct: 0,
				capturedAt: null,
				lastVisited: now,
			};
		}
	}

	return { gates, beacons, deeds, cacheMeta, changed };
}

// Wishlisted journal entries (want_to_go) always host a Glowing Gate.
function applyWishlistGates(
	state: GameState,
	gates: Record<string, Gate>
): boolean {
	let changed = false;
	for (const entry of Object.values(state.journal)) {
		if (entry.status !== "want_to_go") {
			continue;
		}
		if (state.gates[entry.hex] || gates[entry.hex]) {
			continue;
		}
		gates[entry.hex] = buildGlowingGate(entry.hex, entry.lat, entry.lng);
		changed = true;
	}
	return changed;
}

function foldBatch(state: GameState, batch: GeneratedBatch): GameState {
	const wishlistChanged = applyWishlistGates(state, batch.gates);
	if (!(batch.changed || wishlistChanged)) {
		return state;
	}
	return {
		...state,
		gates: { ...state.gates, ...batch.gates },
		beacons: { ...state.beacons, ...batch.beacons },
		deeds: { ...state.deeds, ...batch.deeds },
		meta: {
			...state.meta,
			contentCacheMeta: {
				...state.meta.contentCacheMeta,
				...batch.cacheMeta,
			},
		},
	};
}

// ---------------------------------------------------------------------------
// Reducer.
// ---------------------------------------------------------------------------

// Folds an async Overpass result into the gates/beacons maps. Pure.
function foldOverpassResult(
	state: GameState,
	event: ContentOverpassResultEvent
): GameState {
	if (event.gates.length === 0 && event.beacons.length === 0) {
		return state;
	}
	const gates = { ...state.gates };
	const beacons = { ...state.beacons };
	const cacheMeta = { ...state.meta.contentCacheMeta };
	for (const gate of event.gates) {
		gates[gate.hex] = gate;
		cacheMeta[gate.hex] = state.lastTick;
	}
	for (const beacon of event.beacons) {
		beacons[beacon.id] = beacon;
		cacheMeta[beacon.hex] = state.lastTick;
	}
	return {
		...state,
		gates,
		beacons,
		meta: { ...state.meta, contentCacheMeta: cacheMeta },
	};
}

function reduceContentEvent(state: GameState, event: ContentEvent): GameState {
	if (event.type === "CONTENT_GENERATE") {
		const centerHex = event.center
			? posToHex(event.center.lat, event.center.lng)
			: state.position.hex;
		return foldBatch(state, generateAround(state, centerHex, state.lastTick));
	}
	return foldOverpassResult(state, event);
}

export const contentReducer: SystemReducer = (state, event) => {
	// MOVE: generate around the freshly-entered hex.
	if (isMoveEvent(event)) {
		const centerHex = posToHex(event.lat, event.lng);
		return foldBatch(state, generateAround(state, centerHex, state.lastTick));
	}

	if (isContentEvent(event)) {
		return reduceContentEvent(state, event);
	}

	// First TICK with an empty world: seed content around the player so the
	// Explore panel is never blank before the first move.
	if (
		isTickEvent(event) &&
		Object.keys(state.meta.contentCacheMeta).length === 0
	) {
		return foldBatch(
			state,
			generateAround(state, state.position.hex, event.now)
		);
	}

	return state;
};

// ---------------------------------------------------------------------------
// Overpass enrichment (async, called from the panel / integration; the reducer
// stays pure). Results are CACHED in IndexedDB (db 'endgame', store 'overpass')
// keyed by a coarse lat/lng cell so offline replay reuses them. Falls back to
// procedural (caller keeps procedural as default) on any network error.
// ---------------------------------------------------------------------------

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DB_NAME = "endgame";
const OVERPASS_STORE = "overpass";
// Bump when the overpass store is added to the existing 'endgame' db. The spine
// created the db at version 1 with only the 'events' store.
const DB_VERSION = 2;
// Radius (meters) of the Overpass query around the player.
const QUERY_RADIUS_M = 1200;
// Coarse rounding for the cache key so nearby positions share a cached response.
const CACHE_PRECISION = 1000;
// Cached responses older than this are considered stale (7 days).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface OverpassElement {
	center?: { lat: number; lon: number };
	id: number;
	lat?: number;
	lon?: number;
	tags?: Record<string, string>;
	type: string;
}

interface OverpassResponse {
	elements: OverpassElement[];
}

interface CachedOverpass {
	fetchedAt: number;
	response: OverpassResponse;
}

export interface OverpassContent {
	beacons: Beacon[];
	gates: Gate[];
}

function cacheKey(lat: number, lng: number): string {
	const rLat = Math.round(lat * CACHE_PRECISION) / CACHE_PRECISION;
	const rLng = Math.round(lng * CACHE_PRECISION) / CACHE_PRECISION;
	return `${rLat},${rLng}`;
}

function openOverpassDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") {
		return Promise.resolve(null);
	}
	return new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains("events")) {
				db.createObjectStore("events", { autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(OVERPASS_STORE)) {
				db.createObjectStore(OVERPASS_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
}

function readCache(key: string): Promise<CachedOverpass | null> {
	return new Promise((resolve) => {
		openOverpassDb().then((db) => {
			if (!db) {
				resolve(null);
				return;
			}
			const tx = db.transaction(OVERPASS_STORE, "readonly");
			const req = tx.objectStore(OVERPASS_STORE).get(key);
			req.onsuccess = () => {
				db.close();
				resolve((req.result as CachedOverpass | undefined) ?? null);
			};
			req.onerror = () => {
				db.close();
				resolve(null);
			};
		});
	});
}

function writeCache(key: string, value: CachedOverpass): Promise<void> {
	return new Promise((resolve) => {
		openOverpassDb().then((db) => {
			if (!db) {
				resolve();
				return;
			}
			const tx = db.transaction(OVERPASS_STORE, "readwrite");
			tx.objectStore(OVERPASS_STORE).put(value, key);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => {
				db.close();
				resolve();
			};
			tx.onabort = () => {
				db.close();
				resolve();
			};
		});
	});
}

function buildQuery(lat: number, lng: number): string {
	const around = `(around:${QUERY_RADIUS_M},${lat},${lng})`;
	// Mirror the tags the design doc maps to themes.
	const filters = [
		`node["amenity"~"cafe|restaurant|fast_food|library|school|university|college|place_of_worship|hospital|bus_station"]${around}`,
		`node["leisure"~"park|garden|fitness_centre|sports_centre|pitch"]${around}`,
		`node["shop"~"convenience|supermarket"]${around}`,
		`node["railway"~"station|subway_entrance"]${around}`,
		`node["historic"~"monument|memorial"]${around}`,
		`node["tourism"="museum"]${around}`,
	];
	return `[out:json][timeout:25];(${filters.join(";")};);out center;`;
}

// Picks the most specific theme-bearing tag on an element.
const TAG_KEYS = [
	"amenity",
	"leisure",
	"shop",
	"railway",
	"historic",
	"tourism",
	"natural",
	"man_made",
];

function primaryTag(tags: Record<string, string>): string | null {
	for (const key of TAG_KEYS) {
		const value = tags[key];
		if (value) {
			return `${key}=${value}`;
		}
	}
	return null;
}

function elementToGate(element: OverpassElement): Gate | null {
	const lat = element.lat ?? element.center?.lat;
	const lon = element.lon ?? element.center?.lon;
	const tags = element.tags;
	if (lat === undefined || lon === undefined || !tags) {
		return null;
	}
	const tagKey = primaryTag(tags);
	if (!tagKey) {
		return null;
	}
	const hex = posToHex(lat, lon);
	const rank = weightedPick(RANK_WEIGHTS, rollAt(hex, RANK_PICK));
	const stars = Math.floor(rollAt(hex, STAR_PICK) * (MAX_STARS + 1));
	const named = tags.name ? tags.name : labelForOsmTag(tagKey);
	const { lat: cLat, lng: cLng } = hexCenter(hex);
	return {
		hex,
		theme: themeForOsmTag(tagKey),
		rank,
		anchored: false,
		stars,
		lat: cLat,
		lng: cLng,
		name: `${named} Gate`,
	};
}

function responseToContent(response: OverpassResponse): OverpassContent {
	const gateByHex = new Map<string, Gate>();
	const beaconById = new Map<string, Beacon>();
	for (const element of response.elements) {
		const gate = elementToGate(element);
		if (!gate) {
			continue;
		}
		gateByHex.set(gate.hex, gate);
		// Sacred POIs additionally seed a shrine beacon for spinning.
		if (gate.theme === "sacred") {
			const id = `beacon:${gate.hex}`;
			beaconById.set(id, {
				id,
				hex: gate.hex,
				tier: "shrine",
				lat: gate.lat,
				lng: gate.lng,
			});
		}
	}
	return {
		gates: Array.from(gateByHex.values()),
		beacons: Array.from(beaconById.values()),
	};
}

// Fetches + maps Overpass POIs around a position, using the IndexedDB cache when
// a fresh entry exists. Throws on network/parse failure so the caller can fall
// back to procedural. Exported for the panel / integration to call, then dispatch
// CONTENT_OVERPASS_RESULT with the result.
export async function fetchOverpassContent(
	lat: number,
	lng: number
): Promise<OverpassContent> {
	const key = cacheKey(lat, lng);
	const cached = await readCache(key);
	const now = Date.now();
	if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
		return responseToContent(cached.response);
	}

	const body = buildQuery(lat, lng);
	const res = await fetch(OVERPASS_URL, {
		method: "POST",
		headers: { "Content-Type": "text/plain" },
		body,
	});
	if (!res.ok) {
		// Stale cache is better than nothing on a soft failure.
		if (cached) {
			return responseToContent(cached.response);
		}
		throw new Error(`Overpass request failed: ${res.status}`);
	}
	const json = (await res.json()) as OverpassResponse;
	await writeCache(key, { fetchedAt: now, response: json });
	return responseToContent(json);
}
