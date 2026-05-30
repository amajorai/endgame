import { EVENT_COMPACTION_THRESHOLD } from "@/game/constants";
import type { StorageAdapter } from "@/game/storage/adapter";
import { STORAGE_KEY } from "@/game/storage/adapter";
import type { GameEvent, GameState } from "@/game/types";

const DB_NAME = "endgame";
const EVENT_STORE = "events";
const DB_VERSION = 1;

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
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(EVENT_STORE)) {
				db.createObjectStore(EVENT_STORE, { autoIncrement: true });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
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

const listeners = new Set<(state: GameState) => void>();

export const localAdapter: StorageAdapter = {
	loadSnapshot(): Promise<GameState | null> {
		if (!hasWindow()) {
			return Promise.resolve(null);
		}
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			console.log(`[FIX] load: raw=${raw === null ? "null" : raw.length}`);
			if (!raw) {
				return Promise.resolve(null);
			}
			return Promise.resolve(JSON.parse(raw) as GameState);
		} catch (err) {
			console.log(`[FIX] load.threw: ${String(err)}`);
			return Promise.resolve(null);
		}
	},

	async saveSnapshot(state: GameState): Promise<void> {
		if (hasWindow()) {
			try {
				const serialized = JSON.stringify(state);
				window.localStorage.setItem(STORAGE_KEY, serialized);
				console.log(`[FIX] save: len=${serialized.length}`);
			} catch (err) {
				console.log(`[FIX] save.threw: ${String(err)}`);
				// Quota or serialization failure: ignore, the in-memory state is source of truth.
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
