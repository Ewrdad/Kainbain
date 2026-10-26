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
