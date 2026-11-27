<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can we double check our antigravity integration currently just looks like agy is spawned but does nothing and just passes the job, effectively acting as a skip.  Double check we conform to the latest versions and that we can accurately spawn antigravity agents.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 298.852s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (43 files in 190ms)
✅ Frontend imports check passed (768 files in 487ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Dependency Check (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Unit Tests (frontend) (2m00s), Harness Self-Tests (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
⏳ still running: Unit Tests (api) (4m30s)
Running Unit Tests (api)... [0;31mFAIL[0m (285s)
----------------------------------------------------------------------
Details for Unit Tests (api):
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/unit-tests-api.full.log
(trimmed 4182 of 4302 lines; showing the tail)
 [32m✓[39m flow/runAttribution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m taskAssetRefs.shared.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForImpromptu.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/scheduler/centralQueueSeam.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/fastGateMarker.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/scheduler/findResumedCandidate.priority.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.autoApprove.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/scheduler/capacityRefusalHide.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/taskWorkingLocation.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 23[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — keeping the stored model "m" (ignored at dispatch until the harness offers a catalog).

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m auth/actor.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/runnerAssignmentSummary.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/cleanSingleLineText.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m docsRepoResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/runnerBootstrap.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/resumeBackoffRemainingMs.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspModelCatalog.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/resolveAttestationStage.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/scheduler/clearGitFailureStreak.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m reviewCommentFormatter.autoApprove.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/isGitFailureParked.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/capacityRefusal.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/scheduler/isSchedulerRunnable.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/dispatch/staleAdvertReason.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 2 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m changelog.test.js[2m > [22mDeployManager.readChangelog fallbacks (no baked prod artifact)[2m > [22mprefers the baked prod artifact over bundled and live history
[31m[1mError[22m: Command failed: git commit --allow-empty-message -m Live fix
fatal: cannot update ref 'refs/heads/main': couldn't write '/tmp/changelog-fallback-5moYDa/.git/refs/heads/main.lock'
[39m
[36m [2m❯[22m run changelog.test.js:[2m37:9[22m[39m
    [90m 35|[39m
    [90m 36|[39m function run(cwd, ...args) {
    [90m 37|[39m  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pi…
    [90m   |[39m         [31m^[39m
    [90m 38|[39m }
    [90m 39|[39m
[90m [2m❯[22m commitFile changelog.test.js:[2m51:2[22m[39m
[90m [2m❯[22m changelog.test.js:[2m308:3[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯[22m[39m

[41m[1m FAIL [22m[49m projectStore.docsLink.test.js[2m > [22mProjectStore ensureDocsLink[2m > [22mrefuses rename if destination folder is an existing real directory (conflict)
[31m[1mError[22m: Unknown system error -122: Unknown system error -122, write[39m
[36m [2m❯[22m projectStore.docsLink.test.js:[2m287:6[22m[39m
    [90m285|[39m   const customDir = path.join(project.cwd, "kainbain-docs");
    [90m286|[39m   fs.mkdirSync(customDir, { recursive: true });
    [90m287|[39m   fs.writeFileSync(path.join(customDir, "existing.txt"), "hello");
    [90m   |[39m      [31m^[39m
    [90m288|[39m
    [90m289|[39m   expect(() => {

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯[22m[39m


[2m Test Files [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m479 passed[39m[22m[90m (481)[39m
[2m      Tests [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m7811 passed[39m[22m[2m | [22m[33m3 skipped[39m[90m (7816)[39m
[2m   Start at [22m 23:05:54
[2m   Duration [22m 282.34s[2m (tests 67%, import 22%, transform 10%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m481 workers spawned[39m[2m · ~158ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~25.16s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (285s)
Running Unit Tests (runner)... [0;32mPASS[0m (285s)
Running Linting (api)... [0;32mPASS[0m (285s)
Running Linting (frontend)... [0;32mPASS[0m (285s)
Running Frontend Build... [0;32mPASS[0m (285s)
Running Security Script Tests... [0;32mPASS[0m (285s)
Running Dependency Check... [0;32mPASS[0m (285s)
Running Dependency Audit Gate... [0;32mPASS[0m (285s)
Running Proof Hygiene... [0;32mPASS[0m (285s)
Running Binary Guard... [0;32mPASS[0m (285s)
Running Harness Self-Tests... [0;32mPASS[0m (285s)
Running Container Tests... [0;32mPASS[0m (285s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (api); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-9fc209aa-77a0-4672-9100-25b4611f7409/docs/tasks/9fc209aa-77a0-4672-9100-25b4611f7409/ci-fast-gate-20261126-230550/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.