<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Everything seems to always say it's retrying ![18851.png](assets/18851.png) Retrying should be reserved for if something goes wrong on the current stage and for whatever reason we don't fail the stage and just want to retry in place . If it moves stage it shouldn't be retrying. Idk if it is tied to where the history on a task looks like it spams stage multiple times so that may need a look Please fix ![18852.png](assets/18852.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 882.75s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
d Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (181s)
Running Unit Tests (frontend)... [0;32mPASS[0m (181s)
Running Unit Tests (runner)... [0;32mPASS[0m (181s)
Running Linting (api)... [0;32mPASS[0m (181s)
Running Linting (frontend)... [0;32mPASS[0m (181s)
Running Frontend Build... [0;32mPASS[0m (181s)
Running Security Script Tests... [0;32mPASS[0m (181s)
Running Dependency Check... [0;32mPASS[0m (181s)
Running Dependency Audit Gate... [0;32mPASS[0m (181s)
Running Harness Self-Tests... [0;31mFAIL[0m (181s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 455 of 575 lines; showing the tail)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.280826ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.152711ms)
  ✔ opts out via --no-canary (0.111713ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.111532ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.113603ms)
  ✔ skip flags win over the legacy opt-in flags (0.136912ms)
✔ resolveCanary (9.247008ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (40.255999ms)
  ✔ reports true when the root tree carries the Windows binary (0.385595ms)
  ✔ reports false when the platform's binary name is missing (0.412758ms)
  ✔ reports false when the root tree has no binaries at all (0.285391ms)
✔ depcheckAvailable (41.717419ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (1.794512ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (50.585431ms)
  ✔ reports not installed when a package manifest is unreadable (0.571311ms)
✔ workspaceDepsInstalled (70.791631ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (31.581542ms)
  ✔ does not spawn when every workspace dependency is already present (52.464637ms)
  ✔ installs each missing package through npm and re-verifies (1.741204ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (61.275088ms)
✔ ensureWorkspaceDeps (147.541793ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (1.074073ms)
  ✔ returns zero and does not throw when directory does not exist (20.228187ms)
✔ pruneStaleTestDirectories (21.564183ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (44.722896ms)
  ✔ still builds plain final versions (1.182329ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (40.056607ms)
  ✔ sha256FileHex matches the manifest's hashing (0.552182ms)
✔ buildManifest (199.342213ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (88.597898ms)
  ✔ rejects non-semver versions instead of tarring them (13.277826ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.936128ms)
  ✔ agrees with buildManifest on the asset filename grammar (380.138556ms)
✔ packageRunner (509.615562ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (10.661723ms)
✔ installSteps (29.270211ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (25.570146ms)
  ✔ root .npmrc documents the per-dir mirrors (0.449631ms)
✔ installSteps npmrc (26.402713ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.359563ms)
  ✔ installs the browser alone on macOS and Windows (0.286872ms)
✔ playwrightAttempts (28.496153ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.414723ms)
✔ npxExecutable (0.768691ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (26.862967ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.343642ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.275578ms)
✔ browserInstallTargets (27.92267ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-VmB6Wb/Sanity/docs' -> '/tmp/kainbain-sanity-notes-TOXXpK/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-5Q4x5m/Sanity/docs' -> '/tmp/kainbain-sanity-notes-qpdnYM/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-5Q4x5m/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-qpdnYM/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-5Q4x5m/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-qpdnYM/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-AQJniC/Sanity/docs' -> '/tmp/kainbain-sanity-notes-BhQUEd/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-IoJQ5n/Sanity/docs' -> '/tmp/kainbain-sanity-notes-7oagoy/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-IoJQ5n/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-7oagoy/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-IoJQ5n/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-7oagoy/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-x598LV/Sanity/docs' -> '/tmp/kainbain-sanity-notes-pFPOBX/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-yCbK97/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Mpft2f/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-yCbK97/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-Mpft2f/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-yCbK97/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-Mpft2f/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (245.92705ms)
  ✔ leaves no fixture residue in the OS temp dir (164.464611ms)
✔ checkStorageSanity (451.528214ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.837183ms)
  ✔ rejects a missing entry path or a different file (0.330807ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (3080.134162ms)
✔ isMainModule (3081.897279ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.263769ms)
  ✔ returns 0 when the notes space has no tasks dir (18.582452ms)
✔ countNotesTasks (20.361625ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (305.528526ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (103.142184ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (651.662217ms)
  ✔ is idempotent: a second run appends no duplicate history (880.709048ms)
  ✔ leaves an already-current primary manifest alone (666.423734ms)
✔ scripts/sync-tip-dist.mjs (2616.369743ms)
ℹ tests 345
ℹ suites 89
ℹ pass 344
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 38933.826835

✖ failing tests:

test at tests/entry-platform.test.mjs:73:3
✖ api test runs under Windows cmd (no VAR= prefix) (1.444548ms)
  AssertionError [ERR_ASSERTION]: api test still has a shell env prefix
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/tests/entry-platform.test.mjs:76:11)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
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
Running Container Tests... [0;32mPASS[0m (181s)
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
Running Canary Tests... [0;31mFAIL[0m (694s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 818 of 938 lines; showing the tail)
         | 	           ^
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
      34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      35 | 		timeout: 15000,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:89:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  24) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  25) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/task-lifecycle.spec.js:174:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  26) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:32:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/helpers.js:77:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/canary-e2e/tests/workflow.spec.js:58:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  26 failed
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
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
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
  108 passed (11.5m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.