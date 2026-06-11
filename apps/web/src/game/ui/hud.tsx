"use client";

import { Button } from "@endgame/ui/components/button";
import { hexClassFor } from "@/game/lib/hex";
import { useDispatch, useGameReady, useGameState } from "@/game/store/store";
import type { HexClass } from "@/game/types";
import { AudioControl } from "@/game/ui/audio-control";

const HEX_CLASS_LABELS: Record<HexClass, string> = {
	wildland: "Wildland",
	control_point: "Control Point",
	sanctum: "Sanctum",
};

const FULL_CAPTURE = 100;

function pct(value: number, max: number): number {
	if (max <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(100, (value / max) * 100));
}

function VitalBar({
	color,
	label,
	max,
	value,
}: {
	color: string;
	label: string;
	max: number;
	value: number;
}): React.JSX.Element {
	return (
		<div>
			<div className="flex items-center justify-between text-[10px] text-slate-400">
				<span>{label}</span>
				<span className="tabular-nums">
					{Math.round(value)}/{Math.round(max)}
				</span>
			</div>
			<div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
				<div
					className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-200`}
					style={{ width: `${pct(value, max)}%` }}
				/>
			</div>
		</div>
	);
}

function ownedHexCount(
	deeds: ReturnType<typeof useGameState>["deeds"]
): number {
	let count = 0;
	for (const deed of Object.values(deeds)) {
		if (deed.owner === "player" && deed.capturePct >= FULL_CAPTURE) {
			count += 1;
		}
	}
	return count;
}

export function Hud(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const ready = useGameReady();

	const currentHex = state.position.hex;
	const deed = state.deeds[currentHex];
	const meter = state.captureMeters[currentHex];
	const hexClass = deed?.hexClass ?? hexClassFor(currentHex);
	const capturePct = Math.round(meter?.progress ?? deed?.capturePct ?? 0);
	const owner = deed?.owner ?? "neutral";
	const mana = Math.round(state.resources.mana);
	const owned = ownedHexCount(state.deeds);
	const combatRun =
		state.activeGate?.status === "active" ? state.activeGate : null;
	const playerHp = combatRun?.playerHp ?? state.player.hp;
	const playerMaxHp = combatRun?.playerMaxHp ?? state.player.maxHp;
	const stamina = combatRun?.stamina ?? state.player.stamina;
	const combatMana = combatRun?.mana ?? state.player.combatMana;

	const handleToggleGps = (): void => {
		dispatch({ type: "SET_GPS_MODE", on: !state.useRealGps });
	};

	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="pointer-events-auto w-52 rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-4 py-3 shadow-lg backdrop-blur-md">
					<div className="flex items-center gap-2">
						<span aria-hidden="true" className="text-cyan-300 text-lg">
							⚡
						</span>
						<span className="font-semibold text-cyan-100 text-xl tabular-nums">
							{mana}
						</span>
						<span className="text-cyan-400/70 text-xs">mana</span>
					</div>
					<div className="mt-1 text-[11px] text-slate-400">
						{owned} hex{owned === 1 ? "" : "es"} held
					</div>
					<div className="mt-3 flex flex-col gap-1.5">
						<VitalBar
							color="from-emerald-500 to-emerald-300"
							label="HP"
							max={playerMaxHp}
							value={playerHp}
						/>
						<VitalBar
							color="from-amber-500 to-amber-300"
							label="STA"
							max={state.player.maxStamina}
							value={stamina}
						/>
						<VitalBar
							color="from-sky-500 to-sky-300"
							label="MANA"
							max={state.player.maxCombatMana}
							value={combatMana}
						/>
					</div>
				</div>

				<div className="flex items-start gap-2">
					<AudioControl />
					<div className="pointer-events-auto rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-4 py-3 text-right shadow-lg backdrop-blur-md">
						<div className="font-semibold text-cyan-100 text-sm">
							Rank {state.player.rank}
						</div>
						<div className="text-[11px] text-slate-400">
							Level {state.player.level}
						</div>
						{!ready && (
							<div className="mt-1 text-[10px] text-amber-300/80">
								loading...
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="flex items-end justify-between gap-3">
				<div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-4 py-3 shadow-lg backdrop-blur-md">
					<div className="flex items-center justify-between">
						<span className="font-medium text-cyan-100 text-xs">
							{HEX_CLASS_LABELS[hexClass]}
						</span>
						<span className="text-[11px] text-slate-400 capitalize">
							{owner}
						</span>
					</div>
					<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
						<div
							className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-[width] duration-300"
							style={{ width: `${capturePct}%` }}
						/>
					</div>
					<div className="mt-1 text-right text-[10px] text-cyan-300/80 tabular-nums">
						{capturePct}% captured
					</div>
				</div>

				<Button
					className="pointer-events-auto rounded-full border-cyan-400/40 bg-slate-950/70 text-cyan-200 backdrop-blur-md"
					onClick={handleToggleGps}
					size="sm"
					type="button"
					variant="outline"
				>
					GPS {state.useRealGps ? "On" : "Off"}
				</Button>
			</div>
		</div>
	);
}
