import {
	AmbientLight,
	Box3,
	DirectionalLight,
	type Object3D,
	OrthographicCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from "three";
import { ENEMY_MODEL_URL } from "@/game/constants";
import { loadModelInstance } from "@/game/three/asset-loader";
import type { GateEnemy } from "@/game/types";

// A single shared three.js scene that renders all dungeon-arena enemies as 3D
// skeleton models, overlaid on the 2D combat panel. One renderer/canvas (not one
// per enemy) keeps it well under the browser's WebGL-context cap. Enemies are
// placed on an orthographic plane matching the panel's normalised x/y layout.

const TARGET_HEIGHT = 1.6; // normalised model height in scene units
const KIND_SCALE: Record<GateEnemy["kind"], number> = {
	fodder: 1,
	elite: 1.25,
	boss: 1.9,
};

interface EnemyModel {
	kind: GateEnemy["kind"];
	root: Object3D | null;
}

export class ArenaScene {
	private readonly scene = new Scene();
	private readonly camera: OrthographicCamera;
	private renderer: WebGLRenderer | null = null;
	private readonly models = new Map<string, EnemyModel>();
	private width = 1;
	private height = 1;
	private raf = 0;
	private running = false;

	constructor() {
		// Orthographic so the arena reads like a flat board; units are 0..1 in x,
		// inverted y (top = far). A small depth range keeps everything visible.
		this.camera = new OrthographicCamera(0, 1, 1, 0, -10, 10);
		this.camera.position.z = 5;
		this.scene.add(new AmbientLight(0xff_ff_ff, 1.4));
		const key = new DirectionalLight(0xff_ff_ff, 1.8);
		key.position.set(0.5, 1, 1);
		this.scene.add(key);
	}

	attach(canvas: HTMLCanvasElement): void {
		this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
		this.renderer.setClearColor(0x00_00_00, 0);
		this.running = true;
		this.raf = requestAnimationFrame(this.loop);
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		this.renderer?.setPixelRatio(dpr);
		this.renderer?.setSize(this.width, this.height, false);
	}

	// Reconcile model set + positions with the current enemy list.
	sync(enemies: GateEnemy[]): void {
		const wanted = new Set(enemies.map((e) => e.id));
		for (const [id, model] of this.models) {
			if (!wanted.has(id)) {
				if (model.root) {
					this.scene.remove(model.root);
				}
				this.models.delete(id);
			}
		}
		for (const enemy of enemies) {
			const existing = this.models.get(enemy.id);
			if (existing) {
				if (existing.root) {
					this.placeOne(existing.root, enemy);
				}
				continue;
			}
			const model: EnemyModel = { kind: enemy.kind, root: null };
			this.models.set(enemy.id, model);
			loadModelInstance(ENEMY_MODEL_URL[enemy.kind])
				.then((root) => {
					if (this.models.get(enemy.id) !== model) {
						return;
					}
					normalise(root, enemy.kind);
					this.placeOne(root, enemy);
					this.scene.add(root);
					model.root = root;
				})
				.catch(() => {
					if (this.models.get(enemy.id) === model) {
						this.models.delete(enemy.id);
					}
				});
		}
	}

	dispose(): void {
		this.running = false;
		cancelAnimationFrame(this.raf);
		for (const model of this.models.values()) {
			if (model.root) {
				this.scene.remove(model.root);
			}
		}
		this.models.clear();
		this.renderer?.dispose();
		this.renderer = null;
	}

	// Map an enemy's normalised (x, y) panel position into scene space. The
	// arena spans x:0..aspect, y:0..1, so models keep proportion at any size.
	private placeOne(root: Object3D, enemy: GateEnemy): void {
		const aspect = this.width / this.height;
		root.position.set(enemy.x * aspect, 1 - enemy.y, 0);
		const dead = enemy.hp <= 0;
		root.visible = !dead;
	}

	private readonly loop = (): void => {
		if (!(this.running && this.renderer)) {
			return;
		}
		const aspect = this.width / this.height;
		this.camera.left = 0;
		this.camera.right = aspect;
		this.camera.top = 1;
		this.camera.bottom = 0;
		this.camera.updateProjectionMatrix();
		this.renderer.render(this.scene, this.camera);
		this.raf = requestAnimationFrame(this.loop);
	};
}

// Scale a model to a consistent height per kind and stand it on the ground line.
function normalise(root: Object3D, kind: GateEnemy["kind"]): void {
	const box = new Box3().setFromObject(root);
	const size = new Vector3();
	box.getSize(size);
	const h = size.y || 1;
	const scale = (TARGET_HEIGHT * KIND_SCALE[kind]) / h;
	root.scale.setScalar(scale);
	// Re-measure for the ground offset after scaling.
	const scaled = new Box3().setFromObject(root);
	root.position.y -= scaled.min.y;
	// Face the camera, turned slightly so it reads as 3D not flat.
	root.rotation.y = Math.PI;
}
