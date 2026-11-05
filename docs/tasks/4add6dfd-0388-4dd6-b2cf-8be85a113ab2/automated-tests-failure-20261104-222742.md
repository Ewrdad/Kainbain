<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can you make sure all site docs documentation is up to date This needs a fundemetnal review as many things may be out of date. The essential targets to get right is: - Getting started - Installation guide - How to add a new runner - How to link it to your existing harnesses (seperate guide per harness)  - How to do your first project - How to load in existing projects - How to create custom skills for kainbain agents As well as any other already existing. These must be detailed guides that are easily readable and understandable
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 987.705s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
ests (api)
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
Running Unit Tests (api)... [0;31mFAIL[0m (189s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3115 of 3235 lines; showing the tail)
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agent/visionSupport.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m agent/sessionEvents.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/runAttribution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m work/taskEngineState.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m flow/dispatch/taskRequirements.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m skillConditionals.shared.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — ignoring the stored model "m". Clear the model in Settings › Model Aliases.

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 2 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m siteDocs.integrity.test.js[2m > [22msiteDocs integrity (real content dir)[2m > [22mgives every article a unique order within its section
[31m[1mAssertionError[22m: expected 'add-new-runner' to be undefined[39m

[32m- Expected:[39m
undefined

[31m+ Received:[39m
"add-new-runner"

[36m [2m❯[22m siteDocs.integrity.test.js:[2m65:26[22m[39m
    [90m 63|[39m   for (const doc of docs) {
    [90m 64|[39m    const key = `${doc.section}:${doc.order}`;
    [90m 65|[39m    expect(seen.get(key)).toBeUndefined();
    [90m   |[39m                          [31m^[39m
    [90m 66|[39m    seen.set(key, doc.slug);
    [90m 67|[39m   }

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯[22m[39m

[41m[1m FAIL [22m[49m siteDocs.integrity.test.js[2m > [22msiteDocs integrity (real content dir)[2m > [22mresolves every #/docs/<slug> cross-link in the index
[31m[1mAssertionError[22m: expected [ 'harness-pi', 'harness-muse' ] to deeply equal [][39m

[32m- Expected[39m
[31m+ Received[39m

[32m- [][39m
[31m+ [[39m
[31m+   "harness-pi",[39m
[31m+   "harness-muse",[39m
[31m+ ][39m

[36m [2m❯[22m siteDocs.integrity.test.js:[2m78:20[22m[39m
    [90m 76|[39m    }
    [90m 77|[39m   }
    [90m 78|[39m   expect(dangling).toEqual([]);
    [90m   |[39m                    [31m^[39m
    [90m 79|[39m  });
    [90m 80|[39m });

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m386 passed[39m[22m[90m (387)[39m
[2m      Tests [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m6451 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6454)[39m
[2m   Start at [22m 22:11:24
[2m   Duration [22m 188.00s[2m (tests 68%, import 21%, transform 9%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m387 workers spawned[39m[2m · ~147ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~18.87s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
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
⏳ still running: Canary Tests (2m01s)
⏳ still running: Canary Tests (2m31s)
⏳ still running: Canary Tests (3m01s)
⏳ still running: Canary Tests (3m31s)
⏳ still running: Canary Tests (4m01s)
⏳ still running: Canary Tests (4m31s)
⏳ still running: Canary Tests (5m01s)
⏳ still running: Canary Tests (5m31s)
⏳ still running: Canary Tests (6m01s)
⏳ still running: Canary Tests (6m31s)
⏳ still running: Canary Tests (7m01s)
⏳ still running: Canary Tests (7m31s)
⏳ still running: Canary Tests (8m01s)
⏳ still running: Canary Tests (8m31s)
⏳ still running: Canary Tests (9m01s)
⏳ still running: Canary Tests (9m31s)
⏳ still running: Canary Tests (10m01s)
⏳ still running: Canary Tests (10m31s)
⏳ still running: Canary Tests (11m01s)
⏳ still running: Canary Tests (11m31s)
⏳ still running: Canary Tests (12m01s)
⏳ still running: Canary Tests (12m31s)
⏳ still running: Canary Tests (13m01s)
Running Canary Tests... [0;31mFAIL[0m (790s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 506 of 626 lines; showing the tail)


       at helpers.js:46

      44 | export async function waitForAppReady(page) {
      45 | 	try {
    > 46 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      47 | 	} catch (err) {
      48 | 		// One bounded re-issue for transient gate-host resource windows
      49 | 		// (net::ERR_INSUFFICIENT_RESOURCES across the module burst, or a
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:46:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:104:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/workflow.spec.js:12:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  15) tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:46

      44 | export async function waitForAppReady(page) {
      45 | 	try {
    > 46 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      47 | 	} catch (err) {
      48 | 		// One bounded re-issue for transient gate-host resource windows
      49 | 		// (net::ERR_INSUFFICIENT_RESOURCES across the module burst, or a
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:46:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:104:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/workflow.spec.js:12:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-3025d-p-no-global-engine-controls/error-context.md

  16) tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:46

      44 | export async function waitForAppReady(page) {
      45 | 	try {
    > 46 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      47 | 	} catch (err) {
      48 | 		// One bounded re-issue for transient gate-host resource windows
      49 | 		// (net::ERR_INSUFFICIENT_RESOURCES across the module burst, or a
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:46:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:104:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/workflow.spec.js:12:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-b0511-ject-loads-its-own-workflow/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-b0511-ject-loads-its-own-workflow/error-context.md

  17) tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel 

    Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5299/
    Call log:
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


       at helpers.js:46

      44 | export async function waitForAppReady(page) {
      45 | 	try {
    > 46 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      47 | 	} catch (err) {
      48 | 		// One bounded re-issue for transient gate-host resource windows
      49 | 		// (net::ERR_INSUFFICIENT_RESOURCES across the module burst, or a
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:46:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/helpers.js:104:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-4add6dfd-0388-4dd6-b2cf-8be85a113ab2/canary-e2e/tests/workflow.spec.js:12:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/error-context.md

  Slow test file: tests/accessibility.spec.js (7.3m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  17 failed
    tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ─────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop ────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet ─────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile ─────────────
    tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake 
    tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 
    tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow 
    tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel 
  121 passed (13.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.