"use client";

import { Button } from "@endgame/ui/components/button";
import { useState } from "react";
import { useDispatch, useGameState } from "@/game/store/store";
import { fetchWeather, weatherBuffs } from "@/game/systems/weather";
import type { TimeOfDay, WeatherType } from "@/game/types";

const TIME_LABELS: Record<TimeOfDay, { label: string; glyph: string }> = {
	dawn: { label: "Dawn", glyph: "🌅" },
	day: { label: "Day", glyph: "☀️" },
	golden: { label: "Golden Hour", glyph: "🌇" },
	night: { label: "Night", glyph: "🌙" },
	witching: { label: "Witching Hour", glyph: "🌑" },
};

const WEATHER_LABELS: Record<WeatherType, { label: string; glyph: string }> = {
	clear: { label: "Clear", glyph: "🌞" },
	cloudy: { label: "Cloudy", glyph: "☁️" },
	rain: { label: "Rain", glyph: "🌧️" },
	thunder: { label: "Thunderstorm", glyph: "⛈️" },
	fog: { label: "Fog", glyph: "🌫️" },
	snow: { label: "Snow", glyph: "🌨️" },
	wind: { label: "Windy", glyph: "🍃" },
	heat: { label: "Heatwave", glyph: "🔥" },
	haze: { label: "Haze", glyph: "😶‍🌫️" },
	eclipse: { label: "Eclipse", glyph: "🌑" },
};

const THEME_LABELS: Record<string, string> = {
	bright_day: "Bright Day",
	golden_hour: "Golden Hour",
	awakened_night: "Awakened Night",
	eclipse: "Eclipse",
};

const MANUAL_WEATHER: WeatherType[] = [
	"clear",
	"cloudy",
	"rain",
	"thunder",
	"fog",
	"snow",
	"wind",
	"heat",
	"haze",
	"eclipse",
];

const PERCENT = 100;

function formatMult(mult: number): string {
	const pct = Math.round((mult - 1) * PERCENT);
	if (pct === 0) {
		return "0%";
	}
	return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function multTone(mult: number): string {
	if (mult > 1) {
		return "text-emerald-300";
	}
	if (mult < 1) {
		return "text-rose-300";
	}
	return "text-slate-400";
}

export default function WeatherPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { timeOfDay, weather, theme } = state.world;
	const time = TIME_LABELS[timeOfDay];
	const wx = WEATHER_LABELS[weather];
	const buffs = weatherBuffs(weather);

	const handleRefresh = async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const result = await fetchWeather(state.position.lat, state.position.lng);
			dispatch({ type: "WEATHER_FETCH_RESULT", weather: result });
		} catch {
			setError("Could not reach the sky. Try again.");
		} finally {
			setLoading(false);
		}
	};

	const handleSet = (next: WeatherType): void => {
		dispatch({ type: "WEATHER_SET", weather: next });
	};

	return (
		<div className="flex h-full flex-col gap-4 p-4 text-slate-100">
			<header className="flex items-center justify-between">
				<h2 className="font-semibold text-cyan-100 text-lg">Skies</h2>
				<span aria-hidden="true" className="text-2xl">
					{wx.glyph}
				</span>
			</header>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span aria-hidden="true" className="text-2xl">
							{time.glyph}
						</span>
						<div>
							<div className="font-medium text-cyan-100 text-sm">
								{time.label}
							</div>
							<div className="text-[11px] text-slate-400">Time of day</div>
						</div>
					</div>
					<div className="text-right">
						<div className="font-medium text-cyan-100 text-sm">
							{THEME_LABELS[theme] ?? theme}
						</div>
						<div className="text-[11px] text-slate-400">Theme</div>
					</div>
				</div>

				<div className="mt-4 flex items-center gap-2 border-cyan-400/10 border-t pt-4">
					<span aria-hidden="true" className="text-2xl">
						{wx.glyph}
					</span>
					<div>
						<div className="font-medium text-cyan-100 text-sm">{wx.label}</div>
						<div className="text-[11px] text-slate-400">{buffs.note}</div>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<h3 className="mb-3 font-medium text-cyan-200 text-xs uppercase tracking-wide">
					Active modifiers
				</h3>
				<dl className="grid grid-cols-2 gap-3 text-sm">
					<div>
						<dt className="text-[11px] text-slate-400">Mana</dt>
						<dd className={`tabular-nums ${multTone(buffs.manaMult)}`}>
							{formatMult(buffs.manaMult)}
						</dd>
					</div>
					<div>
						<dt className="text-[11px] text-slate-400">Capture</dt>
						<dd className={`tabular-nums ${multTone(buffs.captureMult)}`}>
							{formatMult(buffs.captureMult)}
						</dd>
					</div>
					<div>
						<dt className="text-[11px] text-slate-400">Combat</dt>
						<dd className={`tabular-nums ${multTone(buffs.combatMult)}`}>
							{formatMult(buffs.combatMult)}
						</dd>
					</div>
					<div>
						<dt className="text-[11px] text-slate-400">Stamina drain</dt>
						{/* Lower drain is better, so invert the tone. */}
						<dd
							className={`tabular-nums ${multTone(2 - buffs.staminaDrainMult)}`}
						>
							{formatMult(buffs.staminaDrainMult)}
						</dd>
					</div>
				</dl>
			</section>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<Button
					className="w-full rounded-full border-cyan-400/40 bg-slate-900/70 text-cyan-100"
					disabled={loading}
					onClick={handleRefresh}
					type="button"
					variant="outline"
				>
					{loading ? "Reading the sky..." : "🌤️ Refresh from Open-Meteo"}
				</Button>
				{error ? (
					<p className="mt-2 text-[11px] text-rose-300">{error}</p>
				) : (
					<p className="mt-2 text-[11px] text-slate-400">
						Pulls live weather for your current position.
					</p>
				)}
			</section>

			<section className="rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<h3 className="mb-3 font-medium text-cyan-200 text-xs uppercase tracking-wide">
					Set weather
				</h3>
				<div className="flex flex-wrap gap-2">
					{MANUAL_WEATHER.map((w) => {
						const active = w === weather;
						return (
							<button
								className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
									active
										? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
										: "border-cyan-400/20 bg-slate-900/60 text-slate-300 hover:border-cyan-400/40"
								}`}
								key={w}
								onClick={() => handleSet(w)}
								type="button"
							>
								<span aria-hidden="true">{WEATHER_LABELS[w].glyph}</span>{" "}
								{WEATHER_LABELS[w].label}
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}
