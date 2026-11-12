<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Fix git-checkout bug that strands task pipelines: untracked docs/tasks/<id>/task.md blocks 'git checkout main' (killed tasks 82e49a05 and 9d2b75a2 at final stages)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 300.521s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 117 packages, and audited 118 packages in 1s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Dependencies missing for api (@earendil-works/pi-coding-agent, @fastify/cors, @fastify/multipart, @fastify/static, @fastify/swagger, @fastify/swagger-ui, @fastify/websocket, @opencode-ai/sdk, adm-zip, eslint-config-prettier, fastify, jose, semver, uuid, web-push, @vitest/coverage-v8, eslint, eslint-plugin-n, eslint-plugin-security, globals, vite, vitest) — installing (npm install --prefix api)...
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 351 packages, and audited 352 packages in 6s

85 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 420 packages, and audited 421 packages in 5s

143 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Workspace dependencies installed (api, frontend).
✅ Settings duplicate check passed (35 files in 175ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s), Dependency Check (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Linting (frontend) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
⏳ still running: Unit Tests (api) (4m30s)
Running Unit Tests (api)... [0;31mFAIL[0m (282s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 3587 of 3707 lines; showing the tail)
 [32m✓[39m formatPosture.shared.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
{"level":30,"time":1794446339897,"pid":3967509,"hostname":"server2","reqId":"req-1","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446339903,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":400},"err":{"type":"Error","message":"body must have required property 'path'","stack":"Error: body must have required property 'path'\n    at defaultSchemaErrorFormatter (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/[REDACTED]/.kainbain/runner-work/kb-e597e05b-f2e9-4d23-82e6-e4490958a067/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"path"},"message":"must have required property 'path'"}],"validationContext":"body"},"msg":"body must have required property 'path'"}
{"level":30,"time":1794446339909,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":400},"responseTime":10.667172999994364,"msg":"request completed"}
{"level":30,"time":1794446339911,"pid":3967509,"hostname":"server2","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446339913,"pid":3967509,"hostname":"server2","reqId":"req-2","res":{"statusCode":400},"responseTime":2.3759570000111125,"msg":"request completed"}
{"level":30,"time":1794446339914,"pid":3967509,"hostname":"server2","reqId":"req-3","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446339996,"pid":3967509,"hostname":"server2","reqId":"req-3","res":{"statusCode":201},"responseTime":81.320253999962,"msg":"request completed"}
{"level":30,"time":1794446339996,"pid":3967509,"hostname":"server2","reqId":"req-4","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446339998,"pid":3967509,"hostname":"server2","reqId":"req-4","res":{"statusCode":200},"responseTime":1.3541970000369474,"msg":"request completed"}
{"level":30,"time":1794446339998,"pid":3967509,"hostname":"server2","reqId":"req-5","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446339999,"pid":3967509,"hostname":"server2","reqId":"req-5","res":{"statusCode":200},"responseTime":0.6215349999838509,"msg":"request completed"}
 [32m✓[39m routes/projects.register.test.js [2m([22m[2m3 tests[22m[2m)[22m[33m 466[2mms[22m[39m
{"level":30,"time":1794446340570,"pid":3967509,"hostname":"server2","reqId":"req-1","req":{"method":"GET","url":"/onboarding","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446340580,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":200},"responseTime":8.594381999981124,"msg":"request completed"}
{"level":30,"time":1794446340583,"pid":3967509,"hostname":"server2","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446340637,"pid":3967509,"hostname":"server2","reqId":"req-2","res":{"statusCode":201},"responseTime":53.53554399998393,"msg":"request completed"}
{"level":30,"time":1794446340639,"pid":3967509,"hostname":"server2","reqId":"req-3","req":{"method":"GET","url":"/onboarding","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446340640,"pid":3967509,"hostname":"server2","reqId":"req-3","res":{"statusCode":200},"responseTime":1.5093390000401996,"msg":"request completed"}
 [32m✓[39m routes/onboarding.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 445[2mms[22m[39m
 [32m✓[39m routes/tasks.aliasWiring.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m reviewCommentFormatter.autoApprove.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
{"level":30,"time":1794446340923,"pid":3967509,"hostname":"server2","reqId":"req-1","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446340935,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":200},"responseTime":10.582901999994647,"msg":"request completed"}
{"level":30,"time":1794446340937,"pid":3967509,"hostname":"server2","reqId":"req-2","req":{"method":"GET","url":"/docs/api-reference","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446340941,"pid":3967509,"hostname":"server2","reqId":"req-2","res":{"statusCode":200},"responseTime":3.9700399999856018,"msg":"request completed"}
 [32m✓[39m routes/docs.apiCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 441[2mms[22m[39m
 [32m✓[39m flow/dispatch/resolveAliasRequirement.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m skills/updateAppStatus.skill.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/didFailbackMoveStages.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m projectStore.discover.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m auth/actor.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/dispatch/isRunnerClaimable.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m onboardingChecklist.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/commandStages.platform.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m flow/dispatch/isRunnerDispatchFallbackDue.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m siteDocs.deploy.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — keeping the stored model "m" (ignored at dispatch until the harness offers a catalog).

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m promptCuration.noCode.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m workflowRegistry.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/resolveAttestationStage.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
{"level":30,"time":1794446343459,"pid":3967509,"hostname":"server2","reqId":"req-1","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446343470,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":200},"responseTime":6.5334400000283495,"msg":"request completed"}
{"level":30,"time":1794446343472,"pid":3967509,"hostname":"server2","reqId":"req-2","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446343479,"pid":3967509,"hostname":"server2","reqId":"req-2","res":{"statusCode":202},"responseTime":6.468995000002906,"msg":"request completed"}
{"level":30,"time":1794446343479,"pid":3967509,"hostname":"server2","reqId":"req-3","req":{"method":"GET","url":"/runners/bootstrap","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446343480,"pid":3967509,"hostname":"server2","reqId":"req-3","res":{"statusCode":200},"responseTime":0.7116190000087954,"msg":"request completed"}
{"level":30,"time":1794446343481,"pid":3967509,"hostname":"server2","reqId":"req-4","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446343482,"pid":3967509,"hostname":"server2","reqId":"req-4","res":{"statusCode":200},"responseTime":0.6456260000122711,"msg":"request completed"}
 [32m✓[39m flow/runnerRoutes.bootstrap.test.js [2m([22m[2m3 tests[22m[2m)[22m[33m 373[2mms[22m[39m
   [32m✓[39m GET /runners/bootstrap [2m(3)[22m
     [33m[2m✓[22m[39m reports an empty fleet with an install-runner next action[33m 359[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m work/isTaskFilePath.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m cleanReportedPosture.shared.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
{"level":30,"time":1794446344082,"pid":3967509,"hostname":"server2","reqId":"req-1","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
{"level":30,"time":1794446344089,"pid":3967509,"hostname":"server2","reqId":"req-1","res":{"statusCode":200},"responseTime":6.802888999984134,"msg":"request completed"}
{"level":30,"time":1794446344092,"pid":3967509,"hostname":"server2","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446344143,"pid":3967509,"hostname":"server2","reqId":"req-2","res":{"statusCode":201},"responseTime":50.86002699995879,"msg":"request completed"}
{"level":30,"time":1794446344144,"pid":3967509,"hostname":"server2","reqId":"req-3","req":{"method":"GET","url":"/projects/discover","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1794446344145,"pid":3967509,"hostname":"server2","reqId":"req-3","res":{"statusCode":200},"responseTime":0.9262890000245534,"msg":"request completed"}
 [32m✓[39m routes/projects.discover.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 408[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/uuidv7.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m git/commitSnapshots.integration.test.js[2m > [22mcommitAllIfNeeded live snapshots (real git)[2m > [22mcommits real work but never a snapshot deletion
[31m[1mError[22m: Command failed: git init -b main
error: copy-fd: write returned: Disk quota exceeded
fatal: cannot copy '/usr/share/git-core/templates/description' to '/tmp/kainbain-commit-snap-teaYRX/.git/description': Disk quota exceeded
[39m
[36m [2m❯[22m run git/commitSnapshots.integration.test.js:[2m24:9[22m[39m
    [90m 22|[39m
    [90m 23|[39m function run(cwd, ...args) {
    [90m 24|[39m  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pi…
    [90m   |[39m         [31m^[39m
    [90m 25|[39m }
    [90m 26|[39m
[90m [2m❯[22m initRepo git/commitSnapshots.integration.test.js:[2m29:2[22m[39m
[90m [2m❯[22m git/commitSnapshots.integration.test.js:[2m64:9[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m436 passed[39m[22m[90m (437)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m7043 passed[39m[22m[2m | [22m[33m3 skipped[39m[90m (7047)[39m
[2m   Start at [22m 01:14:24
[2m   Duration [22m 280.21s[2m (tests 65%, import 23%, transform 10%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m437 workers spawned[39m[2m · ~201ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~29.08s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (282s)
Running Unit Tests (runner)... [0;32mPASS[0m (282s)
Running Linting (api)... [0;32mPASS[0m (282s)
Running Linting (frontend)... [0;32mPASS[0m (282s)
Running Frontend Build... [0;32mPASS[0m (282s)
Running Security Script Tests... [0;32mPASS[0m (282s)
Running Dependency Check... [0;32mPASS[0m (282s)
Running Dependency Audit Gate... [0;32mPASS[0m (282s)
Running Harness Self-Tests... [0;32mPASS[0m (282s)
Running Container Tests... [0;32mPASS[0m (282s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.