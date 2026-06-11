"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
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
import { GateCombatController } from "@/game/three/gate-combat-controller";
import { PlayerController } from "@/game/three/player-controller";
import { SceneLayer } from "@/game/three/scene-layer";
import {
	handlePlotTapEvent,
	plotSelection,
} from "@/game/three/specs/farming-specs";
import type { GameEvent, GameState, MapTheme } from "@/game/types";
import { buildSelection } from "@/game/ui/build-menu";
import { gateEntryPrompt } from "@/game/ui/gate-entry-prompt";

const FILL_OPACITY = 0.35;
const BUILDING_MIN_ZOOM = 14;
const BUILDING_DEFAULT_HEIGHT = 8;
// Pokémon-Go-style proximity fade: buildings whose footprint is within this many
// metres of the player render on a separate translucent layer so the avatar is
// never hidden behind a wall. `fill-extrusion-opacity` is a data-constant paint
// property (it can't vary per feature), so the fade is done with two layers that
// split the source by a `distance` filter rather than one graduated layer.
const BUILDING_NEAR_RADIUS_M = 55;
const BUILDING_NEAR_OPACITY = 0.32;
const FAR_LAYER_ID = "buildings-3d";
const NEAR_LAYER_ID = "buildings-3d-near";
// Re-evaluating the `distance` filter rebuilds the extrusion mesh, so the split
// is refreshed at most ~10x/s and only after the player has moved enough to shift
// which buildings fall inside the radius.
const FADE_REFRESH_MS = 100;
const FADE_MOVE_EPSILON_DEG = 0.000_03;

const SVG_NS = "http://www.w3.org/2000/svg";
const DESTINATION_PIN_COLOR = "#ffcc33";
const PIN_BOB_MS = 1200;
const PIN_PULSE_MS = 1500;
const INFINITE = Number.POSITIVE_INFINITY;

// Build the click-to-walk destination marker: a bobbing teardrop pin with a
// pulsing ground ring. Returned as a DOM element for a MapLibre Marker anchored
// at its bottom, so the pin's tip sits on the tapped map point and floats above
// the 3D buildings (no WebGL depth occlusion). Built with explicit DOM nodes
// (no innerHTML) and animated via the Web Animations API (no global CSS).
function createDestinationPin(): HTMLDivElement {
	const wrapper = document.createElement("div");
	wrapper.style.width = "32px";
	wrapper.style.height = "46px";
	wrapper.style.position = "relative";
	wrapper.style.pointerEvents = "none";

	const ring = document.createElement("div");
	ring.style.position = "absolute";
	ring.style.bottom = "0";
	ring.style.left = "50%";
	ring.style.width = "20px";
	ring.style.height = "7px";
	ring.style.marginLeft = "-10px";
	ring.style.borderRadius = "50%";
	ring.style.background = "rgba(0, 0, 0, 0.28)";
	ring.animate(
		[
			{ transform: "scale(0.7)", opacity: 0.45 },
			{ transform: "scale(1.1)", opacity: 0.2 },
			{ transform: "scale(0.7)", opacity: 0.45 },
		],
		{ duration: PIN_PULSE_MS, iterations: INFINITE, easing: "ease-in-out" }
	);

	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 36");
	svg.setAttribute("width", "32");
	svg.setAttribute("height", "42");
	svg.style.position = "absolute";
	svg.style.bottom = "3px";
	svg.style.left = "0";
	svg.style.filter = "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))";

	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute(
		"d",
		"M12 0C5.37 0 0 5.37 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.37 18.63 0 12 0z"
	);
	path.setAttribute("fill", DESTINATION_PIN_COLOR);
	path.setAttribute("stroke", "#ffffff");
	path.setAttribute("stroke-width", "1.5");

	const dot = document.createElementNS(SVG_NS, "circle");
	dot.setAttribute("cx", "12");
	dot.setAttribute("cy", "12");
	dot.setAttribute("r", "4.5");
	dot.setAttribute("fill", "#ffffff");

	svg.append(path, dot);
	svg.animate(
		[
			{ transform: "translateY(0)" },
			{ transform: "translateY(-4px)" },
			{ transform: "translateY(0)" },
		],
		{ duration: PIN_BOB_MS, iterations: INFINITE, easing: "ease-in-out" }
	);

	wrapper.append(ring, svg);
	return wrapper;
}

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

function selectGatePrompt(hex: string): void {
	buildSelection.clear();
	plotSelection.clear();
	gateEntryPrompt.select(hex);
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
	// Insert the zone overlays beneath the 3D buildings so they read as paint on
	// the ground: where a building footprint overlaps a hex, the extrusion
	// occludes the fill. Without this they default to the top of the layer stack
	// and float over the rooftops. Falls back to the top if the extrusion is
	// absent (no vector building source).
	const beforeId = map.getLayer("buildings-3d") ? "buildings-3d" : undefined;
	map.addLayer(
		{
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
		},
		beforeId
	);
	map.addLayer(
		{
			id: "hexes-line",
			type: "line",
			source: "hexes",
			paint: {
				"line-color": "rgba(34, 211, 238, 0.45)",
				"line-width": 1,
			},
		},
		beforeId
	);
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

// Shared extrusion geometry for both the far (opaque) and near (translucent)
// building layers - they differ only in opacity and which side of the radius
// they draw.
const BUILDING_HEIGHT: maplibregl.ExpressionSpecification = [
	"coalesce",
	["get", "render_height"],
	BUILDING_DEFAULT_HEIGHT,
];
const BUILDING_BASE: maplibregl.ExpressionSpecification = [
	"coalesce",
	["get", "render_min_height"],
	0,
];

// Boolean filter selecting buildings on one side of the proximity radius. `near`
// true keeps footprints within BUILDING_NEAR_RADIUS_M of the player; false keeps
// the rest. A footprint that contains the player evaluates to distance 0.
function buildingFadeFilter(
	lng: number,
	lat: number,
	near: boolean
): maplibregl.FilterSpecification {
	const distance: maplibregl.ExpressionSpecification = [
		"distance",
		{ type: "Point", coordinates: [lng, lat] },
	];
	return near
		? ["<", distance, BUILDING_NEAR_RADIUS_M]
		: [">=", distance, BUILDING_NEAR_RADIUS_M];
}

// Turn the flat basemap into 3D by extruding the OpenMapTiles `building` layer.
// Two layers split the same source by distance to the player: a fully opaque far
// layer and a translucent near layer, so buildings around the avatar fade out
// Pokémon-Go-style. updateBuildingFade re-splits them as the player moves.
function addBuildingExtrusion(
	map: maplibregl.Map,
	theme: MapTheme,
	playerLng: number,
	playerLat: number
): void {
	const sourceId = findVectorSourceId(map);
	if (!sourceId) {
		return;
	}
	const layers = map.getStyle().layers ?? [];
	const firstSymbol = layers.find((layer) => layer.type === "symbol")?.id;
	const dark = isDarkTheme(theme);
	const color = dark ? BUILDING_COLOR_DARK : BUILDING_COLOR_LIGHT;
	// At opacity < 1 MapLibre fill-extrusions don't write depth per feature, so
	// buildings show see-through edges. It's invisible with the light colour over
	// light ground but reads as semi-transparent with the dark colour over dark
	// ground, so render the far (opaque) layer of the dark theme fully opaque.
	const farOpacity = dark ? 1 : 0.92;
	map.addLayer(
		{
			id: FAR_LAYER_ID,
			type: "fill-extrusion",
			source: sourceId,
			"source-layer": "building",
			minzoom: BUILDING_MIN_ZOOM,
			filter: buildingFadeFilter(playerLng, playerLat, false),
			paint: {
				"fill-extrusion-color": color,
				"fill-extrusion-height": BUILDING_HEIGHT,
				"fill-extrusion-base": BUILDING_BASE,
				"fill-extrusion-opacity": farOpacity,
			},
		},
		firstSymbol
	);
	map.addLayer(
		{
			id: NEAR_LAYER_ID,
			type: "fill-extrusion",
			source: sourceId,
			"source-layer": "building",
			minzoom: BUILDING_MIN_ZOOM,
			filter: buildingFadeFilter(playerLng, playerLat, true),
			paint: {
				"fill-extrusion-color": color,
				"fill-extrusion-height": BUILDING_HEIGHT,
				"fill-extrusion-base": BUILDING_BASE,
				"fill-extrusion-opacity": BUILDING_NEAR_OPACITY,
			},
		},
		firstSymbol
	);
}

// Re-split the two building layers around the player's current position. Called
// on a throttle as the avatar moves so the translucent ring follows it.
function updateBuildingFade(
	map: maplibregl.Map,
	lng: number,
	lat: number
): void {
	if (!map.getLayer(FAR_LAYER_ID)) {
		return;
	}
	map.setFilter(FAR_LAYER_ID, buildingFadeFilter(lng, lat, false));
	map.setFilter(NEAR_LAYER_ID, buildingFadeFilter(lng, lat, true));
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
	// The click-to-walk destination pin. Created once on first move order, then
	// moved/removed as the controller reports target changes.
	const destinationMarkerRef = useRef<maplibregl.Marker | null>(null);

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
			addBuildingExtrusion(
				map,
				initial.world.theme,
				initial.position.lng,
				initial.position.lat
			);
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
				// Entity taps dispatch the spec's own event. A PLOT_TAP additionally
				// drives the plant-prompt selection (the reducer ignores it), so the
				// pick dispatch is wrapped to route it; all other events (harvest,
				// recall, gate-attack, building-tap) just flow through to the store.
				const pickDispatch = (picked: GameEvent): void => {
					// A plot tap opens the plant prompt, so any open build menu must
					// close first - the two contextual overlays are mutually exclusive.
					if (picked.type === "PLOT_TAP") {
						buildSelection.clear();
					}
					if (picked.type === "GATE_ENTER") {
						const hex = picked.hex;
						if (typeof hex === "string") {
							selectGatePrompt(hex);
						}
						return;
					}
					gateEntryPrompt.clear();
					handlePlotTapEvent(picked);
					useGameStore.getState().dispatch(picked);
				};
				const layer = layerRef.current;
				const hitEntity = layer?.pickRenderedEntity(
					event.point.x,
					event.point.y,
					pickDispatch
				);
				if (hitEntity) {
					return;
				}
				const hitProjectedEntity = layer?.entities.pick(
					map,
					event.point.x,
					event.point.y,
					pickDispatch
				);
				if (hitProjectedEntity) {
					return;
				}
				// On an owned, empty hex the tap opens the contextual build menu (and
				// signals WORLD_TAP_HEX for reducers) instead of walking. On any other
				// hex it stays a move order and dismisses any open contextual overlay.
				const live = useGameStore.getState();
				const hex = posToHex(event.lngLat.lat, event.lngLat.lng);
				if (
					live.state.gates[hex] &&
					layerRef.current?.entities.interactableKeys().includes(`gate:${hex}`)
				) {
					selectGatePrompt(hex);
					return;
				}
				if (isOwnedBuildableHex(live.state, hex)) {
					live.dispatch({ type: "WORLD_TAP_HEX", hex });
					// Mutually exclusive with the plant prompt: clear any plot selection
					// before opening the build menu.
					plotSelection.clear();
					gateEntryPrompt.clear();
					buildSelection.select(hex);
					return;
				}
				buildSelection.clear();
				plotSelection.clear();
				gateEntryPrompt.clear();
				controllerRef.current?.walkTo(event.lngLat.lat, event.lngLat.lng);
			});

			// Throttle the proximity building fade: re-split the layers at most every
			// FADE_REFRESH_MS and only once the player has drifted past a small
			// threshold, so a re-tessellation isn't forced on every idle frame.
			let fadeLastMs = 0;
			let fadeLastLng = current.position.lng;
			let fadeLastLat = current.position.lat;

			controller = new PlayerController({
				map,
				layer,
				dispatch: useGameStore.getState().dispatch,
				initialLat: current.position.lat,
				initialLng: current.position.lng,
				initialHex: current.position.hex,
				onPlayerMove: (lng, lat) => {
					const now = performance.now();
					if (now - fadeLastMs < FADE_REFRESH_MS) {
						return;
					}
					if (
						Math.abs(lng - fadeLastLng) < FADE_MOVE_EPSILON_DEG &&
						Math.abs(lat - fadeLastLat) < FADE_MOVE_EPSILON_DEG
					) {
						return;
					}
					fadeLastMs = now;
					fadeLastLng = lng;
					fadeLastLat = lat;
					updateBuildingFade(map, lng, lat);
				},
				// Drop a destination pin on a move order; remove it on arrival or when
				// WASD/GPS cancels the auto-walk. The marker is created once and reused.
				onWalkTargetChange: (target) => {
					if (!target) {
						destinationMarkerRef.current?.remove();
						return;
					}
					let marker = destinationMarkerRef.current;
					if (!marker) {
						marker = new maplibregl.Marker({
							anchor: "bottom",
							element: createDestinationPin(),
						});
						destinationMarkerRef.current = marker;
					}
					marker.setLngLat([target.lng, target.lat]).addTo(map);
				},
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

			// On-map gate-combat chaser: an active gate run's enemies chase the
			// player in real time (steered by the same nav helpers as the boss). The
			// entity renderer draws each enemy at its live position via the
			// enemyPositions singleton; the controller is ticked from the player
			// controller's render loop (setGateCombat -> update(dt, time)).
			const gateCombat = new GateCombatController({
				map,
				dispatch: useGameStore.getState().dispatch,
				getState: () => useGameStore.getState().state,
				getPlayer: () => controller?.getPosition() ?? current.position,
			});
			controller.setGateCombat(gateCombat);

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
				const seam = window as unknown as {
					__jump?: () => {
						airborne: boolean;
						altitude: number;
						lat: number;
						lng: number;
					};
					__walk?: (dLat: number, dLng: number) => boolean;
					__hasDestinationPin?: () => boolean;
					__sprint?: () => {
						charge: number;
						exhausted: boolean;
					};
					__interactable?: () => string[];
				};
				seam.__jump = () => {
					const pos = controller?.getPosition() ?? { lat: 0, lng: 0 };
					return {
						airborne: controller?.airborne ?? false,
						altitude: controller?.altitude ?? 0,
						lat: pos.lat,
						lng: pos.lng,
					};
				};
				// Issue a move order relative to the live position (the MapLibre canvas
				// can't be rasterised headlessly, so e2e can't click a real map point).
				seam.__walk = (dLat, dLng) => {
					const pos = controller?.getPosition();
					if (!pos) {
						return false;
					}
					controller?.walkTo(pos.lat + dLat, pos.lng + dLng);
					return true;
				};
				// True while the destination pin is shown on the map.
				seam.__hasDestinationPin = () =>
					document.querySelector(".maplibregl-marker") !== null;
				// Sprint stamina: the bar can't be rasterised headlessly, so e2e reads
				// the transient charge (0..1) and exhausted latch through this getter.
				seam.__sprint = () => ({
					charge: controller?.sprintCharge ?? 1,
					exhausted: controller?.exhausted ?? false,
				});
				// Keys of the world entities currently inside the interaction ring (the
				// 3D ring can't be rasterised headlessly, so e2e reads the gated set).
				seam.__interactable = () => layer.entities.interactableKeys();
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
			destinationMarkerRef.current?.remove();
			destinationMarkerRef.current = null;
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
