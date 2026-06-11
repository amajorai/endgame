import type { GameEvent, GameState } from "@/game/types";

// World-entity spec registry. The 3D EntityRenderer no longer hard-codes which
// world objects to draw: each gameplay system (gates, farming, estates, shadows,
// gate-combat) registers a provider that maps the current GameState to a list of
// WorldEntitySpec. The renderer concatenates all providers each sync and
// reconciles models from the result. This keeps central files stable while
// per-system agents ADD providers in new files only.

// A single placeable world entity. Generalises the renderer's former private
// EntitySpec so any system can describe a model to draw, where, at what size,
// and what to dispatch when tapped.
export interface WorldEntitySpec {
	// Optional animation pack for skinned models that ship animation clips in a
	// separate GLB. Static props omit this and render as before.
	animation?: {
		clip: "idle" | "walk";
		url: string;
		yawOffsetRad?: number;
	};
	// Dispatched when the entity is tapped (screen-space pick). Optional so a
	// provider can place purely-decorative props with no interaction.
	event?: GameEvent;
	// Optional flat tile laid at the entity position (e.g. a tilled farm plot or
	// an estate footprint), normalised to a few metres so it reads as ground.
	groundTileUrl?: string;
	// Stable identity across syncs (e.g. `gate:${hex}`). Drives add/keep/remove
	// reconciliation and the live-position tracking heuristics.
	key: string;
	// Free-form kind tag (gate/beacon/drop/boss/plot/sentinel/...). Used only for
	// default sizing fallback; the renderer is otherwise kind-agnostic now.
	kind: string;
	lat: number;
	lng: number;
	// GLTF/GLB URL for the model. A missing model is non-fatal (it just won't
	// appear), so providers may emit speculative specs safely.
	modelUrl: string;
	// Optional screen-space pick radius. Large landmarks such as gates render much
	// wider than the generic tap target and need their visual footprint to win
	// before lower-priority map layers like land/build taps.
	pickRadiusPx?: number;
	// Gates carry portal colours; undefined for other kinds. When present the
	// renderer mounts the swirling portal VFX at the entity.
	portalColors?: { primary: number; secondary: number };
	// Target on-map footprint in metres. Falls back to a per-kind default in the
	// renderer when omitted, preserving today's gate=12/beacon=6/drop=4/boss=14.
	scaleM?: number;
	// Optional colour tint (hex, e.g. 0x40_20_60) applied to the loaded meshes'
	// materials - used to darken shadow sentinels. The renderer clones materials
	// before tinting so the shared GLTF cache is never mutated.
	tintHex?: number;
	// Optional fixed yaw (radians) applied to the loaded model. Omit to keep the
	// model's authored orientation.
	yawRad?: number;
}

type SpecProvider = (state: GameState) => WorldEntitySpec[];

// Module-level registry. A Set of the provider functions guards against
// duplicate registration: React StrictMode double-mounts and Fast Refresh can
// import a provider's module twice, and we must not run it twice per sync.
const providers: SpecProvider[] = [];
const registered = new Set<SpecProvider>();

// Register a spec provider. Idempotent per function identity, so a module's
// top-level registration is safe under StrictMode/Fast Refresh.
export function registerSpecProvider(fn: SpecProvider): void {
	if (registered.has(fn)) {
		return;
	}
	registered.add(fn);
	providers.push(fn);
}

// Concatenate every registered provider's specs for this frame. Each provider is
// wrapped in try/catch so one throwing provider can't blank the whole scene; it
// just contributes no specs that frame.
export function collectAll(state: GameState): WorldEntitySpec[] {
	const specs: WorldEntitySpec[] = [];
	for (const provider of providers) {
		try {
			const provided = provider(state);
			for (const spec of provided) {
				specs.push(spec);
			}
		} catch {
			// A misbehaving provider must not break the render frame.
		}
	}
	return specs;
}

// Clear all registered providers. For test/teardown safety only.
export function clearSpecProviders(): void {
	providers.length = 0;
	registered.clear();
}
