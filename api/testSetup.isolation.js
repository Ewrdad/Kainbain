import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: test-setup isolation
 * @description Vitest `setupFiles` entry (see `api/vitest.config.js`): mints
 *   throwaway projects/notes roots and points the stores at them via
 *   `PROJECTS_ROOT` / `NOTES_SPACE_ROOT` BEFORE any test file is imported.
 *
 *   Setup files execute before the test module graph is evaluated in each
 *   worker, so the config loader's import-time env snapshot always sees the
 *   temp roots — no suite in the standard run can read or write the live
 *   projects root or the live notes space, regardless of import
 *   order, worker reuse, or whether the file follows the per-file
 *   `isolatedTestRoots.js` convention (those files simply mint their own
 *   pair on top; this is the backstop beneath them).
 *
 *   Each test file gets a fresh worker module registry, so every file mints
 *   its own pair of temp dirs. They are intentionally NOT removed here: a
 *   setup file has no per-file teardown hook, and the dirs live under the OS
 *   temp dir where the platform reclaims them. Suites that want a clean
 *   post-run state keep using the per-file convention with `afterAll`
 *   removal.
 * @example PROJECTS_ROOT=/tmp/kainbain-test-projects-XXXX (never ~/projects)
 */
export const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
export const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
// Tier-5 containment state is durable, so the standard suite MUST NOT touch
// the live `~/.kainbain/engine/circuit.json` — a test trip would then gate
// the running engine. Point it at a per-file temp file before config loads.
export const tempCircuitStateFile = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-circuit-")),
	"circuit.json",
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;
process.env.KAINBAIN_CIRCUIT_STATE_FILE = tempCircuitStateFile;
// The adopted-projects registry is ALSO machine-global by default
// (`~/.kainbain/projects.json`): multi-root suites must never read the live
// registry (a live entry would leak foreign projects into assertions) nor
// write it. Point it at a per-file temp file before config loads.
export const tempProjectsRegistryFile = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-registry-")),
	"projects.json",
);
process.env.KAINBAIN_PROJECTS_REGISTRY_FILE = tempProjectsRegistryFile;
// The prompt-layout store is ALSO machine-global by default
// (`~/.kainbain/prompt-layout/prompt-layout.json`): a live custom layout that
// omits conditional tokens (e.g. `{{reporting}}`) would otherwise leak into
// prompt-curation suites and drop sections the default layout renders
// (2026-10-12 incident: `promptCuration.*` reporting tests failed on a host
// whose live layout omitted `{{reporting}}` while CI stayed green). Point it
// at a per-file temp dir before config loads; an empty dir resolves to
// DEFAULT_PROMPT_LAYOUT, so layout-conditional sections keep default
// behaviour in every environment.
export const tempPromptLayoutDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-prompt-layout-"),
);
process.env.KAINBAIN_PROMPT_LAYOUT_DIR = tempPromptLayoutDir;
// WP-4.1 durable fleet state is ALSO machine-global by default
// (`~/.kainbain/engine/{claims,runners,steers,fleet-catalog}.json`): any
// suite that registers a runner or reads the fleet catalogue would
// otherwise read and write the LIVE engine files (2026-11 incident:
// `test-fleet-muse` / `muse::meta::test-fleet-model` leaked into
// production on every suite run — survey q14 forbids dummy/test models
// in production). Point all four at per-file temp files before config
// loads. Mirrors the per-file block in `isolatedTestRoots.js`
// (`tempStateFiles`); keep basenames identical so basename assertions
// (e.g. `fleetModelSnapshot.test.js`) keep passing. See the structural
// guard in `flow/resolveStatePath.js` and `flow/engineStateIsolation.test.js`.
/***
 * MARK: makeTempEngineStateFile
 * @description Mints one throwaway engine-state file path: a fresh temp
 *   dir holding `name`, so every suite writes its own copy and the live
 *   `~/.kainbain/engine/` is never touched.
 * @example makeTempEngineStateFile('runners.json') => '/tmp/kainbain-test-state-XXXX/runners.json'
 ***/
function makeTempEngineStateFile(name) {
	return path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-state-")),
		name,
	);
}
/***
 * MARK: tempEngineStateFiles
 * @description Per-file temp durable-state paths for the WP-4.1 fleet
 *   stores (claims, runners, steers, fleet catalogue): the global setup
 *   backstop, so no suite touches the live `~/.kainbain/engine/`.
 * @example import { tempEngineStateFiles } from "./testSetup.isolation.js"
 ***/
export const tempEngineStateFiles = {
	claims: makeTempEngineStateFile("claims.json"),
	runners: makeTempEngineStateFile("runners.json"),
	steers: makeTempEngineStateFile("steers.json"),
	fleetCatalog: makeTempEngineStateFile("fleet-catalog.json"),
};
process.env.KAINBAIN_CLAIM_STATE_FILE = tempEngineStateFiles.claims;
process.env.KAINBAIN_RUNNER_STATE_FILE = tempEngineStateFiles.runners;
process.env.KAINBAIN_STEER_STATE_FILE = tempEngineStateFiles.steers;
process.env.KAINBAIN_FLEET_CATALOG_FILE = tempEngineStateFiles.fleetCatalog;
/***
 * MARK: tempAuthStateDir
 * @description Per-file temp auth state dir: the auth store is ALSO
 *   engine-scoped by default (`~/.kainbain/engine/auth/`), and
 *   `api/index.js` boots `createAuthService` on every app import, so
 *   without this pin any suite that saves access overrides (or signs a
 *   user in through the app) would write LIVE users/sessions/audit
 *   rows. Mirrors `tempIsolatedAuthStateDir` in `isolatedTestRoots.js`;
 *   the loud guard lives in `auth/accessConfig.js`
 *   (`resolveAuthStateDir`).
 * @example tempAuthStateDir => '/tmp/kainbain-test-auth-XXXX'
 ***/
export const tempAuthStateDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-auth-"),
);
process.env.KAINBAIN_AUTH_STATE_PATH = tempAuthStateDir;
// The accessibility-feedback inbox is ALSO machine-global by default
// (`~/.kainbain/accessibility-feedback.jsonl`): any suite that boots the
// full app (`api/index.js` registers `accessibilityRoutes` with `{ deps }`
// only, no `feedbackFile` opt) and POSTs feedback would otherwise append
// test reports to the LIVE user inbox (2026-11 incident, residual D9 of
// 99ccc12f — the inbox lives directly under `~/.kainbain/`, outside
// `~/.kainbain/engine/`, so the engine guard is a no-op for it). Point it
// at a per-file temp file before config loads. Mirrors
// `makeTempEngineStateFile` (keep the real basename so any basename
// assertion keeps passing). The structural guard lives in
// `flow/resolveStatePath.js`
// (`throwIfLiveAccessibilityFeedbackPathUnderTest`), called from
// `resolveFeedbackFile` in `routes/accessibility.js` (task b3dec9b0).
/***
 * MARK: tempAccessibilityFeedbackFile
 * @description Per-file temp accessibility-feedback inbox: the global setup
 *   backstop, so no suite touches the live
 *   `~/.kainbain/accessibility-feedback.jsonl`.
 * @example import { tempAccessibilityFeedbackFile } from "./testSetup.isolation.js"
 ***/
export const tempAccessibilityFeedbackFile = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-a11y-")),
	"accessibility-feedback.jsonl",
);
process.env.KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE = tempAccessibilityFeedbackFile;
// Host resource probes are ALSO live by default: `probeMemoryUsagePct()`
// reads `os.freemem()`, which the CI storm (200+ vitest workers on a 16 GB
// box) inflates past the 95% critical threshold. Any synthetic scheduler
// store that takes three ticks then trips the engine mid-test — the
// `flow/schedulerIdle.test.js` flake (`expected undefined to be 'passed'`,
// `expected false to be true`). A test must never depend on host load, so
// pin host memory probing off at the same seam as the circuit state file.
// `flow/circuitSensors.test.js` re-enables the sensor locally to exercise
// its logic with injected probes.
process.env.KAINBAIN_CIRCUIT_MEM_ENABLED = "false";
// Runner-only execution is the production default, but the standard suite
// exercises the legacy embedded agent path (the rollback hatch): pin the
// flag off for every suite so embedded-execution tests keep running the
// code they cover. Suites that verify runner-only behavior opt back in
// explicitly per test (see `flow/execution/executeStage.cutover.test.js`).
// NOTE: keep this pin HERE, not as a `VAR=` prefix on the `test` script in
// api/package.json — a shell env prefix breaks Windows `cmd` and fails the
// `tests/entry-platform.test.mjs` gate. Setup files run before each
// worker's test imports, so import-time config reads see this value.
process.env.KAINBAIN_RUNNER_EXECUTION_ONLY = "false";
