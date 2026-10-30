<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Replace harness tab with detailed runner settings ![untitled-scene.png](assets/untitled-scene.png) following this rough design replace all the harness settings(as they dont make sense anymore) to a runner configuration settings . this is all in the general settings tab
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 695.484s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 116 packages, and audited 117 packages in 870ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 721ms

found 0 vulnerabilities
Workspace dependencies installed (canary-e2e).
✅ Settings duplicate check passed (30 files in 82ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (131s)
Running Unit Tests (frontend)... [0;32mPASS[0m (131s)
Running Linting (api)... [0;32mPASS[0m (131s)
Running Linting (frontend)... [0;32mPASS[0m (131s)
Running Frontend Build... [0;32mPASS[0m (131s)
Running Security Script Tests... [0;32mPASS[0m (131s)
Running Dependency Check... [0;32mPASS[0m (131s)
Running Dependency Audit Gate... [0;32mPASS[0m (131s)
Running Harness Self-Tests... [0;31mFAIL[0m (131s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 519 of 639 lines; showing the tail)
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-3hvksH/argv.log'
  }

test at tests/deploy-reexec.test.mjs:113:2
✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (69.930134ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-dcsEFP/argv.log'
      at Object.readFileSync (node:fs:539:20)
      at runWithFakeSystemdRun (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:114:28)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-dcsEFP/argv.log'
  }

test at tests/deploy-reexec.test.mjs:119:2
✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (124.92983ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-ZsaeyT/argv.log'
      at Object.readFileSync (node:fs:539:20)
      at runWithFakeSystemdRun (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:120:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-ZsaeyT/argv.log'
  }

test at tests/deploy-reexec.test.mjs:127:2
✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (75.393714ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-1KWogF/argv.log'
      at Object.readFileSync (node:fs:539:20)
      at runWithFakeSystemdRun (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:133:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-1KWogF/argv.log'
  }

test at tests/deploy-reexec.test.mjs:140:2
✖ omits the attempt-id setenv on manual runs without an attempt id (67.143385ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-0rW1Vb/argv.log'
      at Object.readFileSync (node:fs:539:20)
      at runWithFakeSystemdRun (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:141:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-0rW1Vb/argv.log'
  }

test at tests/deploy-reexec.test.mjs:280:2
✖ omits --pipe from the real re-exec argv while keeping --wait (553.343294ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-nopipe-zVuMpw/argv.log'
      at Object.readFileSync (node:fs:539:20)
      at runReexecCapture (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:312:15)
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:317:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-nopipe-zVuMpw/argv.log'
  }

test at tests/deploy-reexec.test.mjs:324:2
✖ emits engine-visible heartbeats while the detached unit runs (63.376038ms)
  AssertionError [ERR_ASSERTION]: deploy.sh: refusing to run from a task worktree (branch kb/*) — deploy/publish stages must run on the primary checkout
  
  
  78 !== 0
  
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/tests/deploy-reexec.test.mjs:364:11)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 78,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (131s)
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
Running Canary Tests... [0;31mFAIL[0m (558s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 302 of 422 lines; showing the tail)
    Call log:
      - waiting for getByRole('tab', { name: /Files & Links/i })


      204 | 		).toBeVisible();
      205 | 		// Files & Links tab: paths, docs folders, git, app link.
    > 206 | 		await page.getByRole("tab", { name: /Files & Links/i }).click();
          | 		                                                        ^
      207 | 		await expect(
      208 | 			page.getByText(/Working Directory/i),
      209 | 		).toBeVisible();
        at /home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/canary-e2e/tests/functional.spec.js:206:59

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/functional-KainBain-Functi-db58e-nfiguration-across-its-tabs/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/functional-KainBain-Functi-db58e-nfiguration-across-its-tabs/error-context.md

  6) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: expect(locator).toContainText(expected) failed

    Locator: getByTestId('now-playing-task-name')
    Expected substring: "Now Playing owner run 1793345223213"
    Timeout: 20000ms
    Error: element(s) not found

    Call log:
      - Expect "toContainText" getByTestId('now-playing-task-name') with timeout 20000ms
      - waiting for getByTestId('now-playing-task-name')


      221 |
      222 | 		// On Project A the bar names the running owner and shows RUNNING.
    > 223 | 		await expect(ownerName(page)).toContainText(goal, { timeout: 20000 });
          | 		                              ^
      224 | 		await expect(statusBadge(page)).toHaveAttribute(
      225 | 			"aria-label",
      226 | 			"Engine status is RUNNING",
        at /home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/canary-e2e/tests/now-playing-cross-project.spec.js:223:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  7) tests/now-playing-cross-project.spec.js:305:6 › Now Playing bar is one pipeline for all projects › advancing the engine owner keeps the bar put even when another project is selected 

    Error: expect(locator).toContainText(expected) failed

    Locator: getByTestId('now-playing-task-name')
    Expected substring: "Now Playing owner skip 1793345245913"
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toContainText" getByTestId('now-playing-task-name') with timeout 10000ms
      - waiting for getByTestId('now-playing-task-name')


      334 | 		// B's loaded task list.
      335 | 		await waitForAppReadyOnProject(page, "Project B");
    > 336 | 		await expect(ownerName(page)).toContainText(goal, { timeout: 10000 });
          | 		                              ^
      337 |
      338 | 		// Advance the OWNER's task (in Project A), not the viewed pipeline's
      339 | 		// pointer: the global Skip Current transport is retired (per-runner
        at /home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/canary-e2e/tests/now-playing-cross-project.spec.js:336:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--12c1e-another-project-is-selected/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--12c1e-another-project-is-selected/error-context.md

    Error Context: test-results/now-playing-cross-project--12c1e-another-project-is-selected/error-context.md

  8) tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('Active Task', { exact: true })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('Active Task', { exact: true }) with timeout 5000ms
      - waiting for getByText('Active Task', { exact: true })


      86 | 		// stay gone, and so must the stale workflow-pointer stage label
      87 | 		// ("Stage 1 of 10 — Idea"), the elapsed timer, and the health light.
    > 88 | 		await expect(page.getByText("Active Task", { exact: true })).toBeVisible();
         | 		                                                             ^
      89 | 		await expect(page.locator("#elapsed-counter")).toHaveCount(0);
      90 | 		await expect(
      91 | 			page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
        at /home/server/.kainbain/runner-work/kb-b4b86592-4920-4c7e-86e3-63f004e603d9/canary-e2e/tests/workflow.spec.js:88:64

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/error-context.md

  8 failed
    tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:196:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/now-playing-cross-project.spec.js:305:6 › Now Playing bar is one pipeline for all projects › advancing the engine owner keeps the bar put even when another project is selected 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 
  127 passed (9.3m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.