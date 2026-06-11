// Transient sprint stamina, mirrored out of the player controller so the HUD can
// render a live bar. It deliberately does NOT live in the event-sourced game
// store: that store persists on every dispatch, and the controller keeps all
// per-frame state (this, the jump arc) off that path. The controller writes here
// each frame via setSprintStamina; the SprintBar subscribes via
// useSyncExternalStore.
//
// `fraction` is the charge in the range 0..1, `sprinting` is whether sprint is
// actually engaged this frame (Shift + movement with charge left), and
// `exhausted` latches once the bar empties until it recovers past the threshold.

export interface SprintStaminaSnapshot {
	exhausted: boolean;
	fraction: number;
	sprinting: boolean;
}

const FULL: SprintStaminaSnapshot = {
	exhausted: false,
	fraction: 1,
	sprinting: false,
};

const PERCENT = 100;

const listeners = new Set<() => void>();

// `fraction` tracks the precise live value; `snapshot` is the cached object
// handed to React. getSnapshot must return a referentially-stable value when
// nothing changed, so we only mint a new snapshot when the displayed percent or
// a flag actually changes - this also caps re-renders at ~100 steps per drain.
let fraction = 1;
let snapshot: SprintStaminaSnapshot = FULL;

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

export function setSprintStamina(
	nextFraction: number,
	sprinting: boolean,
	exhausted: boolean
): void {
	const clamped = Math.min(1, Math.max(0, nextFraction));
	const percentChanged =
		Math.round(clamped * PERCENT) !== Math.round(fraction * PERCENT);
	fraction = clamped;
	if (
		!(percentChanged || sprinting !== snapshot.sprinting) &&
		exhausted === snapshot.exhausted
	) {
		// Sub-percent drift with no flag change: keep the precise value but skip
		// the re-render.
		return;
	}
	snapshot = { exhausted, fraction: clamped, sprinting };
	notify();
}

export function resetSprintStamina(): void {
	fraction = 1;
	snapshot = FULL;
	notify();
}

export function subscribeSprintStamina(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getSprintStaminaSnapshot(): SprintStaminaSnapshot {
	return snapshot;
}
