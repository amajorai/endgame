import {
	type AnimationAction,
	type AnimationClip,
	AnimationMixer,
	type Group,
	LoopOnce,
	type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
	PLAYER_CHARACTER_URL,
	PLAYER_MODEL_SCALE,
	PLAYER_MOVEMENT_ANIM_URL,
} from "@/game/constants";

// One shared loader, and a per-URL cache of loaded scenes so the same model is
// fetched/parsed once and then cloned cheaply for every instance.
const loader = new GLTFLoader();
interface LoadedGltf {
	animations: AnimationClip[];
	scene: Object3D;
}

const assetCache = new Map<string, Promise<LoadedGltf>>();

function loadAsset(url: string): Promise<LoadedGltf> {
	const cached = assetCache.get(url);
	if (cached) {
		return cached;
	}
	const promise = loader.loadAsync(url).then((gltf) => ({
		animations: gltf.animations,
		scene: gltf.scene,
	}));
	assetCache.set(url, promise);
	return promise;
}

// Return a fresh clone of a cached model, ready to position in the scene.
// SkeletonUtils.clone preserves skinned meshes; plain props clone fine too.
export async function loadModelInstance(url: string): Promise<Object3D> {
	const asset = await loadAsset(url);
	return cloneSkeleton(asset.scene);
}

// Loads the player character GLB and applies the shared-skeleton movement clips
// from the separate KayKit rig file. Both target the same `Rig_Medium`
// skeleton, so clips bind directly via an AnimationMixer with no retargeting.

export interface PlayerCharacter {
	idle: AnimationAction;
	jump: AnimationAction;
	mixer: AnimationMixer;
	root: Group;
	walk: AnimationAction;
}

const IDLE_PATTERN = /idle/i;
const WALK_PATTERN = /walk/i;
const RUN_PATTERN = /run/i;
// Prefer the compact one-shot jump; fall back to any full jump clip.
const JUMP_SHORT_PATTERN = /jump_full_short/i;
const JUMP_PATTERN = /jump_full/i;

function pickClip(
	clips: AnimationClip[],
	pattern: RegExp
): AnimationClip | undefined {
	return clips.find((clip) => pattern.test(clip.name));
}

export interface AnimatedModelInstance {
	action: AnimationAction;
	mixer: AnimationMixer;
	root: Object3D;
}

const ANIM_CLIP_PATTERN = {
	idle: IDLE_PATTERN,
	walk: WALK_PATTERN,
} as const satisfies Record<"idle" | "walk", RegExp>;

export async function loadAnimatedModelInstance(
	modelUrl: string,
	animationUrl: string,
	clipName: "idle" | "walk"
): Promise<AnimatedModelInstance> {
	const [model, animation] = await Promise.all([
		loadAsset(modelUrl),
		loadAsset(animationUrl),
	]);

	const root = cloneSkeleton(model.scene);
	const clips = animation.animations.length
		? animation.animations
		: model.animations;
	const clip =
		pickClip(clips, ANIM_CLIP_PATTERN[clipName]) ??
		pickClip(clips, IDLE_PATTERN) ??
		clips[0];

	if (!clip) {
		throw new Error(`No animation clips found for ${modelUrl}`);
	}

	const mixer = new AnimationMixer(root);
	const action = mixer.clipAction(clip);
	action.play();

	return { action, mixer, root };
}

export async function loadPlayerCharacter(): Promise<PlayerCharacter> {
	const loader = new GLTFLoader();
	const [character, animation] = await Promise.all([
		loader.loadAsync(PLAYER_CHARACTER_URL),
		loader.loadAsync(PLAYER_MOVEMENT_ANIM_URL),
	]);

	const root = character.scene;
	root.scale.setScalar(PLAYER_MODEL_SCALE);

	const clips = animation.animations.length
		? animation.animations
		: character.animations;
	const idleClip = pickClip(clips, IDLE_PATTERN) ?? clips[0];
	const walkClip =
		pickClip(clips, WALK_PATTERN) ?? pickClip(clips, RUN_PATTERN) ?? idleClip;
	const jumpClip =
		pickClip(clips, JUMP_SHORT_PATTERN) ??
		pickClip(clips, JUMP_PATTERN) ??
		idleClip;

	const mixer = new AnimationMixer(root);
	const idle = mixer.clipAction(idleClip);
	const walk = mixer.clipAction(walkClip);
	idle.play();
	walk.play();
	walk.setEffectiveWeight(0);

	// The jump plays once per press and holds its final pose; the controller
	// resets and ramps its weight while airborne, so it stays silent at rest.
	const jump = mixer.clipAction(jumpClip);
	jump.loop = LoopOnce;
	jump.clampWhenFinished = true;
	jump.setEffectiveWeight(0);

	return { root, mixer, idle, jump, walk };
}
