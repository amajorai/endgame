"use client";

import { Button } from "@endgame/ui/components/button";
import {
	EQUIPMENT_BONUS,
	POTION_EFFECTS,
	type PotionEffect,
	RARITY_BORDER,
	RARITY_COLOR,
	RECIPES,
	type Recipe,
} from "@/game/data/recipes";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	canCraft,
	EQUIPPED_MARKER_ID,
	equippedItemId,
} from "@/game/systems/inventory";
import type { GameState, InventoryItem } from "@/game/types";

const MATERIAL_GLYPHS: Record<string, string> = {
	herb: "🌿",
	ore: "⛏️",
	essence: "✨",
	cloth: "🧵",
	crystal: "💎",
	trade_bundle: "📦",
};

const KIND_GLYPH: Record<string, string> = {
	potion: "🧪",
	equipment: "⚔️",
	cosmetic: "🎭",
	material: "📦",
};

const rarityColor = (rarity: string): string =>
	RARITY_COLOR[rarity] ?? "text-slate-300";

const rarityBorder = (rarity: string): string =>
	RARITY_BORDER[rarity] ?? "border-slate-500/40";

function describePotion(effect: PotionEffect): string {
	const parts: string[] = [];
	if (effect.hp) {
		parts.push(`+${effect.hp} HP`);
	}
	if (effect.stamina) {
		parts.push(`+${effect.stamina} STA`);
	}
	if (effect.combatMana) {
		parts.push(`+${effect.combatMana} MP`);
	}
	return parts.join(" · ");
}

function itemsOfKind(
	items: Record<string, InventoryItem>,
	kind: string
): InventoryItem[] {
	const out: InventoryItem[] = [];
	for (const item of Object.values(items)) {
		if (item.id === EQUIPPED_MARKER_ID) {
			continue;
		}
		if (item.kind === kind && item.qty > 0) {
			out.push(item);
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function materialEntries(
	materials: Record<string, number>
): [string, number][] {
	return Object.entries(materials)
		.filter(([, qty]) => qty > 0)
		.sort((a, b) => a[0].localeCompare(b[0]));
}

function SectionHeader(props: {
	glyph: string;
	title: string;
	count: number;
}): React.JSX.Element {
	return (
		<div className="mb-2 flex items-center gap-2">
			<span aria-hidden="true" className="text-base">
				{props.glyph}
			</span>
			<h3 className="font-semibold text-cyan-100 text-sm uppercase tracking-wide">
				{props.title}
			</h3>
			<span className="text-[11px] text-slate-500">({props.count})</span>
		</div>
	);
}

function MaterialsSection(props: {
	materials: Record<string, number>;
}): React.JSX.Element {
	const entries = materialEntries(props.materials);
	return (
		<section>
			<SectionHeader count={entries.length} glyph="🧱" title="Materials" />
			{entries.length === 0 ? (
				<p className="text-[11px] text-slate-500">
					No raw materials yet. Harvest the world to gather them.
				</p>
			) : (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{entries.map(([key, qty]) => (
						<div
							className="flex items-center gap-2 rounded-xl border border-slate-600/40 bg-slate-900/60 px-3 py-2"
							key={key}
						>
							<span aria-hidden="true" className="text-lg">
								{MATERIAL_GLYPHS[key] ?? "🔹"}
							</span>
							<div className="min-w-0">
								<div className="truncate text-slate-200 text-xs capitalize">
									{key.replace(/_/g, " ")}
								</div>
								<div className="text-[11px] text-cyan-300 tabular-nums">
									×{qty}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function PotionsSection(props: {
	items: InventoryItem[];
	onUse: (id: string) => void;
	onDrop: (id: string) => void;
}): React.JSX.Element {
	return (
		<section>
			<SectionHeader count={props.items.length} glyph="🧪" title="Potions" />
			{props.items.length === 0 ? (
				<p className="text-[11px] text-slate-500">
					Craft potions below to heal outside of gates.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{props.items.map((item) => {
						const effect = POTION_EFFECTS[item.id];
						return (
							<div
								className={`flex items-center gap-2 rounded-xl border bg-slate-900/60 px-3 py-2 ${rarityBorder(
									item.rarity
								)}`}
								key={item.id}
							>
								<span aria-hidden="true" className="text-lg">
									🧪
								</span>
								<div className="min-w-0 flex-1">
									<div
										className={`truncate text-xs ${rarityColor(item.rarity)}`}
									>
										{item.name}{" "}
										<span className="text-slate-500 tabular-nums">
											×{item.qty}
										</span>
									</div>
									{effect ? (
										<div className="text-[11px] text-emerald-300/80">
											{describePotion(effect)}
										</div>
									) : null}
								</div>
								<Button
									className="h-7 rounded-full border-cyan-400/40 bg-slate-950/60 px-3 text-cyan-200 text-xs"
									onClick={() => props.onUse(item.id)}
									size="sm"
									type="button"
									variant="outline"
								>
									Use
								</Button>
								<Button
									className="h-7 rounded-full border-rose-400/40 bg-slate-950/60 px-2 text-rose-200 text-xs"
									onClick={() => props.onDrop(item.id)}
									size="sm"
									type="button"
									variant="outline"
								>
									Drop
								</Button>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

function EquipmentSection(props: {
	items: InventoryItem[];
	equippedId: string | null;
	onEquip: (id: string) => void;
	onDrop: (id: string) => void;
}): React.JSX.Element {
	return (
		<section>
			<SectionHeader count={props.items.length} glyph="⚔️" title="Equipment" />
			{props.items.length === 0 ? (
				<p className="text-[11px] text-slate-500">
					Forge gear below to boost your stats.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{props.items.map((item) => {
						const equipped = props.equippedId === item.id;
						return (
							<div
								className={`flex items-center gap-2 rounded-xl border bg-slate-900/60 px-3 py-2 ${
									equipped
										? "border-cyan-400/70 ring-1 ring-cyan-400/40"
										: rarityBorder(item.rarity)
								}`}
								key={item.id}
							>
								<span aria-hidden="true" className="text-lg">
									⚔️
								</span>
								<div className="min-w-0 flex-1">
									<div
										className={`truncate text-xs ${rarityColor(item.rarity)}`}
									>
										{item.name}{" "}
										<span className="text-slate-500 tabular-nums">
											×{item.qty}
										</span>
									</div>
									<div className="text-[11px] text-amber-300/80">
										{EQUIPMENT_BONUS[item.id] ?? "gear"}
										{equipped ? " · equipped" : ""}
									</div>
								</div>
								<Button
									className={`h-7 rounded-full px-3 text-xs ${
										equipped
											? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
											: "border-cyan-400/40 bg-slate-950/60 text-cyan-200"
									}`}
									onClick={() => props.onEquip(item.id)}
									size="sm"
									type="button"
									variant="outline"
								>
									{equipped ? "Unequip" : "Equip"}
								</Button>
								<Button
									className="h-7 rounded-full border-rose-400/40 bg-slate-950/60 px-2 text-rose-200 text-xs"
									onClick={() => props.onDrop(item.id)}
									size="sm"
									type="button"
									variant="outline"
								>
									Drop
								</Button>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

function CosmeticsSection(props: {
	items: InventoryItem[];
	onDrop: (id: string) => void;
}): React.JSX.Element | null {
	if (props.items.length === 0) {
		return null;
	}
	return (
		<section>
			<SectionHeader count={props.items.length} glyph="🎭" title="Cosmetics" />
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{props.items.map((item) => (
					<div
						className={`flex items-center gap-2 rounded-xl border bg-slate-900/60 px-3 py-2 ${rarityBorder(
							item.rarity
						)}`}
						key={item.id}
					>
						<span aria-hidden="true" className="text-lg">
							🎭
						</span>
						<div className="min-w-0 flex-1">
							<div className={`truncate text-xs ${rarityColor(item.rarity)}`}>
								{item.name}
							</div>
							<div className="text-[11px] text-slate-500 tabular-nums">
								×{item.qty}
							</div>
						</div>
						<Button
							className="h-7 rounded-full border-rose-400/40 bg-slate-950/60 px-2 text-rose-200 text-xs"
							onClick={() => props.onDrop(item.id)}
							size="sm"
							type="button"
							variant="outline"
						>
							Drop
						</Button>
					</div>
				))}
			</div>
		</section>
	);
}

function CraftRow(props: {
	recipe: Recipe;
	state: GameState;
	onCraft: (recipeId: string) => void;
}): React.JSX.Element {
	const { recipe, state } = props;
	const affordable = canCraft(state, recipe.id);
	return (
		<div
			className={`rounded-xl border bg-slate-900/60 px-3 py-2 ${rarityBorder(
				recipe.output.rarity
			)}`}
		>
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className="text-lg">
					{KIND_GLYPH[recipe.output.kind] ?? "🔧"}
				</span>
				<div className="min-w-0 flex-1">
					<div className={`text-xs ${rarityColor(recipe.output.rarity)}`}>
						{recipe.name}
					</div>
					<div className="text-[11px] text-slate-400">{recipe.description}</div>
				</div>
				<Button
					className="h-7 rounded-full border-cyan-400/40 bg-slate-950/60 px-3 text-cyan-200 text-xs disabled:opacity-40"
					disabled={!affordable}
					onClick={() => props.onCraft(recipe.id)}
					size="sm"
					type="button"
					variant="outline"
				>
					Craft
				</Button>
			</div>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{recipe.costs.map((cost) => {
					const owned =
						cost.source === "material"
							? (state.resources.materials[cost.key] ?? 0)
							: (state.inventory.items[cost.key]?.qty ?? 0);
					const enough = owned >= cost.qty;
					return (
						<span
							className={`rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums ${
								enough
									? "border-emerald-400/30 text-emerald-300/90"
									: "border-rose-400/30 text-rose-300/90"
							}`}
							key={`${recipe.id}:${cost.key}`}
						>
							{MATERIAL_GLYPHS[cost.key] ?? "🔹"} {cost.key.replace(/_/g, " ")}{" "}
							{owned}/{cost.qty}
						</span>
					);
				})}
			</div>
		</div>
	);
}

export default function InventoryPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();

	const items = state.inventory.items;
	const potions = itemsOfKind(items, "potion");
	const equipment = itemsOfKind(items, "equipment");
	const cosmetics = itemsOfKind(items, "cosmetic");
	const equippedId = equippedItemId(state);

	const onUse = (id: string): void => {
		dispatch({ type: "ITEM_USE", id });
	};
	const onCraft = (recipeId: string): void => {
		dispatch({ type: "ITEM_CRAFT", recipeId });
	};
	const onEquip = (id: string): void => {
		dispatch({ type: "ITEM_EQUIP", id });
	};
	const onDrop = (id: string): void => {
		dispatch({ type: "ITEM_DROP", id });
	};

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 backdrop-blur-md">
			<header>
				<h2 className="font-bold text-cyan-100 text-lg">Inventory</h2>
				<p className="text-[11px] text-slate-400">
					Use potions, forge gear, and refine your spoils.
				</p>
			</header>

			<MaterialsSection materials={state.resources.materials} />
			<PotionsSection items={potions} onDrop={onDrop} onUse={onUse} />
			<EquipmentSection
				equippedId={equippedId}
				items={equipment}
				onDrop={onDrop}
				onEquip={onEquip}
			/>
			<CosmeticsSection items={cosmetics} onDrop={onDrop} />

			<section>
				<SectionHeader count={RECIPES.length} glyph="🛠️" title="Crafting" />
				<div className="flex flex-col gap-2">
					{RECIPES.map((recipe) => (
						<CraftRow
							key={recipe.id}
							onCraft={onCraft}
							recipe={recipe}
							state={state}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
