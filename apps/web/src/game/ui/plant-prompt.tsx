"use client";

// Contextual farming overlay (wave 2). When a plot is selected (via the
// plotSelection singleton, driven by a PLOT_TAP tap on the map), this shows:
//   - for an EMPTY built plot: the crops plantable on that plot's biome (with
//     Gate-gating applied) and their mana costs, each planting on click;
//   - for a PLANTED plot: a growth read-out plus a Harvest action once grown.
// Every choice dispatches the REAL reducer events (PLOT_PLANT / PLOT_HARVEST).
//
// Self-contained: the integration agent mounts <PlantPrompt /> once inside the
// play surface. It renders nothing when no plot is selected.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
	BIOME_LABELS,
	type CropDef,
	cropById,
	cropsForPlot,
} from "@/game/data/farming";
import { useDispatch, useGameState } from "@/game/store/store";
import { growthFraction, isGrown } from "@/game/systems/farming";
import { plotSelection } from "@/game/three/specs/farming-specs";
import type { GameState, Plot } from "@/game/types";

const PERCENT = 100;

function biomeLabel(biome: string): string {
	return BIOME_LABELS[biome] ?? biome;
}

function poiTypeFor(state: GameState, hex: string): string | undefined {
	return state.deeds[hex]?.poiName;
}

function plantableCrops(state: GameState, plot: Plot): CropDef[] {
	const deed = state.deeds[plot.hex];
	return cropsForPlot(plot.biome, deed?.poiName, poiTypeFor(state, plot.hex));
}

// Subscribe to the selected plot hex without prop drilling, via the module
// singleton in farming-specs.
function useSelectedPlotHex(): string | null {
	return useSyncExternalStore(
		plotSelection.subscribe,
		plotSelection.get,
		() => null
	);
}

interface CropRowProps {
	affordable: boolean;
	crop: CropDef;
	onPlant: (cropId: string) => void;
}

function CropRow({ affordable, crop, onPlant }: CropRowProps) {
	return (
		<button
			className="flex w-full items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-slate-900/60 px-3 py-2 text-left transition-colors hover:border-cyan-400/50 hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-40"
			disabled={!affordable}
			onClick={() => onPlant(crop.id)}
			type="button"
		>
			<span className="flex items-center gap-2">
				<span aria-hidden="true">{crop.glyph}</span>
				<span className="font-medium text-cyan-100 text-sm">{crop.name}</span>
			</span>
			<span className="text-cyan-300/80 text-xs">{crop.plantCost} mana</span>
		</button>
	);
}

interface PlantedViewProps {
	now: number;
	onClose: () => void;
	onHarvest: () => void;
	plot: Plot;
}

function PlantedView({ now, onClose, onHarvest, plot }: PlantedViewProps) {
	const crop = cropById(plot.crop);
	const fraction = growthFraction(plot, now);
	const grown = isGrown(plot, now);
	const pct = Math.round(fraction * PERCENT);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<span aria-hidden="true">{crop?.glyph ?? "🌱"}</span>
				<span className="font-medium text-cyan-100 text-sm">
					{crop?.name ?? "Crop"}
				</span>
			</div>
			<div
				aria-label="Growth progress"
				aria-valuemax={PERCENT}
				aria-valuemin={0}
				aria-valuenow={pct}
				className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
				role="progressbar"
			>
				<div
					className="h-full rounded-full bg-cyan-400/80 transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>
			{grown ? (
				<button
					className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 font-medium text-emerald-200 text-sm transition-colors hover:bg-emerald-500/25"
					onClick={onHarvest}
					type="button"
				>
					Harvest
				</button>
			) : (
				<p className="text-slate-400 text-xs">Growing: {pct}% to harvest.</p>
			)}
			<button
				className="self-start text-slate-500 text-xs transition-colors hover:text-cyan-300"
				onClick={onClose}
				type="button"
			>
				Close
			</button>
		</div>
	);
}

interface EmptyViewProps {
	crops: CropDef[];
	mana: number;
	onClose: () => void;
	onPlant: (cropId: string) => void;
	plot: Plot;
}

function EmptyView({ crops, mana, onClose, onPlant, plot }: EmptyViewProps) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-slate-400 text-xs">{biomeLabel(plot.biome)} plot</p>
			{crops.length === 0 ? (
				<p className="text-slate-500 text-xs">
					No crops can grow on this plot.
				</p>
			) : (
				crops.map((crop) => (
					<CropRow
						affordable={mana >= crop.plantCost}
						crop={crop}
						key={crop.id}
						onPlant={onPlant}
					/>
				))
			)}
			<button
				className="self-start pt-1 text-slate-500 text-xs transition-colors hover:text-cyan-300"
				onClick={onClose}
				type="button"
			>
				Close
			</button>
		</div>
	);
}

export function PlantPrompt() {
	const state = useGameState();
	const dispatch = useDispatch();
	const selectedHex = useSelectedPlotHex();
	// Local mirror lets us close instantly without waiting on the singleton.
	const [openHex, setOpenHex] = useState<string | null>(null);

	useEffect(() => {
		setOpenHex(selectedHex);
	}, [selectedHex]);

	const close = () => {
		setOpenHex(null);
		plotSelection.clear();
	};

	if (!openHex) {
		return null;
	}
	const plot = state.plots[openHex];
	if (!plot) {
		return null;
	}

	const handlePlant = (cropId: string) => {
		dispatch({ type: "PLOT_PLANT", hex: plot.hex, crop: cropId });
		close();
	};
	const handleHarvest = () => {
		dispatch({ type: "PLOT_HARVEST", hex: plot.hex });
		close();
	};

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center px-3">
			<div className="pointer-events-auto w-full max-w-md rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-md">
				<div className="mb-2 flex items-center justify-between">
					<span className="font-medium text-cyan-200 text-sm">
						🌾 {plot.crop ? "Crop" : "Plant a crop"}
					</span>
					<button
						aria-label="Close plant prompt"
						className="rounded-full px-2 text-slate-400 transition-colors hover:text-cyan-300"
						onClick={close}
						type="button"
					>
						✕
					</button>
				</div>
				{plot.crop ? (
					<PlantedView
						now={state.lastTick}
						onClose={close}
						onHarvest={handleHarvest}
						plot={plot}
					/>
				) : (
					<EmptyView
						crops={plantableCrops(state, plot)}
						mana={state.resources.mana}
						onClose={close}
						onPlant={handlePlant}
						plot={plot}
					/>
				)}
			</div>
		</div>
	);
}
