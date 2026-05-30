"use client";

import { Button } from "@endgame/ui/components/button";
import { Input } from "@endgame/ui/components/input";
import { useState } from "react";
import { hexClassFor } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	availableShadowSlots,
	deployedShadowCount,
	shadowSlots,
} from "@/game/systems/shadows";
import type { Rank, Shadow } from "@/game/types";

const RANK_TONE: Record<Rank, string> = {
	E: "text-slate-300 border-slate-400/40",
	D: "text-emerald-300 border-emerald-400/40",
	C: "text-sky-300 border-sky-400/40",
	B: "text-violet-300 border-violet-400/40",
	A: "text-amber-300 border-amber-400/40",
	S: "text-rose-300 border-rose-400/40",
};

const SHORT_HEX = 6;

const shortHex = (hex: string): string =>
	hex.length > SHORT_HEX ? `${hex.slice(0, SHORT_HEX)}…` : hex;

// One row in the roster. Handles assign-to-current-hex, recall, and rename.
function ShadowRow({
	shadow,
	currentHex,
	canDeploy,
}: {
	shadow: Shadow;
	currentHex: string;
	canDeploy: boolean;
}): React.JSX.Element {
	const dispatch = useDispatch();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(shadow.name);

	const deployed = Boolean(shadow.assignedHex);
	const onCurrent = shadow.assignedHex === currentHex;

	const handleAssign = (): void => {
		dispatch({ type: "SHADOW_ASSIGN", id: shadow.id, hex: currentHex });
	};
	const handleRecall = (): void => {
		dispatch({ type: "SHADOW_RECALL", id: shadow.id });
	};
	const handleSaveName = (): void => {
		const trimmed = draft.trim();
		if (trimmed.length > 0) {
			dispatch({ type: "SHADOW_RENAME", id: shadow.id, name: trimmed });
		}
		setEditing(false);
	};

	return (
		<li className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					{editing ? (
						<div className="flex items-center gap-1.5">
							<Input
								aria-label="Shadow name"
								className="h-7 w-32 rounded-md border-cyan-400/30 bg-slate-950/60 text-cyan-100"
								maxLength={24}
								onChange={(e) => setDraft(e.target.value)}
								value={draft}
							/>
							<Button
								className="h-7 rounded-md text-cyan-200"
								onClick={handleSaveName}
								size="sm"
								type="button"
								variant="outline"
							>
								Save
							</Button>
						</div>
					) : (
						<button
							className="truncate text-left font-semibold text-cyan-100 text-sm hover:text-cyan-300"
							onClick={() => {
								setDraft(shadow.name);
								setEditing(true);
							}}
							title="Rename"
							type="button"
						>
							👤 {shadow.name}
						</button>
					)}
					<div className="mt-0.5 truncate text-[11px] text-slate-400">
						from {shadow.sourceMonster}
					</div>
				</div>
				<span
					className={`shrink-0 rounded-md border px-1.5 py-0.5 font-bold text-[11px] ${RANK_TONE[shadow.rank]}`}
				>
					{shadow.rank}
				</span>
			</div>

			<div className="mt-2 flex items-center justify-between gap-2">
				<span className="text-[11px] text-slate-400">
					{deployed ? (
						<span className="text-cyan-300">
							⚔️ {onCurrent ? "here" : `@ ${shortHex(shadow.assignedHex ?? "")}`}
						</span>
					) : (
						<span className="text-slate-500">⏸ idle</span>
					)}
				</span>
				<div className="flex items-center gap-1.5">
					{deployed ? (
						<Button
							className="h-7 rounded-md text-amber-200"
							onClick={handleRecall}
							size="sm"
							type="button"
							variant="outline"
						>
							Recall
						</Button>
					) : (
						<Button
							className="h-7 rounded-md text-cyan-200 disabled:opacity-40"
							disabled={!canDeploy}
							onClick={handleAssign}
							size="sm"
							type="button"
							variant="outline"
						>
							Deploy here
						</Button>
					)}
					{deployed && !onCurrent && canDeploy && (
						<Button
							className="h-7 rounded-md text-cyan-200"
							onClick={handleAssign}
							size="sm"
							type="button"
							variant="outline"
						>
							Move here
						</Button>
					)}
				</div>
			</div>
		</li>
	);
}

export default function ShadowsPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const currentHex = state.position.hex;
	const slots = shadowSlots(state);
	const deployed = deployedShadowCount(state);
	const free = availableShadowSlots(state);
	const hexClass = state.deeds[currentHex]?.hexClass ?? hexClassFor(currentHex);

	// Debug / demo extraction so the system is playable without a boss kill.
	const handleExtract = (): void => {
		dispatch({
			type: "SHADOW_EXTRACT",
			sourceMonster: "Field Specter",
			rank: state.player.rank,
		});
	};

	const roster = state.shadows;

	return (
		<div className="flex h-full flex-col gap-3 p-3 text-slate-100">
			<header className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<div className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 font-bold text-cyan-100 text-lg">
						<span aria-hidden="true">🌑</span> Shadow Army
					</h2>
					<span className="rounded-lg border border-cyan-400/30 px-2 py-1 font-semibold text-cyan-200 text-xs tabular-nums">
						{deployed}/{slots} deployed
					</span>
				</div>
				<p className="mt-1 text-[11px] text-slate-400">
					Deployed shadows defend their hex and quicken nearby crops.{" "}
					{free > 0 ? (
						<span className="text-cyan-300">
							{free} slot{free === 1 ? "" : "s"} free
						</span>
					) : (
						<span className="text-amber-300">All slots in use</span>
					)}
				</p>
				<div className="mt-2 text-[11px] text-slate-500">
					Current hex:{" "}
					<span className="text-cyan-300">{shortHex(currentHex)}</span>{" "}
					<span className="capitalize">({hexClass.replace("_", " ")})</span>
				</div>
			</header>

			<div className="flex-1 overflow-y-auto">
				{roster.length === 0 ? (
					<div className="rounded-2xl border border-cyan-400/20 border-dashed bg-slate-950/40 p-6 text-center">
						<div className="text-3xl">🪦</div>
						<p className="mt-2 text-slate-300 text-sm">No shadows yet.</p>
						<p className="mt-1 text-[11px] text-slate-500">
							Defeat field bosses to extract their shadows into your army.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{roster.map((shadow) => (
							<ShadowRow
								canDeploy={free > 0 || Boolean(shadow.assignedHex)}
								currentHex={currentHex}
								key={shadow.id}
								shadow={shadow}
							/>
						))}
					</ul>
				)}
			</div>

			<footer className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-3 backdrop-blur">
				<Button
					className="w-full rounded-xl border-cyan-400/40 text-cyan-100"
					onClick={handleExtract}
					type="button"
					variant="outline"
				>
					✨ Extract test shadow ({state.player.rank}-rank)
				</Button>
			</footer>
		</div>
	);
}
