import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	NormalBlending,
	Points,
	PointsMaterial,
} from "three";
import type { TimeOfDay, WeatherType } from "@/game/types";

// A world-space particle volume that lives in the 3D scene around the player and
// falls along world-up, so weather is perspective-correct and occluded by the
// scene rather than pasted on the UI. Replaces the old screen-space canvas.

const BOX_RADIUS = 180; // metres around the player on each horizontal axis
const BOX_HEIGHT = 90; // metres of vertical extent
const MAX_PARTICLES = 2200;
const SPEED_JITTER_MIN = 0.7;
const SPEED_JITTER_SPAN = 0.6;
const MAX_UPDATE_DT = 0.05;

interface WeatherPreset {
	additive: boolean;
	color: number;
	count: number;
	// Horizontal drift amplitude in m/s.
	drift: number;
	// Positive falls down, negative rises.
	fallSpeed: number;
	opacity: number;
	// Particle size in metres.
	size: number;
}

const BY_WEATHER: Partial<Record<WeatherType, WeatherPreset>> = {
	rain: {
		color: 0x9f_c8_ff,
		count: 2000,
		size: 0.7,
		fallSpeed: 22,
		drift: 1.5,
		opacity: 0.75,
		additive: false,
	},
	thunder: {
		color: 0xbf_dc_ff,
		count: 2200,
		size: 0.8,
		fallSpeed: 28,
		drift: 2.5,
		opacity: 0.85,
		additive: false,
	},
	snow: {
		color: 0xff_ff_ff,
		count: 1600,
		size: 1.1,
		fallSpeed: 4,
		drift: 1.2,
		opacity: 0.95,
		additive: false,
	},
	fog: {
		color: 0xb8_c4_d4,
		count: 220,
		size: 9,
		fallSpeed: 0.3,
		drift: 0.8,
		opacity: 0.12,
		additive: false,
	},
	haze: {
		color: 0xc8_cf_b4,
		count: 180,
		size: 8,
		fallSpeed: 0.2,
		drift: 0.6,
		opacity: 0.09,
		additive: false,
	},
	wind: {
		color: 0x9c_c0_80,
		count: 260,
		size: 0.7,
		fallSpeed: 1.5,
		drift: 9,
		opacity: 0.8,
		additive: false,
	},
	heat: {
		color: 0xff_8a_3c,
		count: 220,
		size: 0.6,
		fallSpeed: -4,
		drift: 0.8,
		opacity: 0.5,
		additive: true,
	},
	eclipse: {
		color: 0x7a_6c_ae,
		count: 320,
		size: 0.5,
		fallSpeed: -2.5,
		drift: 1,
		opacity: 0.65,
		additive: true,
	},
};

const FIREFLIES: WeatherPreset = {
	color: 0xff_ee_88,
	count: 200,
	size: 0.45,
	fallSpeed: -0.6,
	drift: 1.2,
	opacity: 0.9,
	additive: true,
};

const STARS: WeatherPreset = {
	color: 0xcf_e0_ff,
	count: 240,
	size: 0.4,
	fallSpeed: -0.4,
	drift: 0.6,
	opacity: 0.9,
	additive: true,
};

// Weather wins; otherwise night/witching get an ambient field, clear skies none.
function presetFor(
	weather: WeatherType,
	timeOfDay: TimeOfDay
): WeatherPreset | null {
	const byWeather = BY_WEATHER[weather];
	if (byWeather) {
		return byWeather;
	}
	if (timeOfDay === "night") {
		return FIREFLIES;
	}
	if (timeOfDay === "witching") {
		return STARS;
	}
	return null;
}

export class WeatherField {
	readonly group = new Group();
	private points: Points | null = null;
	private velocities: Float32Array | null = null;

	constructor() {
		this.group.frustumCulled = false;
	}

	// Rebuild the particle field for the active weather + time of day.
	set(weather: WeatherType, timeOfDay: TimeOfDay): void {
		this.dispose();
		const preset = presetFor(weather, timeOfDay);
		if (!preset) {
			return;
		}
		const count = Math.min(MAX_PARTICLES, preset.count);
		const positions = new Float32Array(count * 3);
		const velocities = new Float32Array(count * 3);
		for (let i = 0; i < count; i += 1) {
			const o = i * 3;
			positions[o] = (Math.random() * 2 - 1) * BOX_RADIUS;
			positions[o + 1] = Math.random() * BOX_HEIGHT;
			positions[o + 2] = (Math.random() * 2 - 1) * BOX_RADIUS;
			const jitter = SPEED_JITTER_MIN + Math.random() * SPEED_JITTER_SPAN;
			velocities[o] = (Math.random() * 2 - 1) * preset.drift;
			velocities[o + 1] = -preset.fallSpeed * jitter;
			velocities[o + 2] = (Math.random() * 2 - 1) * preset.drift;
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", new BufferAttribute(positions, 3));
		const material = new PointsMaterial({
			color: new Color(preset.color),
			size: preset.size,
			sizeAttenuation: true,
			transparent: true,
			opacity: preset.opacity,
			depthWrite: false,
			blending: preset.additive ? AdditiveBlending : NormalBlending,
		});
		const points = new Points(geometry, material);
		points.frustumCulled = false;
		this.points = points;
		this.velocities = velocities;
		this.group.add(points);
	}

	update(dt: number): void {
		const points = this.points;
		const velocities = this.velocities;
		if (!(points && velocities)) {
			return;
		}
		const step = Math.min(MAX_UPDATE_DT, dt);
		const attr = points.geometry.getAttribute("position") as BufferAttribute;
		const arr = attr.array as Float32Array;
		for (let i = 0; i < arr.length; i += 3) {
			arr[i] += velocities[i] * step;
			arr[i + 1] += velocities[i + 1] * step;
			arr[i + 2] += velocities[i + 2] * step;
			arr[i + 1] = wrap(arr[i + 1], 0, BOX_HEIGHT);
			arr[i] = wrap(arr[i], -BOX_RADIUS, BOX_RADIUS);
			arr[i + 2] = wrap(arr[i + 2], -BOX_RADIUS, BOX_RADIUS);
		}
		attr.needsUpdate = true;
	}

	private dispose(): void {
		const points = this.points;
		if (!points) {
			return;
		}
		this.group.remove(points);
		points.geometry.dispose();
		(points.material as PointsMaterial).dispose();
		this.points = null;
		this.velocities = null;
	}
}

// Keep a coordinate within [min, max) by wrapping across the span.
function wrap(value: number, min: number, max: number): number {
	const span = max - min;
	if (value < min) {
		return value + span;
	}
	if (value >= max) {
		return value - span;
	}
	return value;
}
