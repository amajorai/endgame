import type { GameEvent, SystemReducer } from "@/game/types";

// Local discriminated union of events this system owns. The global GameEvent
// union is open, so a Set-backed guard is required to narrow safely.
interface OnboardingEvent {
	type: "ONBOARD_COMPLETE";
	[k: string]: unknown;
}

const ONBOARDING_TYPES: ReadonlySet<string> = new Set(["ONBOARD_COMPLETE"]);

const isOnboardingEvent = (event: GameEvent): event is OnboardingEvent =>
	ONBOARDING_TYPES.has(event.type);

// Flips meta.onboarded to true once the player finishes (or skips) the intro.
export const onboardingReducer: SystemReducer = (state, event) => {
	if (!isOnboardingEvent(event)) {
		return state;
	}
	if (state.meta.onboarded) {
		return state;
	}
	return {
		...state,
		meta: { ...state.meta, onboarded: true },
	};
};
