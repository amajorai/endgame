"use client";

import { Button } from "@endgame/ui/components/button";
import { BOSS_GLYPH_BY_THEME, BOSS_SKILLS } from "@/game/data/field-boss";
import { useDispatch, useGameState } from "@/game/store/store";
import { SOUL_CACHE_ITEM_KIND } from "@/game/systems/field-boss";
import type { FieldBoss, InventoryItem, Player } from "@/game/types";

const PCT = 100;
const HP_LOW = 0.25;

function pct(value: number, max: number): number {
	if (max <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(PCT, Math.round((value / max) * PCT)));
}

function soulCaches(items: Record<string, InventoryItem>): InventoryItem[] {
	const out: InventoryItem[] = [];
	for (const item of Object.values(items)) {
		if (item.kind === SOUL_CACHE_ITEM_KIND) {
			out.push(item);
		}
	}
	return out;
}

function VitalBar({
	label,
	glyph,
	value,
	max,
	color,
}: {
	label: string;
	glyph: string;
	value: number;
	max: number;
	color: string;
}): React.JSX.Element {
	return (
		<div>
			<div className="flex items-center justify-between text-[11px]">
				<span className="text-slate-300">
					<span aria-hidden="true">{glyph}</span> {label}
				</span>
				<span className="text-slate-400 tabular-nums">
					{Math.round(value)}/{Math.round(max)}
				</span>
			</div>
			<div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
				<div
					className={`h-full rounded-full ${color} transition-[width] duration-300`}
					style={{ width: `${pct(value, max)}%` }}
				/>
			</div>
		</div>
	);
}

function pipTone(index: number, phase: number): string {
	if (index < phase) {
		return "bg-rose-500/40";
	}
	if (index === phase) {
		return "bg-cyan-300";
	}
	return "bg-slate-700";
}

function PhasePips({ boss }: { boss: FieldBoss }): React.JSX.Element {
	const pips: React.JSX.Element[] = [];
	for (let i = 1; i <= boss.totalPhases; i++) {
		pips.push(
			<span
				className={`h-1.5 w-6 rounded-full ${pipTone(i, boss.phase)}`}
				key={`phase-${boss.id}-${i}`}
			/>
		);
	}
	return <div className="flex gap-1">{pips}</div>;
}

function BossFight({
	boss,
	player,
	onAction,
}: {
	boss: FieldBoss;
	player: Player;
	onAction: (type: string, payload?: Record<string, unknown>) => void;
}): React.JSX.Element {
	const hpRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
	const bossLow = hpRatio <= HP_LOW;
	const glyph = BOSS_GLYPH_BY_THEME[boss.theme];

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-2xl border border-rose-400/40 bg-slate-950/80 p-4 backdrop-blur-md">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span aria-hidden="true" className="text-2xl">
							{glyph}
						</span>
						<div>
							<div className="font-semibold text-rose-100 text-sm">
								{boss.name}
							</div>
							<div className="text-[10px] text-slate-400 uppercase tracking-wide">
								Rank {boss.rank} · {boss.theme}
								{boss.fromDungeonBreak ? " · dungeon break" : ""}
							</div>
						</div>
					</div>
					<span className="text-[10px] text-slate-400 capitalize">
						{boss.status}
					</span>
				</div>

				<div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800/80">
					<div
						className={`h-full rounded-full transition-[width] duration-300 ${
							bossLow
								? "bg-gradient-to-r from-rose-600 to-amber-400"
								: "bg-gradient-to-r from-rose-500 to-rose-300"
						}`}
						style={{ width: `${pct(boss.hp, boss.maxHp)}%` }}
					/>
				</div>
				<div className="mt-1 flex items-center justify-between">
					<PhasePips boss={boss} />
					<span className="text-[10px] text-rose-300/80 tabular-nums">
						{Math.round(boss.hp)}/{Math.round(boss.maxHp)} · phase {boss.phase}/
						{boss.totalPhases}
					</span>
				</div>
			</div>

			<div className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
				<div className="flex flex-col gap-2">
					<VitalBar
						color="bg-gradient-to-r from-emerald-500 to-emerald-300"
						glyph="❤️"
						label="HP"
						max={player.maxHp}
						value={player.hp}
					/>
					<VitalBar
						color="bg-gradient-to-r from-amber-500 to-amber-300"
						glyph="⚡"
						label="Stamina"
						max={player.maxStamina}
						value={player.stamina}
					/>
					<VitalBar
						color="bg-gradient-to-r from-cyan-500 to-cyan-300"
						glyph="🔮"
						label="Mana"
						max={player.maxCombatMana}
						value={player.combatMana}
					/>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-2">
				{BOSS_SKILLS.map((skill, index) => {
					const blocked =
						player.combatMana < skill.manaCost ||
						player.stamina < skill.staminaCost;
					return (
						<Button
							className="flex h-auto flex-col items-center gap-0.5 rounded-xl border-cyan-400/40 bg-slate-950/70 py-2 text-cyan-100"
							disabled={blocked}
							key={skill.id}
							onClick={() => onAction("BOSS_SKILL", { slot: index })}
							type="button"
							variant="outline"
						>
							<span aria-hidden="true" className="text-lg">
								{skill.glyph}
							</span>
							<span className="font-medium text-xs">{skill.name}</span>
							<span className="text-[9px] text-slate-400">
								{skill.manaCost > 0 ? `${skill.manaCost}🔮 ` : ""}
								{skill.staminaCost}⚡
							</span>
						</Button>
					);
				})}
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Button
					className="rounded-xl border-amber-400/40 bg-slate-950/70 text-amber-100"
					disabled={player.stamina < PCT * 0.12}
					onClick={() => onAction("BOSS_DODGE")}
					type="button"
					variant="outline"
				>
					🌀 Dodge
				</Button>
				<Button
					className="rounded-xl border-slate-500/40 bg-slate-950/70 text-slate-300"
					onClick={() => onAction("BOSS_FLEE")}
					type="button"
					variant="outline"
				>
					🏃 Flee
				</Button>
			</div>
		</div>
	);
}

export default function FieldBossPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const boss = state.activeBoss;
	const caches = soulCaches(state.inventory.items);

	const onAction = (type: string, payload?: Record<string, unknown>): void => {
		dispatch({ type, ...payload });
	};

	if (boss) {
		return (
			<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
				<h2 className="font-semibold text-cyan-100 text-lg">⚔️ Field Boss</h2>
				<BossFight boss={boss} onAction={onAction} player={state.player} />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<h2 className="font-semibold text-cyan-100 text-lg">⚔️ Field Boss</h2>

			<div className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-6 text-center backdrop-blur-md">
				<div aria-hidden="true" className="text-3xl">
					🛡️
				</div>
				<div className="mt-2 font-medium text-cyan-100 text-sm">
					No active threats
				</div>
				<div className="mt-1 text-[11px] text-slate-400">
					Stale gates rupture into roaming field bosses. Keep your gates
					anchored.
				</div>
			</div>

			{caches.length > 0 && (
				<div className="rounded-2xl border border-violet-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
					<div className="font-medium text-sm text-violet-100">
						💀 Soul Caches
					</div>
					<div className="mt-1 text-[11px] text-slate-400">
						Dropped where you fell. Reclaim to recover banked essence.
					</div>
					<div className="mt-3 flex flex-col gap-2">
						{caches.map((cache) => (
							<div
								className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-slate-900/60 px-3 py-2"
								key={cache.id}
							>
								<div>
									<div className="text-violet-100 text-xs">{cache.name}</div>
									<div className="text-[10px] text-slate-400">
										{cache.qty} essence · rank {cache.rarity}
									</div>
								</div>
								<Button
									className="rounded-lg border-violet-400/40 bg-slate-950/70 text-violet-100"
									onClick={() =>
										onAction("SOUL_CACHE_RECLAIM", { id: cache.id })
									}
									size="sm"
									type="button"
									variant="outline"
								>
									Reclaim
								</Button>
							</div>
						))}
					</div>
				</div>
			)}

			<Button
				className="rounded-xl border-rose-400/40 bg-slate-950/70 text-rose-100"
				onClick={() => onAction("BOSS_SPAWN", { hex: state.position.hex })}
				type="button"
				variant="outline"
			>
				🌋 Force Dungeon Break (debug)
			</Button>
		</div>
	);
}
