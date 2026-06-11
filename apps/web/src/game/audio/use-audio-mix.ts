"use client";

import { useSyncExternalStore } from "react";
import { type AudioMix, audioBus } from "@/game/audio/audio-bus";

// Subscribe a component to the audio mix (volumes + mute). The bus owns the
// state and persists it; this just mirrors it into React.
export function useAudioMix(): AudioMix {
	return useSyncExternalStore(
		(listener) => audioBus.subscribe(listener),
		() => audioBus.getMix(),
		() => audioBus.getMix()
	);
}
