<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** add commit history based changelog to the ui This existed in the old UI butlikely got removed when we purged git history. The old one existed on the top bar but I think it is worth moving it to the now playing bar as a slighting greyed out #buildhash on the left of the queue. This should be a build number/hash and then should be clickable and show the git history of main up to this point (which should mostly be task x merged into master squash commits, some fancy behavuour may be needed to filter out just admin commits)  This will also need to be bundled as the usual deployment obvs wont have access to commit history
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 987.683s
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
✅ Settings duplicate check passed (30 files in 110ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (159s)
Running Unit Tests (frontend)... [0;32mPASS[0m (159s)
Running Unit Tests (runner)... [0;32mPASS[0m (159s)
Running Linting (api)... [0;32mPASS[0m (159s)
Running Linting (frontend)... [0;32mPASS[0m (159s)
Running Frontend Build... [0;32mPASS[0m (159s)
Running Security Script Tests... [0;32mPASS[0m (159s)
Running Dependency Check... [0;32mPASS[0m (159s)
Running Dependency Audit Gate... [0;32mPASS[0m (159s)
Running Harness Self-Tests... [0;32mPASS[0m (159s)
Running Container Tests... [0;32mPASS[0m (159s)
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
Running Canary Tests... [0;31mFAIL[0m (822s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 188 of 308 lines; showing the tail)
    Timeout: 15000ms

    Call log:
      - Expect "toContainText" getByRole('button', { name: 'Select pipeline workflow' }) with timeout 15000ms
      - waiting for getByRole('button', { name: 'Select pipeline workflow' })
        33 × locator resolved to <button type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Select pipeline workflow" class="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-medium text-on-surface transition-colors cursor-pointer">…</button>
           - unexpected value "🔀Feature Pipeline▼"


      94 | 		await expect(
      95 | 			page.getByRole("button", { name: "Select pipeline workflow" }),
    > 96 | 		).toContainText(E2E_WORKFLOW_NAME, { timeout: 15000 });
         | 		  ^
      97 | 	});
      98 |
      99 | 	test("Configure drawer buttons stay clickable above the collapsed activity console", async ({
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/footer-overlay.spec.js:96:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/footer-overlay-Footer-over-795e0-eeps-its-controls-clickable/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/footer-overlay-Footer-over-795e0-eeps-its-controls-clickable/error-context.md

    Error Context: test-results/footer-overlay-Footer-over-795e0-eeps-its-controls-clickable/error-context.md

  2) tests/mobile-responsive.spec.js:165:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 

    Error: expect(locator).toBeVisible() failed

    Locator: getByLabel(/^Task #KB-/).filter({ hasText: 'Compact task 1793565052310' })
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByLabel(/^Task #KB-/).filter({ hasText: 'Compact task 1793565052310' }) with timeout 10000ms
      - waiting for getByLabel(/^Task #KB-/).filter({ hasText: 'Compact task 1793565052310' })


      182 | 		// a bare .first() matched one of those and failed on "hidden".
      183 | 		const card = page.getByLabel(/^Task #KB-/).filter({ hasText: goal });
    > 184 | 		await expect(card).toBeVisible({ timeout: 10000 });
          | 		                   ^
      185 | 		const box = await card.boundingBox();
      186 | 		expect(box).not.toBeNull();
      187 | 		expect(box.height).toBeLessThan(110); // full cards were ~150-250px
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/mobile-responsive.spec.js:184:22

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/mobile-responsive-Mobile-R-07fba-ty-on-mobile-task-7a411b12-/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/mobile-responsive-Mobile-R-07fba-ty-on-mobile-task-7a411b12-/error-context.md

  3) tests/mobile-responsive.spec.js:270:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "5"
    Received: undefined

    Call Log:
    - Timeout 15000ms exceeded while waiting on the predicate

      321 | 				return tasks.find((t) => t.id === taskId)?.currentStageId;
      322 | 			}, { timeout: 15000 })
    > 323 | 			.toBe("5");
          | 			 ^
      324 | 	});
      325 | });
      326 |
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/mobile-responsive.spec.js:323:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/mobile-responsive-Mobile-t-3980a-thout-opening-the-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/mobile-responsive-Mobile-t-3980a-thout-opening-the-inspector/error-context.md

  4) tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('Round trip 1793565229969').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('Round trip 1793565229969').first() with timeout 10000ms
      - waiting for getByText('Round trip 1793565229969').first()


       at helpers.js:200

      198 |  ***/
      199 | export async function waitForTaskVisible(page, goal) {
    > 200 | 	await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
          | 	                                           ^
      201 | }
      202 |
      203 | /***
        at waitForTaskVisible (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/helpers.js:200:45)
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/task-editing.spec.js:77:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-editing-Task-view-edi-431ba-ip-preserves-edited-content/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-editing-Task-view-edi-431ba-ip-preserves-edited-content/error-context.md

  Slow test file: tests/accessibility.spec.js (6.4m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  4 failed
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/mobile-responsive.spec.js:165:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 
    tests/mobile-responsive.spec.js:270:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
  131 passed (13.7m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.