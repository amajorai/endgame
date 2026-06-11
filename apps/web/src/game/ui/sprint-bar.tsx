"use client";

import { useSyncExternalStore } from "react";
import {
	getSprintStaminaSnapshot,
	subscribeSprintStamina,
} from "@/game/three/sprint-stamina";

const PERCENT = 100;

// Live sprint-stamina bar. Subscribes to the controller's transient charge (NOT
// the persisted store) via useSyncExternalStore, so it updates each frame the
// charge changes and stays idle otherwise. It sits above the radial FAB
// (bottom-center) and self-hides at full charge, so it only appears while
// sprinting or recovering. Sit it below the gate/boss combat HUD via the
// caller, which hides it during those overlays.
export function SprintBar(): React.JSX.Element | null {
	const snapshot = useSyncExternalStore(
		subscribeSprintStamina,
		getSprintStaminaSnapshot,
		getSprintStaminaSnapshot
	);

	// Full and not sprinting: nothing to show.
	if (snapshot.fraction >= 1 && !snapshot.sprinting) {
		return null;
	}

	const pct = Math.round(snapshot.fraction * PERCENT);
	let fillColor = "from-amber-500 to-amber-300";
	if (snapshot.exhausted) {
		fillColor = "from-rose-600 to-rose-400";
	} else if (snapshot.sprinting) {
		fillColor = "from-amber-400 to-yellow-200";
	}
	const label = snapshot.exhausted ? "Winded" : "Sprint";

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-3">
			<div className="pointer-events-auto w-40 rounded-2xl border border-amber-400/30 bg-slate-950/70 px-3 py-2 shadow-lg backdrop-blur-md">
				<div className="flex items-center justify-between text-[10px]">
					<span className="text-amber-200">
						<span aria-hidden="true">⚡</span> {label}
					</span>
					<span className="text-slate-400 tabular-nums">{pct}%</span>
				</div>
				<div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
					<div
						className={`h-full rounded-full bg-gradient-to-r ${fillColor} transition-[width] duration-150`}
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>
		</div>
	);
}
