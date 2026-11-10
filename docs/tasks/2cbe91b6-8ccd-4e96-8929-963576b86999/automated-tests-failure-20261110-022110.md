<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Make sure runners auto detect models from existing harnesses Recent focus has been on muse code compatibility but we need to extend it to all supported harnesses to have aut detect and import. For example server2 locally has pi configured, we need tobe able to use those models this includes the tying it into the refresh button into the ui
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1578.938s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 117 packages, and audited 118 packages in 1s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (32 files in 132ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (174s)
Running Unit Tests (frontend)... [0;32mPASS[0m (174s)
Running Unit Tests (runner)... [0;32mPASS[0m (174s)
Running Linting (api)... [0;32mPASS[0m (174s)
Running Linting (frontend)... [0;32mPASS[0m (174s)
Running Frontend Build... [0;32mPASS[0m (174s)
Running Security Script Tests... [0;32mPASS[0m (174s)
Running Dependency Check... [0;32mPASS[0m (174s)
Running Dependency Audit Gate... [0;32mPASS[0m (174s)
Running Harness Self-Tests... [0;32mPASS[0m (174s)
Running Container Tests... [0;32mPASS[0m (174s)
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
⏳ still running: Canary Tests (14m30s)
⏳ still running: Canary Tests (15m00s)
⏳ still running: Canary Tests (15m30s)
⏳ still running: Canary Tests (16m00s)
⏳ still running: Canary Tests (16m30s)
⏳ still running: Canary Tests (17m00s)
⏳ still running: Canary Tests (17m30s)
⏳ still running: Canary Tests (18m00s)
⏳ still running: Canary Tests (18m30s)
⏳ still running: Canary Tests (19m00s)
⏳ still running: Canary Tests (19m30s)
⏳ still running: Canary Tests (20m00s)
⏳ still running: Canary Tests (20m31s)
⏳ still running: Canary Tests (21m01s)
⏳ still running: Canary Tests (21m31s)
⏳ still running: Canary Tests (22m01s)
⏳ still running: Canary Tests (22m31s)
⏳ still running: Canary Tests (23m01s)
Running Canary Tests... [0;31mFAIL[0m (1398s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 514 of 634 lines; showing the tail)

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 60000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:61

      59 | 	}
      60 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
      64 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:61:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:104:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/task-lifecycle.spec.js:159:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  11) tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Test timeout of 60000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()
      - Test timeout of 60000ms exceeded.


       at helpers.js:61

      59 | 	}
      60 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
      64 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:61:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:104:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/task-lifecycle.spec.js:236:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  12) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Test timeout of 60000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()
      - Test timeout of 60000ms exceeded.


       at helpers.js:61

      59 | 	}
      60 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
      64 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:61:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/helpers.js:104:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2cbe91b6-8ccd-4e96-8929-963576b86999/canary-e2e/tests/workflow.spec.js:58:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  Slow test file: tests/accessibility.spec.js (6.8m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  12 failed
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/mobile-responsive.spec.js:254:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-inspector.spec.js:41:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:60:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
  127 passed (23.3m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.