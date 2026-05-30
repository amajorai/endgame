// Central domain model for The End Game. Types and interfaces only.
// Later "amplifier" systems extend these shapes without editing the spine.

export type H3Index = string;

export type Owner = "player" | "rival" | "neutral";

export type HexClass = "wildland" | "control_point" | "sanctum";

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

// Building placed on a captured hex. Spine leaves this open for later systems.
export type BuildingType = string;

export type Element =
	| "fire"
	| "water"
	| "earth"
	| "air"
	| "light"
	| "dark"
	| "void";

export interface Deed {
	building?: BuildingType;
	capturedAt: number | null; // epoch ms
	capturePct: number; // 0-100
	element?: Element;
	hex: H3Index;
	hexClass: HexClass;
	lastVisited: number; // epoch ms
	owner: Owner;
	poiName?: string;
}

export interface CaptureMeter {
	contested: boolean;
	hex: H3Index;
	owner: Owner;
	progress: number; // 0-100
}

export type JournalStatus = "been" | "want_to_go" | "want_to_revisit";

export interface JournalEntry {
	createdAt: number; // epoch ms
	hex: H3Index;
	id: string;
	lat: number;
	lng: number;
	name: string;
	poiType?: string;
	status: JournalStatus;
}

export type PowerId =
	// Launch nine.
	| "bulwark"
	| "sentinel"
	| "striker"
	| "phantom"
	| "pyromancer"
	| "marksman"
	| "mender"
	| "herald"
	| "hex_witch"
	// Off-meta.
	| "vendor"
	| "commuter"
	| "hawker"
	| "auntie"
	| "office_worker"
	| "rider";

export type GateTheme =
	| "nature"
	| "domestic"
	| "knowledge"
	| "trial"
	| "transit"
	| "relic"
	| "sacred"
	| "abyss"
	| "liminal";

export interface Gate {
	anchored: boolean;
	hex: H3Index;
	lat: number;
	lng: number;
	name: string;
	rank: Rank;
	stars: number; // 0-5
	theme: GateTheme;
}

export type BeaconTier = "shrine" | "cache" | "raid" | "vault";

export interface Beacon {
	expiresAt?: number; // epoch ms
	hex: H3Index;
	id: string;
	lastSpun?: number; // epoch ms
	lat: number;
	lng: number;
	tier: BeaconTier;
}

export interface Plot {
	assignedShadow?: string; // Shadow id
	biome: string;
	crop?: string;
	growthMs?: number;
	hex: H3Index;
	plantedAt?: number; // epoch ms
}

export interface Shadow {
	assignedHex?: H3Index;
	id: string;
	name: string;
	rank: Rank;
	sourceMonster: string;
}

export type EstateTier = "holdings" | "estate" | "manor" | "monopoly";

export interface Estate {
	district?: string;
	hexes: H3Index[];
	id: string;
	tier: EstateTier;
}

export interface InventoryItem {
	id: string;
	kind: string;
	name: string;
	qty: number;
	rarity: string;
}

export type TimeOfDay = "dawn" | "day" | "golden" | "night" | "witching";

export type WeatherType =
	| "clear"
	| "cloudy"
	| "rain"
	| "thunder"
	| "fog"
	| "snow"
	| "wind"
	| "heat"
	| "haze"
	| "eclipse";

export type MapTheme =
	| "bright_day"
	| "golden_hour"
	| "awakened_night"
	| "eclipse";

export interface PlayerStats {
	agi: number;
	int: number;
	per: number;
	str: number;
	vit: number;
}

export interface Player {
	bankedSteps: number;
	combatMana: number;
	equippedPower: PowerId;
	hp: number;
	id: string;
	level: number;
	maxCombatMana: number;
	maxHp: number;
	maxStamina: number;
	name: string;
	rank: Rank;
	skillPoints: number;
	stamina: number;
	statPoints: number;
	stats: PlayerStats;
	unlockedPowers: PowerId[];
	unlockedSkills: string[];
	xp: number;
}

export interface GhostMode {
	active: boolean;
	lastReset: number; // epoch ms
	secondsRemaining: number;
}

export type ContentSource = "procedural" | "overpass";

// ---------------------------------------------------------------------------
// Amplifier domain types. The spine does not touch these, but they live in the
// central contract so amplifier systems get typed homes in GameState without
// ever editing this file. Each amplifier owns the LOGIC; these are the shapes.
// ---------------------------------------------------------------------------

export type EnemyKind = "fodder" | "elite" | "boss";

export interface GateEnemy {
	hp: number;
	id: string;
	kind: EnemyKind;
	// On-map combat position (lng/lat). Populated by the gate-combat system when
	// enemies fight in-world; the renderer places their models from these.
	lat?: number;
	lng?: number;
	maxHp: number;
	name: string;
	x: number; // 0-1 normalized arena position
	y: number; // 0-1 normalized arena position
}

export type GateRunStatus = "active" | "won" | "lost";

export interface GateRun {
	elapsedMs: number;
	enemies: GateEnemy[];
	gateHex: H3Index;
	mana: number;
	// Anchor (lng/lat) of the gate run's on-map combat arena. Populated by the
	// gate-combat system so enemy positions can be derived around it in-world.
	originLat?: number;
	originLng?: number;
	playerHp: number;
	playerMaxHp: number;
	potionsUsed: number;
	power: PowerId;
	purchasedPotionsUsed: number;
	rank: Rank;
	stamina: number;
	starsEarned: number;
	startedAt: number; // epoch ms
	status: GateRunStatus;
	theme: GateTheme;
	totalWaves: number;
	wave: number;
}

export type FieldBossStatus = "roaming" | "engaged" | "defeated";

export interface FieldBoss {
	fromDungeonBreak: boolean;
	hex: H3Index;
	hp: number;
	id: string;
	lat: number;
	lng: number;
	maxHp: number;
	name: string;
	phase: number;
	rank: Rank;
	status: FieldBossStatus;
	theme: GateTheme;
	totalPhases: number;
}

export type QuestKind = "daily" | "weekly" | "want_to_go" | "story";

export interface Quest {
	claimed: boolean;
	completed: boolean;
	description: string;
	expiresAt?: number; // epoch ms
	hex?: H3Index;
	id: string;
	kind: QuestKind;
	progress: number;
	rewardMana: number;
	rewardXp: number;
	target: number;
	title: string;
}

export type VehicleKind =
	| "walk"
	| "bicycle"
	| "car"
	| "train"
	| "boat"
	| "helicopter"
	| "plane";

export interface Vehicle {
	id: string;
	kind: VehicleKind;
}

export interface SupplyDrop {
	claimed: boolean;
	hex: H3Index;
	id: string;
	landsAt: number; // epoch ms
	lat: number;
	lng: number;
	tier: string;
}

export interface Chest {
	expiresAt: number; // epoch ms
	hex: H3Index;
	id: string;
	lat: number;
	lng: number;
	opened: boolean;
}

export interface Siege {
	active: boolean;
	district: string;
	endsAt: number; // epoch ms
	id: string;
	playerHexes: number;
	startsAt: number; // epoch ms
}

export interface DailyState {
	ghostSecondsUsedToday: number;
	lastDailyQuestReset: number; // epoch ms
	lastShrineReset: number; // epoch ms
}

export interface GameNotification {
	createdAt: number; // epoch ms
	id: string;
	kind: string;
	message: string;
	read: boolean;
}

// Catch-all bag for amplifier domains that do not have a dedicated top-level
// GameState field. Typed, so amplifiers stay type-safe; flat, so they do not
// collide.
export interface GameMeta {
	chests: Chest[];
	contentCacheMeta: Record<string, number>; // hex -> last content-gen ts
	daily: DailyState;
	notifications: GameNotification[];
	onboarded: boolean;
	quests: Quest[];
	sieges: Siege[];
	supplyDrops: SupplyDrop[];
	vehicles: Vehicle[];
}

export interface GameState {
	activeBoss: FieldBoss | null;
	activeGate: GateRun | null;
	beacons: Record<string, Beacon>;
	captureMeters: Record<H3Index, CaptureMeter>;
	debug: {
		enabled: boolean;
		contentSource: ContentSource;
		forcedWeather?: WeatherType;
		forcedTime?: TimeOfDay;
	};
	deeds: Record<H3Index, Deed>;
	estates: Estate[];
	gates: Record<H3Index, Gate>;
	homeHex: H3Index | null;
	inventory: {
		items: Record<string, InventoryItem>;
	};
	journal: Record<string, JournalEntry>;
	lastTick: number; // epoch ms
	meta: GameMeta;
	player: Player;
	plots: Record<H3Index, Plot>;
	position: {
		lat: number;
		lng: number;
		hex: H3Index;
	};
	resources: {
		mana: number;
		materials: Record<string, number>;
	};
	shadows: Shadow[];
	useRealGps: boolean;
	version: number;
	world: {
		timeOfDay: TimeOfDay;
		weather: WeatherType;
		theme: MapTheme;
		ghost: GhostMode;
	};
}

// Spine events. The discriminated union below is the authoritative shape for
// the spine; GameEvent stays open so amplifier systems can dispatch their own.
export type SpineEvent =
	| { type: "HYDRATE"; state: GameState }
	| { type: "MOVE"; lat: number; lng: number }
	| { type: "TICK"; now: number }
	| { type: "CLAIM_PROGRESS"; hex: H3Index }
	| { type: "COLLECT_MANA" }
	| { type: "SET_GPS_MODE"; on: boolean }
	| { type: "SET_HOME"; hex: H3Index }
	| { type: "JOURNAL_ADD"; entry: JournalEntry }
	| { type: "JOURNAL_SET_STATUS"; id: string; status: JournalStatus }
	| { type: "DEBUG_TOGGLE" }
	| { type: "DEBUG_SET_CONTENT_SOURCE"; source: ContentSource };

// Open union: spine events plus any future amplifier event. The intersection of
// the two members keeps `type` as the discriminant while allowing extra fields.
export type GameEvent = SpineEvent | { type: string; [k: string]: unknown };

export type SystemReducer = (state: GameState, event: GameEvent) => GameState;

const SPINE_EVENT_TYPES: Set<string> = new Set([
	"HYDRATE",
	"MOVE",
	"TICK",
	"CLAIM_PROGRESS",
	"COLLECT_MANA",
	"SET_GPS_MODE",
	"SET_HOME",
	"JOURNAL_ADD",
	"JOURNAL_SET_STATUS",
	"DEBUG_TOGGLE",
	"DEBUG_SET_CONTENT_SOURCE",
]);

// Narrows the open GameEvent union to the authoritative SpineEvent shape so
// spine reducers index typed payload fields. Returns false for amplifier events.
export function isSpineEvent(event: GameEvent): event is SpineEvent {
	return SPINE_EVENT_TYPES.has(event.type);
}
