"use client";

import { Button } from "@endgame/ui/components/button";
import { useMemo, useState } from "react";
import {
	BIOME_LABELS,
	type CropDef,
	cropById,
	cropsForPlot,
} from "@/game/data/farming";
import { hexClassFor } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	growthFraction,
	isGrown,
	PLOT_BUILD_COST,
} from "@/game/systems/farming";
import type { Deed, Plot, Shadow } from "@/game/types";

const FULL_CAPTURE = 100;
const PERCENT = 100;

function ownedHexes(deeds: Record<string, Deed>): string[] {
	const list: string[] = [];
	for (const deed of Object.values(deeds)) {
		if (deed.owner === "player" && deed.capturePct >= FULL_CAPTURE) {
			list.push(deed.hex);
		}
	}
	return list;
}

function shortHex(hex: string): string {
	return hex.length > 8 ? `${hex.slice(0, 5)}…${hex.slice(-3)}` : hex;
}

function PlotCard({
	hex,
	plot,
	poiName,
	now,
	mana,
	shadows,
	onPlant,
	onHarvest,
	onAssign,
}: {
	hex: string;
	plot: Plot;
	poiName: string | undefined;
	now: number;
	mana: number;
	shadows: Shadow[];
	onPlant: (hex: string, crop: string) => void;
	onHarvest: (hex: string) => void;
	onAssign: (hex: string, shadowId: string) => void;
}): React.JSX.Element {
	const [picking, setPicking] = useState(false);
	const crop = cropById(plot.crop);
	const fraction = growthFraction(plot, now);
	const grown = isGrown(plot, now);
	const plantable = cropsForPlot(plot.biome, poiName, poiName);
	const assignedShadow = shadows.find((s) => s.id === plot.assignedShadow);
	const freeShadows = shadows.filter(
		(s) => !s.assignedHex || s.assignedHex === hex
	);

	const pctLabel = Math.round(fraction * PERCENT);

	return (
		<div className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-cyan-100 text-sm">
					{BIOME_LABELS[plot.biome] ?? plot.biome}
				</span>
				<span className="font-mono text-[10px] text-slate-500">
					{shortHex(hex)}
				</span>
			</div>

			{crop ? (
				<div className="mt-3">
					<div className="flex items-center justify-between text-xs">
						<span className="text-cyan-200">
							{crop.glyph} {crop.name}
						</span>
						<span className="text-cyan-300/80 tabular-nums">
							{grown ? "Ready!" : `${pctLabel}%`}
						</span>
					</div>
					<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
						<div
							className={`h-full rounded-full transition-[width] duration-300 ${
								grown
									? "bg-gradient-to-r from-emerald-400 to-emerald-300"
									: "bg-gradient-to-r from-cyan-500 to-cyan-300"
							}`}
							style={{ width: `${pctLabel}%` }}
						/>
					</div>
					{crop.gatePoiTypes.length > 0 && (
						<p className="mt-1 text-[10px] text-amber-300/70">
							Gate crop: matures only near {crop.gatePoiTypes.join(", ")}
						</p>
					)}
					<Button
						className="mt-3 w-full rounded-xl border-emerald-400/40 text-emerald-200 disabled:opacity-40"
						disabled={!grown}
						onClick={() => onHarvest(hex)}
						size="sm"
						type="button"
						variant="outline"
					>
						🧺 Harvest {crop.yieldQty + (plot.assignedShadow ? 1 : 0)}{" "}
						{crop.yieldName}
					</Button>
				</div>
			) : (
				<div className="mt-3">
					{picking ? (
						<div className="flex flex-col gap-1.5">
							{plantable.length === 0 && (
								<p className="text-[11px] text-slate-400">
									No crops grow in this biome.
								</p>
							)}
							{plantable.map((c: CropDef) => {
								const affordable = mana >= c.plantCost;
								return (
									<button
										className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-slate-900/60 px-3 py-2 text-left text-cyan-100 text-xs disabled:opacity-40"
										disabled={!affordable}
										key={c.id}
										onClick={() => {
											onPlant(hex, c.id);
											setPicking(false);
										}}
										type="button"
									>
										<span>
											{c.glyph} {c.name}
										</span>
										<span className="text-cyan-400/70">⚡{c.plantCost}</span>
									</button>
								);
							})}
							<Button
								className="mt-1 w-full rounded-xl text-slate-400"
								onClick={() => setPicking(false)}
								size="sm"
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
						</div>
					) : (
						<Button
							className="w-full rounded-xl border-cyan-400/40 text-cyan-200"
							onClick={() => setPicking(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							🌱 Plant a crop
						</Button>
					)}
				</div>
			)}

			<div className="mt-3 border-cyan-400/10 border-t pt-2">
				<div className="flex items-center justify-between text-[11px] text-slate-400">
					<span>Shadow</span>
					<span className="text-cyan-200/80">
						{assignedShadow ? `👤 ${assignedShadow.name} (2× growth)` : "none"}
					</span>
				</div>
				{freeShadows.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{freeShadows.map((s) => {
							const active = s.id === plot.assignedShadow;
							return (
								<button
									className={`rounded-full border px-2.5 py-1 text-[10px] ${
										active
											? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
											: "border-cyan-400/30 text-cyan-300/80"
									}`}
									key={s.id}
									onClick={() => onAssign(hex, s.id)}
									type="button"
								>
									{s.name}
								</button>
							);
						})}
					</div>
				)}
				{shadows.length === 0 && (
					<p className="mt-1 text-[10px] text-slate-500">
						Defeat monsters to extract shadows that speed growth.
					</p>
				)}
			</div>
		</div>
	);
}

export default function FarmingPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const now = state.lastTick;
	const mana = Math.floor(state.resources.mana);

	const owned = useMemo(() => ownedHexes(state.deeds), [state.deeds]);
	const unbuilt = owned.filter((hex) => !state.plots[hex]);
	const plotEntries = Object.entries(state.plots);

	const readyCount = plotEntries.filter(([, plot]) =>
		isGrown(plot, now)
	).length;

	const build = (hex: string): void => {
		dispatch({ type: "PLOT_BUILD", hex });
	};
	const plant = (hex: string, crop: string): void => {
		dispatch({ type: "PLOT_PLANT", hex, crop });
	};
	const harvest = (hex: string): void => {
		dispatch({ type: "PLOT_HARVEST", hex });
	};
	const assign = (hex: string, shadowId: string): void => {
		dispatch({ type: "PLOT_ASSIGN_SHADOW", hex, shadowId });
	};

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
				<h2 className="flex items-center gap-2 font-semibold text-cyan-100 text-lg">
					<span aria-hidden="true">🌾</span> Farms
				</h2>
				<p className="mt-1 text-[11px] text-slate-400">
					{plotEntries.length} plot{plotEntries.length === 1 ? "" : "s"} ·{" "}
					{readyCount} ready · ⚡{mana} mana
				</p>
			</header>

			{unbuilt.length > 0 && (
				<section>
					<h3 className="mb-2 px-1 text-[11px] text-slate-400 uppercase tracking-wide">
						Build on owned land
					</h3>
					<div className="flex flex-col gap-2">
						{unbuilt.map((hex) => {
							const deed = state.deeds[hex];
							const hexClass = deed?.hexClass ?? hexClassFor(hex);
							return (
								<div
									className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2.5 backdrop-blur-md"
									key={hex}
								>
									<div className="min-w-0">
										<p className="truncate text-cyan-100 text-xs">
											{deed?.poiName ?? shortHex(hex)}
										</p>
										<p className="text-[10px] text-slate-500 capitalize">
											{hexClass.replace("_", " ")}
										</p>
									</div>
									<Button
										className="shrink-0 rounded-xl border-cyan-400/40 text-cyan-200 disabled:opacity-40"
										disabled={mana < PLOT_BUILD_COST}
										onClick={() => build(hex)}
										size="sm"
										type="button"
										variant="outline"
									>
										🛠️ Build ⚡{PLOT_BUILD_COST}
									</Button>
								</div>
							);
						})}
					</div>
				</section>
			)}

			<section className="flex flex-col gap-3">
				{plotEntries.length === 0 ? (
					<div className="rounded-2xl border border-cyan-400/20 border-dashed bg-slate-950/60 p-6 text-center">
						<p className="text-slate-400 text-sm">No farm plots yet.</p>
						<p className="mt-1 text-[11px] text-slate-500">
							{owned.length === 0
								? "Capture a hex fully, then build a plot here."
								: "Build a plot on your owned land above."}
						</p>
					</div>
				) : (
					plotEntries.map(([hex, plot]) => (
						<PlotCard
							hex={hex}
							key={hex}
							mana={mana}
							now={now}
							onAssign={assign}
							onHarvest={harvest}
							onPlant={plant}
							plot={plot}
							poiName={state.deeds[hex]?.poiName}
							shadows={state.shadows}
						/>
					))
				)}
			</section>
		</div>
	);
}
