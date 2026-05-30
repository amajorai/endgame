import { MANA_PER_SECOND, MS_PER_DAY } from "@/game/constants";
import { hexDisk } from "@/game/lib/hex";
import type {
	BuildingType,
	Deed,
	Estate,
	EstateTier,
	GameEvent,
	GameState,
	SystemReducer,
} from "@/game/types";

// ---------------------------------------------------------------------------
// Estates system. Recomputes connected player-owned holdings into tiers,
// applies tier mana bonuses as extra accrual, handles building placement, and
// runs mana sinks (daily building upkeep + anchored-gate tolls).
// ---------------------------------------------------------------------------

const FULL_CAPTURE = 100;
const MS_PER_SECOND = 1000;

// Tier thresholds.
const HOLDINGS_MIN = 5;
const ESTATE_MIN = 15;
const ESTATE_MIN_CONTROL_POINTS = 1;
const MANOR_MIN = 30;
const MANOR_MIN_CONTROL_POINTS = 3;

// Tier mana bonus fractions (applied on top of base accrual for member hexes).
export const TIER_BONUS: Record<EstateTier, number> = {
	holdings: 0.25,
	estate: 0.5,
	manor: 0.75,
	monopoly: 1.0,
};

export const TIER_LABELS: Record<EstateTier, string> = {
	holdings: "Holdings",
	estate: "Estate",
	manor: "Manor",
	monopoly: "Monopoly",
};

// Building catalogue: one-time mana cost + daily upkeep deducted on a daily
// tick cadence. Anchored gates levy a separate toll handled below.
export type EstateBuilding =
	| "plot"
	| "shop"
	| "tower"
	| "gate_anchor"
	| "banner";

export interface BuildingSpec {
	cost: number;
	description: string;
	icon: string;
	label: string;
	upkeep: number; // mana per day
}

export const BUILDINGS: Record<EstateBuilding, BuildingSpec> = {
	plot: {
		cost: 20,
		upkeep: 1,
		icon: "🌱",
		label: "Plot",
		description: "Arable plot for farming crops.",
	},
	shop: {
		cost: 60,
		upkeep: 3,
		icon: "🏪",
		label: "Shop",
		description: "Trade post that vends materials.",
	},
	tower: {
		cost: 120,
		upkeep: 5,
		icon: "🗼",
		label: "Tower",
		description: "Watchtower that widens your sightline.",
	},
	gate_anchor: {
		cost: 200,
		upkeep: 8,
		icon: "⚓",
		label: "Gate Anchor",
		description: "Anchors a gate; levies a toll each day.",
	},
	banner: {
		cost: 40,
		upkeep: 2,
		icon: "🚩",
		label: "Banner",
		description: "Claims the hex for your district.",
	},
};

// Daily toll an anchored gate hex draws from the treasury.
export const ANCHORED_GATE_TOLL = 4;

// Bookkeeping key inside meta.contentCacheMeta (a catch-all Record we may use
// without editing the spine) for the last daily-upkeep timestamp.
const UPKEEP_META_KEY = "estate:lastUpkeep";

// Coarse parent cell used to bucket hexes into "districts". A district is a
// group of nearby hexes; a monopoly owns every owned-eligible hex in it.
const DISTRICT_RING = 3;

const BUILDING_KEYS = new Set<string>(Object.keys(BUILDINGS));

function isEstateBuilding(value: string): value is EstateBuilding {
	return BUILDING_KEYS.has(value);
}

// A deed counts toward an estate when the player fully holds it.
function isHeld(deed: Deed): boolean {
	return deed.owner === "player" && deed.capturePct >= FULL_CAPTURE;
}

// Collect every fully-held player hex.
function heldDeeds(state: GameState): Deed[] {
	const held: Deed[] = [];
	for (const deed of Object.values(state.deeds)) {
		if (isHeld(deed)) {
			held.push(deed);
		}
	}
	return held;
}

// Build adjacency-connected components over held hexes using hexDisk(k=1).
function connectedGroups(held: Deed[]): Deed[][] {
	const byHex = new Map<string, Deed>();
	for (const deed of held) {
		byHex.set(deed.hex, deed);
	}
	const seen = new Set<string>();
	const groups: Deed[][] = [];

	for (const start of held) {
		if (seen.has(start.hex)) {
			continue;
		}
		const group: Deed[] = [];
		const queue: string[] = [start.hex];
		seen.add(start.hex);
		while (queue.length > 0) {
			const hex = queue.shift();
			if (hex === undefined) {
				break;
			}
			const deed = byHex.get(hex);
			if (!deed) {
				continue;
			}
			group.push(deed);
			for (const neighbor of hexDisk(hex, 1)) {
				if (neighbor === hex || seen.has(neighbor) || !byHex.has(neighbor)) {
					continue;
				}
				seen.add(neighbor);
				queue.push(neighbor);
			}
		}
		groups.push(group);
	}
	return groups;
}

function countControlPoints(group: Deed[]): number {
	let count = 0;
	for (const deed of group) {
		if (deed.hexClass === "control_point" || deed.hexClass === "sanctum") {
			count += 1;
		}
	}
	return count;
}

// District id: the parent hex at a coarse ring. We approximate with the first
// hex of the disk root so grouping stays deterministic without extra deps.
function districtOf(hex: string): string {
	const disk = hexDisk(hex, DISTRICT_RING);
	// The smallest index string is a stable representative for the neighborhood.
	let rep = hex;
	for (const candidate of disk) {
		if (candidate < rep) {
			rep = candidate;
		}
	}
	return rep;
}

// A group is a monopoly when it owns every held hex that shares its district.
function isMonopoly(group: Deed[], allHeld: Deed[]): boolean {
	const districts = new Set<string>();
	for (const deed of group) {
		districts.add(districtOf(deed.hex));
	}
	const groupHexes = new Set(group.map((d) => d.hex));
	for (const deed of allHeld) {
		if (groupHexes.has(deed.hex)) {
			continue;
		}
		if (districts.has(districtOf(deed.hex))) {
			return false;
		}
	}
	// Only meaningful for groups already large enough to qualify as a manor.
	return group.length >= MANOR_MIN;
}

function tierFor(
	group: Deed[],
	controlPoints: number,
	monopoly: boolean
): EstateTier | null {
	if (monopoly) {
		return "monopoly";
	}
	if (group.length >= MANOR_MIN && controlPoints >= MANOR_MIN_CONTROL_POINTS) {
		return "manor";
	}
	if (
		group.length >= ESTATE_MIN &&
		controlPoints >= ESTATE_MIN_CONTROL_POINTS
	) {
		return "estate";
	}
	if (group.length >= HOLDINGS_MIN) {
		return "holdings";
	}
	return null;
}

function makeEstateId(group: Deed[]): string {
	let lowest = group[0]?.hex ?? "estate";
	for (const deed of group) {
		if (deed.hex < lowest) {
			lowest = deed.hex;
		}
	}
	return `estate:${lowest}`;
}

// Recompute the estates array from current deeds. Pure.
export function recomputeEstates(state: GameState): Estate[] {
	const held = heldDeeds(state);
	if (held.length === 0) {
		return [];
	}
	const groups = connectedGroups(held);
	const estates: Estate[] = [];
	for (const group of groups) {
		const controlPoints = countControlPoints(group);
		const monopoly = isMonopoly(group, held);
		const tier = tierFor(group, controlPoints, monopoly);
		if (!tier) {
			continue;
		}
		estates.push({
			id: makeEstateId(group),
			hexes: group.map((d) => d.hex),
			tier,
			district: districtOf(group[0]?.hex ?? ""),
		});
	}
	return estates;
}

function estatesEqual(a: Estate[], b: Estate[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i += 1) {
		const x = a[i];
		const y = b[i];
		if (!(x && y)) {
			return false;
		}
		if (
			x.id !== y.id ||
			x.tier !== y.tier ||
			x.hexes.length !== y.hexes.length
		) {
			return false;
		}
	}
	return true;
}

// Per-second mana bonus contributed by all estates (sum of member hex base
// accrual scaled by the tier bonus fraction).
export function estateBonusPerSecond(state: GameState): number {
	let perSecond = 0;
	for (const estate of state.estates) {
		const bonus = TIER_BONUS[estate.tier];
		for (const hex of estate.hexes) {
			const deed = state.deeds[hex];
			if (deed && isHeld(deed)) {
				perSecond += MANA_PER_SECOND[deed.hexClass] * bonus;
			}
		}
	}
	return perSecond;
}

// Total daily upkeep across all standing buildings.
export function totalDailyUpkeep(state: GameState): number {
	let upkeep = 0;
	for (const deed of Object.values(state.deeds)) {
		const building = deed.building;
		if (building && isEstateBuilding(building)) {
			upkeep += BUILDINGS[building].upkeep;
		}
		const gate = state.gates[deed.hex];
		if (gate?.anchored) {
			upkeep += ANCHORED_GATE_TOLL;
		}
	}
	return upkeep;
}

// Net mana per hour after bonuses and upkeep, for the panel readout.
export function netManaPerHour(state: GameState): {
	base: number;
	bonus: number;
	upkeep: number;
	net: number;
} {
	const SECONDS_PER_HOUR = 3600;
	let basePerSecond = 0;
	for (const deed of Object.values(state.deeds)) {
		if (isHeld(deed)) {
			basePerSecond += MANA_PER_SECOND[deed.hexClass];
		}
	}
	const base = basePerSecond * SECONDS_PER_HOUR;
	const bonus = estateBonusPerSecond(state) * SECONDS_PER_HOUR;
	const upkeep = totalDailyUpkeep(state) / 24;
	return { base, bonus, upkeep, net: base + bonus - upkeep };
}

// ---- Event handling --------------------------------------------------------

interface EstateEvent {
	building: EstateBuilding;
	hex: string;
	type: "BUILDING_BUILD";
	[k: string]: unknown;
}

const ESTATE_EVENT_TYPES = new Set<string>(["BUILDING_BUILD"]);

function isEstateEvent(event: GameEvent): event is EstateEvent {
	return ESTATE_EVENT_TYPES.has(event.type);
}

function isTick(event: GameEvent): event is { type: "TICK"; now: number } {
	return event.type === "TICK";
}

function applyRecompute(state: GameState): GameState {
	const next = recomputeEstates(state);
	if (estatesEqual(next, state.estates)) {
		return state;
	}
	return { ...state, estates: next };
}

function applyManaBonus(state: GameState, now: number): GameState {
	const elapsedMs = Math.max(0, now - state.lastTick);
	const elapsedSeconds = elapsedMs / MS_PER_SECOND;
	if (elapsedSeconds <= 0) {
		return state;
	}
	const perSecond = estateBonusPerSecond(state);
	if (perSecond <= 0) {
		return state;
	}
	return {
		...state,
		resources: {
			...state.resources,
			mana: state.resources.mana + perSecond * elapsedSeconds,
		},
	};
}

// Deduct upkeep once per calendar-day window since the last charge.
function applyUpkeep(state: GameState, now: number): GameState {
	const last = state.meta.contentCacheMeta[UPKEEP_META_KEY] ?? state.lastTick;
	const elapsed = now - last;
	if (elapsed < MS_PER_DAY) {
		return state;
	}
	const daysDue = Math.floor(elapsed / MS_PER_DAY);
	const upkeep = totalDailyUpkeep(state);
	const advancedLast = last + daysDue * MS_PER_DAY;
	const charged = upkeep * daysDue;
	const nextMana = Math.max(0, state.resources.mana - charged);
	return {
		...state,
		resources: { ...state.resources, mana: nextMana },
		meta: {
			...state.meta,
			contentCacheMeta: {
				...state.meta.contentCacheMeta,
				[UPKEEP_META_KEY]: advancedLast,
			},
		},
	};
}

function handleBuild(
	state: GameState,
	hex: string,
	building: EstateBuilding
): GameState {
	const deed = state.deeds[hex];
	// Only build on fully-held player hexes.
	if (!(deed && isHeld(deed))) {
		return state;
	}
	const spec = BUILDINGS[building];
	if (state.resources.mana < spec.cost) {
		return state;
	}
	const nextBuilding: BuildingType = building;
	return {
		...state,
		resources: { ...state.resources, mana: state.resources.mana - spec.cost },
		deeds: {
			...state.deeds,
			[hex]: { ...deed, building: nextBuilding },
		},
	};
}

export const estatesReducer: SystemReducer = (state, event) => {
	if (isEstateEvent(event)) {
		const built = handleBuild(state, event.hex, event.building);
		return applyRecompute(built);
	}

	if (isTick(event)) {
		const now = event.now;
		const recomputed = applyRecompute(state);
		const withBonus = applyManaBonus(recomputed, now);
		return applyUpkeep(withBonus, now);
	}

	// Capture changes can land via other spine events (CLAIM_PROGRESS, MOVE);
	// recompute defensively so tiers track ownership without a tick lag.
	return applyRecompute(state);
};
