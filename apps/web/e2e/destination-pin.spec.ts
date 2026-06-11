import { expect, type Page, test } from "@playwright/test";

// Click-to-walk destination pin. A move order drops a pin on the tapped point so
// it's visible where the avatar is walking; it clears on arrival or when the
// player takes manual WASD control. The MapLibre canvas can't be rasterised
// headlessly, so these tests drive the move order through the ?__e2e seams
// (window.__walk / window.__hasDestinationPin, see game-map.tsx) and assert on
// the pin's DOM element (.maplibregl-marker), which lives outside the WebGL
// canvas and is therefore inspectable.

declare global {
	interface Window {
		__hasDestinationPin?: () => boolean;
		__walk?: (dLat: number, dLng: number) => boolean;
	}
}

// A target offset comfortably beyond the 3 m arrival threshold so the pin
// persists long enough to observe (~0.001 deg latitude is roughly 110 m).
const FAR_OFFSET = 0.001;

async function ready(page: Page): Promise<void> {
	await page.goto("/?__e2e=1");
	const skip = page.getByRole("button", { name: "Skip" }).first();
	if (await skip.isVisible().catch(() => false)) {
		await skip.click();
	}
	await page.waitForFunction(
		() =>
			typeof window.__walk === "function" &&
			typeof window.__hasDestinationPin === "function",
		null,
		{ timeout: 30_000 }
	);
}

test.describe("click-to-walk destination pin", () => {
	test("a move order shows a pin, and WASD cancels it", async ({ page }) => {
		await ready(page);

		const issued = await page.evaluate(
			(offset) => window.__walk?.(offset, offset),
			FAR_OFFSET
		);
		expect(issued).toBe(true);

		// The pin appears as soon as the target is set.
		await expect
			.poll(() => page.evaluate(() => window.__hasDestinationPin?.()))
			.toBe(true);

		// WASD reclaims manual control, which cancels the auto-walk and the pin.
		await page.evaluate(() =>
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }))
		);
		await expect
			.poll(() => page.evaluate(() => window.__hasDestinationPin?.()))
			.toBe(false);
		await page.evaluate(() =>
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }))
		);
	});

	test("the pin clears once the avatar arrives", async ({ page }) => {
		await ready(page);

		// A nearby target (within ~1 m) is reached almost immediately, so the pin
		// is dropped and then cleared on arrival without manual input.
		const issued = await page.evaluate(() =>
			window.__walk?.(0.000_005, 0.000_005)
		);
		expect(issued).toBe(true);

		await expect
			.poll(() => page.evaluate(() => window.__hasDestinationPin?.()), {
				timeout: 6000,
			})
			.toBe(false);
	});
});
