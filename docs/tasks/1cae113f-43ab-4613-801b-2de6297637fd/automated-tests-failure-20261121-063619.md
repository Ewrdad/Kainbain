<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Surface runner git/commit and pre-commit hook failures clearly in the UI
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 259.107s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 117 packages, and audited 118 packages in 852ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207 (verdict.json + untrimmed failed-branch logs land here)
Dependencies missing for api (@earendil-works/pi-coding-agent, @fastify/cors, @fastify/multipart, @fastify/static, @fastify/swagger, @fastify/swagger-ui, @fastify/websocket, @opencode-ai/sdk, adm-zip, eslint-config-prettier, fastify, jose, semver, uuid, web-push, @vitest/coverage-v8, eslint, eslint-plugin-n, eslint-plugin-security, globals, vite, vitest) — installing (npm install --prefix api)...
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 351 packages, and audited 352 packages in 4s

85 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, mermaid, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 535 packages, and audited 536 packages in 5s

146 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 661ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (37 files in 124ms)
✅ Frontend imports check passed (755 files in 454ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Proof Hygiene
▸ started Binary Guard
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;32mPASS[0m (237s)
Running Unit Tests (frontend)... [0;32mPASS[0m (237s)
Running Unit Tests (runner)... [0;31mFAIL[0m (237s)
----------------------------------------------------------------------
Details for Unit Tests (runner):
Full log: Unit Tests (runner) → /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/unit-tests-runner.full.log
(trimmed 652 of 772 lines; showing the tail)
✔ validateManifest requires (0.622814ms)
▶ versionSatisfiesRange
  ✔ evaluates the repo's own range vocabulary (5.596191ms)
  ✔ supports || alternation (0.154055ms)
  ✔ reads unsupported or malformed ranges as unsatisfied (fail closed) (1.675184ms)
✔ versionSatisfiesRange (7.602597ms)
▶ checkBackendCompat
  ✔ treats legacy manifests and unknown backends as compatible (0.677255ms)
  ✔ gates on the range when both sides are known (0.248149ms)
  ✔ fails closed on unparseable ranges and versions (0.111552ms)
✔ checkBackendCompat (1.210467ms)
▶ filterReleaseCandidate
  ✔ selects a newer compatible release with a platform asset (5.46331ms)
  ✔ never downgrades and skips pre-releases (0.175431ms)
  ✔ skips incompatible releases and missing assets (0.151108ms)
✔ filterReleaseCandidate (8.459268ms)
▶ githubReleasesListUrl / tagVersionFor
  ✔ derives the bounded list URL from the default pointer (0.373336ms)
  ✔ reads versions off runner tags, null when unreadable (0.307472ms)
✔ githubReleasesListUrl / tagVersionFor (0.836941ms)
▶ validateReleasesIndex
  ✔ accepts a well-formed index and an empty one (0.321901ms)
  ✔ rejects malformed indexes and entries (1.789018ms)
✔ validateReleasesIndex (2.329228ms)
(node:1026491) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/updates-platform.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ detectUpdatePlatform
  ✔ accepts the four v1 targets (3.600272ms)
  ✔ rejects Windows and unknown arches (0.215933ms)
✔ detectUpdatePlatform (9.849636ms)
▶ assetNameFor
  ✔ builds the canonical filename and strips a v prefix (7.273322ms)
  ✔ throws UNSUPPORTED_PLATFORM for Windows (0.506554ms)
✔ assetNameFor (8.028923ms)
(node:1026572) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/updates-state.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ readUpdateState / writeUpdateState
  ✔ starts idle and round-trips (5.38061ms)
✔ readUpdateState / writeUpdateState (17.927007ms)
▶ acquireUpdateLock
  ✔ grants one holder and releases (3.883775ms)
  ✔ recovers a stale lock left by a dead process instead of bricking updates (0.60703ms)
  ✔ recovers the legacy bare-pid lock format when its holder is gone (0.470633ms)
  ✔ recovers by timestamp when the holder pid is alive but the lock is ancient (10.66043ms)
  ✔ keeps a live holder's lock (same-process contention still loses) (0.512854ms)
✔ acquireUpdateLock (25.993514ms)
▶ pruneOldReleases
  ✔ keeps current + previous and drops older versions (1.334052ms)
  ✔ keeps everything when no link resolves inside releases/ (fail-safe) (11.021041ms)
  ✔ prunes superseded versions on markUpdateSuccess, keeps current + previous (0.792661ms)
✔ pruneOldReleases (13.495616ms)
▶ bootstrapUpdateState
  ✔ passes through when idle (0.521662ms)
  ✔ counts pending-boot attempts without rolling back early (0.572515ms)
  ✔ rolls back to previous on the third crashed boot (16.523578ms)
  ✔ marks success after a good boot (0.437889ms)
✔ bootstrapUpdateState (18.296879ms)
▶ requestWrapperRestart
  ✔ writes the restart-requested sentinel with a triage payload (0.518943ms)
  ✔ creates a missing install root (0.310282ms)
  ✔ throws fail-closed without an install root (0.531273ms)
✔ requestWrapperRestart (11.062486ms)
(node:1026709) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/updates-verify.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ verifyManifestSignature
  ✔ accepts a manifest signed by the test key (27.755448ms)
  ✔ rejects a tampered manifest (version bumped after signing) (8.579334ms)
  ✔ rejects a tampered signature (3.558614ms)
  ✔ rejects a signature from a different key (0.561387ms)
  ✔ rejects against the pinned release key (test sig is not a release sig) (6.827977ms)
✔ verifyManifestSignature (55.722627ms)
▶ verifyAssetBytes / verifyAssetFile
  ✔ accepts matching bytes and rejects flipped bytes (6.763899ms)
  ✔ verifies a file on disk by streaming (42.847648ms)
✔ verifyAssetBytes / verifyAssetFile (50.72836ms)
(node:1026875) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/updates-wrapper.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ kainbain-runner wrapper restart gate
  ✔ stops after a normal completion instead of re-running finished work (146.525269ms)
  ✔ restarts exactly once into a staged update, then stops (2388.148018ms)
  ✔ propagates a daemon failure without restarting (153.135003ms)
  ✔ reboots the same tree once on a restart-requested sentinel, then stops (2334.776601ms)
  ✔ consumes a stale sentinel with exactly one extra boot (2317.308964ms)
✔ kainbain-runner wrapper restart gate (7343.500726ms)
▶ kainbain-runner doctor
  ✔ reports a healthy wrapper install as ok with the backend record (595.316374ms)
  ✔ flags a direct node main.js entrypoint with exit 1 (595.900714ms)
  ✔ flags a missing current symlink with exit 1 (505.404218ms)
  ✔ reports an unreachable backend but keeps exit 0 (network state, not install damage) (760.875301ms)
  ✔ writes nothing: the tree is byte-identical before and after (751.984151ms)
  ✔ supports --verify-install and --unit filtering (2013.449214ms)
✔ kainbain-runner doctor (5223.823801ms)
ℹ tests 486
ℹ suites 91
ℹ pass 485
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 25333.260912

✖ failing tests:

test at runner/daemon.test.js:3673:2
✖ settles a hook-rejected merge commit as failed with detail instead of crashing (756.755713ms)
  TypeError: client.verifySha is not a function
      at executeIntegrationAssignment (file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/daemon.js:2597:18)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async runSingleAssignment (file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/daemon.js:2709:18)
      at async TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/runner/daemon.test.js:3710:15)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7)
----------------------------------------------------------------------
Running Linting (api)... [0;32mPASS[0m (237s)
Running Linting (frontend)... [0;32mPASS[0m (237s)
Running Frontend Build... [0;32mPASS[0m (237s)
Running Security Script Tests... [0;32mPASS[0m (237s)
Running Dependency Check... [0;32mPASS[0m (237s)
Running Dependency Audit Gate... [0;32mPASS[0m (237s)
Running Proof Hygiene... [0;32mPASS[0m (237s)
Running Binary Guard... [0;32mPASS[0m (237s)
Running Harness Self-Tests... [0;32mPASS[0m (237s)
Running Container Tests... [0;32mPASS[0m (237s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (runner)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (runner)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (runner) → /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/unit-tests-runner.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (runner); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (runner)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (runner)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (runner) → /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/unit-tests-runner.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-1cae113f-43ab-4613-801b-2de6297637fd/docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/ci-fast-gate-20261121-063207/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.