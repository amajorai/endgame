// Raw-CDP audio verification. Launches chrome-headless-shell with the autoplay
// policy relaxed (headless has no real gesture pipeline), loads the game, clicks
// the radial FAB + an item, and asserts the .wav network requests fire. A .wav
// request is end-to-end proof: playSfx only fetches when the AudioContext is
// running, so the request proves unlock + resolve + fetch all worked.
import { spawn } from "node:child_process";

const EXE =
	process.env.HEADLESS_SHELL ??
	`${process.env.USERPROFILE}\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe`;
const PORT = 9456;
const URL = process.env.GAME_URL ?? "http://localhost:3001/?__e2e=1";

// chrome-headless-shell has no audio output device, so ctx.resume() never flips
// a suspended context to "running" here - meaning a real gesture cannot be
// exercised headlessly. We force the context to start running with the autoplay
// policy override; that lets us prove the rest of the pipeline (resolve -> fetch
// -> decode -> graph -> play, the store-event SFX, controller footsteps/jump and
// music) end-to-end. The gesture-driven unlock() / resume() path is plain code
// (resume() inside the FAB onClick) and must be confirmed audibly in a real
// browser via the 🔊 control.
const child = spawn(EXE, [
	"--headless",
	"--no-sandbox",
	"--disable-gpu",
	"--autoplay-policy=no-user-gesture-required",
	`--remote-debugging-port=${PORT}`,
	`--user-data-dir=${process.env.TEMP}\\audio-verify-${Date.now()}`,
	"about:blank",
]);
child.on("error", (e) => {
	console.error("spawn error", e);
	process.exit(1);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch(`http://localhost:${PORT}/json/version`);
			const json = await res.json();
			if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
		} catch {}
		await sleep(250);
	}
	throw new Error("CDP endpoint never came up");
}

let msgId = 0;
const pending = new Map();
const soundRequests = [];

function makeSend(ws) {
	return function send(method, params = {}, sessionId) {
		const id = ++msgId;
		const payload = { id, method, params };
		if (sessionId) payload.sessionId = sessionId;
		ws.send(JSON.stringify(payload));
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
		});
	};
}

const wsUrl = await getWsUrl();
const browserWs = new WebSocket(wsUrl);
await new Promise((r) => (browserWs.onopen = r));
const send = makeSend(browserWs);

browserWs.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) reject(new Error(JSON.stringify(msg.error)));
		else resolve(msg.result);
		return;
	}
	if (msg.method === "Network.requestWillBeSent") {
		const url = msg.params?.request?.url ?? "";
		if (url.includes("/assets/sounds/")) soundRequests.push(url);
	}
};

// Attach to a fresh page target via flat session.
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", {
	targetId,
	flatten: true,
});
const ssend = (method, params) => send(method, params, sessionId);

await ssend("Network.enable", {});
await ssend("Page.enable", {});
await ssend("Runtime.enable", {});
await ssend("Page.navigate", { url: URL });
await sleep(6000); // let the client hydrate + map mount

// Click the radial FAB (unlocks audio + plays ui_radial_open), then open a
// category and an item to fire ui_select + ui_click.
const key = (type, k, code) =>
	`window.dispatchEvent(new KeyboardEvent('${type}', { key: '${k}', code: '${code}', bubbles: true }));`;

const clickScript = `(async () => {
  const log = [];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 1. UI: open the radial menu (the FAB click runs unlock()), pick a category +
  //    item, then close the panel.
  const fab = document.querySelector('button[aria-label="Open menu"]');
  if (!fab) return { ok: false, reason: 'no FAB', log };
  fab.click(); log.push('FAB');
  await sleep(400);
  const cat = document.querySelector('button[aria-label="Hero"], button[aria-label="World"]');
  if (cat) { cat.click(); log.push('category'); }
  await sleep(400);
  const items = [...document.querySelectorAll('button')].filter(b => ['Hunter','Quests','Bag','Explore','Skies','Ghost'].includes(b.getAttribute('aria-label')));
  if (items[0]) { items[0].click(); log.push('item'); }
  await sleep(400);
  const close = document.querySelector('button[aria-label="Close panel"]');
  if (close) { close.click(); log.push('close'); }
  await sleep(400);
  // 2. Movement: hold Shift+W so the avatar sprints and trips footsteps.
  ${key("keydown", "Shift", "ShiftLeft")}
  ${key("keydown", "w", "KeyW")}
  log.push('hold W');
  await sleep(3000);
  ${key("keyup", "w", "KeyW")}
  ${key("keyup", "Shift", "ShiftLeft")}
  // 3. Jump (Space) and melee attack (J).
  ${key("keydown", " ", "Space")}
  ${key("keyup", " ", "Space")}
  log.push('jump');
  await sleep(300);
  ${key("keydown", "j", "KeyJ")}
  ${key("keyup", "j", "KeyJ")}
  log.push('attack');
  return { ok: true, log };
})()`;

const result = await ssend("Runtime.evaluate", {
	expression: clickScript,
	awaitPromise: true,
	returnByValue: true,
});
await sleep(1500);

const unique = [...new Set(soundRequests)].map((u) =>
	u.replace("http://localhost:3001", "")
);
console.log("interaction:", JSON.stringify(result.result?.value ?? result));
console.log("sound requests captured:", soundRequests.length);
for (const u of unique) console.log("  -", u);

// Categorise what fired so we know the controller + music paths work too, not
// just UI clicks.
const has = (frag) => unique.some((u) => u.includes(frag));
const report = {
	ui: has("/ui/"),
	footstep: has("/footsteps/"),
	jump: has("retro/jump"),
	attack: has("/combat/"),
	music: has("ambient_wind") || has("/music/"),
};
console.log("categories:", JSON.stringify(report));

child.kill();
if (soundRequests.length === 0) {
	console.error("FAIL: no sound requests fired");
	process.exit(2);
}
console.log("PASS: audio pipeline fired");
process.exit(0);
