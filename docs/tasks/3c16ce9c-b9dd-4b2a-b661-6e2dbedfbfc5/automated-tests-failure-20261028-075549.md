<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** can you please break the project settings down to more tabs mainly want aliases in their own tab like skills . And maybe a one for custom file/web addresses. generally just neeeds to be easier to use. Maybe worth adding a settings search to the top right thats unused for project settings  ![image.png](assets/image.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 26639.771s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (28 files in 107ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Linting (frontend) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;32mPASS[0m (244s)
Running Unit Tests (frontend)... [0;32mPASS[0m (244s)
Running Linting (api)... [0;32mPASS[0m (244s)
Running Linting (frontend)... [0;32mPASS[0m (244s)
Running Frontend Build... [0;32mPASS[0m (244s)
Running Security Script Tests... [0;32mPASS[0m (244s)
Running Dependency Check... [0;32mPASS[0m (244s)
Running Dependency Audit Gate... [0;32mPASS[0m (244s)
Running Harness Self-Tests... [0;32mPASS[0m (244s)
Running Container Tests... [0;32mPASS[0m (244s)
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
Running Canary Tests... [0;31mFAIL[0m (843s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 335 of 455 lines; showing the tail)

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "5"
    Received: undefined

    Call Log:
    - Timeout 15000ms exceeded while waiting on the predicate

      314 | 				return tasks.find((t) => t.id === taskId)?.currentStageId;
      315 | 			}, { timeout: 15000 })
    > 316 | 			.toBe("5");
          | 			 ^
      317 | 	});
      318 | });
      319 |
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/mobile-responsive.spec.js:316:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/mobile-responsive-Mobile-t-3980a-thout-opening-the-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/mobile-responsive-Mobile-t-3980a-thout-opening-the-inspector/error-context.md

  8) tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected 

    Error: owner task should complete after skipping its final stage

    owner task should complete after skipping its final stage

    expect(received).toBe(expected) // Object.is equality

    Expected: "completed"
    Received: undefined

    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate

      349 | 				},
      350 | 			)
    > 351 | 			.toBe("completed");
          | 			 ^
      352 | 	});
      353 | });
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/now-playing-cross-project.spec.js:351:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--003a9-another-project-is-selected/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--003a9-another-project-is-selected/error-context.md

    Error Context: test-results/now-playing-cross-project--003a9-another-project-is-selected/error-context.md

  9) tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "E2E task 1793174021931"
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
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/task-lifecycle.spec.js:55:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  10) tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('DnD task 1793174032481').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('DnD task 1793174032481').first() with timeout 10000ms
      - waiting for getByText('DnD task 1793174032481').first()


       96 | 		const task = await latestTask(page, projectId);
       97 |
    >  98 | 		await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
          | 		                                           ^
       99 |
      100 | 		// The task card exposes HTML5 drag-and-drop; the target column has a
      101 | 		// data-stage-id so the drop handler knows the destination stage.
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/task-lifecycle.spec.js:98:46

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  10 failed
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/functional.spec.js:174:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration 
    tests/mobile-responsive.spec.js:113:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:142:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:158:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 
    tests/mobile-responsive.spec.js:210:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover 
    tests/mobile-responsive.spec.js:263:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 
    tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
  125 passed (14.0m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.