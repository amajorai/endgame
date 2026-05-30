import { defineConfig, devices } from "@playwright/test";

// The dev server is started separately (bun run dev). Tests point at the
// already-running instance; CI can override PLAYWRIGHT_BASE_URL.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3007";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: "list",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
	],
});
