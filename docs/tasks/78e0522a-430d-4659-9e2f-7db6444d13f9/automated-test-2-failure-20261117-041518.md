<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Add a restart and update as seperate options for runners ![image.png](assets/image.png) Instead of reload mark it as a destructive action that restarts the selected runner with a confirmation window. I would also like some version controls so we can either tie the runner to a specific version or have latest.  If the version in the selector mis-matches the version in the ui it should show a warning with an Update button than will trigger the reinstall/update to the latest version (if set to latest this should show every time a new version is published. and only if it is set to latest do we have autoupdate behaviour, latest should be the default) If there is a newer version it should show the warning that a newer version is available in red to scare them into updating.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1507.045s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 1s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (37 files in 142ms)
✅ Frontend imports check passed (753 files in 292ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Proof Hygiene
▸ started Binary Guard
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
⏳ still running: Unit Tests (api) (4m30s)
⏳ still running: Unit Tests (api) (5m00s)
⏳ still running: Unit Tests (api) (5m30s)
⏳ still running: Unit Tests (api) (6m00s)
⏳ still running: Unit Tests (api) (6m30s)
⏳ still running: Unit Tests (api) (7m00s)
⏳ still running: Unit Tests (api) (7m30s)
⏳ still running: Unit Tests (api) (8m00s)
⏳ still running: Unit Tests (api) (8m30s)
⏳ still running: Unit Tests (api) (9m00s)
⏳ still running: Unit Tests (api) (9m30s)
⏳ still running: Unit Tests (api) (10m00s)
⏳ still running: Unit Tests (api) (10m30s)
⏳ still running: Unit Tests (api) (11m01s)
⏳ still running: Unit Tests (api) (11m31s)
⏳ still running: Unit Tests (api) (12m01s)
⏳ still running: Unit Tests (api) (12m31s)
⏳ still running: Unit Tests (api) (13m01s)
⏳ still running: Unit Tests (api) (13m31s)
⏳ still running: Unit Tests (api) (14m01s)
⏳ still running: Unit Tests (api) (14m31s)
⏳ still running: Unit Tests (api) (15m01s)
⏳ still running: Unit Tests (api) (15m31s)
⏳ still running: Unit Tests (api) (16m01s)
⏳ still running: Unit Tests (api) (16m31s)
⏳ still running: Unit Tests (api) (17m01s)
⏳ still running: Unit Tests (api) (17m31s)
Running Unit Tests (api)... [0;31mFAIL[0m (1057s)
----------------------------------------------------------------------
Details for Unit Tests (api):
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/unit-tests-api.full.log
(trimmed 3778 of 3898 lines; showing the tail)
 [32m✓[39m agent/sessionEvents.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m skills/questionMeImageGen.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m crew/harnessRoster.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpEventMapper.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.autoApprove.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.audit.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/runnerRoutes.attribution.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m continuity/deployMarkers.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m projectRegistry.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m appUrl.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m auth/apiKeyScopes.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/fastGateMarker.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/taskWorkingLocation.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m deploy.packaging.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m skillConditionals.shared.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/taskPersistence.autoApprove.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/runnerAssignmentSummary.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/scheduler/centralQueueSeam.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForImpromptu.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m auth/roles.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — keeping the stored model "m" (ignored at dispatch until the harness offers a catalog).

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/runnerBootstrap.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspModelCatalog.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m auth/actor.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m28 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m reviewCommentFormatter.autoApprove.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/resolveAttestationStage.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/dispatch/staleAdvertReason.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
{"level":30,"time":1794888038973,"pid":1033846,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m siteDocs.frontendParity.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 263[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 900112[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 900104[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 6[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m gitGate.test.js[2m > [22mgit() per-repository serialization gate[2m > [22mnever runs two git processes on the same repo at once
[31m[1mError[22m: Test timed out in 900000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m gitGate.test.js:[2m82:2[22m[39m
    [90m 80|[39m  const opts = { timeout: null };
    [90m 81|[39m
    [90m 82|[39m  it("never runs two git processes on the same repo at once", { timeout…
    [90m   |[39m  [31m^[39m
    [90m 83|[39m   spawnMock.mockReset();
    [90m 84|[39m   const first = deferredChild();

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m451 passed[39m[22m[90m (452)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m7405 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (7407)[39m
[2m   Start at [22m 03:57:42
[2m   Duration [22m 1056.10s[2m (tests 90%, import 7%, transform 3%)[22m

[2m    Isolate [22m [33m452 workers spawned[39m[2m · ~98ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~14.61s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (1057s)
Running Unit Tests (runner)... [0;32mPASS[0m (1057s)
Running Linting (api)... [0;32mPASS[0m (1057s)
Running Linting (frontend)... [0;32mPASS[0m (1057s)
Running Frontend Build... [0;32mPASS[0m (1057s)
Running Security Script Tests... [0;32mPASS[0m (1057s)
Running Dependency Check... [0;32mPASS[0m (1057s)
Running Dependency Audit Gate... [0;32mPASS[0m (1057s)
Running Proof Hygiene... [0;32mPASS[0m (1057s)
Running Binary Guard... [0;32mPASS[0m (1057s)
Running Harness Self-Tests... [0;32mPASS[0m (1057s)
Running Container Tests... [0;32mPASS[0m (1057s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=opted_out verdict="/home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: opted out (--no-canary)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/verdict.json

KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=opted_out verdict="/home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: opted out (--no-canary)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-78e0522a-430d-4659-9e2f-7db6444d13f9/docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/ci-fast-gate-20261117-035740/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.