<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** please fix horizontal scroll on bottom bar on mobile ![18848.png](assets/18848.png) Currently you can only see one runner which is frustrating and problematic. It should be horizontally scrollable and workable
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1149.037s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
 ✔ passes through when idle (2.161426ms)
  ✔ counts pending-boot attempts without rolling back early (3.767311ms)
  ✔ rolls back to previous on the third crashed boot (1.150167ms)
  ✔ marks success after a good boot (0.57262ms)
✔ bootstrapUpdateState (8.062611ms)
(node:845481) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/runner/updates-verify.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ verifyManifestSignature
  ✔ accepts a manifest signed by the test key (19.415449ms)
  ✔ rejects a tampered manifest (version bumped after signing) (4.756857ms)
  ✔ rejects a tampered signature (1.106179ms)
  ✔ rejects a signature from a different key (11.995233ms)
  ✔ rejects against the pinned release key (test sig is not a release sig) (0.604082ms)
✔ verifyManifestSignature (45.91146ms)
▶ verifyAssetBytes / verifyAssetFile
  ✔ accepts matching bytes and rejects flipped bytes (7.345117ms)
  ✔ verifies a file on disk by streaming (54.417206ms)
✔ verifyAssetBytes / verifyAssetFile (62.614857ms)
(node:845519) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/runner/updates-wrapper.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ kainbain-runner wrapper restart gate
  ✔ stops after a normal completion instead of re-running finished work (135.722511ms)
  ✔ restarts exactly once into a staged update, then stops (2294.631683ms)
  ✔ propagates a daemon failure without restarting (74.210976ms)
✔ kainbain-runner wrapper restart gate (2506.988191ms)
ℹ tests 200
ℹ suites 49
ℹ pass 199
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6583.604787

✖ failing tests:

test at runner/project.test.js:254:2
✖ resets a reused clone-mode worktree to the remote branch (311.340163ms)
  Error: Command failed: git commit -qm unpushed leftover
      at genericNodeError (node:internal/errors:986:15)
      at wrappedFn (node:internal/errors:540:14)
      at checkExecSyncError (node:child_process:943:11)
      at execFileSync (node:child_process:979:15)
      at git (file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/runner/project.test.js:21:2)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/runner/project.test.js:270:4)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    status: 128,
    signal: null,
    output: [ null, null, null ],
    pid: 845569,
    stdout: null,
    stderr: null
  }
----------------------------------------------------------------------
Running Linting (api)... [0;32mPASS[0m (197s)
Running Linting (frontend)... [0;32mPASS[0m (197s)
Running Frontend Build... [0;32mPASS[0m (197s)
Running Security Script Tests... [0;32mPASS[0m (197s)
Running Dependency Check... [0;32mPASS[0m (197s)
Running Dependency Audit Gate... [0;32mPASS[0m (197s)
Running Harness Self-Tests... [0;31mFAIL[0m (197s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 480 of 600 lines; showing the tail)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (3.334081ms)
  ✔ returns zero and does not throw when directory does not exist (0.310572ms)
✔ pruneStaleTestDirectories (3.883816ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (4.832648ms)
  ✔ still builds plain final versions (1.845966ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (13.34576ms)
  ✔ sha256FileHex matches the manifest's hashing (1.233299ms)
✔ buildManifest (23.57652ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (14.690591ms)
  ✔ rejects non-semver versions instead of tarring them (0.877404ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (3.453506ms)
  ✔ agrees with buildManifest on the asset filename grammar (442.070389ms)
✔ packageRunner (461.842826ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (22.80007ms)
✔ installSteps (30.047269ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (23.348525ms)
  ✔ root .npmrc documents the per-dir mirrors (0.466497ms)
✔ installSteps npmrc (24.228951ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.469328ms)
  ✔ installs the browser alone on macOS and Windows (7.560911ms)
✔ playwrightAttempts (8.556004ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.351901ms)
✔ npxExecutable (0.685151ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (25.988542ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.358422ms)
  ✔ installs the browser alone for every target on macOS and Windows (1.851469ms)
✔ browserInstallTargets (29.421383ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-JbvTuu/Sanity/docs' -> '/tmp/kainbain-sanity-notes-MWVX00/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-arAXHf/Sanity/docs' -> '/tmp/kainbain-sanity-notes-mLUfOi/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-arAXHf/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-mLUfOi/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-arAXHf/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-mLUfOi/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-usiyJt/Sanity/docs' -> '/tmp/kainbain-sanity-notes-WsnZig/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-LXmP0X/Sanity/docs' -> '/tmp/kainbain-sanity-notes-k1VdZd/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-LXmP0X/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-k1VdZd/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-LXmP0X/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-k1VdZd/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-z06Kxf/Sanity/docs' -> '/tmp/kainbain-sanity-notes-ZEau5Z/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-ahtyT4/Sanity/docs' -> '/tmp/kainbain-sanity-notes-KEkrto/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-ahtyT4/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KEkrto/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-ahtyT4/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KEkrto/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (101.149312ms)
  ✔ leaves no fixture residue in the OS temp dir (130.649376ms)
✔ checkStorageSanity (244.578441ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (11.663238ms)
  ✔ rejects a missing entry path or a different file (1.50993ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2583.988012ms)
✔ isMainModule (2604.134241ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.106562ms)
  ✔ returns 0 when the notes space has no tasks dir (0.901321ms)
✔ countNotesTasks (2.752845ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (865.797798ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (434.432986ms)
  ✔ is idempotent: a second run appends no duplicate history (940.750889ms)
  ✔ leaves an already-current primary manifest alone (375.956881ms)
✔ scripts/sync-tip-dist.mjs (2680.096057ms)
ℹ tests 344
ℹ suites 89
ℹ pass 343
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44699.783865

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (6170.359989ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'defaultModelIdsFor',
  +     file: 'api/aliasTargets.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'runnerMatches',
  +     file: 'api/flow/dispatch/runnerMatches.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'saveValidationProbes',
  +     file: 'api/routes/projects.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'validateModelAliasesPayload',
  +     file: 'api/routes/projects.js',
  +     kind: 'function'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/tests/check-jsdoc-example.test.mjs:164:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { file: 'api/aliasTargets.js', exportName: 'defaultModelIdsFor', kind: 'function' }, { file: 'api/flow/dispatch/runnerMatches.js', exportName: 'runnerMatches', kind: 'function' }, { file: 'api/routes/projects.js', exportName: 'saveValidationProbes', kind: 'function' }, { file: 'api/routes/projects.js', exportName: 'validateModelAliasesPayload', kind: 'function' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (197s)
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
⏳ still running: Canary Tests (14m00s)
Running Canary Tests... [0;31mFAIL[0m (863s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 519 of 639 lines; showing the tail)
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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/task-lifecycle.spec.js:121:3

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/task-lifecycle.spec.js:174:3

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/helpers.js:77:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/canary-e2e/tests/workflow.spec.js:58:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  14 failed
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff 
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
  1 did not run
  120 passed (14.4m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.