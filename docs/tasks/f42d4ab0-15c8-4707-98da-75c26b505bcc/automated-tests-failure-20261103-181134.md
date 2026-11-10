<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 948.552s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 2s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 122ms)
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
Running Unit Tests (api)... [0;32mPASS[0m (164s)
Running Unit Tests (frontend)... [0;32mPASS[0m (164s)
Running Unit Tests (runner)... [0;32mPASS[0m (164s)
Running Linting (api)... [0;32mPASS[0m (164s)
Running Linting (frontend)... [0;32mPASS[0m (164s)
Running Frontend Build... [0;32mPASS[0m (164s)
Running Security Script Tests... [0;32mPASS[0m (164s)
Running Dependency Check... [0;32mPASS[0m (164s)
Running Dependency Audit Gate... [0;32mPASS[0m (164s)
Running Harness Self-Tests... [0;32mPASS[0m (164s)
Running Container Tests... [0;32mPASS[0m (164s)
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
Running Canary Tests... [0;31mFAIL[0m (778s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 803 of 923 lines; showing the tail)
    > 45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 	           ^
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
      47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      48 | 		timeout: APP_READY_TIMEOUT_MS,
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:89:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  23) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  24) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:8)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:30:32)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  25) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

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
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/workflow.spec.js:58:33

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
  109 passed (12.9m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.