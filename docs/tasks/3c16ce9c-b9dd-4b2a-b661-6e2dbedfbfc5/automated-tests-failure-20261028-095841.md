<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** can you please break the project settings down to more tabs mainly want aliases in their own tab like skills . And maybe a one for custom file/web addresses. generally just neeeds to be easier to use. Maybe worth adding a settings search to the top right thats unused for project settings  ![image.png](assets/image.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1092.144s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 997ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (28 files in 160ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Dependency Check (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (168s)
Running Unit Tests (frontend)... [0;32mPASS[0m (168s)
Running Linting (api)... [0;32mPASS[0m (168s)
Running Linting (frontend)... [0;32mPASS[0m (168s)
Running Frontend Build... [0;32mPASS[0m (168s)
Running Security Script Tests... [0;32mPASS[0m (168s)
Running Dependency Check... [0;32mPASS[0m (168s)
Running Dependency Audit Gate... [0;32mPASS[0m (168s)
Running Harness Self-Tests... [0;32mPASS[0m (168s)
Running Container Tests... [0;32mPASS[0m (168s)
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
Running Canary Tests... [0;31mFAIL[0m (725s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 394 of 514 lines; showing the tail)
      49 |   // gated explicitly below (title + h1 + Orchestrator button), and scan()
      50 |   // additionally waits for fonts + build badge before measuring.
    > 51 |   await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         |              ^
      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
      54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
        at waitForAppShell (/home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:51:14)
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:60:11

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-6d46d--view-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-6d46d--view-has-no-axe-violations/error-context.md

  5) tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


      49 |   // gated explicitly below (title + h1 + Orchestrator button), and scan()
      50 |   // additionally waits for fonts + build badge before measuring.
    > 51 |   await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         |              ^
      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
      54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
        at waitForAppShell (/home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:51:14)
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:60:11

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-2dcd0--open-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-2dcd0--open-has-no-axe-violations/error-context.md

  6) tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


      49 |   // gated explicitly below (title + h1 + Orchestrator button), and scan()
      50 |   // additionally waits for fonts + build badge before measuring.
    > 51 |   await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         |              ^
      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
      54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
        at waitForAppShell (/home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:51:14)
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:60:11

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-daca0--view-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-daca0--view-has-no-axe-violations/error-context.md

  7) tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: expect(received).toBeTruthy()

    Received: false

      265 | 			{ data: { projectId: projectIdA } },
      266 | 		);
    > 267 | 		expect(checkpointExec.ok()).toBeTruthy();
          | 		                            ^
      268 | 		await expect
      269 | 			.poll(async () => (await getEngineState(request)).status, {
      270 | 				timeout: 20000,
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/now-playing-cross-project.spec.js:267:31

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  8) tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "DnD task 1793181410659"
    Received: "Checkpoint tap task 1793181415135"

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      93 | 				return t ? t.goal : null;
      94 | 			})
    > 95 | 			.toBe(goal);
         | 			 ^
      96 | 		const task = await latestTask(page, projectId);
      97 |
      98 | 		await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/task-lifecycle.spec.js:95:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  8 failed
    tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:278:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:284:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 
    tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 
    tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
  127 passed (12.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.