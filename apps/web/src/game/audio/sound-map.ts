// Logical sound names mapped to asset paths. A value is either a single file or
// a pool of variants; pools are picked at random per play so repeated actions
// (footsteps, attacks, UI clicks) don't sound mechanical. Every path here is
// asserted to exist on disk by sound-map.test.ts, so a typo fails CI rather than
// 404-ing silently at runtime.

const BASE = "/assets/sounds";

// Each logical sound resolves to one or more files under public/assets/sounds.
export const SOUNDS = {
	// --- UI ---------------------------------------------------------------
	ui_click: `${BASE}/ui/click_double_on.wav`,
	ui_click_off: `${BASE}/ui/click_double_off.wav`,
	ui_hover: `${BASE}/ui/sci_fi_hover.wav`,
	ui_open: `${BASE}/ui/sci_fi_select.wav`,
	ui_close: `${BASE}/ui/cancel.wav`,
	ui_confirm: `${BASE}/ui/sci_fi_confirm.wav`,
	ui_error: `${BASE}/ui/sci_fi_error.wav`,
	ui_toggle_on: `${BASE}/ui/toggle_on.wav`,
	ui_toggle_off: `${BASE}/ui/toggle_off.wav`,
	ui_select: [
		`${BASE}/ui/select_1.wav`,
		`${BASE}/ui/select_2.wav`,
		`${BASE}/ui/select_3.wav`,
		`${BASE}/ui/select_4.wav`,
	],
	ui_radial_open: `${BASE}/ui/sci_fi_select_big.wav`,

	// --- economy / pickups -------------------------------------------------
	collect_mana: `${BASE}/items/gem_collect.wav`,
	collect_coin: [
		`${BASE}/retro/coin.wav`,
		`${BASE}/retro/coin_2.wav`,
		`${BASE}/retro/coin_3.wav`,
		`${BASE}/retro/coin_4.wav`,
	],
	collect_supply: `${BASE}/items/coins_gather_medium.wav`,
	claim_progress: `${BASE}/musical/music_box_chime_quick.wav`,
	claim_complete: `${BASE}/musical/music_box_chime_positive.wav`,

	// --- progression -------------------------------------------------------
	gain_xp: `${BASE}/musical/vibraphone_chime_quick.wav`,
	level_up: `${BASE}/musical/music_box_level_complete.wav`,
	rank_up: `${BASE}/musical/music_box_positive_long.wav`,
	stat_allocate: `${BASE}/retro/power_up.wav`,
	skill_unlock: `${BASE}/retro/power_up_2.wav`,
	power_unlock: `${BASE}/retro/power_up.wav`,
	power_equip: `${BASE}/items/item_equip.wav`,
	respec: `${BASE}/retro/power_down.wav`,

	// --- combat ------------------------------------------------------------
	attack: [
		`${BASE}/combat/punch.wav`,
		`${BASE}/combat/punch_2.wav`,
		`${BASE}/combat/punch_3.wav`,
		`${BASE}/combat/slap.wav`,
		`${BASE}/combat/kick.wav`,
	],
	attack_skill: `${BASE}/weapons/sword_slice.wav`,
	dodge: [`${BASE}/other/whoosh_1.wav`, `${BASE}/other/whoosh_2.wav`],
	potion: `${BASE}/other/drink_slurp.wav`,
	enemy_defeat: [
		`${BASE}/combat/crunch_splat.wav`,
		`${BASE}/combat/crunch_splat_2.wav`,
		`${BASE}/combat/squelching_1.wav`,
	],

	// --- gates / bosses ----------------------------------------------------
	gate_enter: `${BASE}/other/whoosh_1.wav`,
	gate_exit: `${BASE}/environment/air_burst.wav`,
	boss_spawn: `${BASE}/musical/horror_sting.wav`,
	boss_engage: `${BASE}/musical/horror_sting.wav`,
	boss_defeat: `${BASE}/musical/music_box_level_complete.wav`,
	victory: `${BASE}/other/applause.wav`,
	defeat: `${BASE}/musical/music_box_defeated.wav`,

	// --- world interactions ------------------------------------------------
	chest_open: `${BASE}/environment/creaky_door_short.wav`,
	building_build: `${BASE}/machines/hydraulic_up.wav`,
	building_tap: `${BASE}/other/subtle_knock.wav`,
	beacon_claim: `${BASE}/musical/music_box_chime_positive.wav`,
	beacon_spin: `${BASE}/board/chips_gather.wav`,
	world_tap: `${BASE}/ui/pop_1.wav`,

	// --- items / crafting --------------------------------------------------
	item_craft: `${BASE}/weapons/weapon_upgrade.wav`,
	item_equip: `${BASE}/weapons/weapon_equip.wav`,
	item_drop: `${BASE}/weapons/weapon_drop.wav`,
	item_use: `${BASE}/items/page_turn.wav`,

	// --- farming -----------------------------------------------------------
	plant: `${BASE}/items/shovel_dig.wav`,
	harvest: `${BASE}/items/broom_sweep_1.wav`,

	// --- shadows / ghost ---------------------------------------------------
	shadow_extract: `${BASE}/other/ghost_long.wav`,
	shadow_summon: `${BASE}/retro/ghost.wav`,
	ghost_toggle: `${BASE}/retro/ghost.wav`,

	// --- quests ------------------------------------------------------------
	quest_progress: `${BASE}/musical/vibraphone_chime_quick.wav`,
	quest_claim: `${BASE}/musical/music_box_positive_long.wav`,
	quest_track: `${BASE}/ui/select_2.wav`,

	// --- player movement ---------------------------------------------------
	footstep: [
		`${BASE}/footsteps/digital/digital_footstep_grass_1.wav`,
		`${BASE}/footsteps/digital/digital_footstep_grass_2.wav`,
		`${BASE}/footsteps/digital/digital_footstep_grass_3.wav`,
		`${BASE}/footsteps/digital/digital_footstep_grass_4.wav`,
	],
	jump: `${BASE}/retro/jump.wav`,

	// --- onboarding --------------------------------------------------------
	onboard_complete: `${BASE}/musical/music_box_level_start.wav`,
} as const;

export type SoundName = keyof typeof SOUNDS;

// Music tracks loop through the music channel. Battle themes for combat, the
// wind ambience for the open world (the library ships no overworld theme).
export const MUSIC = {
	battle: `${BASE}/music/01. Battle Theme I (loop).mp3`,
	boss: `${BASE}/music/16. Battle Theme III (loop).mp3`,
	ambient: `${BASE}/environment/ambient_wind.wav`,
} as const;

export type MusicName = keyof typeof MUSIC;

// Flat list of every referenced path, for the existence test.
export function allSoundPaths(): string[] {
	const paths: string[] = [];
	for (const entry of Object.values(SOUNDS)) {
		const value: string | readonly string[] = entry;
		if (Array.isArray(value)) {
			paths.push(...(value as readonly string[]));
		} else {
			paths.push(value as string);
		}
	}
	for (const value of Object.values(MUSIC)) {
		paths.push(value);
	}
	return paths;
}
