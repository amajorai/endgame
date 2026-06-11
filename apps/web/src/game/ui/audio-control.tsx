"use client";

import { useState } from "react";
import { audioBus } from "@/game/audio/audio-bus";
import { playSound, unlockAudio } from "@/game/audio/play";
import { useAudioMix } from "@/game/audio/use-audio-mix";

interface ChannelSliderProps {
	channel: "master" | "music" | "sfx";
	label: string;
	value: number;
}

function ChannelSlider({
	channel,
	label,
	value,
}: ChannelSliderProps): React.JSX.Element {
	return (
		<label className="flex items-center gap-2 text-[11px] text-slate-300">
			<span className="w-12 shrink-0">{label}</span>
			<input
				aria-label={`${label} volume`}
				className="h-1 flex-1 accent-cyan-400"
				max={1}
				min={0}
				onChange={(event) => {
					audioBus.setChannel(channel, Number(event.target.value));
				}}
				step={0.05}
				type="range"
				value={value}
			/>
		</label>
	);
}

// Floating audio mixer: a mute/volume button that opens a small popover with
// master / music / sfx sliders. The button doubles as an audio-unlock gesture.
export function AudioControl(): React.JSX.Element {
	const mix = useAudioMix();
	const [open, setOpen] = useState(false);

	const handleToggleOpen = (): void => {
		// First interaction here also satisfies the browser autoplay gesture.
		unlockAudio();
		setOpen((prev) => !prev);
	};

	const handleMute = (): void => {
		const next = !mix.muted;
		audioBus.setMuted(next);
		if (!next) {
			playSound("ui_toggle_on");
		}
	};

	const icon = mix.muted || mix.master === 0 ? "🔇" : "🔊";

	return (
		<div className="pointer-events-auto relative">
			<button
				aria-expanded={open}
				aria-label="Audio settings"
				className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-950/70 text-base shadow-lg backdrop-blur-md transition-colors hover:border-cyan-300"
				onClick={handleToggleOpen}
				type="button"
			>
				<span aria-hidden="true">{icon}</span>
			</button>

			{open && (
				<div className="absolute top-11 right-0 z-50 w-56 rounded-xl border border-cyan-400/30 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md">
					<div className="mb-2 flex items-center justify-between">
						<span className="font-medium text-cyan-200 text-xs">Audio</span>
						<button
							aria-label={mix.muted ? "Unmute" : "Mute"}
							className="rounded-md border border-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-300 hover:text-cyan-200"
							onClick={handleMute}
							type="button"
						>
							{mix.muted ? "Unmute" : "Mute"}
						</button>
					</div>
					<div className="flex flex-col gap-2">
						<ChannelSlider channel="master" label="Master" value={mix.master} />
						<ChannelSlider channel="music" label="Music" value={mix.music} />
						<ChannelSlider channel="sfx" label="SFX" value={mix.sfx} />
					</div>
				</div>
			)}
		</div>
	);
}
