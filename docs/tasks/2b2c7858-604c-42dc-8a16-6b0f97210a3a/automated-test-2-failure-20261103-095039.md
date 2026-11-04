<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Make sure we are surfacing agent logs to the ui To debug issues we wwant to make sure we have all the possible details in the UI, however it seems that the log experience may of degraded a bit after switching from a monilith to runners so we just want to restore that. It should feel like you where just using muse code or similar with the level of details
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 889.926s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 662ms

found 0 vulnerabilities
Workspace dependencies installed (canary-e2e).
✅ Settings duplicate check passed (30 files in 156ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (166s)
Running Unit Tests (frontend)... [0;32mPASS[0m (166s)
Running Unit Tests (runner)... [0;32mPASS[0m (166s)
Running Linting (api)... [0;32mPASS[0m (166s)
Running Linting (frontend)... [0;32mPASS[0m (166s)
Running Frontend Build... [0;32mPASS[0m (166s)
Running Security Script Tests... [0;32mPASS[0m (166s)
Running Dependency Check... [0;32mPASS[0m (166s)
Running Dependency Audit Gate... [0;32mPASS[0m (166s)
Running Harness Self-Tests... [0;32mPASS[0m (166s)
Running Container Tests... [0;32mPASS[0m (166s)
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
Running Canary Tests... [0;31mFAIL[0m (716s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 881 of 1001 lines; showing the tail)
      48 | 		timeout: APP_READY_TIMEOUT_MS,
      49 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:46:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:90:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:38:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  26) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:45

      43 |  ***/
      44 | export async function waitForAppReady(page) {
    > 45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
      47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      48 | 		timeout: APP_READY_TIMEOUT_MS,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:90:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  27) tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) 

    Error: expect(page).toHaveTitle(expected) failed

    Expected pattern: /Kainbain/
    Received string:  ""

    Call log:
      - Expect "toHaveTitle" with timeout 5000ms
      - Protocol error (Runtime.callFunctionOn): Page crashed.


       at helpers.js:46

      44 | export async function waitForAppReady(page) {
      45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    > 46 | 	await expect(page).toHaveTitle(/Kainbain/);
         | 	                   ^
      47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      48 | 		timeout: APP_READY_TIMEOUT_MS,
      49 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:46:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:90:2)
        at submitTask (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/visual/dashboard.spec.js:41:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/visual/dashboard.spec.js:85:5

    Error Context: test-results/visual-dashboard-Dashboard-8c0a5-cution-task-card-in-canvas-/error-context.md

  28) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:45

      43 |  ***/
      44 | export async function waitForAppReady(page) {
    > 45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
      47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      48 | 		timeout: APP_READY_TIMEOUT_MS,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:90:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/workflow.spec.js:58:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  28 failed
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
    tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
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
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
  1 did not run
  106 passed (11.9m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.