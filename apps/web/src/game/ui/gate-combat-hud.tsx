"use client";

import { Button } from "@endgame/ui/components/button";
import {
	POWER_THEME,
	parMsForRank,
	profileFor,
	THEME_META,
} from "@/game/data/gate-combat";
import { useDispatch, useGameState } from "@/game/store/store";
import type { GameEvent, GateRun } from "@/game/types";

// Compact on-map combat HUD for an active gate run. Replaces the old full-screen
// GateCombatPanel content: the fight now happens in-world (enemies are 3D models
// chasing the player on the live map), so this only surfaces the player's vitals,
// wave/enemy progress, and the action controls. Reads the store directly so it is
// usable as a no-prop default export in the play-client overlay slot.

const PCT = 100;
const MS_PER_SECOND = 1000;
const STAMINA_PER_DODGE = 18;
const MAX_STARS = 5;
const FULL_STAR = "★";
const EMPTY_STAR = "☆";
const HP_GOOD_FRACTION = 0.75;

function pct(value: number, max: number): number {
	if (max <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(PCT, (value / max) * PCT));
}

function formatSeconds(ms: number): string {
	return (ms / MS_PER_SECOND).toFixed(1);
}

function aliveCount(run: GateRun): number {
	let count = 0;
	for (const enemy of run.enemies) {
		if (enemy.hp > 0) {
			count += 1;
		}
	}
	return count;
}

function Bar({
	label,
	glyph,
	value,
	max,
	color,
}: {
	color: string;
	glyph: string;
	label: string;
	max: number;
	value: number;
}): React.JSX.Element {
	return (
		<div>
			<div className="flex items-center justify-between text-[10px]">
				<span className="text-slate-300">
					<span aria-hidden="true">{glyph}</span> {label}
				</span>
				<span className="text-slate-400 tabular-nums">
					{Math.round(value)}/{Math.round(max)}
				</span>
			</div>
			<div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
				<div
					className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-200`}
					style={{ width: `${pct(value, max)}%` }}
				/>
			</div>
		</div>
	);
}

function StarRow({ stars }: { stars: number }): React.JSX.Element {
	const filled = Math.max(0, Math.min(MAX_STARS, stars));
	let row = "";
	for (let i = 0; i < MAX_STARS; i++) {
		row += i < filled ? FULL_STAR : EMPTY_STAR;
	}
	return (
		<span className="text-amber-300 text-lg tabular-nums tracking-widest">
			{row}
		</span>
	);
}

function ResultCard({
	run,
	onAction,
}: {
	onAction: (event: GameEvent) => void;
	run: GateRun;
}): React.JSX.Element {
	const won = run.status === "won";
	return (
		<div className="flex flex-col items-center gap-3 p-4 text-center">
			<div className="text-3xl">{won ? "🏆" : "💀"}</div>
			<h2
				className={`font-bold text-xl ${won ? "text-amber-200" : "text-rose-300"}`}
			>
				{won ? "Gate Cleared" : "Gate Failed"}
			</h2>
			{won ? (
				<div className="flex flex-col items-center gap-1">
					<StarRow stars={run.starsEarned} />
					<div className="text-slate-300 text-xs">
						Time{" "}
						<span className="text-cyan-200 tabular-nums">
							{formatSeconds(run.elapsedMs)}s
						</span>{" "}
						· HP{" "}
						<span className="text-cyan-200 tabular-nums">
							{Math.round((run.playerHp / run.playerMaxHp) * PCT)}%
						</span>{" "}
						· Potions{" "}
						<span className="text-cyan-200 tabular-nums">
							{run.potionsUsed}
						</span>
					</div>
				</div>
			) : (
				<p className="text-slate-400 text-xs">
					The gate repelled you. Recover and try again.
				</p>
			)}
			<Button
				className="w-full rounded-full border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
				onClick={() => onAction({ type: "GATE_EXIT" })}
				type="button"
				variant="outline"
			>
				{won ? "Claim & Exit" : "Exit"}
			</Button>
		</div>
	);
}

function ActiveFight({
	run,
	onAction,
}: {
	onAction: (event: GameEvent) => void;
	run: GateRun;
}): React.JSX.Element {
	const state = useGameState();
	const profile = profileFor(run.power);
	const par = parMsForRank(run.rank);
	const theme = THEME_META[run.theme];
	const remaining = aliveCount(run);
	const isClassChallenge = POWER_THEME[run.power] === run.theme;
	const onBoss = run.wave >= run.totalWaves;
	const lowStamina = run.stamina < STAMINA_PER_DODGE;
	const lowMana = run.mana < profile.skillCost;
	const fullHp = run.playerHp >= run.playerMaxHp;
	const hpGood = run.playerHp >= run.playerMaxHp * HP_GOOD_FRACTION;

	return (
		<div className="flex flex-col gap-3 p-3">
			{/* Header: theme, rank, wave / enemy progress. */}
			<div className="flex items-center justify-between text-xs">
				<span className="flex items-center gap-1 font-semibold text-cyan-100">
					<span aria-hidden="true">{theme.glyph}</span> {theme.label} Gate
				</span>
				<span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-semibold text-cyan-200">
					Rank {run.rank}
				</span>
			</div>
			<div className="flex items-center justify-between text-[11px] text-slate-400">
				<span>
					Wave{" "}
					<span className="text-cyan-200 tabular-nums">
						{run.wave}/{run.totalWaves}
					</span>
					{onBoss ? " · Boss" : ""}
				</span>
				<span className="tabular-nums">
					{formatSeconds(run.elapsedMs)}s / par {formatSeconds(par)}s
				</span>
			</div>
			<div className="text-center text-[10px] text-slate-400">
				{remaining} enem{remaining === 1 ? "y" : "ies"} on the map
				{isClassChallenge ? " · ⭐ class challenge" : ""}
			</div>

			{/* Player vitals. */}
			<div className="flex flex-col gap-1.5 rounded-xl border border-cyan-400/20 bg-slate-950/70 p-2">
				<Bar
					color={
						hpGood
							? "from-emerald-500 to-emerald-300"
							: "from-rose-500 to-amber-400"
					}
					glyph="❤️"
					label="HP"
					max={run.playerMaxHp}
					value={run.playerHp}
				/>
				<Bar
					color="from-amber-500 to-amber-300"
					glyph="⚡"
					label="Stamina"
					max={state.player.maxStamina}
					value={run.stamina}
				/>
				<Bar
					color="from-sky-500 to-sky-300"
					glyph="🔮"
					label="Mana"
					max={state.player.maxCombatMana}
					value={run.mana}
				/>
			</div>

			{/* Action bar. */}
			<div className="grid grid-cols-4 gap-2">
				<Button
					className="flex h-auto flex-col items-center gap-0.5 rounded-xl border-rose-400/40 bg-rose-500/15 py-2 font-semibold text-rose-100"
					onClick={() => onAction({ type: "GATE_ATTACK" })}
					type="button"
					variant="outline"
				>
					<span aria-hidden="true">⚔️</span>
					<span className="text-[11px]">Attack</span>
				</Button>
				<Button
					className="flex h-auto flex-col items-center gap-0.5 rounded-xl border-sky-400/40 bg-sky-500/15 py-2 font-semibold text-sky-100 disabled:opacity-40"
					disabled={lowMana}
					onClick={() => onAction({ type: "GATE_SKILL", slot: 0 })}
					type="button"
					variant="outline"
				>
					<span aria-hidden="true">{profile.glyph}</span>
					<span className="text-[11px]">Skill</span>
				</Button>
				<Button
					className="flex h-auto flex-col items-center gap-0.5 rounded-xl border-amber-400/40 bg-amber-500/15 py-2 font-semibold text-amber-100 disabled:opacity-40"
					disabled={lowStamina}
					onClick={() => onAction({ type: "GATE_DODGE" })}
					type="button"
					variant="outline"
				>
					<span aria-hidden="true">💨</span>
					<span className="text-[11px]">Dodge</span>
				</Button>
				<Button
					className="flex h-auto flex-col items-center gap-0.5 rounded-xl border-emerald-400/40 bg-emerald-500/15 py-2 font-semibold text-emerald-100 disabled:opacity-40"
					disabled={fullHp}
					onClick={() => onAction({ type: "GATE_USE_POTION" })}
					type="button"
					variant="outline"
				>
					<span aria-hidden="true">🧪</span>
					<span className="text-[11px]">Potion</span>
				</Button>
			</div>

			<div className="flex items-center justify-between text-[10px] text-slate-500">
				<span>Tap an enemy or press J to strike the nearest</span>
				<Button
					className="rounded-full border-slate-500/40 bg-slate-950/70 px-3 text-slate-300"
					onClick={() => onAction({ type: "GATE_EXIT" })}
					size="sm"
					type="button"
					variant="outline"
				>
					🏃 Flee
				</Button>
			</div>
		</div>
	);
}

export default function GateCombatHud(): React.JSX.Element | null {
	const state = useGameState();
	const dispatch = useDispatch();
	const run = state.activeGate;

	if (!run) {
		return null;
	}

	const onAction = (event: GameEvent): void => {
		dispatch(event);
	};

	if (run.status === "won" || run.status === "lost") {
		return <ResultCard onAction={onAction} run={run} />;
	}
	return <ActiveFight onAction={onAction} run={run} />;
}
