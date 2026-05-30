"use client";

import { Button } from "@endgame/ui/components/button";
import { useState } from "react";
import { HEX_VIEW_RING } from "@/game/constants";
import { BEACON_TIER_META, THEME_META } from "@/game/data/content";
import { hexCenter, hexDisk, hexDistance } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import { fetchOverpassContent } from "@/game/systems/content";
import type { Beacon, ContentSource, GameState, Gate } from "@/game/types";

// Collects gates/beacons whose hex is within the view ring of the player.
function nearbyContent(state: GameState): {
	gates: { gate: Gate; dist: number }[];
	beacons: { beacon: Beacon; dist: number }[];
} {
	const centerHex = state.position.hex;
	const ringSet = new Set(hexDisk(centerHex, HEX_VIEW_RING));

	const gates: { gate: Gate; dist: number }[] = [];
	for (const gate of Object.values(state.gates)) {
		if (!ringSet.has(gate.hex)) {
			continue;
		}
		gates.push({ gate, dist: distanceSafe(centerHex, gate.hex) });
	}
	gates.sort((a, b) => a.dist - b.dist);

	const beacons: { beacon: Beacon; dist: number }[] = [];
	for (const beacon of Object.values(state.beacons)) {
		if (!ringSet.has(beacon.hex)) {
			continue;
		}
		beacons.push({ beacon, dist: distanceSafe(centerHex, beacon.hex) });
	}
	beacons.sort((a, b) => a.dist - b.dist);

	return { gates, beacons };
}

// gridDistance throws across pentagon boundaries; clamp to a large value there.
const FAR = 999;
function distanceSafe(a: string, b: string): number {
	try {
		return hexDistance(a, b);
	} catch {
		return FAR;
	}
}

const RANK_TINT: Record<string, string> = {
	E: "text-slate-300",
	D: "text-emerald-300",
	C: "text-cyan-300",
	B: "text-indigo-300",
	A: "text-fuchsia-300",
	S: "text-amber-300",
};

export default function ContentPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const source = state.debug.contentSource;
	const { gates, beacons } = nearbyContent(state);

	const handleRegenerate = (): void => {
		dispatch({ type: "CONTENT_GENERATE", center: undefined });
	};

	const handleSetSource = (next: ContentSource): void => {
		dispatch({ type: "DEBUG_SET_CONTENT_SOURCE", source: next });
	};

	const handleEnrich = async (): Promise<void> => {
		setError(null);
		setBusy(true);
		try {
			const { lat, lng } = hexCenter(state.position.hex);
			const result = await fetchOverpassContent(lat, lng);
			dispatch({
				type: "CONTENT_OVERPASS_RESULT",
				gates: result.gates,
				beacons: result.beacons,
			});
		} catch {
			setError("Overpass unavailable. Procedural content kept.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex h-full flex-col gap-3 p-3 text-slate-100">
			<header className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-xl">
						🧭
					</span>
					<h2 className="font-semibold text-cyan-100 text-lg">Explore</h2>
				</div>
				<p className="mt-1 text-[11px] text-slate-400">
					What stirs within {HEX_VIEW_RING} rings of you.
				</p>

				<div className="mt-3 flex items-center gap-2">
					<Button
						className="flex-1 rounded-full border-cyan-400/40 bg-slate-900/70 text-cyan-200"
						onClick={handleRegenerate}
						size="sm"
						type="button"
						variant="outline"
					>
						🔄 Regenerate
					</Button>
				</div>

				<div className="mt-3">
					<span className="text-[11px] text-slate-400">Content source</span>
					<div className="mt-1 flex gap-2">
						<Button
							aria-pressed={source === "procedural"}
							className={
								source === "procedural"
									? "flex-1 rounded-full border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
									: "flex-1 rounded-full border-slate-600/40 bg-slate-900/70 text-slate-300"
							}
							onClick={() => handleSetSource("procedural")}
							size="sm"
							type="button"
							variant="outline"
						>
							✨ Procedural
						</Button>
						<Button
							aria-pressed={source === "overpass"}
							className={
								source === "overpass"
									? "flex-1 rounded-full border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
									: "flex-1 rounded-full border-slate-600/40 bg-slate-900/70 text-slate-300"
							}
							onClick={() => handleSetSource("overpass")}
							size="sm"
							type="button"
							variant="outline"
						>
							🌍 Overpass
						</Button>
					</div>
				</div>

				{source === "overpass" && (
					<div className="mt-3">
						<Button
							className="w-full rounded-full border-emerald-400/40 bg-slate-900/70 text-emerald-200"
							disabled={busy}
							onClick={handleEnrich}
							size="sm"
							type="button"
							variant="outline"
						>
							{busy ? "Querying Overpass…" : "📡 Enrich from real world"}
						</Button>
						{error && (
							<p className="mt-2 text-[11px] text-amber-300/90">{error}</p>
						)}
					</div>
				)}
			</header>

			<section className="flex-1 overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-3 backdrop-blur-md">
				<h3 className="mb-2 font-medium text-cyan-200 text-sm">
					Gates <span className="text-slate-500">({gates.length})</span>
				</h3>
				{gates.length === 0 ? (
					<p className="text-[12px] text-slate-500">
						No gates nearby. Try Regenerate or walk to a new hex.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{gates.map(({ gate, dist }) => {
							const meta = THEME_META[gate.theme];
							return (
								<li
									className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-900/60 px-3 py-2"
									key={gate.hex}
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span aria-hidden="true">{meta.glyph}</span>
											<span className="truncate font-medium text-slate-100 text-sm">
												{gate.name}
											</span>
											{gate.anchored && (
												<span
													aria-label="anchored"
													className="text-amber-300 text-xs"
													role="img"
												>
													⚓
												</span>
											)}
										</div>
										<div className="mt-0.5 text-[11px] text-slate-400">
											{meta.blurb} · {dist === FAR ? "far" : `${dist} away`}
										</div>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-1">
										<span
											className={`font-bold text-sm ${RANK_TINT[gate.rank] ?? "text-slate-300"}`}
										>
											{gate.rank}
										</span>
										<Button
											className="rounded-full border-cyan-400/40 bg-slate-950/70 px-3 text-cyan-200 text-xs"
											onClick={() =>
												dispatch({ type: "GATE_ENTER", hex: gate.hex })
											}
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

				<h3 className="mt-4 mb-2 font-medium text-cyan-200 text-sm">
					Beacons <span className="text-slate-500">({beacons.length})</span>
				</h3>
				{beacons.length === 0 ? (
					<p className="text-[12px] text-slate-500">No beacons nearby.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{beacons.map(({ beacon, dist }) => {
							const meta = BEACON_TIER_META[beacon.tier];
							return (
								<li
									className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-900/60 px-3 py-2"
									key={beacon.id}
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span aria-hidden="true">{meta.glyph}</span>
											<span className="font-medium text-slate-100 text-sm capitalize">
												{beacon.tier}
											</span>
										</div>
										<div className="mt-0.5 text-[11px] text-slate-400">
											{meta.blurb} · {dist === FAR ? "far" : `${dist} away`}
										</div>
									</div>
									<Button
										className="shrink-0 rounded-full border-cyan-400/40 bg-slate-950/70 px-3 text-cyan-200 text-xs"
										onClick={() =>
											dispatch({ type: "BEACON_SPIN", id: beacon.id })
										}
										size="sm"
										type="button"
										variant="outline"
									>
										Spin
									</Button>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
