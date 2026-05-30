"use client";

import { useEffect, useState } from "react";

export interface RadialItem {
	icon: string;
	key: string;
	label: string;
}

export interface RadialCategory {
	icon: string;
	items: RadialItem[];
	key: string;
	label: string;
}

interface RadialMenuProps {
	categories: RadialCategory[];
	onSelect: (key: string) => void;
}

// Arc geometry: satellites fan upward from the FAB across the top, from the
// upper-left to the upper-right. Angles are in standard math degrees (0 = right,
// 90 = straight up); screen-y is inverted so "up" becomes a negative offset.
const ARC_START_DEG = 156;
const ARC_END_DEG = 24;
const ARC_RADIUS = 116;
const DEG_TO_RAD = Math.PI / 180;

function arcOffset(index: number, count: number): { x: number; y: number } {
	const angleDeg =
		count <= 1
			? 90
			: ARC_START_DEG + ((ARC_END_DEG - ARC_START_DEG) * index) / (count - 1);
	const angleRad = angleDeg * DEG_TO_RAD;
	return {
		x: Math.cos(angleRad) * ARC_RADIUS,
		y: -Math.sin(angleRad) * ARC_RADIUS,
	};
}

interface SatelliteProps {
	delayMs: number;
	icon: string;
	label: string;
	offset: { x: number; y: number };
	onClick: () => void;
	shown: boolean;
}

function Satellite({
	icon,
	label,
	offset,
	shown,
	delayMs,
	onClick,
}: SatelliteProps): React.JSX.Element {
	return (
		<button
			aria-label={label}
			className="absolute flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border border-cyan-400/40 bg-slate-950/85 text-cyan-100 shadow-lg backdrop-blur-md transition-all duration-200 ease-out hover:border-cyan-300 hover:bg-slate-900/90"
			onClick={onClick}
			style={{
				left: "50%",
				top: "50%",
				opacity: shown ? 1 : 0,
				pointerEvents: shown ? "auto" : "none",
				transform: shown
					? `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(1)`
					: "translate(-50%, -50%) scale(0.3)",
				transitionDelay: shown ? `${delayMs}ms` : "0ms",
			}}
			type="button"
		>
			<span aria-hidden="true" className="text-xl leading-none">
				{icon}
			</span>
			<span className="text-[9px] leading-none">{label}</span>
		</button>
	);
}

export function RadialMenu({
	categories,
	onSelect,
}: RadialMenuProps): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(
		null
	);

	const closeAll = (): void => {
		setOpen(false);
		setActiveCategoryKey(null);
	};

	// Escape steps back one level: out of a category, then out of the menu.
	useEffect(() => {
		if (!open) {
			return;
		}
		const handleKey = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") {
				return;
			}
			if (activeCategoryKey) {
				setActiveCategoryKey(null);
			} else {
				setOpen(false);
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open, activeCategoryKey]);

	const activeCategory =
		categories.find((category) => category.key === activeCategoryKey) ?? null;

	const handleFab = (): void => {
		if (!open) {
			setOpen(true);
			return;
		}
		if (activeCategoryKey) {
			setActiveCategoryKey(null);
			return;
		}
		setOpen(false);
	};

	const handleCategory = (key: string): void => {
		setActiveCategoryKey(key);
	};

	const handleItem = (key: string): void => {
		onSelect(key);
		closeAll();
	};

	let fabIcon = "✦";
	let fabLabel = "Open menu";
	if (open && activeCategory) {
		fabIcon = "←";
		fabLabel = "Back to categories";
	} else if (open) {
		fabIcon = "✕";
		fabLabel = "Close menu";
	}

	const satelliteCount = activeCategory
		? activeCategory.items.length
		: categories.length;

	return (
		<>
			{open && (
				<button
					aria-label="Close menu"
					className="absolute inset-0 z-30 cursor-default bg-slate-950/30 backdrop-blur-[1px]"
					onClick={closeAll}
					tabIndex={-1}
					type="button"
				/>
			)}

			<div className="absolute bottom-6 left-1/2 z-40 h-16 w-16 -translate-x-1/2">
				{categories.map((category, index) => (
					<Satellite
						delayMs={index * 25}
						icon={category.icon}
						key={category.key}
						label={category.label}
						offset={arcOffset(index, categories.length)}
						onClick={() => handleCategory(category.key)}
						shown={open && !activeCategory}
					/>
				))}

				{activeCategory?.items.map((item, index) => (
					<Satellite
						delayMs={index * 25}
						icon={item.icon}
						key={item.key}
						label={item.label}
						offset={arcOffset(index, satelliteCount)}
						onClick={() => handleItem(item.key)}
						shown={Boolean(activeCategory)}
					/>
				))}

				<button
					aria-expanded={open}
					aria-label={fabLabel}
					className={`absolute inset-0 flex h-16 w-16 items-center justify-center rounded-full border text-2xl shadow-2xl backdrop-blur-md transition-colors ${
						open
							? "border-cyan-300 bg-cyan-500/25 text-cyan-50"
							: "border-cyan-400/50 bg-slate-950/85 text-cyan-200 hover:border-cyan-300 hover:text-cyan-50"
					}`}
					onClick={handleFab}
					type="button"
				>
					<span aria-hidden="true">{fabIcon}</span>
				</button>
			</div>
		</>
	);
}
