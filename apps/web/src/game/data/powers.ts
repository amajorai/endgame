// Power and skill-tree data for the powers-progression system. Pure data, no
// logic. PowerIds mirror the frozen `PowerId` union in @/game/types so the
// progression reducer and character panel stay type-safe.

import type { PowerId } from "@/game/types";

export type PowerRole = "tank" | "dps" | "support";

export interface SkillNode {
	cost: number; // skillPoints to unlock
	desc: string;
	id: string;
	name: string;
}

export interface PowerDef {
	emoji: string;
	fantasy: string;
	id: PowerId;
	name: string;
	role: PowerRole;
	skills: SkillNode[];
}

// Universal skill tree available to every power. ~12 nodes spanning offense,
// defense, sustain, and utility. Ids are namespaced "u:" so they never collide
// with per-power skill ids.
export const UNIVERSAL_SKILLS: SkillNode[] = [
	{ id: "u:vigor", name: "Vigor", desc: "+10% max HP.", cost: 1 },
	{ id: "u:endurance", name: "Endurance", desc: "+10% max stamina.", cost: 1 },
	{ id: "u:focus", name: "Focus", desc: "+10% max combat mana.", cost: 1 },
	{
		id: "u:swiftness",
		name: "Swiftness",
		desc: "Move and dodge faster in gates.",
		cost: 1,
	},
	{
		id: "u:keen_eye",
		name: "Keen Eye",
		desc: "Reveal enemy weak points sooner.",
		cost: 1,
	},
	{
		id: "u:second_wind",
		name: "Second Wind",
		desc: "Recover HP between waves.",
		cost: 2,
	},
	{
		id: "u:mana_font",
		name: "Mana Font",
		desc: "Regenerate combat mana over time.",
		cost: 2,
	},
	{
		id: "u:hardened",
		name: "Hardened",
		desc: "Reduce incoming damage by 8%.",
		cost: 2,
	},
	{
		id: "u:scavenger",
		name: "Scavenger",
		desc: "Gates drop extra materials.",
		cost: 2,
	},
	{
		id: "u:tactician",
		name: "Tactician",
		desc: "Start gate runs with a free potion.",
		cost: 3,
	},
	{
		id: "u:overcharge",
		name: "Overcharge",
		desc: "+12% damage at full mana.",
		cost: 3,
	},
	{
		id: "u:ascendant",
		name: "Ascendant",
		desc: "+1 star ceiling on cleared gates.",
		cost: 4,
	},
];

// Per-power skill trees. ~6 nodes each. Ids namespaced by power id.
export const POWERS: PowerDef[] = [
	{
		id: "bulwark",
		name: "Bulwark",
		role: "tank",
		emoji: "🛡️",
		fantasy: "An immovable wall that soaks every blow and protects the line.",
		skills: [
			{
				id: "bulwark:tower",
				name: "Tower Stance",
				desc: "Plant your feet to halve knockback.",
				cost: 1,
			},
			{
				id: "bulwark:bash",
				name: "Shield Bash",
				desc: "Stun the front enemy.",
				cost: 1,
			},
			{
				id: "bulwark:taunt",
				name: "Taunt",
				desc: "Force elites to target you.",
				cost: 2,
			},
			{
				id: "bulwark:bulwark",
				name: "Aegis",
				desc: "Project a damage-absorbing barrier.",
				cost: 2,
			},
			{
				id: "bulwark:reflect",
				name: "Riposte",
				desc: "Reflect a share of blocked damage.",
				cost: 3,
			},
			{
				id: "bulwark:fortress",
				name: "Living Fortress",
				desc: "Become immune for three seconds.",
				cost: 4,
			},
		],
	},
	{
		id: "sentinel",
		name: "Sentinel",
		role: "tank",
		emoji: "⚜️",
		fantasy: "A vigilant guardian who controls space and punishes intruders.",
		skills: [
			{
				id: "sentinel:ward",
				name: "Ward Field",
				desc: "Slow enemies in a radius.",
				cost: 1,
			},
			{
				id: "sentinel:chain",
				name: "Chain Pull",
				desc: "Yank a distant enemy to you.",
				cost: 1,
			},
			{
				id: "sentinel:bastion",
				name: "Bastion",
				desc: "Gain armor as enemies approach.",
				cost: 2,
			},
			{
				id: "sentinel:retort",
				name: "Retort",
				desc: "Counter the next hit automatically.",
				cost: 2,
			},
			{
				id: "sentinel:lockdown",
				name: "Lockdown",
				desc: "Root every enemy briefly.",
				cost: 3,
			},
			{
				id: "sentinel:warden",
				name: "Eternal Warden",
				desc: "Revive once per gate at half HP.",
				cost: 4,
			},
		],
	},
	{
		id: "striker",
		name: "Striker",
		role: "dps",
		emoji: "⚔️",
		fantasy:
			"A relentless melee blade that trades blows and wins the exchange.",
		skills: [
			{
				id: "striker:cleave",
				name: "Cleave",
				desc: "Hit two enemies at once.",
				cost: 1,
			},
			{
				id: "striker:rush",
				name: "Rush",
				desc: "Dash through the front line.",
				cost: 1,
			},
			{
				id: "striker:bleed",
				name: "Rend",
				desc: "Apply a bleeding wound.",
				cost: 2,
			},
			{
				id: "striker:combo",
				name: "Combo Flow",
				desc: "Chain hits build damage.",
				cost: 2,
			},
			{
				id: "striker:execute",
				name: "Execute",
				desc: "Finish low-HP enemies instantly.",
				cost: 3,
			},
			{
				id: "striker:bladestorm",
				name: "Bladestorm",
				desc: "Spin to strike all enemies.",
				cost: 4,
			},
		],
	},
	{
		id: "phantom",
		name: "Phantom",
		role: "dps",
		emoji: "🗡️",
		fantasy: "A shadow assassin who strikes from nowhere and vanishes.",
		skills: [
			{
				id: "phantom:cloak",
				name: "Cloak",
				desc: "Turn invisible for a beat.",
				cost: 1,
			},
			{
				id: "phantom:backstab",
				name: "Backstab",
				desc: "Triple damage from behind.",
				cost: 1,
			},
			{
				id: "phantom:smoke",
				name: "Smoke Veil",
				desc: "Blind nearby enemies.",
				cost: 2,
			},
			{
				id: "phantom:dagger",
				name: "Throwing Daggers",
				desc: "Fling a fan of blades.",
				cost: 2,
			},
			{
				id: "phantom:assassinate",
				name: "Assassinate",
				desc: "Mark and delete an elite.",
				cost: 3,
			},
			{
				id: "phantom:nightfall",
				name: "Nightfall",
				desc: "Become untargetable and lethal.",
				cost: 4,
			},
		],
	},
	{
		id: "pyromancer",
		name: "Pyromancer",
		role: "dps",
		emoji: "🔥",
		fantasy: "A caster who blankets the arena in cleansing fire.",
		skills: [
			{
				id: "pyromancer:spark",
				name: "Spark",
				desc: "Ignite the closest enemy.",
				cost: 1,
			},
			{
				id: "pyromancer:firebolt",
				name: "Firebolt",
				desc: "Lob a piercing bolt.",
				cost: 1,
			},
			{
				id: "pyromancer:wall",
				name: "Wall of Flame",
				desc: "Burn enemies crossing a line.",
				cost: 2,
			},
			{
				id: "pyromancer:combust",
				name: "Combust",
				desc: "Detonate burning enemies.",
				cost: 2,
			},
			{
				id: "pyromancer:meteor",
				name: "Meteor",
				desc: "Call down area devastation.",
				cost: 3,
			},
			{
				id: "pyromancer:inferno",
				name: "Inferno",
				desc: "Engulf the whole arena.",
				cost: 4,
			},
		],
	},
	{
		id: "marksman",
		name: "Marksman",
		role: "dps",
		emoji: "🏹",
		fantasy: "A precise ranged hunter who never misses the vital shot.",
		skills: [
			{
				id: "marksman:aim",
				name: "Steady Aim",
				desc: "Charge for a precise shot.",
				cost: 1,
			},
			{
				id: "marksman:multishot",
				name: "Multishot",
				desc: "Loose three arrows at once.",
				cost: 1,
			},
			{
				id: "marksman:pierce",
				name: "Piercing Shot",
				desc: "Arrows pass through enemies.",
				cost: 2,
			},
			{
				id: "marksman:trap",
				name: "Snare Trap",
				desc: "Lay a slowing trap.",
				cost: 2,
			},
			{
				id: "marksman:headshot",
				name: "Headshot",
				desc: "Critically wound on a weak point.",
				cost: 3,
			},
			{
				id: "marksman:volley",
				name: "Rain of Arrows",
				desc: "Saturate an area with arrows.",
				cost: 4,
			},
		],
	},
	{
		id: "mender",
		name: "Mender",
		role: "support",
		emoji: "✨",
		fantasy: "A healer whose light keeps the run alive against the odds.",
		skills: [
			{
				id: "mender:mend",
				name: "Mend",
				desc: "Restore a chunk of HP.",
				cost: 1,
			},
			{
				id: "mender:regen",
				name: "Renewal",
				desc: "Heal slowly over time.",
				cost: 1,
			},
			{
				id: "mender:shieldlight",
				name: "Lightward",
				desc: "Wrap yourself in a holy shield.",
				cost: 2,
			},
			{
				id: "mender:cleanse",
				name: "Cleanse",
				desc: "Purge burns and poisons.",
				cost: 2,
			},
			{
				id: "mender:revive",
				name: "Revive",
				desc: "Stand back up after a fall.",
				cost: 3,
			},
			{
				id: "mender:sanctuary",
				name: "Sanctuary",
				desc: "Bathe the arena in healing light.",
				cost: 4,
			},
		],
	},
	{
		id: "herald",
		name: "Herald",
		role: "support",
		emoji: "📯",
		fantasy: "A battle-bard whose anthems amplify every strike you land.",
		skills: [
			{
				id: "herald:anthem",
				name: "Anthem",
				desc: "Buff your damage with a song.",
				cost: 1,
			},
			{
				id: "herald:march",
				name: "War March",
				desc: "Move faster to the next wave.",
				cost: 1,
			},
			{
				id: "herald:rally",
				name: "Rally",
				desc: "Refill stamina on command.",
				cost: 2,
			},
			{
				id: "herald:dirge",
				name: "Dirge",
				desc: "Weaken enemy attacks.",
				cost: 2,
			},
			{
				id: "herald:crescendo",
				name: "Crescendo",
				desc: "Unleash a stored damage burst.",
				cost: 3,
			},
			{
				id: "herald:finale",
				name: "Grand Finale",
				desc: "Empower every stat at once.",
				cost: 4,
			},
		],
	},
	{
		id: "hex_witch",
		name: "Hex Witch",
		role: "support",
		emoji: "🔮",
		fantasy: "A curse-weaver who turns the enemy's strength against them.",
		skills: [
			{
				id: "hex_witch:hex",
				name: "Hex",
				desc: "Curse an enemy to take more damage.",
				cost: 1,
			},
			{
				id: "hex_witch:wither",
				name: "Wither",
				desc: "Sap an enemy's attack.",
				cost: 1,
			},
			{
				id: "hex_witch:bind",
				name: "Bind",
				desc: "Freeze a target in place.",
				cost: 2,
			},
			{
				id: "hex_witch:drain",
				name: "Life Drain",
				desc: "Steal HP from the cursed.",
				cost: 2,
			},
			{
				id: "hex_witch:doom",
				name: "Doom",
				desc: "Mark a foe for a delayed blast.",
				cost: 3,
			},
			{
				id: "hex_witch:coven",
				name: "Coven",
				desc: "Curse every enemy in the arena.",
				cost: 4,
			},
		],
	},
	{
		id: "vendor",
		name: "Vendor",
		role: "support",
		emoji: "🛒",
		fantasy: "A shrewd merchant who buys breathing room and sells pain.",
		skills: [
			{
				id: "vendor:haggle",
				name: "Haggle",
				desc: "Cheaper potions mid-run.",
				cost: 1,
			},
			{
				id: "vendor:stock",
				name: "Restock",
				desc: "Carry an extra potion.",
				cost: 1,
			},
			{
				id: "vendor:coin",
				name: "Coin Toss",
				desc: "Fling coins to stagger enemies.",
				cost: 2,
			},
			{
				id: "vendor:appraise",
				name: "Appraise",
				desc: "Spot the richest enemy to drop loot.",
				cost: 2,
			},
			{
				id: "vendor:bargain",
				name: "Hard Bargain",
				desc: "Trade HP for a burst of damage.",
				cost: 3,
			},
			{
				id: "vendor:monopoly",
				name: "Monopoly",
				desc: "Double material drops this run.",
				cost: 4,
			},
		],
	},
	{
		id: "commuter",
		name: "Commuter",
		role: "dps",
		emoji: "🚆",
		fantasy: "A rush-hour veteran who weaponizes momentum and timing.",
		skills: [
			{
				id: "commuter:dash",
				name: "Platform Dash",
				desc: "Sprint through a gap.",
				cost: 1,
			},
			{
				id: "commuter:shove",
				name: "Crowd Shove",
				desc: "Push back a cluster of enemies.",
				cost: 1,
			},
			{
				id: "commuter:transfer",
				name: "Transfer",
				desc: "Swap places with a far enemy.",
				cost: 2,
			},
			{
				id: "commuter:schedule",
				name: "On Schedule",
				desc: "Cooldowns refresh faster.",
				cost: 2,
			},
			{
				id: "commuter:express",
				name: "Express Line",
				desc: "Skip ahead a wave once.",
				cost: 3,
			},
			{
				id: "commuter:rushhour",
				name: "Rush Hour",
				desc: "Trample the entire arena.",
				cost: 4,
			},
		],
	},
	{
		id: "hawker",
		name: "Hawker",
		role: "support",
		emoji: "🍜",
		fantasy: "A street-food maestro who heals with a perfect hot meal.",
		skills: [
			{
				id: "hawker:serve",
				name: "Hot Plate",
				desc: "Serve a quick healing dish.",
				cost: 1,
			},
			{
				id: "hawker:spice",
				name: "Extra Spicy",
				desc: "Spice up your next attack.",
				cost: 1,
			},
			{
				id: "hawker:broth",
				name: "Slow Broth",
				desc: "Heal steadily over the wave.",
				cost: 2,
			},
			{
				id: "hawker:wok",
				name: "Wok Hei",
				desc: "Sear enemies in a flaming arc.",
				cost: 2,
			},
			{
				id: "hawker:feast",
				name: "Feast",
				desc: "Full heal and a stamina refill.",
				cost: 3,
			},
			{
				id: "hawker:michelin",
				name: "Michelin Star",
				desc: "Buff every stat with a legendary dish.",
				cost: 4,
			},
		],
	},
	{
		id: "auntie",
		name: "Auntie",
		role: "tank",
		emoji: "👜",
		fantasy: "A fearless matriarch whose handbag stops armies cold.",
		skills: [
			{
				id: "auntie:swing",
				name: "Handbag Swing",
				desc: "Knock back the front enemy.",
				cost: 1,
			},
			{
				id: "auntie:scold",
				name: "Scolding",
				desc: "Make enemies hesitate.",
				cost: 1,
			},
			{
				id: "auntie:queue",
				name: "Queue Discipline",
				desc: "Line enemies up to be hit.",
				cost: 2,
			},
			{
				id: "auntie:tissue",
				name: "Reserved Seat",
				desc: "Claim a safe zone of no damage.",
				cost: 2,
			},
			{
				id: "auntie:discount",
				name: "Senior Discount",
				desc: "Take far less damage.",
				cost: 3,
			},
			{
				id: "auntie:matriarch",
				name: "Matriarch",
				desc: "Command the arena; enemies flee.",
				cost: 4,
			},
		],
	},
	{
		id: "office_worker",
		name: "Office Worker",
		role: "support",
		emoji: "💼",
		fantasy: "A burnt-out salaryman who turns deadlines into devastation.",
		skills: [
			{
				id: "office_worker:email",
				name: "Cold Email",
				desc: "Snipe a single distant enemy.",
				cost: 1,
			},
			{
				id: "office_worker:meeting",
				name: "Stand-up",
				desc: "Stall enemies in a meeting.",
				cost: 1,
			},
			{
				id: "office_worker:overtime",
				name: "Overtime",
				desc: "Push past exhaustion for power.",
				cost: 2,
			},
			{
				id: "office_worker:spreadsheet",
				name: "Spreadsheet",
				desc: "Track and exploit weak points.",
				cost: 2,
			},
			{
				id: "office_worker:deadline",
				name: "Deadline",
				desc: "Burst damage as time runs low.",
				cost: 3,
			},
			{
				id: "office_worker:promotion",
				name: "Promotion",
				desc: "Permanently raise your output.",
				cost: 4,
			},
		],
	},
	{
		id: "rider",
		name: "Rider",
		role: "dps",
		emoji: "🛵",
		fantasy: "A delivery rider who carves the arena at full throttle.",
		skills: [
			{
				id: "rider:throttle",
				name: "Throttle",
				desc: "Accelerate into a charge.",
				cost: 1,
			},
			{
				id: "rider:drift",
				name: "Drift",
				desc: "Slide around an attack.",
				cost: 1,
			},
			{
				id: "rider:deliver",
				name: "Express Delivery",
				desc: "Dash-strike a far enemy.",
				cost: 2,
			},
			{
				id: "rider:honk",
				name: "Horn Blast",
				desc: "Stun a cluster with a blare.",
				cost: 2,
			},
			{
				id: "rider:wheelie",
				name: "Wheelie",
				desc: "Plow through the front line.",
				cost: 3,
			},
			{
				id: "rider:redline",
				name: "Redline",
				desc: "Max throttle; shred everything.",
				cost: 4,
			},
		],
	},
];

// Fast lookup by id.
export const POWER_BY_ID: Record<PowerId, PowerDef> = POWERS.reduce(
	(acc, power) => {
		acc[power.id] = power;
		return acc;
	},
	{} as Record<PowerId, PowerDef>
);

// Every skill id that exists (universal + all power trees), for validation.
export const ALL_SKILL_IDS: Set<string> = new Set([
	...UNIVERSAL_SKILLS.map((node) => node.id),
	...POWERS.flatMap((power) => power.skills.map((node) => node.id)),
]);

// Cost lookup keyed by skill id.
export const SKILL_COST_BY_ID: Record<string, number> = (() => {
	const map: Record<string, number> = {};
	for (const node of UNIVERSAL_SKILLS) {
		map[node.id] = node.cost;
	}
	for (const power of POWERS) {
		for (const node of power.skills) {
			map[node.id] = node.cost;
		}
	}
	return map;
})();
