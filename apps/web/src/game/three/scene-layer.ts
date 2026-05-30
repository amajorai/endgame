import maplibregl from "maplibre-gl";
import {
	Camera,
	DirectionalLight,
	Group,
	HemisphereLight,
	Matrix4,
	Scene,
	Vector3,
	WebGLRenderer,
} from "three";
import { EntityRenderer } from "@/game/three/entity-renderer";
import { WeatherField } from "@/game/three/weather-system";
import type { TimeOfDay, WeatherType } from "@/game/types";

// Sun + sky tuned per time-of-day so day/night reads in the 3D scene.
interface LightingPreset {
	groundColor: number;
	hemiIntensity: number;
	position: [number, number, number];
	skyColor: number;
	sunColor: number;
	sunIntensity: number;
}

const LIGHTING: Record<TimeOfDay, LightingPreset> = {
	dawn: {
		sunColor: 0xff_d9_a0,
		sunIntensity: 2,
		skyColor: 0xff_e8_c8,
		groundColor: 0x20_2a_38,
		hemiIntensity: 1,
		position: [40, 60, 80],
	},
	day: {
		sunColor: 0xff_ff_ff,
		sunIntensity: 2.6,
		skyColor: 0xbc_d4_ff,
		groundColor: 0x22_30_44,
		hemiIntensity: 1.2,
		position: [60, 120, 40],
	},
	golden: {
		sunColor: 0xff_b0_66,
		sunIntensity: 2.2,
		skyColor: 0xff_d2_a0,
		groundColor: 0x20_2a_38,
		hemiIntensity: 1,
		position: [80, 50, 30],
	},
	night: {
		sunColor: 0x9a_b4_ff,
		sunIntensity: 1.6,
		skyColor: 0x4a_5f_8c,
		groundColor: 0x1a_22_36,
		hemiIntensity: 1.1,
		position: [-40, 80, -30],
	},
	witching: {
		sunColor: 0x86_92_d0,
		sunIntensity: 1.4,
		skyColor: 0x3a_44_70,
		groundColor: 0x16_1c_30,
		hemiIntensity: 1,
		position: [-30, 90, -50],
	},
};

// A single MapLibre custom layer that hosts a three.js scene sharing the map's
// WebGL context. The scene origin tracks the player, so world objects are placed
// in metres relative to the player's live lng/lat. The camera projection is
// rebuilt every frame from MapLibre's main matrix, keeping three.js content
// perfectly registered with the basemap and extruded buildings.

const HALF_TURN = Math.PI;

// MapLibre hands the projection to the render method via this shape. We only
// need the main matrix; a structural type keeps us decoupled from internals.
interface CustomRenderArgs {
	defaultProjectionData: { mainMatrix: ArrayLike<number> };
}

export class SceneLayer implements maplibregl.CustomLayerInterface {
	readonly id = "game-3d";
	readonly type = "custom" as const;
	readonly renderingMode = "3d" as const;

	// World root: everything that should sit at the player's location.
	readonly playerGroup = new Group();
	// World root for things positioned by metre offset from the origin (weather,
	// entities — used by later phases).
	readonly worldGroup = new Group();

	private readonly scene = new Scene();
	private readonly camera = new Camera();
	private readonly sun = new DirectionalLight(0xff_ff_ff, 2.4);
	private readonly hemi = new HemisphereLight(0xbc_d4_ff, 0x20_2a_38, 1.1);
	private readonly weather = new WeatherField();
	readonly entities: EntityRenderer;
	private renderer: WebGLRenderer | null = null;
	private map: maplibregl.Map | null = null;
	private lastRender = 0;

	private originLng: number;
	private originLat: number;

	constructor(originLng: number, originLat: number) {
		this.originLng = originLng;
		this.originLat = originLat;
		this.sun.position.set(60, 120, 40);
		// Weather rides with the player so it always falls around the camera.
		this.playerGroup.add(this.weather.group);
		this.scene.add(this.hemi, this.sun, this.playerGroup, this.worldGroup);
		// Entities live in world space (metres from the moving origin).
		this.entities = new EntityRenderer(this.worldGroup, originLng, originLat);
	}

	// Swap the active weather particle field.
	setWeather(weather: WeatherType, timeOfDay: TimeOfDay): void {
		this.weather.set(weather, timeOfDay);
	}

	// Move the scene origin to the player's live position (called each frame).
	// Entities are repositioned relative to the new origin so they hold their
	// real-world lng/lat as the player walks.
	setOrigin(lng: number, lat: number): void {
		this.originLng = lng;
		this.originLat = lat;
		this.entities.syncPositions(lng, lat);
	}

	get sunLight(): DirectionalLight {
		return this.sun;
	}

	get hemiLight(): HemisphereLight {
		return this.hemi;
	}

	// Drive sun colour/direction and sky fill from the in-game time of day.
	applyLighting(timeOfDay: TimeOfDay): void {
		const preset = LIGHTING[timeOfDay] ?? LIGHTING.day;
		this.sun.color.setHex(preset.sunColor);
		this.sun.intensity = preset.sunIntensity;
		this.sun.position.set(...preset.position);
		this.hemi.color.setHex(preset.skyColor);
		this.hemi.groundColor.setHex(preset.groundColor);
		this.hemi.intensity = preset.hemiIntensity;
	}

	onAdd(
		map: maplibregl.Map,
		gl: WebGL2RenderingContext | WebGLRenderingContext
	): void {
		this.map = map;
		this.renderer = new WebGLRenderer({
			canvas: map.getCanvas(),
			context: gl,
			antialias: true,
		});
		this.renderer.autoClear = false;
	}

	render(
		_gl: WebGL2RenderingContext | WebGLRenderingContext,
		args: CustomRenderArgs
	): void {
		const renderer = this.renderer;
		const map = this.map;
		if (!(renderer && map)) {
			return;
		}
		const now = performance.now();
		const dt = this.lastRender ? (now - this.lastRender) / 1000 : 0;
		this.lastRender = now;
		this.weather.update(dt);
		this.entities.update(dt);

		const merc = maplibregl.MercatorCoordinate.fromLngLat(
			[this.originLng, this.originLat],
			0
		);
		const scale = merc.meterInMercatorCoordinateUnits();
		// Place the metre-based three.js scene at the origin: translate to the
		// origin's mercator position, scale metres into mercator units, and rotate
		// so three.js Y-up models stand upright on the map.
		const local = new Matrix4()
			.makeTranslation(merc.x, merc.y, merc.z)
			.scale(new Vector3(scale, -scale, scale))
			.multiply(
				new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), HALF_TURN / 2)
			);
		const projection = new Matrix4().fromArray(
			args.defaultProjectionData.mainMatrix
		);
		this.camera.projectionMatrix = projection.multiply(local);

		renderer.resetState();
		renderer.render(this.scene, this.camera);
		map.triggerRepaint();
	}

	onRemove(): void {
		this.renderer?.dispose();
		this.renderer = null;
		this.map = null;
	}
}
