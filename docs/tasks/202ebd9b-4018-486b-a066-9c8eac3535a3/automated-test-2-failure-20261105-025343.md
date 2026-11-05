<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Please allow for a meta rayban display interface the ui must be have a new mode for when the canvas is around 600*600 pixels so it can work on meta rayban display. Prioritise observability and quick reviews over being fully functional this should not impact the desktop or mobile views at all and should be ideal for getting this done. Make sure to use the image generation option in the question me skill for some mockups
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1092.739s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
n.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m servingModelFor.shared.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/runnerVersionCompat.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/dispatch/fleetModelCatalog.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/runnerPosture.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/dispatch/operatorConfigVerdict.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 840119[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 840112[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 6[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m gitGate.test.js[2m > [22mgit() per-repository serialization gate[2m > [22mnever runs two git processes on the same repo at once
[31m[1mGitError[22m: git checkout kb/task-a timed out after 840000ms[39m
[36m [2m❯[22m Timeout._onTimeout git/exec.js:[2m124:5[22m[39m
    [90m122|[39m    // live-holder check) and recovers only provably stale locks.
    [90m123|[39m    reject(
    [90m124|[39m     new GitError(`git ${args.join(" ")} timed out after ${timeout}ms`,…
    [90m   |[39m     [31m^[39m
    [90m125|[39m      args,
    [90m126|[39m      stdout,

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m395 passed[39m[22m[90m (396)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6492 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6494)[39m
[2m   Start at [22m 02:35:40
[2m   Duration [22m 1082.45s[2m (tests 92%, import 5%, transform 2%)[22m

[2m    Isolate [22m [33m396 workers spawned[39m[2m · ~107ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~13.96s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;31mFAIL[0m (1085s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
(trimmed 16574 of 16694 lines; showing the tail)
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at KainBainProvider (/home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/context/KainBainContext.jsx:47:36)
Warning: An update to KainBainProvider inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at KainBainProvider (/home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/context/KainBainContext.jsx:47:36)

 [32m✓[39m [30m[43m 0 [49m[39m src/context/KainBainContext.surface.test.jsx [2m([22m[2m1 test[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/glasses/glassesHelpers.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/retrospective/chatProgress.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/context/usePendingTaskSave.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/wakeLock.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/widgets/KpiSuccessesWidget.test.jsx [2m([22m[2m3 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/a11y/useDocumentTitle.test.jsx [2m([22m[2m11 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/a11y/statementResults.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/apiBase.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/workflow/searchQueryParser.test.js [2m([22m[2m28 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/utils/timeoutUnits.test.js [2m([22m[2m30 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/common/GlossaryTerm.test.jsx [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/widgets/KpiFailuresWidget.test.jsx [2m([22m[2m2 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/modelKeys.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/settings/projectSettingsSearch.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/blockedByCandidates.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/RunnerBanner.test.jsx [2m([22m[2m3 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/settings/openSystemSettings.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/runningTask.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/taskRetryState.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/theme/containerContrast.test.js [2m([22m[2m51 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/widgets/KpiCheckpointsWidget.test.jsx [2m([22m[2m2 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/layout/projectMenuFilter.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/a11y/reducedMotion.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/fleetModelOptions.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/api.surface.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/TaskDetailReportsPane.test.jsx [2m([22m[2m2 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/a11y/listShippedSourceFiles.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/hooks/useTapGuard.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/retrospective/quickActions.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/reliabilityStatus.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/checkpointState.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/monitorCompact.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/widgets/healthStatus.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/settings/projectSettingsValidation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/retrospective/retrospectiveStats.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/mobileModelDetails.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/context/useAccentTheme.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/logger.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/goalDefaultMode.test.js [2m([22m[2m16 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/glasses/GlassesViewportGate.test.jsx [2m([22m[2m2 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/review/reportPaths.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/util/viewport.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/retrospective/retrospectiveMobile.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/formatModelRef.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/repoHost.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/pushServiceWorkerLifecycle.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/isMonitorRunning.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/mobileModelLine.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/house/index.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/settings/settingsTabs.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/services/clipboard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/settings/projectSettingsTabs.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/taskBranch.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/logs/consoleStyles.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/tasks/TaskCard.modelHarness.test.jsx [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/observability/mobileMonitorTitle.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/logs/logScroll.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/theme/lightThemeContrast.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/workflow/WorkflowCanvas.mobileCss.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m [30m[43m 0 [49m[39m src/components/util/headerVisibility.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
[vitest-pool]: Timeout terminating vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/theme/lightThemeContrast.test.js.
[vitest-pool]: Timeout terminating vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/components/workflow/WorkflowCanvas.mobileCss.test.js.
[vitest-pool]: Timeout terminating vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/components/util/headerVisibility.test.js.
[vitest-pool]: Failed to terminate vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/theme/lightThemeContrast.test.js. Error: [vitest-pool-runner]: Timeout waiting for worker to respond
    at Timeout.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/node_modules/vitest/dist/chunks/index.DpLw24bj.js:11035:58)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7)
[vitest-pool]: Failed to terminate vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/components/workflow/WorkflowCanvas.mobileCss.test.js. Error: [vitest-pool-runner]: Timeout waiting for worker to respond
    at Timeout.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/node_modules/vitest/dist/chunks/index.DpLw24bj.js:11035:58)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7)
[vitest-pool]: Failed to terminate vmThreads worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/components/util/headerVisibility.test.js. Error: [vitest-pool-runner]: Timeout waiting for worker to respond
    at Timeout.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/node_modules/vitest/dist/chunks/index.DpLw24bj.js:11035:58)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7)
[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Unhandled Errors [49m[22m[31m⎯⎯⎯⎯⎯⎯[39m
[31m[1m
Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.[22m[39m

[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Unhandled Error [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m
[31m[1mError[22m: [vitest-pool]: Failed to start forks worker for test files /home/[REDACTED]/.kainbain/runner-work/kb-202ebd9b-4018-486b-a066-9c8eac3535a3/frontend/src/components/workflow/StageSkillsPanel.test.jsx.[39m
[90m [2m❯[22m node_modules/vitest/dist/chunks/index.DpLw24bj.js:[2m11538:94[22m[39m
[90m [2m❯[22m runNextTicks node:internal/process/task_queues:[2m65:5[22m[39m
[90m [2m❯[22m listOnTimeout node:internal/timers:[2m567:9[22m[39m
[90m [2m❯[22m process.processTimers node:internal/timers:[2m541:7[22m[39m
[90m [2m❯[22m Pool.schedule node_modules/vitest/dist/chunks/index.DpLw24bj.js:[2m11538:5[22m[39m

[31m[1mCaused by: Error[22m: [vitest-pool-runner]: Timeout waiting for worker to respond[39m
[90m [2m❯[22m Timeout.<anonymous> node_modules/vitest/dist/chunks/index.DpLw24bj.js:[2m11035:58[22m[39m
[90m [2m❯[22m listOnTimeout node:internal/timers:[2m605:17[22m[39m
[90m [2m❯[22m process.processTimers node:internal/timers:[2m541:7[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[39m


[2m Test Files [22m [1m[32m317 passed[39m[22m[90m (317)[39m
[2m      Tests [22m [1m[32m4281 passed[39m[22m[90m (4281)[39m
[2m     Errors [22m [1m[31m1 error[39m[22m
[2m   Start at [22m 02:35:41
[2m   Duration [22m 147.89s[2m (tests 46%, setup 22%, transform 11%, worker 9%, environment 6%, import 6%)[22m

close timed out after 10000ms
Tests closed successfully but something prevents 2 Vite servers from exiting
You can try to identify the cause by enabling "hanging-process" reporter. See https://vitest.dev/guide/reporters.html#hanging-process-reporter
----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (1085s)
Running Linting (api)... [0;32mPASS[0m (1085s)
Running Linting (frontend)... [0;32mPASS[0m (1085s)
Running Frontend Build... [0;32mPASS[0m (1085s)
Running Security Script Tests... [0;32mPASS[0m (1085s)
Running Dependency Check... [0;32mPASS[0m (1085s)
Running Dependency Audit Gate... [0;32mPASS[0m (1085s)
Running Harness Self-Tests... [0;32mPASS[0m (1085s)
Running Container Tests... [0;32mPASS[0m (1085s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.