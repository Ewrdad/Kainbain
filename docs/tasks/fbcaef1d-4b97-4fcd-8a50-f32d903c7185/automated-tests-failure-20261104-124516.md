<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Survey results are not being saved Although surveys are being created they arent being filled in leaving a blank template
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1552.371s
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
✅ Settings duplicate check passed (30 files in 129ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
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
⏳ still running: Unit Tests (api) (11m00s)
⏳ still running: Unit Tests (api) (11m30s)
⏳ still running: Unit Tests (api) (12m00s)
⏳ still running: Unit Tests (api) (12m31s)
Running Unit Tests (api)... [0;31mFAIL[0m (762s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3027 of 3147 lines; showing the tail)
 [32m✓[39m flow/engineRoutes.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m continuity/sharedGateAttribution.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/dispatch/scanClaimableTasks.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/runAttribution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/integrationQueue.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m promptLayout/promptLayout.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.test.js [2m([22m[2m23 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m docsPath.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpEventMapper.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m routes/tasks.aliasWiring.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/runnerRoutes.attribution.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.audit.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m watch/stageReports.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/resolveAliasRequirement.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/visionSupport.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museEventMapper.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/taskIdentity.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/sessionEvents.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m projectRegistry.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/taskEngineState.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/taskRequirements.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m deploy.packaging.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — ignoring the stored model "m". Clear the model in Settings › Model Aliases.

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/runnerVersionCompat.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 600125[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 600115[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 8[2mms[22m[39m

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


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m377 passed[39m[22m[90m (378)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6277 passed[39m[22m[2m | [22m[33m3 skipped[39m[90m (6281)[39m
[2m   Start at [22m 12:19:33
[2m   Duration [22m 759.71s[2m (tests 87%, import 9%, transform 3%)[22m

[2m    Isolate [22m [33m378 workers spawned[39m[2m · ~130ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~16.24s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (762s)
Running Unit Tests (runner)... [0;32mPASS[0m (762s)
Running Linting (api)... [0;32mPASS[0m (762s)
Running Linting (frontend)... [0;32mPASS[0m (762s)
Running Frontend Build... [0;32mPASS[0m (762s)
Running Security Script Tests... [0;32mPASS[0m (762s)
Running Dependency Check... [0;32mPASS[0m (762s)
Running Dependency Audit Gate... [0;32mPASS[0m (762s)
Running Harness Self-Tests... [0;32mPASS[0m (762s)
Running Container Tests... [0;32mPASS[0m (762s)
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
Running Canary Tests... [0;32mPASS[0m (782s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.