import {
	CircleGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	RingGeometry,
} from "three";

// The Pokémon-Go-style interaction ring drawn flat on the ground at the player's
// feet, showing how close a world entity must be to become tappable. It lives in
// the player group (which sits at the scene origin), so it follows the player for
// free and tilts correctly with the 3D camera. A faint filled disc reads as the
// reachable area; a brighter band marks the edge; both gently pulse so the ring
// feels alive without distracting from gameplay.

const SEGMENTS = 64;
// Edge band thickness as a fraction of the radius.
const EDGE_BAND = 0.04;
// Lift the ring just off the ground to avoid z-fighting with the road / hex fill.
const GROUND_LIFT_M = 0.15;
const RIGHT_ANGLE = Math.PI / 2;

// Cyan to match the player-owned hex fill (#22d3ee), so the ring reads as "yours".
const RING_COLOR = 0x22_d3_ee;
const FILL_OPACITY = 0.06;
const EDGE_OPACITY_MIN = 0.35;
const EDGE_OPACITY_MAX = 0.7;
// Pulse period in seconds.
const PULSE_PERIOD_S = 2.2;
const TWO_PI = Math.PI * 2;
// Subtle breathing scale around 1.
const PULSE_SCALE = 0.03;

export class InteractionRing {
	readonly group = new Group();
	private readonly edge: Mesh;
	private readonly edgeMaterial: MeshBasicMaterial;
	private readonly fillGeometry: CircleGeometry;
	private readonly edgeGeometry: RingGeometry;
	private readonly fillMaterial: MeshBasicMaterial;
	private elapsed = 0;

	constructor(radiusM: number) {
		const edgeInner = radiusM * (1 - EDGE_BAND);

		this.fillGeometry = new CircleGeometry(radiusM, SEGMENTS);
		this.fillMaterial = new MeshBasicMaterial({
			color: RING_COLOR,
			transparent: true,
			opacity: FILL_OPACITY,
			side: DoubleSide,
			depthWrite: false,
		});
		const fill = new Mesh(this.fillGeometry, this.fillMaterial);

		this.edgeGeometry = new RingGeometry(edgeInner, radiusM, SEGMENTS);
		this.edgeMaterial = new MeshBasicMaterial({
			color: RING_COLOR,
			transparent: true,
			opacity: EDGE_OPACITY_MAX,
			side: DoubleSide,
			depthWrite: false,
		});
		this.edge = new Mesh(this.edgeGeometry, this.edgeMaterial);

		// CircleGeometry / RingGeometry are built in the X-Y plane; lay them flat on
		// the ground (the scene's X-Z plane, Y up) and lift slightly off the floor.
		fill.rotation.x = -RIGHT_ANGLE;
		this.edge.rotation.x = -RIGHT_ANGLE;
		fill.position.y = GROUND_LIFT_M;
		this.edge.position.y = GROUND_LIFT_M;
		// Draw after opaque world geometry so the translucent ring blends cleanly.
		fill.renderOrder = 1;
		this.edge.renderOrder = 2;

		this.group.add(fill, this.edge);
	}

	// Breathe the edge opacity and the whole ring's scale. Driven from the render
	// loop with the frame delta in seconds.
	update(dt: number): void {
		this.elapsed += dt;
		const phase = (this.elapsed / PULSE_PERIOD_S) * TWO_PI;
		const wave = (Math.sin(phase) + 1) / 2; // 0..1
		this.edgeMaterial.opacity =
			EDGE_OPACITY_MIN + (EDGE_OPACITY_MAX - EDGE_OPACITY_MIN) * wave;
		const scale = 1 + PULSE_SCALE * wave;
		this.group.scale.set(scale, scale, scale);
	}

	dispose(): void {
		this.fillGeometry.dispose();
		this.edgeGeometry.dispose();
		this.fillMaterial.dispose();
		this.edgeMaterial.dispose();
	}
}
