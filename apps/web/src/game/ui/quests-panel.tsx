"use client";

import { Button } from "@endgame/ui/components/button";
import { useDispatch, useGameState } from "@/game/store/store";
import type { Quest, QuestKind, Siege } from "@/game/types";

const KIND_ORDER: QuestKind[] = ["daily", "weekly", "want_to_go", "story"];

const KIND_LABELS: Record<QuestKind, string> = {
	daily: "Daily",
	weekly: "Weekly",
	want_to_go: "Want To Go",
	story: "Story",
};

const KIND_ICONS: Record<QuestKind, string> = {
	daily: "🌅",
	weekly: "🗓️",
	want_to_go: "📍",
	story: "📖",
};

function progressPct(quest: Quest): number {
	if (quest.target <= 0) {
		return quest.completed ? 100 : 0;
	}
	return Math.min(100, Math.round((quest.progress / quest.target) * 100));
}

function ProgressBar({ quest }: { quest: Quest }): React.JSX.Element {
	const pct = progressPct(quest);
	return (
		<div className="mt-2">
			<div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
				<div
					className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-[width] duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<div className="mt-1 flex items-center justify-between text-[10px] text-cyan-300/80 tabular-nums">
				<span>
					{Math.min(quest.progress, quest.target)} / {quest.target}
				</span>
				<span>{pct}%</span>
			</div>
		</div>
	);
}

function QuestCard({
	quest,
	onClaim,
}: {
	quest: Quest;
	onClaim: (id: string) => void;
}): React.JSX.Element {
	const claimable = quest.completed && !quest.claimed;
	return (
		<div className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate font-semibold text-cyan-100 text-sm">
						{quest.title}
					</div>
					<div className="mt-0.5 text-[11px] text-slate-400">
						{quest.description}
					</div>
				</div>
				{quest.claimed ? (
					<span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
						Claimed
					</span>
				) : null}
			</div>

			<ProgressBar quest={quest} />

			<div className="mt-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-3 text-[11px] text-slate-300">
					<span className="flex items-center gap-1">
						<span aria-hidden="true" className="text-cyan-300">
							⚡
						</span>
						{quest.rewardMana}
					</span>
					<span className="flex items-center gap-1">
						<span aria-hidden="true" className="text-violet-300">
							✦
						</span>
						{quest.rewardXp} xp
					</span>
				</div>
				<Button
					className="rounded-full border-cyan-400/40 bg-slate-950/70 text-cyan-200 disabled:opacity-40"
					disabled={!claimable}
					onClick={() => onClaim(quest.id)}
					size="sm"
					type="button"
					variant="outline"
				>
					{quest.claimed ? "Done" : "Claim"}
				</Button>
			</div>
		</div>
	);
}

function SiegeCard({ siege }: { siege: Siege }): React.JSX.Element {
	const status = siege.active ? "Active" : "Resolved";
	const statusColor = siege.active
		? "text-amber-300 bg-amber-500/15"
		: "text-slate-300 bg-slate-500/15";
	return (
		<div className="rounded-xl border border-amber-400/20 bg-slate-900/60 p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="truncate font-semibold text-amber-100 text-sm">
					Saturday Siege
				</div>
				<span
					className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${statusColor}`}
				>
					{status}
				</span>
			</div>
			<div className="mt-1 truncate text-[11px] text-slate-400">
				District {siege.district}
			</div>
			<div className="mt-1 text-[11px] text-slate-300">
				Holding {siege.playerHexes} hex{siege.playerHexes === 1 ? "" : "es"}
			</div>
		</div>
	);
}

function QuestGroup({
	kind,
	quests,
	onClaim,
}: {
	kind: QuestKind;
	quests: Quest[];
	onClaim: (id: string) => void;
}): React.JSX.Element | null {
	if (quests.length === 0) {
		return null;
	}
	return (
		<section className="space-y-2">
			<h3 className="flex items-center gap-2 font-semibold text-cyan-200 text-xs uppercase tracking-wide">
				<span aria-hidden="true">{KIND_ICONS[kind]}</span>
				{KIND_LABELS[kind]}
				<span className="text-slate-500">({quests.length})</span>
			</h3>
			<div className="space-y-2">
				{quests.map((q) => (
					<QuestCard key={q.id} onClaim={onClaim} quest={q} />
				))}
			</div>
		</section>
	);
}

export default function QuestsPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const quests = state.meta.quests;
	const sieges = state.meta.sieges;

	const handleClaim = (questId: string): void => {
		dispatch({ type: "QUEST_CLAIM", questId });
	};

	const grouped: Record<QuestKind, Quest[]> = {
		daily: [],
		weekly: [],
		want_to_go: [],
		story: [],
	};
	for (const quest of quests) {
		grouped[quest.kind].push(quest);
	}

	const claimableCount = quests.filter((q) => q.completed && !q.claimed).length;

	return (
		<div className="flex h-full flex-col gap-4 rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
			<header className="flex items-center justify-between">
				<div>
					<h2 className="flex items-center gap-2 font-bold text-cyan-100 text-lg">
						<span aria-hidden="true">📜</span>
						Quest Log
					</h2>
					<p className="text-[11px] text-slate-400">
						{quests.length} active
						{claimableCount > 0 ? ` · ${claimableCount} ready to claim` : ""}
					</p>
				</div>
			</header>

			<div className="flex-1 space-y-4 overflow-y-auto pr-1">
				{quests.length === 0 ? (
					<div className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-4 text-center text-slate-400 text-sm">
						No quests yet. They appear at dawn.
					</div>
				) : (
					KIND_ORDER.map((kind) => (
						<QuestGroup
							key={kind}
							kind={kind}
							onClaim={handleClaim}
							quests={grouped[kind]}
						/>
					))
				)}

				<section className="space-y-2">
					<h3 className="flex items-center gap-2 font-semibold text-amber-200 text-xs uppercase tracking-wide">
						<span aria-hidden="true">⚔️</span>
						Sieges
						<span className="text-slate-500">({sieges.length})</span>
					</h3>
					{sieges.length === 0 ? (
						<div className="rounded-xl border border-amber-400/20 bg-slate-900/60 p-3 text-[11px] text-slate-400">
							No siege scheduled. Saturday brings the assault.
						</div>
					) : (
						<div className="space-y-2">
							{sieges.map((s) => (
								<SiegeCard key={s.id} siege={s} />
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
