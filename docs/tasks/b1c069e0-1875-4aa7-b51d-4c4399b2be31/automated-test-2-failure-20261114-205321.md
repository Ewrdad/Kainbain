<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Enforce binary-safe proof artifacts and repo-root scratch hygiene
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1074.102s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 988ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (36 files in 127ms)
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
Running Unit Tests (api)... [0;31mFAIL[0m (1066s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3636 of 3756 lines; showing the tail)
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/runnerRoutes.attribution.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyPermissions.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m work/taskWorkingLocation.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m watch/stageReports.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/OpencodeDiscoveryStatus.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m utils/platform.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/stagePolicy.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m promptCuration.docsDir.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyHarness.targetHandoff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m appUrl.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m promptCuration.noCode.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m skills/questionMeImageGen.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.test.js [2m([22m[2m26 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m skillConditionals.shared.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m redactSecrets.shared.test.js [2m([22m[2m24 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m16 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — keeping the stored model "m" (ignored at dispatch until the harness offers a catalog).

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m auth/apiKeyScopes.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m crew/harnessRoster.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForImpromptu.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/resolveAliasRequirement.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.runnerDispatch.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/integrationQueue.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m docsPath.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m auth/actor.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/runnerBootstrap.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspModelCatalog.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/runAttribution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/resolveAttestationStage.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/runnerAssignmentSummary.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/dispatch/staleAdvertReason.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 900117[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 900109[2mms[22m[39m
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


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m442 passed[39m[22m[90m (443)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m7185 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (7187)[39m
[2m   Start at [22m 20:35:36
[2m   Duration [22m 1064.36s[2m (tests 90%, import 6%, transform 3%)[22m

[2m    Isolate [22m [33m443 workers spawned[39m[2m · ~97ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~14.16s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (1066s)
Running Unit Tests (runner)... [0;32mPASS[0m (1066s)
Running Linting (api)... [0;32mPASS[0m (1066s)
Running Linting (frontend)... [0;32mPASS[0m (1066s)
Running Frontend Build... [0;32mPASS[0m (1066s)
Running Security Script Tests... [0;32mPASS[0m (1066s)
Running Dependency Check... [0;32mPASS[0m (1066s)
Running Dependency Audit Gate... [0;32mPASS[0m (1066s)
Running Harness Self-Tests... [0;32mPASS[0m (1066s)
Running Container Tests... [0;32mPASS[0m (1066s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.