"use client";

import { Button } from "@endgame/ui/components/button";
import { useEffect, useMemo, useRef } from "react";
import {
	POWER_THEME,
	parMsForRank,
	profileFor,
	THEME_META,
} from "@/game/data/gate-combat";
import { hexDistance } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import { ArenaScene } from "@/game/three/arena-scene";
import type { GateEnemy, GateRun } from "@/game/types";

// Renders the arena enemies as 3D skeleton models on a single shared canvas,
// sized to its parent. Sits behind the clickable enemy buttons, which keep the
// combat interactions (targeting, HP bars) intact.
function ArenaCanvas({ enemies }: { enemies: GateEnemy[] }): React.JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sceneRef = useRef<ArenaScene | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const scene = new ArenaScene();
		scene.attach(canvas);
		sceneRef.current = scene;
		const fit = (): void => {
			const parent = canvas.parentElement;
			if (parent) {
				scene.resize(parent.clientWidth, parent.clientHeight);
			}
		};
		fit();
		const observer = new ResizeObserver(fit);
		if (canvas.parentElement) {
			observer.observe(canvas.parentElement);
		}
		return () => {
			observer.disconnect();
			scene.dispose();
			sceneRef.current = null;
		};
	}, []);

	useEffect(() => {
		sceneRef.current?.sync(enemies);
	}, [enemies]);

	return (
		// biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas is not focusable and this layer is purely decorative behind the clickable enemy buttons.
		<canvas
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 h-full w-full"
			ref={canvasRef}
		/>
	);
}

const MS_PER_SECOND = 1000;
const NEARBY_RING = 8;
const MAX_NEARBY = 12;
const STAMINA_PER_DODGE = 18;
const FULL_STAR = "★";
const EMPTY_STAR = "☆";
const MAX_STARS = 5;

function formatSeconds(ms: number): string {
	return (ms / MS_PER_SECOND).toFixed(1);
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

function Bar({
	value,
	max,
	from,
	to,
	label,
}: {
	value: number;
	max: number;
	from: string;
	to: string;
	label: string;
}): React.JSX.Element {
	const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
	return (
		<div>
			<div className="flex justify-between text-[10px] text-slate-400">
				<span>{label}</span>
				<span className="tabular-nums">{Math.round(value)}</span>
			</div>
			<div className="mt-0.5 h-2 w-28 overflow-hidden rounded-full bg-slate-800/80">
				<div
					className={`h-full rounded-full bg-gradient-to-r ${from} ${to} transition-[width] duration-200`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function GateList(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const here = state.position.hex;

	const nearby = useMemo(() => {
		const gates = Object.values(state.gates);
		const scored = gates
			.map((gate) => {
				let dist = Number.POSITIVE_INFINITY;
				try {
					dist = hexDistance(here, gate.hex);
				} catch {
					dist = Number.POSITIVE_INFINITY;
				}
				return { gate, dist };
			})
			.filter((g) => g.dist <= NEARBY_RING && g.dist >= 0)
			.sort((a, b) => a.dist - b.dist)
			.slice(0, MAX_NEARBY);
		return scored;
	}, [state.gates, here]);

	const handleEnter = (hex: string): void => {
		dispatch({ type: "GATE_ENTER", hex });
	};

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className="text-xl">
					🌀
				</span>
				<h2 className="font-semibold text-cyan-100 text-lg">Nearby Gates</h2>
			</div>
			{nearby.length === 0 ? (
				<div className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-4 text-center text-slate-400 text-sm backdrop-blur-md">
					No gates within range. Explore to reveal more.
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{nearby.map(({ gate, dist }) => {
						const theme = THEME_META[gate.theme];
						return (
							<li key={gate.hex}>
								<div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-3 backdrop-blur-md">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span aria-hidden="true" className="text-lg">
												{theme.glyph}
											</span>
											<span className="truncate font-medium text-cyan-100 text-sm">
												{gate.name || theme.label}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
											<span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-semibold text-cyan-200">
												Rank {gate.rank}
											</span>
											<span>{dist} hex away</span>
											<span className="text-amber-300/90 tabular-nums">
												{FULL_STAR.repeat(gate.stars)}
												{EMPTY_STAR.repeat(MAX_STARS - gate.stars)}
											</span>
										</div>
									</div>
									<Button
										className="shrink-0 rounded-full border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
										onClick={() => handleEnter(gate.hex)}
										size="sm"
										type="button"
										variant="outline"
									>
										Enter
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function ResultCard({ run }: { run: GateRun }): React.JSX.Element {
	const dispatch = useDispatch();
	const won = run.status === "won";
	const stars = run.starsEarned;
	const handleExit = (): void => {
		dispatch({ type: "GATE_EXIT" });
	};

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-4">
			<div className="w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-6 text-center backdrop-blur-md">
				<div className="text-4xl">{won ? "🏆" : "💀"}</div>
				<h2
					className={`mt-2 font-bold text-2xl ${won ? "text-amber-200" : "text-rose-300"}`}
				>
					{won ? "Gate Cleared" : "Gate Failed"}
				</h2>
				{won && (
					<div className="mt-3 flex flex-col items-center gap-1">
						<StarRow stars={stars} />
						<div className="mt-2 grid grid-cols-1 gap-1 text-slate-300 text-sm">
							<div>
								Time:{" "}
								<span className="text-cyan-200 tabular-nums">
									{formatSeconds(run.elapsedMs)}s
								</span>
							</div>
							<div>
								HP kept:{" "}
								<span className="text-cyan-200 tabular-nums">
									{Math.round((run.playerHp / run.playerMaxHp) * 100)}%
								</span>
							</div>
							<div>
								Potions used:{" "}
								<span className="text-cyan-200 tabular-nums">
									{run.potionsUsed}
								</span>
							</div>
						</div>
					</div>
				)}
				{!won && (
					<p className="mt-2 text-slate-400 text-sm">
						The gate repelled you. Recover and try again.
					</p>
				)}
				<Button
					className="mt-5 w-full rounded-full border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
					onClick={handleExit}
					size="lg"
					type="button"
					variant="outline"
				>
					{won ? "Claim & Exit" : "Exit"}
				</Button>
			</div>
		</div>
	);
}

function ArenaView({ run }: { run: GateRun }): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const profile = profileFor(run.power);
	const aliveCount = run.enemies.filter((e) => e.hp > 0).length;

	// Auto-target the topmost living enemy for the focus ring highlight.
	const focusId = useMemo(() => {
		let best: GateEnemy | undefined;
		for (const e of run.enemies) {
			if (e.hp <= 0) {
				continue;
			}
			if (!best || e.y < best.y) {
				best = e;
			}
		}
		return best?.id;
	}, [run.enemies]);

	const par = parMsForRank(run.rank);
	const isClassChallenge = POWER_THEME[run.power] === run.theme;

	const onAttack = (enemyId?: string): void => {
		dispatch({ type: "GATE_ATTACK", enemyId });
	};
	const onSkill = (): void => {
		dispatch({ type: "GATE_SKILL", slot: 0 });
	};
	const onDodge = (): void => {
		dispatch({ type: "GATE_DODGE" });
	};
	const onPotion = (): void => {
		dispatch({ type: "GATE_USE_POTION" });
	};

	return (
		<div className="flex h-full flex-col">
			{/* Top wave / boss bar */}
			<div className="border-cyan-400/20 border-b bg-slate-950/80 px-3 py-2 backdrop-blur-md">
				<div className="flex items-center justify-between text-xs">
					<span className="flex items-center gap-1 font-semibold text-cyan-100">
						{THEME_META[run.theme].glyph} {THEME_META[run.theme].label} Gate
					</span>
					<span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-semibold text-cyan-200">
						Rank {run.rank}
					</span>
				</div>
				<div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
					<span>
						Wave{" "}
						<span className="text-cyan-200 tabular-nums">
							{run.wave}/{run.totalWaves}
						</span>
						{run.wave >= run.totalWaves ? " (Boss)" : ""}
					</span>
					<span className="tabular-nums">
						{formatSeconds(run.elapsedMs)}s / par {formatSeconds(par)}s
					</span>
				</div>
				{isClassChallenge && (
					<div className="mt-1 text-[10px] text-emerald-300/90">
						⭐ Class challenge active: matched power theme
					</div>
				)}
			</div>

			{/* Arena */}
			<div className="relative flex-1 overflow-hidden bg-gradient-to-b from-slate-900/40 to-slate-950/70">
				{/* 3D skeleton enemies render here; the buttons below overlay them to
				    keep targeting/HP interactions. */}
				<ArenaCanvas enemies={run.enemies} />
				{run.enemies.map((enemy) => {
					const dead = enemy.hp <= 0;
					const focused = enemy.id === focusId;
					const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
					return (
						<button
							aria-label={`Attack ${enemy.name}`}
							className={`absolute flex -translate-x-1/2 flex-col items-center transition-opacity ${dead ? "pointer-events-none opacity-20" : "opacity-100"}`}
							disabled={dead}
							key={enemy.id}
							onClick={() => onAttack(enemy.id)}
							style={{
								left: `${enemy.x * 100}%`,
								top: `${enemy.y * 100}%`,
								// Anchor the click target / HP bar at the model's feet.
								transform: "translate(-50%, -100%)",
							}}
							type="button"
						>
							<div
								className={`h-16 w-10 rounded-lg ${focused ? "ring-2 ring-rose-400/80 ring-offset-1 ring-offset-slate-950" : ""}`}
							/>
							<div className="mt-0.5 h-1.5 w-12 overflow-hidden rounded-full bg-slate-800/80">
								<div
									className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-300"
									style={{ width: `${hpPct}%` }}
								/>
							</div>
							<span className="mt-0.5 max-w-[80px] truncate text-[9px] text-slate-300">
								{enemy.name}
							</span>
						</button>
					);
				})}

				{/* Player HUD bottom-left */}
				<div className="absolute bottom-2 left-2 flex flex-col gap-1.5 rounded-xl border border-cyan-400/20 bg-slate-950/70 p-2 backdrop-blur-md">
					<Bar
						from="from-emerald-500"
						label="HP"
						max={run.playerMaxHp}
						to="to-emerald-300"
						value={run.playerHp}
					/>
					<Bar
						from="from-amber-500"
						label="STA"
						max={state.player.maxStamina}
						to="to-amber-300"
						value={run.stamina}
					/>
					<Bar
						from="from-sky-500"
						label="MANA"
						max={state.player.maxCombatMana}
						to="to-sky-300"
						value={run.mana}
					/>
				</div>

				{/* Player avatar bottom-center */}
				<div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-4xl">
					{profile.glyph}
				</div>
			</div>

			{/* Action bar */}
			<div className="border-cyan-400/20 border-t bg-slate-950/85 p-2 backdrop-blur-md">
				<div className="mb-1 text-center text-[10px] text-slate-400">
					{aliveCount} enem{aliveCount === 1 ? "y" : "ies"} remaining
				</div>
				<div className="grid grid-cols-4 gap-2">
					<Button
						className="rounded-xl border-rose-400/40 bg-rose-500/15 font-semibold text-rose-100"
						onClick={() => onAttack()}
						type="button"
						variant="outline"
					>
						⚔️ Attack
					</Button>
					<Button
						className="rounded-xl border-sky-400/40 bg-sky-500/15 font-semibold text-sky-100 disabled:opacity-40"
						disabled={run.mana < profile.skillCost}
						onClick={onSkill}
						type="button"
						variant="outline"
					>
						{profile.glyph} Skill
					</Button>
					<Button
						className="rounded-xl border-amber-400/40 bg-amber-500/15 font-semibold text-amber-100 disabled:opacity-40"
						disabled={run.stamina < STAMINA_PER_DODGE}
						onClick={onDodge}
						type="button"
						variant="outline"
					>
						💨 Dodge
					</Button>
					<Button
						className="rounded-xl border-emerald-400/40 bg-emerald-500/15 font-semibold text-emerald-100 disabled:opacity-40"
						disabled={run.playerHp >= run.playerMaxHp}
						onClick={onPotion}
						type="button"
						variant="outline"
					>
						🧪 Potion
					</Button>
				</div>
				<div className="mt-1 text-center text-[10px] text-slate-500">
					{profile.label} · {profile.skillName} ({profile.skillCost} mana) · tap
					an enemy to focus-fire
				</div>
			</div>
		</div>
	);
}

export default function GateCombatPanel(): React.JSX.Element {
	const state = useGameState();
	const run = state.activeGate;

	if (!run) {
		return <GateList />;
	}
	if (run.status === "won" || run.status === "lost") {
		return <ResultCard run={run} />;
	}
	return <ArenaView run={run} />;
}
