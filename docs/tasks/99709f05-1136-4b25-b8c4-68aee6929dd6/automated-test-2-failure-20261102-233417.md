<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Everything seems to always say it's retrying ![18851.png](assets/18851.png) Retrying should be reserved for if something goes wrong on the current stage and for whatever reason we don't fail the stage and just want to retry in place . If it moves stage it shouldn't be retrying. Idk if it is tied to where the history on a task looks like it spams stage multiple times so that may need a look Please fix ![18852.png](assets/18852.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1590.87s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
[32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 600121[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 600113[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 6[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m gitGate.test.js[2m > [22mgit() per-repository serialization gate[2m > [22mnever runs two git processes on the same repo at once
[31m[1mGitError[22m: git checkout kb/task-a timed out after 600000ms[39m
[36m [2m❯[22m Timeout._onTimeout git/exec.js:[2m124:5[22m[39m
    [90m122|[39m    // live-holder check) and recovers only provably stale locks.
    [90m123|[39m    reject(
    [90m124|[39m     new GitError(`git ${args.join(" ")} timed out after ${timeout}ms`,…
    [90m   |[39m     [31m^[39m
    [90m125|[39m      args,
    [90m126|[39m      stdout,

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m372 passed[39m[22m[90m (373)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6165 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6167)[39m
[2m   Start at [22m 23:07:56
[2m   Duration [22m 744.48s[2m (tests 89%, import 8%, transform 3%)[22m

[2m    Isolate [22m [33m373 workers spawned[39m[2m · ~104ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~12.87s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (746s)
Running Unit Tests (runner)... [0;32mPASS[0m (746s)
Running Linting (api)... [0;32mPASS[0m (746s)
Running Linting (frontend)... [0;32mPASS[0m (746s)
Running Frontend Build... [0;32mPASS[0m (746s)
Running Security Script Tests... [0;32mPASS[0m (746s)
Running Dependency Check... [0;32mPASS[0m (746s)
Running Dependency Audit Gate... [0;32mPASS[0m (746s)
Running Harness Self-Tests... [0;31mFAIL[0m (746s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 455 of 575 lines; showing the tail)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.21434ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.090919ms)
  ✔ opts out via --no-canary (0.072489ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.071203ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.089958ms)
  ✔ skip flags win over the legacy opt-in flags (0.079403ms)
✔ resolveCanary (0.810809ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (2.109776ms)
  ✔ reports true when the root tree carries the Windows binary (3.026331ms)
  ✔ reports false when the platform's binary name is missing (1.720178ms)
  ✔ reports false when the root tree has no binaries at all (14.921232ms)
✔ depcheckAvailable (22.020537ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (4.093867ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (3.917715ms)
  ✔ reports not installed when a package manifest is unreadable (1.68098ms)
✔ workspaceDepsInstalled (9.898125ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (11.485389ms)
  ✔ does not spawn when every workspace dependency is already present (0.782244ms)
  ✔ installs each missing package through npm and re-verifies (21.306007ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (0.818003ms)
✔ ensureWorkspaceDeps (44.480333ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (17.927292ms)
  ✔ returns zero and does not throw when directory does not exist (0.267151ms)
✔ pruneStaleTestDirectories (18.364739ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (24.80383ms)
  ✔ still builds plain final versions (0.750836ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (24.823802ms)
  ✔ sha256FileHex matches the manifest's hashing (0.397731ms)
✔ buildManifest (56.453931ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (181.532286ms)
  ✔ rejects non-semver versions instead of tarring them (0.600551ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.471607ms)
  ✔ agrees with buildManifest on the asset filename grammar (417.002146ms)
✔ packageRunner (600.087337ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (1.405268ms)
✔ installSteps (2.572097ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (60.142324ms)
  ✔ root .npmrc documents the per-dir mirrors (0.417526ms)
✔ installSteps npmrc (60.795883ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.404659ms)
  ✔ installs the browser alone on macOS and Windows (0.455429ms)
✔ playwrightAttempts (1.087383ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.349748ms)
✔ npxExecutable (0.748506ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (1.099741ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.461575ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.446261ms)
✔ browserInstallTargets (3.488195ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-pRiz6O/Sanity/docs' -> '/tmp/kainbain-sanity-notes-qeRVUA/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-kbiu1g/Sanity/docs' -> '/tmp/kainbain-sanity-notes-nAK3T2/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-kbiu1g/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-nAK3T2/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-kbiu1g/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-nAK3T2/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-3GlZJL/Sanity/docs' -> '/tmp/kainbain-sanity-notes-vHUpNl/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-xc4N0F/Sanity/docs' -> '/tmp/kainbain-sanity-notes-07bPY4/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-xc4N0F/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-07bPY4/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-xc4N0F/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-07bPY4/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-fwUuEq/Sanity/docs' -> '/tmp/kainbain-sanity-notes-x7xfaP/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-T8DKOF/Sanity/docs' -> '/tmp/kainbain-sanity-notes-J64fIg/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-T8DKOF/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-J64fIg/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-T8DKOF/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-J64fIg/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (39.062996ms)
  ✔ leaves no fixture residue in the OS temp dir (517.25811ms)
✔ checkStorageSanity (562.363571ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (7.175814ms)
  ✔ rejects a missing entry path or a different file (0.264206ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1030.586958ms)
✔ isMainModule (1038.410695ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (2.86632ms)
  ✔ returns 0 when the notes space has no tasks dir (0.843389ms)
✔ countNotesTasks (4.020588ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (312.649537ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (370.974567ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (305.876236ms)
  ✔ is idempotent: a second run appends no duplicate history (424.813364ms)
  ✔ leaves an already-current primary manifest alone (171.812546ms)
✔ scripts/sync-tip-dist.mjs (1605.339707ms)
ℹ tests 345
ℹ suites 89
ℹ pass 344
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 31403.618711

✖ failing tests:

test at tests/entry-platform.test.mjs:73:3
✖ api test runs under Windows cmd (no VAR= prefix) (1.054794ms)
  AssertionError [ERR_ASSERTION]: api test still has a shell env prefix
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/tests/entry-platform.test.mjs:76:11)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (746s)
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
⏳ still running: Canary Tests (11m30s)
⏳ still running: Canary Tests (12m00s)
⏳ still running: Canary Tests (12m30s)
⏳ still running: Canary Tests (13m00s)
⏳ still running: Canary Tests (13m30s)
Running Canary Tests... [0;31mFAIL[0m (836s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 531 of 651 lines; showing the tail)

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  12) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 15000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:34

      32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      35 | 		timeout: 15000,
      36 | 	});
      37 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  13) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 15000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:34

      32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      35 | 		timeout: 15000,
      36 | 	});
      37 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  14) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 15000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:34

      32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      35 | 		timeout: 15000,
      36 | 	});
      37 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/workflow.spec.js:58:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  14 failed
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
  121 passed (13.9m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.