"use client";

import { BOSS_GLYPH_BY_THEME } from "@/game/data/field-boss";
import { THEME_META } from "@/game/data/gate-combat";
import { useGameState } from "@/game/store/store";
import type { GateEnemy } from "@/game/types";

const PCT = 100;

function pct(value: number, max: number): number {
	if (max <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(PCT, (value / max) * PCT));
}

function strongestLivingEnemy(enemies: GateEnemy[]): GateEnemy | null {
	let strongest: GateEnemy | null = null;
	for (const enemy of enemies) {
		if (enemy.hp <= 0) {
			continue;
		}
		if (!strongest || enemy.maxHp > strongest.maxHp) {
			strongest = enemy;
		}
	}
	return strongest;
}

export function CombatStatusBar(): React.JSX.Element | null {
	const state = useGameState();
	const boss = state.activeBoss;
	const run = state.activeGate?.status === "active" ? state.activeGate : null;

	if (boss?.status === "engaged") {
		const glyph = BOSS_GLYPH_BY_THEME[boss.theme];
		return (
			<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
				<div className="w-full max-w-xl rounded-2xl border border-rose-400/40 bg-slate-950/80 px-4 py-3 shadow-xl backdrop-blur-md">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<div className="truncate font-semibold text-rose-100 text-sm">
								<span aria-hidden="true">{glyph}</span> {boss.name}
							</div>
							<div className="text-[10px] text-slate-400 uppercase tracking-wide">
								Rank {boss.rank} · phase {boss.phase}/{boss.totalPhases}
							</div>
						</div>
						<div className="text-right text-[10px] text-rose-200 tabular-nums">
							{Math.round(boss.hp)}/{Math.round(boss.maxHp)}
						</div>
					</div>
					<div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800/80">
						<div
							className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-400 to-amber-300 transition-[width] duration-300"
							style={{ width: `${pct(boss.hp, boss.maxHp)}%` }}
						/>
					</div>
				</div>
			</div>
		);
	}

	if (!run) {
		return null;
	}

	const target = strongestLivingEnemy(run.enemies);
	if (!target) {
		return null;
	}
	const theme = THEME_META[run.theme];
	const onBossWave = run.wave >= run.totalWaves;

	return (
		<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
			<div className="w-full max-w-xl rounded-2xl border border-cyan-400/35 bg-slate-950/80 px-4 py-3 shadow-xl backdrop-blur-md">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="truncate font-semibold text-cyan-100 text-sm">
							<span aria-hidden="true">{theme.glyph}</span>{" "}
							{onBossWave ? target.name : `${theme.label} Wave`}
						</div>
						<div className="text-[10px] text-slate-400 uppercase tracking-wide">
							Rank {run.rank} · wave {run.wave}/{run.totalWaves}
							{onBossWave ? " · boss" : ""}
						</div>
					</div>
					<div className="text-right text-[10px] text-cyan-200 tabular-nums">
						{Math.round(target.hp)}/{Math.round(target.maxHp)}
					</div>
				</div>
				<div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800/80">
					<div
						className={`h-full rounded-full transition-[width] duration-300 ${
							onBossWave
								? "bg-gradient-to-r from-rose-600 via-rose-400 to-amber-300"
								: "bg-gradient-to-r from-cyan-500 to-cyan-300"
						}`}
						style={{ width: `${pct(target.hp, target.maxHp)}%` }}
					/>
				</div>
			</div>
		</div>
	);
}
