---
name: e2e
description: End-to-end test authoring and execution for web, mobile, React Native, or Flutter apps. Discovers user flows, sets up the E2E framework if needed, writes tests covering the golden path and critical edge cases, runs them, and fixes failures. Primary tool is agent-browser (web). Falls back to Playwright (desktop/complex web), Maestro (iOS/Android/React Native/Flutter), or Claude for Chrome (web, last resort).
argument-hint: <feature, flow, or area to cover>
---

# E2E

You are writing end-to-end tests that simulate real user behavior. Work through each phase in order. Do not skip phases.

**Target:** {{args}}

**Called from another skill?** If `{{args}}` contains `--verify-fix` or `--verify-feature`, skip Phase 2 (framework setup) if one already exists, skip the user-confirmation step in Phase 3 (auto-confirm the scope described in args), and run Phases 4-6 directly. Report pass/fail counts explicitly at the end so the calling skill can confirm completion.


## Phase 1: Discover

Spawn **3 parallel subagents** to map what needs testing:

| Subagent | Focus | What to find |
|----------|-------|-------------|
| 1 | **App entry points** | How the app starts, what port/URL it runs on (web) or bundle ID/package name (mobile), how to launch it in test mode, any seed/fixture scripts |
| 2 | **User flows** | Routes, screens, forms, actions, and navigation paths relevant to the target area |
| 3 | **Existing tests** | Current E2E framework (agent-browser, Playwright, Maestro, Cypress, Detox, etc.), test structure, helper utilities, existing coverage gaps |

Synthesize into:
- **Platform** - web browser, iOS, Android, React Native, Flutter, or mixed
- **Launch command** - how to start the app under test
- **Base URL or App ID** - where to point the test runner
- **Flow inventory** - numbered list of user flows to cover, with the UI elements involved
- **Framework decision** - see below

### Framework Decision

If a framework already exists, use it. If not, choose:

| Platform | Primary | Fallback | Last resort |
|----------|---------|---------|------------|
| Web | **agent-browser** | Playwright (if agent-browser unavailable or insufficient) | Claude for Chrome (`/chrome`) |
| Desktop app | Playwright | — | Computer Use (native macOS) |
| iOS / Android (native) | **Maestro** | — | — |
| React Native | **Maestro** | — | — |
| Flutter | **Maestro** | — | — |
| Web + mobile | agent-browser (web) + Maestro (mobile) | — | — |

Check availability:
```bash
agent-browser --version 2>/dev/null && echo "AGENT_BROWSER_AVAILABLE" || echo "AGENT_BROWSER_MISSING"
npx playwright --version 2>/dev/null && echo "PLAYWRIGHT_AVAILABLE" || echo "PLAYWRIGHT_MISSING"
maestro --version 2>/dev/null && echo "MAESTRO_AVAILABLE" || echo "MAESTRO_MISSING"
```

For **Claude for Chrome** there is no CLI to version-check: it is the built-in browser automation that runs through the Claude in Chrome extension (the modern replacement for browser-based Computer Use). It is available when the extension is connected: confirm by attempting a tab-context call, or ask the user to run `/chrome` to connect. See the setup steps in Phase 2.

**Always confirm the framework choice with the user before setup** (skip confirmation in `--verify-fix`/`--verify-feature` mode).


## Phase 2: Framework Setup (if needed)

> **Shell note:** The shell snippets in this skill (the availability checks above, package-manager detection, `curl | bash`, and `jq` pipes) assume a POSIX shell. On Windows they will not run in the default PowerShell; run them via the Bash tool / Git Bash, or use the PowerShell equivalents (e.g. `agent-browser --version` then check the exit code, and detect the package manager with `Get-Command bun`).

### agent-browser (web — primary)

1. Install: `npm install -g agent-browser`
2. Install browser: `agent-browser install`
3. Verify: `agent-browser --version`
4. Smoke-check: `agent-browser open <base-url> && agent-browser screenshot /tmp/smoke.png && echo "OK"`

No config file needed for basic use. For headed mode during debugging: `AGENT_BROWSER_HEADED=true agent-browser open <url>`.

### Playwright (web — fallback for desktop apps or when agent-browser is unavailable)

Detect the package manager first:
```bash
command -v bun >/dev/null 2>&1 && PM=bun || (command -v pnpm >/dev/null 2>&1 && PM=pnpm || PM=npm)
echo "Using: $PM"
```

1. Install: `$PM add -D @playwright/test` (use `${PM}x` or `npx` to run binaries)
2. Install browser: `${PM}x playwright install --with-deps chromium`
3. Create a minimal `playwright.config.ts` following project conventions
4. Add to `package.json` scripts: `"test:e2e": "playwright test"`
5. Verify: write one trivial passing test and run `$PM run test:e2e`

### Maestro (mobile / React Native / Flutter)

1. Install (requires Java 17+):
   ```bash
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   ```
2. Verify: `maestro --version`
3. Confirm device/emulator: `maestro devices`
4. Create `maestro/` folder at project root
5. Write a trivial smoke flow to `maestro/smoke.yaml`, verify: `maestro test maestro/smoke.yaml`

### Claude for Chrome (web, last resort)

Claude for Chrome is built into Claude Code, so there is nothing to `npm install`. It drives a real Chrome (or Edge) window through the Claude in Chrome extension, sharing the browser's login state. Use it only when agent-browser and Playwright are both unavailable, or for interactive verification where a reusable test file is not required.

**It cannot be enabled programmatically; the user must connect it.** When this is the chosen tool, check whether the extension is connected (attempt a tab-context call). If it is not connected, stop and ask the user to enable it, giving these steps:

1. Install [Google Chrome](https://www.google.com/chrome/) or [Microsoft Edge](https://www.microsoft.com/edge) (Brave, Arc, and WSL are not supported).
2. Install the **Claude in Chrome extension** (v1.0.36+) from the Chrome Web Store and sign in with the same Anthropic account as Claude Code. Requires a direct Anthropic plan (Pro, Max, Team, or Enterprise) — not available through Bedrock, Vertex AI, or Foundry.
3. Make sure Claude Code is v2.0.73 or higher (`claude --version`).
4. In this Claude Code session, run `/chrome` to connect the extension (or launch with `claude --chrome`). Run `/chrome` again any time to check status, reconnect, or pick which browser to use. Selecting "Enabled by default" avoids the flag each session.
5. If "extension not detected" appears, restart Chrome (the first connection installs a native messaging host that Chrome reads on startup), then run `/chrome` → "Reconnect extension".

Once connected, confirm with the user which browser to use, then proceed to Phase 4.

If a framework already exists, read its config and confirm test directory and launch settings before proceeding.


## Phase 3: Plan Test Scenarios

For the target area, define test scenarios at two levels:

**Golden path** - the happy path a user follows when everything works:
- List each step as a user action (tap, type, click, navigate, submit)
- Define the expected outcome after each step
- One scenario per major flow

**Critical edge cases** - the failures a user will actually hit:
- Empty states (no data, first use)
- Validation errors (bad input, required fields)
- Auth boundaries (logged out, wrong role)
- Error recovery (server error, network failure)
- Navigation correctness after actions

Present the scenario list to the user and confirm scope before writing any tests. Note which flows are already covered by existing tests.


## Phase 4: Write Tests

### agent-browser (web — primary)

agent-browser uses a **snapshot + ref** model. Every interaction starts with a snapshot that returns stable refs (`@e1`, `@e2`, ...) for interactive elements. Use those refs instead of selectors.

**Basic workflow:**
```bash
agent-browser open <url>
agent-browser snapshot -i             # get interactive elements with refs
agent-browser click @e3              # click by ref
agent-browser fill @e5 "user@example.com"
agent-browser press Tab
agent-browser wait --text "Welcome"  # wait for expected content
agent-browser screenshot /tmp/after.png
```

**Semantic find (when ref is ambiguous):**
```bash
agent-browser find role button click --name "Submit"
agent-browser find label "Email" fill "test@example.com"
```

**Batch commands (faster — single startup, multiple actions):**
```bash
agent-browser batch \
  "open http://localhost:3000/login" \
  "snapshot -i" \
  "fill @e2 user@example.com" \
  "fill @e3 password123" \
  "click @e4" \
  "wait --text Dashboard" \
  "screenshot /tmp/login-result.png"
```

**JSON output for assertions:**
```bash
agent-browser get url --json
agent-browser snapshot --json | jq '.elements[] | select(.text | test("Welcome"))'
```

**Rules:**
- Always snapshot before clicking — refs change after navigation
- Use `wait --text` or `wait --load networkidle` instead of fixed sleeps
- Individual operations must complete within 25 seconds (daemon timeout)
- Take a screenshot after each major step as visual proof
- For `--verify-fix`/`--verify-feature` mode: save screenshots to a named folder and report their paths in the final summary

### Playwright (web — fallback / desktop)

1. Read similar existing tests first: match their style, helpers, and assertions exactly
2. Use the Page Object pattern if the project already uses it; otherwise write direct locator calls
3. Use **semantic selectors** in priority order:
   - `getByRole` / `getByLabel` / `getByText` (prefer: match what users see)
   - `data-testid` attributes (add them to the source if needed)
   - CSS selectors only as a last resort
4. Assert the **visible outcome** the user would notice: page content, URL, toast message, element state
5. Never assert implementation details (Redux state, internal API calls, class names)

**Rules:**
- Each test must be independent: no shared state between tests
- Flaky assertions must use `waitFor` or explicit waits, never `sleep`
- If a `data-testid` is missing from the UI, add it to the source file in the same PR

### Maestro (mobile / React Native / Flutter)

1. One flow file per scenario: `maestro/<feature>-<flow>.yaml`
2. Start every flow with `appId` and `launchApp`:
   ```yaml
   appId: com.example.app
   ---
   - launchApp:
       clearState: true
   ```
3. Use **visible text first** for element targeting:
   ```yaml
   - tapOn: "Sign In"
   - inputText: "user@example.com"
   - tapOn: { id: "submit_button" }   # fall back to ID if text is ambiguous
   - assertVisible: "Welcome back"
   ```
4. Key commands: `tapOn`, `inputText`, `scrollUntilVisible`, `assertVisible`, `assertNotVisible`, `back`, `takeScreenshot`, `swipe`
5. For environment-specific values, pass with `--env`: `${APP_URL}`, `${TEST_USER}`

**Rules:**
- Each flow must be runnable in isolation (`clearState: true` on launch)
- No fixed waits: Maestro handles timing automatically; use `assertVisible` as the sync point
- If an element has no stable text or ID, add a `testID` to the source

### Claude for Chrome (web, last resort)

Fall back to Claude for Chrome only when agent-browser and Playwright are both unavailable, or when a flow needs a real authenticated browser session that those tools cannot reproduce. Confirm the extension is connected first (see Phase 2); if not, ask the user to run `/chrome`.

Drive the real Chrome window through the `claude-in-chrome` browser tools (run `/mcp` → `claude-in-chrome` to see the full list): create a tab, navigate to the app, walk through each flow from the acceptance criteria, and assert the visible outcome at each step. Take a screenshot (or record a GIF) at each major step as proof. When Claude for Chrome hits a login page or CAPTCHA it pauses for the user to handle it manually; do not attempt to bypass it.

This is agentic rather than file-based: it verifies flows live but does not produce a reusable test file. Note in the summary that Claude for Chrome was used and list the screenshot/GIF paths.

Run every test/flow immediately after writing it. A passing golden-path test is the baseline before writing edge cases.


## Phase 5: Fix Failures

For every failing test or flow:

1. Read the error output carefully: distinguish selector/ref mismatch, timing issue, and actual behavior bug
2. **agent-browser ref mismatch** - re-snapshot after the last navigation; refs change on page load
3. **agent-browser timeout** - use `wait --text` or `wait --load networkidle` before the next action; keep each operation under 25 seconds
4. **Playwright selector mismatch** - fix the locator or add a `data-testid` to the source
5. **Playwright timing issue** - replace fixed waits with `waitFor` targeting a visible element or network idle
6. **Maestro element not found** - use `maestro hierarchy` to inspect the current screen state
7. **Actual bug found** - real find; report it to the user before deciding whether to fix the app or mark the test as known-failing with a TODO

Do not modify assertions to make tests pass: assertions represent the correct expected behavior.

Fix → run → fix → run. One failure at a time.


## Phase 6: Run Full Suite & Confirm

**agent-browser** - run each flow as a batch command sequence, or via a shell script:
```bash
bash e2e/run-all.sh        # if the project has a runner script
```

**Playwright:**
```bash
$PM run test:e2e
```

**Maestro:**
```bash
maestro test maestro/
```

All tests must pass. If existing E2E tests are now failing, treat them as regressions and fix the cause before reporting done.

Report:
- Framework used (agent-browser / Playwright / Maestro / Claude for Chrome)
- How many flows are now covered
- How many tests were written (golden path vs. edge cases)
- Screenshot paths (for agent-browser runs)
- Any bugs found in the app during testing
- Any flows intentionally deferred (with reason)


## Completion Checklist

- [ ] Platform confirmed (web / iOS / Android / React Native / Flutter)
- [ ] Framework chosen and confirmed with user (agent-browser / Playwright / Maestro / Claude for Chrome)
- [ ] App launch and base URL / app ID confirmed
- [ ] E2E framework installed and configured
- [ ] Flow inventory created and confirmed with user
- [ ] Golden path test written and passing for each major flow
- [ ] Critical edge cases covered with dedicated tests
- [ ] agent-browser: refs re-fetched after every navigation; screenshots taken at each major step
- [ ] Playwright: semantic selectors or `data-testid`; no flaky waits (`waitFor` used)
- [ ] Maestro: `clearState: true` on launch; `assertVisible` as sync point
- [ ] Full E2E suite passes with no regressions
- [ ] Any app bugs found are reported to the user
