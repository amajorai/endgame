// Static balance tables and power/theme metadata for the gate-combat system.
// Pure data + pure helpers only. No state, no side effects.

import type { GateTheme, PowerId, Rank } from "@/game/types";

// Rank ordinal for scaling enemy stats and rewards.
export const RANK_ORDINAL: Record<Rank, number> = {
	E: 0,
	D: 1,
	C: 2,
	B: 3,
	A: 4,
	S: 5,
};

// Total waves in a run, including the final boss wave, keyed by rank.
export const WAVES_BY_RANK: Record<Rank, number> = {
	E: 3,
	D: 3,
	C: 4,
	B: 4,
	A: 5,
	S: 5,
};

// Number of non-boss enemies that spawn in a normal wave, by rank.
export const FODDER_PER_WAVE: Record<Rank, number> = {
	E: 2,
	D: 2,
	C: 3,
	B: 3,
	A: 4,
	S: 4,
};

// Base enemy hp per kind, scaled by rank ordinal at build time.
export const ENEMY_BASE_HP: Record<"fodder" | "elite" | "boss", number> = {
	fodder: 26,
	elite: 60,
	boss: 180,
};

// Additional hp added per rank ordinal, per kind.
export const ENEMY_HP_PER_RANK: Record<"fodder" | "elite" | "boss", number> = {
	fodder: 8,
	elite: 22,
	boss: 70,
};

// Per-second hp chip the whole enemy formation applies to the player, per kind.
// Tuned so a focused player wins within the 60-180s window without face-tanking.
export const ENEMY_DPS: Record<"fodder" | "elite" | "boss", number> = {
	fodder: 1.1,
	elite: 2.2,
	boss: 4,
};

// Par completion time (ms) for the under-par star, by rank.
const MS_PER_SECOND = 1000;
export const PAR_SECONDS_BY_RANK: Record<Rank, number> = {
	E: 70,
	D: 80,
	C: 95,
	B: 110,
	A: 130,
	S: 150,
};

export function parMsForRank(rank: Rank): number {
	return PAR_SECONDS_BY_RANK[rank] * MS_PER_SECOND;
}

// Each power has a preferred gate theme. Clearing a gate of that theme satisfies
// the "class challenge" star. Off-meta powers map to liminal/transit flavours.
export const POWER_THEME: Record<PowerId, GateTheme> = {
	bulwark: "sacred",
	sentinel: "trial",
	striker: "trial",
	phantom: "abyss",
	pyromancer: "relic",
	marksman: "nature",
	mender: "sacred",
	herald: "knowledge",
	hex_witch: "abyss",
	vendor: "domestic",
	commuter: "transit",
	hawker: "domestic",
	auntie: "domestic",
	office_worker: "knowledge",
	rider: "transit",
};

// Power combat profile: base flat damage, the stat that scales it, a scaling
// coefficient, and a skill cost/multiplier for the slotted special.
export interface PowerProfile {
	baseDamage: number;
	glyph: string;
	label: string;
	scaleCoeff: number;
	scaleStat: "str" | "agi" | "int" | "per";
	skillCost: number; // combat mana per skill cast
	skillMultiplier: number; // damage multiplier applied to a skill hit
	skillName: string;
}

const DEFAULT_PROFILE: PowerProfile = {
	baseDamage: 10,
	scaleStat: "str",
	scaleCoeff: 1.4,
	skillCost: 12,
	skillMultiplier: 2.6,
	skillName: "Power Strike",
	glyph: "⚔️",
	label: "Striker",
};

export const POWER_PROFILES: Record<PowerId, PowerProfile> = {
	striker: DEFAULT_PROFILE,
	bulwark: {
		baseDamage: 9,
		scaleStat: "str",
		scaleCoeff: 1.2,
		skillCost: 14,
		skillMultiplier: 2.2,
		skillName: "Shield Bash",
		glyph: "🛡️",
		label: "Bulwark",
	},
	sentinel: {
		baseDamage: 10,
		scaleStat: "per",
		scaleCoeff: 1.3,
		skillCost: 12,
		skillMultiplier: 2.4,
		skillName: "Vigil Slash",
		glyph: "🗡️",
		label: "Sentinel",
	},
	phantom: {
		baseDamage: 12,
		scaleStat: "agi",
		scaleCoeff: 1.6,
		skillCost: 10,
		skillMultiplier: 2.8,
		skillName: "Shadow Flurry",
		glyph: "🌑",
		label: "Phantom",
	},
	pyromancer: {
		baseDamage: 11,
		scaleStat: "int",
		scaleCoeff: 1.7,
		skillCost: 16,
		skillMultiplier: 3,
		skillName: "Cinder Burst",
		glyph: "🔥",
		label: "Pyromancer",
	},
	marksman: {
		baseDamage: 11,
		scaleStat: "per",
		scaleCoeff: 1.6,
		skillCost: 12,
		skillMultiplier: 2.9,
		skillName: "Piercing Shot",
		glyph: "🏹",
		label: "Marksman",
	},
	mender: {
		baseDamage: 8,
		scaleStat: "int",
		scaleCoeff: 1.2,
		skillCost: 14,
		skillMultiplier: 2,
		skillName: "Searing Light",
		glyph: "✨",
		label: "Mender",
	},
	herald: {
		baseDamage: 10,
		scaleStat: "int",
		scaleCoeff: 1.5,
		skillCost: 13,
		skillMultiplier: 2.5,
		skillName: "Sonic Decree",
		glyph: "📯",
		label: "Herald",
	},
	hex_witch: {
		baseDamage: 11,
		scaleStat: "int",
		scaleCoeff: 1.6,
		skillCost: 15,
		skillMultiplier: 2.7,
		skillName: "Curse Bolt",
		glyph: "🔮",
		label: "Hex Witch",
	},
	vendor: {
		baseDamage: 9,
		scaleStat: "per",
		scaleCoeff: 1.3,
		skillCost: 12,
		skillMultiplier: 2.3,
		skillName: "Hard Bargain",
		glyph: "🪙",
		label: "Vendor",
	},
	commuter: {
		baseDamage: 9,
		scaleStat: "agi",
		scaleCoeff: 1.4,
		skillCost: 11,
		skillMultiplier: 2.4,
		skillName: "Rush Hour",
		glyph: "🚆",
		label: "Commuter",
	},
	hawker: {
		baseDamage: 10,
		scaleStat: "str",
		scaleCoeff: 1.3,
		skillCost: 12,
		skillMultiplier: 2.4,
		skillName: "Wok Hei",
		glyph: "🍳",
		label: "Hawker",
	},
	auntie: {
		baseDamage: 9,
		scaleStat: "per",
		scaleCoeff: 1.3,
		skillCost: 12,
		skillMultiplier: 2.3,
		skillName: "Tissue Toss",
		glyph: "🧧",
		label: "Auntie",
	},
	office_worker: {
		baseDamage: 9,
		scaleStat: "int",
		scaleCoeff: 1.4,
		skillCost: 13,
		skillMultiplier: 2.4,
		skillName: "Deadline Crunch",
		glyph: "💼",
		label: "Office Worker",
	},
	rider: {
		baseDamage: 10,
		scaleStat: "agi",
		scaleCoeff: 1.5,
		skillCost: 11,
		skillMultiplier: 2.6,
		skillName: "Throttle Slam",
		glyph: "🛵",
		label: "Rider",
	},
};

export function profileFor(power: PowerId): PowerProfile {
	return POWER_PROFILES[power] ?? DEFAULT_PROFILE;
}

// Theme display metadata for the gate list and arena header.
export const THEME_META: Record<GateTheme, { glyph: string; label: string }> = {
	nature: { glyph: "🌿", label: "Nature" },
	domestic: { glyph: "🏠", label: "Domestic" },
	knowledge: { glyph: "📚", label: "Knowledge" },
	trial: { glyph: "⚔️", label: "Trial" },
	transit: { glyph: "🚇", label: "Transit" },
	relic: { glyph: "🏺", label: "Relic" },
	sacred: { glyph: "⛩️", label: "Sacred" },
	abyss: { glyph: "🕳️", label: "Abyss" },
	liminal: { glyph: "🌀", label: "Liminal" },
};

// Themed enemy name pools for flavour; chosen deterministically per enemy.
export const ENEMY_NAMES: Record<GateTheme, string[]> = {
	nature: ["Thornling", "Bramble Stalker", "Root Horror", "Verdant Maw"],
	domestic: ["Dust Wraith", "Broken Kettle", "Pantry Gremlin", "Mop Fiend"],
	knowledge: ["Ink Specter", "Marginalia", "Lost Footnote", "Tome Crawler"],
	trial: ["Trial Wisp", "Arena Husk", "Bladed Echo", "Proving Shade"],
	transit: ["Turnstile Imp", "Platform Lurker", "Late Train", "Fare Dodger"],
	relic: ["Shard Golem", "Cursed Idol", "Vault Sentry", "Gilded Husk"],
	sacred: ["Choir Wraith", "Censer Spirit", "Lapsed Acolyte", "Veil Warden"],
	abyss: ["Void Spawn", "Null Crawler", "Deep Whisper", "Abyssal Maw"],
	liminal: ["Threshold Echo", "Hall Phantom", "Doorway Shade", "Drift Wisp"],
};

// Boss name pools by theme.
export const BOSS_NAMES: Record<GateTheme, string> = {
	nature: "The Heartwood Tyrant",
	domestic: "The Hollow Matriarch",
	knowledge: "The Censor",
	trial: "The Champion of Ash",
	transit: "The Last Conductor",
	relic: "The Hoard-King",
	sacred: "The Fallen Cantor",
	abyss: "The Drowned Sovereign",
	liminal: "The Doorless Warden",
};
