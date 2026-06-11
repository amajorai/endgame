// Thin play API over the audio bus + sound map. Resolves a logical name to a
// concrete file (picking a random variant from a pool) and forwards to the bus.
// This is the single import every feature uses to make noise.

import { audioBus } from "@/game/audio/audio-bus";
import {
	MUSIC,
	type MusicName,
	SOUNDS,
	type SoundName,
} from "@/game/audio/sound-map";

interface PlayOpts {
	throttleMs?: number;
	volume?: number;
}

function resolve(name: SoundName): string {
	const value: string | readonly string[] = SOUNDS[name];
	if (Array.isArray(value)) {
		const pool = value as readonly string[];
		const index = Math.floor(Math.random() * pool.length);
		return pool[index] ?? pool[0];
	}
	return value as string;
}

// Play a logical sound. Pooled names auto-pick a variant. `throttleMs` collapses
// rapid repeats of the same logical name into one play per window.
export function playSound(name: SoundName, opts: PlayOpts = {}): void {
	const url = resolve(name);
	audioBus.playSfx(url, {
		throttleKey: opts.throttleMs ? name : undefined,
		throttleMs: opts.throttleMs,
		volume: opts.volume,
	});
}

export function playMusic(name: MusicName): void {
	audioBus.playMusic(MUSIC[name]);
}

export function stopMusic(): void {
	audioBus.stopMusic();
}

// Resume/create the context. Call from a user-gesture handler.
export function unlockAudio(): void {
	audioBus.unlock();
}
