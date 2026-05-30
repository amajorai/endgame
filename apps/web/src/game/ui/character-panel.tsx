"use client";

// Character sheet panel for the powers-progression system. Reads game state and
// dispatches progression events. Self-contained: every interaction (allocate
// stats, equip/unlock powers, unlock skills, rank test, respec) is here, no map
// markers required.

import { Button } from "@endgame/ui/components/button";
import { RANKS } from "@/game/constants";
import {
	POWER_BY_ID,
	POWERS,
	type SkillNode,
	UNIVERSAL_SKILLS,
} from "@/game/data/powers";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	canPromote,
	eligibleRank,
	xpForNextLevel,
} from "@/game/systems/powers-progression";
import type { PlayerStats, PowerId, Rank } from "@/game/types";

const STAT_META: { key: keyof PlayerStats; label: string; glyph: string }[] = [
	{ key: "str", label: "Strength", glyph: "💪" },
	{ key: "agi", label: "Agility", glyph: "🏃" },
	{ key: "vit", label: "Vitality", glyph: "❤️" },
	{ key: "int", label: "Intellect", glyph: "🧠" },
	{ key: "per", label: "Perception", glyph: "👁️" },
];

const POWER_UNLOCK_SKILL_COST = 3;
const RESPEC_MANA_COST = 250;
const DEBUG_XP_GRANT = 250;

function rankCellClass(index: number, currentIndex: number): string {
	if (index === currentIndex) {
		return "border-cyan-300 bg-cyan-400/20 text-cyan-100";
	}
	if (index < currentIndex) {
		return "border-cyan-400/20 bg-slate-800/60 text-cyan-400/50";
	}
	return "border-slate-700/60 bg-slate-900/40 text-slate-600";
}

function RankLadder({ rank }: { rank: Rank }): React.JSX.Element {
	const currentIndex = RANKS.indexOf(rank);
	return (
		<div className="flex items-center gap-1">
			{RANKS.map((r, i) => (
				<span
					className={`flex h-7 w-7 items-center justify-center rounded-md border font-bold text-xs ${rankCellClass(i, currentIndex)}`}
					key={r}
				>
					{r}
				</span>
			))}
		</div>
	);
}

export default function CharacterPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const player = state.player;
	const mana = Math.round(state.resources.mana);

	const xpNeeded = xpForNextLevel(player.level);
	const xpPct = Math.min(100, Math.round((player.xp / xpNeeded) * 100));
	const promoteReady = canPromote(player.level, player.rank);
	const nextEligible = eligibleRank(player.level);
	const equippedDef = POWER_BY_ID[player.equippedPower];
	const unlockedSkills = new Set(player.unlockedSkills);

	const allocateStat = (stat: keyof PlayerStats): void => {
		dispatch({ type: "STAT_ALLOCATE", stat });
	};
	const equipPower = (power: PowerId): void => {
		dispatch({ type: "POWER_EQUIP", power });
	};
	const unlockPower = (power: PowerId): void => {
		dispatch({ type: "POWER_UNLOCK", power });
	};
	const unlockSkill = (skillId: string): void => {
		dispatch({ type: "SKILL_UNLOCK", skillId });
	};
	const rankTest = (): void => {
		dispatch({ type: "RANK_TEST" });
	};
	const respec = (): void => {
		dispatch({ type: "RESPEC" });
	};
	const grantXp = (): void => {
		dispatch({ type: "GAIN_XP", amount: DEBUG_XP_GRANT });
	};

	const renderPowerAction = (
		power: PowerId,
		isEquipped: boolean,
		isUnlocked: boolean,
		canAfford: boolean
	): React.JSX.Element => {
		if (isEquipped) {
			return <span className="shrink-0 text-cyan-300 text-xs">equipped</span>;
		}
		if (isUnlocked) {
			return (
				<Button
					className="h-7 shrink-0 rounded-full border-cyan-400/40 px-3 text-cyan-200 text-xs"
					onClick={() => equipPower(power)}
					size="sm"
					type="button"
					variant="outline"
				>
					Equip
				</Button>
			);
		}
		return (
			<Button
				className="h-7 shrink-0 rounded-full border-amber-400/40 px-3 text-amber-200 text-xs"
				disabled={!canAfford}
				onClick={() => unlockPower(power)}
				size="sm"
				type="button"
				variant="outline"
			>
				🔒 {POWER_UNLOCK_SKILL_COST} SP
			</Button>
		);
	};

	const renderSkillNode = (
		node: SkillNode,
		available: boolean
	): React.JSX.Element => {
		const owned = unlockedSkills.has(node.id);
		const affordable = player.skillPoints >= node.cost;
		return (
			<div
				className={`rounded-xl border px-3 py-2 ${
					owned
						? "border-cyan-300/60 bg-cyan-400/10"
						: "border-slate-700/50 bg-slate-900/50"
				}`}
				key={node.id}
			>
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<div className="font-medium text-cyan-100 text-sm">{node.name}</div>
						<div className="text-[11px] text-slate-400 leading-snug">
							{node.desc}
						</div>
					</div>
					{owned ? (
						<span className="shrink-0 text-cyan-300 text-xs">✓ owned</span>
					) : (
						<Button
							className="h-7 shrink-0 rounded-full border-cyan-400/40 px-3 text-cyan-200 text-xs"
							disabled={!(available && affordable)}
							onClick={() => unlockSkill(node.id)}
							size="sm"
							type="button"
							variant="outline"
						>
							{node.cost} SP
						</Button>
					)}
				</div>
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-slate-100">
			{/* Header: identity, level, rank, xp */}
			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="font-semibold text-cyan-100 text-lg">
							{player.name}
						</div>
						<div className="text-slate-400 text-xs">
							Level {player.level} · {equippedDef.emoji} {equippedDef.name}
						</div>
					</div>
					<div className="text-right">
						<div className="text-[11px] text-slate-400">Rank</div>
						<RankLadder rank={player.rank} />
					</div>
				</div>

				<div className="mt-3">
					<div className="mb-1 flex justify-between text-[11px] text-slate-400">
						<span>XP</span>
						<span className="tabular-nums">
							{Math.round(player.xp)} / {xpNeeded}
						</span>
					</div>
					<div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
						<div
							className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-[width] duration-300"
							style={{ width: `${xpPct}%` }}
						/>
					</div>
				</div>

				<div className="mt-3 flex items-center justify-between gap-2">
					<div className="text-[11px] text-slate-400">
						{promoteReady ? (
							<span className="text-amber-300">
								Eligible for Rank {nextEligible}
							</span>
						) : (
							<span>Rank locked until higher level</span>
						)}
					</div>
					<Button
						className="h-8 rounded-full border-amber-400/50 px-4 text-amber-200 text-xs"
						disabled={!promoteReady}
						onClick={rankTest}
						size="sm"
						type="button"
						variant="outline"
					>
						⚔️ Rank Test
					</Button>
				</div>
			</section>

			{/* Resource counters */}
			<section className="grid grid-cols-3 gap-2">
				<div className="rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2 text-center">
					<div className="font-semibold text-cyan-100 text-lg tabular-nums">
						{player.skillPoints}
					</div>
					<div className="text-[10px] text-slate-400">skill pts</div>
				</div>
				<div className="rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2 text-center">
					<div className="font-semibold text-cyan-100 text-lg tabular-nums">
						{player.statPoints}
					</div>
					<div className="text-[10px] text-slate-400">stat pts</div>
				</div>
				<div className="rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2 text-center">
					<div className="font-semibold text-cyan-100 text-lg tabular-nums">
						{mana}
					</div>
					<div className="text-[10px] text-slate-400">mana</div>
				</div>
			</section>

			{/* Stats with allocate buttons */}
			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<div className="mb-2 flex items-center justify-between">
					<h2 className="font-semibold text-cyan-100 text-sm">Attributes</h2>
					<span className="text-[11px] text-slate-400">
						{player.statPoints} to spend
					</span>
				</div>
				<div className="flex flex-col gap-2">
					{STAT_META.map((meta) => (
						<div
							className="flex items-center justify-between gap-3"
							key={meta.key}
						>
							<span className="flex items-center gap-2 text-sm">
								<span aria-hidden="true">{meta.glyph}</span>
								<span className="text-slate-200">{meta.label}</span>
							</span>
							<span className="flex items-center gap-2">
								<span className="w-8 text-right font-semibold text-cyan-100 tabular-nums">
									{player.stats[meta.key]}
								</span>
								<Button
									aria-label={`Allocate point to ${meta.label}`}
									className="h-7 w-7 rounded-full border-cyan-400/40 p-0 text-cyan-200"
									disabled={player.statPoints <= 0}
									onClick={() => allocateStat(meta.key)}
									size="sm"
									type="button"
									variant="outline"
								>
									+
								</Button>
							</span>
						</div>
					))}
				</div>
				<div className="mt-3 grid grid-cols-3 gap-2 border-slate-700/50 border-t pt-3 text-center text-[10px] text-slate-400">
					<div>
						<div className="font-semibold text-rose-300 text-sm tabular-nums">
							{player.hp}/{player.maxHp}
						</div>
						HP
					</div>
					<div>
						<div className="font-semibold text-emerald-300 text-sm tabular-nums">
							{player.stamina}/{player.maxStamina}
						</div>
						Stamina
					</div>
					<div>
						<div className="font-semibold text-sky-300 text-sm tabular-nums">
							{player.combatMana}/{player.maxCombatMana}
						</div>
						C. Mana
					</div>
				</div>
			</section>

			{/* Power selector */}
			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<h2 className="mb-2 font-semibold text-cyan-100 text-sm">Powers</h2>
				<div className="grid grid-cols-1 gap-2">
					{POWERS.map((def) => {
						const isUnlocked = player.unlockedPowers.includes(def.id);
						const isEquipped = player.equippedPower === def.id;
						const canAfford = player.skillPoints >= POWER_UNLOCK_SKILL_COST;
						return (
							<div
								className={`rounded-xl border px-3 py-2 ${
									isEquipped
										? "border-cyan-300/70 bg-cyan-400/10"
										: "border-slate-700/50 bg-slate-900/50"
								}`}
								key={def.id}
							>
								<div className="flex items-center justify-between gap-2">
									<div className="flex min-w-0 items-center gap-2">
										<span aria-hidden="true" className="text-lg">
											{def.emoji}
										</span>
										<div className="min-w-0">
											<div className="font-medium text-cyan-100 text-sm">
												{def.name}
												<span className="ml-1 text-[10px] text-slate-500 uppercase">
													{def.role}
												</span>
											</div>
											<div className="truncate text-[11px] text-slate-400">
												{def.fantasy}
											</div>
										</div>
									</div>
									{renderPowerAction(def.id, isEquipped, isUnlocked, canAfford)}
								</div>
							</div>
						);
					})}
				</div>
			</section>

			{/* Skill trees: universal + equipped power */}
			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<div className="mb-2 flex items-center justify-between">
					<h2 className="font-semibold text-cyan-100 text-sm">Skill Tree</h2>
					<span className="text-[11px] text-slate-400">
						{player.skillPoints} SP
					</span>
				</div>

				<h3 className="mt-2 mb-1 text-[11px] text-cyan-400/80 uppercase tracking-wide">
					Universal
				</h3>
				<div className="flex flex-col gap-2">
					{UNIVERSAL_SKILLS.map((node) => renderSkillNode(node, true))}
				</div>

				<h3 className="mt-4 mb-1 text-[11px] text-cyan-400/80 uppercase tracking-wide">
					{equippedDef.emoji} {equippedDef.name}
				</h3>
				<div className="flex flex-col gap-2">
					{equippedDef.skills.map((node) => renderSkillNode(node, true))}
				</div>
			</section>

			{/* Debug: grant XP so the level/rank loop is exercisable standalone. */}
			{state.debug.enabled && (
				<section className="rounded-2xl border border-amber-400/30 bg-slate-950/80 p-4 backdrop-blur">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="font-semibold text-amber-200 text-sm">Debug</div>
							<div className="text-[11px] text-slate-400">
								Grant {DEBUG_XP_GRANT} XP to test leveling and rank tests.
							</div>
						</div>
						<Button
							className="h-8 shrink-0 rounded-full border-amber-400/50 px-4 text-amber-200 text-xs"
							onClick={grantXp}
							size="sm"
							type="button"
							variant="outline"
						>
							＋ XP
						</Button>
					</div>
				</section>
			)}

			{/* Respec */}
			<section className="rounded-2xl border border-rose-400/30 bg-slate-950/80 p-4 backdrop-blur">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="font-semibold text-rose-200 text-sm">Respec</div>
						<div className="text-[11px] text-slate-400">
							Refund all skill points. Free weekly, then {RESPEC_MANA_COST}{" "}
							mana.
						</div>
					</div>
					<Button
						className="h-8 shrink-0 rounded-full border-rose-400/50 px-4 text-rose-200 text-xs"
						onClick={respec}
						size="sm"
						type="button"
						variant="outline"
					>
						♻️ Respec
					</Button>
				</div>
			</section>
		</div>
	);
}
