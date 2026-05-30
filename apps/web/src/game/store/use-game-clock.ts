"use client";

import { useEffect } from "react";
import { TICK_MS } from "@/game/constants";
import { hydrate, useGameStore } from "@/game/store/store";

// Drives the game loop: hydrates once on mount, then dispatches a TICK every
// TICK_MS stamped with the current epoch-ms time. Cleans up on unmount.
export function useGameClock(): void {
	useEffect(() => {
		let cancelled = false;

		hydrate().catch(() => {
			// Hydration is best-effort; the store falls back to its initial state.
		});

		const interval = setInterval(() => {
			if (cancelled) {
				return;
			}
			useGameStore.getState().dispatch({ type: "TICK", now: Date.now() });
		}, TICK_MS);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);
}
