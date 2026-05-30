// Quests system: daily/weekly/want-to-go quest generation, state-observed and
// push-driven progress, claim rewards, and a Saturday Siege lifecycle stub.
//
// All generation is boundary-gated on TICK so the per-second tick is idempotent:
// when no day/week/siege boundary crosses and no observed progress changes, the
// reducer returns the SAME state reference (no spread, no re-persist).

import {
	DAILY_QUEST_COUNT,
	DAILY_QUEST_TEMPLATES,
	type QuestMetric,
	type QuestTemplate,
	RARE_DEED_MATERIAL,
	SANCTUM_KEY_MATERIAL,
	SIEGE_DURATION_MS,
	WANT_TO_GO_RARE_DEEDS,
	WANT_TO_GO_REWARD_MANA,
	WANT_TO_GO_REWARD_XP,
	WANT_TO_GO_SANCTUM_KEYS,
	WEEKLY_QUEST_COUNT,
	WEEKLY_QUEST_TEMPLATES,
} from "@/game/data/quests";
import { hashStringToInt, mulberry32 } from "@/game/lib/rng";
import type {
	GameEvent,
	GameState,
	Quest,
	Siege,
	SystemReducer,
} from "@/game/types";

const FULL_CAPTURE = 100;
const DAYS_PER_WEEK = 7;
const SATURDAY = 6; // Date.getDay(): 0=Sun .. 6=Sat
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Local event union + guard. The open GameEvent union does NOT narrow custom
// payload fields, so we declare and guard our own events explicitly.
// ---------------------------------------------------------------------------

type QuestEvent =
	| { type: "QUEST_PROGRESS"; questId: string; amount: number }
	| { type: "QUEST_CLAIM"; questId: string }
	| { type: "QUEST_TRACK"; metric: QuestMetric; amount: number };

const QUEST_EVENT_TYPES: Set<string> = new Set([
	"QUEST_PROGRESS",
	"QUEST_CLAIM",
	"QUEST_TRACK",
]);

const isQuestEvent = (event: GameEvent): event is QuestEvent =>
	QUEST_EVENT_TYPES.has(event.type);

// Metrics whose progress is observed directly off GameState each TICK. The rest
// are push-only: other systems dispatch QUEST_PROGRESS to advance them.
const OBSERVED_METRICS: Set<QuestMetric> = new Set<QuestMetric>([
	"hold_hexes",
	"mana_balance",
	"journal_been",
]);

// We persist the template metric inside the quest id so TICK observation can map
// a live quest back to how it should be tracked, without adding a Quest field.
function questIdFor(templateId: string, periodKey: string): string {
	return `${templateId}@${periodKey}`;
}

function metricOfQuest(
	quest: Quest,
	templates: QuestTemplate[]
): QuestMetric | null {
	const templateId = quest.id.split("@")[0];
	const template = templates.find((t) => t.templateId === templateId);
	return template?.metric ?? null;
}

// ---------------------------------------------------------------------------
// Local-time period helpers. Date math uses the local timezone so "midnight" and
// "Sunday" match the player's wall clock.
// ---------------------------------------------------------------------------

function startOfLocalDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function startOfLocalWeek(ts: number): number {
	// Week starts Sunday (matches getDay()===0 boundary).
	const dayStart = startOfLocalDay(ts);
	const dow = new Date(dayStart).getDay();
	return dayStart - dow * MS_PER_DAY;
}

function localDayKey(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function localWeekKey(ts: number): string {
	return `w:${localDayKey(startOfLocalWeek(ts))}`;
}

// ---------------------------------------------------------------------------
// Deterministic template selection. Same period key => same picks.
// ---------------------------------------------------------------------------

function pickTemplates(
	pool: QuestTemplate[],
	count: number,
	seedKey: string
): QuestTemplate[] {
	const rng = mulberry32(hashStringToInt(seedKey));
	const shuffled = [...pool];
	for (let i = shuffled.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = tmp;
	}
	return shuffled.slice(0, Math.min(count, shuffled.length));
}

function questFromTemplate(
	template: QuestTemplate,
	periodKey: string,
	expiresAt: number | undefined
): Quest {
	return {
		id: questIdFor(template.templateId, periodKey),
		kind: template.kind,
		title: template.title,
		description: template.description,
		target: template.target,
		progress: 0,
		rewardMana: template.rewardMana,
		rewardXp: template.rewardXp,
		completed: false,
		claimed: false,
		expiresAt,
	};
}

// ---------------------------------------------------------------------------
// Observed-progress evaluation.
// ---------------------------------------------------------------------------

function ownedHexCount(state: GameState): number {
	let count = 0;
	for (const deed of Object.values(state.deeds)) {
		if (deed.owner === "player" && deed.capturePct >= FULL_CAPTURE) {
			count += 1;
		}
	}
	return count;
}

function beenJournalCount(state: GameState): number {
	let count = 0;
	for (const entry of Object.values(state.journal)) {
		if (entry.status === "been") {
			count += 1;
		}
	}
	return count;
}

function observedProgress(
	metric: QuestMetric,
	quest: Quest,
	state: GameState
): number {
	if (metric === "hold_hexes") {
		return ownedHexCount(state);
	}
	if (metric === "mana_balance") {
		return Math.floor(state.resources.mana);
	}
	if (metric === "journal_been") {
		return beenJournalCount(state);
	}
	// Push-only metric: leave existing progress untouched.
	return quest.progress;
}

function withProgress(quest: Quest, rawProgress: number): Quest {
	const progress = Math.max(0, Math.min(quest.target, rawProgress));
	const completed = progress >= quest.target;
	if (progress === quest.progress && completed === quest.completed) {
		return quest;
	}
	return { ...quest, progress, completed };
}

// ---------------------------------------------------------------------------
// Want-To-Go quests, generated from journal "want_to_go" entries.
// ---------------------------------------------------------------------------

const WANT_TO_GO_PREFIX = "wtg:";

function wantToGoQuestId(entryId: string): string {
	return `${WANT_TO_GO_PREFIX}${entryId}`;
}

function buildWantToGoQuests(state: GameState, existing: Quest[]): Quest[] {
	const byId = new Map(existing.map((q) => [q.id, q]));
	const wishlist = Object.values(state.journal).filter(
		(e) => e.status === "want_to_go"
	);
	const result: Quest[] = [];
	for (const entry of wishlist) {
		const id = wantToGoQuestId(entry.id);
		const prior = byId.get(id);
		if (prior) {
			// Preserve runtime progress/claim on still-valid wishlist entries.
			result.push(prior);
			continue;
		}
		const placeName = entry.name || entry.hex;
		result.push({
			id,
			kind: "want_to_go",
			title: `Pilgrimage: ${placeName}`,
			description: `Travel to ${placeName} to claim a rare deed and a Sanctum key.`,
			target: 1,
			progress: 0,
			rewardMana: WANT_TO_GO_REWARD_MANA,
			rewardXp: WANT_TO_GO_REWARD_XP,
			completed: false,
			claimed: false,
			hex: entry.hex,
		});
	}
	// Mark want_to_go quests complete once the player has "been" to that hex.
	const beenHexes = new Set(
		Object.values(state.journal)
			.filter((e) => e.status === "been")
			.map((e) => e.hex)
	);
	return result.map((q) => {
		if (q.completed || !q.hex || !beenHexes.has(q.hex)) {
			return q;
		}
		return { ...q, progress: q.target, completed: true };
	});
}

function wantToGoChanged(prev: Quest[], next: Quest[]): boolean {
	if (prev.length !== next.length) {
		return true;
	}
	for (let i = 0; i < prev.length; i += 1) {
		if (prev[i] !== next[i]) {
			return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// Saturday Siege lifecycle.
// ---------------------------------------------------------------------------

const SIEGE_HEX_THRESHOLD = 5;

function siegeIdFor(weekKey: string): string {
	return `siege:${weekKey}`;
}

function maybeStartSiege(state: GameState, now: number): Siege[] {
	const isSaturday = new Date(now).getDay() === SATURDAY;
	if (!isSaturday) {
		return state.meta.sieges;
	}
	const weekKey = localWeekKey(now);
	const id = siegeIdFor(weekKey);
	if (state.meta.sieges.some((s) => s.id === id)) {
		return state.meta.sieges;
	}
	const playerHexes = ownedHexCount(state);
	const siege: Siege = {
		id,
		district: state.position.hex,
		active: playerHexes >= SIEGE_HEX_THRESHOLD,
		startsAt: now,
		endsAt: now + SIEGE_DURATION_MS,
		playerHexes,
	};
	return [...state.meta.sieges, siege];
}

function resolveSieges(sieges: Siege[], now: number): Siege[] {
	let changed = false;
	const next = sieges.map((s) => {
		if (s.active && now > s.endsAt) {
			changed = true;
			return { ...s, active: false };
		}
		return s;
	});
	return changed ? next : sieges;
}

// ---------------------------------------------------------------------------
// Reward granting on claim.
// ---------------------------------------------------------------------------

function addMaterial(
	materials: Record<string, number>,
	key: string,
	amount: number
): Record<string, number> {
	return { ...materials, [key]: (materials[key] ?? 0) + amount };
}

function grantRewards(state: GameState, quest: Quest): GameState {
	let materials = state.resources.materials;
	if (quest.kind === "want_to_go") {
		materials = addMaterial(
			materials,
			SANCTUM_KEY_MATERIAL,
			WANT_TO_GO_SANCTUM_KEYS
		);
		materials = addMaterial(
			materials,
			RARE_DEED_MATERIAL,
			WANT_TO_GO_RARE_DEEDS
		);
	}
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + quest.rewardMana,
			materials,
		},
		player: { ...state.player, xp: state.player.xp + quest.rewardXp },
	};
}

// ---------------------------------------------------------------------------
// TICK handler: generation + observation + siege lifecycle.
// ---------------------------------------------------------------------------

function handleTick(state: GameState, now: number): GameState {
	const dailyBoundary = startOfLocalDay(now);
	const weekBoundary = startOfLocalWeek(now);
	const periodDayKey = localDayKey(now);

	// Generate when the period boundary has crossed OR no quest exists for the
	// current period yet. The latter clause self-heals a cold start, where the
	// init stamp equals "now" yet zero quests were ever generated.
	const hasTodayDaily = state.meta.quests.some(
		(q) => q.kind === "daily" && q.id.endsWith(`@${periodDayKey}`)
	);
	const needsDaily =
		state.meta.daily.lastDailyQuestReset < dailyBoundary || !hasTodayDaily;

	// The week key rolls over on Sunday via startOfLocalWeek, so "no quest for
	// this week key" already encodes the weekly boundary condition.
	const weekKey = localWeekKey(now);
	const hasThisWeekly = state.meta.quests.some(
		(q) => q.kind === "weekly" && q.id.endsWith(`@${weekKey}`)
	);
	const needsWeekly = !hasThisWeekly;

	// Partition existing quests by kind.
	const dailies = state.meta.quests.filter((q) => q.kind === "daily");
	const weeklies = state.meta.quests.filter((q) => q.kind === "weekly");
	const wantToGo = state.meta.quests.filter((q) => q.kind === "want_to_go");
	const story = state.meta.quests.filter((q) => q.kind === "story");

	let nextDailies = dailies;
	if (needsDaily) {
		const picks = pickTemplates(
			DAILY_QUEST_TEMPLATES,
			DAILY_QUEST_COUNT,
			`daily:${periodDayKey}`
		);
		nextDailies = picks.map((t) =>
			questFromTemplate(t, periodDayKey, dailyBoundary + MS_PER_DAY)
		);
	}

	let nextWeeklies = weeklies;
	if (needsWeekly) {
		const picks = pickTemplates(
			WEEKLY_QUEST_TEMPLATES,
			WEEKLY_QUEST_COUNT,
			`weekly:${weekKey}`
		);
		nextWeeklies = picks.map((t) =>
			questFromTemplate(t, weekKey, weekBoundary + DAYS_PER_WEEK * MS_PER_DAY)
		);
	}

	const nextWantToGo = buildWantToGoQuests(state, wantToGo);

	// Observe absolute progress for state-driven metrics on the active set.
	const observeOne = (quest: Quest, templates: QuestTemplate[]): Quest => {
		if (quest.completed) {
			return quest;
		}
		const metric = metricOfQuest(quest, templates);
		if (!(metric && OBSERVED_METRICS.has(metric))) {
			return quest;
		}
		return withProgress(quest, observedProgress(metric, quest, state));
	};

	const observedDailies = nextDailies.map((q) =>
		observeOne(q, DAILY_QUEST_TEMPLATES)
	);
	const observedWeeklies = nextWeeklies.map((q) =>
		observeOne(q, WEEKLY_QUEST_TEMPLATES)
	);

	// Siege lifecycle.
	const startedSieges = maybeStartSiege(state, now);
	const resolvedSieges = resolveSieges(startedSieges, now);

	// Detect change; if nothing moved, return the SAME reference (idempotent).
	const questsChanged =
		needsDaily ||
		needsWeekly ||
		wantToGoChanged(wantToGo, nextWantToGo) ||
		observedDailies.some((q, i) => q !== nextDailies[i]) ||
		observedWeeklies.some((q, i) => q !== nextWeeklies[i]);
	const siegesChanged = resolvedSieges !== state.meta.sieges;
	const dailyStampChanged = needsDaily;

	if (!(questsChanged || siegesChanged || dailyStampChanged)) {
		return state;
	}

	const nextQuests: Quest[] = [
		...observedDailies,
		...observedWeeklies,
		...nextWantToGo,
		...story,
	];

	return {
		...state,
		meta: {
			...state.meta,
			quests: nextQuests,
			sieges: resolvedSieges,
			daily: needsDaily
				? { ...state.meta.daily, lastDailyQuestReset: now }
				: state.meta.daily,
		},
	};
}

// ---------------------------------------------------------------------------
// Custom event handlers.
// ---------------------------------------------------------------------------

function handleProgress(
	state: GameState,
	questId: string,
	amount: number
): GameState {
	const idx = state.meta.quests.findIndex((q) => q.id === questId);
	if (idx === -1) {
		return state;
	}
	const quest = state.meta.quests[idx];
	if (quest.completed) {
		return state;
	}
	const updated = withProgress(quest, quest.progress + amount);
	if (updated === quest) {
		return state;
	}
	const quests = [...state.meta.quests];
	quests[idx] = updated;
	return { ...state, meta: { ...state.meta, quests } };
}

function handleClaim(state: GameState, questId: string): GameState {
	const idx = state.meta.quests.findIndex((q) => q.id === questId);
	if (idx === -1) {
		return state;
	}
	const quest = state.meta.quests[idx];
	if (!quest.completed || quest.claimed) {
		return state;
	}
	const claimed: Quest = { ...quest, claimed: true };
	const quests = [...state.meta.quests];
	quests[idx] = claimed;
	const rewarded = grantRewards(state, claimed);
	return { ...rewarded, meta: { ...rewarded.meta, quests } };
}

// Metric-keyed progress. Other systems (gates, beacons, bosses) dispatch
// QUEST_TRACK without needing to know generated quest ids; every active,
// incomplete quest whose template metric matches is advanced by amount.
function handleTrack(
	state: GameState,
	metric: QuestMetric,
	amount: number
): GameState {
	if (amount === 0) {
		return state;
	}
	let changed = false;
	const quests = state.meta.quests.map((quest) => {
		if (quest.completed) {
			return quest;
		}
		const questMetric =
			metricOfQuest(quest, DAILY_QUEST_TEMPLATES) ??
			metricOfQuest(quest, WEEKLY_QUEST_TEMPLATES);
		if (questMetric !== metric) {
			return quest;
		}
		const updated = withProgress(quest, quest.progress + amount);
		if (updated !== quest) {
			changed = true;
		}
		return updated;
	});
	if (!changed) {
		return state;
	}
	return { ...state, meta: { ...state.meta, quests } };
}

// ---------------------------------------------------------------------------
// Reducer entry point.
// ---------------------------------------------------------------------------

export const questsReducer: SystemReducer = (state, event) => {
	if (event.type === "TICK") {
		const now = (event as { now: number }).now;
		return handleTick(state, now);
	}
	if (!isQuestEvent(event)) {
		return state;
	}
	if (event.type === "QUEST_PROGRESS") {
		return handleProgress(state, event.questId, event.amount);
	}
	if (event.type === "QUEST_TRACK") {
		return handleTrack(state, event.metric, event.amount);
	}
	return handleClaim(state, event.questId);
};
