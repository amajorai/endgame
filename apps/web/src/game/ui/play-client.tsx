"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useGameReady, useGameState } from "@/game/store/store";
import { useGameClock } from "@/game/store/use-game-clock";
import BeaconsLootPanel from "@/game/ui/beacons-loot-panel";
import BuildMenu from "@/game/ui/build-menu";
import CharacterPanel from "@/game/ui/character-panel";
import ContentPanel from "@/game/ui/content-panel";
import DebugAdminPanel from "@/game/ui/debug-admin-panel";
import EstatesPanel from "@/game/ui/estates-panel";
import FarmingPanel from "@/game/ui/farming-panel";
import FieldBossPanel from "@/game/ui/field-boss-panel";
import GateCombatHud from "@/game/ui/gate-combat-hud";
import GateCombatPanel from "@/game/ui/gate-combat-panel";
import GhostModePanel from "@/game/ui/ghost-mode-panel";
import { Hud } from "@/game/ui/hud";
import InventoryPanel from "@/game/ui/inventory-panel";
import Onboarding from "@/game/ui/onboarding";
import { PlantPrompt } from "@/game/ui/plant-prompt";
import QuestsPanel from "@/game/ui/quests-panel";
import { type RadialCategory, RadialMenu } from "@/game/ui/radial-menu";
import ShadowsPanel from "@/game/ui/shadows-panel";
import WeatherPanel from "@/game/ui/weather-panel";

// GameMap touches maplibre (window/document) and must never render on the server.
const GameMap = dynamic(() => import("@/game/ui/game-map"), { ssr: false });

type PanelKey =
	| "explore"
	| "gates"
	| "character"
	| "beacons"
	| "farm"
	| "estates"
	| "shadows"
	| "quests"
	| "ghost"
	| "inventory"
	| "weather"
	| "debug";

interface NavItem {
	icon: string;
	key: PanelKey;
	label: string;
	Panel: () => React.JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
	{ key: "explore", icon: "🧭", label: "Explore", Panel: ContentPanel },
	{ key: "gates", icon: "🌀", label: "Gates", Panel: GateCombatPanel },
	{ key: "character", icon: "🎖️", label: "Hunter", Panel: CharacterPanel },
	{ key: "beacons", icon: "⛩️", label: "Beacons", Panel: BeaconsLootPanel },
	{ key: "farm", icon: "🌾", label: "Farm", Panel: FarmingPanel },
	{ key: "estates", icon: "🏰", label: "Estates", Panel: EstatesPanel },
	{ key: "shadows", icon: "🌑", label: "Shadows", Panel: ShadowsPanel },
	{ key: "quests", icon: "📜", label: "Quests", Panel: QuestsPanel },
	{ key: "ghost", icon: "👻", label: "Ghost", Panel: GhostModePanel },
	{ key: "inventory", icon: "🎒", label: "Bag", Panel: InventoryPanel },
	{ key: "weather", icon: "🌤️", label: "Skies", Panel: WeatherPanel },
];

const DEBUG_ITEM: NavItem = {
	key: "debug",
	icon: "🛠️",
	label: "Debug",
	Panel: DebugAdminPanel,
};

// The flat feature list is grouped into four thematic categories for the radial
// menu so the wheel never gets cramped. Debug is appended to World at runtime
// when debug mode is enabled.
interface CategoryMeta {
	icon: string;
	itemKeys: PanelKey[];
	key: string;
	label: string;
}

// Gates, shadows, beacons, farm, and estates are now in-world interactions
// (tap the entity / owned hex on the map), so they no longer appear in the
// radial menu. The wheel keeps the hero, world, and ghost entries plus debug.
const CATEGORY_META: CategoryMeta[] = [
	{
		key: "hero",
		icon: "🎖️",
		label: "Hero",
		itemKeys: ["character", "quests", "inventory"],
	},
	{
		key: "world",
		icon: "🌍",
		label: "World",
		itemKeys: ["explore", "weather", "ghost"],
	},
];

function buildCategories(navItems: NavItem[]): RadialCategory[] {
	const itemByKey = new Map(navItems.map((item) => [item.key, item]));
	return CATEGORY_META.map((meta) => {
		const items: RadialCategory["items"] = [];
		for (const key of meta.itemKeys) {
			const item = itemByKey.get(key);
			if (item) {
				items.push({ key: item.key, icon: item.icon, label: item.label });
			}
		}
		const debugItem = itemByKey.get("debug");
		if (meta.key === "world" && debugItem) {
			items.push({
				key: debugItem.key,
				icon: debugItem.icon,
				label: debugItem.label,
			});
		}
		return { key: meta.key, icon: meta.icon, label: meta.label, items };
	});
}

export function PlayClient(): React.JSX.Element {
	useGameClock();
	const state = useGameState();
	const dispatch = useDispatch();
	const ready = useGameReady();
	const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
	const bootstrappedRef = useRef(false);

	// One-shot content bootstrap. Gated on `ready` so it fires AFTER async
	// hydrate() replaces the store state, otherwise the generated content is
	// wiped by the wholesale rehydrate.
	useEffect(() => {
		if (ready && !bootstrappedRef.current) {
			bootstrappedRef.current = true;
			dispatch({ type: "CONTENT_GENERATE" });
		}
	}, [ready, dispatch]);

	const navItems = state.debug.enabled ? [...NAV_ITEMS, DEBUG_ITEM] : NAV_ITEMS;
	const categories = buildCategories(navItems);

	const handleEnableDebug = (): void => {
		dispatch({ type: "DEBUG_TOGGLE" });
	};

	// Field bosses now fight on the map in 3D: the boss model chases the player
	// (BossController), and the combat HUD overlays the map rather than taking it
	// over. The FieldBossPanel renders as an overlay when a boss is active.
	const activeItem = activePanel
		? navItems.find((item) => item.key === activePanel)
		: null;
	const ActivePanel = activeItem?.Panel ?? null;
	// During an engaged boss fight or an active gate run the combat overlay owns
	// the bottom-center of the screen, so the radial FAB stands down to avoid
	// covering its controls.
	const bossEngaged = state.activeBoss?.status === "engaged";
	const gateActive = Boolean(state.activeGate);

	return (
		<div className="relative h-full w-full overflow-hidden bg-slate-950">
			<GameMap />
			<Hud />

			{/* Engaged field boss: combat controls overlay the map (the boss model
			    fights in 3D on the map itself, no full-screen takeover). */}
			{state.activeBoss && state.activeBoss.status === "engaged" && (
				<div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center px-3">
					<div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-rose-500/30 bg-slate-950/85 shadow-2xl backdrop-blur-md">
						<FieldBossPanel />
					</div>
				</div>
			)}

			{/* Active gate run: the fight happens in-world on the live map (enemies
			    are 3D entities chasing the player), so the compact combat HUD overlays
			    the bottom-center rather than taking over the screen. */}
			{gateActive && (
				<div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center px-3">
					<div className="pointer-events-auto max-h-[60vh] w-full max-w-md overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950/85 shadow-2xl backdrop-blur-md">
						<GateCombatHud />
					</div>
				</div>
			)}

			{/* Contextual in-world overlays. Each self-hides when nothing is selected:
			    PlantPrompt opens on tapping a farm plot, BuildMenu on tapping an owned
			    empty hex. They position themselves absolutely, so they mount bare. */}
			<PlantPrompt />
			<BuildMenu />

			{!state.meta.onboarded && <Onboarding />}

			{/* Tiny debug-enable gear (only when debug is off). */}
			{!state.debug.enabled && (
				<button
					aria-label="Enable debug mode"
					className="pointer-events-auto absolute top-3 right-3 z-20 translate-y-16 rounded-full border border-slate-700/50 bg-slate-950/60 px-2 py-1 text-slate-500 text-xs backdrop-blur transition-colors hover:text-cyan-300"
					onClick={handleEnableDebug}
					type="button"
				>
					⚙️
				</button>
			)}

			{/* Bottom-sheet panel for the selected feature. */}
			{ActivePanel && activeItem && (
				<div className="absolute inset-x-0 bottom-0 z-40 mx-auto flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-cyan-400/30 border-b-0 bg-slate-950/90 shadow-2xl backdrop-blur-md">
					<div className="flex shrink-0 items-center justify-between border-cyan-400/20 border-b px-4 py-2">
						<span className="font-medium text-cyan-200 text-sm">
							{activeItem.icon} {activeItem.label}
						</span>
						<button
							aria-label="Close panel"
							className="rounded-full px-2 text-slate-400 transition-colors hover:text-cyan-300"
							onClick={() => setActivePanel(null)}
							type="button"
						>
							✕
						</button>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						<ActivePanel />
					</div>
				</div>
			)}

			{/* Game-style radial menu (hidden while a panel sheet is open or a
			    boss fight / gate run owns the bottom of the screen). */}
			{!(ActivePanel || bossEngaged || gateActive) && (
				<RadialMenu
					categories={categories}
					onSelect={(key) => setActivePanel(key as PanelKey)}
				/>
			)}
		</div>
	);
}
