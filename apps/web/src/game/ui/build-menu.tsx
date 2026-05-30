"use client";

// Contextual build menu for a selected owned-empty hex. The foundation routes a
// WORLD_TAP_HEX tap into this menu's module singleton (`buildSelection`); the
// menu then lists the five estate buildings (from BUILDINGS) plus a Farm Plot
// option and dispatches the matching build event, gated by the player's mana.
//
// New file only. The integration agent renders <BuildMenu /> once and feeds taps
// into `buildSelection` (see handleWorldTapHex below).

import { useSyncExternalStore } from "react";
import { useDispatch, useGameState } from "@/game/store/store";
import { BUILDINGS, type EstateBuilding } from "@/game/systems/estates";
import { PLOT_BUILD_COST } from "@/game/systems/farming";
import type { GameEvent } from "@/game/types";

// ---------------------------------------------------------------------------
// Selection singleton. A tiny external store so the integration agent can route
// the foundation's WORLD_TAP_HEX into the menu with a single call, and the menu
// can subscribe React-correctly via useSyncExternalStore.
// ---------------------------------------------------------------------------

type SelectionListener = () => void;

function createBuildSelection() {
	let selectedHex: string | null = null;
	const listeners = new Set<SelectionListener>();

	const emit = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	return {
		select(hex: string): void {
			if (selectedHex === hex) {
				return;
			}
			selectedHex = hex;
			emit();
		},
		clear(): void {
			if (selectedHex === null) {
				return;
			}
			selectedHex = null;
			emit();
		},
		get(): string | null {
			return selectedHex;
		},
		subscribe(listener: SelectionListener): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export const buildSelection = createBuildSelection();

// Ready helper for the integration agent: route the foundation's open-union
// WORLD_TAP_HEX event straight into the selection. Ignores any other event so it
// is safe to call from a shared tap handler.
export function handleWorldTapHex(event: GameEvent): void {
	if (event.type !== "WORLD_TAP_HEX") {
		return;
	}
	const hex = (event as { hex?: unknown }).hex;
	if (typeof hex === "string") {
		buildSelection.select(hex);
	}
}

// ---------------------------------------------------------------------------
// Buildable option model. Estate buildings dispatch BUILDING_BUILD; the Farm
// Plot dispatches PLOT_BUILD into the separate farming system.
// ---------------------------------------------------------------------------

interface BuildOption {
	cost: number;
	description: string;
	icon: string;
	id: string;
	label: string;
	makeEvent: (hex: string) => GameEvent;
}

const ESTATE_ORDER: EstateBuilding[] = [
	"banner",
	"plot",
	"shop",
	"tower",
	"gate_anchor",
];

function estateOptions(): BuildOption[] {
	return ESTATE_ORDER.map((building) => {
		const spec = BUILDINGS[building];
		return {
			id: `estate:${building}`,
			cost: spec.cost,
			description: spec.description,
			icon: spec.icon,
			label: spec.label,
			makeEvent: (hex: string): GameEvent => ({
				type: "BUILDING_BUILD",
				hex,
				building,
			}),
		};
	});
}

// Farm Plot is a distinct mechanic from the estate "Plot" building: it creates a
// tillable plot in state.plots via the farming system, not a deed.building.
const FARM_OPTION: BuildOption = {
	id: "farm:plot",
	cost: PLOT_BUILD_COST,
	description: "Tillable farm plot for planting and harvesting crops.",
	icon: "🌾",
	label: "Farm Plot",
	makeEvent: (hex: string): GameEvent => ({ type: "PLOT_BUILD", hex }),
};

const BUILD_OPTIONS: BuildOption[] = [...estateOptions(), FARM_OPTION];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function subscribeSelection(listener: () => void): () => void {
	return buildSelection.subscribe(listener);
}

function getSelectedHex(): string | null {
	return buildSelection.get();
}

export default function BuildMenu(): React.JSX.Element | null {
	const selectedHex = useSyncExternalStore(
		subscribeSelection,
		getSelectedHex,
		getSelectedHex
	);
	const state = useGameState();
	const dispatch = useDispatch();

	if (!selectedHex) {
		return null;
	}

	const mana = state.resources.mana;
	const manaLabel = Math.floor(mana);

	const handleBuild = (option: BuildOption): void => {
		if (mana < option.cost) {
			return;
		}
		dispatch(option.makeEvent(selectedHex));
		buildSelection.clear();
	};

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
			<div className="pointer-events-auto flex max-h-[60vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-950/85 shadow-2xl backdrop-blur-md">
				<div className="flex shrink-0 items-center justify-between gap-2 border-cyan-400/20 border-b px-3 py-2">
					<div className="min-w-0">
						<p className="font-medium text-cyan-200 text-sm">Build here</p>
						<p className="truncate text-slate-400 text-xs" title={selectedHex}>
							{selectedHex}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-cyan-200 text-xs">
							💧 {manaLabel}
						</span>
						<button
							aria-label="Close build menu"
							className="rounded-full px-1 text-slate-400 transition-colors hover:text-cyan-200"
							onClick={() => buildSelection.clear()}
							type="button"
						>
							✕
						</button>
					</div>
				</div>
				<ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
					{BUILD_OPTIONS.map((option) => {
						const affordable = mana >= option.cost;
						return (
							<li key={option.id}>
								<button
									className="flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2 text-left transition-colors enabled:hover:border-cyan-400/40 enabled:hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={!affordable}
									onClick={() => handleBuild(option)}
									type="button"
								>
									<span aria-hidden="true" className="text-xl">
										{option.icon}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block font-medium text-slate-100 text-sm">
											{option.label}
										</span>
										<span className="block truncate text-slate-400 text-xs">
											{option.description}
										</span>
									</span>
									<span
										className={
											affordable
												? "shrink-0 font-medium text-cyan-200 text-xs"
												: "shrink-0 font-medium text-rose-300/80 text-xs"
										}
									>
										💧 {option.cost}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
