<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Survey results are not being saved Although surveys are being created they arent being filled in leaving a blank template
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 480.28s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
s (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (34s), Unit Tests (frontend) (34s), Linting (api) (34s), Linting (frontend) (34s), Frontend Build (34s), Security Script Tests (34s), Dependency Check (34s), Dependency Audit Gate (34s), Harness Self-Tests (34s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Frontend Build (1m00s), Security Script Tests (1m00s), Dependency Check (1m00s), Dependency Audit Gate (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s), Frontend Build (1m30s), Security Script Tests (1m30s), Dependency Check (1m30s), Dependency Audit Gate (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Unit Tests (frontend) (2m00s), Linting (frontend) (2m00s), Frontend Build (2m00s), Dependency Check (2m00s), Dependency Audit Gate (2m00s), Harness Self-Tests (2m00s)
⏳ still running: Unit Tests (api) (2m35s), Unit Tests (frontend) (2m35s), Linting (frontend) (2m35s), Frontend Build (2m35s), Dependency Check (2m35s), Dependency Audit Gate (2m35s), Harness Self-Tests (2m35s)
⏳ still running: Unit Tests (api) (3m06s), Unit Tests (frontend) (3m06s), Linting (frontend) (3m06s), Frontend Build (3m06s), Dependency Check (3m06s), Dependency Audit Gate (3m06s), Harness Self-Tests (3m06s)
⏳ still running: Unit Tests (api) (3m55s), Unit Tests (frontend) (3m55s), Linting (frontend) (3m55s), Frontend Build (3m55s), Dependency Check (3m55s), Dependency Audit Gate (3m55s), Harness Self-Tests (3m55s)
⏳ still running: Unit Tests (api) (4m25s), Unit Tests (frontend) (4m25s), Linting (frontend) (4m25s), Frontend Build (4m25s), Dependency Check (4m25s), Dependency Audit Gate (4m25s), Harness Self-Tests (4m25s)
⏳ still running: Unit Tests (api) (4m55s), Unit Tests (frontend) (4m55s)
⏳ still running: Unit Tests (api) (5m25s), Unit Tests (frontend) (5m25s)
⏳ still running: Unit Tests (api) (5m55s), Unit Tests (frontend) (5m55s)
⏳ still running: Unit Tests (api) (6m25s)
⏳ still running: Unit Tests (api) (6m55s)
⏳ still running: Unit Tests (api) (7m25s)
Running Unit Tests (api)... [0;31mFAIL[0m (473s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3085 of 3205 lines; showing the tail)
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m utils/platform.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m crew/harnessRoster.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museEventMapper.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m promptCuration.docsDir.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.audit.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/taskIdentity.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/integrationQueue.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m agent/sessionEvents.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/runnerRoutes.attribution.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m projectRegistry.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/taskEngineState.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m continuity/deployFailureReason.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m stageRunnerPolicy.shared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — ignoring the stored model "m". Clear the model in Settings › Model Aliases.

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/runnerVersionCompat.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 3 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m gitWorkspaceIsolation.integration.test.js[2m > [22mper-task worktree isolation[2m > [22mfinalises inside the worktree and leaves the primary on default
[31m[1mError[22m: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m gitWorkspaceIsolation.integration.test.js:[2m514:2[22m[39m
    [90m512|[39m  });
    [90m513|[39m
    [90m514|[39m  it("finalises inside the worktree and leaves the primary on default",…
    [90m   |[39m  [31m^[39m
    [90m515|[39m   const { cwd, store } = worktreeRepo("finalise");
    [90m516|[39m   const task = makeTask(store, cwd, "worktree work");

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯[22m[39m

[41m[1m FAIL [22m[49m work/taskFinalize.test.js[2m > [22mfinalizeTaskBranch against a real repository[2m > [22mkeeps pickup order default-first (existing branch via the default branch)
[31m[1mError[22m: Test timed out in 120000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m work/taskFinalize.test.js:[2m419:2[22m[39m
    [90m417|[39m  });
    [90m418|[39m
    [90m419|[39m  it("keeps pickup order default-first (existing branch via the default…
    [90m   |[39m  [31m^[39m
    [90m420|[39m   const repo = path.join(base, "pickup-order");
    [90m421|[39m   initRepo(repo);

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯[22m[39m

[41m[1m FAIL [22m[49m agent/harnesses/shared/harnessScaffold.test.js[2m > [22mstartSupervisedSpawn[2m > [22mkill() is a safe no-op after the child already exited
[31m[1mError[22m: waitFor timed out[39m
[36m [2m❯[22m Timeout.tick [as _onTimeout] agent/harnesses/shared/harnessScaffold.test.js:[2m56:19[22m[39m
    [90m 54|[39m    if (done) return resolve();
    [90m 55|[39m    if (Date.now() - started > timeoutMs) {
    [90m 56|[39m     return reject(new Error("waitFor timed out"));
    [90m   |[39m                   [31m^[39m
    [90m 57|[39m    }
    [90m 58|[39m    setTimeout(tick, intervalMs);

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯[22m[39m


[2m Test Files [22m [1m[31m3 failed[39m[22m[2m | [22m[1m[32m375 passed[39m[22m[90m (378)[39m
[2m      Tests [22m [1m[31m3 failed[39m[22m[2m | [22m[1m[32m6279 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6283)[39m
[2m   Start at [22m 13:36:38
[2m   Duration [22m 471.52s[2m (tests 79%, import 17%, transform 3%)[22m

[2m    Isolate [22m [33m378 workers spawned[39m[2m · ~119ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~14.87s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;31mFAIL[0m (473s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
(trimmed 14975 of 15095 lines; showing the tail)
            [33mrole[39m=[32m"tab"[39m
            [33mtype[39m=[32m"button"[39m
          [36m>[39m
            [36m<span[39m
              [33maria-hidden[39m=[32m"true"[39m
            [36m>[39m
              [0m🌐[0m
            [36m</span>[39m
            [36m<span>[39m
              [0mAddresses[0m
            [36m</span>[39m
          [36m</button>[39m
          [36m<button[39m
            [33maria-controls[39m=[32m"project-settings-tabpanel"[39m
            [33maria-selected[39m=[32m"false"[39m
            [33mclass[39m=[32m"px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface"[39m
            [33mid[39m=[32m"project-settings-tab-workflows"[39m
            [33mrole[39m=[32m"tab"[39m
            [33mtype[39m=[32m"button"[39m
          [36m>[39m
            [36m<span[39m
              [33maria-hidden[39m=[32m"true"[39m
            [36m>[39m
              [0m🔀[0m
            [36m</span>[39m
            [36m<span>[39m
              [0mNamed Workflows[0m
            [36m</span>[39m
          [36m</button>[39m
          [36m<button[39m
            [33maria-controls[39m=[32m"project-settings-tabpanel"[39m
            [33maria-selected[39m=[32m"false"[39m
            [33mclass[39m=[32m"px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface"[39m
            [33mid[39m=[32m"project-settings-tab-skills"[39m
            [33mrole[39m=[32m"tab"[39m
            [33mtype[39m=[32m"button"[39m
          [36m>[39m
            [36m<span[39m
              [33maria-hidden[39m=[32m"true"[39m
            [36m>[39m
              [0m🧩[0m
            [36m</span>[39m
            [36m<span>[39m
              [0mSkills[0m
            [36m</span>[39m
          [36m</button>[39m
        [36m</div>[39m
        [36m<div[39m
          [33mclass[39m=[32m"shrink-0"[39m
        [36m>[39m
          [36m<div[39m
            [33mclass[39m=[32m"relative"[39m
          [36m>[39m
            [36m<input[39m
              [33maria-controls[39m=[32m"project-settings-search-listbox"[39m
              [33maria-expanded[39m=[32m"false"[39m
              [33maria-label[39m=[32m"Search settings"[39m
              [33mclass[39m=[32m"p-2 bg-surface-container border border-border-standard rounded-sm text-xs outline-none focus:border-primary transition-colors text-on-surface placeholder:text-text-muted w-44"[39m
              [33mplaceholder[39m=[32m"Search settings…"[39m
              [33mrole[39m=[32m"combobox"[39m
              [33mtype[39m=[32m"text"[39m
              [33mvalue[39m=[32m""[39m
            [36m/>[39m
          [36m</div>[39m
        [36m</div>[39m
      [36m</div>[39m
      [36m<div[39m
        [33maria-labelledby[39m=[32m"project-settings-tab-project"[39m
        [33mid[39m=[32m"project-settings-tabpanel"[39m
        [33mrole[39m=[32m"tabpanel"[39m
      [36m>[39m
        [36m<div>[39m
          [36m<h2[39m
  ...
[90m [2m❯[22m Object.getElementError node_modules/@testing-library/dom/dist/config.js:[2m37:19[22m[39m
[90m [2m❯[22m node_modules/@testing-library/dom/dist/query-helpers.js:[2m76:38[22m[39m
[90m [2m❯[22m node_modules/@testing-library/dom/dist/query-helpers.js:[2m52:17[22m[39m
[90m [2m❯[22m node_modules/@testing-library/dom/dist/query-helpers.js:[2m95:19[22m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1609:26[22m[39m
    [90m1607|[39m   });
    [90m1608|[39m   // The save button still shows the first save's confirmation label.
    [90m1609|[39m   fireEvent.click(screen.getByRole('button', { name: /saved/i }));
    [90m   |[39m                          [31m^[39m
    [90m1610|[39m   await waitFor(() => {
    [90m1611|[39m     expect(api.updateProject).toHaveBeenCalledTimes(2);

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/tasks/TaskDetailPage.test.jsx[2m > [22mTaskDetailPage full-page route component[2m > [22mswitches tabs between Details, Reports, Terminal Logs, and History
[31m[1mError[22m: Test timed out in 60000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m src/components/tasks/TaskDetailPage.test.jsx:[2m175:3[22m[39m
    [90m173|[39m   });
    [90m174|[39m
    [90m175|[39m   test('switches tabs between Details, Reports, Terminal Logs, and His…
    [90m   |[39m   [31m^[39m
    [90m176|[39m     const getTaskReports = vi.fn().mockResolvedValue([
    [90m177|[39m       {

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/workflow/WorkflowCanvas.tagFilter.test.jsx[2m > [22mfree text filters tasks inside the tag-visible stages
[31m[1mError[22m: Test timed out in 60000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".[39m
[36m [2m❯[22m src/components/workflow/WorkflowCanvas.tagFilter.test.jsx:[2m108:1[22m[39m
    [90m106|[39m });
    [90m107|[39m
    [90m108|[39m test('free text filters tasks inside the tag-visible stages', () => {
    [90m   |[39m [31m^[39m
    [90m109|[39m   const { container } = renderBoard();
    [90m110|[39m   typeQuery('Dev work #PO');

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯[22m[39m


[2m Test Files [22m [1m[31m3 failed[39m[22m[2m | [22m[1m[32m297 passed[39m[22m[90m (300)[39m
[2m      Tests [22m [1m[31m3 failed[39m[22m[2m | [22m[1m[32m4149 passed[39m[22m[90m (4152)[39m
[2m   Start at [22m 13:36:40
[2m   Duration [22m 368.03s[2m (tests 65%, environment 16%, worker 7%, setup 6%, transform 3%, import 2%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (473s)
Running Linting (api)... [0;32mPASS[0m (473s)
Running Linting (frontend)... [0;32mPASS[0m (473s)
Running Frontend Build... [0;32mPASS[0m (473s)
Running Security Script Tests... [0;32mPASS[0m (473s)
Running Dependency Check... [0;32mPASS[0m (473s)
Running Dependency Audit Gate... [0;32mPASS[0m (473s)
Running Harness Self-Tests... [0;32mPASS[0m (473s)
Running Container Tests... [0;32mPASS[0m (473s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.