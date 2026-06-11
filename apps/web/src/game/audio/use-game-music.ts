"use client";

import { useEffect } from "react";
import { playMusic } from "@/game/audio/play";
import type { MusicName } from "@/game/audio/sound-map";
import { useGameState } from "@/game/store/store";

// Picks the background music track from game state and crossfades on change:
// the boss theme while a field boss is engaged, a battle theme during an active
// gate run, and the open-world wind ambience otherwise. The library ships no
// dedicated overworld melody, so ambient wind stands in for exploration.
//
// playMusic no-ops until audio is unlocked; the bus retries the pending track on
// the first user gesture, so ambient kicks in as soon as the player interacts.
export function useGameMusic(): void {
	const state = useGameState();
	const bossEngaged = state.activeBoss?.status === "engaged";
	const gateActive = state.activeGate?.status === "active";

	let track: MusicName = "ambient";
	if (bossEngaged) {
		track = "boss";
	} else if (gateActive) {
		track = "battle";
	}

	useEffect(() => {
		playMusic(track);
	}, [track]);
}
