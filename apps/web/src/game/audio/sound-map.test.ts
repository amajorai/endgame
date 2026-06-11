import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { allSoundPaths } from "@/game/audio/sound-map";

// Every path in the sound map must resolve to a real file under public/. With
// scores of hand-typed paths, a typo that 404s silently at runtime is the most
// likely failure; this turns it into a failing test instead. Tests run from the
// app package root, so public/ sits directly under cwd.
const PUBLIC_DIR = join(process.cwd(), "public");

describe("sound map", () => {
	it("references only files that exist on disk", () => {
		const missing: string[] = [];
		for (const path of allSoundPaths()) {
			const abs = join(PUBLIC_DIR, path);
			if (!existsSync(abs)) {
				missing.push(path);
			}
		}
		expect(missing).toEqual([]);
	});
});
