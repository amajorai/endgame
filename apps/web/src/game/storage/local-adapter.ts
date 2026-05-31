import { EVENT_COMPACTION_THRESHOLD } from "@/game/constants";
import type { StorageAdapter } from "@/game/storage/adapter";
import { STORAGE_KEY } from "@/game/storage/adapter";
import type { GameEvent, GameState } from "@/game/types";

const DB_NAME = "endgame";
const EVENT_STORE = "events";
const SNAPSHOT_STORE = "snapshot";
const OVERPASS_STORE = "overpass";
// Single record key for the snapshot store.
const SNAPSHOT_KEY = "current";
// Shared version across this module (events + snapshot) and content.ts
// (overpass). Every opener MUST use this version and create the full set of
// stores so whichever connection triggers the upgrade migrates completely.
const DB_VERSION = 3;

function hasWindow(): boolean {
	return typeof window !== "undefined";
}

function hasIndexedDb(): boolean {
	return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
	if (!hasIndexedDb()) {
		return Promise.resolve(null);
	}
	return new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => {
			console.log(`[FIX] openDb.error: ${String(request.error)}`);
			resolve(null);
		};
		request.onblocked = () => console.log("[FIX] openDb.blocked");
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(EVENT_STORE)) {
				db.createObjectStore(EVENT_STORE, { autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
				db.createObjectStore(SNAPSHOT_STORE);
			}
			if (!db.objectStoreNames.contains(OVERPASS_STORE)) {
				db.createObjectStore(OVERPASS_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
	});
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("IDB request failed"));
	});
}

async function appendEventToDb(event: GameEvent): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	const tx = db.transaction(EVENT_STORE, "readwrite");
	const store = tx.objectStore(EVENT_STORE);
	store.add(event);
	await new Promise<void>((resolve) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
		tx.onabort = () => resolve();
	});
	db.close();
}

async function countEvents(): Promise<number> {
	const db = await openDb();
	if (!db) {
		return 0;
	}
	const tx = db.transaction(EVENT_STORE, "readonly");
	const store = tx.objectStore(EVENT_STORE);
	const count = await promisifyRequest(store.count());
	db.close();
	return count;
}

async function clearEvents(): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	const tx = db.transaction(EVENT_STORE, "readwrite");
	tx.objectStore(EVENT_STORE).clear();
	await new Promise<void>((resolve) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
		tx.onabort = () => resolve();
	});
	db.close();
}

// Reads the snapshot from IndexedDB. Returns null if absent or on any failure.
async function readSnapshotFromDb(): Promise<GameState | null> {
	const db = await openDb();
	if (!db) {
		return null;
	}
	try {
		const tx = db.transaction(SNAPSHOT_STORE, "readonly");
		const result = await promisifyRequest<GameState | undefined>(
			tx.objectStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY)
		);
		return result ?? null;
	} catch {
		return null;
	} finally {
		db.close();
	}
}

// Reads a pre-IndexedDB snapshot left in localStorage by an earlier build, so
// existing players keep their progress on the first load after this migration.
function readLegacySnapshot(): GameState | null {
	if (!hasWindow()) {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return null;
		}
		return JSON.parse(raw) as GameState;
	} catch {
		return null;
	}
}

const listeners = new Set<(state: GameState) => void>();

export const localAdapter: StorageAdapter = {
	async loadSnapshot(): Promise<GameState | null> {
		if (!hasWindow()) {
			return null;
		}
		const fromDb = await readSnapshotFromDb();
		if (fromDb) {
			console.log(
				`[FIX] load: source=idb xp=${fromDb.player?.xp} hexes=${Object.keys(fromDb.meta?.contentCacheMeta ?? {}).length}`
			);
			return fromDb;
		}
		const legacy = readLegacySnapshot();
		console.log(
			`[FIX] load: source=${legacy ? "localStorage" : "none"} xp=${legacy?.player?.xp ?? "n/a"}`
		);
		return legacy;
	},

	async saveSnapshot(state: GameState): Promise<void> {
		if (hasWindow()) {
			const db = await openDb();
			if (!db) {
				console.log("[FIX] save: NO DB (indexedDB unavailable/blocked)");
			}
			if (db) {
				const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
				tx.objectStore(SNAPSHOT_STORE).put(state, SNAPSHOT_KEY);
				await new Promise<void>((resolve) => {
					tx.oncomplete = () => {
						console.log(`[FIX] save: idb ok xp=${state.player?.xp}`);
						resolve();
					};
					tx.onerror = () => {
						console.log(`[FIX] save.idberr: ${String(tx.error)}`);
						resolve();
					};
					tx.onabort = () => {
						console.log(`[FIX] save.idbabort: ${String(tx.error)}`);
						resolve();
					};
				});
				db.close();
				// The snapshot now lives in IndexedDB; drop any legacy localStorage
				// copy to reclaim that ~5MB-capped space.
				try {
					window.localStorage.removeItem(STORAGE_KEY);
				} catch {
					// Best-effort cleanup.
				}
			}
		}
		for (const listener of listeners) {
			listener(state);
		}
		// Compaction: once the event log grows large, the fresh snapshot supersedes it.
		const count = await countEvents();
		if (count > EVENT_COMPACTION_THRESHOLD) {
			await clearEvents();
		}
	},

	appendEvent(event: GameEvent): Promise<void> {
		if (!hasWindow()) {
			return Promise.resolve();
		}
		return appendEventToDb(event);
	},

	subscribe(cb: (state: GameState) => void): () => void {
		listeners.add(cb);
		return () => {
			listeners.delete(cb);
		};
	},
};
