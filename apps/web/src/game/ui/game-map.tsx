"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
	BUILDING_COLOR_DARK,
	BUILDING_COLOR_LIGHT,
	CAMERA_MAX_ZOOM,
	CAMERA_MIN_ZOOM,
	HEX_VIEW_RING,
	MAP_STYLE_URLS,
	MAX_MAP_PITCH,
	THIRD_PERSON_PITCH,
	THIRD_PERSON_ZOOM,
} from "@/game/constants";
import { hexBoundary, hexDisk, posToHex } from "@/game/lib/hex";
import { useGameState, useGameStore } from "@/game/store/store";
import { loadPlayerCharacter } from "@/game/three/asset-loader";
import { BossController } from "@/game/three/boss-controller";
import { PlayerController } from "@/game/three/player-controller";
import { SceneLayer } from "@/game/three/scene-layer";
import type { GameState, MapTheme } from "@/game/types";
import WorldActionPrompt from "@/game/ui/world-action-prompt";

const FILL_OPACITY = 0.35;
const BUILDING_MIN_ZOOM = 14;
const BUILDING_DEFAULT_HEIGHT = 8;

const DARK_THEMES: ReadonlySet<MapTheme> = new Set<MapTheme>([
	"awakened_night",
	"eclipse",
]);

function isDarkTheme(theme: MapTheme): boolean {
	return DARK_THEMES.has(theme);
}

// A hex is "buildable" when the player owns it (deed owner=player, fully
// captured) and nothing is built there yet (no plot, no deed building). Tapping
// such a hex opens the contextual build prompt instead of walking. Per-system
// agents fill the prompt; foundation only routes the WORLD_TAP_HEX signal.
function isOwnedBuildableHex(state: GameState, hex: string): boolean {
	const deed = state.deeds[hex];
	if (!deed || deed.owner !== "player") {
		return false;
	}
	const meter = state.captureMeters[hex];
	const capturePct = meter?.progress ?? deed.capturePct ?? 0;
	if (capturePct < 100) {
		return false;
	}
	if (deed.building || state.plots[hex]) {
		return false;
	}
	return true;
}

function styleUrlFor(theme: MapTheme): string {
	return isDarkTheme(theme) ? MAP_STYLE_URLS.dark : MAP_STYLE_URLS.light;
}

// Build the FeatureCollection of hex polygons surrounding the player.
function buildHexCollection(
	state: GameState
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
	const ring = hexDisk(state.position.hex, HEX_VIEW_RING);
	const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
	for (const hex of ring) {
		const deed = state.deeds[hex];
		const meter = state.captureMeters[hex];
		const owner = deed?.owner ?? "neutral";
		const capturePct = meter?.progress ?? deed?.capturePct ?? 0;
		features.push({
			type: "Feature",
			properties: { hex, owner, capturePct },
			geometry: {
				type: "Polygon",
				coordinates: [hexBoundary(hex)],
			},
		});
	}
	return { type: "FeatureCollection", features };
}

function addHexLayers(
	map: maplibregl.Map,
	data: GeoJSON.FeatureCollection
): void {
	map.addSource("hexes", { type: "geojson", data });
	map.addLayer({
		id: "hexes-fill",
		type: "fill",
		source: "hexes",
		paint: {
			"fill-color": [
				"match",
				["get", "owner"],
				"player",
				"#22d3ee",
				"rival",
				"#e879f9",
				"#6b7280",
			],
			"fill-opacity": [
				"match",
				["get", "owner"],
				"neutral",
				0.08,
				FILL_OPACITY,
			],
		},
	});
	map.addLayer({
		id: "hexes-line",
		type: "line",
		source: "hexes",
		paint: {
			"line-color": "rgba(34, 211, 238, 0.45)",
			"line-width": 1,
		},
	});
}

// Find the basemap's vector source so we can extrude its building layer.
function findVectorSourceId(map: maplibregl.Map): string | null {
	const sources = map.getStyle().sources;
	for (const [id, source] of Object.entries(sources)) {
		if (source.type === "vector") {
			return id;
		}
	}
	return null;
}

// Turn the flat basemap into 3D by extruding the OpenMapTiles `building` layer.
function addBuildingExtrusion(map: maplibregl.Map, theme: MapTheme): void {
	const sourceId = findVectorSourceId(map);
	if (!sourceId) {
		return;
	}
	const layers = map.getStyle().layers ?? [];
	const firstSymbol = layers.find((layer) => layer.type === "symbol")?.id;
	const color = isDarkTheme(theme) ? BUILDING_COLOR_DARK : BUILDING_COLOR_LIGHT;
	map.addLayer(
		{
			id: "buildings-3d",
			type: "fill-extrusion",
			source: sourceId,
			"source-layer": "building",
			minzoom: BUILDING_MIN_ZOOM,
			paint: {
				"fill-extrusion-color": color,
				"fill-extrusion-height": [
					"coalesce",
					["get", "render_height"],
					BUILDING_DEFAULT_HEIGHT,
				],
				"fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
				"fill-extrusion-opacity": 0.92,
			},
		},
		firstSymbol
	);
}

// Module-level singletons. There is only ever one GameMap on screen; tracking
// the live map + controller here makes teardown robust against React StrictMode's
// mount/unmount/mount cycle and Fast Refresh, where the async style-load can
// otherwise leave a second controller running.
let liveMap: maplibregl.Map | null = null;
let liveController: PlayerController | null = null;

function teardownLive(): void {
	liveController?.stop();
	liveController = null;
	liveMap?.remove();
	liveMap = null;
}

// Pokémon-Go-style interaction: the user may pan and pinch/scroll-zoom freely
// (the controller eases back to the player after an idle gap). Rotate/pitch stay
// with the controller (Q/E + camera modes), and MapLibre's own keyboard handler
// is off so it never competes with WASD.
function lockMapInteractions(map: maplibregl.Map): void {
	map.dragRotate.disable();
	map.keyboard.disable();
	map.doubleClickZoom.disable();
}

export default function GameMap(): React.JSX.Element {
	const state = useGameState();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<maplibregl.Map | null>(null);
	const controllerRef = useRef<PlayerController | null>(null);
	const layerRef = useRef<SceneLayer | null>(null);
	const weatherKeyRef = useRef<string>("");
	const loadedRef = useRef(false);
	// Contextual build prompt: which owned hex was tapped (null = hidden). The map
	// click handler is registered once inside the init effect, so it updates this
	// through a ref to the latest setter to avoid a stale closure.
	const [buildPromptHex, setBuildPromptHex] = useState<string | null>(null);
	const setBuildPromptHexRef = useRef(setBuildPromptHex);
	setBuildPromptHexRef.current = setBuildPromptHex;

	// Init effect: create the map once and tear it down on unmount. Uses local
	// captures + a `cancelled` flag so the async style-load path is safe under
	// React StrictMode's mount/unmount/mount cycle (no leaked controller).
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		// Tear down any leftover instance from a prior mount before starting.
		teardownLive();
		const initial = useGameStore.getState().state;
		const map = new maplibregl.Map({
			container,
			style: styleUrlFor(initial.world.theme),
			center: [initial.position.lng, initial.position.lat],
			zoom: THIRD_PERSON_ZOOM,
			pitch: THIRD_PERSON_PITCH,
			maxPitch: MAX_MAP_PITCH,
			minZoom: CAMERA_MIN_ZOOM,
			maxZoom: CAMERA_MAX_ZOOM,
			bearing: 0,
			attributionControl: false,
			canvasContextAttributes: { antialias: true },
		});
		mapRef.current = map;

		let cancelled = false;
		let controller: PlayerController | null = null;

		const handleLoad = (): void => {
			if (cancelled) {
				return;
			}
			loadedRef.current = true;
			lockMapInteractions(map);
			addBuildingExtrusion(map, initial.world.theme);
			addHexLayers(map, buildHexCollection(useGameStore.getState().state));

			const current = useGameStore.getState().state;
			const layer = new SceneLayer(current.position.lng, current.position.lat);
			layer.applyLighting(current.world.timeOfDay);
			layer.setWeather(current.world.weather, current.world.timeOfDay);
			weatherKeyRef.current = `${current.world.weather}:${current.world.timeOfDay}`;
			map.addLayer(layer);
			layerRef.current = layer;
			layer.entities.sync(useGameStore.getState().state);

			// A click first tries to hit an entity (gate/beacon/drop/boss). If none
			// is under the cursor, it's a move order: the character walks to that
			// point. Picking is screen-space via MapLibre's projection, independent
			// of the three.js camera.
			map.on("click", (event) => {
				const hitEntity = layerRef.current?.entities.pick(
					map,
					event.point.x,
					event.point.y,
					useGameStore.getState().dispatch
				);
				if (hitEntity) {
					return;
				}
				// On an owned, empty hex the tap opens the contextual build prompt
				// (and signals WORLD_TAP_HEX for reducers) instead of walking. On any
				// other hex it stays a move order.
				const live = useGameStore.getState();
				const hex = posToHex(event.lngLat.lat, event.lngLat.lng);
				if (isOwnedBuildableHex(live.state, hex)) {
					live.dispatch({ type: "WORLD_TAP_HEX", hex });
					setBuildPromptHexRef.current(hex);
					return;
				}
				setBuildPromptHexRef.current(null);
				controllerRef.current?.walkTo(event.lngLat.lat, event.lngLat.lng);
			});

			controller = new PlayerController({
				map,
				layer,
				dispatch: useGameStore.getState().dispatch,
				initialLat: current.position.lat,
				initialLng: current.position.lng,
				initialHex: current.position.hex,
			});

			// On-map field-boss chaser: steers toward the player's live position,
			// avoiding building footprints. The entity renderer draws the boss
			// model at the chaser's live position.
			const boss = new BossController({
				map,
				dispatch: useGameStore.getState().dispatch,
				getState: () => useGameStore.getState().state,
				getPlayer: () => controller?.getPosition() ?? current.position,
			});
			controller.setBoss(boss);
			layer.entities.setBossPositionProvider(() => boss.position);

			controller.setEnabled(!current.useRealGps);
			controller.start();
			controllerRef.current = controller;
			// Become the single live instance; stop any predecessor still running.
			if (liveController && liveController !== controller) {
				liveController.stop();
			}
			liveController = controller;
			liveMap = map;

			// E2E test seam. The jump is intentionally view-only (no store state)
			// and the MapLibre canvas cannot be rasterised headlessly, so committed
			// e2e tests read jump + position state through this getter. It stays
			// dormant unless the page is opened with ?__e2e (or in development), so
			// production users never receive it.
			const e2eEnabled =
				process.env.NODE_ENV !== "production" ||
				new URLSearchParams(window.location.search).has("__e2e");
			if (e2eEnabled) {
				(
					window as unknown as {
						__jump?: () => {
							airborne: boolean;
							altitude: number;
							lat: number;
							lng: number;
						};
					}
				).__jump = () => {
					const pos = controller?.getPosition() ?? { lat: 0, lng: 0 };
					return {
						airborne: controller?.airborne ?? false,
						altitude: controller?.altitude ?? 0,
						lat: pos.lat,
						lng: pos.lng,
					};
				};
			}

			loadPlayerCharacter()
				.then((character) => {
					if (cancelled) {
						return;
					}
					layer.playerGroup.add(character.root);
					controller?.setCharacter(character);
				})
				.catch(() => {
					// A missing model is non-fatal; movement and the map still work.
				});
		};
		map.on("load", handleLoad);

		return () => {
			cancelled = true;
			loadedRef.current = false;
			controller?.stop();
			if (controllerRef.current === controller) {
				controllerRef.current = null;
			}
			if (liveController === controller) {
				liveController = null;
			}
			layerRef.current = null;
			mapRef.current = null;
			if (liveMap === map) {
				liveMap = null;
			}
			map.remove();
		};
	}, []);

	// Data effect: refresh hex source, 3D entities, lighting + weather on state.
	useEffect(() => {
		const map = mapRef.current;
		if (!(map && loadedRef.current)) {
			return;
		}
		const source = map.getSource("hexes");
		if (source) {
			(source as maplibregl.GeoJSONSource).setData(buildHexCollection(state));
		}
		const layer = layerRef.current;
		if (layer) {
			layer.entities.sync(state);
			layer.applyLighting(state.world.timeOfDay);
			const weatherKey = `${state.world.weather}:${state.world.timeOfDay}`;
			if (weatherKey !== weatherKeyRef.current) {
				weatherKeyRef.current = weatherKey;
				layer.setWeather(state.world.weather, state.world.timeOfDay);
			}
		}
	}, [state]);

	// Geolocation effect: in real-GPS mode, device position drives movement and
	// WASD is disabled. The controller is told the new position so the camera
	// follows; the MOVE dispatch keeps the store authoritative.
	useEffect(() => {
		const controller = controllerRef.current;
		if (!state.useRealGps) {
			controller?.setEnabled(true);
			return;
		}
		controller?.setEnabled(false);
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			return;
		}
		const watchId = navigator.geolocation.watchPosition(
			(pos) => {
				const { latitude, longitude } = pos.coords;
				controllerRef.current?.setPosition(latitude, longitude);
				useGameStore.getState().dispatch({
					type: "MOVE",
					lat: latitude,
					lng: longitude,
				});
			},
			() => {
				// Geolocation errors are non-fatal; the avatar simply stays put.
			},
			{ enableHighAccuracy: true, maximumAge: 1000 }
		);
		return () => {
			navigator.geolocation.clearWatch(watchId);
		};
	}, [state.useRealGps]);

	const handleRecenter = (): void => {
		controllerRef.current?.resetCamera();
	};

	return (
		<div className="absolute inset-0">
			<div className="h-full w-full" ref={containerRef} />
			{buildPromptHex && (
				<WorldActionPrompt
					hex={buildPromptHex}
					onClose={() => setBuildPromptHex(null)}
				/>
			)}
			<button
				className="absolute right-3 bottom-3 z-10 rounded-full border border-cyan-400/40 bg-slate-950/70 px-3 py-2 font-medium text-cyan-200 text-xs backdrop-blur transition-colors hover:bg-slate-900/80"
				onClick={handleRecenter}
				type="button"
			>
				Recenter
			</button>
		</div>
	);
}
