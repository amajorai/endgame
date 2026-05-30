// biome-ignore-all lint/suspicious/noBitwiseOperators: PRNG and hashing require bitwise math by design.
import type { H3Index } from "@/game/types";

const UINT32 = 0x1_00_00_00_00;
const MULBERRY_INC = 0x6d_2b_79_f5;
const MIX_A = 0x85_eb_ca_6b;
const MIX_B = 0xc2_b2_ae_35;
const SHIFT_15 = 15;
const SHIFT_13 = 13;
const SHIFT_16 = 16;
const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;

// Seeded PRNG (mulberry32). Returns a generator yielding floats in [0, 1).
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + MULBERRY_INC) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> SHIFT_15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / UINT32;
	};
}

// Deterministic 32-bit hash of a string (FNV-1a + avalanche mix).
export function hashStringToInt(s: string): number {
	let h = FNV_OFFSET;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, FNV_PRIME);
	}
	h ^= h >>> SHIFT_16;
	h = Math.imul(h, MIX_A);
	h ^= h >>> SHIFT_13;
	h = Math.imul(h, MIX_B);
	h ^= h >>> SHIFT_16;
	return h >>> 0;
}

// Deterministic PRNG seeded from an H3 cell index.
export function seededFromHex(hex: H3Index): () => number {
	return mulberry32(hashStringToInt(hex));
}
