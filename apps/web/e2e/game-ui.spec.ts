import { expect, test } from "@playwright/test";

// These cover the game-first UI redesign: the game lives at /, has no site
// header, and is navigated by the radial FAB menu instead of bottom tabs.

test.describe("game-first UI", () => {
	test("home renders the game with no site header and shows the FAB", async ({
		page,
	}) => {
		await page.goto("/");

		// The site header (present on chrome pages) must NOT be on the game.
		await expect(page.getByRole("link", { name: "AI Chat" })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

		// The radial menu FAB is the game's entry point to all features.
		await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
	});

	test("radial menu: FAB -> category -> feature -> panel -> close", async ({
		page,
	}) => {
		await page.goto("/");

		// First run shows the onboarding overlay (z-50); dismiss it the way a
		// real player would before the radial menu becomes interactive.
		const skip = page.getByRole("button", { name: "Skip" }).first();
		if (await skip.isVisible()) {
			await skip.click();
		}

		await page.getByRole("button", { name: "Open menu" }).click();

		// Four thematic categories fan out.
		for (const category of ["Combat", "Build", "Hero", "World"]) {
			await expect(
				page.getByRole("button", { name: category })
			).toBeVisible();
		}

		// A category fans out its features.
		await page.getByRole("button", { name: "Combat" }).click();
		await expect(page.getByRole("button", { name: "Gates" })).toBeVisible();

		// A feature opens its bottom-sheet panel.
		await page.getByRole("button", { name: "Gates" }).click();
		await expect(
			page.getByRole("button", { name: "Close panel" })
		).toBeVisible();

		// Closing the panel returns to the map with the FAB available again.
		await page.getByRole("button", { name: "Close panel" }).click();
		await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
	});

	test("/play redirects to /", async ({ request }) => {
		const response = await request.get("/play", { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(response.headers().location).toBe("/");
	});

	test("chrome pages keep the site header", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByRole("link", { name: "AI Chat" })).toBeVisible();

		await page.goto("/ai");
		await expect(page.getByRole("link", { name: "AI Chat" })).toBeVisible();
	});
});
