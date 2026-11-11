<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Runners are not autodetecting correctly  Key error seems to be with muse code but I suspect on others. Muse has just released a new model in the harness however for some reason it is not selectable in the ui ( but is in muse code)   Crutially this hasnt made it sway to the alias choices either, especailly since muse code keeps having its model for aliases wiped.    Please fix all this behaviour and make sure we have a firm and trusted way to build our model catalogue from the attached harnesses. For context the model catalogue should get model options from the runner, convert them into the kainbain standard harness::model::effort and save them then the Ui should allow selecting from that central list.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1166.395s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 947ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (35 files in 140ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;31mFAIL[0m (213s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3478 of 3598 lines; showing the tail)
 [32m✓[39m promptCuration.docsDir.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m watch/stageReports.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m docsPath.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m work/taskIdentity.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m work/taskWorkingLocation.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.audit.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m projectRegistry.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m flow/runnerVersionCompat.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m skillConditionals.shared.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m auth/apiKeyScopes.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/taskRequirements.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/catalogIngest.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/taskPersistence.autoApprove.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForImpromptu.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m auth/roles.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m deploy.packaging.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — keeping the stored model "m" (ignored at dispatch until the harness offers a catalog).

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerModelConfirmation.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.autoApprove.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m auth/actor.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/runnerAssignmentSummary.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/runnerBootstrap.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m reviewCommentFormatter.autoApprove.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/dispatch/staleAdvertReason.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m flow/integrationBusyFallsThrough.test.js[2m > [22mMerge dispatch answer shape[2m > [22massigns a free merge slot as a complete integrate job
[31m[1mError[22m: Command failed: git init -q --bare[39m
[36m [2m❯[22m originWithMergeTask flow/integrationBusyFallsThrough.test.js:[2m31:2[22m[39m
    [90m 29|[39m function originWithMergeTask(taskBranch) {
    [90m 30|[39m  const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intbusy-orig…
    [90m 31|[39m  execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "…
    [90m   |[39m  [31m^[39m
    [90m 32|[39m  const backend = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intbusy-bac…
    [90m 33|[39m  execFileSync("git", ["clone", "-q", origin, backend], { stdio: "ignor…
[90m [2m❯[22m flow/integrationBusyFallsThrough.test.js:[2m143:31[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m431 passed[39m[22m[90m (432)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6940 passed[39m[22m[2m | [22m[33m3 skipped[39m[90m (6944)[39m
[2m   Start at [22m 20:06:06
[2m   Duration [22m 211.64s[2m (tests 67%, import 23%, transform 9%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m432 workers spawned[39m[2m · ~160ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~22.95s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (213s)
Running Unit Tests (runner)... [0;32mPASS[0m (213s)
Running Linting (api)... [0;32mPASS[0m (213s)
Running Linting (frontend)... [0;32mPASS[0m (213s)
Running Frontend Build... [0;32mPASS[0m (213s)
Running Security Script Tests... [0;32mPASS[0m (213s)
Running Dependency Check... [0;32mPASS[0m (213s)
Running Dependency Audit Gate... [0;32mPASS[0m (213s)
Running Harness Self-Tests... [0;32mPASS[0m (213s)
Running Container Tests... [0;32mPASS[0m (213s)
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
Running Canary Tests... [0;32mPASS[0m (944s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.