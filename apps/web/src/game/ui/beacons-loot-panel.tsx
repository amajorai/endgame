"use client";

import { Button } from "@endgame/ui/components/button";
import { useMemo } from "react";
import { hexDistance } from "@/game/lib/hex";
import { useDispatch, useGameState } from "@/game/store/store";
import {
	chestExpiresInMs,
	previewBeaconLoot,
	shrineCooldownRemainingMs,
	summarizeLoot,
	supplyCountdownMs,
	supplyExpiresInMs,
} from "@/game/systems/beacons-loot";
import type { Beacon, BeaconTier, Chest, SupplyDrop } from "@/game/types";

const TIER_GLYPH: Record<BeaconTier, string> = {
	shrine: "⛩️",
	cache: "📦",
	raid: "⚔️",
	vault: "🏛️",
};

const TIER_LABEL: Record<BeaconTier, string> = {
	shrine: "Shrine",
	cache: "Cache",
	raid: "Raid Beacon",
	vault: "Vault",
};

const SUPPLY_GLYPH = "🪂";
const CHEST_GLYPH = "🎁";
const NEARBY_RING = 12;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

function formatDuration(ms: number): string {
	if (ms <= 0) {
		return "0s";
	}
	const totalSeconds = Math.ceil(ms / MS_PER_SECOND);
	const hours = Math.floor(
		totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)
	);
	const minutes = Math.floor(
		(totalSeconds % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) /
			SECONDS_PER_MINUTE
	);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

function safeDistance(a: string, b: string): number {
	try {
		return hexDistance(a, b);
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

interface BeaconRowProps {
	beacon: Beacon;
	distance: number;
	now: number;
	onClaim: (id: string) => void;
	onSpin: (id: string) => void;
}

function BeaconRow({
	beacon,
	distance,
	now,
	onSpin,
	onClaim,
}: BeaconRowProps): React.JSX.Element {
	const isShrine = beacon.tier === "shrine";
	const cooldownMs = isShrine
		? shrineCooldownRemainingMs(beacon.lastSpun, now)
		: 0;
	const onCooldown = cooldownMs > 0;
	const seedKey = isShrine
		? `${beacon.hex}:${Math.floor(now / (24 * 60 * 60 * MS_PER_SECOND))}`
		: `${beacon.id}:${beacon.hex}`;
	const preview = useMemo(
		() => previewBeaconLoot(beacon.tier, seedKey),
		[beacon.tier, seedKey]
	);

	return (
		<li className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-lg">
						{TIER_GLYPH[beacon.tier]}
					</span>
					<div>
						<div className="font-medium text-cyan-100 text-sm">
							{TIER_LABEL[beacon.tier]}
						</div>
						<div className="text-[11px] text-slate-400">
							{Number.isFinite(distance) ? `${distance} hexes away` : "nearby"}
						</div>
					</div>
				</div>
				{isShrine ? (
					<Button
						className="border-cyan-400/40 bg-slate-950/70 text-cyan-200"
						disabled={onCooldown}
						onClick={() => onSpin(beacon.id)}
						size="sm"
						type="button"
						variant="outline"
					>
						{onCooldown ? formatDuration(cooldownMs) : "Spin"}
					</Button>
				) : (
					<Button
						className="border-cyan-400/40 bg-slate-950/70 text-cyan-200"
						onClick={() => onClaim(beacon.id)}
						size="sm"
						type="button"
						variant="outline"
					>
						Claim
					</Button>
				)}
			</div>
			<div className="mt-2 text-[11px] text-cyan-300/70">
				Spoils: {summarizeLoot(preview)}
			</div>
		</li>
	);
}

interface SupplyRowProps {
	drop: SupplyDrop;
	now: number;
	onClaim: (id: string) => void;
}

function SupplyRow({ drop, now, onClaim }: SupplyRowProps): React.JSX.Element {
	const countdown = supplyCountdownMs(drop.landsAt, now);
	const landed = countdown <= 0;
	const expiresIn = supplyExpiresInMs(drop.landsAt, now);

	return (
		<li className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-lg">
						{SUPPLY_GLYPH}
					</span>
					<div>
						<div className="font-medium text-cyan-100 text-sm capitalize">
							{drop.tier} Supply
						</div>
						<div className="text-[11px] text-slate-400">
							{landed
								? `expires in ${formatDuration(expiresIn)}`
								: `lands in ${formatDuration(countdown)}`}
						</div>
					</div>
				</div>
				<Button
					className="border-cyan-400/40 bg-slate-950/70 text-cyan-200"
					disabled={!landed || drop.claimed}
					onClick={() => onClaim(drop.id)}
					size="sm"
					type="button"
					variant="outline"
				>
					{drop.claimed ? "Claimed" : "Claim"}
				</Button>
			</div>
		</li>
	);
}

interface ChestRowProps {
	chest: Chest;
	now: number;
	onOpen: (id: string) => void;
}

function ChestRow({ chest, now, onOpen }: ChestRowProps): React.JSX.Element {
	const expiresIn = chestExpiresInMs(chest.expiresAt, now);
	return (
		<li className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-lg">
						{CHEST_GLYPH}
					</span>
					<div>
						<div className="font-medium text-cyan-100 text-sm">
							Wandering Chest
						</div>
						<div className="text-[11px] text-slate-400">
							fades in {formatDuration(expiresIn)}
						</div>
					</div>
				</div>
				<Button
					className="border-cyan-400/40 bg-slate-950/70 text-cyan-200"
					disabled={chest.opened}
					onClick={() => onOpen(chest.id)}
					size="sm"
					type="button"
					variant="outline"
				>
					{chest.opened ? "Opened" : "Open"}
				</Button>
			</div>
		</li>
	);
}

function SectionHeading({ children }: { children: string }): React.JSX.Element {
	return (
		<h3 className="mt-4 mb-2 font-semibold text-cyan-200/80 text-xs uppercase tracking-wide">
			{children}
		</h3>
	);
}

const RECENT_LOOT_LIMIT = 6;

export default function BeaconsLootPanel(): React.JSX.Element {
	const state = useGameState();
	const dispatch = useDispatch();
	const now = state.lastTick;
	const playerHex = state.position.hex;

	const beacons = useMemo(() => {
		const list = Object.values(state.beacons).map((b) => ({
			beacon: b,
			distance: safeDistance(playerHex, b.hex),
		}));
		list.sort((a, z) => a.distance - z.distance);
		return list.filter((entry) => entry.distance <= NEARBY_RING);
	}, [state.beacons, playerHex]);

	const supplyDrops = useMemo(
		() => state.meta.supplyDrops.filter((d) => !d.claimed),
		[state.meta.supplyDrops]
	);

	const chests = useMemo(
		() => state.meta.chests.filter((c) => !c.opened),
		[state.meta.chests]
	);

	const recentLoot = useMemo(() => {
		const items = Object.values(state.inventory.items);
		return items.slice(-RECENT_LOOT_LIMIT).reverse();
	}, [state.inventory.items]);

	const handleSpin = (id: string): void => {
		dispatch({ type: "BEACON_SPIN", id });
	};
	const handleClaimBeacon = (id: string): void => {
		dispatch({ type: "BEACON_CLAIM", id });
	};
	const handleClaimSupply = (id: string): void => {
		dispatch({ type: "SUPPLY_CLAIM", id });
	};
	const handleOpenChest = (id: string): void => {
		dispatch({ type: "CHEST_OPEN", id });
	};
	const handleAmbient = (): void => {
		dispatch({ type: "AMBIENT_COLLECT" });
	};

	const hasContent =
		beacons.length > 0 || supplyDrops.length > 0 || chests.length > 0;

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-4 text-slate-100 backdrop-blur-md">
			<div className="flex items-center justify-between gap-2">
				<div>
					<h2 className="font-semibold text-cyan-100 text-lg">
						Beacons & Loot
					</h2>
					<p className="text-[11px] text-slate-400">
						Spin shrines, raid beacons, grab drops and chests.
					</p>
				</div>
				<Button
					className="border-cyan-400/40 bg-slate-950/70 text-cyan-200"
					onClick={handleAmbient}
					size="sm"
					type="button"
					variant="outline"
				>
					✨ Collect
				</Button>
			</div>

			{!hasContent && (
				<p className="rounded-xl border border-cyan-400/15 bg-slate-900/40 p-3 text-center text-slate-400 text-xs">
					No beacons, drops, or chests nearby yet. Keep moving and check back.
				</p>
			)}

			{beacons.length > 0 && (
				<section>
					<SectionHeading>Nearby Beacons</SectionHeading>
					<ul className="flex flex-col gap-2">
						{beacons.map(({ beacon, distance }) => (
							<BeaconRow
								beacon={beacon}
								distance={distance}
								key={beacon.id}
								now={now}
								onClaim={handleClaimBeacon}
								onSpin={handleSpin}
							/>
						))}
					</ul>
				</section>
			)}

			{supplyDrops.length > 0 && (
				<section>
					<SectionHeading>Supply Drops</SectionHeading>
					<ul className="flex flex-col gap-2">
						{supplyDrops.map((drop) => (
							<SupplyRow
								drop={drop}
								key={drop.id}
								now={now}
								onClaim={handleClaimSupply}
							/>
						))}
					</ul>
				</section>
			)}

			{chests.length > 0 && (
				<section>
					<SectionHeading>Wandering Chests</SectionHeading>
					<ul className="flex flex-col gap-2">
						{chests.map((chest) => (
							<ChestRow
								chest={chest}
								key={chest.id}
								now={now}
								onOpen={handleOpenChest}
							/>
						))}
					</ul>
				</section>
			)}

			{recentLoot.length > 0 && (
				<section>
					<SectionHeading>Recent Loot</SectionHeading>
					<ul className="flex flex-col gap-1">
						{recentLoot.map((item) => (
							<li
								className="flex items-center justify-between rounded-lg border border-cyan-400/15 bg-slate-900/50 px-3 py-1.5 text-xs"
								key={item.id}
							>
								<span className="text-cyan-100">{item.name}</span>
								<span className="text-slate-400 capitalize">
									{item.rarity} ×{item.qty}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
