<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Can we make sure the model information is being pased through accurately ![image.png](assets/image.png) We seem to have some sort of regression when moving to the runner architecture where we are reporting default for model constantly. And like in this case reporting a model that isnt in use as its a CI stage I want the runner to be able to accurately report (through the backend) to the ui what model choices etc it is running. And I want to make sure the general model catalogue behaviours work.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 655.081s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 938ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 81ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Dependency Check (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (130s)
Running Unit Tests (frontend)... [0;32mPASS[0m (130s)
Running Unit Tests (runner)... [0;32mPASS[0m (130s)
Running Linting (api)... [0;32mPASS[0m (130s)
Running Linting (frontend)... [0;32mPASS[0m (130s)
Running Frontend Build... [0;32mPASS[0m (130s)
Running Security Script Tests... [0;32mPASS[0m (130s)
Running Dependency Check... [0;32mPASS[0m (130s)
Running Dependency Audit Gate... [0;32mPASS[0m (130s)
Running Harness Self-Tests... [0;31mFAIL[0m (130s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 402 of 522 lines; showing the tail)
Dependencies missing for canary-e2e (@playwright/test) — installing (npm install --prefix canary-e2e)...
Workspace dependencies installed (frontend, canary-e2e).
Dependencies missing for frontend (react) — installing (npm install --prefix frontend)...
▶ buildBranches
  ✔ builds the twelve canonical branches in order when bash and docker exist (43.392946ms)
  ✔ every branch spawns a binary with argv (never a shell string) (8.898519ms)
  ✔ unit tests run at normal priority, the rest low (4.987212ms)
  ✖ runs the runner contract suites through node --test with every runner test file named (4.691567ms)
  ✔ reports SKIP (non-fatal) for Security Script Tests without bash (1.233124ms)
  ✔ reports SKIP (non-fatal) for Container Tests without a docker daemon (0.506424ms)
  ✔ reports SKIP (non-fatal) for Dependency Check without the depcheck binary (2.118841ms)
  ✔ keeps Dependency Check runnable (low priority, via npm) when the binary exists (0.80533ms)
  ✔ container tests run the docker suite through node --test (0.235201ms)
  ✔ harness self-tests run the ported node suites (not the old shell one) (1.927127ms)
  ✔ includes Canary Tests by default (npm test parity with deploy.sh --prod) (0.238041ms)
  ✔ omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1) (0.381553ms)
  ✔ spawns Canary Tests last as npm run test:canary (1.190432ms)
✖ buildBranches (85.262835ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (2.436203ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.436106ms)
✔ splitGatePhases (5.658533ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.227364ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.088543ms)
  ✔ opts out via --no-canary (0.11836ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.098509ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.079472ms)
  ✔ skip flags win over the legacy opt-in flags (0.369292ms)
✔ resolveCanary (2.24252ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (0.956693ms)
  ✔ reports true when the root tree carries the Windows binary (0.923251ms)
  ✔ reports false when the platform's binary name is missing (0.654367ms)
  ✔ reports false when the root tree has no binaries at all (4.054921ms)
✔ depcheckAvailable (8.351995ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (2.631647ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (2.586091ms)
  ✔ reports not installed when a package manifest is unreadable (5.177634ms)
✔ workspaceDepsInstalled (10.63178ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (2.580647ms)
  ✔ does not spawn when every workspace dependency is already present (0.830003ms)
  ✔ installs each missing package through npm and re-verifies (1.251273ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (0.7773ms)
✔ ensureWorkspaceDeps (5.725373ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (0.768789ms)
  ✔ returns zero and does not throw when directory does not exist (0.234044ms)
✔ pruneStaleTestDirectories (1.138578ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (17.660672ms)
✔ installSteps (27.753163ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (41.531734ms)
  ✔ root .npmrc documents the per-dir mirrors (31.019817ms)
✔ installSteps npmrc (129.345841ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (55.138095ms)
  ✔ installs the browser alone on macOS and Windows (81.944495ms)
✔ playwrightAttempts (137.37251ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.863255ms)
✔ npxExecutable (1.118118ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (0.391418ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (13.328707ms)
  ✔ installs the browser alone for every target on macOS and Windows (2.525777ms)
✔ browserInstallTargets (16.547555ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-DsBSdw/Sanity/docs' -> '/tmp/kainbain-sanity-notes-aDMyoV/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-PlSgzQ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-eqGm4Y/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-PlSgzQ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-eqGm4Y/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-PlSgzQ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-eqGm4Y/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-qSSl9W/Sanity/docs' -> '/tmp/kainbain-sanity-notes-LDDtiF/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-yZb0PR/Sanity/docs' -> '/tmp/kainbain-sanity-notes-uOx7vs/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-yZb0PR/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-uOx7vs/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-yZb0PR/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-uOx7vs/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-sB2wtb/Sanity/docs' -> '/tmp/kainbain-sanity-notes-DjAi5e/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-qgih6K/Sanity/docs' -> '/tmp/kainbain-sanity-notes-i4Xpq4/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-qgih6K/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-i4Xpq4/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-qgih6K/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-i4Xpq4/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (43.615057ms)
  ✔ leaves no fixture residue in the OS temp dir (385.943681ms)
✔ checkStorageSanity (440.517519ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.457095ms)
  ✔ rejects a missing entry path or a different file (0.231383ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1415.452278ms)
✔ isMainModule (1416.436069ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (3.272016ms)
  ✔ returns 0 when the notes space has no tasks dir (0.527809ms)
✔ countNotesTasks (4.067401ms)
ℹ tests 313
ℹ suites 80
ℹ pass 312
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29459.542112

✖ failing tests:

test at tests/run-tests.test.mjs:69:2
✖ runs the runner contract suites through node --test with every runner test file named (4.691567ms)
  AssertionError [ERR_ASSERTION]: runner/ciBranchWorkdir.test.js is on disk but not in the gate branch — name it in scripts/run-tests.mjs
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-e3b2624a-bc24-4698-9c78-86af7f6f3b5b/tests/run-tests.test.mjs:88:11)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (130s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
⏳ still running: Canary Tests (3m30s)
⏳ still running: Canary Tests (4m00s)
⏳ still running: Canary Tests (4m30s)
⏳ still running: Canary Tests (5m00s)
⏳ still running: Canary Tests (5m30s)
⏳ still running: Canary Tests (6m00s)
⏳ still running: Canary Tests (6m30s)
⏳ still running: Canary Tests (7m00s)
⏳ still running: Canary Tests (7m30s)
⏳ still running: Canary Tests (8m00s)
⏳ still running: Canary Tests (8m30s)
Running Canary Tests... [0;32mPASS[0m (520s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.