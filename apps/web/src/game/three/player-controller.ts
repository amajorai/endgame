import type maplibregl from "maplibre-gl";
import {
	CAMERA_RECENTER_IDLE_MS,
	GRAVITY_MPS2,
	JUMP_SPEED_MPS,
	MAX_MAP_PITCH,
	METERS_PER_DEGREE_LAT,
	MIN_MAP_PITCH,
	SPRINT_MULTIPLIER,
	THIRD_PERSON_PITCH,
	THIRD_PERSON_ZOOM,
	TILT_DRAG_DEG_PER_PX,
	TOP_DOWN_PITCH,
	TOP_DOWN_ZOOM,
	TURN_SPEED_DPS,
	WALK_SPEED_MPS,
} from "@/game/constants";
import { posToHex } from "@/game/lib/hex";
import type { PlayerCharacter } from "@/game/three/asset-loader";
import type { BossController } from "@/game/three/boss-controller";
import type { SceneLayer } from "@/game/three/scene-layer";
import type { GameEvent } from "@/game/types";

// Drives the 3D player: integrates WASD into a live lng/lat each frame, keeps the
// MapLibre camera following, plays idle/walk animation, and dispatches a MOVE
// event ONLY when the player crosses into a new H3 hex. This keeps the
// event-sourced store (which persists on every dispatch) off the per-frame path.

// Only one controller may ever run its loop + key listeners at a time. React
// StrictMode / Fast Refresh can transiently create a second one; this guarantees
// the previous instance is stopped so they never fight over the camera.
let activeController: PlayerController | null = null;

const MAX_FRAME_DT = 0.05;
const DEG = Math.PI / 180;
const MIN_MOVE_SPEED = 0.05;
const ANIM_BLEND = 8;
const FACE_TURN = 10;
const WALK_SPEED_RATIO = 0.6;
// Click-to-walk arrival threshold, in metres.
const WALK_ARRIVE_M = 3;
// How quickly the camera eases back to the player after free-look idle.
const RECENTER_LERP = 6;
const RECENTER_EPSILON_M = 0.5;

// True when a key event is aimed at a text field, so Space scrolls/types there
// instead of triggering a jump (slide-up panels contain inputs).
function isTextInputTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) {
		return false;
	}
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		el.isContentEditable
	);
}

export interface ControllerDeps {
	dispatch: (event: GameEvent) => void;
	initialHex: string;
	initialLat: number;
	initialLng: number;
	layer: SceneLayer;
	map: maplibregl.Map;
}

export class PlayerController {
	private readonly deps: ControllerDeps;
	private readonly keys = new Set<string>();

	private liveLat: number;
	private liveLng: number;
	private heading = 0;
	// Tracks the live camera pitch as the base for right-drag tilt; the map owns
	// the authoritative zoom/pitch so manual adjustments persist.
	private pitch = THIRD_PERSON_PITCH;
	private cameraMode: "third" | "top" = "third";
	private lastHex: string;

	private enabled = true;
	private running = false;
	private raf = 0;
	private last = 0;

	private character: PlayerCharacter | null = null;
	private boss: BossController | null = null;
	private faceYaw = 0;
	private speedRatio = 0;

	// Jump: a transient vertical gravity arc applied to the avatar's local Y
	// offset (metres). It never touches lng/lat/hex, so nothing is persisted.
	private isJumping = false;
	private jumpVelocity = 0;
	private altitudeM = 0;

	// Click-to-walk target. When set, the character auto-walks here until it
	// arrives or the player takes manual WASD control.
	private walkTarget: { lat: number; lng: number } | null = null;

	// Free-look (Pokémon-Go-style): when the user drags or scroll-zooms the map,
	// the follow loop stops forcing the camera until this timestamp passes, then
	// it eases back to the player. 0 means "following".
	private freeLookUntil = 0;
	private now = 0;

	// Right-click-drag tilt: tracks the drag origin while the right button is held.
	private tilting = false;
	private tiltStartY = 0;
	private tiltStartPitch = 0;

	constructor(deps: ControllerDeps) {
		this.deps = deps;
		this.liveLat = deps.initialLat;
		this.liveLng = deps.initialLng;
		this.lastHex = deps.initialHex;
		this.pitch = deps.map.getPitch();
	}

	start(): void {
		if (this.running) {
			return;
		}
		if (activeController && activeController !== this) {
			activeController.stop();
		}
		activeController = this;
		this.running = true;
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		// User-driven pan/zoom/rotate puts the camera into free-look.
		this.deps.map.on("dragstart", this.onUserCamera);
		this.deps.map.on("zoomstart", this.onUserCamera);
		this.deps.map.on("rotatestart", this.onUserCamera);
		// Right-click-drag adjusts the camera tilt (pitch).
		const canvas = this.deps.map.getCanvas();
		canvas.addEventListener("contextmenu", this.onContextMenu);
		canvas.addEventListener("pointerdown", this.onPointerDown);
		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("pointerup", this.onPointerUp);
		this.last = performance.now();
		this.raf = requestAnimationFrame(this.loop);
	}

	stop(): void {
		this.running = false;
		cancelAnimationFrame(this.raf);
		window.removeEventListener("keydown", this.onKeyDown);
		window.removeEventListener("keyup", this.onKeyUp);
		this.deps.map.off("dragstart", this.onUserCamera);
		this.deps.map.off("zoomstart", this.onUserCamera);
		this.deps.map.off("rotatestart", this.onUserCamera);
		const canvas = this.deps.map.getCanvas();
		canvas.removeEventListener("contextmenu", this.onContextMenu);
		canvas.removeEventListener("pointerdown", this.onPointerDown);
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		this.keys.clear();
		if (activeController === this) {
			activeController = null;
		}
	}

	// Right-click-drag tilt: hold the right mouse button and drag up/down. Dragging
	// up tilts toward the horizon (higher pitch), down tilts toward top-down.
	private readonly onContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 2) {
			return;
		}
		this.tilting = true;
		this.tiltStartY = event.clientY;
		this.tiltStartPitch = this.pitch;
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.tilting) {
			return;
		}
		const deltaY = this.tiltStartY - event.clientY;
		const next = this.tiltStartPitch + deltaY * TILT_DRAG_DEG_PER_PX;
		this.pitch = Math.min(MAX_MAP_PITCH, Math.max(MIN_MAP_PITCH, next));
		// Apply immediately so the tilt tracks the drag; the follow loop keeps
		// using this.pitch afterward, so the new tilt persists.
		this.deps.map.setPitch(this.pitch);
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		if (event.button === 2) {
			this.tilting = false;
		}
	};

	// Any user camera gesture (drag/scroll/rotate) enters free-look; the follow
	// loop backs off and recenters only after the idle gap. Programmatic camera
	// moves carry no originalEvent, so they never trigger this.
	private readonly onUserCamera = (
		event: maplibregl.MapLibreEvent<unknown>
	): void => {
		if ((event as { originalEvent?: unknown }).originalEvent === undefined) {
			return;
		}
		this.freeLookUntil = this.now + CAMERA_RECENTER_IDLE_MS;
	};

	setCharacter(character: PlayerCharacter): void {
		this.character = character;
	}

	// Attach the boss chaser, updated each frame alongside the player.
	setBoss(boss: BossController): void {
		this.boss = boss;
	}

	// Disable WASD (e.g. when real-GPS mode takes over movement).
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.keys.clear();
			// Land the avatar so a mode switch mid-jump never leaves it airborne.
			this.resetJump();
		}
	}

	// Snap the avatar back to the ground and silence the jump clip. Used when
	// movement is handed off (GPS) or teleported (recenter/hydrate) mid-jump.
	private resetJump(): void {
		this.isJumping = false;
		this.jumpVelocity = 0;
		this.altitudeM = 0;
		const character = this.character;
		if (character) {
			character.jump.stop();
			character.jump.setEffectiveWeight(0);
			character.root.position.y = 0;
		}
	}

	// The player's current live position (read by the boss chaser).
	getPosition(): { lat: number; lng: number } {
		return { lat: this.liveLat, lng: this.liveLng };
	}

	// Whether the avatar is mid-jump, and its current vertical offset in metres.
	get airborne(): boolean {
		return this.isJumping;
	}

	get altitude(): number {
		return this.altitudeM;
	}

	// Click-to-walk: set a destination the character auto-walks toward.
	walkTo(lat: number, lng: number): void {
		this.walkTarget = { lat, lng };
		this.freeLookUntil = 0;
	}

	// Snap the live position to an external source (GPS fix, recenter, hydrate).
	setPosition(lat: number, lng: number): void {
		this.liveLat = lat;
		this.liveLng = lng;
		this.lastHex = posToHex(lat, lng);
		this.resetJump();
	}

	// Reset the camera framing and snap back to the player (Recenter button).
	resetCamera(): void {
		this.heading = 0;
		this.cameraMode = "third";
		this.applyCameraMode();
		this.freeLookUntil = 0;
	}

	// Apply the current camera mode's zoom/pitch directly to the map. This is the
	// ONLY place the follow camera resets zoom/pitch (on C toggle / Recenter);
	// otherwise the user's manual zoom + tilt are preserved every frame.
	private applyCameraMode(): void {
		const topDown = this.cameraMode === "top";
		const zoom = topDown ? TOP_DOWN_ZOOM : THIRD_PERSON_ZOOM;
		const pitch = topDown ? TOP_DOWN_PITCH : THIRD_PERSON_PITCH;
		this.pitch = pitch;
		this.deps.map.jumpTo({ zoom, pitch });
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		const key = event.key.toLowerCase();
		// C toggles between third-person follow and tilted top-down.
		if (key === "c") {
			this.cameraMode = this.cameraMode === "third" ? "top" : "third";
			this.applyCameraMode();
			return;
		}
		// Space launches a jump; it is not a held movement key.
		if (key === " ") {
			this.tryJump(event);
			return;
		}
		this.keys.add(key);
	};

	// Start a jump if grounded. Ignores key-repeat (held Space) and Space typed
	// into a text field; not Space-blocking so inputs still receive the key.
	private tryJump(event: KeyboardEvent): void {
		if (
			!this.enabled ||
			this.isJumping ||
			event.repeat ||
			isTextInputTarget(event.target)
		) {
			return;
		}
		this.isJumping = true;
		this.jumpVelocity = JUMP_SPEED_MPS;
		const jump = this.character?.jump;
		if (jump) {
			// Restart the one-shot clip from frame 0; updateCharacter ramps its
			// weight in so idle/walk fade out smoothly.
			jump.reset();
			jump.setEffectiveWeight(0);
			jump.play();
		}
	}

	private readonly onKeyUp = (event: KeyboardEvent): void => {
		this.keys.delete(event.key.toLowerCase());
	};

	private integrate(dt: number): void {
		const forward = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0);
		const right = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);

		// WASD takes priority and cancels any click-to-walk order.
		if (forward !== 0 || right !== 0) {
			this.walkTarget = null;
			const headingRad = this.heading * DEG;
			// Heading-relative basis: forward points along the camera bearing.
			const east =
				forward * Math.sin(headingRad) + right * Math.cos(headingRad);
			const north =
				forward * Math.cos(headingRad) - right * Math.sin(headingRad);
			this.applyMove(east, north, dt, this.keys.has("shift"));
			// WASD always reclaims the camera from free-look.
			this.freeLookUntil = 0;
			return;
		}

		// No keys: auto-walk toward a click target, if any.
		if (this.walkTarget) {
			this.walkTowardTarget(dt);
			return;
		}
		this.speedRatio = 0;
	}

	// Step toward the click-to-walk target; arrive (and clear it) when close.
	private walkTowardTarget(dt: number): void {
		const target = this.walkTarget;
		if (!target) {
			return;
		}
		const dNorth = (target.lat - this.liveLat) * METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.liveLat * DEG);
		const dEast = (target.lng - this.liveLng) * (lngScale || 1);
		const distance = Math.hypot(dEast, dNorth);
		if (distance < WALK_ARRIVE_M) {
			this.walkTarget = null;
			this.speedRatio = 0;
			return;
		}
		this.applyMove(dEast / distance, dNorth / distance, dt, false);
	}

	// Advance the live position by a normalised (east, north) direction, set the
	// walk animation weight, and face the direction of travel. Shared by WASD and
	// click-to-walk so movement, facing, and animation stay consistent.
	private applyMove(
		eastRaw: number,
		northRaw: number,
		dt: number,
		sprinting: boolean
	): void {
		const mag = Math.hypot(eastRaw, northRaw) || 1;
		const east = eastRaw / mag;
		const north = northRaw / mag;

		const speed = WALK_SPEED_MPS * (sprinting ? SPRINT_MULTIPLIER : 1);
		this.liveLat += (north * speed * dt) / METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.liveLat * DEG);
		this.liveLng += (east * speed * dt) / (lngScale || METERS_PER_DEGREE_LAT);

		this.speedRatio = sprinting ? 1 : WALK_SPEED_RATIO;
		// Face the direction of travel. The scene is rotated +90° about X and
		// mirrored on Z (see SceneLayer), so model +Z points map-south; yaw is
		// measured so the model faces its travel heading, hence the negated north.
		this.faceYaw = Math.atan2(east, -north);
	}

	// Q/E rotate the camera heading (works while standing still too).
	private updateHeading(dt: number): void {
		const turn = (this.keys.has("e") ? 1 : 0) - (this.keys.has("q") ? 1 : 0);
		if (turn !== 0) {
			this.heading = (this.heading + turn * TURN_SPEED_DPS * dt + 360) % 360;
		}
	}

	private updateCharacter(dt: number): void {
		const character = this.character;
		if (!character) {
			return;
		}
		character.mixer.update(dt);

		const blend = Math.min(1, dt * ANIM_BLEND);
		// The jump clip takes over while airborne; ground (idle/walk) is scaled
		// down by the same amount so the three blend to a sum of 1.
		const jumpTarget = this.isJumping ? 1 : 0;
		const jumpWeight =
			character.jump.getEffectiveWeight() +
			(jumpTarget - character.jump.getEffectiveWeight()) * blend;
		character.jump.setEffectiveWeight(jumpWeight);
		const ground = 1 - jumpWeight;

		const walkWeight =
			character.walk.getEffectiveWeight() +
			(this.speedRatio - character.walk.getEffectiveWeight()) * blend;
		character.walk.setEffectiveWeight(walkWeight * ground);
		character.idle.setEffectiveWeight((1 - walkWeight) * ground);

		if (this.speedRatio > 0) {
			const turn = Math.min(1, dt * FACE_TURN);
			const current = character.root.rotation.y;
			let delta = this.faceYaw - current;
			delta = Math.atan2(Math.sin(delta), Math.cos(delta));
			character.root.rotation.y = current + delta * turn;
		}
	}

	// Integrate the vertical gravity arc and apply it to the avatar's Y offset.
	// Horizontal movement (integrate) is untouched, so WASD still works mid-air.
	private updateJump(dt: number): void {
		if (this.isJumping) {
			this.jumpVelocity -= GRAVITY_MPS2 * dt;
			this.altitudeM += this.jumpVelocity * dt;
			if (this.altitudeM <= 0) {
				// Land exactly on the ground so an interrupted arc never sticks.
				this.altitudeM = 0;
				this.jumpVelocity = 0;
				this.isJumping = false;
			}
		}
		const character = this.character;
		if (character) {
			character.root.position.y = this.altitudeM;
		}
	}

	// Follow the player, unless the user is in free-look. The camera tracks the
	// player's position and heading, but ALWAYS preserves the user's current zoom
	// and pitch (their manual scroll-zoom / right-drag tilt persists). Mode toggle
	// (C) and Recenter are the only things that reset zoom/pitch — handled by
	// applyCameraMode writing directly to the map, not here.
	private updateCamera(dt: number, time: number): void {
		const map = this.deps.map;
		if (time < this.freeLookUntil) {
			// Free-look: leave the user's camera untouched.
			return;
		}
		const center = map.getCenter();
		const dNorth = (this.liveLat - center.lat) * METERS_PER_DEGREE_LAT;
		const lngScale = METERS_PER_DEGREE_LAT * Math.cos(this.liveLat * DEG);
		const dEast = (this.liveLng - center.lng) * (lngScale || 1);
		const offset = Math.hypot(dNorth, dEast);

		// Snap when essentially centred or when actively moving (follow tightly);
		// otherwise ease back after a manual pan. Zoom/pitch always come from the
		// live map so manual adjustments are never overwritten.
		if (offset < RECENTER_EPSILON_M || this.speedRatio > MIN_MOVE_SPEED) {
			map.jumpTo({
				center: [this.liveLng, this.liveLat],
				bearing: this.heading,
			});
			return;
		}
		const t = Math.min(1, dt * RECENTER_LERP);
		map.jumpTo({
			center: [
				center.lng + (this.liveLng - center.lng) * t,
				center.lat + (this.liveLat - center.lat) * t,
			],
		});
	}

	private readonly loop = (time: number): void => {
		const dt = Math.min(MAX_FRAME_DT, (time - this.last) / 1000);
		this.last = time;
		this.now = time;

		if (this.enabled) {
			this.updateHeading(dt);
			this.integrate(dt);
		}

		// The three.js scene always tracks the player's true position, even while
		// the camera is in free-look, so entities/buildings stay registered.
		this.deps.layer.setOrigin(this.liveLng, this.liveLat);
		this.boss?.update(dt, time);
		this.updateCamera(dt, time);
		this.updateCharacter(dt);
		this.updateJump(dt);

		if (this.speedRatio > MIN_MOVE_SPEED) {
			const hex = posToHex(this.liveLat, this.liveLng);
			if (hex !== this.lastHex) {
				this.lastHex = hex;
				this.deps.dispatch({
					type: "MOVE",
					lat: this.liveLat,
					lng: this.liveLng,
				});
			}
		}

		this.raf = requestAnimationFrame(this.loop);
	};
}
