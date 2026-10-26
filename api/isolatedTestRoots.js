import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/***
 * MARK: isolated test roots
 * @description Test-only helper: creates throwaway projects/notes roots and
 *   points the stores at them via `PROJECTS_ROOT` / `NOTES_SPACE_ROOT`.
 *
 *   MUST be the first kainbain import in a test file — before any static or
 *   dynamic import that (transitively) reaches `api/config.js`. The config
 *   loader snapshots `process.env` at first evaluation and caches it per
 *   worker, so env assigned after a static `taskStore`/`sessionStore`/route
 *   import is silently ignored and the suite writes to the LIVE roots.
 *   Importing this module first guarantees the snapshot sees the temp roots.
 *
 *   Each test file gets a fresh worker module registry, so every importer
 *   mints its own pair of temp dirs; importers delete them in `afterAll`.
 * @example import { tempProjectsRoot } from "../isolatedTestRoots.js"
 */
export const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
export const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;
// Adopted-projects registry: per-file temp file, mirroring the global setup
// backstop — no suite may read or write the live `~/.kainbain/projects.json`.
export const tempIsolatedRegistryFile = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-registry-")),
	"projects.json",
);
process.env.KAINBAIN_PROJECTS_REGISTRY_FILE = tempIsolatedRegistryFile;

// Hermetic vibe transport: the vibe harness auto-engages its ACP session when
// a `vibe-acp` sibling of the resolved vibe binary EXISTS on the host running
// the suite. Route-level tests (`/compute/models`, `/harnesses`) enumerate
// every harness's catalogue, which would then spawn the REAL `vibe-acp`
// (slow, host-dependent). Pin the legacy exec transport for isolated-roots
// suites; the ACP path has dedicated mock-agent coverage in
// `harnesses/vibe/vibeHarness.acp.test.js` and is unaffected here.
process.env.KAINBAIN_VIBE_ACP = "off";

// Hermetic muse transport: the muse harness auto-engages its MSP session when
// the resolved muse binary advertises `serve` (true on a dev box with muse
// installed). Route-level tests enumerate every harness's catalogue, which
// would then spawn the REAL `muse serve` host. Pin the legacy exec transport
// for isolated-roots suites; the MSP path has dedicated mock-host coverage in
// `harnesses/muse/msp/museMspSession.contract.test.js`.
process.env.KAINBAIN_MUSE_MSP = "off";
