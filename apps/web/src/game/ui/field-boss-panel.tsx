"use client";

import { Button } from "@endgame/ui/components/button";
import { BOSS_GLYPH_BY_THEME, BOSS_SKILLS } from "@/game/data/field-boss";
import { useDispatch, useGameState } from "@/game/store/store";
import { SOUL_CACHE_ITEM_KIND } from "@/game/systems/field-boss";
import type { FieldBoss, InventoryItem, Player } from "@/game/types";

const DODGE_STAMINA_COST = 12;

function soulCaches(items: Record<string, InventoryItem>): InventoryItem[] {
	const out: InventoryItem[] = [];
	for (const item of Object.values(items)) {
		if (item.kind === SOUL_CACHE_ITEM_KIND) {
			out.push(item);
		}
	}
	return out;
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
	const glyph = BOSS_GLYPH_BY_THEME[boss.theme];

	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-2xl border border-rose-400/30 bg-slate-950/75 p-3 backdrop-blur-md">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-2xl">
						{glyph}
					</span>
					<div className="min-w-0">
						<div className="truncate font-semibold text-rose-100 text-sm">
							{boss.name}
						</div>
						<div className="text-[10px] text-slate-400 uppercase tracking-wide">
							Rank {boss.rank} · {boss.theme}
							{boss.fromDungeonBreak ? " · dungeon break" : ""}
						</div>
					</div>
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
					disabled={player.stamina < DODGE_STAMINA_COST}
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
