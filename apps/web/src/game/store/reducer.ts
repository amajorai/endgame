import { beaconsLootReducer } from "@/game/systems/beacons-loot";
import { contentReducer } from "@/game/systems/content";
import { debugAdminReducer } from "@/game/systems/debug-admin";
import { estatesReducer } from "@/game/systems/estates";
import { farmingReducer } from "@/game/systems/farming";
import { fieldBossReducer } from "@/game/systems/field-boss";
import { gateCombatReducer } from "@/game/systems/gate-combat";
import { ghostReducer } from "@/game/systems/ghost-mode";
import { inventoryReducer } from "@/game/systems/inventory";
import { onboardingReducer } from "@/game/systems/onboarding";
import { progressionReducer } from "@/game/systems/powers-progression";
import { questsReducer } from "@/game/systems/quests";
import { shadowsReducer } from "@/game/systems/shadows";
import {
	captureReducer,
	clockReducer,
	gpsDebugReducer,
	journalReducer,
	manaReducer,
	movementReducer,
} from "@/game/systems/spine";
import { weatherReducer } from "@/game/systems/weather";
import type { GameEvent, GameState, SystemReducer } from "@/game/types";
import { isSpineEvent } from "@/game/types";

// Ordered reducer registry. movementReducer runs first so position settles, then
// contentReducer seeds new hexes before any system reads them. The spine
// capture/mana/journal/gpsDebug reducers keep their positions; all amplifier
// reducers run after gpsDebugReducer and before clockReducer (which must stay
// LAST so accrual reducers read the elapsed delta against the previous lastTick).
// estatesReducer is placed before the loot/inventory reducers so any system that
// reads estate bonuses sees an up-to-date estates array.
export const reducers: SystemReducer[] = [
	movementReducer,
	contentReducer,
	captureReducer,
	manaReducer,
	journalReducer,
	gpsDebugReducer,
	gateCombatReducer,
	progressionReducer,
	estatesReducer,
	beaconsLootReducer,
	farmingReducer,
	shadowsReducer,
	weatherReducer,
	fieldBossReducer,
	questsReducer,
	ghostReducer,
	inventoryReducer,
	onboardingReducer,
	debugAdminReducer,
	clockReducer,
];

export function rootReduce(state: GameState, event: GameEvent): GameState {
	// HYDRATE replaces the whole state wholesale.
	if (isSpineEvent(event) && event.type === "HYDRATE") {
		return event.state;
	}
	let next = state;
	for (const reducer of reducers) {
		next = reducer(next, event);
	}
	return next;
}
