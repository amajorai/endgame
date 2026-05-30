import {
	type AnimationAction,
	type AnimationClip,
	AnimationMixer,
	type Group,
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
const sceneCache = new Map<string, Promise<Object3D>>();

function loadScene(url: string): Promise<Object3D> {
	const cached = sceneCache.get(url);
	if (cached) {
		return cached;
	}
	const promise = loader.loadAsync(url).then((gltf) => gltf.scene);
	sceneCache.set(url, promise);
	return promise;
}

// Return a fresh clone of a cached model, ready to position in the scene.
// SkeletonUtils.clone preserves skinned meshes; plain props clone fine too.
export async function loadModelInstance(url: string): Promise<Object3D> {
	const scene = await loadScene(url);
	return cloneSkeleton(scene);
}

// Loads the player character GLB and applies the shared-skeleton movement clips
// from the separate KayKit rig file. Both target the same `Rig_Medium`
// skeleton, so clips bind directly via an AnimationMixer with no retargeting.

export interface PlayerCharacter {
	idle: AnimationAction;
	mixer: AnimationMixer;
	root: Group;
	walk: AnimationAction;
}

const IDLE_PATTERN = /idle/i;
const WALK_PATTERN = /walk/i;
const RUN_PATTERN = /run/i;

function pickClip(
	clips: AnimationClip[],
	pattern: RegExp
): AnimationClip | undefined {
	return clips.find((clip) => pattern.test(clip.name));
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

	const mixer = new AnimationMixer(root);
	const idle = mixer.clipAction(idleClip);
	const walk = mixer.clipAction(walkClip);
	idle.play();
	walk.play();
	walk.setEffectiveWeight(0);

	return { root, mixer, idle, walk };
}
