<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1157.797s
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
✅ Settings duplicate check passed (30 files in 85ms)
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
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (137s)
Running Unit Tests (frontend)... [0;32mPASS[0m (137s)
Running Unit Tests (runner)... [0;32mPASS[0m (137s)
Running Linting (api)... [0;32mPASS[0m (137s)
Running Linting (frontend)... [0;32mPASS[0m (137s)
Running Frontend Build... [0;32mPASS[0m (137s)
Running Security Script Tests... [0;32mPASS[0m (137s)
Running Dependency Check... [0;32mPASS[0m (137s)
Running Dependency Audit Gate... [0;32mPASS[0m (137s)
Running Harness Self-Tests... [0;32mPASS[0m (137s)
Running Container Tests... [0;32mPASS[0m (137s)
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
Running Canary Tests... [0;31mFAIL[0m (675s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 198 of 318 lines; showing the tail)
    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 0 open tasks across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 0 open tasks across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      46 | 			/Execution queue: \d+ open tasks? across all pipelines/,
      47 | 		);
    > 48 | 		await expect(queueChip).toBeVisible();
         | 		                        ^
      49 | 		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
      50 | 		// No global transport cluster: play/skip live on the runner boxes now,
      51 | 		// so the old engine toggle and Look Back/Forward/Jump/Skip buttons
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/functional.spec.js:48:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/functional-KainBain-Functi-a2303-bar-with-runner-fleet-boxes/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/functional-KainBain-Functi-a2303-bar-with-runner-fleet-boxes/error-context.md

  2) tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 

    Error: expect(locator).toBeVisible() failed

    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 1 open task across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 1 open task across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      152 | 			await expect(
      153 | 				page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
    > 154 | 			).toBeVisible();
          | 			  ^
      155 | 		}
      156 | 	});
      157 |
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/functional.spec.js:154:6

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/functional-KainBain-Functi-2240f-oxes-at-any-supported-width/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/functional-KainBain-Functi-2240f-oxes-at-any-supported-width/error-context.md

  3) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Test timeout of 60000ms exceeded.

    Error: locator.getAttribute: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for locator('div[aria-label^="Execution queue:"]')


      231 | 		// the two seeded B tasks. Captured once; the project switch must not
      232 | 		// move it.
    > 233 | 		const depthLabelOnA = await queueChip(page).getAttribute("aria-label");
          | 		                                            ^
      234 | 		expect(depthLabelOnA).toMatch(
      235 | 			/^Execution queue: \d+ open tasks? across all pipelines$/,
      236 | 		);
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/now-playing-cross-project.spec.js:233:47

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  4) tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 

    Error: expect(locator).toBeVisible() failed

    Locator: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)
    Expected: visible
    Error: strict mode violation: getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) resolved to 2 elements:
        1) <button type="button" data-testid="queue-chip-button" aria-label="Execution queue: 8 open tasks across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary">…</button> aka getByTestId('queue-chip-button')
        2) <span role="status" class="contents" aria-live="polite" aria-label="Execution queue: 8 open tasks across all pipelines">…</span> aka getByTestId('queue-chip-button')

    Call log:
      - Expect "toBeVisible" getByLabel(/Execution queue: \d+ open tasks? across all pipelines/) with timeout 5000ms
      - waiting for getByLabel(/Execution queue: \d+ open tasks? across all pipelines/)


      90 | 		await expect(
      91 | 			page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
    > 92 | 		).toBeVisible();
         | 		  ^
      93 | 		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
      94 | 		await expect(page.getByRole("progressbar", { name: "Pipeline progress" })).toHaveCount(0);
      95 | 	});
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/workflow.spec.js:92:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/error-context.md

  Slow test file: tests/accessibility.spec.js (5.6m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  4 failed
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 
  131 passed (11.2m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.