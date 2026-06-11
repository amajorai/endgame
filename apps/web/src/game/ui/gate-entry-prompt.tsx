"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useDispatch, useGameState } from "@/game/store/store";

type GatePromptListener = () => void;

function createGateEntryPrompt() {
	let selectedHex: string | null = null;
	const listeners = new Set<GatePromptListener>();

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
		subscribe(listener: GatePromptListener): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export const gateEntryPrompt = createGateEntryPrompt();

function subscribeGatePrompt(listener: () => void): () => void {
	return gateEntryPrompt.subscribe(listener);
}

function getSelectedGateHex(): string | null {
	return gateEntryPrompt.get();
}

export function GateEntryPrompt(): React.JSX.Element | null {
	const selectedHex = useSyncExternalStore(
		subscribeGatePrompt,
		getSelectedGateHex,
		getSelectedGateHex
	);
	const state = useGameState();
	const dispatch = useDispatch();

	const gate = selectedHex ? state.gates[selectedHex] : null;

	useEffect(() => {
		if (selectedHex && (!gate || state.activeGate)) {
			gateEntryPrompt.clear();
		}
	}, [gate, selectedHex, state.activeGate]);

	if (!(selectedHex && gate) || state.activeGate) {
		return null;
	}

	const handleEnter = (): void => {
		dispatch({ type: "GATE_ENTER", hex: selectedHex });
		gateEntryPrompt.clear();
	};

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
			<div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-md">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="font-semibold text-cyan-100 text-sm">
							Enter {gate.name}?
						</p>
						<p className="mt-1 text-slate-400 text-xs">
							Rank {gate.rank} {gate.theme} gate
						</p>
					</div>
					<button
						aria-label="Close gate prompt"
						className="shrink-0 rounded-full px-2 text-slate-400 transition-colors hover:text-cyan-200"
						onClick={() => gateEntryPrompt.clear()}
						type="button"
					>
						✕
					</button>
				</div>
				<div className="mt-4 grid grid-cols-2 gap-2">
					<button
						className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 font-medium text-slate-200 text-sm transition-colors hover:border-slate-500 hover:bg-slate-800"
						onClick={() => gateEntryPrompt.clear()}
						type="button"
					>
						Cancel
					</button>
					<button
						className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 font-semibold text-cyan-100 text-sm transition-colors hover:bg-cyan-500/25"
						onClick={handleEnter}
						type="button"
					>
						Enter
					</button>
				</div>
			</div>
		</div>
	);
}
