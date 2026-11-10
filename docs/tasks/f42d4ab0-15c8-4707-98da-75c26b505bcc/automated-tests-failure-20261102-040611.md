<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 3983.068s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
nd` for details

7 moderate severity vulnerabilities

To address all issues possible (including breaking changes), run:
  npm audit fix --force

Some issues need review, and may require choosing
a different dependency.

Run `npm audit` for details.
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 418 packages, and audited 419 packages in 3s

143 packages are looking for funding
  run `npm fund` for details

6 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 702ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (30 files in 90ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (165s)
Running Unit Tests (frontend)... [0;32mPASS[0m (165s)
Running Unit Tests (runner)... [0;32mPASS[0m (165s)
Running Linting (api)... [0;32mPASS[0m (165s)
Running Linting (frontend)... [0;32mPASS[0m (165s)
Running Frontend Build... [0;32mPASS[0m (165s)
Running Security Script Tests... [0;32mPASS[0m (165s)
Running Dependency Check... [0;32mPASS[0m (165s)
Running Dependency Audit Gate... [0;32mPASS[0m (165s)
Running Harness Self-Tests... [0;31mFAIL[0m (165s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 459 of 579 lines; showing the tail)
  ✔ reports true when the root tree carries the posix binary (0.60122ms)
  ✔ reports true when the root tree carries the Windows binary (0.329226ms)
  ✔ reports false when the platform's binary name is missing (0.294657ms)
  ✔ reports false when the root tree has no binaries at all (0.202656ms)
✔ depcheckAvailable (1.618718ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (48.799876ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (8.680684ms)
  ✔ reports not installed when a package manifest is unreadable (6.154006ms)
✔ workspaceDepsInstalled (63.838288ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (26.740177ms)
  ✔ does not spawn when every workspace dependency is already present (0.901136ms)
  ✔ installs each missing package through npm and re-verifies (15.006805ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (1.087305ms)
✔ ensureWorkspaceDeps (47.62446ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (21.830717ms)
  ✔ returns zero and does not throw when directory does not exist (9.147937ms)
✔ pruneStaleTestDirectories (31.137503ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (6.97061ms)
  ✔ still builds plain final versions (2.622613ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (1.124524ms)
  ✔ sha256FileHex matches the manifest's hashing (9.054221ms)
✔ buildManifest (22.695462ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (41.151445ms)
  ✔ rejects non-semver versions instead of tarring them (0.573918ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (19.509155ms)
  ✔ agrees with buildManifest on the asset filename grammar (111.77922ms)
✔ packageRunner (173.429738ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (5.497515ms)
✔ installSteps (10.771926ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (1.238065ms)
  ✔ root .npmrc documents the per-dir mirrors (0.398131ms)
✔ installSteps npmrc (1.87486ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.33883ms)
  ✔ installs the browser alone on macOS and Windows (0.464018ms)
✔ playwrightAttempts (1.025375ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.355037ms)
✔ npxExecutable (0.738197ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (2.708977ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.306401ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.327988ms)
✔ browserInstallTargets (3.825464ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-cgPRPq/Sanity/docs' -> '/tmp/kainbain-sanity-notes-oKAMP3/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-k2hg5X/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Mhbjfk/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-k2hg5X/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-Mhbjfk/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-k2hg5X/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-Mhbjfk/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Wrs4b7/Sanity/docs' -> '/tmp/kainbain-sanity-notes-fr7REg/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-1FuVHG/Sanity/docs' -> '/tmp/kainbain-sanity-notes-FAXJHg/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-1FuVHG/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-FAXJHg/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-1FuVHG/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-FAXJHg/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-m83fs3/Sanity/docs' -> '/tmp/kainbain-sanity-notes-wGBn6Z/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-6UYatQ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-dbm5tB/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-6UYatQ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-dbm5tB/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-6UYatQ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-dbm5tB/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (8.385796ms)
  ✔ leaves no fixture residue in the OS temp dir (131.430118ms)
✔ checkStorageSanity (141.134978ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.478755ms)
  ✔ rejects a missing entry path or a different file (0.834155ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1046.819352ms)
✔ isMainModule (1048.441291ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (9.504659ms)
  ✔ returns 0 when the notes space has no tasks dir (9.648522ms)
✔ countNotesTasks (21.682443ms)
ℹ tests 337
ℹ suites 87
ℹ pass 336
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 35425.903148

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (5284.892318ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'FailureMessage',
  +     file: 'frontend/src/components/tasks/FailureMessage.jsx',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'FailureMessageImage',
  +     file: 'frontend/src/components/tasks/FailureMessageImage.jsx',
  +     kind: 'function'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/tests/check-jsdoc-example.test.mjs:164:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { file: 'frontend/src/components/tasks/FailureMessage.jsx', exportName: 'FailureMessage', kind: 'function' }, { file: 'frontend/src/components/tasks/FailureMessageImage.jsx', exportName: 'FailureMessageImage', kind: 'function' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (165s)
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
⏳ still running: Canary Tests (9m00s)
⏳ still running: Canary Tests (9m30s)
⏳ still running: Canary Tests (10m00s)
⏳ still running: Canary Tests (10m30s)
⏳ still running: Canary Tests (11m00s)
Running Canary Tests... [0;31mFAIL[0m (676s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 200 of 320 lines; showing the tail)
    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 0 open tasks across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 0 open tasks across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      46 | 			/Execution queue: \d+ open tasks? across all pipelines/,
      47 | 		);
    > 48 | 		await expect(queueChip).toBeVisible();
         | 		                        ^
      49 | 		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
      50 | 		// No global transport cluster: play/skip live on the runner boxes now,
      51 | 		// so the old engine toggle and Look Back/Forward/Jump/Skip buttons
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/functional.spec.js:48:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/functional-KainBain-Functi-a2303-bar-with-runner-fleet-boxes/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/functional-KainBain-Functi-a2303-bar-with-runner-fleet-boxes/error-context.md

  2) tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 

    Error: expect(locator).toBeVisible() failed

    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 1 open task across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 1 open task across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      152 | 			await expect(
      153 | 				page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
    > 154 | 			).toBeVisible();
          | 			  ^
      155 | 		}
      156 | 	});
      157 |
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/functional.spec.js:154:6

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/functional-KainBain-Functi-2240f-oxes-at-any-supported-width/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/functional-KainBain-Functi-2240f-oxes-at-any-supported-width/error-context.md

  3) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Test timeout of 60000ms exceeded.

    Error: locator.getAttribute: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for locator('div[aria-label^="Execution queue:"]')


      231 | 		// the two seeded B tasks. Captured once; the project switch must not
      232 | 		// move it.
    > 233 | 		const depthLabelOnA = await queueChip(page).getAttribute("aria-label");
          | 		                                            ^
      234 | 		expect(depthLabelOnA).toMatch(
      235 | 			/^Execution queue: \d+ open tasks? across all pipelines$/,
      236 | 		);
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/now-playing-cross-project.spec.js:233:47

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  4) tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 

    Error: expect(locator).toBeVisible() failed

    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 8 open tasks across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 8 open tasks across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      90 | 		await expect(
      91 | 			page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
    > 92 | 		).toBeVisible();
         | 		  ^
      93 | 		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
      94 | 		await expect(page.getByRole("progressbar", { name: "Pipeline progress" })).toHaveCount(0);
      95 | 	});
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/workflow.spec.js:92:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/error-context.md

  Slow test file: tests/accessibility.spec.js (5.6m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  4 failed
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 
  131 passed (11.2m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.