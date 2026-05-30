"use client";

import { Button } from "@endgame/ui/components/button";
import { Input } from "@endgame/ui/components/input";
import { Label } from "@endgame/ui/components/label";
import { useState } from "react";
import { STORAGE_KEY } from "@/game/storage/adapter";
import { useDispatch, useGameState } from "@/game/store/store";
import type { ContentSource, Rank, TimeOfDay, WeatherType } from "@/game/types";

const WEATHERS: WeatherType[] = [
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

const WEATHER_GLYPHS: Record<WeatherType, string> = {
	clear: "☀️",
	cloudy: "☁️",
	rain: "🌧️",
	thunder: "⛈️",
	fog: "🌫️",
	snow: "❄️",
	wind: "💨",
	heat: "🔥",
	haze: "🌁",
	eclipse: "🌑",
};

const TIMES: TimeOfDay[] = ["dawn", "day", "golden", "night", "witching"];

const TIME_GLYPHS: Record<TimeOfDay, string> = {
	dawn: "🌅",
	day: "🏙️",
	golden: "🌇",
	night: "🌃",
	witching: "🌌",
};

const RANKS: Rank[] = ["E", "D", "C", "B", "A", "S"];

const CONTENT_SOURCES: ContentSource[] = ["procedural", "overpass"];

const ITEM_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const FAST_FORWARDS: { label: string; ms: number }[] = [
	{ label: "+10 min", ms: 10 * MINUTE_MS },
	{ label: "+1 hour", ms: HOUR_MS },
	{ label: "+8 hours", ms: 8 * HOUR_MS },
	{ label: "+1 day", ms: DAY_MS },
	{ label: "+7 days", ms: 7 * DAY_MS },
];

const SECTION_CLASS =
	"rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md";
const HEADING_CLASS =
	"mb-2 font-semibold text-[11px] text-cyan-300/80 uppercase tracking-wider";
const CHIP_CLASS =
	"rounded-full border border-cyan-400/40 bg-slate-900/60 px-3 py-1 text-cyan-100 text-xs transition-colors hover:bg-cyan-500/20";
const CHIP_ACTIVE_CLASS =
	"rounded-full border border-cyan-300 bg-cyan-500/30 px-3 py-1 font-semibold text-cyan-50 text-xs";
const INPUT_CLASS =
	"border-cyan-400/30 bg-slate-900/70 text-cyan-50 placeholder:text-slate-500";

function clearSaveAndReload(): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore storage access failures; reload still restores defaults.
	}
	try {
		indexedDB.deleteDatabase("endgame");
	} catch {
		// Ignore IndexedDB failures; the snapshot wipe above is the source of truth.
	}
	window.location.reload();
}

export default function DebugAdminPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const [grantManaAmount, setGrantManaAmount] = useState("100");
	const [grantXpAmount, setGrantXpAmount] = useState("100");
	const [itemName, setItemName] = useState("Mystery Crate");
	const [itemKind, setItemKind] = useState("material");
	const [itemRarity, setItemRarity] = useState("rare");
	const [itemQty, setItemQty] = useState("1");
	const [spoofLat, setSpoofLat] = useState(String(state.position.lat));
	const [spoofLng, setSpoofLng] = useState(String(state.position.lng));
	const [confirmReset, setConfirmReset] = useState(false);

	if (!state.debug.enabled) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-6 text-center">
				<span aria-hidden="true" className="text-4xl">
					🛠️
				</span>
				<p className="mt-3 font-semibold text-cyan-100 text-sm">
					Dev panel hidden
				</p>
				<p className="mt-1 text-slate-400 text-xs">
					Enable debug mode to access admin controls.
				</p>
				<Button
					className="mt-4 border-cyan-400/40 bg-slate-900/60 text-cyan-200"
					onClick={() => dispatch({ type: "DEBUG_TOGGLE" })}
					size="sm"
					type="button"
					variant="outline"
				>
					Enable debug
				</Button>
			</div>
		);
	}

	const parseNum = (raw: string, fallback: number): number => {
		const value = Number.parseFloat(raw);
		return Number.isFinite(value) ? value : fallback;
	};

	const handleGrantItem = (): void => {
		dispatch({
			type: "DEBUG_GRANT_ITEM",
			name: itemName.trim() || "Mystery Crate",
			kind: itemKind.trim() || "material",
			rarity: itemRarity,
			qty: Math.max(1, Math.round(parseNum(itemQty, 1))),
		});
	};

	const handleSpoofGps = (): void => {
		dispatch({
			type: "DEBUG_SPOOF_GPS",
			lat: parseNum(spoofLat, state.position.lat),
			lng: parseNum(spoofLng, state.position.lng),
		});
	};

	const handleSpawnGate = (): void => {
		dispatch({ type: "CONTENT_GENERATE", hex: state.position.hex });
	};

	const handleSpawnBoss = (): void => {
		dispatch({ type: "BOSS_SPAWN", hex: state.position.hex });
	};

	const handleSpawnBeacon = (): void => {
		dispatch({ type: "CONTENT_GENERATE", hex: state.position.hex });
	};

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto p-3 pb-8">
			<header className="flex items-center justify-between gap-2 px-1">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-xl">
						🛠️
					</span>
					<h2 className="font-semibold text-cyan-100 text-sm">Dev / Admin</h2>
				</div>
				<Button
					className="border-cyan-400/40 bg-slate-900/60 text-cyan-200"
					onClick={() => dispatch({ type: "DEBUG_TOGGLE" })}
					size="sm"
					type="button"
					variant="outline"
				>
					Hide
				</Button>
			</header>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Force weather</h3>
				<div className="flex flex-wrap gap-2">
					{WEATHERS.map((weather) => {
						const active = state.debug.forcedWeather === weather;
						return (
							<button
								className={active ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
								key={weather}
								onClick={() =>
									dispatch({ type: "DEBUG_FORCE_WEATHER", weather })
								}
								type="button"
							>
								<span aria-hidden="true">{WEATHER_GLYPHS[weather]}</span>{" "}
								{weather}
							</button>
						);
					})}
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Set time of day</h3>
				<div className="flex flex-wrap gap-2">
					{TIMES.map((time) => {
						const active = state.debug.forcedTime === time;
						return (
							<button
								className={active ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
								key={time}
								onClick={() => dispatch({ type: "DEBUG_FORCE_TIME", time })}
								type="button"
							>
								<span aria-hidden="true">{TIME_GLYPHS[time]}</span> {time}
							</button>
						);
					})}
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Content source</h3>
				<div className="flex flex-wrap gap-2">
					{CONTENT_SOURCES.map((source) => {
						const active = state.debug.contentSource === source;
						return (
							<button
								className={active ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
								key={source}
								onClick={() =>
									dispatch({ type: "DEBUG_SET_CONTENT_SOURCE", source })
								}
								type="button"
							>
								{source}
							</button>
						);
					})}
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Spawn at current hex</h3>
				<p className="mb-2 break-all text-[10px] text-slate-500">
					{state.position.hex}
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						className={CHIP_CLASS}
						onClick={handleSpawnGate}
						type="button"
					>
						<span aria-hidden="true">🌀</span> Gate
					</button>
					<button
						className={CHIP_CLASS}
						onClick={handleSpawnBeacon}
						type="button"
					>
						<span aria-hidden="true">🔆</span> Beacon
					</button>
					<button
						className={CHIP_CLASS}
						onClick={handleSpawnBoss}
						type="button"
					>
						<span aria-hidden="true">👹</span> Boss
					</button>
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Grant mana / xp</h3>
				<div className="flex flex-col gap-3">
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<Label
								className="text-[10px] text-slate-400"
								htmlFor="grant-mana"
							>
								Mana ({Math.round(state.resources.mana)})
							</Label>
							<Input
								className={INPUT_CLASS}
								id="grant-mana"
								inputMode="numeric"
								onChange={(e) => setGrantManaAmount(e.target.value)}
								value={grantManaAmount}
							/>
						</div>
						<Button
							className="border-cyan-400/40 bg-slate-900/60 text-cyan-200"
							onClick={() =>
								dispatch({
									type: "DEBUG_GRANT_MANA",
									amount: parseNum(grantManaAmount, 0),
								})
							}
							size="sm"
							type="button"
							variant="outline"
						>
							Grant
						</Button>
					</div>
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<Label className="text-[10px] text-slate-400" htmlFor="grant-xp">
								XP (lvl {state.player.level}, {state.player.xp} xp)
							</Label>
							<Input
								className={INPUT_CLASS}
								id="grant-xp"
								inputMode="numeric"
								onChange={(e) => setGrantXpAmount(e.target.value)}
								value={grantXpAmount}
							/>
						</div>
						<Button
							className="border-cyan-400/40 bg-slate-900/60 text-cyan-200"
							onClick={() =>
								dispatch({
									type: "DEBUG_GRANT_XP",
									amount: parseNum(grantXpAmount, 0),
								})
							}
							size="sm"
							type="button"
							variant="outline"
						>
							Grant
						</Button>
					</div>
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Set rank ({state.player.rank})</h3>
				<div className="flex flex-wrap gap-2">
					{RANKS.map((rank) => {
						const active = state.player.rank === rank;
						return (
							<button
								className={active ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
								key={rank}
								onClick={() => dispatch({ type: "DEBUG_SET_RANK", rank })}
								type="button"
							>
								{rank}
							</button>
						);
					})}
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Grant item</h3>
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label className="text-[10px] text-slate-400" htmlFor="item-name">
								Name
							</Label>
							<Input
								className={INPUT_CLASS}
								id="item-name"
								onChange={(e) => setItemName(e.target.value)}
								value={itemName}
							/>
						</div>
						<div>
							<Label className="text-[10px] text-slate-400" htmlFor="item-kind">
								Kind
							</Label>
							<Input
								className={INPUT_CLASS}
								id="item-kind"
								onChange={(e) => setItemKind(e.target.value)}
								value={itemKind}
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label className="text-[10px] text-slate-400" htmlFor="item-qty">
								Qty
							</Label>
							<Input
								className={INPUT_CLASS}
								id="item-qty"
								inputMode="numeric"
								onChange={(e) => setItemQty(e.target.value)}
								value={itemQty}
							/>
						</div>
						<div>
							<span className="text-[10px] text-slate-400">Rarity</span>
							<div className="mt-1 flex flex-wrap gap-1">
								{ITEM_RARITIES.map((rarity) => {
									const active = itemRarity === rarity;
									return (
										<button
											className={active ? CHIP_ACTIVE_CLASS : CHIP_CLASS}
											key={rarity}
											onClick={() => setItemRarity(rarity)}
											type="button"
										>
											{rarity}
										</button>
									);
								})}
							</div>
						</div>
					</div>
					<Button
						className="border-cyan-400/40 bg-slate-900/60 text-cyan-200"
						onClick={handleGrantItem}
						size="sm"
						type="button"
						variant="outline"
					>
						<span aria-hidden="true">🎁</span> Grant item
					</Button>
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Time controls (fast-forward)</h3>
				<p className="mb-2 text-[10px] text-slate-500">
					Rewinds the clock so the next tick credits offline time (mana, farm
					growth, decay).
				</p>
				<div className="flex flex-wrap gap-2">
					{FAST_FORWARDS.map((ff) => (
						<button
							className={CHIP_CLASS}
							key={ff.label}
							onClick={() =>
								dispatch({ type: "DEBUG_FAST_FORWARD", ms: ff.ms })
							}
							type="button"
						>
							<span aria-hidden="true">⏩</span> {ff.label}
						</button>
					))}
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>GPS spoof</h3>
				<div className="flex items-end gap-2">
					<div className="flex-1">
						<Label className="text-[10px] text-slate-400" htmlFor="spoof-lat">
							Lat
						</Label>
						<Input
							className={INPUT_CLASS}
							id="spoof-lat"
							inputMode="decimal"
							onChange={(e) => setSpoofLat(e.target.value)}
							value={spoofLat}
						/>
					</div>
					<div className="flex-1">
						<Label className="text-[10px] text-slate-400" htmlFor="spoof-lng">
							Lng
						</Label>
						<Input
							className={INPUT_CLASS}
							id="spoof-lng"
							inputMode="decimal"
							onChange={(e) => setSpoofLng(e.target.value)}
							value={spoofLng}
						/>
					</div>
					<Button
						className="border-cyan-400/40 bg-slate-900/60 text-cyan-200"
						onClick={handleSpoofGps}
						size="sm"
						type="button"
						variant="outline"
					>
						<span aria-hidden="true">📍</span> Set
					</Button>
				</div>
			</section>

			<section className={SECTION_CLASS}>
				<h3 className={HEADING_CLASS}>Supply drop</h3>
				<button
					className={CHIP_CLASS}
					onClick={() => dispatch({ type: "DEBUG_TRIGGER_SUPPLY" })}
					type="button"
				>
					<span aria-hidden="true">📦</span> Trigger supply drop here
				</button>
			</section>

			<section className="rounded-2xl border border-rose-500/40 bg-slate-950/80 p-4 shadow-lg backdrop-blur-md">
				<h3 className="mb-2 font-semibold text-[11px] text-rose-300/90 uppercase tracking-wider">
					Danger zone
				</h3>
				{confirmReset ? (
					<div className="flex flex-col gap-2">
						<p className="text-rose-200/90 text-xs">
							This wipes your save and reloads. Are you sure?
						</p>
						<div className="flex gap-2">
							<Button
								className="bg-rose-600 text-white hover:bg-rose-500"
								onClick={() => {
									dispatch({ type: "DEBUG_RESET" });
									clearSaveAndReload();
								}}
								size="sm"
								type="button"
							>
								Wipe save
							</Button>
							<Button
								className="border-slate-500/40 bg-slate-900/60 text-slate-200"
								onClick={() => setConfirmReset(false)}
								size="sm"
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<button
						className="rounded-full border border-rose-500/50 bg-rose-950/40 px-3 py-1 text-rose-200 text-xs transition-colors hover:bg-rose-500/20"
						onClick={() => setConfirmReset(true)}
						type="button"
					>
						<span aria-hidden="true">🗑️</span> Reset save
					</button>
				)}
			</section>
		</div>
	);
}
