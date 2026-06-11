"use client";

import { Button } from "@endgame/ui/components/button";
import { useMemo } from "react";
import { THEME_META } from "@/game/data/gate-combat";
import { hexDistance } from "@/game/lib/hex";
import { useGameState } from "@/game/store/store";
import { gateEntryPrompt } from "@/game/ui/gate-entry-prompt";

const NEARBY_RING = 8;
const MAX_NEARBY = 12;
const FULL_STAR = "★";
const EMPTY_STAR = "☆";
const MAX_STARS = 5;

function GateList(): React.JSX.Element {
	const state = useGameState();
	const here = state.position.hex;

	const nearby = useMemo(() => {
		const gates = Object.values(state.gates);
		return gates
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
	}, [state.gates, here]);

	const handleChallenge = (hex: string): void => {
		gateEntryPrompt.select(hex);
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
										onClick={() => handleChallenge(gate.hex)}
										size="sm"
										type="button"
										variant="outline"
									>
										Challenge
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

export default function GateCombatPanel(): React.JSX.Element {
	return <GateList />;
}
