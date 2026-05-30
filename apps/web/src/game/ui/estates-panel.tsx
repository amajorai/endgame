"use client";

import { Button } from "@endgame/ui/components/button";
import { useMemo, useState } from "react";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	ANCHORED_GATE_TOLL,
	BUILDINGS,
	type EstateBuilding,
	netManaPerHour,
	TIER_BONUS,
	TIER_LABELS,
} from "@/game/systems/estates";
import type { Deed, Estate } from "@/game/types";

const FULL_CAPTURE = 100;
const BUILDING_ORDER: EstateBuilding[] = [
	"plot",
	"shop",
	"tower",
	"gate_anchor",
	"banner",
];

function isHeld(deed: Deed): boolean {
	return deed.owner === "player" && deed.capturePct >= FULL_CAPTURE;
}

function hexShort(hex: string): string {
	return hex.length > 8 ? `${hex.slice(0, 4)}…${hex.slice(-3)}` : hex;
}

function tierBadgeClass(tier: Estate["tier"]): string {
	if (tier === "monopoly") {
		return "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200";
	}
	if (tier === "manor") {
		return "border-amber-400/50 bg-amber-500/10 text-amber-200";
	}
	if (tier === "estate") {
		return "border-cyan-400/50 bg-cyan-500/10 text-cyan-200";
	}
	return "border-slate-400/40 bg-slate-500/10 text-slate-200";
}

function EstateCard({
	estate,
	deeds,
}: {
	estate: Estate;
	deeds: Record<string, Deed>;
}): React.JSX.Element {
	const bonusPct = Math.round(TIER_BONUS[estate.tier] * 100);
	const buildings = estate.hexes
		.map((hex) => deeds[hex]?.building)
		.filter((b): b is string => Boolean(b));

	return (
		<div className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
			<div className="flex items-center justify-between gap-2">
				<span
					className={`rounded-full border px-2.5 py-0.5 font-semibold text-xs ${tierBadgeClass(estate.tier)}`}
				>
					{TIER_LABELS[estate.tier]}
				</span>
				<span className="text-cyan-300/90 text-xs tabular-nums">
					+{bonusPct}% mana
				</span>
			</div>
			<div className="mt-2 text-[11px] text-slate-400">
				{estate.hexes.length} connected hex
				{estate.hexes.length === 1 ? "" : "es"}
			</div>
			{buildings.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{buildings.map((building) => {
						const spec = BUILDINGS[building as EstateBuilding];
						return (
							<span
								className="rounded-md border border-slate-600/40 bg-slate-800/60 px-1.5 py-0.5 text-[11px] text-slate-200"
								key={`${estate.id}-b-${building}`}
							>
								{spec ? `${spec.icon} ${spec.label}` : building}
							</span>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default function EstatesPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const [selectedHex, setSelectedHex] = useState<string | null>(null);

	const heldHexes = useMemo(() => {
		const list: Deed[] = [];
		for (const deed of Object.values(state.deeds)) {
			if (isHeld(deed)) {
				list.push(deed);
			}
		}
		return list.sort((a, b) => a.hex.localeCompare(b.hex));
	}, [state.deeds]);

	const flow = useMemo(() => netManaPerHour(state), [state]);
	const mana = Math.round(state.resources.mana);

	const handleBuild = (hex: string, building: EstateBuilding): void => {
		dispatch({ type: "BUILDING_BUILD", hex, building });
	};

	const activeHex = selectedHex ?? heldHexes[0]?.hex ?? null;
	const activeDeed = activeHex ? state.deeds[activeHex] : undefined;

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<header>
				<h2 className="font-semibold text-cyan-100 text-lg">🏰 Estates</h2>
				<p className="text-[11px] text-slate-400">
					Link captured hexes into estates for mana bonuses.
				</p>
			</header>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
				<div className="flex items-center justify-between">
					<span className="text-cyan-100 text-sm">Treasury</span>
					<span className="font-semibold text-cyan-200 tabular-nums">
						⚡ {mana}
					</span>
				</div>
				<dl className="mt-3 space-y-1 text-[11px]">
					<div className="flex justify-between text-slate-300">
						<dt>Base</dt>
						<dd className="tabular-nums">+{flow.base.toFixed(2)}/hr</dd>
					</div>
					<div className="flex justify-between text-cyan-300/90">
						<dt>Estate bonus</dt>
						<dd className="tabular-nums">+{flow.bonus.toFixed(2)}/hr</dd>
					</div>
					<div className="flex justify-between text-rose-300/90">
						<dt>Upkeep</dt>
						<dd className="tabular-nums">-{flow.upkeep.toFixed(2)}/hr</dd>
					</div>
					<div className="mt-1 flex justify-between border-slate-700/60 border-t pt-1 font-semibold text-cyan-100">
						<dt>Net</dt>
						<dd className="tabular-nums">{flow.net.toFixed(2)}/hr</dd>
					</div>
				</dl>
			</section>

			<section className="space-y-3">
				<h3 className="font-medium text-cyan-200 text-sm">
					Estates ({state.estates.length})
				</h3>
				{state.estates.length === 0 ? (
					<p className="rounded-2xl border border-slate-700/50 bg-slate-950/60 p-4 text-[11px] text-slate-400">
						Capture and link at least {5} connected hexes to form your first
						holdings.
					</p>
				) : (
					state.estates.map((estate) => (
						<EstateCard deeds={state.deeds} estate={estate} key={estate.id} />
					))
				)}
			</section>

			<section className="space-y-3">
				<h3 className="font-medium text-cyan-200 text-sm">
					Build ({heldHexes.length} owned hex
					{heldHexes.length === 1 ? "" : "es"})
				</h3>
				{heldHexes.length === 0 ? (
					<p className="rounded-2xl border border-slate-700/50 bg-slate-950/60 p-4 text-[11px] text-slate-400">
						No fully captured hexes yet. Hold a hex at 100% to build on it.
					</p>
				) : (
					<>
						<div className="flex flex-wrap gap-1.5">
							{heldHexes.map((deed) => {
								const isActive = deed.hex === activeHex;
								return (
									<button
										className={`rounded-lg border px-2 py-1 text-[11px] tabular-nums transition-colors ${
											isActive
												? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
												: "border-slate-600/40 bg-slate-800/50 text-slate-300 hover:border-cyan-400/40"
										}`}
										key={deed.hex}
										onClick={() => setSelectedHex(deed.hex)}
										type="button"
									>
										{deed.building ? "▣ " : ""}
										{hexShort(deed.hex)}
									</button>
								);
							})}
						</div>

						{activeDeed && (
							<div className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
								<div className="flex items-center justify-between">
									<span className="text-cyan-100 text-sm capitalize">
										{activeDeed.hexClass.replace("_", " ")}
									</span>
									<span className="text-[11px] text-slate-400">
										{activeDeed.building
											? `Built: ${BUILDINGS[activeDeed.building as EstateBuilding]?.label ?? activeDeed.building}`
											: "Empty"}
									</span>
								</div>
								<div className="mt-3 grid gap-2">
									{BUILDING_ORDER.map((building) => {
										const spec = BUILDINGS[building];
										const affordable = state.resources.mana >= spec.cost;
										const current = activeDeed.building === building;
										return (
											<div
												className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/50 bg-slate-900/50 p-2.5"
												key={building}
											>
												<div className="min-w-0">
													<div className="flex items-center gap-1.5 text-cyan-100 text-sm">
														<span aria-hidden="true">{spec.icon}</span>
														<span>{spec.label}</span>
														{building === "gate_anchor" && (
															<span className="text-[10px] text-rose-300/80">
																toll {ANCHORED_GATE_TOLL}/day
															</span>
														)}
													</div>
													<p className="truncate text-[10px] text-slate-400">
														{spec.description}
													</p>
													<p className="text-[10px] text-slate-500 tabular-nums">
														⚡ {spec.cost} · upkeep {spec.upkeep}/day
													</p>
												</div>
												<Button
													className="shrink-0 border-cyan-400/40 bg-slate-950/70 text-cyan-200"
													disabled={!affordable || current}
													onClick={() => handleBuild(activeDeed.hex, building)}
													size="sm"
													type="button"
													variant="outline"
												>
													{current ? "Built" : "Build"}
												</Button>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</>
				)}
			</section>
		</div>
	);
}
