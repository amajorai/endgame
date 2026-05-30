"use client";

// Contextual build prompt shown when the player taps one of their OWNED, empty
// hexes on the map. This is foundation plumbing only: it surfaces the tapped hex
// and a placeholder "Build here" affordance. Per-system agents (farming, estates)
// will fill in the actual build menu/dispatches; for now the affordance does
// nothing harmful and simply lets the player dismiss it.

export interface WorldActionPromptProps {
	hex: string;
	onClose: () => void;
}

export default function WorldActionPrompt({
	hex,
	onClose,
}: WorldActionPromptProps): React.JSX.Element {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
			<div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md">
				<div className="flex items-center justify-between gap-2">
					<div className="min-w-0">
						<p className="font-medium text-emerald-200 text-sm">Your land</p>
						<p className="truncate text-slate-400 text-xs" title={hex}>
							{hex}
						</p>
					</div>
					<button
						aria-label="Dismiss build prompt"
						className="shrink-0 rounded-full px-2 text-slate-400 transition-colors hover:text-emerald-200"
						onClick={onClose}
						type="button"
					>
						✕
					</button>
				</div>
				{/* Placeholder affordance. Per-system agents replace the onClick with a
				    real build menu; for now it only acknowledges and closes. */}
				<button
					className="mt-3 w-full rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 font-medium text-emerald-100 text-sm transition-colors hover:bg-emerald-500/20"
					onClick={onClose}
					type="button"
				>
					Build here
				</button>
			</div>
		</div>
	);
}
