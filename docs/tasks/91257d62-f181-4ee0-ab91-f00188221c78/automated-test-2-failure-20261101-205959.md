<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** add commit history based changelog to the ui This existed in the old UI butlikely got removed when we purged git history. The old one existed on the top bar but I think it is worth moving it to the now playing bar as a slighting greyed out #buildhash on the left of the queue. This should be a build number/hash and then should be clickable and show the git history of main up to this point (which should mostly be task x merged into master squash commits, some fancy behavuour may be needed to filter out just admin commits)  This will also need to be bundled as the usual deployment obvs wont have access to commit history
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 913.999s
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
✅ Settings duplicate check passed (30 files in 127ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (189s)
Running Unit Tests (frontend)... [0;32mPASS[0m (189s)
Running Unit Tests (runner)... [0;32mPASS[0m (189s)
Running Linting (api)... [0;32mPASS[0m (189s)
Running Linting (frontend)... [0;32mPASS[0m (189s)
Running Frontend Build... [0;32mPASS[0m (189s)
Running Security Script Tests... [0;32mPASS[0m (189s)
Running Dependency Check... [0;32mPASS[0m (189s)
Running Dependency Audit Gate... [0;32mPASS[0m (189s)
Running Harness Self-Tests... [0;32mPASS[0m (189s)
Running Container Tests... [0;32mPASS[0m (189s)
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
Running Canary Tests... [0;31mFAIL[0m (719s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 340 of 460 lines; showing the tail)

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-29414--view-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-29414--view-has-no-axe-violations/error-context.md

  5) tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 

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
        at waitForAppShell (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/accessibility.spec.js:51:14)
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/accessibility.spec.js:60:11

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-ab226--view-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-ab226--view-has-no-axe-violations/error-context.md

  6) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: expect(received).toBeTruthy()

    Received: false

      268 | 			{ data: { projectId: projectIdA } },
      269 | 		);
    > 270 | 		expect(checkpointExec.ok()).toBeTruthy();
          | 		                            ^
      271 | 		await expect
      272 | 			.poll(async () => (await getEngineState(request)).status, {
      273 | 				timeout: 20000,
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/now-playing-cross-project.spec.js:270:31

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  7) tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('Inspector toggle 1793566662906').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('Inspector toggle 1793566662906').first() with timeout 10000ms
      - waiting for getByText('Inspector toggle 1793566662906').first()


       at helpers.js:200

      198 |  ***/
      199 | export async function waitForTaskVisible(page, goal) {
    > 200 | 	await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
          | 	                                           ^
      201 | }
      202 |
      203 | /***
        at waitForTaskVisible (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/helpers.js:200:45)
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/task-inspector.spec.js:66:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-inspector-Task-inspec-3e91e-t-tokens-edit-restores-them/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-inspector-Task-inspec-3e91e-t-tokens-edit-restores-them/error-context.md

  8) tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "E2E task 1793566682789"
    Received: null

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      53 | 				return t ? t.goal : null;
      54 | 			})
    > 55 | 			.toBe(goal);
         | 			 ^
      56 |
      57 | 		const task = await latestTask(page, projectId);
      58 | 		expect(task.currentStageId).toBe(stages[0].id);
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/task-lifecycle.spec.js:55:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  8 failed
    tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations 
    tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 
    tests/accessibility.spec.js:101:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations 
    tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
  127 passed (12.0m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.