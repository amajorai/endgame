// Client-only audio bus. A single Web Audio graph drives every game sound:
//
//   sfx sources ─┐
//                ├─▶ sfxGain ──┐
//   (one-shots)  ┘             ├─▶ masterGain ─▶ destination
//   music <audio> ─▶ musicGain ┘
//
// One-shot SFX are decoded once into AudioBuffers and cached, then replayed from
// short-lived BufferSourceNodes (cheap, pooled by the browser). Music streams
// through an HTMLAudioElement so the multi-MB battle loops never block on a full
// decode. Volumes are split into master / music / sfx channels so the HUD can
// mix them independently, and the mix persists to localStorage.
//
// Everything is lazy and gesture-gated: the AudioContext is created on the first
// user gesture (browsers refuse to start audio before one), so this module is
// import-safe on the server and under React StrictMode double-mounts.

const STORAGE_KEY = "endgame.audio.mix.v1";
const DEFAULT_MIX: AudioMix = {
	master: 0.8,
	music: 0.5,
	sfx: 0.9,
	muted: false,
};
const MUSIC_FADE_MS = 800;

export interface AudioMix {
	master: number;
	music: number;
	muted: boolean;
	sfx: number;
}

function isClient(): boolean {
	return typeof window !== "undefined";
}

function loadMix(): AudioMix {
	if (!isClient()) {
		return { ...DEFAULT_MIX };
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return { ...DEFAULT_MIX };
		}
		const parsed = JSON.parse(raw) as Partial<AudioMix>;
		return {
			master: clamp01(parsed.master ?? DEFAULT_MIX.master),
			music: clamp01(parsed.music ?? DEFAULT_MIX.music),
			sfx: clamp01(parsed.sfx ?? DEFAULT_MIX.sfx),
			muted: Boolean(parsed.muted),
		};
	} catch {
		return { ...DEFAULT_MIX };
	}
}

function clamp01(value: number): number {
	if (Number.isNaN(value)) {
		return 0;
	}
	return Math.min(1, Math.max(0, value));
}

class AudioBus {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private musicGain: GainNode | null = null;
	private sfxGain: GainNode | null = null;

	// Decoded one-shot buffers, keyed by URL. A pending fetch shares one promise
	// so concurrent plays of the same sound don't double-fetch.
	private readonly buffers = new Map<string, AudioBuffer>();
	private readonly loading = new Map<string, Promise<AudioBuffer | null>>();

	// Throttle bookkeeping: last play time per sound key (ms, ctx clock based).
	private readonly lastPlayed = new Map<string, number>();

	// Music streams through a single element so switching tracks is a crossfade,
	// never a stack. Mirrors the player-controller's single-active-instance rule.
	private musicEl: HTMLAudioElement | null = null;
	private musicSrcNode: MediaElementAudioSourceNode | null = null;
	private currentMusicUrl: string | null = null;
	private desiredMusicUrl: string | null = null;
	private musicFadeTimer: ReturnType<typeof setTimeout> | null = null;

	private mix: AudioMix = loadMix();
	private readonly listeners = new Set<() => void>();

	// --- mix (volumes) -----------------------------------------------------

	getMix(): AudioMix {
		return this.mix;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	setChannel(channel: "master" | "music" | "sfx", value: number): void {
		this.mix = { ...this.mix, [channel]: clamp01(value) };
		this.persistAndApply();
	}

	setMuted(muted: boolean): void {
		this.mix = { ...this.mix, muted };
		this.persistAndApply();
	}

	private persistAndApply(): void {
		if (isClient()) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mix));
			} catch {
				// Persistence is best-effort.
			}
		}
		this.applyGains();
		this.notify();
	}

	private applyGains(): void {
		if (!(this.masterGain && this.musicGain && this.sfxGain)) {
			return;
		}
		const m = this.mix.muted ? 0 : this.mix.master;
		this.masterGain.gain.value = m;
		this.musicGain.gain.value = this.mix.music;
		this.sfxGain.gain.value = this.mix.sfx;
	}

	// --- lifecycle ---------------------------------------------------------

	// Create (or resume) the AudioContext. MUST be called from a user-gesture
	// handler the first time. Safe to call repeatedly.
	unlock(): void {
		if (!isClient()) {
			return;
		}
		if (!this.ctx) {
			const Ctor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (!Ctor) {
				return;
			}
			this.ctx = new Ctor();
			this.masterGain = this.ctx.createGain();
			this.musicGain = this.ctx.createGain();
			this.sfxGain = this.ctx.createGain();
			this.musicGain.connect(this.masterGain);
			this.sfxGain.connect(this.masterGain);
			this.masterGain.connect(this.ctx.destination);
			this.applyGains();
		}
		if (this.ctx.state === "suspended") {
			this.ctx.resume().catch(() => {
				// Resume can reject if no gesture yet; the next gesture retries.
			});
		}
		// A track requested before unlock (the music hook sets it on mount, before
		// the user clicks anything) was deferred; start it now that we have a
		// context. Also covers re-starting a paused element after a context resume.
		if (this.desiredMusicUrl && this.currentMusicUrl !== this.desiredMusicUrl) {
			this.startMusic(this.desiredMusicUrl);
		} else if (this.musicEl?.paused) {
			this.musicEl.play().catch(() => {
				// Still blocked; a later gesture retries.
			});
		}
	}

	// --- one-shot SFX ------------------------------------------------------

	private load(url: string): Promise<AudioBuffer | null> {
		const cached = this.buffers.get(url);
		if (cached) {
			return Promise.resolve(cached);
		}
		const pending = this.loading.get(url);
		if (pending) {
			return pending;
		}
		const ctx = this.ctx;
		if (!ctx) {
			return Promise.resolve(null);
		}
		const promise = (async () => {
			try {
				const res = await fetch(url);
				if (!res.ok) {
					return null;
				}
				const arr = await res.arrayBuffer();
				const buf = await ctx.decodeAudioData(arr);
				this.buffers.set(url, buf);
				return buf;
			} catch {
				return null;
			} finally {
				this.loading.delete(url);
			}
		})();
		this.loading.set(url, promise);
		return promise;
	}

	// Play a one-shot. `throttleKey`+`throttleMs` collapse rapid repeats (e.g. a
	// fast attack spam) into at most one play per window. `volume` is a 0..1
	// per-sound trim on top of the sfx channel. No-ops silently until a gesture
	// has created the context.
	playSfx(
		url: string,
		opts: { throttleKey?: string; throttleMs?: number; volume?: number } = {}
	): void {
		if (!this.ctx) {
			return;
		}
		// resume() is async, so the very first sound right after unlock() would
		// otherwise be dropped while the context is still flipping to "running".
		// Kick the resume here and gate on state at PLAY time below - by then the
		// async fetch+decode has elapsed and the context is live.
		if (this.ctx.state === "suspended") {
			this.ctx.resume().catch(() => {
				// No gesture yet / no audio device; the play-time guard skips it.
			});
		}
		const { throttleKey, throttleMs = 0, volume = 1 } = opts;
		if (throttleKey && throttleMs > 0) {
			const now = this.ctx.currentTime * 1000;
			const last = this.lastPlayed.get(throttleKey) ?? Number.NEGATIVE_INFINITY;
			if (now - last < throttleMs) {
				return;
			}
			this.lastPlayed.set(throttleKey, now);
		}
		this.load(url)
			.then((buffer) => {
				if (
					!(buffer && this.ctx && this.sfxGain) ||
					this.ctx.state !== "running"
				) {
					return;
				}
				const source = this.ctx.createBufferSource();
				source.buffer = buffer;
				if (volume === 1) {
					source.connect(this.sfxGain);
				} else {
					const trim = this.ctx.createGain();
					trim.gain.value = clamp01(volume);
					source.connect(trim);
					trim.connect(this.sfxGain);
				}
				source.start();
			})
			.catch(() => {
				// A failed decode/play is non-fatal; the sound is simply skipped.
			});
	}

	// --- music -------------------------------------------------------------

	// Request a looping music track, crossfading from whatever was playing.
	// Records the desired track and starts it immediately if the context already
	// exists; otherwise defers until the first gesture creates the context in
	// unlock(). This keeps `new AudioContext()` strictly on the gesture path (no
	// eager creation / "AudioContext was not allowed to start" warning at mount).
	playMusic(url: string): void {
		if (!isClient() || this.desiredMusicUrl === url) {
			return;
		}
		this.desiredMusicUrl = url;
		if (this.ctx) {
			this.startMusic(url);
		}
	}

	// Build the element + crossfade for a track. Assumes the context exists
	// (callers guarantee it). element.play() succeeds once the context resumes.
	private startMusic(url: string): void {
		if (!(this.ctx && this.musicGain) || this.currentMusicUrl === url) {
			return;
		}
		this.currentMusicUrl = url;

		const previous = this.musicEl;
		const previousSrc = this.musicSrcNode;
		if (this.musicFadeTimer) {
			clearTimeout(this.musicFadeTimer);
		}

		const el = new Audio(url);
		el.loop = true;
		el.crossOrigin = "anonymous";
		const srcNode = this.ctx.createMediaElementSource(el);
		const trackGain = this.ctx.createGain();
		trackGain.gain.value = 0;
		srcNode.connect(trackGain);
		trackGain.connect(this.musicGain);

		el.play().catch(() => {
			// Autoplay rejected (not yet unlocked); a later gesture will retry via
			// the next playMusic call from the music hook.
		});

		// Fade the new track in.
		const ctx = this.ctx;
		trackGain.gain.setValueAtTime(0, ctx.currentTime);
		trackGain.gain.linearRampToValueAtTime(
			1,
			ctx.currentTime + MUSIC_FADE_MS / 1000
		);

		this.musicEl = el;
		this.musicSrcNode = srcNode;

		// Tear the old element down after the crossfade window.
		if (previous) {
			this.musicFadeTimer = setTimeout(() => {
				previous.pause();
				previous.src = "";
				previousSrc?.disconnect();
			}, MUSIC_FADE_MS);
		}
	}

	stopMusic(): void {
		if (this.musicFadeTimer) {
			clearTimeout(this.musicFadeTimer);
		}
		this.currentMusicUrl = null;
		this.desiredMusicUrl = null;
		const el = this.musicEl;
		const src = this.musicSrcNode;
		this.musicEl = null;
		this.musicSrcNode = null;
		if (el) {
			el.pause();
			el.src = "";
		}
		src?.disconnect();
	}
}

export const audioBus = new AudioBus();
