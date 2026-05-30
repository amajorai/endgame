// Static quest templates and reward tables for the quests system. Pure data.
// Selection is deterministic: the reducer seeds an RNG from the local date and
// picks a fixed-size subset of these templates per day/week.

import type { QuestKind } from "@/game/types";

// A quest template is a quest minus the runtime/identity fields the reducer
// fills in (id, progress, completed, claimed, expiresAt). "metric" tells the
// reducer how a quest's progress is tracked.
export type QuestMetric =
	// Progress is read directly off GameState every TICK (absolute observation).
	| "hold_hexes"
	| "mana_balance"
	| "journal_been"
	// Progress is push-only via inbound QUEST_PROGRESS events from other systems.
	| "gates_cleared"
	| "shrines_spun"
	| "bosses_felled";

export interface QuestTemplate {
	description: string;
	kind: QuestKind;
	metric: QuestMetric;
	rewardMana: number;
	rewardXp: number;
	target: number;
	templateId: string;
	title: string;
}

// Daily pool. The reducer picks DAILY_QUEST_COUNT of these each local day.
export const DAILY_QUEST_TEMPLATES: QuestTemplate[] = [
	{
		templateId: "daily_hold_3",
		kind: "daily",
		metric: "hold_hexes",
		title: "Stake Your Claim",
		description: "Hold 3 fully captured hexes.",
		target: 3,
		rewardMana: 40,
		rewardXp: 60,
	},
	{
		templateId: "daily_gates_2",
		kind: "daily",
		metric: "gates_cleared",
		title: "Gate Crawler",
		description: "Clear 2 gates.",
		target: 2,
		rewardMana: 60,
		rewardXp: 90,
	},
	{
		templateId: "daily_shrines_1",
		kind: "daily",
		metric: "shrines_spun",
		title: "Daily Devotion",
		description: "Spin a shrine beacon.",
		target: 1,
		rewardMana: 30,
		rewardXp: 40,
	},
	{
		templateId: "daily_been_2",
		kind: "daily",
		metric: "journal_been",
		title: "Wanderer's Log",
		description: "Visit 2 new places.",
		target: 2,
		rewardMana: 35,
		rewardXp: 45,
	},
	{
		templateId: "daily_mana_200",
		kind: "daily",
		metric: "mana_balance",
		title: "Mana Reservoir",
		description: "Bank 200 mana.",
		target: 200,
		rewardMana: 25,
		rewardXp: 30,
	},
	{
		templateId: "daily_boss_1",
		kind: "daily",
		metric: "bosses_felled",
		title: "Field Hunter",
		description: "Fell a field boss.",
		target: 1,
		rewardMana: 70,
		rewardXp: 110,
	},
];

// Weekly pool. The reducer picks WEEKLY_QUEST_COUNT of these each local week.
export const WEEKLY_QUEST_TEMPLATES: QuestTemplate[] = [
	{
		templateId: "weekly_hold_12",
		kind: "weekly",
		metric: "hold_hexes",
		title: "Territory Lord",
		description: "Hold 12 fully captured hexes.",
		target: 12,
		rewardMana: 200,
		rewardXp: 400,
	},
	{
		templateId: "weekly_gates_10",
		kind: "weekly",
		metric: "gates_cleared",
		title: "Gate Marshal",
		description: "Clear 10 gates this week.",
		target: 10,
		rewardMana: 260,
		rewardXp: 500,
	},
	{
		templateId: "weekly_shrines_5",
		kind: "weekly",
		metric: "shrines_spun",
		title: "Pilgrim's Path",
		description: "Spin 5 shrine beacons.",
		target: 5,
		rewardMana: 180,
		rewardXp: 320,
	},
	{
		templateId: "weekly_bosses_3",
		kind: "weekly",
		metric: "bosses_felled",
		title: "Monarch Slayer",
		description: "Fell 3 field bosses.",
		target: 3,
		rewardMana: 300,
		rewardXp: 600,
	},
];

// How many quests to surface from each pool.
export const DAILY_QUEST_COUNT = 3;
export const WEEKLY_QUEST_COUNT = 2;

// Want-To-Go reward (Gap-4): visiting a journalled wishlist place yields a rare
// deed material plus a Sanctum key. These land in resources.materials on claim.
export const WANT_TO_GO_REWARD_MANA = 80;
export const WANT_TO_GO_REWARD_XP = 140;
export const SANCTUM_KEY_MATERIAL = "sanctum_key";
export const RARE_DEED_MATERIAL = "rare_deed";
export const WANT_TO_GO_SANCTUM_KEYS = 1;
export const WANT_TO_GO_RARE_DEEDS = 1;

// Saturday Siege reward when the player holds the threshold of district hexes.
export const SIEGE_DURATION_MS = 6 * 60 * 60 * 1000; // 6h window
export const SIEGE_REWARD_MANA = 500;
