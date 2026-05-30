// Static tables for the field-boss system. Pure data, no logic.

import type { GateTheme, Rank } from "@/game/types";

// Boss name fragments keyed by gate theme. Combined with a deterministic suffix
// so each rupture reads as a distinct named threat.
export const BOSS_NAME_BY_THEME: Record<GateTheme, string> = {
	nature: "Verdant Devourer",
	domestic: "Hollow Warden",
	knowledge: "Whispering Archivist",
	trial: "Gauntlet Tyrant",
	transit: "Rail Revenant",
	relic: "Sealed Colossus",
	sacred: "Fallen Seraph",
	abyss: "Abyssal Maw",
	liminal: "Threshold Horror",
};

// Theme glyphs for quick visual identity in the panel.
export const BOSS_GLYPH_BY_THEME: Record<GateTheme, string> = {
	nature: "🌿",
	domestic: "🏚️",
	knowledge: "📖",
	trial: "⚔️",
	transit: "🚇",
	relic: "🗿",
	sacred: "👁️",
	abyss: "🕳️",
	liminal: "🌀",
};

// Base max HP per rank. Scaled by phase count downstream.
export const BOSS_BASE_HP: Record<Rank, number> = {
	E: 240,
	D: 420,
	C: 700,
	B: 1100,
	A: 1700,
	S: 2600,
};

// Number of phases a boss fights through, per rank.
export const BOSS_PHASES: Record<Rank, number> = {
	E: 2,
	D: 2,
	C: 3,
	B: 3,
	A: 4,
	S: 5,
};

// Per-hit boss damage to the player (before mitigation), per rank.
export const BOSS_HIT_DAMAGE: Record<Rank, number> = {
	E: 6,
	D: 9,
	C: 13,
	B: 18,
	A: 24,
	S: 32,
};

// Rewards on defeat, per rank.
export const BOSS_REWARD_MANA: Record<Rank, number> = {
	E: 40,
	D: 80,
	C: 150,
	B: 260,
	A: 420,
	S: 700,
};

export const BOSS_REWARD_XP: Record<Rank, number> = {
	E: 60,
	D: 120,
	C: 220,
	B: 380,
	A: 600,
	S: 1000,
};

// Player attack actions. Each costs a resource and deals damage to the boss.
export interface BossSkill {
	damage: number;
	glyph: string;
	id: string;
	manaCost: number;
	name: string;
	staminaCost: number;
}

// Slot order matters: the panel renders skills by index, BOSS_SKILL {slot}.
export const BOSS_SKILLS: BossSkill[] = [
	{
		id: "strike",
		name: "Strike",
		glyph: "🗡️",
		manaCost: 0,
		staminaCost: 6,
		damage: 70,
	},
	{
		id: "cleave",
		name: "Cleave",
		glyph: "💥",
		manaCost: 10,
		staminaCost: 10,
		damage: 140,
	},
	{
		id: "nova",
		name: "Arcane Nova",
		glyph: "✨",
		manaCost: 30,
		staminaCost: 4,
		damage: 280,
	},
];
