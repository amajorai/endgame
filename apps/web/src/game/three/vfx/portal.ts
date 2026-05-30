import {
	AdditiveBlending,
	CircleGeometry,
	Color,
	DoubleSide,
	Mesh,
	ShaderMaterial,
} from "three";

// A swirling portal disc rendered with a hand-written GLSL shader, modelled on
// the reference Godot `portal.gdshader` (polar-coordinate swirl + animated value
// noise + emissive edge glow) but self-contained: procedural noise, no external
// textures. Faces upward like a pool; mount it over a gate and raise slightly.

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// value noise + fbm, polar swirl, radial mask with soft edge glow.
const FRAGMENT = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uPrimary;
uniform vec3 uSecondary;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		v += amp * valueNoise(p);
		p *= 2.0;
		amp *= 0.5;
	}
	return v;
}

void main() {
	vec2 centered = vUv * 2.0 - 1.0;
	float radius = length(centered);
	float angle = atan(centered.y, centered.x);

	// Polar swirl: spin around the centre, drift inward over time.
	vec2 polar = vec2(angle / 6.2831853 + uTime * 0.06, radius - uTime * 0.25);
	float n = fbm(polar * vec2(6.0, 5.0));
	float swirl = fbm(polar * 3.0 + n);

	// Disc mask with a soft outer edge, plus a bright rim.
	float disc = smoothstep(1.0, 0.7, radius);
	float rim = smoothstep(0.65, 1.0, radius) * smoothstep(1.0, 0.9, radius);

	vec3 col = mix(uSecondary, uPrimary, swirl);
	col += uPrimary * rim * 2.0;
	float alpha = disc * (0.35 + 0.65 * swirl);
	alpha = clamp(alpha + rim * 0.8, 0.0, 1.0);

	gl_FragColor = vec4(col, alpha);
}
`;

export interface Portal {
	mesh: Mesh;
	update: (dt: number) => void;
}

const PORTAL_RADIUS = 4;
const PORTAL_SEGMENTS = 48;

// Build a portal disc. `primary`/`secondary` are hex colours for the swirl.
export function createPortal(primary: number, secondary: number): Portal {
	const geometry = new CircleGeometry(PORTAL_RADIUS, PORTAL_SEGMENTS);
	const material = new ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uPrimary: { value: new Color(primary) },
			uSecondary: { value: new Color(secondary) },
		},
		vertexShader: VERTEX,
		fragmentShader: FRAGMENT,
		transparent: true,
		side: DoubleSide,
		depthWrite: false,
		blending: AdditiveBlending,
	});
	const mesh = new Mesh(geometry, material);
	// Stand the disc upright (faces the player) rather than lying flat.
	mesh.rotation.x = 0;

	return {
		mesh,
		update(dt: number): void {
			material.uniforms.uTime.value += dt;
		},
	};
}
