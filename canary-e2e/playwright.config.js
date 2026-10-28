// Canary suite target selection.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// CANARY_BASE_URL / CANARY_API_URL (both, verbatim): the suite drives the
// operator-provided stack, exactly as documented in tests/urls.js — for
// pointing the suite at an already-running dev/scratch stack the operator
// owns.
//
// Both UNSET (the default): the suite PROVISIONS ITS OWN throwaway stack on
// dedicated scratch ports — API on :3399 with a scratch PROJECTS_ROOT, vite
// on :5299 with the browser wired to that API via VITE_API_BASE/VITE_WS_URL.
// This keeps a bare `npx playwright test` / `npm run test:canary` from ever
// accidentally driving a LIVE deployment that may be listening on the dev
// defaults (:3100/:5173) — the suite must never mutate a backend it does not
// own (the 2026-09-11 quick-review incident ran the whole suite against the
// production API and produced false regressions: axe colour-contrast on the
// RUNNING badge, workflow-switch/task-card state pollution, and tasks
// executed by the production engine).
//
// The scratch API also runs with KAINBAIN_DISABLE_SCHEDULER: the autonomous
// scheduler (started unconditionally by api/index.js) re-dispatches every
// in_stage task sitting in an automated stage within one tick (3s), which
// silently completed the suites' deliberately passive fixtures (footer-
// overlay's "Inspector overlap e2e", task-lifecycle, mobile-responsive card
// fixtures) and made card-visibility assertions race against task
// completion. The specs' standing premise — "/compute/stop keeps the
// dispatcher off; tests drive stages explicitly" — only holds with the
// scheduler disabled (config.js documents this env var for exactly "test
// harnesses or scratch instances"). Explicit execute:true and engine-driven
// flows are unaffected.
//
// Exactly one of the two set: a configuration error. Splitting the pair
// silently mixes an operator-owned half with a defaulted half (e.g. browser
// talking to :3100 while the suite thinks it drives a scratch API), which is
// precisely the ambiguity this split exists to remove — fail fast instead.
const operatorBaseURL = process.env.CANARY_BASE_URL;
const operatorApiURL = process.env.CANARY_API_URL;
const usesOperatorStack = Boolean(operatorBaseURL && operatorApiURL);
if (!usesOperatorStack && (operatorBaseURL || operatorApiURL)) {
	throw new Error(
		"canary-e2e: set BOTH CANARY_BASE_URL and CANARY_API_URL to drive a specific stack, or neither to auto-provision an isolated scratch stack (API :3399 + vite :5299).",
	);
}

const baseURL = usesOperatorStack ? operatorBaseURL : "http://localhost:5299";
const apiURL = usesOperatorStack ? operatorApiURL : "http://localhost:3399";

/***
 * MARK: portOf
 * @description Extracts the port from an absolute URL with a fail-fast,
 *   well-described config error instead of letting `new URL()` throw a bare
 *   TypeError from deep inside a webServer descriptor.
 * @example portOf("http://localhost:3399", "scratch API") => "3399"
 * @param {string} urlString
 * @param {string} label - Human-readable name used in the thrown error.
 * @returns {string} The URL's port as a string.
 ***/
function portOf(urlString, label) {
	try {
		return String(new URL(urlString).port);
	} catch {
		throw new Error(
			`canary-e2e: ${label} URL "${urlString}" is not a valid absolute URL — cannot derive the port.`,
		);
	}
}
// Parsed only for the scratch stack (operator stacks are used verbatim).
const apiPort = usesOperatorStack ? null : portOf(apiURL, "scratch API");
const vitePort = usesOperatorStack ? null : portOf(baseURL, "scratch vite");

/***
 * MARK: drainScratchPorts
 * @description Reclaims the dedicated scratch ports (API :3399, vite :5299)
 *   before Playwright provisions its `webServer` entries. A scratch stack
 *   orphaned by a killed/aborted run otherwise makes the whole suite fail with
 *   Playwright's opaque "http://localhost:3399/status is already used" error
 *   (2026-10-12 incident, task 04170d74).
 *
 *   This runs at CONFIG LOAD time on purpose: Playwright starts `webServer`
 *   BEFORE `globalSetup`, so a drain there is too late (verified — an
 *   orphaned scratch API survived globalSetup and still blocked the suite).
 *   Nothing happens when the operator drives their own stack
 *   (CANARY_BASE_URL / CANARY_API_URL), because the scratch ports are unused.
 *   Best-effort: any failure is swallowed and Playwright's own error remains
 *   the authoritative diagnostic.
 * @example drainScratchPorts() => undefined
 * @returns {void}
 ***/
function drainScratchPorts() {
	if (usesOperatorStack) return;
	// CONFIG LOAD HAPPENS IN EVERY WORKER TOO — and workers start AFTER
	// `webServer` is up. Draining there would see the freshly-started API (and
	// this run's own client sockets) on :3399 and SIGTERM the server and the
	// test runner itself (observed as an instant exit 143). Only the main
	// runner process (no TEST_WORKER_INDEX) performs the drain, before
	// `webServer` is provisioned.
	if (process.env.TEST_WORKER_INDEX !== undefined) return;
	const drainScript = path.join(__dirname, "..", "scripts", "drain-ports.sh");
	try {
		// The shared, tested drain: prefers the verified
		// `scripts/canary-preflight.mjs` guard (refuses to kill a non-scratch
		// occupant) and otherwise reclaims each port via `scripts/free-port.mjs`.
		execFileSync("bash", [drainScript, apiPort, vitePort], { stdio: "inherit" });
		return;
	} catch {
		// bash (or the script) is unavailable — fall through to the Node reclaim.
	}
	const freePortScript = path.join(__dirname, "..", "scripts", "free-port.mjs");
	for (const port of [apiPort, vitePort]) {
		try {
			execFileSync(process.execPath, [freePortScript, port], {
				stdio: "inherit",
			});
		} catch {
			// Best effort: Playwright's webServer error stays the authority.
		}
	}
}

drainScratchPorts();
// Per-run namespaced scratch roots: every invocation gets a hermetic backend
// state dir, so tasks/projects/workflows left behind by an earlier run (or a
// concurrent local run) can never leak into this run's boards, queue-depth
// counts, or card ordering. The tag travels via KB_CANARY_RUN_TAG (deploy
// sets a fresh tag per deploy; concurrent runs must use distinct tags).
// Local runs without a tag keep the historical "default" roots. Both roots
// are scratch: the specs create throwaway projects, whose notes dirs must
// never land in the live SilverBullet notes space.
const scratchRunTag = /[A-Za-z0-9][A-Za-z0-9_.-]{0,63}/.test(
	String(process.env.KB_CANARY_RUN_TAG || ""),
)
	? String(process.env.KB_CANARY_RUN_TAG)
	: "default";
const scratchRunBase = path.join("/tmp", "kb-canary-e2e", scratchRunTag);
const scratchProjectsRoot = path.join(scratchRunBase, "projects");
const scratchNotesRoot = path.join(scratchRunBase, "notes");
// Own containment-state file: the engine persists the WP1 circuit-breaker
// trip in ~/.kainbain/engine/circuit.json by default, so a scratch trip
// would poison prod's next boot (and a stale prod trip would 409 every
// scratch /execute). Scratch stacks must never share it. global-setup.js
// derives the same path from KB_CANARY_RUN_TAG, so keep the derivation in
// sync (base + "engine/circuit.json").
const scratchCircuitFile = path.join(scratchRunBase, "engine", "circuit.json");
// Best-effort reclamation of stale runs: drop sibling run dirs older than a
// day (never the current tag, never anything else under /tmp). A crashed run
// otherwise leaves its projects on disk forever; concurrent live runs are
// hours old at most, so a 24h floor can never reap one.
try {
	const base = path.join("/tmp", "kb-canary-e2e");
	for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === scratchRunTag) continue;
		const dir = path.join(base, entry.name);
		try {
			const ageMs = Date.now() - fs.statSync(dir).mtimeMs;
			if (ageMs > 24 * 60 * 60 * 1000) {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		} catch {
			// One unreclaimable sibling must never block the suite.
		}
	}
} catch {
	// Missing base dir on first ever run: the backend creates what it needs.
}

// The canary suite drives a single live backend (Project A) whose session
// tree and tasks are mutated by every test. Run serially so tests don't
// interfere with each other's captured state.
module.exports = {
	testDir: "./tests",
	workers: 1,
	globalSetup: "./global-setup.js",
	// Per-test (and per-hook) budget. The default 30s is too tight for the
	// shared 4-core gate host: the visual suite's beforeAll-heavy states
	// (project reset + full app ready + fonts) measured 35s under the
	// overlapped gate load and failed the Mobile Empty-state visual spec
	// before retrying. 60s keeps a genuine hang bounded while absorbing the
	// scheduler jitter the old budget could not.
	timeout: 60000,
	// No retries: a red test fails the gate on the first failure so flakes
	// stay visible instead of being absorbed. Use
	// `node scripts/repeat-tests.mjs --suite canary` to measure a suspected
	// flake's hit rate, then fix the root cause.
	retries: 0,
	use: {
		baseURL,
		screenshot: "only-on-failure",
	},
	// Never reuse a running stack: a server orphaned by a crashed run (or by
	// an older config without the scratch env isolation) would silently
	// serve every later invocation with stale projects, an old harness, or
	// a stuck-tripped breaker. Always provision fresh; teardown stays with
	// Playwright on clean exit.
	webServer: usesOperatorStack
		? [
				{
					command: "node ../api/index.js",
					url: `${apiURL}/status`,
					reuseExistingServer: false,
					timeout: 120000,
				},
				{
					command: "npm run dev --prefix ../frontend",
					url: baseURL,
					reuseExistingServer: false,
					timeout: 120000,
				},
			]
		: [
				{
					command: "node ../api/index.js",
					url: `${apiURL}/status`,
					reuseExistingServer: false,
					timeout: 120000,
					env: {
						PORT: apiPort,
						PROJECTS_ROOT: scratchProjectsRoot,
						NOTES_SPACE_ROOT: scratchNotesRoot,
						// Keep the autonomous dispatcher off: the specs create passive
						// in_stage fixtures and drive every stage explicitly; without
						// this the scheduler completes them mid-test (header note).
						KAINBAIN_DISABLE_SCHEDULER: "true",
						// Isolate containment state (see scratchCircuitFile): a
						// tripped scratch breaker must never reach prod's file.
						KAINBAIN_CIRCUIT_STATE_FILE: scratchCircuitFile,
						// Run agent stages on the zero-credential mock harness:
						// the suite asserts flow/UI behavior, never model
						// output, and ambient model defaults rot (a dead
						// external default 404ed every agent run, tripped the
						// breaker, and 409ed the engine-driven specs).
						KAINBAIN_DEFAULT_HARNESS: "mock",
						// The specs drive the legacy embedded agent loop end
						// to end (execute -> survey/human -> advance). Keep
						// the runner-only production default off here: there
						// is no live Runner in the scratch stack, so servable
						// agent stages would defer forever and never reach
						// the stages under test.
						KAINBAIN_RUNNER_EXECUTION_ONLY: "false",
						// Pin hermetic transport for vibe and muse so model enumeration
						// does not attempt host ACP/MSP spawns (mirrors isolatedTestRoots.js).
						KAINBAIN_VIBE_ACP: "off",
						KAINBAIN_MUSE_MSP: "off",
						// The canary suite assumes the seeded sample pipeline
						// (Project A with Idea/... stages). Seed it even though
						// production default keeps the board empty.
						KAINBAIN_SEED_SAMPLE_PROJECTS: "true",
						// D11: specs create projects through the UI without a
						// remote; give the scratch stack a fixture template so
						// creation succeeds (`git remote add` is local — no
						// network). Specs never assert push behavior.
						KAINBAIN_GIT_REMOTE_TEMPLATE:
							"https://git.example.com/canary/${SLUG}.git",
					},
				},
				{
					command: `npm run dev --prefix ../frontend -- --port ${vitePort} --strictPort`,
					url: baseURL,
					reuseExistingServer: false,
					timeout: 120000,
					env: {
						VITE_API_BASE: apiURL,
						VITE_WS_URL: apiURL.replace(/^http/, "ws"),
					},
				},
			],
	reporter: [["html", { open: "never" }], ["list"]],
};
