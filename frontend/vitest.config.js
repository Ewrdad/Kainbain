import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// MARK: frontend vitest projects (CI runs under a hard 60s wall-clock cap)
// Two projects split by POOL, which vitest per-file pragmas cannot do (the
// `// @vitest-environment` pragma selects the DOM environment only — this is
// how suite-specific semantics stay pinned while the main project keeps its
// cheap default):
//
// 1. `main` — every suite (all DOM-render and pure-logic suites). happy-dom
//    default env + vmThreads pool: each file still runs in a fresh, fully
//    isolated VM context, but node_modules (react, @testing-library/*,
//    jest-dom, …) are imported NATIVELY once per worker and shared across
//    that worker's files — the biggest CPU item of the old threads/forks
//    pools (each file re-executed the whole dependency graph). Measured on
//    the CI host: 31s → ~20s suite wall standalone, and -10s+ on the
//    overlapped gate pole while the api suite forks.
// 2. `legacy-pool` — suites that prove load- or VM-shared-worker-sensitive
//    under vmThreads (measured flake: StageSkillsPanel native select/option
//    clicks raced its async dropdown ~1-in-4 runs only when sharing a
//    vmThreads worker). They run on a fork pool child process — identical
//    semantics to the pre-vmThreads pool — so pins behave exactly as before.
//    Adding a suite here = one more include line (+ the matching
//    main-project exclude). A DOM suite that ALSO needs the node-only graph
//    must NOT be pinned here as a fix — it must drop the import instead
//    (ObservabilityDashboard.session did exactly that: the real
//    `api/taskStore.js` import flaked under the overlapped gate with
//    `No such built-in module: node:`, so the suite now uses canned
//    real-shaped payloads; see the node-env contract in
//    `tests/run-parallel.test.mjs`).

const baseDefine = {
  // Module-level replacement so `process.env.NODE_ENV` checks inside React's
  // CJS entry points resolve to the development build during tests.
  'process.env.NODE_ENV': JSON.stringify('test'),
};

// MARK: overlapped-gate timeout
// `node scripts/run-tests.mjs` runs this suite in the SAME overlap window as
// the api suite (and lint/build/scans) on a shared 4-core host, which can
// stretch an individual test far past vitest's 5s default — measured flakes:
// `services/taskImages.test.js` ("timed out in 5000ms") and the
// `ObservabilityDashboard` render cascade. The api project raised
// `testTimeout`/`hookTimeout` to 60s for exactly this overlap (see the
// deploy-gate note in `api/vitest.config.js`); mirror it here so a loaded
// gate reports real failures, not scheduling noise.
const OVERLAP_TIMEOUT_MS = 60_000;

const mainProject = defineConfig({
  test: {
    globals: true,
    // happy-dom default: identical @testing-library/react API at ~7s less
    // suite wall time than jsdom. Suites needing jsdom-only semantics
    // (window.confirm stub, assignable navigator.clipboard, submit-button
    // form submission, native select/option clicks) pin back with
    // `// @vitest-environment jsdom`.
    environment: 'happy-dom',
    pool: 'vmThreads',
    testTimeout: OVERLAP_TIMEOUT_MS,
    hookTimeout: OVERLAP_TIMEOUT_MS,
    setupFiles: ['./src/setupTests.js'],
    // React's act() (used by @testing-library/react) is only available in the
    // development build of React. Shells that export NODE_ENV=production would
    // otherwise resolve the production bundle and every component test would
    // fail with "act(...) is not supported in production builds of React".
    env: { NODE_ENV: 'test' },
    // vitest's own default excludes (`**/node_modules/**`, `**/.git/**`) must
    // be restated: a project's custom exclude REPLACES the defaults, and
    // without them this project sweeps dependency test suites (measured: +~700
    // accidental tests, 17 failures in third-party suites).
    exclude: [
      ...configDefaults.exclude,
      // Mirrors legacyPoolProject.include below — every forks-pinned suite
      // must be excluded here or it runs twice (see the pool header).
      'src/components/workflow/StageSkillsPanel.test.jsx',
    ],
  },
  plugins: [react()],
  define: baseDefine,
});

const legacyPoolProject = defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // fork pool: one fresh child process per file (the pre-vmThreads
    // semantics this project exists to preserve — no shared native module
    // state between files on a worker).
    pool: 'forks',
    testTimeout: OVERLAP_TIMEOUT_MS,
    hookTimeout: OVERLAP_TIMEOUT_MS,
    // Restated default excludes (see mainProject) — include-only here would
    // inherit no excludes and sweep node_modules again. (This project's file
    // is the INCLUSION, so it is NOT excluded here — that copy-paste slip
    // silently dropped the suite from the run.)
    exclude: [...configDefaults.exclude],
    setupFiles: ['./src/setupTests.js'],
    include: ['src/components/workflow/StageSkillsPanel.test.jsx'],
    env: { NODE_ENV: 'test' },
  },
  plugins: [react()],
  define: baseDefine,
});

export default defineConfig({
  test: {
    globals: true,
    env: { NODE_ENV: 'test' },
    projects: [mainProject, legacyPoolProject],
  },
});
