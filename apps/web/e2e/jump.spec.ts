import { expect, type Page, test } from "@playwright/test";

// Player jump (Space). The jump is view-only (no store state) and the MapLibre
// canvas can't be rasterised headlessly, so these tests open the game with the
// ?__e2e seam (see game-map.tsx) and read jump + position state via window.__jump
// while driving Space/WASD with dispatched keyboard events. The "looks right"
// confirmation (the Knight's crouch/leap/land) is a manual pixel check.

interface Probe {
	airborne: boolean;
	altitude: number;
	lat: number;
	lng: number;
}

declare global {
	interface Window {
		__jump?: () => Probe;
	}
}

// Generous ceiling: dt is capped, so under throttled headless rAF the ~0.93s
// sim airtime can take noticeably longer in wall-clock time.
const LAND_TIMEOUT_MS = 6000;

async function ready(page: Page): Promise<void> {
	await page.goto("/?__e2e=1");
	const skip = page.getByRole("button", { name: "Skip" }).first();
	if (await skip.isVisible().catch(() => false)) {
		await skip.click();
	}
	// The controller is created on map "load"; the seam appears then.
	await page.waitForFunction(() => typeof window.__jump === "function", null, {
		timeout: 30_000,
	});
}

test.describe("player jump", () => {
	test("a Space jump rises in an arc and lands back at exactly 0", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(
			async ({ landTimeout }) => {
				const probe = window.__jump;
				if (!probe) {
					return { error: "no seam" } as const;
				}
				const sleep = (ms: number) =>
					new Promise<void>((r) => setTimeout(r, ms));

				const grounded = probe();
				window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

				let peak = 0;
				let becameAirborne = false;
				const t0 = performance.now();
				while (performance.now() - t0 < landTimeout) {
					const s = probe();
					becameAirborne = becameAirborne || s.airborne;
					peak = Math.max(peak, s.altitude);
					if (becameAirborne && !s.airborne) {
						break;
					}
					await sleep(16);
				}
				return {
					groundedAltitude: grounded.altitude,
					becameAirborne,
					peak,
					end: probe(),
				};
			},
			{ landTimeout: LAND_TIMEOUT_MS }
		);

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.groundedAltitude).toBe(0);
		expect(result.becameAirborne).toBe(true);
		expect(result.peak).toBeGreaterThan(0.5);
		expect(result.end.altitude).toBe(0);
		expect(result.end.airborne).toBe(false);
	});

	test("a second Space mid-air does not restart the arc (no double-jump)", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(
			async ({ landTimeout }) => {
				const probe = window.__jump;
				if (!probe) {
					return { error: "no seam" } as const;
				}
				const sleep = (ms: number) =>
					new Promise<void>((r) => setTimeout(r, ms));

				window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
				let peak = 0;
				let descended = false;
				let bumpAfterDescent = 0;
				let secondPressed = false;
				const t0 = performance.now();
				while (performance.now() - t0 < landTimeout) {
					const s = probe();
					peak = Math.max(peak, s.altitude);
					// Once clearly descending, press Space again and watch for a re-rise.
					if (
						!secondPressed &&
						peak > 0.5 &&
						s.airborne &&
						s.altitude < peak * 0.6
					) {
						descended = true;
						secondPressed = true;
						window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
					}
					if (descended) {
						bumpAfterDescent = Math.max(bumpAfterDescent, s.altitude);
					}
					if (secondPressed && !s.airborne) {
						break;
					}
					await sleep(16);
				}
				return { peak, descended, bumpAfterDescent, end: probe() };
			},
			{ landTimeout: LAND_TIMEOUT_MS }
		);

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.descended).toBe(true);
		// A mid-air Space must not relaunch the avatar back toward the peak.
		expect(result.bumpAfterDescent).toBeLessThan(result.peak * 0.6);
		expect(result.end.altitude).toBe(0);
		expect(result.end.airborne).toBe(false);
	});

	test("WASD still moves the player horizontally while airborne", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(async () => {
			const probe = window.__jump;
			if (!probe) {
				return { error: "no seam" } as const;
			}
			const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

			const before = probe();
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
			window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
			let movedWhileAirborne = false;
			const t0 = performance.now();
			while (performance.now() - t0 < 600) {
				const s = probe();
				if (s.airborne && (s.lat !== before.lat || s.lng !== before.lng)) {
					movedWhileAirborne = true;
				}
				await sleep(16);
			}
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
			return { movedWhileAirborne };
		});

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.movedWhileAirborne).toBe(true);
	});

	test("Space typed into a text input types a space and does not jump", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(async () => {
			const probe = window.__jump;
			if (!probe) {
				return { error: "no seam" } as const;
			}
			const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

			const input = document.createElement("input");
			input.type = "text";
			document.body.appendChild(input);
			input.focus();
			input.dispatchEvent(
				new KeyboardEvent("keydown", { key: " ", bubbles: true })
			);
			let airborne = false;
			const t0 = performance.now();
			while (performance.now() - t0 < 300) {
				airborne = airborne || probe().airborne;
				await sleep(16);
			}
			input.remove();
			return { airborne };
		});

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.airborne).toBe(false);
	});

	test("Space on a focused button activates the button, not a jump", async ({
		page,
	}) => {
		await ready(page);

		const result = await page.evaluate(async () => {
			const probe = window.__jump;
			if (!probe) {
				return { error: "no seam" } as const;
			}
			const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

			const button = document.createElement("button");
			button.textContent = "test";
			let clicked = false;
			button.addEventListener("click", () => {
				clicked = true;
			});
			document.body.appendChild(button);
			button.focus();
			button.dispatchEvent(
				new KeyboardEvent("keydown", { key: " ", bubbles: true })
			);
			button.click();
			let airborne = false;
			const t0 = performance.now();
			while (performance.now() - t0 < 300) {
				airborne = airborne || probe().airborne;
				await sleep(16);
			}
			button.remove();
			return { airborne, clicked };
		});

		if ("error" in result) {
			expect(result.error).toBe("");
			return;
		}
		expect(result.airborne).toBe(false);
		expect(result.clicked).toBe(true);
	});
});
