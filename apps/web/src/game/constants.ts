import type { HexClass, Rank } from "@/game/types";

// H3 grid resolution: res 10 yields ~80m hexes.
export const H3_RESOLUTION = 10;
// gridDisk radius rendered around the player.
export const HEX_VIEW_RING = 6;

// Game loop cadence.
export const TICK_MS = 1000;

const SECONDS_PER_HOUR = 3600;

// Capture times in seconds, keyed by hex class.
export const CAPTURE_SECONDS = {
	wildland: 10,
	control_point: 30,
	sanctum: 90,
} as const satisfies Record<HexClass, number>;

// Base mana generation per hour, keyed by hex class.
export const MANA_PER_HOUR = {
	wildland: 1,
	control_point: 5,
	sanctum: 25,
} as const satisfies Record<HexClass, number>;

// Derived mana per second, keyed by hex class.
export const MANA_PER_SECOND = {
	wildland: MANA_PER_HOUR.wildland / SECONDS_PER_HOUR,
	control_point: MANA_PER_HOUR.control_point / SECONDS_PER_HOUR,
	sanctum: MANA_PER_HOUR.sanctum / SECONDS_PER_HOUR,
} as const satisfies Record<HexClass, number>;

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
export const MS_PER_DAY =
	HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_HOUR * MS_PER_SECOND;

// Decay grace windows in days before a holding begins to decay.
export const DECAY_WINDOW_DAYS = {
	wildland: 7,
	estate: 14,
	manor: 30,
} as const;

// Decay grace windows in milliseconds.
export const DECAY_WINDOW_MS = {
	wildland: DECAY_WINDOW_DAYS.wildland * MS_PER_DAY,
	estate: DECAY_WINDOW_DAYS.estate * MS_PER_DAY,
	manor: DECAY_WINDOW_DAYS.manor * MS_PER_DAY,
} as const;

// Fraction of capture lost per day once a holding is past its decay window.
export const DECAY_RATE_PER_DAY = 0.1;

// Rank ladder, lowest to highest.
export const RANKS = ["E", "D", "C", "B", "A", "S"] as const satisfies Rank[];

// Capture speed multipliers per rank (higher rank captures faster).
export const RANK_CAPTURE_SPEED = {
	E: 1.0,
	D: 1.1,
	C: 1.2,
	B: 1.5,
	A: 1.75,
	S: 2.0,
} as const satisfies Record<Rank, number>;

// Adjacent-tag ring sizes per rank (how far a capture tags neighbours).
export const RANK_TAG_RING = {
	E: 0,
	D: 0,
	C: 1,
	B: 1,
	A: 2,
	S: 2,
} as const satisfies Record<Rank, number>;

// OpenFreeMap basemap style URLs.
export const MAP_STYLE_URLS = {
	light: "https://tiles.openfreemap.org/styles/liberty",
	dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// Default spawn (Singapore) used when no GPS fix is available.
export const DEFAULT_SPAWN = {
	lat: 1.3521,
	lng: 103.8198,
} as const;

// Maximum offline interval to credit on rehydration (8 hours).
export const MAX_OFFLINE_MS =
	8 * MINUTES_PER_HOUR * SECONDS_PER_HOUR * MS_PER_SECOND;

// Event-log compaction threshold.
export const EVENT_COMPACTION_THRESHOLD = 2000;

// Current persisted state schema version.
export const STATE_VERSION = 1;

// ---------------------------------------------------------------------------
// 3D world (MapLibre custom three.js layer). Camera, movement, and assets.
// ---------------------------------------------------------------------------

// Third-person follow camera framing. Closer + lower so the avatar reads clearly.
export const THIRD_PERSON_ZOOM = 19.5;
export const THIRD_PERSON_PITCH = 55;
// Tilted top-down framing (camera toggle, key C).
export const TOP_DOWN_ZOOM = 18.5;
export const TOP_DOWN_PITCH = 20;
// Hard pitch ceiling for the map.
export const MAX_MAP_PITCH = 78;
// Pokémon-Go-style free look: user may pan/scroll-zoom; after this idle gap the
// camera smoothly recenters on the player.
export const CAMERA_RECENTER_IDLE_MS = 3500;
export const CAMERA_MIN_ZOOM = 16;
export const CAMERA_MAX_ZOOM = 20.5;

// WASD movement, in metres per second, with a sprint multiplier (Shift).
// Brisk and gamey rather than realistic, so ~80m hexes feel a few seconds apart.
export const WALK_SPEED_MPS = 14;
export const SPRINT_MULTIPLIER = 2.4;
// Heading turn rate for Q/E in degrees per second (Phase 2).
export const TURN_SPEED_DPS = 90;
// Right-click-drag tilt sensitivity, in degrees of pitch per pixel dragged.
export const TILT_DRAG_DEG_PER_PX = 0.4;
export const MIN_MAP_PITCH = 0;

// Player character model scale (tuned so the avatar reads at follow zoom).
export const PLAYER_MODEL_SCALE = 4;

// Metres per degree of latitude (WGS84 mean); longitude scales by cos(lat).
export const METERS_PER_DEGREE_LAT = 111_320;

// Jump (Space): a single gravity arc applied to the avatar's vertical offset.
// Gamey rather than realistic, to match the brisk WALK_SPEED_MPS. Peak height is
// JUMP_SPEED_MPS^2 / (2 * GRAVITY_MPS2) (~3 m) and airtime is 2 * JUMP_SPEED_MPS
// / GRAVITY_MPS2 (~0.93 s), tuned so the Jump_Full_Short clip reads at its
// natural playback rate.
export const JUMP_SPEED_MPS = 13;
export const GRAVITY_MPS2 = 28;

// Asset URLs served from apps/web/public.
export const PLAYER_CHARACTER_URL =
	"/assets/kaykit/adventurers/characters/gltf/Knight.glb";
export const PLAYER_MOVEMENT_ANIM_URL =
	"/assets/kaykit/adventurers/animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb";

// 3D building extrusion colour by light/dark theme bucket.
export const BUILDING_COLOR_DARK = "#1b2436";
export const BUILDING_COLOR_LIGHT = "#c7cedb";

// Skeleton enemy character models, by dungeon-enemy kind.
export const ENEMY_MODEL_URL = {
	fodder: "/assets/kaykit/skeletons/characters/gltf/Skeleton_Minion.glb",
	elite: "/assets/kaykit/skeletons/characters/gltf/Skeleton_Rogue.glb",
	boss: "/assets/kaykit/skeletons/characters/gltf/Skeleton_Warrior.glb",
} as const;
// Shared skeleton animation clip pack (same Rig_Medium skeleton).
export const ENEMY_ANIM_URL =
	"/assets/kaykit/skeletons/animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb";
