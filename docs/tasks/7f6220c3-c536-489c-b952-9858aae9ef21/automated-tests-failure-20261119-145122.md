<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add support for projects having the kainbain docs in a seperate repo large projects may end up bloated with the project kainbain tasks/docs or we may be working on a repo with others who are non kainbain users. There may be reasons we dont want kainbain specific docs in the repo (maybe we just dont want to reveal the information publicly) therefore as an advance option we should be able to give a remote repo that is used to store kainbain specific information. This will need to be loaded onto runners adjacent to the main project repo, with synced task branches in order to keep things as similar to normal operations as possible . In UI configuration this should be allowed from the default when you import/create a new project (especially on an import)  Goal is allow people to use this without having their full team go in on it  (or so I can stealth use kainbain at work )
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 238.161s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 908ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731 (verdict.json + untrimmed failed-branch logs land here)
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 925ms

found 0 vulnerabilities
Workspace dependencies installed (canary-e2e).
✅ Settings duplicate check passed (37 files in 119ms)
✅ Frontend imports check passed (753 files in 392ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;31mFAIL[0m (229s)
----------------------------------------------------------------------
Details for Unit Tests (api):
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/unit-tests-api.full.log
(trimmed 3945 of 4065 lines; showing the tail)
 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m promptCuration.noCode.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m workflowRegistry.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/resolveAttestationStage.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
{"level":30,"time":1795099880928,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099880934,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":4.934547000011662,"msg":"request completed"}
{"level":30,"time":1795099880936,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099880941,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":202},"responseTime":5.132107999990694,"msg":"request completed"}
{"level":30,"time":1795099880941,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099880942,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":200},"responseTime":0.6104350000096019,"msg":"request completed"}
{"level":30,"time":1795099880943,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099880943,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","res":{"statusCode":200},"responseTime":0.4788180000032298,"msg":"request completed"}
 [32m✓[39m flow/runnerRoutes.bootstrap.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 274[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
{"level":30,"time":1795099881333,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099881340,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":6.788486000004923,"msg":"request completed"}
{"level":30,"time":1795099881342,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099881392,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":201},"responseTime":49.21050300000934,"msg":"request completed"}
{"level":30,"time":1795099881392,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1795099881393,"pid":3098481,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":200},"responseTime":0.6904309999954421,"msg":"request completed"}
 [32m✓[39m routes/projects.discover.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 317[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/uuidv7.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m flow/dispatch/staleAdvertReason.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m projectStore.barrel.test.js[2m > [22mprojectStore barrel surface[2m > [22mexposes the full public surface with stable types
[31m[1mAssertionError[22m: expected [ 'APP_STATUS_VALUES', …(52) ] to deeply equal [ 'APP_STATUS_VALUES', …(33) ][39m

[32m- Expected[39m
[31m+ Received[39m

[33m@@ -6,22 +6,34 @@[39m
[2m    "DEFAULT_MODEL",[22m
[2m    "DEFAULT_STAGES",[22m
[2m    "DEFAULT_WORKFLOW_ID",[22m
[2m    "DEFAULT_WORKFLOW_NAME",[22m
[2m    "DEPLOY_COMMAND_PATTERN",[22m
[31m+   "DOCS_REPO_BRANCH_MODE_SYNCED",[39m
[31m+   "DOCS_REPO_PATH_MAX_LENGTH",[39m
[31m+   "DOCS_REPO_POINTERS_FILENAME",[39m
[31m+   "DOCS_REPO_URL_MAX_LENGTH",[39m
[2m    "HOST_COMMAND_PATTERN",[22m
[2m    "PUBLISH_COMMAND_PATTERN",[22m
[2m    "ProjectStore",[22m
[2m    "RETRY_SETTING_KEYS",[22m
[31m+   "assertValidDocsRepoForWrite",[39m
[2m    "createDefaultWorkflow",[22m
[2m    "detectGitRemote",[22m
[31m+   "docsRepoPointerFor",[39m
[31m+   "docsRepoUrlFor",[39m
[31m+   "hasDocsRepo",[39m
[2m    "inferAliasRenames",[22m
[2m    "isDeployCommand",[22m
[2m    "isHostCommand",[22m
[2m    "isPublishCommand",[22m
[31m+   "isValidDocsRepoLocalPath",[39m
[31m+   "isValidDocsRepoUrl",[39m
[2m    "migrateMergeDeployStages",[22m
[2m    "normalizeAppStatus",[22m
[31m+   "normalizeDocsRepoPointers",[39m
[31m+   "normalizeDocsRepoSettings",[39m
[2m    "normalizeProjectRetrySettings",[22m
[2m    "normalizeRetryCount",[22m
[2m    "normalizeRetryEnabled",[22m
[2m    "normalizeStage",[22m
[2m    "normalizeStageSkills",[22m
[33m@@ -29,8 +41,15 @@[39m
[2m    "normalizeStageType",[22m
[2m    "normalizeStages",[22m
[2m    "normalizeTimeoutMs",[22m
[2m    "normalizeWorkflow",[22m
[2m    "normalizeWorkflows",[22m
[31m+   "readDocsRepoPointers",[39m
[31m+   "rememberDocsRepoPointer",[39m
[31m+   "removeDocsRepoPointer",[39m
[2m    "resolveDefaultGitRemote",[22m
[31m+   "resolveDocsRepoLocalPath",[39m
[31m+   "resolveDocsRepoPointersPath",[39m
[31m+   "resolveKainbainHome",[39m
[2m    "slugifyProjectName",[22m
[31m+   "writeDocsRepoPointers",[39m
[2m  ][22m

[36m [2m❯[22m projectStore.barrel.test.js:[2m57:38[22m[39m
    [90m 55|[39m
    [90m 56|[39m  it("exposes the full public surface with stable types", () => {
    [90m 57|[39m   expect(Object.keys(barrel).sort()).toEqual(Object.keys(expectedTypes…
    [90m   |[39m                                      [31m^[39m
    [90m 58|[39m   for (const [name, type] of Object.entries(expectedTypes)) {
    [90m 59|[39m    expect(typeof barrel[name], name).toBe(type);

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m457 passed[39m[22m[90m (458)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m7501 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (7503)[39m
[2m   Start at [22m 14:47:34
[2m   Duration [22m 227.09s[2m (tests 69%, import 20%, transform 9%, setup 1%)[22m

[2m    Isolate [22m [33m458 workers spawned[39m[2m · ~132ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~19.95s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (229s)
Running Unit Tests (runner)... [0;32mPASS[0m (229s)
Running Linting (api)... [0;32mPASS[0m (229s)
Running Linting (frontend)... [0;32mPASS[0m (229s)
Running Frontend Build... [0;32mPASS[0m (229s)
Running Security Script Tests... [0;32mPASS[0m (229s)
Running Dependency Check... [0;32mPASS[0m (229s)
Running Dependency Audit Gate... [0;32mPASS[0m (229s)
Running Proof Hygiene... [0;32mPASS[0m (229s)
Running Binary Guard... [0;32mPASS[0m (229s)
Running Harness Self-Tests... [0;32mPASS[0m (229s)
Running Container Tests... [0;32mPASS[0m (229s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (api); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/unit-tests-api.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-144731/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.