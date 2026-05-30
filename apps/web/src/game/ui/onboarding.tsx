"use client";

import { Button } from "@endgame/ui/components/button";
import { useMemo, useState } from "react";
import { hexCenter, hexDisk, posToHex } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import type { JournalEntry, JournalStatus } from "@/game/types";

interface SuggestedSpot {
	hex: string;
	lat: number;
	lng: number;
	name: string;
}

// Cycles a journal pick: unmarked -> been -> want_to_go -> unmarked.
function nextStatus(current: JournalStatus | undefined): JournalStatus | null {
	if (current === undefined) {
		return "been";
	}
	if (current === "been") {
		return "want_to_go";
	}
	return null;
}

function statusLabel(status: JournalStatus | undefined): string {
	if (status === "been") {
		return "✅ Been";
	}
	if (status === "want_to_go") {
		return "⭐ Want to go";
	}
	return "Tap to mark";
}

function spotButtonClass(status: JournalStatus | undefined): string {
	if (status === "been") {
		return "border-cyan-400/50 bg-cyan-500/15 text-cyan-100";
	}
	if (status === "want_to_go") {
		return "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100";
	}
	return "border-slate-700/60 bg-slate-900/60 text-slate-300";
}

const SUGGESTION_RING = 2;
const MAX_SUGGESTIONS = 6;
const SPOT_NAMES = [
	"Corner Cafe",
	"Riverside Park",
	"Old Library",
	"Night Market",
	"Hilltop Shrine",
	"Harbor Walk",
	"Garden Plaza",
	"Transit Hub",
];

function buildSuggestions(centerHex: string): SuggestedSpot[] {
	const ring = hexDisk(centerHex, SUGGESTION_RING).filter(
		(hex) => hex !== centerHex
	);
	const spots: SuggestedSpot[] = [];
	for (let i = 0; i < ring.length && spots.length < MAX_SUGGESTIONS; i += 1) {
		const hex = ring[i];
		if (!hex) {
			continue;
		}
		const center = hexCenter(hex);
		spots.push({
			hex,
			lat: center.lat,
			lng: center.lng,
			name: SPOT_NAMES[spots.length % SPOT_NAMES.length] ?? "Unknown Spot",
		});
	}
	return spots;
}

export default function Onboarding(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const [step, setStep] = useState<"agreement" | "journal">("agreement");
	const [picks, setPicks] = useState<Record<string, JournalStatus>>({});

	const centerHex = useMemo(
		() =>
			state.position.hex ?? posToHex(state.position.lat, state.position.lng),
		[state.position.hex, state.position.lat, state.position.lng]
	);
	const suggestions = useMemo(() => buildSuggestions(centerHex), [centerHex]);

	const cyclePick = (hex: string): void => {
		setPicks((prev) => {
			const next = nextStatus(prev[hex]);
			const updated = { ...prev };
			if (next === null) {
				delete updated[hex];
			} else {
				updated[hex] = next;
			}
			return updated;
		});
	};

	const finish = (): void => {
		const now = Date.now();
		for (const spot of suggestions) {
			const status = picks[spot.hex];
			if (!status) {
				continue;
			}
			const entry: JournalEntry = {
				id: `onboard:${spot.hex}`,
				hex: spot.hex,
				lat: spot.lat,
				lng: spot.lng,
				name: spot.name,
				status,
				createdAt: now,
			};
			dispatch({ type: "JOURNAL_ADD", entry });
		}
		dispatch({ type: "ONBOARD_COMPLETE" });
	};

	const skip = (): void => {
		dispatch({ type: "ONBOARD_COMPLETE" });
	};

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
			<div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-5 shadow-2xl backdrop-blur-md">
				{step === "agreement" ? (
					<>
						<h2 className="font-semibold text-cyan-100 text-xl">
							🜂 Welcome, Hunter
						</h2>
						<p className="mt-3 text-slate-300 text-sm leading-relaxed">
							The End Game overlays a world of gates and shadows onto your real
							surroundings. Play with awareness.
						</p>
						<ul className="mt-3 flex flex-col gap-2 text-slate-300 text-sm">
							<li>• Stay alert to traffic, people, and your surroundings.</li>
							<li>• Never trespass or enter unsafe places to capture a hex.</li>
							<li>
								• Obey all local laws. The game is a guide, not a command.
							</li>
							<li>• You are responsible for your own safety at all times.</li>
						</ul>
						<div className="mt-5 flex items-center justify-between gap-3">
							<Button
								className="rounded-full text-slate-400"
								onClick={skip}
								type="button"
								variant="ghost"
							>
								Skip
							</Button>
							<Button
								className="rounded-full border-cyan-400/40 bg-cyan-500/20 text-cyan-100"
								onClick={() => setStep("journal")}
								type="button"
								variant="outline"
							>
								I understand
							</Button>
						</div>
					</>
				) : (
					<>
						<h2 className="font-semibold text-cyan-100 text-xl">
							📍 Seed Your Journal
						</h2>
						<p className="mt-2 text-slate-300 text-sm leading-relaxed">
							Tap nearby spots to mark them. Tap once for{" "}
							<span className="text-cyan-300">been</span>, again for{" "}
							<span className="text-fuchsia-300">want to go</span>, again to
							clear.
						</p>
						<div className="mt-4 flex flex-col gap-2">
							{suggestions.map((spot) => {
								const status = picks[spot.hex];
								return (
									<button
										className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${spotButtonClass(status)}`}
										key={spot.hex}
										onClick={() => cyclePick(spot.hex)}
										type="button"
									>
										<span>{spot.name}</span>
										<span className="text-xs">{statusLabel(status)}</span>
									</button>
								);
							})}
						</div>
						<div className="mt-5 flex items-center justify-between gap-3">
							<Button
								className="rounded-full text-slate-400"
								onClick={skip}
								type="button"
								variant="ghost"
							>
								Skip
							</Button>
							<Button
								className="rounded-full border-cyan-400/40 bg-cyan-500/20 text-cyan-100"
								onClick={finish}
								type="button"
								variant="outline"
							>
								Enter the world
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
