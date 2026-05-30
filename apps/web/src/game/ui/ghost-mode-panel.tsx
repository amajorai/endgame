"use client";

import { Button } from "@endgame/ui/components/button";
import { VEHICLE_ORDER, VEHICLE_SPECS } from "@/game/data/vehicles";
import { useDispatch, useGameState } from "@/game/store/store";
import { GHOST_BUDGET } from "@/game/systems/ghost-mode";
import type { VehicleKind } from "@/game/types";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const PERCENT = 100;

function formatDuration(totalSeconds: number): string {
	const safe = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(safe / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
	const minutes = Math.floor(
		(safe % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE
	);
	const seconds = safe % SECONDS_PER_MINUTE;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

export default function GhostModePanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const ghost = state.world.ghost;
	const remaining = ghost.secondsRemaining;
	const barPct = Math.min(
		PERCENT,
		(remaining / GHOST_BUDGET.maxSeconds) * PERCENT
	);
	const ownedKinds = new Set<VehicleKind>(
		state.meta.vehicles.map((vehicle) => vehicle.kind)
	);
	ownedKinds.add("walk");

	const canEnter = remaining > 0;

	const handleToggle = (): void => {
		dispatch({ type: "GHOST_TOGGLE" });
	};

	const handleUseVehicle = (kind: VehicleKind): void => {
		dispatch({ type: "VEHICLE_USE", kind });
	};

	return (
		<div className="flex h-full flex-col gap-4 p-4 text-slate-100">
			<header className="flex items-center gap-2">
				<span aria-hidden="true" className="text-2xl">
					👻
				</span>
				<div>
					<h2 className="font-semibold text-cyan-100 text-lg">Ghost Mode</h2>
					<p className="text-[11px] text-slate-400">
						Project your spirit beyond your body to scout the map.
					</p>
				</div>
			</header>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<div className="flex items-center justify-between">
					<span className="font-medium text-cyan-200 text-xs">
						Ghost budget
					</span>
					<span className="text-cyan-100 text-sm tabular-nums">
						{formatDuration(remaining)}
					</span>
				</div>
				<div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800/80">
					<div
						className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-cyan-300 transition-[width] duration-300"
						style={{ width: `${barPct}%` }}
					/>
				</div>
				<div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
					<span>
						Daily refill {formatDuration(GHOST_BUDGET.dailySeconds)} at midnight
					</span>
					<span>Max {formatDuration(GHOST_BUDGET.maxSeconds)}</span>
				</div>
			</section>

			<Button
				className={
					ghost.active
						? "rounded-2xl border border-violet-400/50 bg-violet-500/20 text-violet-100"
						: "rounded-2xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
				}
				disabled={!(ghost.active || canEnter)}
				onClick={handleToggle}
				type="button"
				variant="outline"
			>
				{ghost.active ? "👻 Return to Body" : "✨ Project Ghost"}
			</Button>
			{!(ghost.active || canEnter) && (
				<p className="-mt-2 text-center text-[11px] text-amber-300/80">
					No ghost budget left. Walk to bank steps, or wait for midnight.
				</p>
			)}

			<section className="flex min-h-0 flex-1 flex-col">
				<h3 className="mb-2 font-medium text-cyan-200 text-xs uppercase tracking-wide">
					Vehicles
				</h3>
				<div className="flex flex-col gap-2 overflow-y-auto pr-1">
					{VEHICLE_ORDER.map((kind) => {
						const spec = VEHICLE_SPECS[kind];
						const owned = ownedKinds.has(kind);
						const affordable =
							remaining >= spec.budgetCostSeconds && ghost.active;
						return (
							<div
								className="flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-3"
								key={kind}
							>
								<span aria-hidden="true" className="text-xl">
									{spec.glyph}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium text-slate-100 text-sm">
											{spec.label}
										</span>
										<span className="text-[10px] text-cyan-300/80">
											×{spec.speedMultiplier} speed
										</span>
									</div>
									<p className="truncate text-[11px] text-slate-400">
										{spec.description}
									</p>
									<p className="text-[10px] text-slate-500">
										{spec.budgetCostSeconds > 0
											? `Costs ${formatDuration(spec.budgetCostSeconds)} budget`
											: "Free to use"}
									</p>
								</div>
								{owned ? (
									<Button
										className="rounded-full border-cyan-400/40 text-cyan-200"
										disabled={!affordable}
										onClick={() => handleUseVehicle(kind)}
										size="sm"
										type="button"
										variant="outline"
									>
										Use
									</Button>
								) : (
									<span className="rounded-full border border-slate-700/60 px-3 py-1 text-[10px] text-slate-500">
										Locked
									</span>
								)}
							</div>
						);
					})}
				</div>
			</section>

			<section className="rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-3 text-[11px] text-slate-400 leading-relaxed">
				<h3 className="mb-1 font-medium text-cyan-200">Ghost rules</h3>
				<ul className="list-disc space-y-1 pl-4">
					<li>Ghosts cannot capture wildland hexes while projecting.</li>
					<li>Damage dealt and loot earned are halved in ghost form.</li>
					<li>Every projected second drains your daily budget.</li>
					<li>Walk in the real world to bank steps and earn more time.</li>
				</ul>
			</section>
		</div>
	);
}
