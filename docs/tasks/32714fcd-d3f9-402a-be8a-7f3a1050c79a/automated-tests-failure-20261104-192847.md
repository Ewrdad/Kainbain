<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Fix problems with the first time install experience Current problems include: - Local runner not being autodetected and configured - Unable to load in projects - Unable to create new projects as they require git remote that currently cant be put in in the UI  - Projects directoory sits empty - No uninstall for if the install messes up Overall the whole new user onboarding needs refinement
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1122.707s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 2s

15 packages are looking for funding
  run `npm fund` for details

2 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (32 files in 128ms)
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
Running Unit Tests (api)... [0;32mPASS[0m (170s)
Running Unit Tests (frontend)... [0;32mPASS[0m (170s)
Running Unit Tests (runner)... [0;32mPASS[0m (170s)
Running Linting (api)... [0;32mPASS[0m (170s)
Running Linting (frontend)... [0;32mPASS[0m (170s)
Running Frontend Build... [0;32mPASS[0m (170s)
Running Security Script Tests... [0;32mPASS[0m (170s)
Running Dependency Check... [0;32mPASS[0m (170s)
Running Dependency Audit Gate... [0;32mPASS[0m (170s)
Running Harness Self-Tests... [0;32mPASS[0m (170s)
Running Container Tests... [0;32mPASS[0m (170s)
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
Running Canary Tests... [0;31mFAIL[0m (944s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 360 of 480 lines; showing the tail)

    Expected pattern: /Kainbain/
    Received string:  ""

    Call log:
      - Expect "toHaveTitle" with timeout 5000ms
      - Protocol error (Runtime.callFunctionOn): Page crashed.


       at helpers.js:60

      58 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      59 | 	}
    > 60 | 	await expect(page).toHaveTitle(/Kainbain/);
         | 	                   ^
      61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:60:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:104:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:48:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  8) tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 

    Error: expect(page).toHaveTitle(expected) failed

    Expected pattern: /Kainbain/
    Received string:  ""

    Call log:
      - Expect "toHaveTitle" with timeout 5000ms
      - Protocol error (Runtime.callFunctionOn): Page crashed.


       at helpers.js:60

      58 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      59 | 	}
    > 60 | 	await expect(page).toHaveTitle(/Kainbain/);
         | 	                   ^
      61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:60:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:104:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:90:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  9) tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: expect(page).toHaveTitle(expected) failed

    Expected pattern: /Kainbain/
    Received string:  ""

    Call log:
      - Expect "toHaveTitle" with timeout 5000ms
      - Protocol error (Runtime.callFunctionOn): Page crashed.


       at helpers.js:60

      58 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      59 | 	}
    > 60 | 	await expect(page).toHaveTitle(/Kainbain/);
         | 	                   ^
      61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:60:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:104:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/task-lifecycle.spec.js:236:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  10) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: expect(page).toHaveTitle(expected) failed

    Expected pattern: /Kainbain/
    Received string:  ""

    Call log:
      - Expect "toHaveTitle" with timeout 5000ms
      - Protocol error (Runtime.evaluate): Page crashed.


       at helpers.js:60

      58 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      59 | 	}
    > 60 | 	await expect(page).toHaveTitle(/Kainbain/);
         | 	                   ^
      61 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
      62 | 		timeout: APP_READY_TIMEOUT_MS,
      63 | 	});
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:60:21)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/helpers.js:104:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-32714fcd-d3f9-402a-be8a-7f3a1050c79a/canary-e2e/tests/workflow.spec.js:58:3

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  10 failed
    tests/accessibility.spec.js:103:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 
    tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
  128 passed (15.7m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.