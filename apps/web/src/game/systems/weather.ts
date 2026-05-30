// Weather + time-of-day amplifier. Derives world.timeOfDay/theme from the real
// local clock on TICK, accepts manual + Open-Meteo weather updates, and exposes
// a pure buff selector other systems can read. Never edits the frozen spine.

import type {
	GameEvent,
	MapTheme,
	SystemReducer,
	TimeOfDay,
	WeatherType,
} from "@/game/types";
import { isSpineEvent } from "@/game/types";

// ---------------------------------------------------------------------------
// Local discriminated union + guard. The GameEvent union is OPEN, so checking
// event.type alone does NOT narrow payload fields. This guard does.
// ---------------------------------------------------------------------------

type WeatherEvent =
	| { type: "WEATHER_SET"; weather: WeatherType }
	| { type: "WEATHER_FETCH_RESULT"; weather: WeatherType };

const WEATHER_EVENT_TYPES: Set<string> = new Set([
	"WEATHER_SET",
	"WEATHER_FETCH_RESULT",
]);

const isWeatherEvent = (event: GameEvent): event is WeatherEvent =>
	WEATHER_EVENT_TYPES.has(event.type);

// ---------------------------------------------------------------------------
// Time-of-day derivation from the local clock hour.
// dawn 5-7, day 7-17, golden 17-19, night 19-24/0-5, witching 0-3.
// Witching overlaps night, so it is checked first.
// ---------------------------------------------------------------------------

const HOUR_WITCHING_END = 3;
const HOUR_DAWN_START = 5;
const HOUR_DAY_START = 7;
const HOUR_GOLDEN_START = 17;
const HOUR_NIGHT_START = 19;

export function timeOfDayForHour(hour: number): TimeOfDay {
	if (hour >= 0 && hour < HOUR_WITCHING_END) {
		return "witching";
	}
	if (hour >= HOUR_DAWN_START && hour < HOUR_DAY_START) {
		return "dawn";
	}
	if (hour >= HOUR_DAY_START && hour < HOUR_GOLDEN_START) {
		return "day";
	}
	if (hour >= HOUR_GOLDEN_START && hour < HOUR_NIGHT_START) {
		return "golden";
	}
	// 3-5 and 19-24 fall through to night.
	return "night";
}

// Map time-of-day (and an eclipse weather override) to the basemap theme.
export function themeForWorld(
	timeOfDay: TimeOfDay,
	weather: WeatherType
): MapTheme {
	if (weather === "eclipse") {
		return "eclipse";
	}
	if (timeOfDay === "day") {
		return "bright_day";
	}
	if (timeOfDay === "dawn" || timeOfDay === "golden") {
		return "golden_hour";
	}
	// night + witching.
	return "awakened_night";
}

// ---------------------------------------------------------------------------
// Buff selector. GameState is frozen, so buffs are DERIVED on read, never
// stored. Other systems import this and read the flags they care about.
// ---------------------------------------------------------------------------

export interface WeatherBuffs {
	// Multiplier applied to capture speed.
	captureMult: number;
	// Multiplier applied to combat/gate damage.
	combatMult: number;
	// Multiplier applied to mana accrual.
	manaMult: number;
	// Short human-readable note for the panel.
	note: string;
	// Multiplier applied to stamina drain (lower is better).
	staminaDrainMult: number;
}

const NEUTRAL_BUFFS: WeatherBuffs = {
	manaMult: 1,
	captureMult: 1,
	combatMult: 1,
	staminaDrainMult: 1,
	note: "Calm skies. No modifiers.",
};

const WEATHER_BUFFS: Record<WeatherType, WeatherBuffs> = {
	clear: NEUTRAL_BUFFS,
	cloudy: {
		manaMult: 1,
		captureMult: 1,
		combatMult: 1,
		staminaDrainMult: 1,
		note: "Overcast. Steady going.",
	},
	rain: {
		manaMult: 1.15,
		captureMult: 0.9,
		combatMult: 1,
		staminaDrainMult: 1.1,
		note: "Rain swells mana but slows capture.",
	},
	thunder: {
		manaMult: 1.3,
		captureMult: 0.85,
		combatMult: 1.15,
		staminaDrainMult: 1.15,
		note: "Storm charges mana and combat power.",
	},
	fog: {
		manaMult: 1,
		captureMult: 0.8,
		combatMult: 0.9,
		staminaDrainMult: 1,
		note: "Fog conceals. Capture and combat dulled.",
	},
	snow: {
		manaMult: 1,
		captureMult: 0.85,
		combatMult: 1,
		staminaDrainMult: 1.25,
		note: "Snow saps stamina, slows capture.",
	},
	wind: {
		manaMult: 1,
		captureMult: 1.1,
		combatMult: 1,
		staminaDrainMult: 0.9,
		note: "Tailwinds quicken capture and travel.",
	},
	heat: {
		manaMult: 1,
		captureMult: 1,
		combatMult: 1.1,
		staminaDrainMult: 1.3,
		note: "Heat fuels combat but drains stamina.",
	},
	haze: {
		manaMult: 0.9,
		captureMult: 0.95,
		combatMult: 0.95,
		staminaDrainMult: 1.1,
		note: "Haze dampens everything slightly.",
	},
	eclipse: {
		manaMult: 1.5,
		captureMult: 1.2,
		combatMult: 1.25,
		staminaDrainMult: 1,
		note: "Eclipse: power surges across the realm.",
	},
};

export function weatherBuffs(weather: WeatherType): WeatherBuffs {
	return WEATHER_BUFFS[weather] ?? NEUTRAL_BUFFS;
}

// ---------------------------------------------------------------------------
// Open-Meteo fetch helper. The panel calls this with the player's lat/lng and
// dispatches WEATHER_FETCH_RESULT with the result. Falls back to 'clear'.
// ---------------------------------------------------------------------------

const WMO_CLOUDY_MAX = 3;
const WMO_FOG_LIGHT = 45;
const WMO_FOG_DENSE = 48;
const WMO_DRIZZLE_MIN = 51;
const WMO_RAIN_MAX = 67;
const WMO_SNOW_MIN = 71;
const WMO_SNOW_MAX = 77;
const WMO_SHOWERS_MIN = 80;
const WMO_SHOWERS_MAX = 82;
const WMO_SNOW_SHOWER_MIN = 85;
const WMO_SNOW_SHOWER_MAX = 86;
const WMO_THUNDER_MIN = 95;
const WMO_THUNDER_MAX = 99;

export function weatherFromWmoCode(code: number): WeatherType {
	if (code === 0) {
		return "clear";
	}
	if (code > 0 && code <= WMO_CLOUDY_MAX) {
		return "cloudy";
	}
	if (code === WMO_FOG_LIGHT || code === WMO_FOG_DENSE) {
		return "fog";
	}
	if (code >= WMO_THUNDER_MIN && code <= WMO_THUNDER_MAX) {
		return "thunder";
	}
	if (
		(code >= WMO_SNOW_MIN && code <= WMO_SNOW_MAX) ||
		(code >= WMO_SNOW_SHOWER_MIN && code <= WMO_SNOW_SHOWER_MAX)
	) {
		return "snow";
	}
	if (
		(code >= WMO_DRIZZLE_MIN && code <= WMO_RAIN_MAX) ||
		(code >= WMO_SHOWERS_MIN && code <= WMO_SHOWERS_MAX)
	) {
		return "rain";
	}
	return "clear";
}

interface OpenMeteoResponse {
	current?: {
		weather_code?: number;
	};
}

export async function fetchWeather(
	lat: number,
	lng: number
): Promise<WeatherType> {
	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code`;
		const res = await fetch(url);
		if (!res.ok) {
			return "clear";
		}
		const data = (await res.json()) as OpenMeteoResponse;
		const code = data.current?.weather_code;
		if (typeof code !== "number") {
			return "clear";
		}
		return weatherFromWmoCode(code);
	} catch {
		return "clear";
	}
}

// ---------------------------------------------------------------------------
// Reducer.
// ---------------------------------------------------------------------------

export const weatherReducer: SystemReducer = (state, event) => {
	if (isWeatherEvent(event)) {
		const weather = event.weather;
		const effectiveWeather = state.debug.forcedWeather ?? weather;
		const theme = themeForWorld(state.world.timeOfDay, effectiveWeather);
		if (weather === state.world.weather && theme === state.world.theme) {
			return state;
		}
		return {
			...state,
			world: { ...state.world, weather, theme },
		};
	}

	if (!isSpineEvent(event) || event.type !== "TICK") {
		return state;
	}

	const now = (event as { now: number }).now;
	const derivedTime = timeOfDayForHour(new Date(now).getHours());
	const timeOfDay = state.debug.forcedTime ?? derivedTime;
	const weather = state.debug.forcedWeather ?? state.world.weather;
	const theme = themeForWorld(timeOfDay, weather);

	if (
		timeOfDay === state.world.timeOfDay &&
		theme === state.world.theme &&
		weather === state.world.weather
	) {
		// Nothing changed: return the SAME reference to avoid per-second churn.
		return state;
	}

	return {
		...state,
		world: { ...state.world, timeOfDay, theme, weather },
	};
};
