// Maps game events to sound effects. This is an explicit ALLOWLIST: the dispatch
// funnel also carries per-tick events (TICK, GATE_TICK, BOSS_TICK) and per-frame
// movers (GATE_ENEMY_MOVE, BOSS_MOVE, GHOST_MOVE, AMBIENT_COLLECT) that would
// machine-gun the speakers, so only the events listed here ever make noise.
// Rapid-but-legitimate events (attacks, taps) carry a throttle window.

import { playSound } from "@/game/audio/play";
import type { SoundName } from "@/game/audio/sound-map";
import type { GameEvent, GameState } from "@/game/types";

interface SfxSpec {
	sound: SoundName;
	throttleMs?: number;
}

// 1:1 event-type to sound mappings. Anything not listed is silent by design.
const EVENT_SFX: Record<string, SfxSpec> = {
	// economy / pickups
	COLLECT_MANA: { sound: "collect_mana", throttleMs: 100 },
	CLAIM_PROGRESS: { sound: "claim_progress", throttleMs: 150 },
	SUPPLY_CLAIM: { sound: "collect_supply" },
	SOUL_CACHE_RECLAIM: { sound: "collect_mana" },

	// progression
	GAIN_XP: { sound: "gain_xp", throttleMs: 200 },
	STAT_ALLOCATE: { sound: "stat_allocate", throttleMs: 80 },
	SKILL_UNLOCK: { sound: "skill_unlock" },
	POWER_UNLOCK: { sound: "power_unlock" },
	POWER_EQUIP: { sound: "power_equip" },
	RESPEC: { sound: "respec" },

	// world interactions
	BEACON_CLAIM: { sound: "beacon_claim" },
	BEACON_SPIN: { sound: "beacon_spin" },
	CHEST_OPEN: { sound: "chest_open" },
	BUILDING_BUILD: { sound: "building_build" },
	BUILDING_TAP: { sound: "building_tap", throttleMs: 120 },
	WORLD_TAP_HEX: { sound: "world_tap", throttleMs: 100 },
	VEHICLE_ACQUIRE: { sound: "ui_confirm" },
	VEHICLE_USE: { sound: "ui_click" },

	// items / crafting
	ITEM_CRAFT: { sound: "item_craft" },
	ITEM_EQUIP: { sound: "item_equip" },
	ITEM_DROP: { sound: "item_drop" },
	ITEM_USE: { sound: "item_use" },

	// farming
	PLOT_PLANT: { sound: "plant" },
	PLOT_HARVEST: { sound: "harvest" },
	PLOT_BUILD: { sound: "building_build" },
	PLOT_TAP: { sound: "building_tap", throttleMs: 120 },
	PLOT_ASSIGN_SHADOW: { sound: "shadow_summon" },

	// shadows / ghost
	SHADOW_EXTRACT: { sound: "shadow_extract" },
	SHADOW_ASSIGN: { sound: "shadow_summon" },
	SHADOW_RECALL: { sound: "shadow_summon" },
	SHADOW_RENAME: { sound: "ui_click" },
	GHOST_TOGGLE: { sound: "ghost_toggle" },

	// quests
	QUEST_CLAIM: { sound: "quest_claim" },
	QUEST_PROGRESS: { sound: "quest_progress", throttleMs: 300 },
	QUEST_TRACK: { sound: "quest_track" },

	// combat - gates
	GATE_ENTER: { sound: "gate_enter" },
	GATE_EXIT: { sound: "gate_exit" },
	GATE_ATTACK: { sound: "attack", throttleMs: 110 },
	GATE_DODGE: { sound: "dodge", throttleMs: 150 },
	GATE_SKILL: { sound: "attack_skill", throttleMs: 150 },
	GATE_USE_POTION: { sound: "potion" },
	ATTACK_NEAREST: { sound: "attack", throttleMs: 110 },

	// combat - bosses
	BOSS_SPAWN: { sound: "boss_spawn" },
	BOSS_ENGAGE: { sound: "boss_engage" },
	BOSS_ATTACK: { sound: "attack", throttleMs: 110 },
	BOSS_DODGE: { sound: "dodge", throttleMs: 150 },
	BOSS_SKILL: { sound: "attack_skill", throttleMs: 150 },
	BOSS_DEFEAT: { sound: "boss_defeat" },
	BOSS_FLEE: { sound: "gate_exit" },

	// onboarding
	ONBOARD_COMPLETE: { sound: "onboard_complete" },
};

// HYDRATE swaps the entire state in one shot; running diff-based sounds against
// it would fire a burst of spurious stingers, so diffs are skipped for it.
const SKIP_DIFF_EVENTS = new Set(["HYDRATE", "CONTENT_GENERATE"]);

function countAlive(state: GameState): number {
	const enemies = state.activeGate?.enemies;
	if (!enemies) {
		return 0;
	}
	let alive = 0;
	for (const enemy of enemies) {
		if (enemy.hp > 0) {
			alive += 1;
		}
	}
	return alive;
}

// Emit any sounds for an event, given the state before and after the reducer.
// Called from the store dispatch funnel after the new state is computed.
export function emitEventSfx(
	event: GameEvent,
	prev: GameState,
	next: GameState
): void {
	const spec = EVENT_SFX[event.type];
	if (spec) {
		playSound(spec.sound, { throttleMs: spec.throttleMs });
	}

	if (SKIP_DIFF_EVENTS.has(event.type)) {
		return;
	}

	// Milestone stingers driven by state diffs - more reliable than guessing
	// which event triggered the level/rank change.
	if (next.player.level > prev.player.level) {
		playSound("level_up");
	}
	if (next.player.rank !== prev.player.rank) {
		playSound("rank_up");
	}

	// A gate enemy died this dispatch. The gate system keeps defeated enemies in
	// the array with hp:0 (it never splices), so compare the count of LIVING
	// enemies rather than array length.
	const prevAlive = countAlive(prev);
	const nextAlive = countAlive(next);
	if (next.activeGate?.status === "active" && nextAlive < prevAlive) {
		playSound("enemy_defeat", { throttleMs: 90 });
	}

	// Gate run resolved this dispatch.
	if (prev.activeGate?.status === "active") {
		if (next.activeGate?.status === "won") {
			playSound("victory");
		} else if (next.activeGate?.status === "lost") {
			playSound("defeat");
		}
	}
}
