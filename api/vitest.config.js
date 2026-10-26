import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const SHARED_DIR = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
	test: {
		// MARK: global test isolation (testSetup.isolation.js)
		// Every suite runs against throwaway projects/notes roots minted per
		// test file before its imports evaluate, so standard runs can never
		// read or write the live projects root or notes space (2026-10-06
		// incident: unisolated suites POSTed ~44 fixture tasks into the live
		// Ewrdad.github.io project, first in directory order).
		// MARK: worker pool — thread workers, per-file isolation kept ON
		// The api suite is 240+ files that each import the whole app, and the
		// deploy gate runs it inside one overlap window with the frontend suite,
		// lint/build/scans and the Playwright canary on a 4-core, swap-full host.
		// The default `forks` pool pays a full `fork()` per file (~680 MB peak
		// across the tree, measured) and repeatedly tripped vitest's hardcoded
		// 60 s worker-start timeout under that pressure — every occurrence is
		// fatal (`[vitest-pool]: Failed to start forks worker …`), and it is the
		// recurring cause of red `npm test` runs (`routes/workflows.test.js`,
		// `routes/projects.docsSettings.test.js`, …). The `threads` pool spawns
		// the same one worker per file for ~1/6 of the memory (~110 MB measured)
		// because it does not duplicate the process address space per file.
		//
		// `isolate` stays at its default `true`: every file still gets a fresh
		// worker with its own module registry and its own copy of `process.env`
		// (vitest passes `env` to `new Worker(..., { env })`), which is exactly
		// what `testSetup.isolation.js` needs to mint per-file projects roots
		// (2026-10-06 live-root incident). Reusing one module graph across files
		// is NOT safe here — the api stores and `config` are import-time
		// singletons that capture those roots.
		pool: "threads",
		setupFiles: ["./testSetup.isolation.js"],
		// MARK: report-only coverage baseline (WP-1 safety net)
		// `npm run test:coverage` (= `vitest run --coverage`) measures
		// lines/branches/functions for api/work/, api/flow/, api/house/
		// and shared/ — no `thresholds`, no new gate (thresholds arrive in
		// WP-8; exactly three automated gates total). The `include` globs
		// are relative to this config's root (`api/`), so they must stay
		// `work/**`-style, NOT `api/work/**` (a stale CLI-flag script with
		// the `api/` prefix matched zero files — silently empty coverage).
		// `shared/` lives outside the root, hence the absolute SHARED_DIR
		// glob plus `allowExternal`. Vitest's DEFAULT coverage `exclude`
		// already drops `*.test.js`/node_modules — restating `exclude`
		// here would REPLACE those defaults, so do not add one.
		// Raw output lands in `./coverage/` (gitignored); the committed
		// baseline copy lives in `docs/baseline/WP-1-coverage.*`.
		coverage: {
			provider: "v8",
			reporter: ["json-summary", "text", "html"],
			reportsDirectory: "./coverage",
			include: ["work/**", "flow/**", "house/**", "git/**", `${SHARED_DIR}/**`],
			allowExternal: true,
			// MARK: core-module coverage gate (WP-8: exactly three gates)
			// Fixed floor: every measured core module (api/work, api/flow,
			// api/house, api/git, shared) must hold >=70% lines, enforced
			// per file so one thin module cannot hide behind a hot barrel.
			// Reproduce locally with `npm run test:coverage` (root or api).
			thresholds: { lines: 70, perFile: true },
		},
		testTimeout: 120000,
		// MARK: hookTimeout matches testTimeout (deploy-gate flake, 2026-10-05).
		// Under the overlapped gate (api + frontend + lint + build + canary
		// sharing 4 cores with 246 vitest workers), import, server boot, and
		// integration test paths can stretch past 60s under peak CPU contention;
		// 120s provides an honest safety margin so real regressions fail loudly
		// while scheduling starvation does not flake the gate.
		hookTimeout: 120000,
		include: ["**/*.test.js"],
		// MARK: NODE_ENV pin (TEST ENV CONTRACT, api/sessionStore.js)
		// The api test suite runs on the mock session harness, which the
		// sessionStore engages by reading NODE_ENV at module-import time. Vitest
		// only *defaults* NODE_ENV to "test" when it is unset, so an inherited
		// value (e.g. NODE_ENV=production from a deployed service shell or CI
		// runner) would silently disengage the seam and spin up REAL pi agent
		// sessions. Setting it here overrides any inherited value, making the
		// suite hermetic in every environment. `api/testEnvGuard.test.js` fails
		// loudly if this pin ever stops landing before module import.
		env: {
		NODE_ENV: "test",
		// MARK: gate-tolerant agy discovery watchdog (same seam philosophy as
		// the AGY bin pin below). Under the overlapped `npm test` gate the api
		// suite shares 4 cores with ~10 other branches; a spawned mock-agy
		// child can take far longer than the 15s production watchdog to be
		// scheduled and exit, which would misclassify a healthy CLI as
		// AGY_MODELS_TIMEOUT and flake discovery-path assertions. 60s keeps
		// real hangs loud (well under vitest's 90s testTimeout) while
		// scheduling starvation no longer flakes the gate. Production keeps
		// the 15s default.
		KAINBAIN_AGY_MODELS_TIMEOUT_MS: "60s",
			// MARK: hermetic agy CLI (same seam philosophy as the NODE_ENV pin).
			// The antigravity harness's model discovery spawns `config.agyBin`
			// (default "agy") whenever the model cache is bypassed, so every
			// `?refresh=true` listing through /compute/models and
			// /harnesses/:id/models would otherwise pay a REAL CLI spawn per test
			// when agy is installed on the host (~2s each — the api suite's
			// dominant wall-time source) and the route tests would behave
			// differently on hosts with vs without the CLI. Pinning it to the
			// repo's deterministic fixture mock (~35ms, no network, same wire
			// output the antigravity suites already assert against) keeps those
			// route tests hermetic and fast everywhere. Pre-existing seam: the
			// fixture is the same mock the antigravity harness
			// contract/integration tests drive (agyHarness.js: `deps.agyBin —
			// tests use the fixture mock`).
			KAINBAIN_AGY_BIN: fileURLToPath(
				new URL(
					"./agent/harnesses/antigravity/fixtures/mock-agy.mjs",
					import.meta.url,
				),
			),
			// MARK: hermetic muse transport (same seam philosophy as the AGY pin).
			// `KAINBAIN_MUSE_MSP=auto` (production default) engages the MSP
			// transport whenever the host has a muse binary advertising `serve`
			// (true on dev boxes), which would make registry/route tests spawn a
			// REAL `muse serve` host and flip muse's modelSelection from "none"
			// to "list" depending on the host. Pinning the exec transport keeps
			// the suite hermetic and identical everywhere; the MSP path has
			// dedicated mock-host coverage in
			// `agent/harnesses/muse/msp/museMspSession.contract.test.js`.
			KAINBAIN_MUSE_MSP: "off",
		},
	},
});
