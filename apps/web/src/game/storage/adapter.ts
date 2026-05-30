import type { GameEvent, GameState } from "@/game/types";

export const STORAGE_KEY = "endgame:snapshot:v1";

export interface StorageAdapter {
	appendEvent(event: GameEvent): Promise<void>;
	loadSnapshot(): Promise<GameState | null>;
	saveSnapshot(state: GameState): Promise<void>;
	subscribe(cb: (state: GameState) => void): () => void;
}
