<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** refine the runner config page in general settings ![18849.png](assets/18849.png) There's a few obvious issues such as : - the whole box should be clickable not just the runners name - it should auto populated fields even if just left on defaults (namely the file addresses) - the model selection should not just be a text box but should be able to toggle the models aytodetected by the runner.  - there should be a button to manually rekickoff model detection.  - the runner should be able to be updated from this page  There are other need for refinement so don't take this as a complete list just starting points. Do your own refinement
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 3318.089s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
ng-library/dom/dist/query-helpers.js:[2m55:13[22m[39m
[90m [2m❯[22m node_modules/@testing-library/dom/dist/query-helpers.js:[2m95:19[22m[39m
[36m [2m❯[22m src/components/settings/SystemSettingsContent.test.jsx:[2m281:23[22m[39m
    [90m279|[39m       fireEvent.click(screen.getByRole('tab', { name: tab.label }));
    [90m280|[39m       if (tab.showFooterReset) {
    [90m281|[39m         expect(screen.getByRole('button', { name: 'Reset', exact: true…
    [90m   |[39m                       [31m^[39m
    [90m282|[39m       } else {
    [90m283|[39m         expect(

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m290 passed[39m[22m[90m (291)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m3977 passed[39m[22m[90m (3978)[39m
[2m   Start at [22m 19:02:30
[2m   Duration [22m 80.67s[2m (tests 49%, setup 22%, worker 9%, environment 7%, import 7%, transform 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;31mFAIL[0m (197s)
----------------------------------------------------------------------
Details for Unit Tests (runner):
(trimmed 293 of 413 lines; showing the tail)
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ update channel fixture (local HTTP mirror)
  ✔ updates end-to-end: check, verify, stage, flip, boot, success (256.933311ms)
  ✔ tampered asset aborts with the install untouched (A3) (103.873865ms)
  ✔ tampered manifest aborts before any download (A3) (57.13624ms)
✔ update channel fixture (local HTTP mirror) (428.584479ms)
(node:1071061) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/updates-manifest.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ compareVersions
  ✔ orders releases numerically, not lexically (4.934377ms)
  ✔ ranks a release above its own prerelease (2.444849ms)
  ✔ returns null for non-semver input (0.264198ms)
✔ compareVersions (12.506228ms)
▶ isNewerVersion / isPrereleaseVersion
  ✔ detects newer versions only (0.323869ms)
  ✔ flags prereleases (0.210002ms)
✔ isNewerVersion / isPrereleaseVersion (0.888671ms)
▶ validateManifest
  ✔ accepts a well-formed manifest (3.983006ms)
  ✔ rejects wrong schema, component, version, and assets (0.35799ms)
  ✔ rejects assets with malformed sha256 or size (0.374611ms)
✔ validateManifest (5.242896ms)
▶ assetForPlatform / resolveUpdateUrls
  ✔ picks the matching asset (4.056332ms)
  ✔ treats a manifest.json URL as the direct pointer (0.455366ms)
  ✔ treats other URLs as a mirror base (1.081459ms)
✔ assetForPlatform / resolveUpdateUrls (5.952419ms)
(node:1071108) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/updates-platform.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ detectUpdatePlatform
  ✔ accepts the four v1 targets (7.633309ms)
  ✔ rejects Windows and unknown arches (0.41623ms)
✔ detectUpdatePlatform (13.751299ms)
▶ assetNameFor
  ✔ builds the canonical filename and strips a v prefix (3.613446ms)
  ✔ throws UNSUPPORTED_PLATFORM for Windows (0.669202ms)
✔ assetNameFor (4.673569ms)
(node:1071163) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/updates-state.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ readUpdateState / writeUpdateState
  ✔ starts idle and round-trips (12.395057ms)
✔ readUpdateState / writeUpdateState (15.353321ms)
▶ acquireUpdateLock
  ✔ grants one holder and releases (1.515187ms)
  ✔ recovers a stale lock left by a dead process instead of bricking updates (3.717009ms)
  ✔ recovers the legacy bare-pid lock format when its holder is gone (0.702578ms)
  ✔ recovers by timestamp when the holder pid is alive but the lock is ancient (3.728887ms)
  ✔ keeps a live holder's lock (same-process contention still loses) (2.005763ms)
✔ acquireUpdateLock (14.44081ms)
▶ pruneOldReleases
  ✔ keeps current + previous and drops older versions (10.359175ms)
  ✔ keeps everything when no link resolves inside releases/ (fail-safe) (0.643995ms)
  ✔ prunes superseded versions on markUpdateSuccess, keeps current + previous (6.229607ms)
✔ pruneOldReleases (18.193242ms)
▶ bootstrapUpdateState
  ✔ passes through when idle (3.457563ms)
  ✔ counts pending-boot attempts without rolling back early (1.499364ms)
  ✔ rolls back to previous on the third crashed boot (3.488447ms)
  ✔ marks success after a good boot (3.076847ms)
✔ bootstrapUpdateState (11.954178ms)
(node:1071176) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/updates-verify.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ verifyManifestSignature
  ✔ accepts a manifest signed by the test key (15.654729ms)
  ✔ rejects a tampered manifest (version bumped after signing) (1.281541ms)
  ✔ rejects a tampered signature (5.221633ms)
  ✔ rejects a signature from a different key (0.940769ms)
  ✔ rejects against the pinned release key (test sig is not a release sig) (3.573329ms)
✔ verifyManifestSignature (37.448983ms)
▶ verifyAssetBytes / verifyAssetFile
  ✔ accepts matching bytes and rejects flipped bytes (6.889972ms)
  ✔ verifies a file on disk by streaming (48.129547ms)
✔ verifyAssetBytes / verifyAssetFile (58.642521ms)
(node:1071220) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/updates-wrapper.test.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
▶ kainbain-runner wrapper restart gate
  ✔ stops after a normal completion instead of re-running finished work (95.084727ms)
  ✔ restarts exactly once into a staged update, then stops (2214.03447ms)
  ✔ propagates a daemon failure without restarting (125.271659ms)
✔ kainbain-runner wrapper restart gate (2442.488479ms)
ℹ tests 216
ℹ suites 50
ℹ pass 215
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6734.228727

✖ failing tests:

test at runner/project.test.js:254:2
✖ resets a reused clone-mode worktree to the remote branch (244.77072ms)
  Error: Command failed: git commit -qm unpushed leftover
      at genericNodeError (node:internal/errors:986:15)
      at wrappedFn (node:internal/errors:540:14)
      at checkExecSyncError (node:child_process:943:11)
      at execFileSync (node:child_process:979:15)
      at git (file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/project.test.js:21:2)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/runner/project.test.js:270:4)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    status: 128,
    signal: null,
    output: [ null, null, null ],
    pid: 1071137,
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
Running Harness Self-Tests... [0;32mPASS[0m (197s)
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
Running Canary Tests... [0;31mFAIL[0m (730s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 806 of 926 lines; showing the tail)
      35 | 		timeout: 15000,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:89:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  23) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

    Error: page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:32

      30 |  ***/
      31 | export async function waitForAppReady(page) {
    > 32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
      34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      35 | 		timeout: 15000,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  24) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:32

      30 |  ***/
      31 | export async function waitForAppReady(page) {
    > 32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
      34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      35 | 		timeout: 15000,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  25) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:32

      30 |  ***/
      31 | export async function waitForAppReady(page) {
    > 32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
      34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      35 | 		timeout: 15000,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/helpers.js:77:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-8ded2dfc-0df7-424a-8c19-f2f8b78c0941/canary-e2e/tests/workflow.spec.js:58:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  25 failed
    tests/accessibility.spec.js:69:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › orchestrator view has no axe violations 
    tests/accessibility.spec.js:74:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations 
    tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations 
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:159:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) 
    tests/accessibility.spec.js:179:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 
    tests/accessibility.spec.js:188:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 
    tests/accessibility.spec.js:200:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus 
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/accessibility.spec.js:373:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/now-playing-cross-project.spec.js:305:6 › Now Playing bar is one pipeline for all projects › advancing the engine owner keeps the bar put even when another project is selected 
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
  109 passed (12.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.