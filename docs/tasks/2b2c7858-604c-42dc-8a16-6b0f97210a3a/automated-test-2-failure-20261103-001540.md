<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Make sure we are surfacing agent logs to the ui To debug issues we wwant to make sure we have all the possible details in the UI, however it seems that the log experience may of degraded a bit after switching from a monilith to runners so we just want to restore that. It should feel like you where just using muse code or similar with the level of details
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1570.318s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
s [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpEventMapper.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/pi/piHarness.modelResolution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/taskIdentity.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m routes/tasks.aliasWiring.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m promptCuration.docsDir.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/execution/materializeRunnerTaskDocs.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m watch/processLogs.test.js [2m([22m[2m44 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/runnerVersionCompat.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m eventBridge.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/taskEngineState.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m siteDocs.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m promptLayout/layoutStore.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m agentGuide.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m appUrl.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/claimStore.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyHarness.targetHandoff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m siteDocs.integrity.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m sessionStore.modelResolution.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m redactSecrets.shared.test.js [2m([22m[2m24 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 600129[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 600118[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 9[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m gitGate.test.js[2m > [22mgit() per-repository serialization gate[2m > [22mnever runs two git processes on the same repo at once
[31m[1mGitError[22m: git checkout kb/task-a timed out after 600000ms[39m
[36m [2m❯[22m Timeout._onTimeout git/exec.js:[2m124:5[22m[39m
    [90m122|[39m    // live-holder check) and recovers only provably stale locks.
    [90m123|[39m    reject(
    [90m124|[39m     new GitError(`git ${args.join(" ")} timed out after ${timeout}ms`,…
    [90m   |[39m     [31m^[39m
    [90m125|[39m      args,
    [90m126|[39m      stdout,

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m371 passed[39m[22m[90m (372)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6154 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6156)[39m
[2m   Start at [22m 23:49:38
[2m   Duration [22m 728.68s[2m (tests 90%, import 7%, transform 3%)[22m

[2m    Isolate [22m [33m372 workers spawned[39m[2m · ~99ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~12.18s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (730s)
Running Unit Tests (runner)... [0;32mPASS[0m (730s)
Running Linting (api)... [0;32mPASS[0m (730s)
Running Linting (frontend)... [0;32mPASS[0m (730s)
Running Frontend Build... [0;32mPASS[0m (730s)
Running Security Script Tests... [0;32mPASS[0m (730s)
Running Dependency Check... [0;32mPASS[0m (730s)
Running Dependency Audit Gate... [0;32mPASS[0m (730s)
Running Harness Self-Tests... [0;32mPASS[0m (730s)
Running Container Tests... [0;32mPASS[0m (730s)
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
Running Canary Tests... [0;31mFAIL[0m (833s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 1429 of 1549 lines; showing the tail)
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  39) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 15000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:34

      32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      35 | 		timeout: 15000,
      36 | 	});
      37 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:77:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  40) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 15000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 15000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:34

      32 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      33 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 34 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      35 | 		timeout: 15000,
      36 | 	});
      37 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:34:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/helpers.js:77:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b2c7858-604c-42dc-8a16-6b0f97210a3a/canary-e2e/tests/workflow.spec.js:58:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  40 failed
    tests/accessibility.spec.js:69:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › orchestrator view has no axe violations 
    tests/accessibility.spec.js:74:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations 
    tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations 
    tests/accessibility.spec.js:89:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer view has no axe violations 
    tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:179:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 
    tests/accessibility.spec.js:188:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
    tests/accessibility.spec.js:280:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:286:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:373:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 
    tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published 
    tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console 
    tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit 
    tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges 
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/functional.spec.js:158:6 › KainBain Functional E2E Tests › in-place column task creation ─
    tests/functional.spec.js:198:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/now-playing-cross-project.spec.js:305:6 › Now Playing bar is one pipeline for all projects › advancing the engine owner keeps the bar put even when another project is selected 
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
  95 passed (13.9m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.