<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 2828.31s
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
✅ Settings duplicate check passed (30 files in 157ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
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
Running Canary Tests... [0;31mFAIL[0m (700s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 174 of 294 lines; showing the tail)

Reload attempt 2 starting...
page.reload finished on attempt 2
waitForAppReadyOnProject starting on attempt 2
waitForAppReadyOnProject succeeded on attempt 2
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (5.6s)
  ✓  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3.9s)
  ✓  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.2s)
  ✓  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.1s)
  ✓  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.1s)
  ✓  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.5s)
  ✓  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.4s)
  ✓  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.4s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.5s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.4s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.6s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.9s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.2s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.2s)
  ✓  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.0s)
  ✓  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.1s)
  ✓  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.7s)
  ✓  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.2s)
  ✓  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.7s)
  ✓  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.2s)
  ✓  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (3.1s)
  ✓  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (2.7s)
  ✓  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (4.4s)
  ✓  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (2.9s)
  ✓  134 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (2.8s)
  ✓  135 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.2s)


  1) tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 

    Error: expect(locator).toContainText(expected) failed

    Locator: locator('h1')
    Expected substring: "KAINBAIN"
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toContainText" locator('h1') with timeout 5000ms
      - waiting for locator('h1')


      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
    > 54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
         |                                    ^
      55 |   await expect(page.getByRole("button", { name: /Orchestrator/i })).toBeVisible();
      56 | }
      57 |
        at waitForAppShell (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/accessibility.spec.js:54:36)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/accessibility.spec.js:232:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-db734--inspector-closes-on-Escape/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-db734--inspector-closes-on-Escape/error-context.md

  2) tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 

    Error: expect(locator).toContainText(expected) failed

    Locator: locator('h1')
    Expected substring: "KAINBAIN"
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toContainText" locator('h1') with timeout 5000ms
      - waiting for locator('h1')


      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
    > 54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
         |                                    ^
      55 |   await expect(page.getByRole("button", { name: /Orchestrator/i })).toBeVisible();
      56 | }
      57 |
        at waitForAppShell (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/accessibility.spec.js:54:36)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/accessibility.spec.js:258:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-b5155--task-in-the-NowPlaying-bar/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-b5155--task-in-the-NowPlaying-bar/error-context.md

  3) tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff 

    Error: ENOENT: no such file or directory, open '/home/[REDACTED]/projects/kainbain/docs/tasks/bafc4c11-f74f-48af-8e6e-c149d9392f35/assets/screenshot-reports-review-live.png'

      484 | 		// Take screenshot to document the feature working
      485 | 		const screenshotPath = "/home/[REDACTED]/projects/kainbain/docs/tasks/bafc4c11-f74f-48af-8e6e-c149d9392f35/assets/screenshot-reports-review-live.png";
    > 486 | 		await page.screenshot({ path: screenshotPath, fullPage: true });
          | 		^
      487 |
      488 | 		// Pass the stage and verify review comment is carried into the human approval report
      489 | 		await page.getByLabel("Pass this stage").click();
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/pr-review.spec.js:486:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/pr-review-PR-Review-E2E-re-baa67-ge-reports-outside-git-diff/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/pr-review-PR-Review-E2E-re-baa67-ge-reports-outside-git-diff/error-context.md

  3 failed
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff 
  1 did not run
  131 passed (11.6m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.