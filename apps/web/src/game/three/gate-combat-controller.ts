import type maplibregl from "maplibre-gl";
import { METERS_PER_DEGREE_LAT } from "@/game/constants";
import {
	BuildingObstacles,
	type ChaseParams,
	chaseStep,
} from "@/game/three/nav";
import type { GameEvent, GameState } from "@/game/types";

// Real-time on-map controller for an active gate run's enemies. Mirrors
// BossController: each frame it steers every living enemy's live lng/lat toward
// the player using the shared nav helpers (real building-footprint avoidance),
// and on a throttle dispatches the new positions back into the store so the
// renderer's spec provider re-emits the skeleton models at fresh coordinates.
//
// SOURCE OF TRUTH / BALANCE CONTRACT
// ----------------------------------
// The store stays authoritative for HP, waves, mana, stamina, and timers. This
// controller owns ONLY live enemy positions + an attack-animation cadence. It
// NEVER dispatches a damage event: player HP loss is applied solely by the spine
// TICK inside the gate-combat reducer (which integrates every living enemy's DPS
// over elapsed time). Proximity "attacks" here are cosmetic cadence; a new
// per-hit damage event would double-count and break star/par balance, so we keep
// the DPS integration as the single damage authority.
//
// POSITION SINGLETON CONTRACT (read by gate-combat-specs.ts)
// ----------------------------------------------------------
// `enemyPositions` is a module singleton mapping enemyId -> {lat,lng} for the
// CURRENT run. The spec provider reads it first (so models track between the
// throttled writeback dispatches) and falls back to the enemy's stored lat/lng.
// The controller clears it whenever no run is active so stale/dead enemies stop
// rendering.

export const enemyPositions = new Map<string, { lat: number; lng: number }>();

// Per-enemy chase tuning. Enemies are a touch slower than the field boss so a
// formation reads as a closing swarm the player can kite, not an instant gank.
const ENEMY_SPEED_MPS = 6.5;
const ENGAGE_RANGE_M = 4; // within this, the enemy is "in melee" (cadence only)
const ATTACK_INTERVAL_MS = 1200;
const REPATH_PROBE_M = 5;
const AVOID_TURN_DEG = 35;
const BUILDING_REFRESH_MS = 1500;
// How often live positions MAY be written back into the store. Frame-rate
// independent and coarse enough to avoid per-frame dispatch churn while still
// re-emitting specs often enough that the models track smoothly.
//
// NOTE (persistence cost): every store dispatch persists a full snapshot to
// IndexedDB, so the writeback is the one thing in this controller on the
// per-frame path's cost budget. We keep the rate modest AND movement-gate it
// (below) so a settled / in-melee formation stops dispatching entirely. The
// proper fix is architectural and is called out in the integration handoff:
// have EntityRenderer.syncPositions read the `enemyPositions` singleton for
// `gate-enemy:` keys (mirroring its `boss:` branch + setBossPositionProvider).
// That decouples model motion from dispatch, letting this rate drop far lower
// since the writeback would then only feed the reducer's nearest-target math.
const WRITEBACK_INTERVAL_MS = 150;
// Minimum east/north movement (metres) by any single enemy since the last
// writeback before we dispatch again. Below this the formation reads as static,
// so a dispatch (and its full-state persist) would be wasted.
const WRITEBACK_MIN_MOVE_M = 0.5;
const DEG = Math.PI / 180;

const ENEMY_CHASE: ChaseParams = {
	speedMps: ENEMY_SPEED_MPS,
	probeM: REPATH_PROBE_M,
	avoidTurnDeg: AVOID_TURN_DEG,
};

export interface GateCombatDeps {
	dispatch: (event: GameEvent) => void;
	getPlayer: () => { lat: number; lng: number };
	getState: () => GameState;
	map: maplibregl.Map;
}

interface LivePos {
	lastAttack: number;
	lat: number;
	lng: number;
	// The lat/lng most recently folded into the store, so the writeback can skip
	// when an enemy has not moved meaningfully since.
	wroteLat: number;
	wroteLng: number;
}

// Straight-line metres an enemy has moved since its last writeback. Uses the
// same flat-earth lat/lng-to-metres scaling as nav.ts so the gate matches the
// movement that actually happened.
function metresMoved(pos: LivePos): number {
	const dNorth = (pos.lat - pos.wroteLat) * METERS_PER_DEGREE_LAT;
	const lngScale = METERS_PER_DEGREE_LAT * Math.cos(pos.lat * DEG);
	const dEast = (pos.lng - pos.wroteLng) * lngScale;
	return Math.hypot(dEast, dNorth);
}

export class GateCombatController {
	private readonly deps: GateCombatDeps;
	private readonly buildings: BuildingObstacles;
	// Live per-enemy state keyed by enemy id, for the CURRENT run only.
	private readonly live = new Map<string, LivePos>();
	// Identity of the run whose enemies `live` currently tracks. A change (new
	// gate, or a wave swap that replaces the enemy id set) reseeds positions.
	private runKey = "";
	private lastWriteback = 0;

	constructor(deps: GateCombatDeps) {
		this.deps = deps;
		this.buildings = new BuildingObstacles(deps.map, BUILDING_REFRESH_MS);
	}

	// Advance every living enemy one frame.
	update(dt: number, timeMs: number): void {
		const run = this.deps.getState().activeGate;
		if (!run || run.status !== "active") {
			this.reset();
			return;
		}

		// Reseed live positions when the run identity or the enemy id set changes
		// (new run, or a fresh wave). The key folds the gate, wave, and a join of
		// the enemy ids so a wave swap (same gate, new ids) reseeds too.
		const key = `${run.gateHex}:${run.wave}:${run.enemies.map((e) => e.id).join(",")}`;
		if (key !== this.runKey) {
			this.runKey = key;
			this.seed(run.enemies);
		}

		this.buildings.refresh(timeMs);
		const player = this.deps.getPlayer();

		for (const enemy of run.enemies) {
			const pos = this.live.get(enemy.id);
			if (!pos || enemy.hp <= 0) {
				continue;
			}
			const next = chaseStep({
				fromLat: pos.lat,
				fromLng: pos.lng,
				targetLat: player.lat,
				targetLng: player.lng,
				dt,
				obstacles: this.buildings.rings,
				params: ENEMY_CHASE,
			});
			if (next.distance <= ENGAGE_RANGE_M) {
				// In melee: hold position and run the attack cadence (cosmetic; the
				// reducer's DPS integration applies the actual chip damage).
				this.attack(pos, timeMs);
				continue;
			}
			pos.lat = next.lat;
			pos.lng = next.lng;
		}

		this.publish();
		this.maybeWriteback(timeMs);
	}

	// Seed each enemy's live position from its stored lat/lng (placed by the
	// reducer around the run origin), falling back to the player's position if a
	// position is somehow missing.
	private seed(
		enemies: { id: string; lat?: number; lng?: number; hp: number }[]
	): void {
		const player = this.deps.getPlayer();
		// Drop any enemies that no longer exist in this wave.
		const ids = new Set(enemies.map((e) => e.id));
		for (const id of this.live.keys()) {
			if (!ids.has(id)) {
				this.live.delete(id);
			}
		}
		for (const enemy of enemies) {
			if (this.live.has(enemy.id)) {
				continue;
			}
			const lat = enemy.lat ?? player.lat;
			const lng = enemy.lng ?? player.lng;
			this.live.set(enemy.id, {
				lat,
				lng,
				lastAttack: 0,
				wroteLat: lat,
				wroteLng: lng,
			});
		}
	}

	private attack(pos: LivePos, timeMs: number): void {
		if (timeMs - pos.lastAttack < ATTACK_INTERVAL_MS) {
			return;
		}
		pos.lastAttack = timeMs;
		// Intentionally no dispatch: damage is owned by the spine TICK. This hook
		// exists so a future melee-swing animation can fire here without changing
		// balance.
	}

	// Mirror live positions into the shared singleton each frame so the spec
	// provider can read sub-writeback-interval positions for smooth model motion.
	private publish(): void {
		enemyPositions.clear();
		for (const [id, pos] of this.live) {
			enemyPositions.set(id, { lat: pos.lat, lng: pos.lng });
		}
	}

	// Throttled, movement-gated writeback: fold live positions into the store so
	// the renderer's state-driven sync() re-emits enemy specs at the new
	// coordinates. Dispatches (and so persists a snapshot) ONLY when at least one
	// enemy has moved past WRITEBACK_MIN_MOVE_M since the last writeback, so a
	// settled / in-melee formation stops churning the store entirely.
	private maybeWriteback(timeMs: number): void {
		if (timeMs - this.lastWriteback < WRITEBACK_INTERVAL_MS) {
			return;
		}
		const positions: { id: string; lat: number; lng: number }[] = [];
		let moved = false;
		for (const [id, pos] of this.live) {
			if (metresMoved(pos) >= WRITEBACK_MIN_MOVE_M) {
				moved = true;
			}
			positions.push({ id, lat: pos.lat, lng: pos.lng });
		}
		if (!moved || positions.length === 0) {
			return;
		}
		this.lastWriteback = timeMs;
		for (const pos of this.live.values()) {
			pos.wroteLat = pos.lat;
			pos.wroteLng = pos.lng;
		}
		this.deps.dispatch({ type: "GATE_ENEMY_MOVE", positions });
	}

	// Clear all live state + the singleton when no run is active.
	private reset(): void {
		if (this.runKey === "" && this.live.size === 0) {
			return;
		}
		this.runKey = "";
		this.live.clear();
		enemyPositions.clear();
	}
}
