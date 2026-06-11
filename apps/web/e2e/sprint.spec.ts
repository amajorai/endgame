import { expect, type Page, test } from "@playwright/test";

// Sprint stamina (hold Shift while moving). Like the jump, the charge is
// view-only (never persisted) and the bar can't be rasterised headlessly, so
// these tests open the game with the ?__e2e seam (see game-map.tsx) and read the
// charge + exhausted latch via window.__sprint while driving Shift/WASD with
// dispatched keyboard events. The bar's appearance is a manual pixel check.

interface SprintProbe {
	charge: number;
	exhausted: boolean;
}

declare global {
	interface Window {
		__sprint?: () => SprintProbe;
	}
}

// Drain from full takes ~3s of sim time; under throttled headless rAF the
// wall-clock is longer, so give drain/regen loops a generous ceiling.
const DRAIN_TIMEOUT_MS = 12_000;

async function ready(page: Page): Promise<void> {
	await page.goto("/?__e2e=1");
	const skip = page.getByRole("button", { name: "Skip" }).first();
	if (await skip.isVisible().catch(() => false)) {
		await skip.click();
	}
	await page.waitForFunction(
		() => typeof window.__sprint === "function",
		null,
		{
			timeout: 30_000,
		}
	);
}

test.describe("sprint stamina", () => {
	test("holding Shift while moving drains the charge to empty and latches exhausted", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(
			async ({ timeout }) => {
				const probe = window.__sprint;
				if (!probe) {
					return { error: "no seam" } as const;
				}
				const sleep = (ms: number) =>
					new Promise<void>((r) => setTimeout(r, ms));

				const start = probe();
				window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
				window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));

				let drained = false;
				const t0 = performance.now();
				while (performance.now() - t0 < timeout) {
					const s = probe();
					if (s.charge === 0 && s.exhausted) {
						drained = true;
						break;
					}
					await sleep(16);
				}
				const end = probe();
				window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
				window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
				return { startCharge: start.charge, drained, end };
			},
			{ timeout: DRAIN_TIMEOUT_MS }
		);

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.startCharge).toBe(1);
		expect(result.drained).toBe(true);
		expect(result.end.charge).toBe(0);
		expect(result.end.exhausted).toBe(true);
	});

	test("holding Shift while standing still does not drain the charge", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(async () => {
			const probe = window.__sprint;
			if (!probe) {
				return { error: "no seam" } as const;
			}
			const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

			// Shift only - no WASD. Sprint must not engage, so the charge stays full.
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
			let minCharge = 1;
			const t0 = performance.now();
			while (performance.now() - t0 < 800) {
				minCharge = Math.min(minCharge, probe().charge);
				await sleep(16);
			}
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
			return { minCharge };
		});

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.minCharge).toBe(1);
	});

	test("releasing Shift regenerates the charge and clears the exhausted latch", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(
			async ({ timeout }) => {
				const probe = window.__sprint;
				if (!probe) {
					return { error: "no seam" } as const;
				}
				const sleep = (ms: number) =>
					new Promise<void>((r) => setTimeout(r, ms));

				// First drain to exhaustion.
				window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
				window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
				const t0 = performance.now();
				while (performance.now() - t0 < timeout) {
					if (probe().exhausted) {
						break;
					}
					await sleep(16);
				}
				const exhausted = probe();
				// Stop moving and let it recover.
				window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
				window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));

				let recovered = false;
				const t1 = performance.now();
				while (performance.now() - t1 < timeout) {
					const s = probe();
					if (!s.exhausted && s.charge > exhausted.charge) {
						recovered = true;
						break;
					}
					await sleep(16);
				}
				return { exhaustedCharge: exhausted.charge, recovered, end: probe() };
			},
			{ timeout: DRAIN_TIMEOUT_MS }
		);

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.exhaustedCharge).toBe(0);
		expect(result.recovered).toBe(true);
		expect(result.end.exhausted).toBe(false);
		expect(result.end.charge).toBeGreaterThan(0);
	});
});
