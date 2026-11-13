<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Runners break when looking at multi pipelines ![image.png](assets/image.png) When on a different pipeline the runners fail to show task and or stage information or seem to imply they are holding steady. Runners should be global and takeup aything from any pipeso therefore need to display details from any pipe
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1040.072s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
stalling (npm install --prefix frontend)...

added 420 packages, and audited 421 packages in 4s

143 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Workspace dependencies installed (api, frontend).
✅ Settings duplicate check passed (32 files in 188ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s)
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
⏳ still running: Unit Tests (api) (11m00s)
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
Running Unit Tests (api)... [0;31mFAIL[0m (1023s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3169 of 3289 lines; showing the tail)
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m siteDocs.integrity.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m flow/runnerBootstrap.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/steerStore.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
{"level":30,"time":1794246653940,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246653944,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":400},"err":{"type":"Error","message":"body must have required property 'path'","stack":"Error: body must have required property 'path'\n    at defaultSchemaErrorFormatter (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:226:14)\n    at done (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/[REDACTED]/.kainbain/runner-work/kb-350ca162-afaf-4d33-9d58-25955887db82/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"path"},"message":"must have required property 'path'"}],"validationContext":"body"},"msg":"body must have required property 'path'"}
{"level":30,"time":1794246653948,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":400},"responseTime":7.209373999998206,"msg":"request completed"}
{"level":30,"time":1794246653949,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246653951,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":400},"responseTime":1.5340439999999944,"msg":"request completed"}
{"level":30,"time":1794246653951,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654007,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":201},"responseTime":55.57988600002136,"msg":"request completed"}
{"level":30,"time":1794246654008,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654009,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","res":{"statusCode":200},"responseTime":0.9129039999970701,"msg":"request completed"}
{"level":30,"time":1794246654009,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-5","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654009,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-5","res":{"statusCode":200},"responseTime":0.29313900001579896,"msg":"request completed"}
 [32m✓[39m routes/projects.register.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 298[2mms[22m[39m
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
{"level":30,"time":1794246654664,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/onboarding","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654671,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":6.500429000006989,"msg":"request completed"}
{"level":30,"time":1794246654673,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654713,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":201},"responseTime":39.77847699998529,"msg":"request completed"}
{"level":30,"time":1794246654714,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"GET","url":"/onboarding","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246654715,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":200},"responseTime":1.073151999997208,"msg":"request completed"}
 [32m✓[39m routes/onboarding.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 277[2mms[22m[39m
{"level":30,"time":1794246655029,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/docs.apiCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 263[2mms[22m[39m
{"level":30,"time":1794246655036,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":6.202762000000803,"msg":"request completed"}
{"level":30,"time":1794246655037,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"GET","url":"/docs/api-reference","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246655039,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":200},"responseTime":2.0707539999857545,"msg":"request completed"}
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m routes/tasks.aliasWiring.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/dispatch/resolveAliasRequirement.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m skills/updateAppStatus.skill.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m projectStore.discover.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/commandStages.platform.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m siteDocs.deploy.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — ignoring the stored model "m". Clear the model in Settings › Model Aliases.

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
{"level":30,"time":1794246657021,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m flow/runnerRoutes.bootstrap.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 237[2mms[22m[39m
{"level":30,"time":1794246657025,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":3.6870619999826886,"msg":"request completed"}
{"level":30,"time":1794246657027,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246657035,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":202},"responseTime":8.258651000011014,"msg":"request completed"}
{"level":30,"time":1794246657036,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246657036,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":200},"responseTime":0.38147699998808093,"msg":"request completed"}
{"level":30,"time":1794246657037,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246657037,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-4","res":{"statusCode":200},"responseTime":0.3656429999973625,"msg":"request completed"}
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m workflowRegistry.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
{"level":30,"time":1794246657740,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
{"level":30,"time":1794246657744,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-1","res":{"statusCode":200},"responseTime":4.185736999992514,"msg":"request completed"}
{"level":30,"time":1794246657747,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246657786,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-2","res":{"statusCode":201},"responseTime":39.846048000006704,"msg":"request completed"}
{"level":30,"time":1794246657787,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794246657787,"pid":2819994,"hostname":"server-HP-ProDesk-400-G4-SFF","reqId":"req-3","res":{"statusCode":200},"responseTime":0.3353930000157561,"msg":"request completed"}
 [32m✓[39m routes/projects.discover.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 277[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/uuidv7.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [31m❯[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 840129[2mms[22m[39m
   [31m❯[39m git() per-repository serialization gate [2m(2)[22m
[31m     [31m×[31m never runs two git processes on the same repo at once[39m[33m 840119[2mms[22m[39m
     [32m✓[39m still runs git for different repos in parallel[32m 8[2mms[22m[39m

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


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m401 passed[39m[22m[90m (402)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6610 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (6612)[39m
[2m   Start at [22m 17:47:39
[2m   Duration [22m 1021.19s[2m (tests 88%, import 8%, transform 4%)[22m

[2m    Isolate [22m [33m402 workers spawned[39m[2m · ~138ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~18.39s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (1023s)
Running Unit Tests (runner)... [0;32mPASS[0m (1023s)
Running Linting (api)... [0;32mPASS[0m (1023s)
Running Linting (frontend)... [0;32mPASS[0m (1023s)
Running Frontend Build... [0;32mPASS[0m (1023s)
Running Security Script Tests... [0;32mPASS[0m (1023s)
Running Dependency Check... [0;32mPASS[0m (1023s)
Running Dependency Audit Gate... [0;32mPASS[0m (1023s)
Running Harness Self-Tests... [0;32mPASS[0m (1023s)
Running Container Tests... [0;32mPASS[0m (1023s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.