<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can you please modify the now playing bar in the ui so it can show little boxes for runners I want for under 5 runners to replace the left side with little boxes that just have the runners name, task name and stage and maybe some sort of colour indicator of health
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 194.772s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 4 packages in 926ms

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Running Security Script Tests... SKIP (no bash on PATH (the security-scan harness is bash-only))
Running Dependency Check... SKIP (no depcheck binary in the root tree (run `npm install` to enable the unused-dependency check))
Running Container Tests... SKIP (no Docker daemon reachable (container build/boot tests need one))
✅ Settings duplicate check passed (23 files in 116ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;31mFAIL[0m (123s)
----------------------------------------------------------------------
Details for Unit Tests (api):

> kainbain@1.0.0 test:api
> npm run test --prefix api


> api@1.0.0 test
> vitest run


[1m[30m[46m RUN [49m[39m[22m [36mv5.0.3 [39m[90m/home/server/projects/kainbain/api[39m

[90mstdout[2m | reviewDiff.integration.test.js[2m > [22m[2mreviewDiff Integration Tests[2m > [22m[2mdetects renamed files
[22m[39mGit status output: 

 [31m❯[39m reviewDiff.integration.test.js [2m([22m[2m7 tests[22m[2m | [22m[31m7 failed[39m[2m)[22m[33m 759[2mms[22m[39m
   [31m❯[39m reviewDiff Integration Tests [2m(7)[22m
[31m     [31m×[31m detects modified, added, and deleted files[39m[32m 98[2mms[22m[39m
[31m     [31m×[31m detects renamed files[39m[32m 104[2mms[22m[39m
[31m     [31m×[31m handles binary files[39m[32m 115[2mms[22m[39m
[31m     [31m×[31m returns correct patch for modified file[39m[32m 84[2mms[22m[39m
[31m     [31m×[31m returns correct commit list[39m[32m 101[2mms[22m[39m
[31m     [31m×[31m returns correct ahead/behind counts[39m[32m 169[2mms[22m[39m
[31m     [31m×[31m resolves shas correctly[39m[32m 83[2mms[22m[39m
 [31m❯[39m phase0-dry-run.test.js [2m([22m[2m3 tests[22m[2m | [22m[31m3 failed[39m[2m)[22m[33m 643[2mms[22m[39m
   [31m❯[39m Phase 0: Git Branch Foundation Dry-Run [2m(3)[22m
[31m     [31m×[31m should create task branch and commit work[39m[32m 246[2mms[22m[39m
[31m     [31m×[31m should handle human review and failback[39m[32m 30[2mms[22m[39m
[31m     [31m×[31m should merge to main in merge stage[39m[32m 127[2mms[22m[39m
 [31m❯[39m skills/updateAppStatus.skill.test.js [2m([22m[2m3 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[32m 68[2mms[22m[39m
   [31m❯[39m update-app-status skill package [2m(3)[22m
     [32m✓[39m loads valid from the repo skills library[32m 14[2mms[22m[39m
     [32m✓[39m resolves keywords with safe defaults[32m 1[2mms[22m[39m
[31m     [31m×[31m ships an executable helper script with working --help[39m[32m 49[2mms[22m[39m
{"level":30,"time":1793126453347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453432,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":83.43872100000044,"msg":"request completed"}
{"level":30,"time":1793126453433,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453449,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":15.16795700000057,"msg":"request completed"}
{"level":30,"time":1793126453603,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"PATCH","url":"/tasks/4627b526-37dc-4766-aab1-8c086834a743","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453609,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":5.4664309999998295,"msg":"request completed"}
{"level":30,"time":1793126453610,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/projects/6e28d045-ff23-4a7b-adf0-9f840c11dcc8/tasks/4627b526-37dc-4766-aab1-8c086834a743/review?projectId=6e28d045-ff23-4a7b-adf0-9f840c11dcc8","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453712,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":102.28541499999938,"msg":"request completed"}
{"level":30,"time":1793126453750,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453804,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":201},"responseTime":54.24119299999984,"msg":"request completed"}
{"level":30,"time":1793126453805,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453815,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":10.60192299999926,"msg":"request completed"}
{"level":30,"time":1793126453955,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"PATCH","url":"/tasks/0b8c15bc-1cf8-4e91-9246-666a83338497","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126453980,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":25.037281999999323,"msg":"request completed"}
{"level":30,"time":1793126453993,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/projects/fa3eaa3b-5227-45c9-99b3-70711824521c/tasks/0b8c15bc-1cf8-4e91-9246-666a83338497/review?projectId=fa3eaa3b-5227-45c9-99b3-70711824521c","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mGET review records a D2 snapshot commit when the worktree is dirty ON the task branch
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126453334-0': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126453334-0' -> '/tmp/kb-review-route-jMcmCf/docs'

{"level":30,"time":1793126454097,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":104.31824000000051,"msg":"request completed"}
{"level":30,"time":1793126454115,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454189,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":201},"responseTime":73.4056580000015,"msg":"request completed"}
{"level":30,"time":1793126454189,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454206,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":16.432307000000947,"msg":"request completed"}
{"level":30,"time":1793126454320,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"PATCH","url":"/tasks/1372e5c2-0bda-4e28-860a-54dcc7c21d9b","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454323,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":3.116346999999223,"msg":"request completed"}
{"level":30,"time":1793126454355,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/projects/a5589866-12e2-415b-bfaf-31c3d7ca4862/tasks/1372e5c2-0bda-4e28-860a-54dcc7c21d9b/review?projectId=a5589866-12e2-415b-bfaf-31c3d7ca4862","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mGET review flags uncommittedChanges when the tree is dirty OFF the task branch and never checks out
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126453750-1': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126453750-1' -> '/tmp/kb-review-route-fcgfPB/docs'

{"level":30,"time":1793126454449,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":93.87526000000071,"msg":"request completed"}
{"level":30,"time":1793126454465,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454507,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":201},"responseTime":41.78993300000002,"msg":"request completed"}
{"level":30,"time":1793126454507,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454511,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":3.65268499999911,"msg":"request completed"}
{"level":30,"time":1793126454511,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/projects/06701c62-418f-4c8f-9e02-5adbafee1b71/tasks/82078a39-552e-47d9-99f7-d814c0e8d38b/review?projectId=06701c62-418f-4c8f-9e02-5adbafee1b71","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mGET review returns a documented empty state when branch support is off
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126454108-2': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126454108-2' -> '/tmp/kb-review-route-FpbgLO/docs'

{"level":30,"time":1793126454547,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":35.79658299999937,"msg":"request completed"}
{"level":30,"time":1793126454550,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":201},"responseTime":43.96769900000072,"msg":"request completed"}
{"level":30,"time":1793126454594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":6.486496999999872,"msg":"request completed"}
{"level":30,"time":1793126454601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"GET","url":"/projects/990ab9d4-a0a0-47af-a2f4-b183863a345a/tasks/5518c535-96a9-4e61-b5ef-a482663e2cd6/review?projectId=990ab9d4-a0a0-47af-a2f4-b183863a345a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454671,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":69.84625500000038,"msg":"request completed"}
{"level":30,"time":1793126454677,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454752,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":201},"responseTime":75.46238699999958,"msg":"request completed"}
{"level":30,"time":1793126454752,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/projects/a3aed70b-9bcf-41b3-a1b2-6c7f6ee6077f/tasks/nope/review?projectId=a3aed70b-9bcf-41b3-a1b2-6c7f6ee6077f","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454753,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":404},"responseTime":0.20072699999946053,"msg":"request completed"}
{"level":30,"time":1793126454761,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454831,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":201},"responseTime":69.29990600000019,"msg":"request completed"}
{"level":30,"time":1793126454831,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454841,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":10.123888000000079,"msg":"request completed"}
{"level":30,"time":1793126454976,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"PATCH","url":"/tasks/5c51ddd0-bf82-4efb-90de-a1701edb2a1e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126454978,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":1.2732859999996435,"msg":"request completed"}
{"level":30,"time":1793126454980,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/projects/17208e2a-8505-4037-9719-d77b04027690/tasks/5c51ddd0-bf82-4efb-90de-a1701edb2a1e/review/comments?projectId=17208e2a-8505-4037-9719-d77b04027690","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mPOST comment creates a file-scope comment and broadcasts REVIEW_UPDATED
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126454550-4': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126454550-4' -> '/tmp/kb-review-route-fDKlal/docs'

{"level":30,"time":1793126455070,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":90.09010999999919,"msg":"request completed"}
{"level":30,"time":1793126455073,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"GET","url":"/projects/17208e2a-8505-4037-9719-d77b04027690/tasks/5c51ddd0-bf82-4efb-90de-a1701edb2a1e/review?projectId=17208e2a-8505-4037-9719-d77b04027690","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126455142,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":69.31283900000017,"msg":"request completed"}
{"level":30,"time":1793126455149,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126455196,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":201},"responseTime":47.06167499999901,"msg":"request completed"}
{"level":30,"time":1793126455196,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126455199,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":2.6398989999997866,"msg":"request completed"}
{"level":30,"time":1793126455328,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"PATCH","url":"/tasks/696738f9-d2ea-4aca-a493-346491a77483","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126455330,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":1.974504000001616,"msg":"request completed"}
{"level":30,"time":1793126455330,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/projects/96bc83e1-ff1c-4e12-91fd-6116e41f6d91/tasks/696738f9-d2ea-4aca-a493-346491a77483/review/comments?projectId=96bc83e1-ff1c-4e12-91fd-6116e41f6d91","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mPOST comment creates a line-scope comment anchored to a line and side
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126454761-6': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126454761-6' -> '/tmp/kb-review-route-fJPgkB/docs'

{"level":30,"time":1793126455638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":308.48816799999986,"msg":"request completed"}
{"level":30,"time":1793126455641,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126455812,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":201},"responseTime":170.75111199999992,"msg":"request completed"}
{"level":30,"time":1793126455813,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [31m❯[39m flow/stageCancel.integration.test.js [2m([22m[2m3 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 5522[2mms[22m[39m
   [31m❯[39m stage cancel integration (launch + cleanup) [2m(3)[22m
[31m     [31m×[31m cancel reaps the stage parent AND its grandchild, with no orphans[39m[33m 5189[2mms[22m[39m
     [33m[2m✓[22m[39m stage timeout kills and reaps the child via the same path[33m 323[2mms[22m[39m
     [32m✓[39m Windows dispatch routes cancel through taskkill /T /F[32m 6[2mms[22m[39m
{"level":30,"time":1793126455823,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":10.678690000000643,"msg":"request completed"}
{"level":30,"time":1793126456067,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"PATCH","url":"/tasks/0f638dce-433d-4fbb-96c8-8c68679cdc44","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456069,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":200},"responseTime":1.992329000000609,"msg":"request completed"}
{"level":30,"time":1793126456069,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/projects/f1f6662a-b598-449b-bb64-d41deaebb032/tasks/0f638dce-433d-4fbb-96c8-8c68679cdc44/review/comments?projectId=f1f6662a-b598-449b-bb64-d41deaebb032","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mPOST comment rejects unknown filePath, over-long body, bad scope, and line comments without a line
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126455148-7': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126455148-7' -> '/tmp/kb-review-route-EKFLcP/docs'

{"level":30,"time":1793126456172,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":200},"responseTime":102.86826099999962,"msg":"request completed"}
{"level":30,"time":1793126456184,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456282,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":201},"responseTime":98.10079799999949,"msg":"request completed"}
{"level":30,"time":1793126456282,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456285,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":2.258668000000398,"msg":"request completed"}
{"level":30,"time":1793126456385,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"PATCH","url":"/tasks/d24e7489-90cf-4a33-9a38-82546f318844","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456386,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":1.1646980000004987,"msg":"request completed"}
{"level":30,"time":1793126456390,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"GET","url":"/projects/bea2cda1-e487-44b0-ad9f-b141697cc57e/tasks/d24e7489-90cf-4a33-9a38-82546f318844/review?projectId=bea2cda1-e487-44b0-ad9f-b141697cc57e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mGET review returns task reports and accepts comments on report files even when a diff exists
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126455641-8': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126455641-8' -> '/tmp/kb-review-route-mPdKIo/docs'

{"level":30,"time":1793126456504,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":200},"responseTime":114.00340699999833,"msg":"request completed"}
{"level":30,"time":1793126456504,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"POST","url":"/projects/bea2cda1-e487-44b0-ad9f-b141697cc57e/tasks/d24e7489-90cf-4a33-9a38-82546f318844/review/comments?projectId=bea2cda1-e487-44b0-ad9f-b141697cc57e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456588,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":200},"responseTime":84.3309019999997,"msg":"request completed"}
{"level":30,"time":1793126456596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456660,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":201},"responseTime":63.50255300000026,"msg":"request completed"}
{"level":30,"time":1793126456660,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456665,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":200},"responseTime":4.719675000000279,"msg":"request completed"}
{"level":30,"time":1793126456666,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"GET","url":"/projects/8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb/tasks/51023930-d0aa-4453-88c3-b36cfb662af3/review?projectId=8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456692,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":25.949162000000797,"msg":"request completed"}
{"level":30,"time":1793126456694,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"POST","url":"/projects/8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb/tasks/51023930-d0aa-4453-88c3-b36cfb662af3/review/comments?projectId=8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2maccepts report comments in an empty-state review and across ./ and bare path spellings
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126456184-9': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126456184-9' -> '/tmp/kb-review-route-gKEmda/docs'

{"level":30,"time":1793126456773,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":79.16465000000062,"msg":"request completed"}
{"level":30,"time":1793126456773,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"POST","url":"/projects/8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb/tasks/51023930-d0aa-4453-88c3-b36cfb662af3/review/comments?projectId=8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456794,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":200},"responseTime":20.854647000000114,"msg":"request completed"}
{"level":30,"time":1793126456801,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456877,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":201},"responseTime":75.83739200000127,"msg":"request completed"}
{"level":30,"time":1793126456877,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126456881,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":4.340814000001046,"msg":"request completed"}
{"level":30,"time":1793126457022,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"PATCH","url":"/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457023,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":200},"responseTime":1.25722499999938,"msg":"request completed"}
{"level":30,"time":1793126457026,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457130,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":400},"responseTime":103.99676200000067,"msg":"request completed"}
{"level":30,"time":1793126457131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457222,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":400},"responseTime":90.90438100000028,"msg":"request completed"}
{"level":30,"time":1793126457224,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457263,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":400},"responseTime":38.70442000000003,"msg":"request completed"}
{"level":30,"time":1793126457263,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457337,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","res":{"statusCode":200},"responseTime":74.01949999999852,"msg":"request completed"}
{"level":30,"time":1793126457338,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457388,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","res":{"statusCode":200},"responseTime":49.94564999999966,"msg":"request completed"}
{"level":30,"time":1793126457388,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","res":{"statusCode":200},"responseTime":25.72079499999927,"msg":"request completed"}
{"level":30,"time":1793126457414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","req":{"method":"POST","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a/tasks/7c1cb907-855a-45b7-be05-8f26c6b68c91/review/comments?projectId=3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457432,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","res":{"statusCode":200},"responseTime":18.17823700000008,"msg":"request completed"}
{"level":30,"time":1793126457436,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457469,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","res":{"statusCode":201},"responseTime":33.38354199999958,"msg":"request completed"}
{"level":30,"time":1793126457469,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457471,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","res":{"statusCode":200},"responseTime":2.1810350000014296,"msg":"request completed"}
{"level":30,"time":1793126457550,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","req":{"method":"PATCH","url":"/tasks/64b02707-c63b-4eea-8ba3-b6416c49eadd","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457551,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","res":{"statusCode":200},"responseTime":1.1948219999994762,"msg":"request completed"}
{"level":30,"time":1793126457552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","req":{"method":"POST","url":"/projects/2725da39-0ec1-4da4-a5dd-b8bb5128e7dd/tasks/64b02707-c63b-4eea-8ba3-b6416c49eadd/review/comments?projectId=2725da39-0ec1-4da4-a5dd-b8bb5128e7dd","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457614,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","res":{"statusCode":200},"responseTime":61.688161000000036,"msg":"request completed"}
{"level":30,"time":1793126457622,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457689,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","res":{"statusCode":201},"responseTime":66.50277599999936,"msg":"request completed"}
{"level":30,"time":1793126457689,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457700,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","res":{"statusCode":200},"responseTime":11.101442000001043,"msg":"request completed"}
{"level":30,"time":1793126457865,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","req":{"method":"PATCH","url":"/tasks/51125318-2c44-41f4-ad6d-b74059622688","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457868,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","res":{"statusCode":200},"responseTime":2.4984479999984615,"msg":"request completed"}
{"level":30,"time":1793126457868,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","req":{"method":"PATCH","url":"/projects/5663e340-46ea-4bdc-aa76-c6ebbf4f5ba2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126457922,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","res":{"statusCode":200},"responseTime":53.88163899999927,"msg":"request completed"}
{"level":30,"time":1793126458131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","req":{"method":"GET","url":"/projects/5663e340-46ea-4bdc-aa76-c6ebbf4f5ba2/tasks/51125318-2c44-41f4-ad6d-b74059622688/review?projectId=5663e340-46ea-4bdc-aa76-c6ebbf4f5ba2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/review.test.js[2m > [22m[2mReview API Integration[2m > [22m[2mpreserved review after merge shows the merged change plus fix-ups, and fix-up files accept comments
[22m[39m[projectStore] failed to recreate docs symlink for 'Review Fixture 1793126457435-12': ENOENT: no such file or directory, symlink '/tmp/kainbain-test-notes-OjDFFG/Review Fixture 1793126457435-12' -> '/tmp/kb-review-route-BLcfDi/docs'

{"level":30,"time":1793126458444,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","res":{"statusCode":200},"responseTime":312.2946670000001,"msg":"request completed"}
{"level":30,"time":1793126458448,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458490,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","res":{"statusCode":201},"responseTime":42.10822199999893,"msg":"request completed"}
{"level":30,"time":1793126458490,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458493,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","res":{"statusCode":200},"responseTime":2.2753780000002735,"msg":"request completed"}
{"level":30,"time":1793126458493,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","req":{"method":"POST","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1/tasks/9683f2a7-7846-401c-8da1-5b3f444a0a74/review/comments?projectId=a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458502,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","res":{"statusCode":400},"responseTime":9.130169000000024,"msg":"request completed"}
{"level":30,"time":1793126458503,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","req":{"method":"POST","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1/tasks/9683f2a7-7846-401c-8da1-5b3f444a0a74/review/comments?projectId=a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458516,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","res":{"statusCode":400},"responseTime":13.148494999999457,"msg":"request completed"}
{"level":30,"time":1793126458516,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","req":{"method":"POST","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1/tasks/9683f2a7-7846-401c-8da1-5b3f444a0a74/review/comments?projectId=a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458531,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","res":{"statusCode":400},"responseTime":14.92935899999975,"msg":"request completed"}
{"level":30,"time":1793126458532,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","req":{"method":"POST","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1/tasks/9683f2a7-7846-401c-8da1-5b3f444a0a74/review/comments?projectId=a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458555,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","res":{"statusCode":400},"responseTime":23.514992000000348,"msg":"request completed"}
{"level":30,"time":1793126458556,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","req":{"method":"POST","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1/tasks/9683f2a7-7846-401c-8da1-5b3f444a0a74/review/comments?projectId=a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458572,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","res":{"statusCode":200},"responseTime":16.46419799999967,"msg":"request completed"}
{"level":30,"time":1793126458574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458617,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","res":{"statusCode":201},"responseTime":42.64795000000049,"msg":"request completed"}
{"level":30,"time":1793126458617,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458619,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","res":{"statusCode":200},"responseTime":2.185193999999683,"msg":"request completed"}
{"level":30,"time":1793126458619,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","req":{"method":"POST","url":"/projects/de8f3e2a-6fd2-43a7-8de1-216085543fda/tasks/7517ff94-c736-43bc-916e-13744750359e/review/comments?projectId=de8f3e2a-6fd2-43a7-8de1-216085543fda","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458642,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","res":{"statusCode":200},"responseTime":22.09277900000052,"msg":"request completed"}
{"level":30,"time":1793126458642,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","req":{"method":"PATCH","url":"/projects/de8f3e2a-6fd2-43a7-8de1-216085543fda/tasks/7517ff94-c736-43bc-916e-13744750359e/review/comments/rc-d667fb9a-7c57-48dc-b962-aed28211e32c?projectId=de8f3e2a-6fd2-43a7-8de1-216085543fda","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458647,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","res":{"statusCode":200},"responseTime":4.631501999998363,"msg":"request completed"}
{"level":30,"time":1793126458647,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","req":{"method":"PATCH","url":"/projects/de8f3e2a-6fd2-43a7-8de1-216085543fda/tasks/7517ff94-c736-43bc-916e-13744750359e/review/comments/rc-nope?projectId=de8f3e2a-6fd2-43a7-8de1-216085543fda","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458651,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","res":{"statusCode":404},"responseTime":3.6525320000000647,"msg":"request completed"}
{"level":30,"time":1793126458653,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458694,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","res":{"statusCode":201},"responseTime":41.34665800000039,"msg":"request completed"}
{"level":30,"time":1793126458695,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458697,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","res":{"statusCode":200},"responseTime":2.7134860000005574,"msg":"request completed"}
{"level":30,"time":1793126458698,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","req":{"method":"POST","url":"/projects/b21d0760-4337-4b0b-a2b8-99a772ee40d2/tasks/6aeddc86-7981-492a-b7ec-d20a0d8331b6/review/comments?projectId=b21d0760-4337-4b0b-a2b8-99a772ee40d2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458715,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","res":{"statusCode":200},"responseTime":16.911003999999593,"msg":"request completed"}
{"level":30,"time":1793126458715,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","req":{"method":"POST","url":"/projects/b21d0760-4337-4b0b-a2b8-99a772ee40d2/tasks/6aeddc86-7981-492a-b7ec-d20a0d8331b6/review/comments/rc-1fa58c00-cf12-40dc-95e1-1ea56829d288/replies?projectId=b21d0760-4337-4b0b-a2b8-99a772ee40d2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458720,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","res":{"statusCode":200},"responseTime":4.431038999999146,"msg":"request completed"}
{"level":30,"time":1793126458720,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","req":{"method":"POST","url":"/projects/b21d0760-4337-4b0b-a2b8-99a772ee40d2/tasks/6aeddc86-7981-492a-b7ec-d20a0d8331b6/review/comments/rc-nope/replies?projectId=b21d0760-4337-4b0b-a2b8-99a772ee40d2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458721,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","res":{"statusCode":404},"responseTime":1.1737270000012359,"msg":"request completed"}
{"level":30,"time":1793126458723,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458769,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","res":{"statusCode":201},"responseTime":45.641278999999486,"msg":"request completed"}
{"level":30,"time":1793126458769,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458771,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","res":{"statusCode":200},"responseTime":2.1343890000007377,"msg":"request completed"}
{"level":30,"time":1793126458771,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","req":{"method":"POST","url":"/projects/10f615bb-2d88-402b-a17b-b65b14bd3205/tasks/6897b461-6441-4130-a48b-ed661326a4a8/review/comments?projectId=10f615bb-2d88-402b-a17b-b65b14bd3205","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458788,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","res":{"statusCode":200},"responseTime":16.5918529999999,"msg":"request completed"}
{"level":30,"time":1793126458788,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","req":{"method":"DELETE","url":"/projects/10f615bb-2d88-402b-a17b-b65b14bd3205/tasks/6897b461-6441-4130-a48b-ed661326a4a8/review/comments/rc-b1bc3286-3c6b-45f5-8e2f-ae0fa7c28012?projectId=10f615bb-2d88-402b-a17b-b65b14bd3205","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458799,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","res":{"statusCode":200},"responseTime":10.214277000000948,"msg":"request completed"}
{"level":30,"time":1793126458799,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","req":{"method":"DELETE","url":"/projects/10f615bb-2d88-402b-a17b-b65b14bd3205/tasks/6897b461-6441-4130-a48b-ed661326a4a8/review/comments/rc-b1bc3286-3c6b-45f5-8e2f-ae0fa7c28012?projectId=10f615bb-2d88-402b-a17b-b65b14bd3205","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458800,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","res":{"statusCode":404},"responseTime":0.9145779999998922,"msg":"request completed"}
{"level":30,"time":1793126458802,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458885,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","res":{"statusCode":201},"responseTime":83.64511999999922,"msg":"request completed"}
{"level":30,"time":1793126458886,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458896,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","res":{"statusCode":200},"responseTime":10.092771999999968,"msg":"request completed"}
{"level":30,"time":1793126458896,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","req":{"method":"POST","url":"/projects/7341f269-438c-4cba-a337-b282896efea6/tasks/040e472f-0797-4269-aa37-8745c88db408/review/comments?projectId=7341f269-438c-4cba-a337-b282896efea6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458941,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","res":{"statusCode":200},"responseTime":45.20481899999868,"msg":"request completed"}
{"level":30,"time":1793126458942,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","req":{"method":"PATCH","url":"/projects/7341f269-438c-4cba-a337-b282896efea6/tasks/040e472f-0797-4269-aa37-8745c88db408/review/comments/rc-36f9161a-7312-4168-828b-57c20cfab939?projectId=7341f269-438c-4cba-a337-b282896efea6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458943,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","res":{"statusCode":200},"responseTime":1.2968220000002475,"msg":"request completed"}
{"level":30,"time":1793126458943,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","req":{"method":"POST","url":"/projects/7341f269-438c-4cba-a337-b282896efea6/tasks/040e472f-0797-4269-aa37-8745c88db408/review/comments/rc-36f9161a-7312-4168-828b-57c20cfab939/replies?projectId=7341f269-438c-4cba-a337-b282896efea6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458957,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","res":{"statusCode":200},"responseTime":13.294477999999799,"msg":"request completed"}
{"level":30,"time":1793126458957,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","req":{"method":"DELETE","url":"/projects/7341f269-438c-4cba-a337-b282896efea6/tasks/040e472f-0797-4269-aa37-8745c88db408/review/comments/rc-36f9161a-7312-4168-828b-57c20cfab939?projectId=7341f269-438c-4cba-a337-b282896efea6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458961,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","res":{"statusCode":200},"responseTime":4.110905999999886,"msg":"request completed"}
{"level":30,"time":1793126458973,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2j","req":{"method":"DELETE","url":"/projects/6e28d045-ff23-4a7b-adf0-9f840c11dcc8","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458974,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2j","res":{"statusCode":200},"responseTime":0.42465700000138895,"msg":"request completed"}
{"level":30,"time":1793126458974,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2k","req":{"method":"DELETE","url":"/projects/fa3eaa3b-5227-45c9-99b3-70711824521c","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458974,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2k","res":{"statusCode":200},"responseTime":0.27300600000125996,"msg":"request completed"}
{"level":30,"time":1793126458974,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2l","req":{"method":"DELETE","url":"/projects/a5589866-12e2-415b-bfaf-31c3d7ca4862","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2l","res":{"statusCode":200},"responseTime":0.1208489999989979,"msg":"request completed"}
{"level":30,"time":1793126458975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2m","req":{"method":"DELETE","url":"/projects/06701c62-418f-4c8f-9e02-5adbafee1b71","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2m","res":{"statusCode":200},"responseTime":0.09921199999917008,"msg":"request completed"}
{"level":30,"time":1793126458975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2n","req":{"method":"DELETE","url":"/projects/990ab9d4-a0a0-47af-a2f4-b183863a345a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458982,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2n","res":{"statusCode":200},"responseTime":6.70986400000038,"msg":"request completed"}
{"level":30,"time":1793126458982,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2o","req":{"method":"DELETE","url":"/projects/a3aed70b-9bcf-41b3-a1b2-6c7f6ee6077f","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458982,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2o","res":{"statusCode":200},"responseTime":0.15522999999848253,"msg":"request completed"}
{"level":30,"time":1793126458982,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2p","req":{"method":"DELETE","url":"/projects/17208e2a-8505-4037-9719-d77b04027690","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458982,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2p","res":{"statusCode":200},"responseTime":0.17364199999974517,"msg":"request completed"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2q","req":{"method":"DELETE","url":"/projects/96bc83e1-ff1c-4e12-91fd-6116e41f6d91","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2q","res":{"statusCode":200},"responseTime":0.17589399999997113,"msg":"request completed"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2r","req":{"method":"DELETE","url":"/projects/f1f6662a-b598-449b-bb64-d41deaebb032","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2r","res":{"statusCode":200},"responseTime":0.15694799999982934,"msg":"request completed"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2s","req":{"method":"DELETE","url":"/projects/bea2cda1-e487-44b0-ad9f-b141697cc57e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2s","res":{"statusCode":200},"responseTime":0.15111699999943085,"msg":"request completed"}
{"level":30,"time":1793126458983,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2t","req":{"method":"DELETE","url":"/projects/8d9adf38-a8c4-464d-b5c1-e9e0bf0a58fb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458984,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2t","res":{"statusCode":200},"responseTime":0.10990399999900546,"msg":"request completed"}
{"level":30,"time":1793126458984,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2u","req":{"method":"DELETE","url":"/projects/3a4fec26-c083-4676-9cf0-67b5243e372a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458984,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2u","res":{"statusCode":200},"responseTime":0.09609900000032212,"msg":"request completed"}
{"level":30,"time":1793126458984,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2v","req":{"method":"DELETE","url":"/projects/2725da39-0ec1-4da4-a5dd-b8bb5128e7dd","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2v","res":{"statusCode":200},"responseTime":0.18219700000008743,"msg":"request completed"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2w","req":{"method":"DELETE","url":"/projects/5663e340-46ea-4bdc-aa76-c6ebbf4f5ba2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2w","res":{"statusCode":200},"responseTime":0.09699600000021746,"msg":"request completed"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2x","req":{"method":"DELETE","url":"/projects/a84dd65b-664d-4d37-b857-2c81852dfcf1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2x","res":{"statusCode":200},"responseTime":0.09478200000012293,"msg":"request completed"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2y","req":{"method":"DELETE","url":"/projects/de8f3e2a-6fd2-43a7-8de1-216085543fda","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2y","res":{"statusCode":200},"responseTime":0.10164200000144774,"msg":"request completed"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2z","req":{"method":"DELETE","url":"/projects/b21d0760-4337-4b0b-a2b8-99a772ee40d2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458985,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2z","res":{"statusCode":200},"responseTime":0.09814899999946647,"msg":"request completed"}
{"level":30,"time":1793126458986,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-30","req":{"method":"DELETE","url":"/projects/10f615bb-2d88-402b-a17b-b65b14bd3205","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458986,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-30","res":{"statusCode":200},"responseTime":0.34237000000030093,"msg":"request completed"}
{"level":30,"time":1793126458986,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-31","req":{"method":"DELETE","url":"/projects/7341f269-438c-4cba-a337-b282896efea6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126458986,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-31","res":{"statusCode":200},"responseTime":0.14072800000030838,"msg":"request completed"}
 [31m❯[39m routes/review.test.js [2m([22m[2m19 tests[22m[2m | [22m[31m6 failed[39m[2m)[22m[33m 6329[2mms[22m[39m
   [31m❯[39m Review API Integration [2m(19)[22m
[31m     [31m×[31m GET review returns the diff for a task branch: files, counts, commits newest-first, ahead/behind[39m[33m 418[2mms[22m[39m
[31m     [31m×[31m GET review records a D2 snapshot commit when the worktree is dirty ON the task branch[39m[33m 358[2mms[22m[39m
[31m     [31m×[31m GET review flags uncommittedChanges when the tree is dirty OFF the task branch and never checks out[39m[33m 357[2mms[22m[39m
     [32m✓[39m GET review returns a documented empty state when branch support is off[32m 85[2mms[22m[39m
     [32m✓[39m GET review returns a documented empty state when the task branch does not exist yet[32m 123[2mms[22m[39m
     [32m✓[39m GET review returns 404 for an unknown task[32m 84[2mms[22m[39m
     [33m[2m✓[22m[39m POST comment creates a file-scope comment and broadcasts REVIEW_UPDATED[33m 391[2mms[22m[39m
     [33m[2m✓[22m[39m POST comment creates a line-scope comment anchored to a line and side[33m 493[2mms[22m[39m
[31m     [31m×[31m POST comment rejects unknown filePath, over-long body, bad scope, and line comments without a line[39m[33m 542[2mms[22m[39m
     [33m[2m✓[22m[39m GET review returns task reports and accepts comments on report files even when a diff exists[33m 412[2mms[22m[39m
     [32m✓[39m accepts report comments in an empty-state review and across ./ and bare path spellings[32m 200[2mms[22m[39m
     [33m[2m✓[22m[39m rejects report-anchored line comments outside the report's line range[33m 639[2mms[22m[39m
[31m     [31m×[31m rejects bare-filename anchors when the report has a full path[39m[32m 187[2mms[22m[39m
[31m     [31m×[31m preserved review after merge shows the merged change plus fix-ups, and fix-up files accept comments[39m[33m 826[2mms[22m[39m
     [32m✓[39m POST comment rejects injection-shaped filePaths in empty-state reviews[32m 126[2mms[22m[39m
     [32m✓[39m PATCH comment updates body/resolved; PATCH unknown comment 404s[32m 79[2mms[22m[39m
     [32m✓[39m POST reply appends to the thread; unknown comment 404s[32m 70[2mms[22m[39m
     [32m✓[39m DELETE comment removes it from the sidecar; unknown comment 404s[32m 79[2mms[22m[39m
     [32m✓[39m broadcasts REVIEW_UPDATED with the right type on update/reply/delete[32m 169[2mms[22m[39m
 [32m✓[39m work/taskFinalize.test.js [2m([22m[2m22 tests[22m[2m)[22m[33m 8528[2mms[22m[39m
   [32m✓[39m finalizeTaskBranch against a real repository [2m(12)[22m
     [33m[2m✓[22m[39m commits work and returns to default on a pure-local repo without pushing[33m 913[2mms[22m[39m
     [33m[2m✓[22m[39m pushes the task branch to a file remote and ends on the default branch[33m 958[2mms[22m[39m
     [33m[2m✓[22m[39m treats push failure as a warning: the tree still returns to default[33m 818[2mms[22m[39m
     [33m[2m✓[22m[39m still attempts the return when the commit is blocked, reporting loudly[33m 866[2mms[22m[39m
     [33m[2m✓[22m[39m is a no-op success when there is nothing to commit[33m 515[2mms[22m[39m
     [33m[2m✓[22m[39m accepts a commit message override[33m 618[2mms[22m[39m
     [33m[2m✓[22m[39m commits the whole curated prompt verbatim in the body[33m 465[2mms[22m[39m
     [33m[2m✓[22m[39m lets an explicit message override win over the curated prompt[33m 662[2mms[22m[39m
     [33m[2m✓[22m[39m truncates an oversized prompt with a marker and still commits[33m 590[2mms[22m[39m
     [33m[2m✓[22m[39m keeps pickup order default-first (existing branch via the default branch)[33m 673[2mms[22m[39m
   [32m✓[39m commitFailedStageWork against a real repository [2m(4)[22m
     [33m[2m✓[22m[39m commits dirty partial work with a '... (failed)' message and bounds the range[33m 854[2mms[22m[39m
     [33m[2m✓[22m[39m is a clean-tree no-op that still resolves an end boundary[33m 353[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.contract.test.js [2m([22m[2m13 tests[22m[2m)[22m[33m 13239[2mms[22m[39m
   [32m✓[39m human entry leaves git state untouched [2m(5)[22m
     [33m[2m✓[22m[39m dirty tree on the default branch: no switch, no commit, ref created[33m 1223[2mms[22m[39m
     [33m[2m✓[22m[39m dirty tree with the task branch already existing: refs byte-identical[33m 800[2mms[22m[39m
     [33m[2m✓[22m[39m dirty tree while sitting on another task branch: stays put[33m 1185[2mms[22m[39m
     [33m[2m✓[22m[39m clean tree: parks without touching anything but the missing ref[33m 1009[2mms[22m[39m
     [33m[2m✓[22m[39m unborn repo: parks in waiting_human without throwing[33m 938[2mms[22m[39m
   [32m✓[39m human approval leaves git state untouched [2m(5)[22m
     [33m[2m✓[22m[39m dirty tree: advances without commit, push, or checkout[33m 1140[2mms[22m[39m
     [33m[2m✓[22m[39m missing task branch: ref created from the default tip, still no checkout[33m 1054[2mms[22m[39m
     [33m[2m✓[22m[39m clean tree: advances with zero git writes[33m 876[2mms[22m[39m
     [33m[2m✓[22m[39m unborn repo: advances without throwing[33m 895[2mms[22m[39m
     [33m[2m✓[22m[39m operator on another task branch: stays put, advances, ref from default tip[33m 1194[2mms[22m[39m
   [32m✓[39m human rejection performs no git writes [2m(3)[22m
     [33m[2m✓[22m[39m dirty tree: rejects with zero git mutations[33m 862[2mms[22m[39m
     [33m[2m✓[22m[39m missing task branch: rejection creates no ref[33m 840[2mms[22m[39m
     [33m[2m✓[22m[39m dirty tree on another branch: rejects with zero git mutations[33m 949[2mms[22m[39m
 [32m✓[39m flow/stallRecovery.integration.test.js [2m([22m[2m9 tests[22m[2m)[22m[33m 8118[2mms[22m[39m
   [32m✓[39m WP6 stall and resume recovery [2m(9)[22m
     [33m[2m✓[22m[39m kill -9 mid-agent resumes and records Resumed timeline evidence[33m 740[2mms[22m[39m
     [33m[2m✓[22m[39m kill mid-merge WITH landed marker resumes without rewinding the merge[33m 971[2mms[22m[39m
     [33m[2m✓[22m[39m kill mid-merge WITHOUT landed marker resumes and the merge re-runs[33m 1212[2mms[22m[39m
     [33m[2m✓[22m[39m stalled CI child is killed by the watchdog and routed to retry[33m 629[2mms[22m[39m
     [33m[2m✓[22m[39m a silent-but-alive CI child is NOT stalled while its keep-alive runs (incident shape)[33m 2350[2mms[22m[39m
     [33m[2m✓[22m[39m the same silent child with the keep-alive opted out IS still stalled (control)[33m 1693[2mms[22m[39m
 [32m✓[39m git.integration.test.js [2m([22m[2m20 tests[22m[2m)[22m[33m 7087[2mms[22m[39m
   [32m✓[39m git helper against a real repository [2m(20)[22m
     [33m[2m✓[22m[39m creates a task branch from the default branch and is idempotent[33m 486[2mms[22m[39m
     [33m[2m✓[22m[39m refuses a branch switch on a dirty working tree but allows KainBain artifacts[33m 1080[2mms[22m[39m
     [33m[2m✓[22m[39m merges a task branch into main and auto-commits agent work ahead of the merge[33m 703[2mms[22m[39m
     [33m[2m✓[22m[39m refuses to commit onto a sibling branch when expectedBranch is set (branch-bleed guard)[33m 375[2mms[22m[39m
     [33m[2m✓[22m[39m rolls back the whole merge on conflict and reports the canonical message[33m 604[2mms[22m[39m
     [33m[2m✓[22m[39m does not lose work when a merge conflicts: task branch content survives[33m 514[2mms[22m[39m
     [33m[2m✓[22m[39m skips push on a pure-local repo with zero errors[33m 321[2mms[22m[39m
     [33m[2m✓[22m[39m pushes task work to a file remote and lands commits there[33m 587[2mms[22m[39m
     [33m[2m✓[22m[39m commits on a fresh machine with no git identity (repo-local fallback, peer review F-1)[33m 316[2mms[22m[39m
Preparing worktree (checking out 'kb/wt-1')
 [32m✓[39m agent/harnesses/shared/harnessScaffold.test.js [2m([22m[2m33 tests[22m[2m)[22m[33m 31235[2mms[22m[39m
   [32m✓[39m startSupervisedSpawn [2m(12)[22m
     [33m[2m✓[22m[39m watchdog fires onTimeout then kills (SIGTERM→SIGKILL escalation)[33m 15248[2mms[22m[39m
     [33m[2m✓[22m[39m watchdog firstSignal opt-in delivers SIGINT before escalating[33m 15043[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspSession.contract.test.js [2m([22m[2m49 tests[22m[2m)[22m[33m 6398[2mms[22m[39m
   [32m✓[39m muse MSP lifecycle (mock serve) [2m(8)[22m
     [33m[2m✓[22m[39m steers a RUNNING turn with the acknowledged turn id[33m 515[2mms[22m[39m
     [33m[2m✓[22m[39m interrupts a running turn via turn/interrupt and settles as interrupted[33m 504[2mms[22m[39m
     [33m[2m✓[22m[39m falls back to the exec transport when the MSP host cannot start[33m 432[2mms[22m[39m
   [32m✓[39m muse MSP multiplexing + failure modes (mock serve) [2m(6)[22m
     [33m[2m✓[22m[39m force-settles a wedged turn: run_error, rejection, and host eviction[33m 932[2mms[22m[39m
 [32m✓[39m gitWorkspaceIsolation.integration.test.js [2m([22m[2m18 tests[22m[2m)[22m[33m 6507[2mms[22m[39m
   [32m✓[39m quarantine isolation (default mode) [2m(8)[22m
     [33m[2m✓[22m[39m stashes tracked sibling modifications with a task marker and proceeds[33m 470[2mms[22m[39m
     [33m[2m✓[22m[39m ladder mode stashes a tracked modification the auto-commit could not clean[33m 409[2mms[22m[39m
     [33m[2m✓[22m[39m strict opt-out {"dirtyTreeRecovery":"off"} refuses the dirty tree instead of stashing[33m 377[2mms[22m[39m
   [32m✓[39m actionable merge conflict diagnostics [2m(1)[22m
     [33m[2m✓[22m[39m carries conflicted files, source/target SHAs, and strategy[33m 317[2mms[22m[39m
   [32m✓[39m per-task worktree isolation [2m(5)[22m
     [33m[2m✓[22m[39m provisions one isolated tree per task; sibling strays never cross[33m 481[2mms[22m[39m
     [33m[2m✓[22m[39m finalises inside the worktree and leaves the primary on default[33m 434[2mms[22m[39m
     [33m[2m✓[22m[39m provisions worktrees under a custom state folder, not the default[33m 474[2mms[22m[39m
     [33m[2m✓[22m[39m deletes the worktree with the task and reaps terminal orphans on scan[33m 984[2mms[22m[39m
   [32m✓[39m zero unique commits fast path [2m(1)[22m
     [33m[2m✓[22m[39m never merges a zero-change branch and never commits engine files as task work[33m 1067[2mms[22m[39m
{"level":30,"time":1793126488726,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126488874,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":145.90235799999937,"msg":"request completed"}
{"level":30,"time":1793126488876,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"PATCH","url":"/projects/d4166e91-56a9-4900-abcb-68f96e84826a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m flow/stageLifecycle.integration.test.js [2m([22m[2m6 tests[22m[2m)[22m[33m 4488[2mms[22m[39m
   [32m✓[39m task branch lifecycle end to end [2m(6)[22m
     [33m[2m✓[22m[39m agent stage: default → task → commit → push → default[33m 570[2mms[22m[39m
     [33m[2m✓[22m[39m CI stage: default → task → commit → push → default[33m 685[2mms[22m[39m
     [33m[2m✓[22m[39m merge stage: integrates, ends on default, pushes default[33m 1080[2mms[22m[39m
     [33m[2m✓[22m[39m deploy stage: runs as an ordinary CI stage (default → task → commit → push → default)[33m 960[2mms[22m[39m
{"level":30,"time":1793126492353,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":3477.3421039999957,"msg":"request completed"}
{"level":30,"time":1793126492356,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/projects/d4166e91-56a9-4900-abcb-68f96e84826a","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492367,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":11.000974999995378,"msg":"request completed"}
{"level":30,"time":1793126492378,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492461,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":201},"responseTime":82.9483790000013,"msg":"request completed"}
{"level":30,"time":1793126492461,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"PATCH","url":"/projects/5ab4147d-3dc6-4b14-8d7f-0e68ed9110b0","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m flow/stageExecution.test.js [2m([22m[2m21 tests[22m[2m)[22m[33m 4575[2mms[22m[39m
   [32m✓[39m executeStage branch lifecycle [2m(7)[22m
     [33m[2m✓[22m[39m agent success commits work and returns to the default branch[33m 1248[2mms[22m[39m
     [33m[2m✓[22m[39m human pickup creates the branch ref without checking out and waits[33m 446[2mms[22m[39m
   [32m✓[39m deploy as a ci stage (ordinary ci runtime) [2m(6)[22m
     [33m[2m✓[22m[39m provisions a task branch for a deploy-command ci stage like any other CI (branch mode)[33m 726[2mms[22m[39m
     [33m[2m✓[22m[39m still gives an agent stage its task branch when a stray command mentions deploy.sh[33m 1220[2mms[22m[39m
{"level":30,"time":1793126492587,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":125.62018800000078,"msg":"request completed"}
{"level":30,"time":1793126492587,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"PATCH","url":"/projects/5ab4147d-3dc6-4b14-8d7f-0e68ed9110b0","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492588,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":400},"responseTime":0.49750800000038,"msg":"request completed"}
{"level":30,"time":1793126492589,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"PATCH","url":"/projects/5ab4147d-3dc6-4b14-8d7f-0e68ed9110b0","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492591,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":400},"responseTime":2.8387819999989006,"msg":"request completed"}
{"level":30,"time":1793126492592,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"PATCH","url":"/projects/5ab4147d-3dc6-4b14-8d7f-0e68ed9110b0","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492595,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":400},"responseTime":3.35244199999579,"msg":"request completed"}
{"level":30,"time":1793126492596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492629,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":201},"responseTime":32.33996300000581,"msg":"request completed"}
{"level":30,"time":1793126492630,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"PATCH","url":"/projects/f191c8c9-0a34-4b54-96af-0acc187c21db","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492632,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":400},"responseTime":1.3132199999963632,"msg":"request completed"}
{"level":30,"time":1793126492632,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"PATCH","url":"/projects/f191c8c9-0a34-4b54-96af-0acc187c21db","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492633,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"responseTime":0.5345320000051288,"msg":"request completed"}
{"level":30,"time":1793126492633,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"PATCH","url":"/projects/f191c8c9-0a34-4b54-96af-0acc187c21db","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492636,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":400},"responseTime":3.3964620000042487,"msg":"request completed"}
{"level":30,"time":1793126492637,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"PATCH","url":"/projects/f191c8c9-0a34-4b54-96af-0acc187c21db","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492637,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":400},"err":{"type":"Error","message":"body/modelAliases/0 must be object","stack":"Error: body/modelAliases/0 must be object\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"/modelAliases/0","schemaPath":"#/properties/modelAliases/items/type","keyword":"type","params":{"type":"object"},"message":"must be object"}],"validationContext":"body"},"msg":"body/modelAliases/0 must be object"}
{"level":30,"time":1793126492643,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":400},"responseTime":6.122425999994448,"msg":"request completed"}
{"level":30,"time":1793126492643,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":201},"responseTime":30.405740999995032,"msg":"request completed"}
{"level":30,"time":1793126492675,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"PATCH","url":"/projects/9e4c4e3f-c4bc-41f0-86d5-f744cee55e51","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492675,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":400},"responseTime":0.5484859999996843,"msg":"request completed"}
{"level":30,"time":1793126492676,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492769,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":201},"responseTime":92.6197850000026,"msg":"request completed"}
{"level":30,"time":1793126492769,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"PUT","url":"/projects/0a8a814c-b53d-462a-b799-ee38dbd6e030/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492798,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":28.59216000000015,"msg":"request completed"}
{"level":30,"time":1793126492798,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"PATCH","url":"/projects/0a8a814c-b53d-462a-b799-ee38dbd6e030","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492818,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":19.240680000002612,"msg":"request completed"}
{"level":30,"time":1793126492818,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/projects/0a8a814c-b53d-462a-b799-ee38dbd6e030/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492818,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":0.4532330000001821,"msg":"request completed"}
{"level":30,"time":1793126492821,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492864,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":201},"responseTime":42.5635209999964,"msg":"request completed"}
{"level":30,"time":1793126492864,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"PATCH","url":"/projects/dea3dbef-667f-47a8-8dfa-4e64a0f4d3ac","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492881,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":16.172288000001572,"msg":"request completed"}
{"level":30,"time":1793126492881,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"PATCH","url":"/projects/dea3dbef-667f-47a8-8dfa-4e64a0f4d3ac","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492894,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":13.510904999995546,"msg":"request completed"}
{"level":30,"time":1793126492895,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/projects/dea3dbef-667f-47a8-8dfa-4e64a0f4d3ac","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492895,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":0.674670000000333,"msg":"request completed"}
{"level":30,"time":1793126492896,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492897,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":1.2995109999974375,"msg":"request completed"}
{"level":30,"time":1793126492898,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492955,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":201},"responseTime":57.207118999998784,"msg":"request completed"}
{"level":30,"time":1793126492956,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"PATCH","url":"/projects/2521ad15-2c3e-4db7-abaa-aaaff6f71375","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":19.443449999998847,"msg":"request completed"}
{"level":30,"time":1793126492975,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"PATCH","url":"/projects/2521ad15-2c3e-4db7-abaa-aaaff6f71375","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492977,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":409},"responseTime":1.6962779999958002,"msg":"request completed"}
{"level":30,"time":1793126492977,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"GET","url":"/projects/2521ad15-2c3e-4db7-abaa-aaaff6f71375","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492978,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":0.2527279999994789,"msg":"request completed"}
{"level":30,"time":1793126492980,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"PATCH","url":"/projects/2521ad15-2c3e-4db7-abaa-aaaff6f71375","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126492997,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":16.784569000003103,"msg":"request completed"}
{"level":30,"time":1793126492998,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":201},"responseTime":45.22298099999898,"msg":"request completed"}
{"level":30,"time":1793126493043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"PATCH","url":"/projects/16205ab7-181a-44b4-87f2-7cbf03f700df","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":400},"responseTime":0.4249760000020615,"msg":"request completed"}
{"level":30,"time":1793126493044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"GET","url":"/projects/16205ab7-181a-44b4-87f2-7cbf03f700df","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":200},"responseTime":0.24018300000170711,"msg":"request completed"}
{"level":30,"time":1793126493045,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493096,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":201},"responseTime":51.084444000000076,"msg":"request completed"}
{"level":30,"time":1793126493096,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"PATCH","url":"/projects/d9cdf6ee-fc98-4309-afc7-9a0add96115e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493098,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":400},"responseTime":1.7637600000016391,"msg":"request completed"}
{"level":30,"time":1793126493100,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493133,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":201},"responseTime":33.60510800000338,"msg":"request completed"}
{"level":30,"time":1793126493134,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"PATCH","url":"/projects/f0beb120-cd28-4ff5-b475-eb89169cfec2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493154,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":20.80467199999839,"msg":"request completed"}
 [32m✓[39m routes/projects.alias.test.js [2m([22m[2m10 tests[22m[2m)[22m[33m 5730[2mms[22m[39m
   [32m✓[39m Project model-alias API [2m(10)[22m
     [33m[2m✓[22m[39m persists modelAliases through PATCH and echoes them on GET[33m 4932[2mms[22m[39m
{"level":30,"time":1793126493551,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":85.0874610000028,"msg":"request completed"}
{"level":30,"time":1793126493639,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493651,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":12.11866000000009,"msg":"request completed"}
{"level":30,"time":1793126493654,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493656,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":403},"responseTime":1.443950999993831,"msg":"request completed"}
{"level":30,"time":1793126493657,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493658,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":202},"responseTime":1.3925799999997253,"msg":"request completed"}
{"level":30,"time":1793126493659,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493659,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":0.3995379999978468,"msg":"request completed"}
{"level":30,"time":1793126493660,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493661,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":202},"responseTime":0.9841670000023441,"msg":"request completed"}
{"level":30,"time":1793126493662,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/runners/claimer-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493662,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.7120970000032685,"msg":"request completed"}
{"level":30,"time":1793126493663,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493664,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.943448999998509,"msg":"request completed"}
{"level":30,"time":1793126493664,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks/605a72d0-28be-49cd-8846-3aaeb0c7ee32/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493666,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":2.105803999998898,"msg":"request completed"}
{"level":30,"time":1793126493667,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493668,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":202},"responseTime":0.9899440000008326,"msg":"request completed"}
{"level":30,"time":1793126493668,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/runners/claimer-2/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493669,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":0.64250699999684,"msg":"request completed"}
{"level":30,"time":1793126493669,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/tasks/605a72d0-28be-49cd-8846-3aaeb0c7ee32/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493670,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":409},"responseTime":0.5900150000015856,"msg":"request completed"}
{"level":30,"time":1793126493672,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493673,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":202},"responseTime":1.0969229999973322,"msg":"request completed"}
{"level":30,"time":1793126493673,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/runners/heartbeat-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":0.4631280000030529,"msg":"request completed"}
{"level":30,"time":1793126493674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493676,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":2.133028000003833,"msg":"request completed"}
{"level":30,"time":1793126493677,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/tasks/a9f843ba-366d-49d0-807d-6d09ce6e530a/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126493678,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":1.346732999998494,"msg":"request completed"}
{"level":30,"time":1793126494284,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/tasks/a9f843ba-366d-49d0-807d-6d09ce6e530a/claim-heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126494290,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":6.069799000004423,"msg":"request completed"}
{"level":30,"time":1793126494991,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126494993,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":202},"responseTime":1.9935589999950025,"msg":"request completed"}
{"level":30,"time":1793126494994,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"POST","url":"/runners/heartbeat-2/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126494999,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":0.47139700000116136,"msg":"request completed"}
{"level":30,"time":1793126495002,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"POST","url":"/tasks/a9f843ba-366d-49d0-807d-6d09ce6e530a/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495003,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":409},"responseTime":0.9508079999941401,"msg":"request completed"}
{"level":30,"time":1793126495009,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495010,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":202},"responseTime":0.8527899999971851,"msg":"request completed"}
{"level":30,"time":1793126495010,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/runners/heartbeat-stale/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495012,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":1.9926850000047125,"msg":"request completed"}
{"level":30,"time":1793126495017,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495027,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":9.690684000001056,"msg":"request completed"}
{"level":30,"time":1793126495027,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/tasks/4df2bff4-a47c-4316-912f-da2ab0d23af4/claim-heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495028,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":409},"responseTime":0.48565899999812245,"msg":"request completed"}
{"level":30,"time":1793126495028,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495029,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":401},"responseTime":0.6576329999952577,"msg":"request completed"}
{"level":30,"time":1793126495029,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":14.355445000001055,"msg":"request completed"}
{"level":30,"time":1793126495044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/tasks/0449a537-5e4d-4573-ba05-f8fb5a0c4e27/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":401},"responseTime":0.39513499999884516,"msg":"request completed"}
{"level":30,"time":1793126495045,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":202},"responseTime":0.7712639999954263,"msg":"request completed"}
{"level":30,"time":1793126495046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/runners/scoped-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495054,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":8.302880999995978,"msg":"request completed"}
{"level":30,"time":1793126495060,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495090,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":202},"responseTime":30.401286000000255,"msg":"request completed"}
{"level":30,"time":1793126495091,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"POST","url":"/runners/scoped-2/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495091,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":0.6389980000021751,"msg":"request completed"}
{"level":30,"time":1793126495092,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"POST","url":"/tasks/605a72d0-28be-49cd-8846-3aaeb0c7ee32/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495092,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":403},"responseTime":0.48272200000064913,"msg":"request completed"}
{"level":30,"time":1793126495093,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495099,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":202},"responseTime":6.647883999998157,"msg":"request completed"}
{"level":30,"time":1793126495100,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"POST","url":"/runners/doomed-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495101,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":200},"responseTime":1.1080609999989974,"msg":"request completed"}
{"level":30,"time":1793126495101,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495109,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":8.322165999998106,"msg":"request completed"}
{"level":30,"time":1793126495110,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"POST","url":"/runners/doomed-1/revoke","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495111,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":1.0233189999999013,"msg":"request completed"}
{"level":30,"time":1793126495111,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":401},"responseTime":0.6617130000013276,"msg":"request completed"}
{"level":30,"time":1793126495112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"POST","url":"/tasks/9b8a179b-fa3e-483d-a4ca-09f3b4961c2b/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495119,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":401},"responseTime":6.713542999998026,"msg":"request completed"}
{"level":30,"time":1793126495120,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495121,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":202},"responseTime":0.7311550000013085,"msg":"request completed"}
{"level":30,"time":1793126495121,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"POST","url":"/runners/reporter-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495121,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":200},"responseTime":0.5318069999993895,"msg":"request completed"}
{"level":30,"time":1793126495122,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495130,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":8.674307999994198,"msg":"request completed"}
{"level":30,"time":1793126495131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"POST","url":"/tasks/ceaaae92-c6d2-4988-904f-291bfcc2f90d/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495138,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":7.396779000002425,"msg":"request completed"}
{"level":30,"time":1793126495138,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"POST","url":"/tasks/ceaaae92-c6d2-4988-904f-291bfcc2f90d/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495139,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":200},"responseTime":0.8688770000007935,"msg":"request completed"}
{"level":30,"time":1793126495140,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/tasks/ceaaae92-c6d2-4988-904f-291bfcc2f90d/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495140,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":200},"responseTime":0.373911999995471,"msg":"request completed"}
{"level":30,"time":1793126495140,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"POST","url":"/tasks/ceaaae92-c6d2-4988-904f-291bfcc2f90d/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495142,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":1.7278129999976954,"msg":"request completed"}
{"level":30,"time":1793126495148,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"POST","url":"/tasks/ceaaae92-c6d2-4988-904f-291bfcc2f90d/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495155,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":200},"responseTime":6.998999000003096,"msg":"request completed"}
{"level":30,"time":1793126495156,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"GET","url":"/runners/monitor","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495156,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":200},"responseTime":0.8470530000049621,"msg":"request completed"}
{"level":30,"time":1793126495158,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495159,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":202},"responseTime":0.7843469999934314,"msg":"request completed"}
{"level":30,"time":1793126495164,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"POST","url":"/runners/partition-a/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495165,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":200},"responseTime":0.7391399999978603,"msg":"request completed"}
{"level":30,"time":1793126495171,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495172,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","res":{"statusCode":202},"responseTime":1.305011000004015,"msg":"request completed"}
{"level":30,"time":1793126495173,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","req":{"method":"POST","url":"/runners/partition-b/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495173,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","res":{"statusCode":200},"responseTime":0.8452630000028876,"msg":"request completed"}
{"level":30,"time":1793126495174,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495182,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","res":{"statusCode":200},"responseTime":8.379635999997845,"msg":"request completed"}
{"level":30,"time":1793126495182,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","req":{"method":"POST","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126495195,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","res":{"statusCode":200},"responseTime":12.612028000003193,"msg":"request completed"}
{"level":30,"time":1793126496300,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","req":{"method":"POST","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6/interrupt","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496302,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","res":{"statusCode":200},"responseTime":2.5105360000015935,"msg":"request completed"}
{"level":30,"time":1793126496308,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","req":{"method":"GET","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6?projectId=e4bb0815-32e3-482c-b219-8b0ba9222ee7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496311,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","res":{"statusCode":200},"responseTime":2.468165999998746,"msg":"request completed"}
{"level":30,"time":1793126496312,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","req":{"method":"POST","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496328,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","res":{"statusCode":200},"responseTime":16.00994499999797,"msg":"request completed"}
{"level":30,"time":1793126496329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","req":{"method":"POST","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6/complete-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496344,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","res":{"statusCode":200},"responseTime":15.179840999997396,"msg":"request completed"}
{"level":30,"time":1793126496344,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","req":{"method":"POST","url":"/tasks/955f064f-2b0b-4d44-b954-63a463457cb6/complete-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496345,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","res":{"statusCode":409},"responseTime":1.0369779999964521,"msg":"request completed"}
{"level":30,"time":1793126496345,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","req":{"method":"GET","url":"/runners/monitor","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","res":{"statusCode":200},"responseTime":0.1315690000046743,"msg":"request completed"}
{"level":30,"time":1793126496346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496391,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","res":{"statusCode":202},"responseTime":44.19460299999628,"msg":"request completed"}
{"level":30,"time":1793126496391,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","req":{"method":"POST","url":"/runners/failing-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496392,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","res":{"statusCode":200},"responseTime":0.5148869999975432,"msg":"request completed"}
{"level":30,"time":1793126496392,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","res":{"statusCode":200},"responseTime":18.737216000001354,"msg":"request completed"}
{"level":30,"time":1793126496411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","req":{"method":"GET","url":"/tasks/8be05f7d-2f89-4272-b979-135ef3b19ce8?projectId=e4bb0815-32e3-482c-b219-8b0ba9222ee7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","res":{"statusCode":200},"responseTime":0.2791789999973844,"msg":"request completed"}
{"level":30,"time":1793126496412,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","req":{"method":"POST","url":"/tasks/8be05f7d-2f89-4272-b979-135ef3b19ce8/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496413,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","res":{"statusCode":200},"responseTime":1.9290650000039022,"msg":"request completed"}
{"level":30,"time":1793126496414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","req":{"method":"POST","url":"/tasks/8be05f7d-2f89-4272-b979-135ef3b19ce8/complete-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496469,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","res":{"statusCode":200},"responseTime":55.301793000006,"msg":"request completed"}
{"level":30,"time":1793126496469,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","req":{"method":"GET","url":"/tasks/8be05f7d-2f89-4272-b979-135ef3b19ce8?projectId=e4bb0815-32e3-482c-b219-8b0ba9222ee7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496470,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","res":{"statusCode":200},"responseTime":0.29377799999929266,"msg":"request completed"}
{"level":30,"time":1793126496471,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496472,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","res":{"statusCode":202},"responseTime":1.3827040000032866,"msg":"request completed"}
{"level":30,"time":1793126496477,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","req":{"method":"POST","url":"/runners/guard-exec-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496478,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","res":{"statusCode":200},"responseTime":1.3655149999976857,"msg":"request completed"}
{"level":30,"time":1793126496484,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496503,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","res":{"statusCode":200},"responseTime":19.679181999999855,"msg":"request completed"}
{"level":30,"time":1793126496504,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","req":{"method":"POST","url":"/tasks/240365b7-e1da-4b11-a941-5807e3875614/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496505,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","res":{"statusCode":200},"responseTime":1.6306009999971138,"msg":"request completed"}
{"level":30,"time":1793126496506,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","req":{"method":"POST","url":"/tasks/240365b7-e1da-4b11-a941-5807e3875614/execute","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496517,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","res":{"statusCode":409},"responseTime":6.248046000000613,"msg":"request completed"}
{"level":30,"time":1793126496518,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496520,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","res":{"statusCode":202},"responseTime":1.1471910000036587,"msg":"request completed"}
{"level":30,"time":1793126496520,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","req":{"method":"POST","url":"/runners/guarded-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496520,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","res":{"statusCode":200},"responseTime":0.4545739999957732,"msg":"request completed"}
{"level":30,"time":1793126496520,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496533,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","res":{"statusCode":200},"responseTime":12.665423999998893,"msg":"request completed"}
{"level":30,"time":1793126496533,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","req":{"method":"POST","url":"/tasks/a2f947eb-ee36-46fa-9418-60b678bb0aae/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","res":{"statusCode":200},"responseTime":18.775524000004225,"msg":"request completed"}
{"level":30,"time":1793126496552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","req":{"method":"POST","url":"/tasks/a2f947eb-ee36-46fa-9418-60b678bb0aae/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496553,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","res":{"statusCode":401},"responseTime":0.9675659999993513,"msg":"request completed"}
{"level":30,"time":1793126496554,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","req":{"method":"POST","url":"/tasks/a2f947eb-ee36-46fa-9418-60b678bb0aae/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496554,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","res":{"statusCode":401},"responseTime":0.6531859999959124,"msg":"request completed"}
{"level":30,"time":1793126496555,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","req":{"method":"POST","url":"/tasks/a2f947eb-ee36-46fa-9418-60b678bb0aae/complete-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496566,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","res":{"statusCode":401},"responseTime":10.946539000004122,"msg":"request completed"}
{"level":30,"time":1793126496566,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","req":{"method":"POST","url":"/tasks/a2f947eb-ee36-46fa-9418-60b678bb0aae/interrupt","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496566,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","res":{"statusCode":401},"responseTime":0.28545499999745516,"msg":"request completed"}
{"level":30,"time":1793126496567,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496635,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","res":{"statusCode":201},"responseTime":67.70420400000148,"msg":"request completed"}
{"level":30,"time":1793126496635,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","res":{"statusCode":200},"responseTime":2.344293000001926,"msg":"request completed"}
{"level":30,"time":1793126496638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496643,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","res":{"statusCode":202},"responseTime":5.536053000003449,"msg":"request completed"}
{"level":30,"time":1793126496648,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","req":{"method":"POST","url":"/runners/dispatch-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496649,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","res":{"statusCode":200},"responseTime":0.7643900000039139,"msg":"request completed"}
{"level":30,"time":1793126496649,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496650,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","res":{"statusCode":200},"responseTime":0.37433900000178255,"msg":"request completed"}
{"level":30,"time":1793126496650,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496691,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","res":{"statusCode":200},"responseTime":41.103737999997975,"msg":"request completed"}
{"level":30,"time":1793126496692,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496693,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","res":{"statusCode":200},"responseTime":0.9712639999997918,"msg":"request completed"}
{"level":30,"time":1793126496693,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496694,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","res":{"statusCode":202},"responseTime":0.7128299999967567,"msg":"request completed"}
{"level":30,"time":1793126496694,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","req":{"method":"POST","url":"/runners/dispatch-stale/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496695,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","res":{"statusCode":200},"responseTime":0.522807000001194,"msg":"request completed"}
{"level":30,"time":1793126496700,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496700,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","res":{"statusCode":409},"responseTime":0.6035700000065845,"msg":"request completed"}
{"level":30,"time":1793126496705,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496762,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","res":{"statusCode":201},"responseTime":56.21421900000132,"msg":"request completed"}
{"level":30,"time":1793126496762,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2j","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496764,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2j","res":{"statusCode":200},"responseTime":1.8450779999984661,"msg":"request completed"}
{"level":30,"time":1793126496764,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2k","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496770,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2k","res":{"statusCode":202},"responseTime":5.296817999995255,"msg":"request completed"}
{"level":30,"time":1793126496770,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2l","req":{"method":"POST","url":"/runners/dispatch-t0/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496775,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2l","res":{"statusCode":200},"responseTime":5.150818000001891,"msg":"request completed"}
{"level":30,"time":1793126496775,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2m","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496776,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2m","res":{"statusCode":200},"responseTime":0.4583219999985886,"msg":"request completed"}
{"level":30,"time":1793126496776,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2n","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496777,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2n","res":{"statusCode":200},"responseTime":0.8893779999998515,"msg":"request completed"}
{"level":30,"time":1793126496778,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2o","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496838,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2o","res":{"statusCode":201},"responseTime":60.29236900000251,"msg":"request completed"}
{"level":30,"time":1793126496838,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2p","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496840,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2p","res":{"statusCode":200},"responseTime":2.0802350000012666,"msg":"request completed"}
{"level":30,"time":1793126496841,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2q","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496847,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2q","res":{"statusCode":202},"responseTime":6.017608000001928,"msg":"request completed"}
{"level":30,"time":1793126496852,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2r","req":{"method":"POST","url":"/runners/dispatch-allow/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496853,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2r","res":{"statusCode":200},"responseTime":0.8983720000032918,"msg":"request completed"}
{"level":30,"time":1793126496853,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2s","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496853,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2s","res":{"statusCode":200},"responseTime":0.4315500000011525,"msg":"request completed"}
{"level":30,"time":1793126496854,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2t","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496854,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2t","res":{"statusCode":200},"responseTime":0.28084799999487586,"msg":"request completed"}
{"level":30,"time":1793126496854,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2u","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496866,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2u","res":{"statusCode":200},"responseTime":11.4242579999991,"msg":"request completed"}
{"level":30,"time":1793126496866,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2v","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496867,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2v","res":{"statusCode":401},"responseTime":0.7961230000000796,"msg":"request completed"}
{"level":30,"time":1793126496868,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2w","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496930,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2w","res":{"statusCode":201},"responseTime":62.03339499999856,"msg":"request completed"}
{"level":30,"time":1793126496930,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2x","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496933,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2x","res":{"statusCode":200},"responseTime":2.268942999995488,"msg":"request completed"}
{"level":30,"time":1793126496933,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2y","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496938,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2y","res":{"statusCode":202},"responseTime":4.9515360000004875,"msg":"request completed"}
{"level":30,"time":1793126496938,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2z","req":{"method":"POST","url":"/runners/dispatch-scope/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496939,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2z","res":{"statusCode":200},"responseTime":0.7558120000030613,"msg":"request completed"}
{"level":30,"time":1793126496944,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-30","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496945,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-30","res":{"statusCode":200},"responseTime":0.5202559999961522,"msg":"request completed"}
{"level":30,"time":1793126496945,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-31","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-31","res":{"statusCode":200},"responseTime":1.6813320000001113,"msg":"request completed"}
{"level":30,"time":1793126496947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-32","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-32","res":{"statusCode":200},"responseTime":0.251670000005106,"msg":"request completed"}
{"level":30,"time":1793126496947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-33","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-33","res":{"statusCode":202},"responseTime":0.6426839999985532,"msg":"request completed"}
{"level":30,"time":1793126496948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-34","req":{"method":"POST","url":"/runners/dispatch-scope-all/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-34","res":{"statusCode":200},"responseTime":0.44955599999957485,"msg":"request completed"}
{"level":30,"time":1793126496954,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-35","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496954,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-35","res":{"statusCode":200},"responseTime":0.5091140000004089,"msg":"request completed"}
{"level":30,"time":1793126496954,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-36","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496966,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-36","res":{"statusCode":200},"responseTime":11.336173000003328,"msg":"request completed"}
{"level":30,"time":1793126496966,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-37","req":{"method":"GET","url":"/runners","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126496966,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-37","res":{"statusCode":200},"responseTime":0.32980200000019977,"msg":"request completed"}
{"level":30,"time":1793126496967,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-38","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497032,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-38","res":{"statusCode":201},"responseTime":64.47627099999954,"msg":"request completed"}
{"level":30,"time":1793126497032,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-39","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497034,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-39","res":{"statusCode":200},"responseTime":1.9222359999985201,"msg":"request completed"}
{"level":30,"time":1793126497034,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3a","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497035,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3a","res":{"statusCode":202},"responseTime":0.7913560000015423,"msg":"request completed"}
{"level":30,"time":1793126497040,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3b","req":{"method":"POST","url":"/runners/dispatch-alias/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497041,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3b","res":{"statusCode":200},"responseTime":0.8345449999978882,"msg":"request completed"}
{"level":30,"time":1793126497041,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3c","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497042,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3c","res":{"statusCode":200},"responseTime":0.6234849999964354,"msg":"request completed"}
{"level":30,"time":1793126497043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3d","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m reviewAssembly.integration.test.js [2m([22m[2m7 tests[22m[2m)[22m[33m 3312[2mms[22m[39m
   [32m✓[39m reviewAssembly preserved diff after merge [2m(7)[22m
     [33m[2m✓[22m[39m shows an empty live diff after merge when preservation is off[33m 448[2mms[22m[39m
     [33m[2m✓[22m[39m keeps the merged change visible when preservation is on[33m 474[2mms[22m[39m
     [33m[2m✓[22m[39m separates post-failback fix-ups into newSinceMerge[33m 585[2mms[22m[39m
     [33m[2m✓[22m[39m shows only the latest pass after re-merge with a reset baseline[33m 655[2mms[22m[39m
     [33m[2m✓[22m[39m still renders the baseline when the task branch was deleted post-merge[33m 540[2mms[22m[39m
     [33m[2m✓[22m[39m falls back to the live diff with a note when baseline SHAs are gone[33m 421[2mms[22m[39m
{"level":30,"time":1793126497050,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3d","res":{"statusCode":200},"responseTime":7.782137000001967,"msg":"request completed"}
{"level":30,"time":1793126497052,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3e","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497107,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3e","res":{"statusCode":201},"responseTime":55.684056999998575,"msg":"request completed"}
{"level":30,"time":1793126497108,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3f","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497110,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3f","res":{"statusCode":200},"responseTime":2.1766390000047977,"msg":"request completed"}
{"level":30,"time":1793126497110,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3g","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497111,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3g","res":{"statusCode":202},"responseTime":0.6529440000012983,"msg":"request completed"}
{"level":30,"time":1793126497111,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3h","req":{"method":"POST","url":"/runners/steer-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3h","res":{"statusCode":200},"responseTime":0.4871999999959371,"msg":"request completed"}
{"level":30,"time":1793126497112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3i","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3i","res":{"statusCode":200},"responseTime":0.3492829999959213,"msg":"request completed"}
{"level":30,"time":1793126497112,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3j","req":{"method":"POST","url":"/tasks/c644b4c4-b4d1-490a-b13a-ba20150e255b/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497114,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3j","res":{"statusCode":200},"responseTime":1.1653579999983776,"msg":"request completed"}
{"level":30,"time":1793126497114,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3k","req":{"method":"POST","url":"/tasks/c644b4c4-b4d1-490a-b13a-ba20150e255b/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497121,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3k","res":{"statusCode":200},"responseTime":7.26369899999554,"msg":"request completed"}
{"level":30,"time":1793126497122,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3l","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497122,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3l","res":{"statusCode":200},"responseTime":0.823552000001655,"msg":"request completed"}
{"level":30,"time":1793126497124,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3m","req":{"method":"POST","url":"/tasks/c644b4c4-b4d1-490a-b13a-ba20150e255b/steer-ack","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497125,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3m","res":{"statusCode":409},"responseTime":0.5778629999986151,"msg":"request completed"}
{"level":30,"time":1793126497125,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3n","req":{"method":"POST","url":"/tasks/c644b4c4-b4d1-490a-b13a-ba20150e255b/steer-ack","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497126,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3n","res":{"statusCode":200},"responseTime":0.8935599999967963,"msg":"request completed"}
{"level":30,"time":1793126497131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3o","req":{"method":"GET","url":"/tasks/c644b4c4-b4d1-490a-b13a-ba20150e255b/steers?projectId=196fbf71-c613-4bc8-b8d9-12347376b3a3&executionId=da9b6cfc-9e98-4e7c-89a7-e2b33fd396bf","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3o","res":{"statusCode":200},"responseTime":0.5873690000007628,"msg":"request completed"}
{"level":30,"time":1793126497132,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3p","req":{"method":"GET","url":"/runners/monitor","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497133,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3p","res":{"statusCode":200},"responseTime":0.3132629999963683,"msg":"request completed"}
{"level":30,"time":1793126497135,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3q","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497140,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3q","res":{"statusCode":202},"responseTime":5.555129000000306,"msg":"request completed"}
{"level":30,"time":1793126497141,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3r","req":{"method":"POST","url":"/runners/rotate-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497141,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3r","res":{"statusCode":200},"responseTime":0.6925170000031358,"msg":"request completed"}
{"level":30,"time":1793126497141,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3s","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497142,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3s","res":{"statusCode":200},"responseTime":0.38795699999900535,"msg":"request completed"}
{"level":30,"time":1793126497142,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3t","req":{"method":"POST","url":"/runners/rotate-1/rotate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497143,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3t","res":{"statusCode":200},"responseTime":0.8519509999969159,"msg":"request completed"}
{"level":30,"time":1793126497144,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3u","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497144,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3u","res":{"statusCode":401},"responseTime":0.3527299999987008,"msg":"request completed"}
{"level":30,"time":1793126497144,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3v","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497150,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3v","res":{"statusCode":200},"responseTime":5.445587999995041,"msg":"request completed"}
{"level":30,"time":1793126497150,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3w","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497151,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3w","res":{"statusCode":202},"responseTime":0.7499890000035521,"msg":"request completed"}
{"level":30,"time":1793126497151,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3x","req":{"method":"POST","url":"/runners/rotate-pending/rotate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497151,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3x","res":{"statusCode":409},"responseTime":0.20257500000298023,"msg":"request completed"}
{"level":30,"time":1793126497152,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3y","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497201,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3y","res":{"statusCode":201},"responseTime":48.63098600000376,"msg":"request completed"}
{"level":30,"time":1793126497201,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497207,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3z","res":{"statusCode":200},"responseTime":6.278949999999895,"msg":"request completed"}
{"level":30,"time":1793126497208,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-40","req":{"method":"POST","url":"/tasks/b9f11cc7-1110-4db5-846f-6dcebb7f60d5/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497211,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-40","res":{"statusCode":200},"responseTime":2.911074000003282,"msg":"request completed"}
{"level":30,"time":1793126497211,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-41","req":{"method":"GET","url":"/tasks/b9f11cc7-1110-4db5-846f-6dcebb7f60d5/steers?projectId=e3d8baf1-6248-4711-8c73-7e1a9f1b6395&executionId=gone","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497211,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-41","res":{"statusCode":200},"responseTime":0.15515199999936158,"msg":"request completed"}
{"level":30,"time":1793126497212,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-42","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497273,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-42","res":{"statusCode":201},"responseTime":60.902094999997644,"msg":"request completed"}
{"level":30,"time":1793126497273,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-43","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-43","res":{"statusCode":200},"responseTime":2.97695499999827,"msg":"request completed"}
{"level":30,"time":1793126497276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-44","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497277,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-44","res":{"statusCode":202},"responseTime":0.7325700000001234,"msg":"request completed"}
{"level":30,"time":1793126497282,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-45","req":{"method":"POST","url":"/runners/dispatch-alias-gone/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497283,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-45","res":{"statusCode":200},"responseTime":0.8516200000012759,"msg":"request completed"}
{"level":30,"time":1793126497283,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-46","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497284,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-46","res":{"statusCode":200},"responseTime":0.478941000001214,"msg":"request completed"}
{"level":30,"time":1793126497284,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-47","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497285,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-47","res":{"statusCode":200},"responseTime":0.9189580000020214,"msg":"request completed"}
{"level":30,"time":1793126497285,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-48","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497286,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-48","res":{"statusCode":202},"responseTime":0.7816789999997127,"msg":"request completed"}
{"level":30,"time":1793126497286,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-49","req":{"method":"POST","url":"/runners/notfound-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497287,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-49","res":{"statusCode":200},"responseTime":0.6473320000004605,"msg":"request completed"}
{"level":30,"time":1793126497287,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4a","req":{"method":"POST","url":"/tasks/does-not-exist/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4a","res":{"statusCode":404},"responseTime":0.27970099999947706,"msg":"request completed"}
{"level":30,"time":1793126497288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4b","req":{"method":"POST","url":"/runners/ghost-runner/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126497288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4b","res":{"statusCode":404},"responseTime":0.18552099999942584,"msg":"request completed"}
 [32m✓[39m flow/runnerRoutes.test.js [2m([22m[2m25 tests[22m[2m)[22m[33m 4267[2mms[22m[39m
   [32m✓[39m Runner Routes Integration [2m(25)[22m
     [33m[2m✓[22m[39m renews a live hold via claim-heartbeat: 200, still fenced past TTL[33m 1337[2mms[22m[39m
     [33m[2m✓[22m[39m R01 wire: partitioned Runner's late completion is stale, exactly one wins[33m 1188[2mms[22m[39m
 [32m✓[39m work/taskBranches.test.js [2m([22m[2m21 tests[22m[2m)[22m[33m 4123[2mms[22m[39m
   [32m✓[39m ensureTaskBranch default-first pickup [2m(4)[22m
     [33m[2m✓[22m[39m passes through the default branch when the tree sits on another task branch[33m 610[2mms[22m[39m
     [33m[2m✓[22m[39m switches straight from the default branch without a redundant hop[33m 467[2mms[22m[39m
     [33m[2m✓[22m[39m is a no-op when already on the task branch[33m 598[2mms[22m[39m
   [32m✓[39m ensureTaskBranchRef human-review policy [2m(11)[22m
     [33m[2m✓[22m[39m creates the missing ref from the default tip without checkout or commit[33m 408[2mms[22m[39m
     [33m[2m✓[22m[39m is a no-op when the ref already exists[33m 333[2mms[22m[39m
     [33m[2m✓[22m[39m stays on another branch with a dirty tree (never hits the clean-tree guard)[33m 422[2mms[22m[39m
     [33m[2m✓[22m[39m falls back to HEAD when no default branch resolves[33m 313[2mms[22m[39m
[90mstderr[2m | projectStore.test.js[2m > [22m[2mProjectStore[2m > [22m[2mrefuses to persist a project whose cwd is the projects root
[22m[39m[projectStore] refusing to save 8f335082-6d55-432b-a065-4929bddcd6fc: cwd is the projects root ('/tmp/kainbain-test-projects-fpDNai')

 [32m✓[39m projectStore.test.js [2m([22m[2m66 tests[22m[2m)[22m[33m 2038[2mms[22m[39m
{"level":30,"time":1793126500131,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m agent/harnesses/vibe/vibeHarness.acp.test.js [2m([22m[2m61 tests[22m[2m)[22m[33m 2482[2mms[22m[39m
   [32m✓[39m vibe ACP session (mock agent) [2m(22)[22m
     [33m[2m✓[22m[39m aborts a slow turn: the child dies and the turn settles as aborted[33m 517[2mms[22m[39m
     [33m[2m✓[22m[39m times out a hung handshake instead of pinning session creation[33m 311[2mms[22m[39m
{"level":30,"time":1793126501182,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501242,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":58.782201000001805,"msg":"request completed"}
{"level":30,"time":1793126501245,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501247,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.2584900000001653,"msg":"request completed"}
{"level":30,"time":1793126501248,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/compute/status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501248,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":0.47022999999899184,"msg":"request completed"}
{"level":30,"time":1793126501249,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/compute/stop","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501250,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":1.3552209999979823,"msg":"request completed"}
{"level":30,"time":1793126501251,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/compute/stop","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501252,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":0.6521460000003572,"msg":"request completed"}
{"level":30,"time":1793126501252,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501253,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":0.6402959999977611,"msg":"request completed"}
{"level":30,"time":1793126501254,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/compute/context?projectId=64cfb921-6baf-4e13-9310-3e919000bf61","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501254,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.4696630000034929,"msg":"request completed"}
{"level":30,"time":1793126501255,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/compute/compact","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501255,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.6158799999975599,"msg":"request completed"}
{"level":30,"time":1793126501257,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/compute/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501258,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":400},"responseTime":0.623634999996284,"msg":"request completed"}
{"level":30,"time":1793126501258,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/compute/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501259,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":0.6361929999984568,"msg":"request completed"}
{"level":30,"time":1793126501259,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/compute/follow-up","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501260,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":0.5984079999980167,"msg":"request completed"}
{"level":30,"time":1793126501261,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501269,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":8.818153000000166,"msg":"request completed"}
{"level":30,"time":1793126501270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"GET","url":"/tasks?projectId=64cfb921-6baf-4e13-9310-3e919000bf61","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501274,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":3.8937279999954626,"msg":"request completed"}
{"level":30,"time":1793126501274,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/test/reset","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501357,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":1224.5669219999982,"msg":"request completed"}
{"level":30,"time":1793126501275,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":0.9348610000015469,"msg":"request completed"}
{"level":30,"time":1793126501275,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/tasks?projectId=64cfb921-6baf-4e13-9310-3e919000bf61","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501275,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":0.14655900000070687,"msg":"request completed"}
{"level":30,"time":1793126501277,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[boot] projects root '/tmp/kainbain-ca-test-hgKmjp/projects' does not exist — no projects will be discovered. Set PROJECTS_ROOT (and optionally PROJECTS_ROOTS) to your projects directory and restart.
{"level":30,"time":1793126501362,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"OPTIONS","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501363,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":204},"responseTime":0.695568999995885,"msg":"request completed"}
{"level":30,"time":1793126501363,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"OPTIONS","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501363,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":204},"responseTime":0.23714699999982258,"msg":"request completed"}
{"level":30,"time":1793126501364,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"OPTIONS","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126501364,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":204},"responseTime":0.19037500000558794,"msg":"request completed"}
 [32m✓[39m index.test.js [2m([22m[2m8 tests[22m[2m)[22m[33m 2289[2mms[22m[39m
   [32m✓[39m Server Configuration [2m(3)[22m
     [33m[2m✓[22m[39m should respond to the health check[33m 1234[2mms[22m[39m
   [32m✓[39m TLS trust [2m(1)[22m
     [33m[2m✓[22m[39m never injects an implicit CA path at import time (audit H-1)[33m 706[2mms[22m[39m
{"level":30,"time":1793126502126,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":849.1723689999999,"msg":"request completed"}
{"level":30,"time":1793126502128,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502205,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":77.25300699999934,"msg":"request completed"}
{"level":30,"time":1793126502205,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502271,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":65.38569499999721,"msg":"request completed"}
{"level":30,"time":1793126502272,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502345,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":72.64856799999689,"msg":"request completed"}
{"level":30,"time":1793126502346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502423,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":76.68766299999697,"msg":"request completed"}
{"level":30,"time":1793126502424,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502490,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":65.42352899999969,"msg":"request completed"}
{"level":30,"time":1793126502492,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502492,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":0.3311480000047595,"msg":"request completed"}
{"level":30,"time":1793126502493,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/compute/context?projectId=64cfb921-6baf-4e13-9310-3e919000bf61","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502493,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":501},"responseTime":0.2804060000053141,"msg":"request completed"}
{"level":30,"time":1793126502494,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502494,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":0.28947799999878043,"msg":"request completed"}
{"level":30,"time":1793126502494,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/compute/compact","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502495,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":501},"responseTime":0.45915100000274833,"msg":"request completed"}
{"level":30,"time":1793126502495,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502496,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":0.8520359999965876,"msg":"request completed"}
{"level":30,"time":1793126502496,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/compute/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502497,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":501},"responseTime":0.995348999997077,"msg":"request completed"}
{"level":30,"time":1793126502498,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502498,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":0.314035999996122,"msg":"request completed"}
{"level":30,"time":1793126502498,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/compute/follow-up","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502499,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":501},"responseTime":0.3117080000010901,"msg":"request completed"}
{"level":30,"time":1793126502499,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":200},"responseTime":0.26124200000049314,"msg":"request completed"}
{"level":30,"time":1793126502500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"POST","url":"/compute/compact","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":0.39579600000433857,"msg":"request completed"}
{"level":30,"time":1793126502501,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":200},"responseTime":80.63797899999918,"msg":"request completed"}
{"level":30,"time":1793126502596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502661,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":200},"responseTime":64.75274699999864,"msg":"request completed"}
{"level":30,"time":1793126502662,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"GET","url":"/compute/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502668,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":200},"responseTime":5.664813999996113,"msg":"request completed"}
{"level":30,"time":1793126502672,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126502755,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":83.53055199999653,"msg":"request completed"}
 [32m✓[39m routes/compute.test.js [2m([22m[2m23 tests[22m[2m)[22m[33m 1909[2mms[22m[39m
   [32m✓[39m Compute API Integration [2m(21)[22m
     [33m[2m✓[22m[39m GET /compute/models returns discovered models with input capabilities[33m 851[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museHarness.contract.test.js [2m([22m[2m50 tests[22m[2m)[22m[33m 2321[2mms[22m[39m
   [32m✓[39m muse harness lifecycle (mock muse) [2m(7)[22m
     [33m[2m✓[22m[39m watchdog kills a hung run with a timeout run_error[33m 433[2mms[22m[39m
   [32m✓[39m muse harness Tier-2 paths (mock muse + mock serve) [2m(4)[22m
     [33m[2m✓[22m[39m plumbs a dispatch-resolved model through --model on the MSP→exec fallback[33m 542[2mms[22m[39m
{"level":30,"time":1793126503940,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126504046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":104.40336799999932,"msg":"request completed"}
{"level":30,"time":1793126504058,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m git/branchWorktree.test.js [2m([22m[2m8 tests[22m[2m)[22m[33m 1918[2mms[22m[39m
   [32m✓[39m reconcileBranchWorktreeLock + ensureBranchCheckedOut [2m(5)[22m
     [33m[2m✓[22m[39m removes a clean, synced holder and checks out the branch[33m 345[2mms[22m[39m
     [33m[2m✓[22m[39m refuses a holder with uncommitted work and keeps it intact[33m 417[2mms[22m[39m
     [33m[2m✓[22m[39m refuses a holder with ignored files the checkout would delete[33m 328[2mms[22m[39m
     [33m[2m✓[22m[39m refuses a holder whose branch is ahead of upstream[33m 346[2mms[22m[39m
{"level":30,"time":1793126505080,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126504094,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":36.27749999999651,"msg":"request completed"}
{"level":30,"time":1793126504095,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/session/history?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505254,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":1159.074373000003,"msg":"request completed"}
{"level":30,"time":1793126505256,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":13.534143000004406,"msg":"request completed"}
{"level":30,"time":1793126505270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/tasks/6eecfef6-aea3-446b-9cca-0c28bc09503e/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":5.046834000000672,"msg":"request completed"}
{"level":30,"time":1793126505276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks/6eecfef6-aea3-446b-9cca-0c28bc09503e/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505297,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":21.445636999997078,"msg":"request completed"}
{"level":30,"time":1793126505299,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505302,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":3.7327340000047116,"msg":"request completed"}
{"level":30,"time":1793126505303,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/tasks/00cf0edb-4c0a-46e0-9499-9f7a0266cc93/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505303,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":400},"responseTime":0.6281519999974989,"msg":"request completed"}
{"level":30,"time":1793126505304,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505308,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":3.688109999995504,"msg":"request completed"}
{"level":30,"time":1793126505308,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/tasks/357a95f7-9c90-4d96-b544-4900bb1e094f/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505310,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":1.5444280000010622,"msg":"request completed"}
{"level":30,"time":1793126505310,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/tasks/357a95f7-9c90-4d96-b544-4900bb1e094f/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505325,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":14.628498999998556,"msg":"request completed"}
{"level":30,"time":1793126505325,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/tasks/357a95f7-9c90-4d96-b544-4900bb1e094f?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505326,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":0.5212979999996605,"msg":"request completed"}
{"level":30,"time":1793126505327,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"GET","url":"/tasks/357a95f7-9c90-4d96-b544-4900bb1e094f/reports?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":1.6567379999978584,"msg":"request completed"}
{"level":30,"time":1793126505329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"DELETE","url":"/tasks/357a95f7-9c90-4d96-b544-4900bb1e094f?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505331,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":1.1234370000020135,"msg":"request completed"}
{"level":30,"time":1793126505331,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505333,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":1.8409130000000005,"msg":"request completed"}
{"level":30,"time":1793126505333,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"PATCH","url":"/tasks/69883350-d13b-4f50-be20-a75c2029f066","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505335,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":1.3299110000007204,"msg":"request completed"}
{"level":30,"time":1793126505335,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/tasks/69883350-d13b-4f50-be20-a75c2029f066/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505335,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":409},"responseTime":0.42277699999976903,"msg":"request completed"}
{"level":30,"time":1793126505335,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"DELETE","url":"/tasks/69883350-d13b-4f50-be20-a75c2029f066?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505336,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":0.43589500000234693,"msg":"request completed"}
{"level":30,"time":1793126505336,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":12.15975299999991,"msg":"request completed"}
{"level":30,"time":1793126505349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"PATCH","url":"/tasks/5abf97f2-fbfc-452e-867b-edd4cc088c52","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":1.0524330000043847,"msg":"request completed"}
{"level":30,"time":1793126505350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/tasks/5abf97f2-fbfc-452e-867b-edd4cc088c52/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":409},"responseTime":0.39914300000236835,"msg":"request completed"}
{"level":30,"time":1793126505351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"DELETE","url":"/tasks/5abf97f2-fbfc-452e-867b-edd4cc088c52?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":0.3656090000004042,"msg":"request completed"}
{"level":30,"time":1793126505352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"POST","url":"/tasks/preview","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505364,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":12.746040999998513,"msg":"request completed"}
{"level":30,"time":1793126505365,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505368,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":2.44667599999957,"msg":"request completed"}
{"level":30,"time":1793126505369,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505371,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":1.9503790000017034,"msg":"request completed"}
{"level":30,"time":1793126505372,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"GET","url":"/session/tree?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505373,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":0.3698210000002291,"msg":"request completed"}
{"level":30,"time":1793126505373,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505383,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":10.152688000001945,"msg":"request completed"}
{"level":30,"time":1793126505384,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505386,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":1.1793019999968237,"msg":"request completed"}
{"level":30,"time":1793126505387,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505388,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":0.5640970000022207,"msg":"request completed"}
{"level":30,"time":1793126505388,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505389,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":400},"responseTime":0.5892249999960768,"msg":"request completed"}
{"level":30,"time":1793126505389,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505390,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":404},"responseTime":0.7961880000002566,"msg":"request completed"}
{"level":30,"time":1793126505391,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"POST","url":"/session/fork","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505401,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":400},"responseTime":10.235627000001841,"msg":"request completed"}
{"level":30,"time":1793126505401,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/session/fork","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505402,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":404},"responseTime":0.8698129999975208,"msg":"request completed"}
{"level":30,"time":1793126505403,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505404,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":200},"responseTime":0.509769000003871,"msg":"request completed"}
{"level":30,"time":1793126505404,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505405,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":501},"responseTime":0.6868390000017826,"msg":"request completed"}
{"level":30,"time":1793126505405,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505406,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":0.29282400000374764,"msg":"request completed"}
{"level":30,"time":1793126505406,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"POST","url":"/session/fork","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505406,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":501},"responseTime":0.316514999998617,"msg":"request completed"}
{"level":30,"time":1793126505407,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505407,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":200},"responseTime":0.3174330000038026,"msg":"request completed"}
{"level":30,"time":1793126505408,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505408,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":200},"responseTime":0.4134649999978137,"msg":"request completed"}
{"level":30,"time":1793126505408,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505409,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":200},"responseTime":0.28455599999870174,"msg":"request completed"}
{"level":30,"time":1793126505409,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"POST","url":"/session/navigate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505409,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":0.2549270000017714,"msg":"request completed"}
{"level":30,"time":1793126505411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505412,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":0.31674000000202795,"msg":"request completed"}
{"level":30,"time":1793126505412,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505413,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":200},"responseTime":0.42048200000135694,"msg":"request completed"}
{"level":30,"time":1793126505413,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/session/fork","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":200},"responseTime":0.447876999998698,"msg":"request completed"}
{"level":30,"time":1793126505414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"GET","url":"/session/status?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505415,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":0.47805499999958556,"msg":"request completed"}
{"level":30,"time":1793126505415,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"POST","url":"/session/restore","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505416,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":200},"responseTime":0.571390999997675,"msg":"request completed"}
{"level":30,"time":1793126505416,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505465,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":201},"responseTime":48.25441399999545,"msg":"request completed"}
{"level":30,"time":1793126505465,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"GET","url":"/session/history?projectId=8c8fa3fc-9648-4a97-a84b-6678363eef94","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505473,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":200},"responseTime":7.336113999997906,"msg":"request completed"}
{"level":30,"time":1793126505476,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"GET","url":"/session/tree?projectId=42f0de95-2722-47fb-83fb-c190a1725ba7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126505476,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":200},"responseTime":0.2265479999987292,"msg":"request completed"}
 [32m✓[39m routes/sessions.test.js [2m([22m[2m26 tests[22m[2m)[22m[33m 2120[2mms[22m[39m
   [32m✓[39m Session History & Enhanced Human Review [2m(24)[22m
     [33m[2m✓[22m[39m GET /session/history returns messages and tree for a project[33m 1207[2mms[22m[39m
{"level":30,"time":1793126506244,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506316,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":70.39106299999548,"msg":"request completed"}
{"level":30,"time":1793126506316,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506317,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":0.4261140000016894,"msg":"request completed"}
{"level":30,"time":1793126506318,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506371,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":201},"responseTime":52.964734000001044,"msg":"request completed"}
{"level":30,"time":1793126506375,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506414,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":1333.004350999996,"msg":"request completed"}
{"level":30,"time":1793126506437,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":201},"responseTime":61.12050399999862,"msg":"request completed"}
{"level":30,"time":1793126506438,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/projects/5648705e-fe9e-47e5-9854-63ff2f9372d8","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506440,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":1.5256079999962822,"msg":"request completed"}
{"level":30,"time":1793126506440,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506441,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":400},"responseTime":0.9259600000004866,"msg":"request completed"}
{"level":30,"time":1793126506442,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506443,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":400},"responseTime":0.4673250000050757,"msg":"request completed"}
{"level":30,"time":1793126506443,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506435,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/status/health","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506437,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.574321999993117,"msg":"request completed"}
{"level":30,"time":1793126506439,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/status/observability","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506444,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":2.732126999995671,"msg":"request completed"}
{"level":30,"time":1793126506516,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":201},"responseTime":72.9923559999952,"msg":"request completed"}
{"level":30,"time":1793126506517,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/projects/2412e464-8f63-4e11-ab41-b74bf62ee8d3","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506517,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":0.36463699999876553,"msg":"request completed"}
{"level":30,"time":1793126506518,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":201},"responseTime":59.58519100000558,"msg":"request completed"}
{"level":30,"time":1793126506580,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506581,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"err":{"type":"Error","message":"body/harness must be string","stack":"Error: body/harness must be string\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"/harness","schemaPath":"#/properties/harness/type","keyword":"type","params":{"type":"string"},"message":"must be string"}],"validationContext":"body"},"msg":"body/harness must be string"}
{"level":30,"time":1793126506583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"responseTime":2.7676339999961783,"msg":"request completed"}
{"level":30,"time":1793126506584,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506631,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":201},"responseTime":47.43139499999961,"msg":"request completed"}
{"level":30,"time":1793126506631,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"PATCH","url":"/projects/343e6fea-5225-4bc4-b6a0-11eb6ef15b88","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506657,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":25.446618000001763,"msg":"request completed"}
{"level":30,"time":1793126506657,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"GET","url":"/projects/343e6fea-5225-4bc4-b6a0-11eb6ef15b88","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506658,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":0.3041610000000219,"msg":"request completed"}
{"level":30,"time":1793126506658,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506707,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":201},"responseTime":48.91804499999853,"msg":"request completed"}
{"level":30,"time":1793126506708,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"PATCH","url":"/projects/b6922454-9cf7-431d-831f-f1e172d600f7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506708,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":400},"err":{"type":"Error","message":"body/harness must be string","stack":"Error: body/harness must be string\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"/harness","schemaPath":"#/properties/harness/type","keyword":"type","params":{"type":"string"},"message":"must be string"}],"validationContext":"body"},"msg":"body/harness must be string"}
{"level":30,"time":1793126506709,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":400},"responseTime":1.0250029999951948,"msg":"request completed"}
{"level":30,"time":1793126506709,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506760,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":201},"responseTime":50.57994300000428,"msg":"request completed"}
{"level":30,"time":1793126506761,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506807,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":201},"responseTime":46.44718300000386,"msg":"request completed"}
{"level":30,"time":1793126506808,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"PATCH","url":"/projects/65564dce-679b-4057-8923-5acce5ea12f7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506819,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":11.00959100000182,"msg":"request completed"}
{"level":30,"time":1793126506819,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/projects/65564dce-679b-4057-8923-5acce5ea12f7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506819,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":0.3344730000026175,"msg":"request completed"}
{"level":30,"time":1793126506819,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"PATCH","url":"/projects/65564dce-679b-4057-8923-5acce5ea12f7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506831,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":11.134742000002007,"msg":"request completed"}
{"level":30,"time":1793126506831,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/status.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 2177[2mms[22m[39m
   [32m✓[39m Status API Integration [2m(5)[22m
     [33m[2m✓[22m[39m should return 200 OK and valid status payload including global engine state and health checks[33m 1744[2mms[22m[39m
     [33m[2m✓[22m[39m browser cache bypass reads async task metrics while an explicit health refresh is deferred[33m 373[2mms[22m[39m
{"level":30,"time":1793126506876,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":201},"responseTime":44.07823199999984,"msg":"request completed"}
{"level":30,"time":1793126506876,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"PATCH","url":"/projects/e33d3318-4e57-4bdc-ab84-1a0169b649c2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506876,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":400},"err":{"type":"Error","message":"body/maxAutoIterations must be integer,null","stack":"Error: body/maxAutoIterations must be integer,null\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"/maxAutoIterations","schemaPath":"#/properties/maxAutoIterations/type","keyword":"type","params":{"type":["integer","null"]},"message":"must be integer,null"}],"validationContext":"body"},"msg":"body/maxAutoIterations must be integer,null"}
{"level":30,"time":1793126506877,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":400},"responseTime":0.5534409999963827,"msg":"request completed"}
{"level":30,"time":1793126506877,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506921,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":201},"responseTime":44.07221700000082,"msg":"request completed"}
{"level":30,"time":1793126506921,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"GET","url":"/projects/3c986de5-fe16-4264-94fd-6774a28d7cdc","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506922,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":0.2597009999954025,"msg":"request completed"}
{"level":30,"time":1793126506922,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506966,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":201},"responseTime":43.61206500000117,"msg":"request completed"}
{"level":30,"time":1793126506966,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"PATCH","url":"/projects/4a427ae9-34f3-452b-ab12-8a6f876c32f2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506977,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":10.972522999996727,"msg":"request completed"}
{"level":30,"time":1793126506978,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"PATCH","url":"/projects/4a427ae9-34f3-452b-ab12-8a6f876c32f2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126506988,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":10.636927999999898,"msg":"request completed"}
{"level":30,"time":1793126506989,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507032,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":201},"responseTime":42.865983000003325,"msg":"request completed"}
{"level":30,"time":1793126507032,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"PATCH","url":"/projects/5897fa3a-ed6c-4b76-b91d-7e664129ec7b","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":200},"responseTime":10.586610999998811,"msg":"request completed"}
{"level":30,"time":1793126507043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"PATCH","url":"/projects/5897fa3a-ed6c-4b76-b91d-7e664129ec7b","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507043,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":400},"err":{"type":"Error","message":"body/harnessCommand must be string","stack":"Error: body/harnessCommand must be string\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"/harnessCommand","schemaPath":"#/properties/harnessCommand/type","keyword":"type","params":{"type":"string"},"message":"must be string"}],"validationContext":"body"},"msg":"body/harnessCommand must be string"}
{"level":30,"time":1793126507044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":400},"responseTime":0.49049899999954505,"msg":"request completed"}
{"level":30,"time":1793126507044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507044,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":200},"responseTime":0.4536660000012489,"msg":"request completed"}
{"level":30,"time":1793126507045,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/projects/5897fa3a-ed6c-4b76-b91d-7e664129ec7b/activate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507045,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":200},"responseTime":0.26584799999545794,"msg":"request completed"}
{"level":30,"time":1793126507046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"GET","url":"/projects/non-existent-id","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":404},"responseTime":0.2327240000013262,"msg":"request completed"}
{"level":30,"time":1793126507046,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507047,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":0.3784060000034515,"msg":"request completed"}
{"level":30,"time":1793126507047,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"GET","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507047,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":0.19314000000304077,"msg":"request completed"}
{"level":30,"time":1793126507048,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507048,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":200},"responseTime":0.36659399999916786,"msg":"request completed"}
{"level":30,"time":1793126507048,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"PATCH","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507059,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":200},"responseTime":10.438468000000285,"msg":"request completed"}
{"level":30,"time":1793126507059,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"PATCH","url":"/projects/non-existent-id","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507060,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":404},"responseTime":0.4549410000036005,"msg":"request completed"}
{"level":30,"time":1793126507060,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507061,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":200},"responseTime":0.3822860000000219,"msg":"request completed"}
{"level":30,"time":1793126507061,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"GET","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507062,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":0.37734199999977136,"msg":"request completed"}
{"level":30,"time":1793126507062,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"PUT","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507074,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":12.32959899999696,"msg":"request completed"}
{"level":30,"time":1793126507075,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507075,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":200},"responseTime":0.4613469999967492,"msg":"request completed"}
{"level":30,"time":1793126507075,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507086,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":200},"responseTime":10.808246000000509,"msg":"request completed"}
{"level":30,"time":1793126507087,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507087,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":0.3753999999971711,"msg":"request completed"}
{"level":30,"time":1793126507088,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"POST","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507106,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":200},"responseTime":18.79880800000683,"msg":"request completed"}
{"level":30,"time":1793126507107,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"POST","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow/skip","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507117,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":200},"responseTime":10.529008000004978,"msg":"request completed"}
{"level":30,"time":1793126507118,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507118,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":200},"responseTime":0.33336099999723956,"msg":"request completed"}
{"level":30,"time":1793126507118,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"POST","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507119,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":404},"responseTime":0.26713399999425747,"msg":"request completed"}
{"level":30,"time":1793126507119,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507171,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","res":{"statusCode":201},"responseTime":51.82015700000193,"msg":"request completed"}
{"level":30,"time":1793126507171,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","req":{"method":"DELETE","url":"/projects/584fcebc-dfb8-4d6b-9d54-4ed450d28af6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507171,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","res":{"statusCode":200},"responseTime":0.5968229999998584,"msg":"request completed"}
{"level":30,"time":1793126507172,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","req":{"method":"GET","url":"/projects/584fcebc-dfb8-4d6b-9d54-4ed450d28af6","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507172,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","res":{"statusCode":404},"responseTime":0.14449799999420065,"msg":"request completed"}
{"level":30,"time":1793126507173,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507173,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","res":{"statusCode":200},"responseTime":0.537795999996888,"msg":"request completed"}
{"level":30,"time":1793126507174,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","req":{"method":"GET","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507174,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","res":{"statusCode":200},"responseTime":0.16960200000175973,"msg":"request completed"}
{"level":30,"time":1793126507174,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","req":{"method":"PUT","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507188,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","res":{"statusCode":200},"responseTime":14.254324000001361,"msg":"request completed"}
{"level":30,"time":1793126507190,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","req":{"method":"GET","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507190,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","res":{"statusCode":200},"responseTime":0.18962499999906868,"msg":"request completed"}
{"level":30,"time":1793126507190,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","req":{"method":"PUT","url":"/projects/b6779596-06fc-4437-8947-ab682f38f174/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507203,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","res":{"statusCode":200},"responseTime":12.32141799999954,"msg":"request completed"}
{"level":30,"time":1793126507203,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507264,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","res":{"statusCode":201},"responseTime":60.57296700000006,"msg":"request completed"}
{"level":30,"time":1793126507264,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","req":{"method":"GET","url":"/projects/fc0647af-9aad-451f-86ab-552ff81050ec/workflows","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507264,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","res":{"statusCode":200},"responseTime":0.2536949999994249,"msg":"request completed"}
{"level":30,"time":1793126507264,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","req":{"method":"POST","url":"/projects/fc0647af-9aad-451f-86ab-552ff81050ec/workflows","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","res":{"statusCode":201},"responseTime":11.58919700000115,"msg":"request completed"}
{"level":30,"time":1793126507276,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","req":{"method":"POST","url":"/projects/fc0647af-9aad-451f-86ab-552ff81050ec/workflows/wf-release-pipeline-d1671e/switch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507305,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","res":{"statusCode":200},"responseTime":28.504115000003367,"msg":"request completed"}
{"level":30,"time":1793126507305,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","req":{"method":"PATCH","url":"/projects/fc0647af-9aad-451f-86ab-552ff81050ec/workflows/wf-release-pipeline-d1671e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507317,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","res":{"statusCode":200},"responseTime":11.709800999997242,"msg":"request completed"}
{"level":30,"time":1793126507317,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","req":{"method":"DELETE","url":"/projects/fc0647af-9aad-451f-86ab-552ff81050ec/workflows/wf-release-pipeline-d1671e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","res":{"statusCode":200},"responseTime":11.302228000000468,"msg":"request completed"}
{"level":30,"time":1793126507329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507379,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","res":{"statusCode":201},"responseTime":49.82920999999624,"msg":"request completed"}
{"level":30,"time":1793126507379,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","req":{"method":"PATCH","url":"/projects/8ebf063b-db89-41f9-af4c-a1652361bfd5","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507381,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","res":{"statusCode":409},"responseTime":1.6719880000018748,"msg":"request completed"}
{"level":30,"time":1793126507383,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507437,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","res":{"statusCode":201},"responseTime":54.020785000000615,"msg":"request completed"}
{"level":30,"time":1793126507438,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507438,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","res":{"statusCode":200},"responseTime":0.19987199999741279,"msg":"request completed"}
{"level":30,"time":1793126507438,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflows","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507438,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","res":{"statusCode":200},"responseTime":0.11253800000122283,"msg":"request completed"}
{"level":30,"time":1793126507439,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507455,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","res":{"statusCode":200},"responseTime":15.833329000000958,"msg":"request completed"}
{"level":30,"time":1793126507455,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507455,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","res":{"statusCode":200},"responseTime":0.1810909999985597,"msg":"request completed"}
{"level":30,"time":1793126507455,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507457,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","res":{"statusCode":400},"responseTime":1.4170030000022962,"msg":"request completed"}
{"level":30,"time":1793126507458,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507460,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","res":{"statusCode":200},"responseTime":2.5094930000050226,"msg":"request completed"}
{"level":30,"time":1793126507461,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507462,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","res":{"statusCode":400},"responseTime":1.0831319999997504,"msg":"request completed"}
{"level":30,"time":1793126507464,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507464,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","res":{"statusCode":200},"responseTime":0.1985629999981029,"msg":"request completed"}
{"level":30,"time":1793126507465,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507483,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","res":{"statusCode":200},"responseTime":18.145220999998855,"msg":"request completed"}
{"level":30,"time":1793126507483,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507484,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","res":{"statusCode":200},"responseTime":0.20281799999793293,"msg":"request completed"}
{"level":30,"time":1793126507484,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507498,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","res":{"statusCode":200},"responseTime":14.067085000002407,"msg":"request completed"}
{"level":30,"time":1793126507499,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","req":{"method":"GET","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507499,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","res":{"statusCode":200},"responseTime":0.18675799999618903,"msg":"request completed"}
{"level":30,"time":1793126507499,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507511,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","res":{"statusCode":200},"responseTime":11.913413000002038,"msg":"request completed"}
{"level":30,"time":1793126507512,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","req":{"method":"PUT","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507512,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","res":{"statusCode":400},"responseTime":0.41581399999995483,"msg":"request completed"}
{"level":30,"time":1793126507513,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","req":{"method":"DELETE","url":"/projects/4d50ed39-5818-4a5e-a26f-0853ce612cf2","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507513,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","res":{"statusCode":200},"responseTime":0.13550499999837484,"msg":"request completed"}
{"level":30,"time":1793126507514,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507572,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","res":{"statusCode":201},"responseTime":57.46628100000089,"msg":"request completed"}
{"level":30,"time":1793126507572,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507651,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","res":{"statusCode":201},"responseTime":78.18064900000172,"msg":"request completed"}
{"level":30,"time":1793126507652,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","req":{"method":"GET","url":"/projects/c125bc75-e8f3-4d53-900e-968fe6a43f44/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507652,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","res":{"statusCode":200},"responseTime":0.19150500000250759,"msg":"request completed"}
{"level":30,"time":1793126507652,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","req":{"method":"GET","url":"/projects/e13b2954-d191-483b-9cd6-ce0b8133e6cc/workflows","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507653,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","res":{"statusCode":200},"responseTime":0.11291200000414392,"msg":"request completed"}
{"level":30,"time":1793126507653,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","req":{"method":"PUT","url":"/projects/c125bc75-e8f3-4d53-900e-968fe6a43f44/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","res":{"statusCode":200},"responseTime":21.16674900000362,"msg":"request completed"}
{"level":30,"time":1793126507682,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","req":{"method":"GET","url":"/projects/c125bc75-e8f3-4d53-900e-968fe6a43f44/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507682,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2f","res":{"statusCode":200},"responseTime":0.2670480000015232,"msg":"request completed"}
{"level":30,"time":1793126507683,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","req":{"method":"PUT","url":"/projects/c125bc75-e8f3-4d53-900e-968fe6a43f44/workflow","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m agent/harnesses/antigravity/agyHarness.acp.test.js [2m([22m[2m49 tests[22m[2m)[22m[33m 2006[2mms[22m[39m
   [32m✓[39m antigravity ACP session (mock agent) [2m(14)[22m
     [33m[2m✓[22m[39m aborts a slow turn: the child dies and the turn settles as aborted[33m 525[2mms[22m[39m
     [33m[2m✓[22m[39m times out a hung handshake instead of pinning session creation[33m 331[2mms[22m[39m
{"level":30,"time":1793126507686,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2g","res":{"statusCode":400},"responseTime":3.0546899999972084,"msg":"request completed"}
{"level":30,"time":1793126507688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","req":{"method":"DELETE","url":"/projects/c125bc75-e8f3-4d53-900e-968fe6a43f44","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2h","res":{"statusCode":200},"responseTime":0.18416199999774108,"msg":"request completed"}
{"level":30,"time":1793126507688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","req":{"method":"DELETE","url":"/projects/e13b2954-d191-483b-9cd6-ce0b8133e6cc","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126507688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2i","res":{"statusCode":200},"responseTime":0.09375500000169268,"msg":"request completed"}
 [32m✓[39m routes/projects.test.js [2m([22m[2m38 tests[22m[2m)[22m[33m 1818[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyHarness.contract.test.js [2m([22m[2m52 tests[22m[2m)[22m[33m 1937[2mms[22m[39m
 [32m✓[39m changelog.test.js [2m([22m[2m31 tests[22m[2m)[22m[33m 1699[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeHarness.contract.test.js [2m([22m[2m54 tests[22m[2m | [22m[33m1 skipped[39m[2m)[22m[33m 1780[2mms[22m[39m
   [32m✓[39m vibe harness lifecycle (mock vibe) [2m(10)[22m
     [33m[2m✓[22m[39m watchdog kills a hung run with a timeout run_error[33m 415[2mms[22m[39m
{"level":30,"time":1793126510751,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126510863,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":110.48762600000191,"msg":"request completed"}
{"level":30,"time":1793126510867,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/compute/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126510870,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.6949899999963236,"msg":"request completed"}
{"level":30,"time":1793126510870,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/compute/stop","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m agent/harnesses/custom/customHarness.contract.test.js [2m([22m[2m61 tests[22m[2m)[22m[33m 1527[2mms[22m[39m
   [32m✓[39m custom command execution [2m(12)[22m
     [33m[2m✓[22m[39m streams stdout INCREMENTALLY while the command is still running[33m 311[2mms[22m[39m
     [33m[2m✓[22m[39m ends a clean run with an exit-code line before run_finished[33m 314[2mms[22m[39m
     [33m[2m✓[22m[39m isStreaming is true only while the child process runs[33m 315[2mms[22m[39m
 [32m✓[39m flow/startupRecovery.integration.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 1233[2mms[22m[39m
   [32m✓[39m startup recovery resumes interrupted work [2m(2)[22m
     [33m[2m✓[22m[39m a kill -9 orphan (running_agent, hook never ran) resumes and runs once[33m 634[2mms[22m[39m
     [33m[2m✓[22m[39m a SIGTERM interruption resumes and runs once[33m 526[2mms[22m[39m
{"level":30,"time":1793126510877,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":7.045267000001331,"msg":"request completed"}
{"level":30,"time":1793126510878,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/compute/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126512148,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":1270.2325430000055,"msg":"request completed"}
 [32m✓[39m harnessResolution.api.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 1885[2mms[22m[39m
   [32m✓[39m per-project harness resolution (API smoke) [2m(1)[22m
     [33m[2m✓[22m[39m provisions a project with an unknown harness, warns on the process log wire, and still serves compute[33m 1420[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpSessionRuntime.test.js [2m([22m[2m15 tests[22m[2m)[22m[33m 1354[2mms[22m[39m
   [32m✓[39m AcpSessionRuntime lifecycle (mock ACP agent) [2m(15)[22m
     [33m[2m✓[22m[39m accepts the bare ACP_MOCK_* spellings (canonical env alias)[33m 313[2mms[22m[39m
     [33m[2m✓[22m[39m times out a hung handshake instead of pinning startup[33m 317[2mms[22m[39m
 [32m✓[39m config/boot.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 1661[2mms[22m[39m
   [32m✓[39m config boot behavior [2m(2)[22m
     [33m[2m✓[22m[39m fails fast with a clear diagnostic on KAINBAIN_AGENT_TIMEOUT_MS=invalid_number[33m 478[2mms[22m[39m
     [33m[2m✓[22m[39m boots cleanly on defaults with an isolated environment[33m 1180[2mms[22m[39m
 [32m✓[39m flow/commandStages.ciBranch.integration.test.js [2m([22m[2m6 tests[22m[2m)[22m[33m 1387[2mms[22m[39m
   [32m✓[39m runCommandStage ci run-on-branch (real git) [2m(6)[22m
     [33m[2m✓[22m[39m runs primary-mode CI on the default branch and restores it afterwards[33m 316[2mms[22m[39m
     [33m[2m✓[22m[39m runs custom-mode CI on the named branch and restores it afterwards[33m 452[2mms[22m[39m
[90mstderr[2m | sessionStore.harnessSelection.test.js[2m > [22m[2msessionStore harness selection (per project, via the registry)[2m > [22m[2mfalls back to the default harness for an unknown harness choice and still creates the session
[22m[39m[SYSTEM] Unknown harness "nonexistent-x-5" for project proj-4; falling back to "pi". Update the project's harness in Settings.

[90mstderr[2m | sessionStore.harnessSelection.test.js[2m > [22m[2msessionStore harness selection (per project, via the registry)[2m > [22m[2mcreates sessions consistently via the fallback harness when resolving repeatedly
[22m[39m[SYSTEM] Unknown harness "nonexistent-y-8" for project proj-7; falling back to "pi". Update the project's harness in Settings.

[90mstderr[2m | sessionStore.harnessSelection.test.js[2m > [22m[2msessionStore harness selection (per project, via the registry)[2m > [22m[2man unknown stage override degrades and runs on the project harness
[22m[39m[SYSTEM] Unknown harness "bogus-stage-x-24" for project proj-23; falling back to "fake-harness-22". Update the project's harness in Settings.

 [32m✓[39m sessionStore.harnessSelection.test.js [2m([22m[2m9 tests[22m[2m)[22m[33m 792[2mms[22m[39m
   [32m✓[39m sessionStore harness selection (per project, via the registry) [2m(9)[22m
     [33m[2m✓[22m[39m caches one model runtime per resolved harness (never shared across harnesses)[33m 774[2mms[22m[39m
{"level":30,"time":1793126514912,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126514992,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":78.03401299999678,"msg":"request completed"}
{"level":30,"time":1793126514994,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"PATCH","url":"/projects/9fc6a028-b6df-4a65-a34c-04adea305949/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515011,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":17.203991000002134,"msg":"request completed"}
{"level":30,"time":1793126515016,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/projects/9fc6a028-b6df-4a65-a34c-04adea305949","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515020,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":3.8613419999892358,"msg":"request completed"}
{"level":30,"time":1793126515022,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515069,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":201},"responseTime":46.951210000013816,"msg":"request completed"}
{"level":30,"time":1793126515069,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"PATCH","url":"/projects/365c3cff-4899-4cbe-acc8-24ef123884dd/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515080,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":10.85286100000667,"msg":"request completed"}
{"level":30,"time":1793126515081,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"PATCH","url":"/projects/365c3cff-4899-4cbe-acc8-24ef123884dd/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515092,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":11.620547999991686,"msg":"request completed"}
{"level":30,"time":1793126515093,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515135,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":201},"responseTime":41.92363100001239,"msg":"request completed"}
{"level":30,"time":1793126515135,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"PATCH","url":"/projects/a1476a1c-0e4a-44eb-a0ea-963a2ad54f9c/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515147,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":11.9699210000108,"msg":"request completed"}
{"level":30,"time":1793126515153,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"PATCH","url":"/projects/a1476a1c-0e4a-44eb-a0ea-963a2ad54f9c/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515164,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":11.09945599999628,"msg":"request completed"}
{"level":30,"time":1793126515165,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515206,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":201},"responseTime":40.78218999999808,"msg":"request completed"}
{"level":30,"time":1793126515206,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"PATCH","url":"/projects/fc3d8883-6b72-4f07-9053-7887c92ebaa3/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515207,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"responseTime":0.7834419999999227,"msg":"request completed"}
{"level":30,"time":1793126515207,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"PATCH","url":"/projects/fc3d8883-6b72-4f07-9053-7887c92ebaa3/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515208,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":400},"responseTime":0.3854529999953229,"msg":"request completed"}
{"level":30,"time":1793126515208,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"PATCH","url":"/projects/fc3d8883-6b72-4f07-9053-7887c92ebaa3/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515208,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":400},"responseTime":0.3743709999980638,"msg":"request completed"}
{"level":30,"time":1793126515209,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"PATCH","url":"/projects/does-not-exist/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515210,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":404},"responseTime":0.3258120000100462,"msg":"request completed"}
{"level":30,"time":1793126515210,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515252,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":201},"responseTime":41.69265300000552,"msg":"request completed"}
{"level":30,"time":1793126515252,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"GET","url":"/projects/b94045f1-a8b9-49be-9a44-d0edc81852c6/app-status/health","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515253,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":404},"responseTime":0.39960200000496116,"msg":"request completed"}
{"level":30,"time":1793126515260,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515301,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":201},"responseTime":40.73021599999629,"msg":"request completed"}
{"level":30,"time":1793126515301,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"PATCH","url":"/projects/a30d72ec-ceea-43ca-9b9d-1e15d1f6cc0f/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515312,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":10.449710000000778,"msg":"request completed"}
{"level":30,"time":1793126515312,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/projects/a30d72ec-ceea-43ca-9b9d-1e15d1f6cc0f/app-status/health","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":33.61863599999924,"msg":"request completed"}
{"level":30,"time":1793126515346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/projects/a30d72ec-ceea-43ca-9b9d-1e15d1f6cc0f","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":0.26054499999736436,"msg":"request completed"}
{"level":30,"time":1793126515350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515394,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":201},"responseTime":44.06103200001235,"msg":"request completed"}
{"level":30,"time":1793126515394,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"PATCH","url":"/projects/eba7f2c1-561b-40bb-8cc4-adbb35119458/app-status","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":16.60231799999019,"msg":"request completed"}
{"level":30,"time":1793126515411,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/projects/eba7f2c1-561b-40bb-8cc4-adbb35119458/app-status/health","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515430,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":19.565151000002516,"msg":"request completed"}
{"level":30,"time":1793126515431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"GET","url":"/projects/eba7f2c1-561b-40bb-8cc4-adbb35119458","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":0.2303609999944456,"msg":"request completed"}
 [32m✓[39m routes/projects.appStatus.test.js [2m([22m[2m8 tests[22m[2m)[22m[33m 865[2mms[22m[39m
{"level":30,"time":1793126515670,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515763,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":92.44330899999477,"msg":"request completed"}
{"level":30,"time":1793126515774,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515839,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":64.87411299999803,"msg":"request completed"}
{"level":30,"time":1793126515840,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515917,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":76.60279000000446,"msg":"request completed"}
{"level":30,"time":1793126515919,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126515986,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":66.94569899998896,"msg":"request completed"}
{"level":30,"time":1793126515987,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/compute/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126516004,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":17.16066700000374,"msg":"request completed"}
{"level":30,"time":1793126516005,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/compute/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126516016,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":11.291538000004948,"msg":"request completed"}
{"level":30,"time":1793126516022,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126516086,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":63.68627000000561,"msg":"request completed"}
{"level":30,"time":1793126516088,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126516153,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":64.88428600000043,"msg":"request completed"}
{"level":30,"time":1793126516155,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/compute/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126516216,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":61.4697249999881,"msg":"request completed"}
 [32m✓[39m routes/compute.models.test.js [2m([22m[2m10 tests[22m[2m)[22m[33m 1033[2mms[22m[39m
 [32m✓[39m flow/retryAfterRecovery.integration.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 1042[2mms[22m[39m
   [32m✓[39m retry recovers a lock-poisoned failed task [2m(1)[22m
     [33m[2m✓[22m[39m a failed task passes after retry clears the stale lock[33m 947[2mms[22m[39m
[90mstderr[2m | flow/stageExecution.attribution.test.js[2m > [22m[2mexecuteStage alias attribution[2m > [22m[2mleaves fallback runs unattributed when the alias does not resolve
[22m[39m[SYSTEM] Unknown model alias "ghost" for project P1 (p1); falling back to "pi". Update the alias in Settings › Model Aliases.

 [32m✓[39m flow/stageExecution.attribution.test.js [2m([22m[2m13 tests[22m[2m)[22m[33m 1024[2mms[22m[39m
 [32m✓[39m gitConcurrency.integration.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 952[2mms[22m[39m
   [32m✓[39m concurrent branch ops on one repo [2m(1)[22m
     [33m[2m✓[22m[39m task creation + approval-style branch work during a running stage: zero index.lock errors[33m 856[2mms[22m[39m
{"level":30,"time":1793126519362,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519429,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":65.97059400001308,"msg":"request completed"}
{"level":30,"time":1793126519431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519442,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":11.394310999996378,"msg":"request completed"}
{"level":30,"time":1793126519443,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519445,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":202},"responseTime":1.5548439999984112,"msg":"request completed"}
{"level":30,"time":1793126519446,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/runners/parity-runner/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519447,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":0.6899819999962347,"msg":"request completed"}
{"level":30,"time":1793126519448,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519449,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":1.1328360000043176,"msg":"request completed"}
{"level":30,"time":1793126519450,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/projects/18f460bc-0359-4e28-91f2-072cd8084d4d","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519451,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":1.2084019999892917,"msg":"request completed"}
{"level":30,"time":1793126519452,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13?projectId=18f460bc-0359-4e28-91f2-072cd8084d4d","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519452,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.66625500000373,"msg":"request completed"}
{"level":30,"time":1793126519453,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519455,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":2.1952429999946617,"msg":"request completed"}
{"level":30,"time":1793126519456,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519457,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":1.0133260000002338,"msg":"request completed"}
{"level":30,"time":1793126519503,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519504,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":0.8971829999936745,"msg":"request completed"}
{"level":30,"time":1793126519505,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519505,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519506,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/progress","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519507,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":2.2913409999891883,"msg":"request completed"}
{"level":30,"time":1793126519508,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519509,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":3.4148949999944307,"msg":"request completed"}
{"level":30,"time":1793126519509,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":3.352913000009721,"msg":"request completed"}
{"level":30,"time":1793126519521,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":13.0750340000086,"msg":"request completed"}
{"level":30,"time":1793126519521,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519522,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":0.503433000005316,"msg":"request completed"}
{"level":30,"time":1793126519522,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519523,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":0.7234210000024177,"msg":"request completed"}
{"level":30,"time":1793126519523,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519525,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":1.9151109999947948,"msg":"request completed"}
{"level":30,"time":1793126519525,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519536,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":10.379581999994116,"msg":"request completed"}
{"level":30,"time":1793126519536,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519537,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":0.4010629999975208,"msg":"request completed"}
{"level":30,"time":1793126519537,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519537,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":0.36709200000041164,"msg":"request completed"}
{"level":30,"time":1793126519538,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519538,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":0.5320150000043213,"msg":"request completed"}
{"level":30,"time":1793126519539,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519539,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":0.8622230000037234,"msg":"request completed"}
{"level":30,"time":1793126519540,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519550,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":9.977949000007357,"msg":"request completed"}
{"level":30,"time":1793126519550,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519551,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":1.3388229999982286,"msg":"request completed"}
{"level":30,"time":1793126519551,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":0.6117700000031618,"msg":"request completed"}
{"level":30,"time":1793126519552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519562,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":9.432808999990812,"msg":"request completed"}
{"level":30,"time":1793126519562,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519562,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":0.5786020000086864,"msg":"request completed"}
{"level":30,"time":1793126519563,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519563,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":0.5754349999915576,"msg":"request completed"}
{"level":30,"time":1793126519563,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":10.169323000009172,"msg":"request completed"}
{"level":30,"time":1793126519574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":200},"responseTime":0.29838399999425747,"msg":"request completed"}
{"level":30,"time":1793126519574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519574,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":0.2893190000031609,"msg":"request completed"}
{"level":30,"time":1793126519575,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519575,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":200},"responseTime":0.29800199999590404,"msg":"request completed"}
{"level":30,"time":1793126519575,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519576,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":200},"responseTime":0.7059690000023693,"msg":"request completed"}
{"level":30,"time":1793126519576,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519577,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":200},"responseTime":0.6538730000029318,"msg":"request completed"}
{"level":30,"time":1793126519577,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519577,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":0.33057299999927636,"msg":"request completed"}
{"level":30,"time":1793126519577,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":0.2415389999951003,"msg":"request completed"}
{"level":30,"time":1793126519578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":200},"responseTime":0.23301399999763817,"msg":"request completed"}
{"level":30,"time":1793126519578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519578,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":200},"responseTime":0.21815600000263657,"msg":"request completed"}
{"level":30,"time":1793126519579,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519579,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":200},"responseTime":0.2763590000104159,"msg":"request completed"}
{"level":30,"time":1793126519579,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519580,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":200},"responseTime":0.5295610000030138,"msg":"request completed"}
{"level":30,"time":1793126519580,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519580,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":0.3031139999948209,"msg":"request completed"}
{"level":30,"time":1793126519580,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519581,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":0.23664499999722466,"msg":"request completed"}
{"level":30,"time":1793126519581,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519581,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":200},"responseTime":0.27704799998900853,"msg":"request completed"}
{"level":30,"time":1793126519581,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":200},"responseTime":0.24347999999008607,"msg":"request completed"}
{"level":30,"time":1793126519582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":0.6422100000054343,"msg":"request completed"}
{"level":30,"time":1793126519583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":200},"responseTime":0.3444759999983944,"msg":"request completed"}
{"level":30,"time":1793126519583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":200},"responseTime":0.26239599999098573,"msg":"request completed"}
{"level":30,"time":1793126519584,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519585,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":200},"responseTime":0.28973400000541005,"msg":"request completed"}
{"level":30,"time":1793126519591,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519592,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":200},"responseTime":0.3165329999901587,"msg":"request completed"}
{"level":30,"time":1793126519592,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519593,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","res":{"statusCode":200},"responseTime":0.44939599999634083,"msg":"request completed"}
{"level":30,"time":1793126519593,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519593,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","res":{"statusCode":200},"responseTime":0.3016630000056466,"msg":"request completed"}
{"level":30,"time":1793126519593,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","res":{"statusCode":200},"responseTime":0.28206100000534207,"msg":"request completed"}
{"level":30,"time":1793126519594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","res":{"statusCode":200},"responseTime":0.36892900000384543,"msg":"request completed"}
{"level":30,"time":1793126519594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519595,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","res":{"statusCode":200},"responseTime":0.2925949999917066,"msg":"request completed"}
{"level":30,"time":1793126519595,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519595,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","res":{"statusCode":200},"responseTime":0.3464949999906821,"msg":"request completed"}
{"level":30,"time":1793126519595,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","res":{"statusCode":200},"responseTime":0.29124000000592787,"msg":"request completed"}
{"level":30,"time":1793126519596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","res":{"statusCode":200},"responseTime":0.42513899999903515,"msg":"request completed"}
{"level":30,"time":1793126519596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519597,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","res":{"statusCode":200},"responseTime":0.40567800001008436,"msg":"request completed"}
{"level":30,"time":1793126519597,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519597,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","res":{"statusCode":200},"responseTime":0.3872739999933401,"msg":"request completed"}
{"level":30,"time":1793126519598,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519598,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","res":{"statusCode":200},"responseTime":0.38051800000539515,"msg":"request completed"}
{"level":30,"time":1793126519598,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519599,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","res":{"statusCode":200},"responseTime":0.404913000005763,"msg":"request completed"}
{"level":30,"time":1793126519599,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519599,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","res":{"statusCode":200},"responseTime":0.453959999998915,"msg":"request completed"}
{"level":30,"time":1793126519599,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519600,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","res":{"statusCode":200},"responseTime":0.3605670000106329,"msg":"request completed"}
{"level":30,"time":1793126519600,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519600,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","res":{"statusCode":200},"responseTime":0.3020410000026459,"msg":"request completed"}
{"level":30,"time":1793126519600,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","res":{"statusCode":200},"responseTime":0.28445999999530613,"msg":"request completed"}
{"level":30,"time":1793126519601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","res":{"statusCode":200},"responseTime":0.33090099999390077,"msg":"request completed"}
{"level":30,"time":1793126519601,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519602,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","res":{"statusCode":200},"responseTime":0.2287990000040736,"msg":"request completed"}
{"level":30,"time":1793126519602,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519602,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","res":{"statusCode":200},"responseTime":0.25574600000982173,"msg":"request completed"}
{"level":30,"time":1793126519602,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519603,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","res":{"statusCode":200},"responseTime":1.0091390000015963,"msg":"request completed"}
{"level":30,"time":1793126519604,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519604,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","res":{"statusCode":200},"responseTime":0.44525800000701565,"msg":"request completed"}
{"level":30,"time":1793126519604,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519605,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","res":{"statusCode":200},"responseTime":0.3843009999982314,"msg":"request completed"}
{"level":30,"time":1793126519605,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519605,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","res":{"statusCode":200},"responseTime":0.250103999991552,"msg":"request completed"}
{"level":30,"time":1793126519605,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","res":{"statusCode":200},"responseTime":0.3735869999945862,"msg":"request completed"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","res":{"statusCode":200},"responseTime":0.2131960000115214,"msg":"request completed"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","res":{"statusCode":200},"responseTime":0.1971579999953974,"msg":"request completed"}
{"level":30,"time":1793126519606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","res":{"statusCode":200},"responseTime":0.2279290000005858,"msg":"request completed"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","res":{"statusCode":200},"responseTime":0.232743999993545,"msg":"request completed"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","res":{"statusCode":200},"responseTime":0.2221199999912642,"msg":"request completed"}
{"level":30,"time":1793126519607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519608,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","res":{"statusCode":200},"responseTime":0.3062709999940125,"msg":"request completed"}
{"level":30,"time":1793126519608,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519608,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","res":{"statusCode":200},"responseTime":0.3512659999978496,"msg":"request completed"}
{"level":30,"time":1793126519609,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519609,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","res":{"statusCode":200},"responseTime":0.3100529999937862,"msg":"request completed"}
{"level":30,"time":1793126519609,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519609,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","res":{"statusCode":200},"responseTime":0.34513800000422634,"msg":"request completed"}
{"level":30,"time":1793126519610,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519610,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","res":{"statusCode":200},"responseTime":0.302614000000176,"msg":"request completed"}
{"level":30,"time":1793126519610,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/logs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519611,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","res":{"statusCode":200},"responseTime":0.5081570000038482,"msg":"request completed"}
{"level":30,"time":1793126519611,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","req":{"method":"POST","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13/complete-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519620,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","res":{"statusCode":200},"responseTime":8.602264000001014,"msg":"request completed"}
{"level":30,"time":1793126519621,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","req":{"method":"GET","url":"/tasks/7e1f47b6-04ed-4710-bbdf-66ea03b75e13?projectId=18f460bc-0359-4e28-91f2-072cd8084d4d","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126519621,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2e","res":{"statusCode":200},"responseTime":0.7180030000017723,"msg":"request completed"}
 [32m✓[39m flow/daemonParity.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 839[2mms[22m[39m
   [32m✓[39m Runner Daemon Parity [2m(1)[22m
     [33m[2m✓[22m[39m completes a task over the wire with a mock harness[33m 402[2mms[22m[39m
 [32m✓[39m taskStore.test.js [2m([22m[2m158 tests[22m[2m)[22m[33m 1080[2mms[22m[39m
{"level":30,"time":1793126520279,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520361,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":80.70342900000105,"msg":"request completed"}
{"level":30,"time":1793126520368,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/projects/19f8a872-db96-4491-8fe2-3651736d0687","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520370,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":1.7982419999898411,"msg":"request completed"}
{"level":30,"time":1793126520372,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520430,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":201},"responseTime":58.527347000010195,"msg":"request completed"}
{"level":30,"time":1793126520431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/projects/541b4434-ce42-438a-a2bf-b0eb9dd1f147","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":0.3154860000067856,"msg":"request completed"}
{"level":30,"time":1793126520437,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520439,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":400},"responseTime":1.4567609999940032,"msg":"request completed"}
{"level":30,"time":1793126520441,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520493,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":201},"responseTime":52.364797000002,"msg":"request completed"}
{"level":30,"time":1793126520501,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | projectStore.kainbainDir.test.js[2m > [22m[2mProjectStore kainbainDirName[2m > [22m[2mupdateProject sets, clears, and validates the folder without moving state
[22m[39m[projectStore] state folder changed to '.kb'; removed the stale config '/tmp/kainbain-test-kbdir-projects-ndLIDH/rename-app/.kainbain/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-ndLIDH/rename-app/.kainbain' by hand, then restart.
[projectStore] state folder changed to '.kainbain'; removed the stale config '/tmp/kainbain-test-kbdir-projects-ndLIDH/rename-app/.kb/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-ndLIDH/rename-app/.kb' by hand, then restart.

{"level":30,"time":1793126520553,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":201},"responseTime":52.1082779999997,"msg":"request completed"}
{"level":30,"time":1793126520554,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126520612,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":201},"responseTime":57.99711899999238,"msg":"request completed"}
{"level":30,"time":1793126520618,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"PATCH","url":"/projects/ac523a03-b6d6-4a2f-ad41-aa3995ad3bfb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | projectStore.kainbainDir.test.js[2m > [22m[2mProjectStore kainbainDirName[2m > [22m[2msetting change survives a restart and clears the stale config
[22m[39m[projectStore] state folder changed to '.kb'; removed the stale config '/tmp/kainbain-test-kbdir-projects-DNGpPJ/survives-restart-app/.kainbain/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-DNGpPJ/survives-restart-app/.kainbain' by hand, then restart.
[projectStore] state folder changed to '.kainbain'; removed the stale config '/tmp/kainbain-test-kbdir-projects-DNGpPJ/survives-restart-app/.kb/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-DNGpPJ/survives-restart-app/.kb' by hand, then restart.

[90mstderr[2m | routes/projects.docsSettings.test.js[2m > [22m[2mdocs-folder settings survive save + reload[2m > [22m[2mpersists a PATCH rename to disk and migrates the link
[22m[39m[projectStore] recreated missing docs symlink for 'Rename Persist Docs App': '/tmp/kainbain-test-docs-settings-projects-gbggnc/rename-persist-docs-app/renamed-docs' -> '/tmp/kainbain-test-docs-settings-notes-kPjjnc/Rename Persist Docs App'

{"level":30,"time":1793126520639,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":20.82707099999243,"msg":"request completed"}
 [32m✓[39m routes/projects.docsSettings.test.js [2m([22m[2m6 tests[22m[2m)[22m[33m 737[2mms[22m[39m
[90mstderr[2m | projectStore.kainbainDir.test.js[2m > [22m[2mProjectStore kainbainDirName[2m > [22m[2mupdateProject rejects crossing the two folders onto each other's current name
[22m[39m[projectStore] state folder changed to '.kb2'; removed the stale config '/tmp/kainbain-test-kbdir-projects-FkKENO/swap-app/.kb/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-FkKENO/swap-app/.kb' by hand, then restart.
[projectStore] recreated missing docs symlink for 'Swap App': '/tmp/kainbain-test-kbdir-projects-FkKENO/swap-app/k-docs2' -> '/tmp/kainbain-test-kbdir-notes-LfJHNO/Swap App'

[90mstderr[2m | projectStore.kainbainDir.test.js[2m > [22m[2mProjectStore kainbainDirName[2m > [22m[2mstale-config cleanup never removes another project's config
[22m[39m[projectStore] state folder changed to '.kb3'; removed the stale config '/tmp/kainbain-test-kbdir-projects-fmgdBa/foreign-config-app/.kb2/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-projects-fmgdBa/foreign-config-app/.kb2' by hand, then restart.

[90mstderr[2m | projectStore.kainbainDir.test.js[2m > [22m[2mProjectStore kainbainDirName[2m > [22m[2mclearing docsDirName migrates the old link back to docs
[22m[39m[projectStore] recreated missing docs symlink for 'Docs Clear App': '/tmp/kainbain-test-kbdir-projects-KHhPfk/docs-clear-app/docs' -> '/tmp/kainbain-test-kbdir-notes-CBmcfk/Docs Clear App'

 [32m✓[39m projectStore.kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[33m 849[2mms[22m[39m
 [32m✓[39m sessionStore.test.js [2m([22m[2m27 tests[22m[2m)[22m[33m 1369[2mms[22m[39m
   [32m✓[39m SessionStore [2m(22)[22m
     [32m✓[39m readSessionHistoryFromDisk & getSessionHistory [2m(3)[22m
       [33m[2m✓[22m[39m reads messages and tree from disk without instantiating createSession or ModelRuntime[33m 1330[2mms[22m[39m
[90mstderr[2m | routes/retrospective.test.js[2m > [22m[2mPOST /retrospective/chat[2m > [22m[2mfalls back (never crashes) for an unknown harness name
[22m[39m[SYSTEM] Unknown harness "no-such-harness" for project Fixture (proj-1); falling back to "retrospective-fallback-mock". Update the project's harness in Settings.

{"level":30,"time":1793126522243,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522322,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":77.86911499999405,"msg":"request completed"}
{"level":30,"time":1793126522325,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/skills.import.test.js [2m([22m[2m24 tests[22m[2m)[22m[33m 739[2mms[22m[39m
{"level":30,"time":1793126522337,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":11.75551699999778,"msg":"request completed"}
{"level":30,"time":1793126522338,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/tasks?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522343,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":5.034029000002192,"msg":"request completed"}
{"level":30,"time":1793126522344,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":2.598429000005126,"msg":"request completed"}
{"level":30,"time":1793126522347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/tasks/5ba67cc9-6cd5-4591-854f-c9f3b00b014f?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522348,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":0.5171669999981532,"msg":"request completed"}
{"level":30,"time":1793126522348,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":2.3109669999976177,"msg":"request completed"}
{"level":30,"time":1793126522351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/tasks?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.6582289999932982,"msg":"request completed"}
{"level":30,"time":1793126522355,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/tasks/fb697bdd-5e74-4962-b8e2-eb255dc27d4b?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522355,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.33076500000606757,"msg":"request completed"}
{"level":30,"time":1793126522356,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522358,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":2.295854000010877,"msg":"request completed"}
{"level":30,"time":1793126522359,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"PATCH","url":"/tasks/65f2c15c-5f8e-47ab-be28-6dfbe569df5b","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522360,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":1.6413750000065193,"msg":"request completed"}
{"level":30,"time":1793126522361,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522363,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":2.274524000007659,"msg":"request completed"}
{"level":30,"time":1793126522364,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"PATCH","url":"/tasks/daea6d5d-916a-47d6-bb0c-307b043963c9","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522365,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":1.118415000004461,"msg":"request completed"}
{"level":30,"time":1793126522366,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522368,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":2.1090300000068964,"msg":"request completed"}
{"level":30,"time":1793126522368,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522370,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":1.9120850000035716,"msg":"request completed"}
{"level":30,"time":1793126522371,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/tasks/0f5f34dd-bb87-4bd0-bdae-97a4d3a5f88c/advance","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522376,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":5.491131000002497,"msg":"request completed"}
{"level":30,"time":1793126522377,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522379,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":1.837428999991971,"msg":"request completed"}
{"level":30,"time":1793126522379,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/tasks/e8837370-0fa0-4f4f-b515-705fc86ee2ba/failback","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522382,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":2.7553509999997914,"msg":"request completed"}
{"level":30,"time":1793126522382,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522398,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":15.046927999996115,"msg":"request completed"}
{"level":30,"time":1793126522398,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"POST","url":"/tasks/5da54025-19e9-4241-a997-893917fde40c/advance","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522413,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":14.96944600000279,"msg":"request completed"}
{"level":30,"time":1793126522413,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"POST","url":"/tasks/5da54025-19e9-4241-a997-893917fde40c/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522420,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":6.82238199999847,"msg":"request completed"}
{"level":30,"time":1793126522421,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522436,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":14.499888999998802,"msg":"request completed"}
{"level":30,"time":1793126522437,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/tasks/1451b6de-4fd9-4c25-a05c-56628632bb0c/report","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522439,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":2.3920360000047367,"msg":"request completed"}
{"level":30,"time":1793126522439,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/tasks/1451b6de-4fd9-4c25-a05c-56628632bb0c/reports?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522441,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":1.8002189999970142,"msg":"request completed"}
{"level":30,"time":1793126522442,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522445,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":2.432123999999021,"msg":"request completed"}
{"level":30,"time":1793126522445,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"POST","url":"/tasks/11d97020-f333-4f04-9a41-db9b2c7bc996/jump","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522447,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":1.8958949999941979,"msg":"request completed"}
{"level":30,"time":1793126522447,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522450,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":2.61560499999905,"msg":"request completed"}
{"level":30,"time":1793126522450,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"POST","url":"/tasks/68c8b5df-ecc2-40a7-ae28-c90fc949d515/complete","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522466,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":16.18228400000953,"msg":"request completed"}
{"level":30,"time":1793126522467,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522470,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":3.0861520000034943,"msg":"request completed"}
{"level":30,"time":1793126522470,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"POST","url":"/tasks/be7727a4-3579-4429-ad01-c14234b339bc/move","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522474,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":3.5094929999904707,"msg":"request completed"}
{"level":30,"time":1793126522474,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522494,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":200},"responseTime":19.094633999993675,"msg":"request completed"}
{"level":30,"time":1793126522494,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"DELETE","url":"/tasks/0aba675e-297e-408b-84c6-e31cddec817d","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":5.669759999989765,"msg":"request completed"}
{"level":30,"time":1793126522500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"GET","url":"/tasks/0aba675e-297e-408b-84c6-e31cddec817d?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522500,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":404},"responseTime":0.20819600000686478,"msg":"request completed"}
{"level":30,"time":1793126522501,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522506,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":200},"responseTime":4.958769000004395,"msg":"request completed"}
{"level":30,"time":1793126522506,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522521,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-y","res":{"statusCode":200},"responseTime":15.037475999997696,"msg":"request completed"}
{"level":30,"time":1793126522521,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522526,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-z","res":{"statusCode":200},"responseTime":4.512812000000849,"msg":"request completed"}
{"level":30,"time":1793126522526,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","req":{"method":"POST","url":"/tasks/f4f7d1f0-afdb-40ec-a230-5bf2c7a93973/execute","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-10","res":{"statusCode":200},"responseTime":25.921375000005355,"msg":"request completed"}
{"level":30,"time":1793126522553,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522565,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-11","res":{"statusCode":200},"responseTime":11.41667900000175,"msg":"request completed"}
{"level":30,"time":1793126522565,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522568,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-12","res":{"statusCode":200},"responseTime":2.757266000000527,"msg":"request completed"}
{"level":30,"time":1793126522568,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","req":{"method":"POST","url":"/tasks/bcc547cb-c681-48a5-b9a9-84f57c6bbe80/execute","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522569,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-13","res":{"statusCode":409},"responseTime":0.39496400000643916,"msg":"request completed"}
{"level":30,"time":1793126522569,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","req":{"method":"POST","url":"/tasks/does-not-exist/advance","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522579,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-14","res":{"statusCode":404},"responseTime":9.217646999997669,"msg":"request completed"}
{"level":30,"time":1793126522579,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-15","res":{"statusCode":200},"responseTime":2.5657070000015665,"msg":"request completed"}
{"level":30,"time":1793126522582,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","req":{"method":"POST","url":"/tasks/c835b6ca-bd7a-47b9-a4fc-e47f0b983f6b/complete","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-16","res":{"statusCode":200},"responseTime":1.245204000006197,"msg":"request completed"}
{"level":30,"time":1793126522583,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","req":{"method":"POST","url":"/tasks/c835b6ca-bd7a-47b9-a4fc-e47f0b983f6b/advance","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522593,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-17","res":{"statusCode":409},"responseTime":9.90918299999612,"msg":"request completed"}
{"level":30,"time":1793126522594,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-18","res":{"statusCode":200},"responseTime":2.1374959999957355,"msg":"request completed"}
{"level":30,"time":1793126522596,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","req":{"method":"POST","url":"/tasks/9d3cf3ae-e853-40c1-944b-2e23aea80acf/complete","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522597,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-19","res":{"statusCode":200},"responseTime":1.2264830000058282,"msg":"request completed"}
{"level":30,"time":1793126522598,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","req":{"method":"POST","url":"/tasks/9d3cf3ae-e853-40c1-944b-2e23aea80acf/reject","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522612,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1a","res":{"statusCode":409},"responseTime":14.391066999989562,"msg":"request completed"}
{"level":30,"time":1793126522613,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522615,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1b","res":{"statusCode":200},"responseTime":2.3782290000090143,"msg":"request completed"}
{"level":30,"time":1793126522615,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522619,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1c","res":{"statusCode":200},"responseTime":3.3066430000035325,"msg":"request completed"}
{"level":30,"time":1793126522619,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","req":{"method":"GET","url":"/tasks?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1&workflowId=wf-alpha-123","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522620,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1d","res":{"statusCode":200},"responseTime":0.516858000002685,"msg":"request completed"}
{"level":30,"time":1793126522621,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","req":{"method":"GET","url":"/tasks?projectId=93ce0681-d1c8-4b60-91ea-3a2b7b222fb1&workflowId=wf-beta-456","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522622,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1e","res":{"statusCode":200},"responseTime":0.26496299999416806,"msg":"request completed"}
{"level":30,"time":1793126522622,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522633,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1f","res":{"statusCode":200},"responseTime":10.826991000009002,"msg":"request completed"}
{"level":30,"time":1793126522633,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","req":{"method":"POST","url":"/tasks/dba12b82-cb6a-4164-aa78-22941befce9d/advance","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522635,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1g","res":{"statusCode":200},"responseTime":2.121119000003091,"msg":"request completed"}
{"level":30,"time":1793126522636,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1h","res":{"statusCode":200},"responseTime":1.5318550000083633,"msg":"request completed"}
{"level":30,"time":1793126522638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","req":{"method":"POST","url":"/tasks/89318114-bd0a-4466-a676-319cde121138/follow-up","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522647,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1i","res":{"statusCode":200},"responseTime":8.735507999997935,"msg":"request completed"}
{"level":30,"time":1793126522647,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522649,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1j","res":{"statusCode":200},"responseTime":1.6946100000059232,"msg":"request completed"}
{"level":30,"time":1793126522649,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","req":{"method":"POST","url":"/tasks/6a054d4d-4d7f-48f3-ab9a-17a8aaa37380/steer","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522660,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1k","res":{"statusCode":200},"responseTime":11.195426999998745,"msg":"request completed"}
{"level":30,"time":1793126522661,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522663,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1l","res":{"statusCode":200},"responseTime":1.9489480000047479,"msg":"request completed"}
{"level":30,"time":1793126522664,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","req":{"method":"POST","url":"/tasks/fb05d4fe-ee4e-4a07-b544-e0a2f3491d42/pause","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522665,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1m","res":{"statusCode":200},"responseTime":1.3243450000009034,"msg":"request completed"}
{"level":30,"time":1793126522665,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","req":{"method":"POST","url":"/tasks/fb05d4fe-ee4e-4a07-b544-e0a2f3491d42/resume","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522692,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1n","res":{"statusCode":200},"responseTime":27.087314999997034,"msg":"request completed"}
{"level":30,"time":1793126522693,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522695,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1o","res":{"statusCode":200},"responseTime":2.012394999997923,"msg":"request completed"}
{"level":30,"time":1793126522696,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","req":{"method":"POST","url":"/tasks/f6807463-d3cb-4ffd-95a3-1b8b0c698f85/retry","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522715,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1p","res":{"statusCode":200},"responseTime":19.630573000002187,"msg":"request completed"}
{"level":30,"time":1793126522716,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522718,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1q","res":{"statusCode":200},"responseTime":1.9630150000011781,"msg":"request completed"}
{"level":30,"time":1793126522718,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","req":{"method":"POST","url":"/tasks/35e28c63-219d-42b5-91d2-8abe646eddb5/retry","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522726,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1r","res":{"statusCode":200},"responseTime":7.9189990000013495,"msg":"request completed"}
{"level":30,"time":1793126522727,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522739,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1s","res":{"statusCode":200},"responseTime":12.257924999998068,"msg":"request completed"}
{"level":30,"time":1793126522740,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","req":{"method":"POST","url":"/tasks/6c38c03f-b7c0-486b-b345-9ace87c18b94/abort","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522741,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1t","res":{"statusCode":200},"responseTime":1.5530579999904148,"msg":"request completed"}
{"level":30,"time":1793126522742,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","req":{"method":"GET","url":"/tasks?projectId=1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522742,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1u","res":{"statusCode":404},"responseTime":0.1613729999953648,"msg":"request completed"}
{"level":30,"time":1793126522742,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","req":{"method":"GET","url":"/tasks?projectId=stage-idea","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522742,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1v","res":{"statusCode":404},"responseTime":0.12159399999654852,"msg":"request completed"}
{"level":30,"time":1793126522743,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","req":{"method":"GET","url":"/tasks?projectId=wf-default","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522743,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1w","res":{"statusCode":404},"responseTime":0.11576199998671655,"msg":"request completed"}
{"level":30,"time":1793126522743,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","req":{"method":"GET","url":"/tasks?projectId=00000000-0000-0000-0000-000000000000","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522743,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1x","res":{"statusCode":404},"responseTime":0.1291439999913564,"msg":"request completed"}
{"level":30,"time":1793126522743,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","req":{"method":"GET","url":"/tasks/queue?projectId=wf-default","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522744,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1y","res":{"statusCode":404},"responseTime":0.27141800000390504,"msg":"request completed"}
{"level":30,"time":1793126522744,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522745,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1z","res":{"statusCode":400},"responseTime":0.6617649999971036,"msg":"request completed"}
{"level":30,"time":1793126522745,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522757,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-20","res":{"statusCode":404},"responseTime":11.577197000005981,"msg":"request completed"}
{"level":30,"time":1793126522757,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","req":{"method":"GET","url":"/tasks/any-task-id?projectId=stage-1","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522757,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-21","res":{"statusCode":404},"responseTime":0.10660700000880752,"msg":"request completed"}
{"level":30,"time":1793126522760,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/retrospective.test.js [2m([22m[2m51 tests[22m[2m)[22m[33m 987[2mms[22m[39m
{"level":30,"time":1793126522806,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-22","res":{"statusCode":201},"responseTime":46.345900000000256,"msg":"request completed"}
{"level":30,"time":1793126522807,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522809,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-23","res":{"statusCode":200},"responseTime":2.102602000013576,"msg":"request completed"}
{"level":30,"time":1793126522809,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","req":{"method":"GET","url":"/tasks/d6ddc14a-d8a9-46b7-b718-b1050c441a4b/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&feed=thinking","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522810,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-24","res":{"statusCode":200},"responseTime":0.8671230000036303,"msg":"request completed"}
{"level":30,"time":1793126522811,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","req":{"method":"GET","url":"/tasks/d6ddc14a-d8a9-46b7-b718-b1050c441a4b/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&feed=tools","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522811,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-25","res":{"statusCode":200},"responseTime":0.17607099999440834,"msg":"request completed"}
{"level":30,"time":1793126522814,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522825,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-26","res":{"statusCode":200},"responseTime":11.477532999997493,"msg":"request completed"}
{"level":30,"time":1793126522826,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","req":{"method":"GET","url":"/tasks/d6ddc14a-d8a9-46b7-b718-b1050c441a4b/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&feed=tools&format=text","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522826,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-27","res":{"statusCode":200},"responseTime":0.4522809999907622,"msg":"request completed"}
{"level":30,"time":1793126522827,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522828,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-28","res":{"statusCode":200},"responseTime":1.439433999999892,"msg":"request completed"}
{"level":30,"time":1793126522828,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","req":{"method":"GET","url":"/tasks/d6ddc14a-d8a9-46b7-b718-b1050c441a4b/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&feed=nope","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-29","res":{"statusCode":400},"responseTime":0.13025699999707285,"msg":"request completed"}
{"level":30,"time":1793126522829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","req":{"method":"GET","url":"/tasks/d6ddc14a-d8a9-46b7-b718-b1050c441a4b/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&format=yaml","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2a","res":{"statusCode":400},"responseTime":0.12045800000487361,"msg":"request completed"}
{"level":30,"time":1793126522829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","req":{"method":"GET","url":"/tasks/does-not-exist/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2b","res":{"statusCode":404},"responseTime":0.1481190000049537,"msg":"request completed"}
{"level":30,"time":1793126522830,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522842,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2c","res":{"statusCode":200},"responseTime":12.378469999996014,"msg":"request completed"}
{"level":30,"time":1793126522842,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","req":{"method":"GET","url":"/tasks/ac1e9db3-8632-45e8-92aa-f9d3f7a06f22/logs?projectId=fe655db8-510e-4aa6-b43d-558a67ab76e4&feed=tools","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126522843,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2d","res":{"statusCode":200},"responseTime":0.3383509999985108,"msg":"request completed"}
 [32m✓[39m routes/tasks.test.js [2m([22m[2m37 tests[22m[2m)[22m[33m 959[2mms[22m[39m
 [32m✓[39m gitStaleLock.integration.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 613[2mms[22m[39m
{"level":30,"time":1793126524066,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524138,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":71.05423899999005,"msg":"request completed"}
{"level":30,"time":1793126524139,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"PATCH","url":"/projects/15a32331-08a6-46c6-b8c4-a283fd10f05e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524142,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":400},"responseTime":3.177603000003728,"msg":"request completed"}
{"level":30,"time":1793126524144,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524180,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":201},"responseTime":36.25621799999499,"msg":"request completed"}
{"level":30,"time":1793126524181,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"PATCH","url":"/projects/a3f2ed40-83e6-41e0-b29e-ab64513ad536","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524184,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":400},"responseTime":2.655801999993855,"msg":"request completed"}
{"level":30,"time":1793126524185,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524217,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":201},"responseTime":32.51951800000097,"msg":"request completed"}
{"level":30,"time":1793126524218,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"PATCH","url":"/projects/3cd44245-8649-48bf-8709-61607e4ae051","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524233,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":15.825043999997433,"msg":"request completed"}
{"level":30,"time":1793126524235,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":201},"responseTime":34.87912399999914,"msg":"request completed"}
{"level":30,"time":1793126524270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"PATCH","url":"/projects/5e47828c-1190-4c70-963c-71ad7c95a569","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524285,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":14.205612999998266,"msg":"request completed"}
{"level":30,"time":1793126524288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524334,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":201},"responseTime":45.632800999999745,"msg":"request completed"}
{"level":30,"time":1793126524334,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"PATCH","url":"/projects/eb2effba-aa50-43c0-87f8-e56c1aadae3e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524336,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":400},"responseTime":1.2389140000013867,"msg":"request completed"}
{"level":30,"time":1793126524336,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524371,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":201},"responseTime":35.118694000004325,"msg":"request completed"}
{"level":30,"time":1793126524372,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"PATCH","url":"/projects/404ea3d7-e5a6-4dea-a1db-878d681af089","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524383,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":11.671707000001334,"msg":"request completed"}
{"level":30,"time":1793126524384,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524418,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":201},"responseTime":33.985436000002665,"msg":"request completed"}
{"level":30,"time":1793126524419,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"PATCH","url":"/projects/3662803c-a6e2-493c-81fa-afdcd9b9d00e","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524431,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":12.831603999991785,"msg":"request completed"}
 [32m✓[39m routes/projects.modelCombination.test.js [2m([22m[2m7 tests[22m[2m)[22m[33m 651[2mms[22m[39m
   [32m✓[39m Project harness+model combination API [2m(7)[22m
     [33m[2m✓[22m[39m refuses an alias target on an unknown harness with a 400[33m 357[2mms[22m[39m
{"level":30,"time":1793126524614,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524706,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":90.76654500000586,"msg":"request completed"}
{"level":30,"time":1793126524710,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524722,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":11.595453000001726,"msg":"request completed"}
{"level":30,"time":1793126524723,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/tasks/e1adbe72-6c8b-4200-83e4-16729deed31c/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524729,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":5.59645399999863,"msg":"request completed"}
{"level":30,"time":1793126524734,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/tasks/does-not-exist/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524734,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":404},"responseTime":0.5611529999878258,"msg":"request completed"}
{"level":30,"time":1793126524735,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524738,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":2.651683000003686,"msg":"request completed"}
{"level":30,"time":1793126524738,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks/13da95b7-c73f-4846-9537-f005935eaddd/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":50,"time":1793126524739,"pid":11011,"hostname":"9a57735be6d4","err":{"type":"Error","message":"Model 'ollama-cloud::nope' could not be resolved for the stuck check. Pick a model from the list.","stack":"Error: Model 'ollama-cloud::nope' could not be resolved for the stuck check. Pick a model from the list.\n    at Object.checkStuck (/home/server/projects/kainbain/api/stuckCheck.js:398:18)\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/watch/taskWatchRoutes.js:85:19)","statusCode":400},"msg":"Task stuck check failed"}
{"level":30,"time":1793126524749,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":400},"responseTime":10.485090000001946,"msg":"request completed"}
{"level":30,"time":1793126524749,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/tasks/whatever/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524750,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":404},"responseTime":0.805330999995931,"msg":"request completed"}
{"level":30,"time":1793126524751,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524755,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":3.4515300000057323,"msg":"request completed"}
{"level":30,"time":1793126524756,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks/28141df2-d069-48e8-a540-c41a38dfef7b/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":50,"time":1793126524757,"pid":11011,"hostname":"9a57735be6d4","err":{"type":"Error","message":"Stuck check failed: provider exploded","stack":"Error: Stuck check failed: provider exploded\n    at Object.checkStuck (/home/server/projects/kainbain/api/stuckCheck.js:438:17)\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/watch/taskWatchRoutes.js:85:19)","statusCode":502},"msg":"Task stuck check failed"}
{"level":30,"time":1793126524757,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":502},"responseTime":1.4974329999968177,"msg":"request completed"}
{"level":30,"time":1793126524758,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524769,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":11.124767000001157,"msg":"request completed"}
{"level":30,"time":1793126524770,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/tasks/c787dd92-150e-44fd-b860-99227623354e/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524773,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":2.63865400000941,"msg":"request completed"}
{"level":30,"time":1793126524773,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524776,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":2.7227470000070753,"msg":"request completed"}
{"level":30,"time":1793126524776,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/tasks/30889995-828d-42ea-b8f5-b54249673adc/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":50,"time":1793126524778,"pid":11011,"hostname":"9a57735be6d4","err":{"type":"Error","message":"Unknown harness 'no-such-harness' for the stuck check. Available: antigravity, codex, custom, mock, muse, opencode, pi, vibe.","stack":"Error: Unknown harness 'no-such-harness' for the stuck check. Available: antigravity, codex, custom, mock, muse, opencode, pi, vibe.\n    at Object.checkStuck (/home/server/projects/kainbain/api/stuckCheck.js:352:17)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/watch/taskWatchRoutes.js:85:38)\n    at routeOptions.handler (/home/server/projects/kainbain/api/node_modules/@fastify/websocket/index.js:223:24)\n    at preHandlerCallbackInner (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:190:24)\n    at preHandlerCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:155:5)\n    at validationCompleted (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:145:5)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:122:5)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)","statusCode":400},"msg":"Task stuck check failed"}
{"level":30,"time":1793126524779,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":400},"responseTime":2.9174459999921964,"msg":"request completed"}
{"level":30,"time":1793126524780,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126524784,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":3.782003000000259,"msg":"request completed"}
{"level":30,"time":1793126524785,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/tasks/80bf70df-5662-4a7b-be62-e31434a036b7/stuck-check","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":50,"time":1793126524786,"pid":11011,"hostname":"9a57735be6d4","err":{"type":"Error","message":"Harness 'custom' does not support the stuck check (no diagnosis session).","stack":"Error: Harness 'custom' does not support the stuck check (no diagnosis session).\n    at Object.checkStuck (/home/server/projects/kainbain/api/stuckCheck.js:372:17)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/watch/taskWatchRoutes.js:85:38)\n    at routeOptions.handler (/home/server/projects/kainbain/api/node_modules/@fastify/websocket/index.js:223:24)\n    at preHandlerCallbackInner (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:190:24)\n    at preHandlerCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:155:5)\n    at validationCompleted (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:145:5)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:122:5)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)","statusCode":503},"msg":"Task stuck check failed"}
{"level":30,"time":1793126524786,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":503},"responseTime":1.240300000004936,"msg":"request completed"}
 [32m✓[39m routes/tasks.stuckCheck.test.js [2m([22m[2m8 tests[22m[2m)[22m[33m 780[2mms[22m[39m
[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog (TTL cache + resolution)[2m > [22m[2mdegrades to an empty list when discovery fails
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_FAILED]: 'agy models' failed (agy not installed). Run `agy models` in a terminal to see the full error, then retry.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog (TTL cache + resolution)[2m > [22m[2mrecords an AGY_BIN_MISSING discovery error with a PATH hint on ENOENT
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy models discovery spawn watchdog[2m > [22m[2mbounds a hung `agy models` spawn: kills the child and degrades to empty list
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_TIMEOUT]: 'agy models' timed out ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs models' timed out after 150ms). The CLI may be hanging — check the network and the CLI install, then retry (Settings › Harness › Refresh).

{"level":30,"time":1793126525318,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/harnesses","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525325,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":6.671347000010428,"msg":"request completed"}
{"level":30,"time":1793126525329,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/harnesses","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525331,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.6363520000013523,"msg":"request completed"}
{"level":30,"time":1793126525340,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/harnesses","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525341,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":0.8992700000089826,"msg":"request completed"}
{"level":30,"time":1793126525341,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/harnesses","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525342,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":0.36508399999001995,"msg":"request completed"}
{"level":30,"time":1793126525342,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/harnesses?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525345,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":2.906716999990749,"msg":"request completed"}
{"level":30,"time":1793126525346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/harnesses/pi/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":2.2567500000004657,"msg":"request completed"}
{"level":30,"time":1793126525350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/harnesses/no-such-harness/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":404},"responseTime":0.33821200000238605,"msg":"request completed"}
{"level":30,"time":1793126525351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/harnesses/pi/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.38829799999075476,"msg":"request completed"}
{"level":30,"time":1793126525351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/harnesses/pi/models","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":0.284364999999525,"msg":"request completed"}
{"level":30,"time":1793126525352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"GET","url":"/harnesses/pi/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525353,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":0.5280979999952251,"msg":"request completed"}
{"level":30,"time":1793126525354,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"GET","url":"/harnesses/pi/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525354,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":0.39047800000116695,"msg":"request completed"}
{"level":30,"time":1793126525355,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/harnesses/custom/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525355,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":0.2370610000070883,"msg":"request completed"}
{"level":30,"time":1793126525356,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"GET","url":"/harnesses/antigravity/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy models discovery spawn watchdog[2m > [22m[2mbounds a hung `agy models` spawn: kills the child and degrades to empty list
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_TIMEOUT]: 'agy models' timed out ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs models' timed out after 150ms). The CLI may be hanging — check the network and the CLI install, then retry (Settings › Harness › Refresh).

{"level":30,"time":1793126525424,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":68.05838099999528,"msg":"request completed"}
[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mretains the last discovery error and reports it via getModelDiscoveryStatus
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/definitely/not/a/real/agy-binary' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mreports ok before any load and after a successful load clears a prior error
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mclassifies auth failures as AGY_MODELS_AUTH
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_AUTH]: 'agy models' reported an authentication problem ('agy models' exited with code 1: error: authentication required. Run `agy auth login` first.). Run `agy auth login` in a terminal, then retry (Settings › Harness › Refresh).

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mclassifies other non-zero exits as AGY_MODELS_FAILED
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_FAILED]: 'agy models' failed ('agy models' exited with code 1: mock-agy: simulated models failure). Run `agy models` in a terminal to see the full error, then retry.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mclassifies exit-0 output with zero recognizable slugs as AGY_MODELS_UNPARSEABLE
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_UNPARSEABLE]: 'agy models' returned no recognizable models (output started with: "Available models:\n\nComing soon in this region\nPlease try again later"). The CLI output format may have changed — run `agy models` in a terminal and paste the output in a bug report.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mclassifies exit-0 empty output as AGY_MODELS_UNPARSEABLE
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_UNPARSEABLE]: 'agy models' returned no recognizable models (empty output). The CLI output format may have changed — run `agy models` in a terminal and paste the output in a bug report.

[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2msurfaces a discovery failure as a non-ok status carrying the error
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_FAILED]: 'agy models' failed ('agy models' exited with code 1: boom). Run `agy models` in a terminal to see the full error, then retry.

{"level":30,"time":1793126525425,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"GET","url":"/harnesses/pi/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525425,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":0.3306319999974221,"msg":"request completed"}
{"level":30,"time":1793126525426,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/harnesses/reliability","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525427,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":0.5571729999937816,"msg":"request completed"}
{"level":30,"time":1793126525505,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"GET","url":"/harnesses/antigravity/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525561,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":55.637596000000485,"msg":"request completed"}
{"level":30,"time":1793126525562,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"GET","url":"/harnesses/opencode/models?refresh=true","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525565,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":3.0464130000036675,"msg":"request completed"}
 [32m✓[39m routes/harnesses.test.js [2m([22m[2m15 tests[22m[2m)[22m[33m 611[2mms[22m[39m
[90mstderr[2m | agent/harnesses/antigravity/agyModelCatalog.test.js[2m > [22m[2magy model catalog discovery status[2m > [22m[2mclassifies a hung spawn as AGY_MODELS_TIMEOUT through the watchdog
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_TIMEOUT]: 'agy models' timed out ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs models' timed out after 150ms). The CLI may be hanging — check the network and the CLI install, then retry (Settings › Harness › Refresh).

 [32m✓[39m agent/harnesses/antigravity/agyModelCatalog.test.js [2m([22m[2m31 tests[22m[2m)[22m[33m 610[2mms[22m[39m
   [32m✓[39m agy models discovery spawn watchdog [2m(2)[22m
     [33m[2m✓[22m[39m bounds a hung `agy models` spawn: kills the child and degrades to empty list[33m 333[2mms[22m[39m
{"level":30,"time":1793126525841,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525846,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":4.501378000000841,"msg":"request completed"}
{"level":30,"time":1793126525846,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525908,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":201},"responseTime":61.431406000003335,"msg":"request completed"}
{"level":30,"time":1793126525911,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/ws?projectId=eca5612b-308a-436b-a227-381c427b2498","host":""},"msg":"incoming request"}
{"level":30,"time":1793126525918,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525919,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":0.3291680000111228,"msg":"request completed"}
{"level":30,"time":1793126525921,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/ws?projectId=eca5612b-308a-436b-a227-381c427b2498","host":""},"msg":"incoming request"}
{"level":30,"time":1793126525934,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525934,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":0.28078000000095926,"msg":"request completed"}
{"level":30,"time":1793126525935,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/ws?projectId=eca5612b-308a-436b-a227-381c427b2498","host":""},"msg":"incoming request"}
{"level":30,"time":1793126525947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126525948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.300134999997681,"msg":"request completed"}
{"level":30,"time":1793126525949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/ws?projectId=eca5612b-308a-436b-a227-381c427b2498","host":""},"msg":"incoming request"}
 [32m✓[39m routes/ws.test.js [2m([22m[2m4 tests[22m[2m)[22m[33m 513[2mms[22m[39m
[90mstderr[2m | projectStore.alias.test.js[2m > [22m[2mProjectStore model aliases[2m > [22m[2mH4: loading a legacy none-harness + model target blanks the model
[22m[39m[projectStore] Alias "worker" in /tmp/kainbain-test-alias-projects-lKJjMF/legacy-none-alias targets harness "muse", which manages its own model — ignoring the stored model "antigravity::google::gemini-legacy". Clear the model in Settings › Model Aliases.

 [32m✓[39m projectStore.alias.test.js [2m([22m[2m15 tests[22m[2m)[22m[33m 433[2mms[22m[39m
[90mstderr[2m | agent/harnesses/antigravity/agyHarness.integration.test.js[2m > [22m[2mantigravity harness — discovery failure surfacing[2m > [22m[2mroutes discovery failures to the event bridge (the catalog log is wired)
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/definitely/not/a/real/agy-binary' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

[90mstderr[2m | agent/harnesses/antigravity/agyHarness.integration.test.js[2m > [22m[2mantigravity harness — discovery failure surfacing[2m > [22m[2mreports discovery health behind getModelDiscoveryStatus (harness + session)
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/definitely/not/a/real/agy-binary' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

[90mstderr[2m | agent/harnesses/antigravity/agyHarness.integration.test.js[2m > [22m[2mantigravity harness — discovery failure surfacing[2m > [22m[2mre-runs discovery past the TTL cache on { refresh: true }
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_FAILED]: 'agy models' failed ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs models' exited with code 1: mock-agy: simulated models failure). Run `agy models` in a terminal to see the full error, then retry.

[90mstderr[2m | agent/harnesses/antigravity/agyHarness.integration.test.js[2m > [22m[2mantigravity harness — discovery failure surfacing[2m > [22m[2mforwards listModels opts from the session so a session refresh re-discovers
[22m[39m[WARN] antigravity model discovery failed [AGY_MODELS_FAILED]: 'agy models' failed ('/home/server/projects/kainbain/api/agent/harnesses/antigravity/fixtures/mock-agy.mjs models' exited with code 1: mock-agy: simulated models failure). Run `agy models` in a terminal to see the full error, then retry.

[90mstderr[2m | agent/harnesses/antigravity/agyHarness.integration.test.js[2m > [22m[2mantigravity harness — discovery failure surfacing[2m > [22m[2mnames the discovery failure when the project default model cannot resolve
[22m[39m[WARN] antigravity model discovery failed [AGY_BIN_MISSING]: The agy CLI was not found ('/definitely/not/a/real/agy-binary' is not on PATH). Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.

 [32m✓[39m agent/harnesses/antigravity/agyHarness.integration.test.js [2m([22m[2m7 tests[22m[2m)[22m[33m 670[2mms[22m[39m
 [32m✓[39m work/taskPersistence.test.js [2m([22m[2m57 tests[22m[2m)[22m[33m 495[2mms[22m[39m
 [32m✓[39m flow/stageExecution.reliability.test.js [2m([22m[2m7 tests[22m[2m)[22m[33m 536[2mms[22m[39m
 [32m✓[39m flow/schedulerIdle.test.js [2m([22m[2m9 tests[22m[2m)[22m[33m 501[2mms[22m[39m
 [32m✓[39m flow/stageExecution.reportGating.test.js [2m([22m[2m6 tests[22m[2m)[22m[33m 422[2mms[22m[39m
{"level":30,"time":1793126529029,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529042,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":400},"err":{"type":"Error","message":"body must have required property 'path'","stack":"Error: body must have required property 'path'\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:423:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at onDone (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:241:5)\n    at AsyncResource.runInAsyncScope (node:async_hooks:227:14)\n    at done (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:211:14)\n    at Parser.defaultJsonParser [as fn] (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:338:7)\n    at Request.onEnd (/home/server/projects/kainbain/api/node_modules/fastify/lib/content-type-parser.js:320:27)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"path"},"message":"must have required property 'path'"}],"validationContext":"body"},"msg":"body must have required property 'path'"}
{"level":30,"time":1793126529047,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":400},"responseTime":16.308533999996143,"msg":"request completed"}
{"level":30,"time":1793126529048,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529050,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":400},"responseTime":2.0878059999959078,"msg":"request completed"}
{"level":30,"time":1793126529051,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529102,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":201},"responseTime":51.091837999993004,"msg":"request completed"}
{"level":30,"time":1793126529103,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529104,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":1.123714999994263,"msg":"request completed"}
{"level":30,"time":1793126529105,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529105,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":0.6282970000029309,"msg":"request completed"}
 [32m✓[39m routes/projects.register.test.js [2m([22m[2m3 tests[22m[2m)[22m[33m 373[2mms[22m[39m
{"level":30,"time":1793126529820,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/files.test.js [2m([22m[2m29 tests[22m[2m)[22m[33m 453[2mms[22m[39m
{"level":30,"time":1793126529894,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":71.63292300001194,"msg":"request completed"}
{"level":30,"time":1793126529902,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529905,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.3485040000086883,"msg":"request completed"}
{"level":30,"time":1793126529907,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files?path=docs/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529907,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":0.533328999998048,"msg":"request completed"}
{"level":30,"time":1793126529908,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files?path=../../etc","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529909,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":403},"responseTime":0.5083880000020145,"msg":"request completed"}
{"level":30,"time":1793126529909,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files?path=non-existent-subfolder","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529910,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":404},"responseTime":0.35872599999129307,"msg":"request completed"}
{"level":30,"time":1793126529910,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files?path=README.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529911,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":400},"responseTime":0.35778299999947194,"msg":"request completed"}
{"level":30,"time":1793126529911,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/projects/unknown-proj-id/files","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529912,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":404},"responseTime":0.24371499998960644,"msg":"request completed"}
{"level":30,"time":1793126529913,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=README.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529915,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":2.6817060000030324,"msg":"request completed"}
{"level":30,"time":1793126529917,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=docs/tasks/task-1/task.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529917,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":0.5473500000080094,"msg":"request completed"}
{"level":30,"time":1793126529918,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=../../etc/passwd","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529919,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":403},"responseTime":1.062432999999146,"msg":"request completed"}
{"level":30,"time":1793126529920,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=docs/missing.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529922,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":404},"responseTime":2.387564000004204,"msg":"request completed"}
{"level":30,"time":1793126529925,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=src","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529925,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":400},"responseTime":0.3129639999970095,"msg":"request completed"}
{"level":30,"time":1793126529926,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=logo.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529926,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":415},"responseTime":0.5557450000051176,"msg":"request completed"}
{"level":30,"time":1793126529927,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=archive.zip","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529927,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":415},"responseTime":0.3059919999941485,"msg":"request completed"}
{"level":30,"time":1793126529927,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=blob","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529928,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":415},"responseTime":0.31949200000963174,"msg":"request completed"}
{"level":30,"time":1793126529928,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content?path=README.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529929,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":0.34124100000190083,"msg":"request completed"}
{"level":30,"time":1793126529929,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529930,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":0.6893039999995381,"msg":"request completed"}
{"level":30,"time":1793126529930,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/content","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529931,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":400},"err":{"type":"Error","message":"querystring must have required property 'path'","stack":"Error: querystring must have required property 'path'\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:434:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at Object.handleRequest (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:35:5)\n    at runPreParsing (/home/server/projects/kainbain/api/node_modules/fastify/lib/route.js:665:19)\n    at next (/home/server/projects/kainbain/api/node_modules/fastify/lib/hooks.js:236:9)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/node_modules/@fastify/websocket/index.js:151:5)\n    at hookIterator (/home/server/projects/kainbain/api/node_modules/fastify/lib/hooks.js:412:10)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"path"},"message":"must have required property 'path'"}],"validationContext":"querystring"},"msg":"querystring must have required property 'path'"}
{"level":30,"time":1793126529933,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":400},"responseTime":2.226173999995808,"msg":"request completed"}
{"level":30,"time":1793126529933,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=logo.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529934,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":0.8782139999966603,"msg":"request completed"}
{"level":30,"time":1793126529935,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=icon.svg","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529935,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":0.3806800000020303,"msg":"request completed"}
{"level":30,"time":1793126529936,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=README.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529936,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":0.32785499999590684,"msg":"request completed"}
{"level":30,"time":1793126529936,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=big.bin","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529945,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":413},"responseTime":8.714703000005102,"msg":"request completed"}
{"level":30,"time":1793126529946,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=../../etc/passwd","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529946,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":403},"responseTime":0.20013399999879766,"msg":"request completed"}
{"level":30,"time":1793126529946,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=escape.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":403},"responseTime":0.31054600000788923,"msg":"request completed"}
{"level":30,"time":1793126529947,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=nope.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":404},"responseTime":0.19264100000145845,"msg":"request completed"}
{"level":30,"time":1793126529948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw?path=src","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":400},"responseTime":0.2599389999959385,"msg":"request completed"}
{"level":30,"time":1793126529948,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"GET","url":"/projects/297bcf56-45b4-4bb5-a71f-c306faedf04b/files/raw","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":400},"err":{"type":"Error","message":"querystring must have required property 'path'","stack":"Error: querystring must have required property 'path'\n    at defaultSchemaErrorFormatter (/home/server/projects/kainbain/api/node_modules/fastify/lib/context.js:92:10)\n    at wrapValidationError (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:505:17)\n    at validate (/home/server/projects/kainbain/api/node_modules/fastify/lib/validation.js:434:16)\n    at preValidationCallback (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:115:25)\n    at handler (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:99:7)\n    at Object.handleRequest (/home/server/projects/kainbain/api/node_modules/fastify/lib/handle-request.js:35:5)\n    at runPreParsing (/home/server/projects/kainbain/api/node_modules/fastify/lib/route.js:665:19)\n    at next (/home/server/projects/kainbain/api/node_modules/fastify/lib/hooks.js:236:9)\n    at Object.<anonymous> (/home/server/projects/kainbain/api/node_modules/@fastify/websocket/index.js:151:5)\n    at hookIterator (/home/server/projects/kainbain/api/node_modules/fastify/lib/hooks.js:412:10)","statusCode":400,"code":"FST_ERR_VALIDATION","validation":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"path"},"message":"must have required property 'path'"}],"validationContext":"querystring"},"msg":"querystring must have required property 'path'"}
{"level":30,"time":1793126529949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":400},"responseTime":0.4662300000054529,"msg":"request completed"}
{"level":30,"time":1793126529949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"GET","url":"/projects/unknown-proj-id/files/raw?path=logo.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126529949,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":404},"responseTime":0.15600300001096912,"msg":"request completed"}
{"level":30,"time":1793126530120,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530221,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":99.3891169999988,"msg":"request completed"}
{"level":30,"time":1793126530222,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/projects/c12ce980-bc96-4717-ab33-db11e5d768fb","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530224,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.0288819999987027,"msg":"request completed"}
{"level":30,"time":1793126530225,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530228,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":400},"responseTime":2.676328999994439,"msg":"request completed"}
{"level":30,"time":1793126530229,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530230,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":400},"responseTime":1.0852339999983087,"msg":"request completed"}
{"level":30,"time":1793126530230,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530232,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":400},"responseTime":1.4199680000019725,"msg":"request completed"}
{"level":30,"time":1793126530233,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530295,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":201},"responseTime":61.99161599999934,"msg":"request completed"}
{"level":30,"time":1793126530295,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"PATCH","url":"/projects/12a6a9b3-c2cc-47c3-910b-1178ab0c8dc9","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/projects.kainbainDir.test.js[2m > [22m[2mPOST/PATCH /projects kainbainDirName[2m > [22m[2mPATCH sets and clears kainbainDirName, and 400s on collisions
[22m[39m[projectStore] state folder changed to '.kb'; removed the stale config '/tmp/kainbain-test-kbdir-routes-projects-hNCKle/patch-state-app/.kainbain/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-routes-projects-hNCKle/patch-state-app/.kainbain' by hand, then restart.

{"level":30,"time":1793126530312,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":17.013818000006722,"msg":"request completed"}
{"level":30,"time":1793126530313,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"PATCH","url":"/projects/12a6a9b3-c2cc-47c3-910b-1178ab0c8dc9","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530313,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":400},"responseTime":0.5833710000006249,"msg":"request completed"}
{"level":30,"time":1793126530314,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"PATCH","url":"/projects/12a6a9b3-c2cc-47c3-910b-1178ab0c8dc9","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | routes/projects.kainbainDir.test.js[2m > [22m[2mPOST/PATCH /projects kainbainDirName[2m > [22m[2mPATCH sets and clears kainbainDirName, and 400s on collisions
[22m[39m[projectStore] state folder changed to '.kainbain'; removed the stale config '/tmp/kainbain-test-kbdir-routes-projects-hNCKle/patch-state-app/.kb/project.json'. Move any sessions/worktrees from '/tmp/kainbain-test-kbdir-routes-projects-hNCKle/patch-state-app/.kb' by hand, then restart.

{"level":30,"time":1793126530332,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":18.806813000002876,"msg":"request completed"}
{"level":30,"time":1793126530336,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530405,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":201},"responseTime":69.45584600001166,"msg":"request completed"}
{"level":30,"time":1793126530406,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"PATCH","url":"/projects/ab25c3f5-38b0-40f0-8141-2840a4f29e03","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530407,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"responseTime":1.0466289999894798,"msg":"request completed"}
{"level":30,"time":1793126530407,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/projects/ab25c3f5-38b0-40f0-8141-2840a4f29e03","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530407,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":0.2930449999985285,"msg":"request completed"}
 [32m✓[39m routes/projects.kainbainDir.test.js [2m([22m[2m4 tests[22m[2m)[22m[33m 709[2mms[22m[39m
{"level":30,"time":1793126530698,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/workflows/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530706,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":400},"responseTime":7.075354000000516,"msg":"request completed"}
{"level":30,"time":1793126530708,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530764,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":201},"responseTime":56.44465700000001,"msg":"request completed"}
{"level":30,"time":1793126530767,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/workflows/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530771,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":3.5979169999918668,"msg":"request completed"}
{"level":30,"time":1793126530771,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/workflows","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530772,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":0.3671899999899324,"msg":"request completed"}
{"level":30,"time":1793126530773,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530826,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":201},"responseTime":53.628310000000056,"msg":"request completed"}
{"level":30,"time":1793126530827,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530871,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":201},"responseTime":43.93037500001083,"msg":"request completed"}
{"level":30,"time":1793126530871,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/workflows/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530872,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.6765829999931157,"msg":"request completed"}
{"level":30,"time":1793126530872,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/workflows/start","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530873,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.6400910000083968,"msg":"request completed"}
{"level":30,"time":1793126530874,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/workflows?projectId=60e4b36b-409d-4117-a78a-a3475a45597d","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126530874,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":0.35870799999975134,"msg":"request completed"}
 [32m✓[39m routes/workflows.test.js [2m([22m[2m3 tests[22m[2m)[22m[33m 768[2mms[22m[39m
   [32m✓[39m Workflow API Integration [2m(3)[22m
     [33m[2m✓[22m[39m POST /workflows/start requires a workflowId[33m 595[2mms[22m[39m
 [32m✓[39m routes/skills.test.js [2m([22m[2m11 tests[22m[2m)[22m[33m 505[2mms[22m[39m
{"level":30,"time":1793126531532,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531606,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":72.97653200000059,"msg":"request completed"}
{"level":30,"time":1793126531607,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531618,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":10.408167999994475,"msg":"request completed"}
{"level":30,"time":1793126531618,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531620,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":2.3026450000033947,"msg":"request completed"}
{"level":30,"time":1793126531621,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531665,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":201},"responseTime":44.32418300000427,"msg":"request completed"}
{"level":30,"time":1793126531666,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531668,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":2.459783999991487,"msg":"request completed"}
{"level":30,"time":1793126531671,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/runners/register","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531673,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":202},"responseTime":1.7813370000076247,"msg":"request completed"}
{"level":30,"time":1793126531673,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/runners/caps-1/approve","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":0.6526370000065072,"msg":"request completed"}
{"level":30,"time":1793126531674,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/runners/heartbeat","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531675,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":0.9052599999995437,"msg":"request completed"}
{"level":30,"time":1793126531675,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/tasks/3165ca76-8347-468e-a730-52f82ac9695d/claim","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531678,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":2.0033320000075037,"msg":"request completed"}
{"level":30,"time":1793126531678,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531683,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":5.052364000002854,"msg":"request completed"}
{"level":30,"time":1793126531685,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531687,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":2.5806139999913285,"msg":"request completed"}
{"level":30,"time":1793126531688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/runners/dispatch","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126531688,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":429},"responseTime":0.34482900000875816,"msg":"request completed"}
 [32m✓[39m flow/runnerDispatchCaps.test.js [2m([22m[2m1 test[22m[2m)[22m[33m 446[2mms[22m[39m
{"level":30,"time":1793126532150,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532218,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":66.74903900000209,"msg":"request completed"}
{"level":30,"time":1793126532221,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532231,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":10.540901000000304,"msg":"request completed"}
{"level":30,"time":1793126532247,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532249,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":2.39151000000129,"msg":"request completed"}
{"level":30,"time":1793126532256,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532270,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":14.25185899999633,"msg":"request completed"}
{"level":30,"time":1793126532284,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":3.999932999999146,"msg":"request completed"}
{"level":30,"time":1793126532288,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks/b32c91a3-9ce7-4f69-9db3-76e75f1d42d4/execute","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532309,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":21.204696000000695,"msg":"request completed"}
 [32m✓[39m agentic.test.js [2m([22m[2m4 tests[22m[2m)[22m[33m 471[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/opencodeHarness.contract.test.js [2m([22m[2m56 tests[22m[2m)[22m[33m 550[2mms[22m[39m
{"level":30,"time":1793126532553,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532611,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":56.9588470000017,"msg":"request completed"}
{"level":30,"time":1793126532613,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532624,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":9.992606999992859,"msg":"request completed"}
{"level":30,"time":1793126532624,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532626,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":2.4129309999989346,"msg":"request completed"}
{"level":30,"time":1793126532628,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/tasks/ccd81fa0-a522-4e2f-843b-a7c65584599d/execute","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532629,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":409},"responseTime":1.034408000006806,"msg":"request completed"}
{"level":30,"time":1793126532630,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532631,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":400},"responseTime":0.872921000001952,"msg":"request completed"}
{"level":30,"time":1793126532632,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532634,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":2.4164139999920735,"msg":"request completed"}
{"level":30,"time":1793126532634,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532636,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":1.9668459999957122,"msg":"request completed"}
{"level":30,"time":1793126532637,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"PATCH","url":"/tasks/4059e561-7926-440e-bbf4-2106a1643b75","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532637,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":400},"responseTime":0.5974650000134716,"msg":"request completed"}
{"level":30,"time":1793126532638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"PATCH","url":"/tasks/23caec0e-5916-400f-838b-77057358ee93","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532638,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":400},"responseTime":0.5699670000030892,"msg":"request completed"}
{"level":30,"time":1793126532639,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532642,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":2.8878070000064326,"msg":"request completed"}
{"level":30,"time":1793126532642,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"PATCH","url":"/tasks/96ea0bf5-4d3c-4693-829c-3e9cf0850658","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532643,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":400},"responseTime":0.6590560000040568,"msg":"request completed"}
{"level":30,"time":1793126532644,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532645,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":1.8865550000045914,"msg":"request completed"}
{"level":30,"time":1793126532646,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532655,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":9.024919000003138,"msg":"request completed"}
{"level":30,"time":1793126532655,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/tasks/2969c580-710e-40eb-9d4b-ae11a8326584/complete","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532658,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":2.8896910000039497,"msg":"request completed"}
{"level":30,"time":1793126532658,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/tasks/queue?projectId=269b888e-8bf6-415a-900f-fa46344a34d7","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126532665,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":6.572313000011491,"msg":"request completed"}
 [32m✓[39m routes/tasks.blocking.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 460[2mms[22m[39m
 [32m✓[39m projectStore.appStatus.test.js [2m([22m[2m15 tests[22m[2m)[22m[33m 386[2mms[22m[39m
 [32m✓[39m routes/deploy.test.js [2m([22m[2m16 tests[22m[2m)[22m[33m 494[2mms[22m[39m
{"level":30,"time":1793126534198,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"POST","url":"/projects","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
[90mstderr[2m | projectStore.multiroot.test.js[2m > [22m[2mProjectStore multi-root + register[2m > [22m[2mrefuses to create, register, save, or patch an extra scan root as a project
[22m[39m[projectStore] refusing to save b335a16e-59a7-435c-9cbd-ba95867505e4: cwd is the projects root ('/tmp/kb-multi-b-JKBiMB')

 [32m✓[39m projectStore.multiroot.test.js [2m([22m[2m10 tests[22m[2m)[22m[33m 415[2mms[22m[39m
{"level":30,"time":1793126534297,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":201},"responseTime":93.14560599999095,"msg":"request completed"}
{"level":30,"time":1793126534301,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534311,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":201},"responseTime":9.896632999996655,"msg":"request completed"}
{"level":30,"time":1793126534312,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/shot-one.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534313,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":0.996820000000298,"msg":"request completed"}
{"level":30,"time":1793126534314,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534316,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":201},"responseTime":2.0974910000077216,"msg":"request completed"}
{"level":30,"time":1793126534317,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534318,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":1.0485279999993509,"msg":"request completed"}
{"level":30,"time":1793126534319,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534321,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":400},"responseTime":1.1226190000015777,"msg":"request completed"}
{"level":30,"time":1793126534321,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534322,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":400},"responseTime":0.7279469999921275,"msg":"request completed"}
{"level":30,"time":1793126534322,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534323,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":400},"responseTime":0.7040149999957066,"msg":"request completed"}
{"level":30,"time":1793126534323,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534324,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":400},"responseTime":0.6959619999979623,"msg":"request completed"}
{"level":30,"time":1793126534325,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534326,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":201},"responseTime":1.473232000003918,"msg":"request completed"}
{"level":30,"time":1793126534338,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534341,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":413},"responseTime":2.761598999990383,"msg":"request completed"}
{"level":30,"time":1793126534342,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-cap/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534343,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":201},"responseTime":1.1743380000116304,"msg":"request completed"}
{"level":30,"time":1793126534343,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-cap/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534344,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":201},"responseTime":1.1210510000091745,"msg":"request completed"}
{"level":30,"time":1793126534344,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-cap/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534345,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":413},"responseTime":0.927811000001384,"msg":"request completed"}
{"level":30,"time":1793126534346,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":400},"responseTime":0.6937589999870397,"msg":"request completed"}
{"level":30,"time":1793126534347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"POST","url":"/projects/nope/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":404},"responseTime":0.1283560000010766,"msg":"request completed"}
{"level":30,"time":1793126534347,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/no-such-task/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534348,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":404},"responseTime":0.18450899999879766,"msg":"request completed"}
{"level":30,"time":1793126534348,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/ghost.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534348,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":404},"responseTime":0.23769900000479538,"msg":"request completed"}
{"level":30,"time":1793126534349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/..%2F..%2Ftask.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":403},"responseTime":0.2072430000116583,"msg":"request completed"}
{"level":30,"time":1793126534349,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/task.md","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":400},"responseTime":0.1576889999996638,"msg":"request completed"}
{"level":30,"time":1793126534350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/..%2F..%2F/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534350,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":400},"responseTime":0.19151799999235664,"msg":"request completed"}
{"level":30,"time":1793126534351,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":201},"responseTime":1.1979950000095414,"msg":"request completed"}
{"level":30,"time":1793126534352,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"DELETE","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/deleteme.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534353,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":0.8581770000018878,"msg":"request completed"}
{"level":30,"time":1793126534353,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"GET","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/deleteme.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534354,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":404},"responseTime":0.307766999991145,"msg":"request completed"}
{"level":30,"time":1793126534354,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"DELETE","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images/deleteme.png","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126534354,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":404},"responseTime":0.2544049999996787,"msg":"request completed"}
{"level":30,"time":1793126534361,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"POST","url":"/projects/3eadcc28-fa4f-4c7f-8c42-981a7e528677/tasks/task-img-1/images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/taskImages.test.js [2m([22m[2m17 tests[22m[2m)[22m[33m 640[2mms[22m[39m
{"level":30,"time":1793126534363,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":201},"responseTime":1.5186149999935878,"msg":"request completed"}
 [32m✓[39m flow/stageFailureRouting.test.js [2m([22m[2m42 tests[22m[2m)[22m[33m 667[2mms[22m[39m
 [32m✓[39m flow/stageExecution.survey.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 338[2mms[22m[39m
{"level":30,"time":1793126535706,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/status/config","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535768,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/status.config.test.js [2m([22m[2m9 tests[22m[2m)[22m[33m 460[2mms[22m[39m
   [32m✓[39m GET /status/config (+ /api/system/config-spec alias) [2m(9)[22m
     [33m[2m✓[22m[39m serves one entry per schema variable with its value, default, and source[33m 396[2mms[22m[39m
{"level":30,"time":1793126535720,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":12.274216999998316,"msg":"request completed"}
{"level":30,"time":1793126535730,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/status/config","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535733,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.458226000002469,"msg":"request completed"}
{"level":30,"time":1793126535733,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/api/system/config-spec","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535735,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":1.905629000000772,"msg":"request completed"}
{"level":30,"time":1793126535779,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":9.924971000000369,"msg":"request completed"}
{"level":30,"time":1793126535782,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535784,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":1.7223329999978887,"msg":"request completed"}
{"level":30,"time":1793126535785,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/docs/architecture","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535787,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":2.1034900000086054,"msg":"request completed"}
{"level":30,"time":1793126535789,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535790,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-4","res":{"statusCode":200},"responseTime":1.504692000002251,"msg":"request completed"}
{"level":30,"time":1793126535791,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","req":{"method":"GET","url":"/docs/architecture","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535793,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-5","res":{"statusCode":200},"responseTime":1.7112460000062129,"msg":"request completed"}
{"level":30,"time":1793126535793,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","req":{"method":"GET","url":"/docs/pipeline-stages","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535795,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-6","res":{"statusCode":200},"responseTime":1.6234689999982947,"msg":"request completed"}
{"level":30,"time":1793126535795,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","req":{"method":"GET","url":"/docs/stage-liveness-and-stalls","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535797,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-7","res":{"statusCode":200},"responseTime":1.564570000002277,"msg":"request completed"}
{"level":30,"time":1793126535797,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","req":{"method":"GET","url":"/docs/agent-execution","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535799,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-8","res":{"statusCode":200},"responseTime":1.5179769999958808,"msg":"request completed"}
{"level":30,"time":1793126535799,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","req":{"method":"GET","url":"/docs/transport-health","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535801,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-9","res":{"statusCode":200},"responseTime":1.5799070000066422,"msg":"request completed"}
{"level":30,"time":1793126535801,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","req":{"method":"GET","url":"/docs/prompts-tokens","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535810,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-a","res":{"statusCode":200},"responseTime":8.924283000000287,"msg":"request completed"}
{"level":30,"time":1793126535811,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","req":{"method":"GET","url":"/docs/self-deploy","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535812,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-b","res":{"statusCode":200},"responseTime":1.4250689999898896,"msg":"request completed"}
{"level":30,"time":1793126535813,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","req":{"method":"GET","url":"/docs/activity-stream","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535814,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-c","res":{"statusCode":200},"responseTime":1.7341409999935422,"msg":"request completed"}
{"level":30,"time":1793126535815,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","req":{"method":"GET","url":"/docs/unified-logging","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535816,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-d","res":{"statusCode":200},"responseTime":1.544250999999349,"msg":"request completed"}
{"level":30,"time":1793126535816,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","req":{"method":"GET","url":"/docs/install-run","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535818,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-e","res":{"statusCode":200},"responseTime":1.5279499999887776,"msg":"request completed"}
{"level":30,"time":1793126535818,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","req":{"method":"GET","url":"/docs/first-time-setup","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535820,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-f","res":{"statusCode":200},"responseTime":1.7309479999967152,"msg":"request completed"}
{"level":30,"time":1793126535820,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","req":{"method":"GET","url":"/docs/ports-env","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535822,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-g","res":{"statusCode":200},"responseTime":1.3036859999992885,"msg":"request completed"}
{"level":30,"time":1793126535822,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","req":{"method":"GET","url":"/docs/first-project","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535823,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-h","res":{"statusCode":200},"responseTime":1.338224999999511,"msg":"request completed"}
{"level":30,"time":1793126535823,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","req":{"method":"GET","url":"/docs/task-images","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535825,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-i","res":{"statusCode":200},"responseTime":1.564515999998548,"msg":"request completed"}
{"level":30,"time":1793126535826,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","req":{"method":"GET","url":"/docs/surveys","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535828,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-j","res":{"statusCode":200},"responseTime":2.3771810000034748,"msg":"request completed"}
{"level":30,"time":1793126535829,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","req":{"method":"GET","url":"/docs/submit-track-task","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535830,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-k","res":{"statusCode":200},"responseTime":1.4383099999977276,"msg":"request completed"}
{"level":30,"time":1793126535830,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","req":{"method":"GET","url":"/docs/task-dependencies","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535832,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-l","res":{"statusCode":200},"responseTime":1.4959519999974873,"msg":"request completed"}
{"level":30,"time":1793126535832,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","req":{"method":"GET","url":"/docs/review-gates","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535834,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-m","res":{"statusCode":200},"responseTime":1.4491039999993518,"msg":"request completed"}
{"level":30,"time":1793126535834,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","req":{"method":"GET","url":"/docs/retrospective-review","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535836,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-n","res":{"statusCode":200},"responseTime":2.0422939999989467,"msg":"request completed"}
{"level":30,"time":1793126535836,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","req":{"method":"GET","url":"/docs/keyboard-shortcuts","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535849,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-o","res":{"statusCode":200},"responseTime":12.939751999991131,"msg":"request completed"}
{"level":30,"time":1793126535850,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","req":{"method":"GET","url":"/docs/git-index-lock-runbook","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535855,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-p","res":{"statusCode":200},"responseTime":5.860361999992165,"msg":"request completed"}
{"level":30,"time":1793126535856,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","req":{"method":"GET","url":"/docs/red-shared-gate","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535857,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-q","res":{"statusCode":200},"responseTime":1.1387760000070557,"msg":"request completed"}
{"level":30,"time":1793126535857,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","req":{"method":"GET","url":"/docs/editing-tasks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535859,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-r","res":{"statusCode":200},"responseTime":2.282306000008248,"msg":"request completed"}
{"level":30,"time":1793126535861,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","req":{"method":"GET","url":"/docs/faq","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535864,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-s","res":{"statusCode":200},"responseTime":2.623354000010295,"msg":"request completed"}
{"level":30,"time":1793126535864,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","req":{"method":"GET","url":"/docs/push-notifications","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535865,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-t","res":{"statusCode":200},"responseTime":1.1287570000131382,"msg":"request completed"}
{"level":30,"time":1793126535865,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","req":{"method":"GET","url":"/docs/alert-webhooks","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535867,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-u","res":{"statusCode":200},"responseTime":1.190574000007473,"msg":"request completed"}
{"level":30,"time":1793126535867,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","req":{"method":"GET","url":"/docs/api-reference","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535868,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-v","res":{"statusCode":200},"responseTime":1.3349269999889657,"msg":"request completed"}
{"level":30,"time":1793126535869,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","req":{"method":"GET","url":"/docs/no-such-article","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535870,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-w","res":{"statusCode":404},"responseTime":1.3117849999980535,"msg":"request completed"}
{"level":30,"time":1793126535871,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","req":{"method":"GET","url":"/docs/..%2F..%2Fpackage","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126535871,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-x","res":{"statusCode":404},"responseTime":0.16739100000995677,"msg":"request completed"}
 [32m✓[39m routes/docs.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 497[2mms[22m[39m
 [32m✓[39m routes/retrospectiveChat.test.js [2m([22m[2m25 tests[22m[2m)[22m[33m 368[2mms[22m[39m
 [32m✓[39m routes/projects.aliasReliability.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 311[2mms[22m[39m
 [32m✓[39m routes/promptLayout.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 217[2mms[22m[39m
{"level":30,"time":1793126537125,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/agent","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/agent.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 300[2mms[22m[39m
{"level":30,"time":1793126537132,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":5.339867999995477,"msg":"request completed"}
{"level":30,"time":1793126537136,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/agent/schema","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126537137,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":0.7579810000024736,"msg":"request completed"}
{"level":30,"time":1793126537138,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","req":{"method":"GET","url":"/agent/guide","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126537139,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-3","res":{"statusCode":200},"responseTime":1.151120999988052,"msg":"request completed"}
 [32m✓[39m dependencySecurityFloor.test.js [2m([22m[2m5 tests[22m[2m)[22m[33m 314[2mms[22m[39m
 [32m✓[39m workflowConsistency.contract.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 289[2mms[22m[39m
[90mstderr[2m | agent/harnesses/muse/musePermissions.test.js[2m > [22m[2mreadHistoryFromDisk (hermetic, mock muse export)[2m > [22m[2mdegrades to the honest empty history when the export fails
[22m[39mFailed to read Muse session history: Command failed: /home/server/projects/kainbain/api/agent/harnesses/muse/fixtures/mock-muse.mjs export --last --redacted --out /tmp/kainbain-muse-export-ppDcnL/export.json
mock-muse: export failed (MUSE_MOCK_EXPORT_FAIL=1)


[90mstderr[2m | agent/harnesses/muse/musePermissions.test.js[2m > [22m[2mreadHistoryFromDisk (hermetic, mock muse export)[2m > [22m[2mdegrades to the honest empty history when the binary is missing
[22m[39mFailed to read Muse session history: spawn /nonexistent/muse ENOENT

 [32m✓[39m agent/harnesses/muse/musePermissions.test.js [2m([22m[2m23 tests[22m[2m)[22m[32m 233[2mms[22m[39m
{"level":30,"time":1793126538540,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","req":{"method":"GET","url":"/docs","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
 [32m✓[39m routes/docs.apiCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 348[2mms[22m[39m
{"level":30,"time":1793126538550,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-1","res":{"statusCode":200},"responseTime":8.9387340000103,"msg":"request completed"}
{"level":30,"time":1793126538552,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","req":{"method":"GET","url":"/docs/api-reference","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1793126538554,"pid":11011,"hostname":"9a57735be6d4","reqId":"req-2","res":{"statusCode":200},"responseTime":2.805498000001535,"msg":"request completed"}
 [32m✓[39m routes/agentGuide.apiCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[33m 323[2mms[22m[39m
 [32m✓[39m agent/harnesses/mock/mockHarness.registration.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 285[2mms[22m[39m
 [32m✓[39m routes/skills.wiring.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 259[2mms[22m[39m
 [32m✓[39m continuity/deployReconcile.test.js [2m([22m[2m63 tests[22m[2m)[22m[32m 271[2mms[22m[39m
 [32m✓[39m routes/push.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 212[2mms[22m[39m
 [32m✓[39m appHealth.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 220[2mms[22m[39m
 [32m✓[39m taskStore.summaryDurations.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 189[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeHarness.preflight.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 227[2mms[22m[39m
 [32m✓[39m flow/stageExecution.initLine.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 210[2mms[22m[39m
 [32m✓[39m flow/engineGuards.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 214[2mms[22m[39m
 [32m✓[39m agent/harnessBoundary.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 207[2mms[22m[39m
 [32m✓[39m flow/singleActiveInvariant.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 188[2mms[22m[39m
[90mstderr[2m | agent/harnesses/vibe/vibeModelCatalog.test.js[2m > [22m[2mcreateVibeModelCatalog (contract over the mock ACP agent)[2m > [22m[2mclassifies a missing ACP binary with the vibe ACP vocabulary
[22m[39m[WARN] vibe model discovery failed [VIBE_ACP_BIN_MISSING]: The Mistral Vibe ACP agent was not found ('/nonexistent/vibe-acp-xyz' is not runnable). vibe-acp ships in the same install dir as vibe — reinstall Mistral Vibe, or set KAINBAIN_VIBE_ACP_BIN to the vibe-acp absolute path (systemd units cannot see ~/.local/bin), or set KAINBAIN_VIBE_ACP=off to use the legacy exec path.

[90mstderr[2m | agent/harnesses/vibe/vibeModelCatalog.test.js[2m > [22m[2mcreateVibeModelCatalog (contract over the mock ACP agent)[2m > [22m[2mreports the unparseable error when the agent ships no model select
[22m[39m[WARN] vibe model discovery failed [VIBE_MODELS_UNPARSEABLE]: The vibe-acp handshake succeeded but its session/new configOptions carried no model select. The vibe-acp output shape may have changed — run probe-vibe-acp.mjs (see api/agent/harnesses/vibe/fixtures/) and paste the result in a bug report.

[90mstderr[2m | agent/harnesses/vibe/vibeModelCatalog.test.js[2m > [22m[2mcreateVibeModelCatalog (contract over the mock ACP agent)[2m > [22m[2mclears the retained error after a successful re-probe
[22m[39m[WARN] vibe model discovery failed [VIBE_ACP_BIN_MISSING]: The Mistral Vibe ACP agent was not found ('vibe-acp' is not runnable). vibe-acp ships in the same install dir as vibe — reinstall Mistral Vibe, or set KAINBAIN_VIBE_ACP_BIN to the vibe-acp absolute path (systemd units cannot see ~/.local/bin), or set KAINBAIN_VIBE_ACP=off to use the legacy exec path.

[90mstderr[2m | agent/harnesses/vibe/vibeModelCatalog.test.js[2m > [22m[2mcreateVibeModelCatalog (contract over the mock ACP agent)[2m > [22m[2mcleans the throwaway cwd even when spawn setup fails
[22m[39m[WARN] vibe model discovery failed [VIBE_ACP_BIN_MISSING]: The Mistral Vibe ACP agent was not found ('/nonexistent/vibe-acp-xyz' is not runnable). vibe-acp ships in the same install dir as vibe — reinstall Mistral Vibe, or set KAINBAIN_VIBE_ACP_BIN to the vibe-acp absolute path (systemd units cannot see ~/.local/bin), or set KAINBAIN_VIBE_ACP=off to use the legacy exec path.

 [32m✓[39m agent/harnesses/vibe/vibeModelCatalog.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 235[2mms[22m[39m
 [32m✓[39m projectStore.remoteRequired.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 258[2mms[22m[39m
 [32m✓[39m projectStore.docsLink.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 216[2mms[22m[39m
 [32m✓[39m git.test.js [2m([22m[2m84 tests[22m[2m)[22m[32m 228[2mms[22m[39m
 [32m✓[39m flow/executionLedger.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 177[2mms[22m[39m
 [32m✓[39m healthChecker.test.js [2m([22m[2m25 tests[22m[2m)[22m[32m 149[2mms[22m[39m
 [32m✓[39m agentRunner.skills.integration.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m work/taskDiffStat.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 204[2mms[22m[39m
 [32m✓[39m testResidue.guard.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 142[2mms[22m[39m
 [32m✓[39m config/config.test.js [2m([22m[2m82 tests[22m[2m)[22m[32m 139[2mms[22m[39m
 [32m✓[39m skills/skillsRegistry.test.js [2m([22m[2m55 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m work/gitLock.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 102[2mms[22m[39m
 [32m✓[39m taskStore.docsLinkSave.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 141[2mms[22m[39m
 [32m✓[39m models.test.js [2m([22m[2m82 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m flow/circuitGate.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m agentRunner.test.js [2m([22m[2m53 tests[22m[2m)[22m[32m 86[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/OpencodeSessionWrapper.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m observability/engineAlertHookup.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m flow/commandStages.test.js [2m([22m[2m69 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m git/exec.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibePermissions.test.js [2m([22m[2m22 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m stuckCheck.test.js [2m([22m[2m40 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m git/branch.test.js [2m([22m[2m32 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/MspClientConnection.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m flow/stageFailureRouting.push.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m push/pushService.test.js [2m([22m[2m30 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m deployManager.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m flow/taskScheduler.test.js [2m([22m[2m120 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m opencodeReliability.integration.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m taskStore.blocking.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m customHarness.stageRun.integration.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/MspSessionRuntime.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m sessionStore.lifecycle.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m work/taskErrors.taxonomy.test.js [2m([22m[2m50 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m push/vapidKeys.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m reviewStore.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m git/commit.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m skills/zipEntries.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m flow/transientRetryPolicy.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/OpencodeServerManager.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m flow/runningStageAgreement.integration.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 86[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/uuidv7.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m flow/executionQueue.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m aliasStageRun.integration.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m crew/modelDiscovery.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m flow/mergeReviewBaseline.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m flow/stageHeartbeat.test.js [2m([22m[2m35 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m agentRunner.alias.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m flow/stageTransitions.test.js [2m([22m[2m56 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m observability/alerts.test.js [2m([22m[2m42 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m flow/taskControl.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m flow/runnerRegistry.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m agent/harnessContract.test.js [2m([22m[2m37 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m siteDocs.deploy.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m flow/circuitBreaker.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m taskStore.observability.test.js [2m([22m[2m21 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m kbReferences.test.js [2m([22m[2m40 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agent/harnessDiscovery.test.js [2m([22m[2m36 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m flow/circuitOutage.integration.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m work/taskSurvey.routes.test.js [2m([22m[2m16 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m agent/harnesses/pi/piHarness.contract.test.js [2m([22m[2m44 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m flow/noDeploySpecialBehaviour.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m aliasTargets.test.js [2m([22m[2m30 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m agent/logStream/logProcessor.test.js [2m([22m[2m21 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m work/taskWorkRoutes.test.js [2m([22m[2m29 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpClientConnection.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m work/taskSurvey.test.js [2m([22m[2m21 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m work/taskLifecycle.test.js [2m([22m[2m37 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m flow/taskFlowRoutes.test.js [2m([22m[2m21 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m skills/skillImport.test.js [2m([22m[2m41 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m git/merge.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m agent/harnesses/mock/mockHarness.contract.test.js [2m([22m[2m45 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agentRunner.contract.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m agent/logStream/harnessFidelity.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m reviewAssembly.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m flow/commandStages.liveness.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m flow/taskScheduler.push.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m flow/startupRecovery.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m agentRunner.verdictFailOpen.test.js [2m([22m[2m27 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyStreamParser.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m flow/queueWedgeRecovery.test.js [2m([22m[2m22 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m promptCuration.test.js [2m([22m[2m34 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agySpawnResolution.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m git/workingTreeRecovery.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m agent/harnesses/pi/piHarness.modelResolution.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agent/logStream/agentLogStreamer.test.js [2m([22m[2m28 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m git/staleLock.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m activeTaskDisplay.test.js [2m([22m[2m54 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpSessionWrapper.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m agent/harnesses/codex/codexHarness.contract.test.js [2m([22m[2m45 tests[22m[2m)[22m[32m 30[2mms[22m[39m
[90mstderr[2m | agent/harnessRegistry.test.js[2m > [22m[2mharness resolution order with per-stage override (stage > project > config > default)[2m > [22m[2man unknown stage override degrades to the project resolution
[22m[39m[SYSTEM] Unknown harness "bogus-stage-1793126553995" for project proj-override-fallback; falling back to "custom". Update the project's harness in Settings.

[90mstderr[2m | agent/harnessRegistry.test.js[2m > [22m[2mharnessRegistry — unknown names fall back (never throw)[2m > [22m[2mfalls back to the default harness consistently per project + name
[22m[39m[SYSTEM] Unknown harness "bogus" for project Unknown Harness Project (proj-unknown); falling back to "pi". Update the project's harness in Settings.

[90mstderr[2m | agent/harnessRegistry.test.js[2m > [22m[2mharnessRegistry — unknown names fall back (never throw)[2m > [22m[2mfalls back to the default harness for different (project, name) pairs
[22m[39m[SYSTEM] Unknown harness "bogus-a" for project p-a; falling back to "pi". Update the project's harness in Settings.
[SYSTEM] Unknown harness "bogus-b" for project p-b; falling back to "pi". Update the project's harness in Settings.

[90mstderr[2m | agent/harnessRegistry.test.js[2m > [22m[2mharnessRegistry — unknown names fall back (never throw)[2m > [22m[2mfalls back when the CONFIGURED default is unknown, not just project choices
[22m[39m[SYSTEM] Unknown harness "bogus-config-default" for project proj-config-fallback; falling back to "pi". Update the project's harness in Settings.

 [32m✓[39m agent/harnessRegistry.test.js [2m([22m[2m44 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m observability/webhookNotifier.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m agent/sessionContract.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m siteDocs.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m flow/operatorAbort.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m flow/circuitSensors.test.js [2m([22m[2m26 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyPermissions.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m work/taskEngineState.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m git/status.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m flow/commandStages.platform.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m push/atomicWrite.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m aliasSelector.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m push/index.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspSupport.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m git/remote.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m promptCuration.skills.contract.test.js [2m([22m[2m16 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m work/taskAssets.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m work/taskErrors.test.js [2m([22m[2m81 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m flow/commandStages.keywords.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m watch/processLogs.test.js [2m([22m[2m44 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m flow/claimStore.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m gitGate.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m agent/harnesses/codex/codexDiscovery.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/opencodeSessionEvents.test.js [2m([22m[2m34 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m engineStateSnapshot.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m modelAliases.test.js [2m([22m[2m29 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m work/taskWorkspace.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m push/subscriptionStore.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m promptLayout/layoutStore.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m sessionStore.alias.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agentGuide.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m agentRunner.stageTargetSession.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/OpencodeModelDiscovery.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m eventBridge.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeEventMapper.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m promptCuration.layout.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayTarget stage alias refs[2m > [22m[2mfalls back naming the alias when the stage alias is unknown
[22m[39m[SYSTEM] Unknown model alias "ghost" for project proj-5011; falling back to "pi". Update the alias in Settings › Model Aliases.

[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayTarget stage alias refs[2m > [22m[2mnames '(blank)' when the stage alias name is blank
[22m[39m[SYSTEM] Unknown model alias "(blank)" for project proj-5012; falling back to "pi". Update the alias in Settings › Model Aliases.

[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayTarget stage alias refs[2m > [22m[2mpeek-resolves the project-default alias for the fallback when the stage alias is unknown
[22m[39m[SYSTEM] Unknown model alias "ghost" for project proj-5014; falling back to "display-target-harness-5013". Update the alias in Settings › Model Aliases.

[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayTarget project-default aliases[2m > [22m[2mfalls back with cleared model slots when the project alias is unknown
[22m[39m[SYSTEM] Unknown model alias "ghost" for project proj-5021; falling back to "pi". Update the alias in Settings › Model Aliases.

[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayTarget project-default aliases[2m > [22m[2mnames '(blank)' when the project alias name is blank
[22m[39m[SYSTEM] Unknown model alias "(blank)" for project proj-5022; falling back to "pi". Update the alias in Settings › Model Aliases.

[90mstderr[2m | sessionStore.displayTarget.test.js[2m > [22m[2mresolveDisplayHarness delegation[2m > [22m[2mreturns the seam's harness half for every shape
[22m[39m[SYSTEM] Unknown model alias "ghost" for project proj-5028; falling back to "pi". Update the alias in Settings › Model Aliases.

 [32m✓[39m sessionStore.displayTarget.test.js [2m([22m[2m16 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m watch/taskWatchRoutes.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m siteDocs.integrity.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m toolLogFormat.shared.test.js [2m([22m[2m62 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m skills/pocCreatingNewTickets.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m eventBridge.contract.test.js [2m([22m[2m21 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeAcpSupport.test.js [2m([22m[2m40 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agent/harnesses/pi/piHarness.probeHealth.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m survey.shared.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyRunErrors.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m skills/skillInjection.test.js [2m([22m[2m30 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m flow/commandLiveness.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.alias.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m projectRegistry.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m push/pushSettings.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m watch/observabilityMetrics.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m deploy.gates.test.js [2m([22m[2m15 tests[22m[2m | [22m[33m8 skipped[39m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m watch/aliasReliability.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m promptCuration.layoutBaseline.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m git/workingTreeStatus.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m agent/harnesses/pi/piSessionEvents.test.js [2m([22m[2m28 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m promptCuration.keywords.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museMspEventMapper.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m watch/reliabilityShared.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m utils/processTree.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyEventMapper.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m work/remediateNoVerdictRejections.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m agent/logStream/logRecord.test.js [2m([22m[2m19 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/engineRoutes.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m flow/routing/resolvers/pureResolvers.test.js [2m([22m[2m25 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyHarness.targetHandoff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m agent/harnesses/codex/codexHarness.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m agent/sessionEvents.test.js [2m([22m[2m31 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m taskStore.characterisation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m agent/harnesses/codex/codexEventMapper.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m flow/steerStore.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m agent/harnesses/antigravity/agyAcpSupport.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m watch/harnessReliability.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m workflowRegistry.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m continuity/deployMarkers.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m watch/stageReports.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m appUrl.test.js [2m([22m[2m20 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m promptLayout/promptLayout.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m routes/fileTypes.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m kainbainDir.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m work/taskLifecycleBranch.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m reviewCommentFormatter.test.js [2m([22m[2m22 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m utils/platform.test.js [2m([22m[2m13 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m house/projectStartup.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/visionSupport.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m agent/harnesses/opencode/OpencodeDiscoveryStatus.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museEventMapper.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m sessionStore.modelResolution.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/curateRunnerPrompt.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/scanClaimableTasks.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m promptCuration.docsDir.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m crew/harnessRoster.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m flow/dispatch/runnerMatches.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m routes/tasks.aliasWiring.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/stageNormalizers.test.js [2m([22m[2m18 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m reviewDiff.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m continuity/deployFailureReason.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museDiscovery.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/msp/museServeHostPool.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpEventMapper.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m agent/harnesses/muse/museStreamParser.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnessSupportTiers.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/taskIdentity.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/execution/executeStage.cutover.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m agent/harnesses/acp/AcpStreamTransport.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m continuity/sharedGateAttribution.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/dispatch/resolveAliasRequirement.test.js [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/workflowDefaults.test.js [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m flow/settleOperatorAbort.marker.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/stagePolicy.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/dispatch/isDispatchServable.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m continuity/deployStageFailure.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/runAttribution.test.js [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m docsPath.test.js [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m agent/harnesses/vibe/vibeStreamParser.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m stageTags.shared.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m roleHeaders.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/stageLifecycle.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/humanGitSafety.audit.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m work/setEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/dispatch/taskRequirements.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m project/appStatus.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/execution/materializeRunnerTaskDocs.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
[90mstderr[2m | project/aliasRenames.test.js[2m > [22m[2mwarnLegacyNoneHarnessModel[2m > [22m[2mreports the first occurrence per project + alias + harness
[22m[39m[projectStore] Alias "x" in /proj-warn-once targets harness "none", which manages its own model — ignoring the stored model "m". Clear the model in Settings › Model Aliases.

 [32m✓[39m project/aliasRenames.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m flow/execution/executionPure.test.js [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m domainCompatibility.test.js [2m([22m[2m17 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m git/validation.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m work/kickIfRunnable.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m project/retrySettings.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m work/resolveEngineState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m project/projectConfigDiscovery.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m capabilityGuard.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m flow/stageExecution.failureDetails.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m flow/routing/tables/routingTables.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m crew/sessionCapabilities.test.js [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/durableState.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m work/settleWedgedEntryForTask.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m deploy.packaging.test.js [2m([22m[2m15 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m project/gitRemote.test.js [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m projectResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifyQueueEmpty.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m testIsolation.guard.test.js [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifyStagePush.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m flow/scheduler/schedulerPure.test.js [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m sessionResolution.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m flow/scheduler/noDoubleDispatch.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m project/deployCommands.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m flow/dispatch/normalizeCapabilities.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m project/projectSlug.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/taskFiles.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m projectStore.barrel.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m work/notifySchedulerStall.test.js [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m deploy.attemptCheckpoint.test.js [2m([22m[2m26 tests[22m[2m | [22m[33m23 skipped[39m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m config/docs.envCoverage.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m flow/dispatch/selectRunnerForTask.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m testEnvGuard.test.js [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m normalizeBudget.shared.test.js [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m agent/verdictContract.test.js [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [2m[90m↓[39m[22m deployManager.lock.test.js [2m([22m[2m3 tests[22m[2m | [22m[33m3 skipped[39m[2m)[22m

[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 18 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m phase0-dry-run.test.js[2m > [22mPhase 0: Git Branch Foundation Dry-Run[2m > [22mshould create task branch and commit work
[31m[1mGitError[22m: git rev-parse --abbrev-ref HEAD failed (exit 128): fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/18]⎯[22m[39m

[41m[1m FAIL [22m[49m phase0-dry-run.test.js[2m > [22mPhase 0: Git Branch Foundation Dry-Run[2m > [22mshould handle human review and failback
[31m[1mGitError[22m: git rev-parse --abbrev-ref HEAD failed (exit 128): fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/18]⎯[22m[39m

[41m[1m FAIL [22m[49m phase0-dry-run.test.js[2m > [22mPhase 0: Git Branch Foundation Dry-Run[2m > [22mshould merge to main in merge stage
[31m[1mGitError[22m: git checkout main failed (exit 1): error: pathspec 'main' did not match any file(s) known to git[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mdetects modified, added, and deleted files
[31m[1mGitError[22m: git diff --name-status --find-renames --no-color main...feat/test failed (exit 128): fatal: ambiguous argument 'main...feat/test': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mdetects renamed files
[31m[1mGitError[22m: git diff --name-status --find-renames --no-color main...feat/rename failed (exit 128): fatal: ambiguous argument 'main...feat/rename': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mhandles binary files
[31m[1mGitError[22m: git diff --name-status --find-renames --no-color main...feat/binary failed (exit 128): fatal: ambiguous argument 'main...feat/binary': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mreturns correct patch for modified file
[31m[1mGitError[22m: git diff --unified=3 --no-color main...feat/patch -- file1.txt failed (exit 128): fatal: bad revision 'main...feat/patch'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mreturns correct commit list
[31m[1mGitError[22m: git log --no-color --format=%H|%an|%ad|%s main..feat/commits failed (exit 128): fatal: ambiguous argument 'main..feat/commits': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mreturns correct ahead/behind counts
[31m[1mGitError[22m: git rev-list --left-right --count b1...b2 failed (exit 128): fatal: ambiguous argument 'b1...b2': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/18]⎯[22m[39m

[41m[1m FAIL [22m[49m reviewDiff.integration.test.js[2m > [22mreviewDiff Integration Tests[2m > [22mresolves shas correctly
[31m[1mGitError[22m: git rev-parse main failed (exit 128): fatal: ambiguous argument 'main': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'[39m
[36m [2m❯[22m ChildProcess.<anonymous> git/exec.js:[2m159:6[22m[39m
    [90m157|[39m    } else {
    [90m158|[39m     reject(
    [90m159|[39m      new GitError(
    [90m   |[39m      [31m^[39m
    [90m160|[39m       `git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown…
    [90m161|[39m       { code, args, stdout, stderr },

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/18]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/stageCancel.integration.test.js[2m > [22mstage cancel integration (launch + cleanup)[2m > [22mcancel reaps the stage parent AND its grandchild, with no orphans
[31m[1mError[22m: waitForFound timed out: process(es) never appeared[39m
[36m [2m❯[22m waitForFound flow/stageCancel.integration.test.js:[2m60:10[22m[39m
    [90m 58|[39m   if (check()) return;
    [90m 59|[39m   if (Date.now() - started > timeoutMs) {
    [90m 60|[39m    throw new Error("waitForFound timed out: process(es) never appeared…
    [90m   |[39m          [31m^[39m
    [90m 61|[39m   }
    [90m 62|[39m   await new Promise((resolve) => setTimeout(resolve, 50));
[90m [2m❯[22m flow/stageCancel.integration.test.js:[2m145:3[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mGET review returns the diff for a task branch: files, counts, commits newest-first, ahead/behind
[31m[1mAssertionError[22m: expected null to be 'main' // Object.is equality[39m

[32m- Expected:[39m
"main"

[31m+ Received:[39m
null

[36m [2m❯[22m routes/review.test.js:[2m137:29[22m[39m
    [90m135|[39m   expect(review.branch).toBe(branch);
    [90m136|[39m   expect(review.branchSupported).toBe(true);
    [90m137|[39m   expect(review.baseBranch).toBe("main");
    [90m   |[39m                             [31m^[39m
    [90m138|[39m   expect(review.baseSha).toBeTruthy();
    [90m139|[39m   expect(review.headSha).toBeTruthy();

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mGET review records a D2 snapshot commit when the worktree is dirty ON the task branch
[31m[1mAssertionError[22m: expected [] to include 'src/late.js'[39m
[36m [2m❯[22m routes/review.test.js:[2m179:17[22m[39m
    [90m177|[39m   // Snapshot committed: the late file is part of the review.
    [90m178|[39m   const paths = review.files.map((f) => f.path);
    [90m179|[39m   expect(paths).toContain("src/late.js");
    [90m   |[39m                 [31m^[39m
    [90m180|[39m
    [90m181|[39m   // History entry recorded like other transitions.

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mGET review flags uncommittedChanges when the tree is dirty OFF the task branch and never checks out
[31m[1mAssertionError[22m: expected false to be true // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- true[39m
[31m+ false[39m

[36m [2m❯[22m routes/review.test.js:[2m216:37[22m[39m
    [90m214|[39m   });
    [90m215|[39m   const review = JSON.parse(res.payload);
    [90m216|[39m   expect(review.uncommittedChanges).toBe(true);
    [90m   |[39m                                     [31m^[39m
    [90m217|[39m
    [90m218|[39m   // Review must be read-only w.r.t. refs: still on main.

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mPOST comment rejects unknown filePath, over-long body, bad scope, and line comments without a line
[31m[1mAssertionError[22m: expected 200 to be 400 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 400[39m
[31m+ 200[39m

[36m [2m❯[22m routes/review.test.js:[2m347:30[22m[39m
    [90m345|[39m    payload: { scope: "file", filePath: "not/in/diff.js", body: "hi" },
    [90m346|[39m   });
    [90m347|[39m   expect(unknown.statusCode).toBe(400);
    [90m   |[39m                              [31m^[39m
    [90m348|[39m   expect(JSON.parse(unknown.payload).error).toContain("Unknown filePat…
    [90m349|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mrejects bare-filename anchors when the report has a full path
[31m[1mAssertionError[22m: expected 200 to be 400 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 400[39m
[31m+ 200[39m

[36m [2m❯[22m routes/review.test.js:[2m525:26[22m[39m
    [90m523|[39m    payload: { scope: "file", filePath: report.filename, body: "bare na…
    [90m524|[39m   });
    [90m525|[39m   expect(res.statusCode).toBe(400);
    [90m   |[39m                          [31m^[39m
    [90m526|[39m   expect(JSON.parse(res.payload).error).toContain("Unknown filePath");
    [90m527|[39m  });

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/18]⎯[22m[39m

[41m[1m FAIL [22m[49m routes/review.test.js[2m > [22mReview API Integration[2m > [22mpreserved review after merge shows the merged change plus fix-ups, and fix-up files accept comments
[31m[1mAssertionError[22m: expected undefined to be true // Object.is equality[39m

[32m- Expected:[39m
true

[31m+ Received:[39m
undefined

[36m [2m❯[22m routes/review.test.js:[2m589:28[22m[39m
    [90m587|[39m    ).payload,
    [90m588|[39m   );
    [90m589|[39m   expect(review.preserved).toBe(true);
    [90m   |[39m                            [31m^[39m
    [90m590|[39m   expect(review.files.map((f) => f.path)).toContain("src/auth.js");
    [90m591|[39m   expect(review.newSinceMerge.files.map((f) => f.path)).toEqual(["src/…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/18]⎯[22m[39m

[41m[1m FAIL [22m[49m skills/updateAppStatus.skill.test.js[2m > [22mupdate-app-status skill package[2m > [22mships an executable helper script with working --help
[31m[1mError[22m: spawnSync bash ENOENT[39m
[36m [2m❯[22m skills/updateAppStatus.skill.test.js:[2m61:16[22m[39m
    [90m 59|[39m   expect(fs.existsSync(script)).toBe(true);
    [90m 60|[39m   expect(fs.statSync(script).mode & 0o111).toBeTruthy();
    [90m 61|[39m   const help = execFileSync("bash", [script, "--help"], { encoding: "u…
    [90m   |[39m                [31m^[39m
    [90m 62|[39m   expect(help).toContain("--project");
    [90m 63|[39m   expect(help).toContain("--port");

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/18]⎯[22m[39m


[2m Test Files [22m [1m[31m5 failed[39m[22m[2m | [22m[1m[32m345 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (351)[39m
[2m      Tests [22m [1m[31m18 failed[39m[22m[2m | [22m[1m[32m5765 passed[39m[22m[2m | [22m[33m35 skipped[39m[90m (5818)[39m
[2m   Start at [22m 18:40:46
[2m   Duration [22m 121.54s[2m (tests 63%, import 24%, transform 11%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m351 workers spawned[39m[2m · ~128ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~14.85s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (123s)
Running Linting (api)... [0;32mPASS[0m (123s)
Running Linting (frontend)... [0;32mPASS[0m (123s)
Running Frontend Build... [0;32mPASS[0m (123s)
Running Dependency Audit Gate... [0;32mPASS[0m (123s)
Running Harness Self-Tests... [0;31mFAIL[0m (123s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
▶ usesOperatorStack
  ✔ is false when neither operator URL is set (scratch stack is ours) (5.022188ms)
  ✔ is true when either operator URL is set (0.236953ms)
✔ usesOperatorStack (9.429714ms)
▶ isScratchOccupant
  ✔ accepts a scratch API by cwd or command shape (2.102687ms)
  ✔ accepts a scratch vite by its dedicated port flag (0.349391ms)
  ✔ rejects an unrelated occupant on the API port (4.374852ms)
  ✔ rejects an unrelated occupant on the vite port (4.818322ms)
  ✔ rejects a real dev vite on the live dev port (0.288598ms)
  ✔ rejects an arbitrary occupant on an unknown port (0.225038ms)
  ✔ is not fooled by the empty/legacy probe shape (10.786807ms)
✔ isScratchOccupant (23.673934ms)
▶ probeProcess
  ✔ reads cmdline and cwd from /proc on linux (3.448801ms)
  ✔ still classifies when the cwd link is unreadable (0.491986ms)
  ✔ returns null when the process is gone (4.889046ms)
  ✔ falls back to ps on non-linux platforms (0.392816ms)
  ✔ returns null on non-linux when the process is gone (0.292822ms)
✔ probeProcess (17.023987ms)
▶ freeScratchPorts
  ✔ is a no-op when the operator drives their own stack (0.499273ms)
  ✔ frees both scratch ports when their occupants verify (2.805483ms)
  ✔ reports success without touching an already-free port (0.384474ms)
  ✔ fails closed when an occupant does not verify as scratch (1.107852ms)
  ✔ treats an uninspectable occupant as unverified (0.491786ms)
✔ freeScratchPorts (5.554711ms)
▶ scanSourceForDuplicateIdentifiers
  ✔ reports no violations for a clean module (174.636165ms)
  ✔ detects the task-efa802a6 splitReasoning duplicate import (2.700536ms)
  ✔ detects duplicate variable declarations (2.888461ms)
  ✔ detects var redeclarations that the parser permits (1.676977ms)
  ✔ detects an import colliding with a variable declaration (6.761986ms)
  ✔ detects duplicate function declarations (12.580334ms)
  ✔ detects duplicate class declarations (1.217397ms)
  ✔ detects duplicate destructured variable declarations (10.814115ms)
  ✔ detects duplicate default imports (1.423997ms)
  ✔ detects duplicate namespace imports (2.035951ms)
  ✔ detects an exported variable colliding with an import (15.887092ms)
  ✔ detects a named default export colliding with a variable (12.014388ms)
  ✔ ignores identifiers shadowed in nested scopes (11.739851ms)
  ✔ ignores block-scoped redeclarations (5.903456ms)
  ✔ ignores duplicate words inside comments and strings (15.018387ms)
  ✔ ignores re-exports with different names (export { x } from 'y') (0.63228ms)
  ✔ reports re-exports with the same name as a parse error (0.435559ms)
  ✔ ignores export-star (export * from 'y') (0.414438ms)
  ✔ ignores side-effect imports (import 'y') (23.084845ms)
  ✔ ignores anonymous default exports (1.914159ms)
  ✔ reports parse errors as violations (0.759093ms)
  ✔ reports const redeclarations caught by the parser itself (0.440356ms)
  ✔ handles empty source code (26.123535ms)
  ✔ handles source with only comments (8.476587ms)
  ✔ reports multiple duplicates in one file (0.675004ms)
  ✔ includes a remediation message on each violation (0.7701ms)
✔ scanSourceForDuplicateIdentifiers (379.253893ms)
▶ findSourceFilesInDirectory
  ✔ returns only source files, excluding tests and non-JS files (4.779569ms)
  ✔ skips node_modules, dist, and other build directories (0.987984ms)
  ✔ returns an empty array for a nonexistent directory (0.231133ms)
  ✔ throws when directoryPath is missing (1.118468ms)
✔ findSourceFilesInDirectory (7.446093ms)
▶ checkDirectoryForDuplicates
  ✔ cleanly scans the real settings directory (731.152754ms)
  ✔ reports injected duplicates (6.210844ms)
  ✔ fails safe when the target directory has no source files (0.537748ms)
  ✔ fails safe when the target directory does not exist (0.434112ms)
  ✔ scans a custom target directory (0.700709ms)
  ✔ reports syntax errors in scanned files (7.487821ms)
✔ checkDirectoryForDuplicates (746.871881ms)
▶ formatViolationsReport
  ✔ renders a helpful message when there are no violations (0.390103ms)
  ✔ renders a populated report with location and identifier (0.228854ms)
  ✔ renders violations without an identifier name (0.166917ms)
  ✔ renders violations without a message (0.174427ms)
  ✔ handles a missing violationsList gracefully (4.709662ms)
✔ formatViolationsReport (5.913841ms)
▶ hasExampleTag
  ✔ detects @example in a JSDoc block (21.057867ms)
✔ hasExampleTag (22.844421ms)
▶ nearestJsdoc
  ✔ finds an attached block and rejects detached ones (0.473309ms)
✔ nearestJsdoc (0.667275ms)
▶ findPublicExports
  ✔ finds functions, classes, bindings, and defaults with example status (2.824885ms)
  ✔ splits multi-declarator consts under one JSDoc block (0.357421ms)
  ✔ skips re-export lists and export-star (0.287251ms)
  ✔ ignores the word export inside comments and strings (0.227327ms)
  ✔ masks template raw text so apostrophes cannot swallow later exports (2.441682ms)
✔ findPublicExports (6.774883ms)
▶ isDocSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.440257ms)
  ✔ excludes tests, fixtures, mocks, and scripts (0.841764ms)
✔ isDocSourceFile (3.565563ms)
▶ checkMissing
  ✔ passes baselined exports and fails new ones (0.548802ms)
  ✔ fails everything in strict mode (0.246675ms)
  ✔ reports baseline entries that now carry @example (0.217076ms)
✔ checkMissing (1.249412ms)
▶ formatExampleFailure
  ✔ names the export and gives a fix recipe (0.59634ms)
✔ formatExampleFailure (1.486202ms)
▶ committed-tree grandfather proof
  ✔ the baseline covers every currently-missing export (3192.088179ms)
✔ committed-tree grandfather proof (3192.217351ms)
▶ topLevelFunctions
  ✔ counts one top-level declaration (8.084475ms)
  ✔ counts multiple top-level declarations including async and default (0.267546ms)
  ✔ ignores nested declarations and callbacks (0.212141ms)
  ✔ ignores arrow-function constants (2.714217ms)
  ✔ ignores the word function inside comments, strings, and JSDoc examples (0.3548ms)
  ✔ masks template raw text so apostrophes cannot swallow later code (1.454926ms)
  ✔ still sees functions declared inside ${} interpolations at depth (0.987003ms)
✔ topLevelFunctions (17.082346ms)
▶ isSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.638046ms)
  ✔ excludes tests, specs, configs, and out-of-scope roots (2.473653ms)
✔ isSourceFile (3.526963ms)
▶ checkFiles
  ✔ passes single-function and zero-function files (12.835899ms)
  ✔ fails unlisted multi-function files (0.193874ms)
  ✔ grandfathers allowlisted paths that already existed (9.764679ms)
  ✔ still fails an allowlisted path that is newly added (0.188543ms)
  ✔ reports stale allowlist entries for pruning (0.156667ms)
✔ checkFiles (23.49378ms)
▶ formatFailure
  ✔ names the file, the functions, and the remediation (19.062631ms)
✔ formatFailure (19.231139ms)
▶ git integration
  ✔ resolves a diff base or degrades to null outside git (19.148112ms)
  ✔ lists newly-added paths as an array (127.228043ms)
✔ git integration (146.559654ms)
▶ deploy.sh test gates (static contract)
  ✔ runs the fast branches as the final-test-suite gate without canary (31.826992ms)
  ✔ runs the canary suite exactly once as its own blocking canary-e2e gate (5.288738ms)
  ✔ orders the canary-e2e gate after the final-test-suite gate (12.485389ms)
  ✔ skips the canary gate only on exactly KAINBAIN_SKIP_CANARY=1 (fail-safe) (0.708012ms)
✔ deploy.sh test gates (static contract) (65.02406ms)
▶ deploy / npm test parity (executable contract)
  ✔ final-test-suite branches + canary-e2e gate equal the default npm test branches (66.955709ms)
  ✔ fast branches execute the identical command with and without canary (32.653338ms)
  ✔ the canary-e2e gate command matches the gate's Canary Tests branch (31.200906ms)
  ✔ root test:canary delegates to the canary-e2e package suite (0.900627ms)
✔ deploy / npm test parity (executable contract) (142.638859ms)
▶ deploy.sh re-exec line (static contract)
  ✔ waits for the transient unit so its exit code propagates (--wait) (1.785652ms)
  ✔ injects a node-aware PATH into the transient unit (--setenv) (0.694837ms)
✔ deploy.sh re-exec line (static contract) (7.017161ms)
▶ deploy.sh re-exec behaviour (fake systemd-run)
  ✖ passes --wait and a node-aware PATH to systemd-run (8.750909ms)
  ✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (2.847546ms)
  ✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (2.310195ms)
  ✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (4.599762ms)
  ✖ omits the attempt-id setenv on manual runs without an attempt id (2.574087ms)
✖ deploy.sh re-exec behaviour (fake systemd-run) (22.118978ms)
▶ deploy.sh fail-safe contracts (static)
  ✔ skips the canary E2E gate on exactly KAINBAIN_SKIP_CANARY=1 (parity with npm test) (0.972344ms)
  ✔ labels the release snapshot with the pre-increment build (no mislabel) (1.611662ms)
  ✔ guards the STAGE EXIT trap when the stage dir was never created (0.794078ms)
  ✔ fails fast on missing jq/curl before consuming a build number (1.210017ms)
  ✔ creates the deploy dir before taking the rollback lock (0.991886ms)
  ✔ never re-enters auto-rollback through the ERR trap (0.893923ms)
  ✔ never rolls back a healthy deploy over an nginx reload failure (1.251947ms)
  ✔ always leaves a durable result from rollback-mode failures (0.635914ms)
  ✔ never passes --pipe to systemd-run (dead-reader regression, 2026-10-12) (0.602075ms)
  ✔ needs no stdio detach before restart_service (no pipe, no EPIPE) (0.878648ms)
✔ deploy.sh fail-safe contracts (static) (10.556455ms)
▶ deploy.sh re-exec argv (fake systemd-run, no --pipe)
  ✖ omits --pipe from the real re-exec argv while keeping --wait (2.239003ms)
✖ deploy.sh re-exec argv (fake systemd-run, no --pipe) (2.371913ms)
▶ deploy.sh engine heartbeat pump (foreground liveness)
  ✖ emits engine-visible heartbeats while the detached unit runs (6.185333ms)
✖ deploy.sh engine heartbeat pump (foreground liveness) (6.318936ms)
▶ findDeprecationWarnings
  ✔ flags the three build-log warning shapes from the task screenshot (28.941366ms)
  ✔ passes clean build output (including the chunk-size hint) (0.280905ms)
  ✔ an allowlist entry suppresses its matching line only (21.991348ms)
  ✔ an expired allowlist entry does not suppress (0.254907ms)
  ✔ an entry without an expiry date does not suppress (10.55548ms)
  ✔ an entry with an invalid regex pattern fails closed instead of crashing (0.281122ms)
  ✔ an invalid pattern does not break its valid siblings (0.222244ms)
✔ findDeprecationWarnings (69.304353ms)
▶ compileAllowlistPattern
  ✔ compiles a valid pattern (0.461727ms)
  ✔ returns null for a pattern that does not compile (0.336885ms)
✔ compileAllowlistPattern (47.100054ms)
▶ loadBuildAllowlist
  ✔ loads the shipped allowlist file without crashing (0.421165ms)
✔ loadBuildAllowlist (0.552897ms)
▶ check-no-deprecations binary
  ✔ exits 0 and passes output through when the build is clean (781.872142ms)
  ✔ exits non-zero when the build prints a deprecation warning (1615.305023ms)
  ✔ exits non-zero when the build command itself fails (936.519535ms)
✔ check-no-deprecations binary (3333.922795ms)
▶ evaluateAudit
  ✔ reports non-allowlisted high findings as blocking (1.954625ms)
  ✔ ignores moderate and low findings (0.150686ms)
  ✔ an allowlist entry with a valid expiry suppresses its advisory (0.798165ms)
  ✔ an expired allowlist entry does not suppress (0.154793ms)
  ✔ an entry for a different advisory source does not suppress (7.178943ms)
  ✔ tolerates audit output with no vulnerabilities key (0.124956ms)
  ✔ suppresses transitive dependents when the root advisory is allowlisted (6.264144ms)
  ✔ a transitive chain with no reachable advisory stays blocking (0.157341ms)
✔ evaluateAudit (17.52835ms)
▶ resolveDevPlan
  ✔ defaults to API :3100 and frontend :5173 (24.929593ms)
  ✔ honors PORT and VITE_PORT (40.352347ms)
  ✔ supervises the API node process and the Vite npm script (0.450058ms)
  ✔ rejects a garbage port naming the variable (54.87706ms)
✔ resolveDevPlan (128.632119ms)
▶ dev --dry-run
  ✔ prints the plan and exits without touching ports (613.3414ms)
✔ dev --dry-run (613.873194ms)
▶ entry points stay free of Linux-only tooling
  ✔ scripts/run-tests.mjs references no Linux-only tooling (5.211428ms)
  ✔ scripts/depcheck.mjs references no Linux-only tooling (1.395921ms)
  ✔ scripts/dev.mjs references no Linux-only tooling (0.347158ms)
  ✔ scripts/setup.mjs references no Linux-only tooling (0.255605ms)
  ✔ scripts/free-port.mjs references no Linux-only tooling (0.357098ms)
  ✔ scripts/lib/run-parallel.mjs references no Linux-only tooling (1.507655ms)
  ✔ scripts/lib/run-supervised.mjs references no Linux-only tooling (0.322473ms)
  ✔ package.json references no Linux-only tooling (0.223192ms)
✔ entry points stay free of Linux-only tooling (17.053354ms)
▶ root scripts point at the Node runners
  ✔ test runs the Node gate (1.043178ms)
  ✔ dev runs the Node supervisor (12.454242ms)
  ✔ setup runs the Node installer (0.154014ms)
  ✔ depcheck runs the Node fan-out (0.159575ms)
✔ root scripts point at the Node runners (17.497949ms)
▶ workspace test scripts carry no shell env prefix
  ✔ api test runs under Windows cmd (no VAR= prefix) (46.783865ms)
  ✔ frontend test runs under Windows cmd (no VAR= prefix) (0.270017ms)
✔ workspace test scripts carry no shell env prefix (47.225954ms)
▶ run-tests.sh stays a thin shim
  ✔ delegates to the Node gate without its own runner (45.691752ms)
✔ run-tests.sh stays a thin shim (45.810312ms)
▶ installs resolve the way the lockfiles were built
  ✔ root .npmrc pins legacy peer resolution (frontend needs it) (0.91368ms)
✔ installs resolve the way the lockfiles were built (2.3883ms)
▶ isPortOccupied
  ✔ reports false for a free ephemeral port (17.105313ms)
  ✔ reports true for a bound port (1.485107ms)
  ✔ reports false again after the holder closes (4.096084ms)
  ✔ rejects an out-of-range port number (4.42154ms)
✔ isPortOccupied (29.916385ms)
▶ findOccupantPids
  ✔ parses lsof -ti output on linux (36.390358ms)
  ✔ parses lsof -ti output on darwin (1.385986ms)
  ✔ returns an empty list when lsof finds no occupant (exit 1) (2.574869ms)
  ✔ falls back to ss when lsof is missing on linux (5.01583ms)
  ✔ ss fallback only returns pids listening on the requested port (0.41454ms)
  ✔ reports a clear error when neither lsof nor ss exists (0.424895ms)
  ✔ parses netstat -ano output on win32 (2.981264ms)
  ✔ returns an empty list when netstat shows no listener (2.332343ms)
✔ findOccupantPids (54.041346ms)
▶ freePort
  ✔ is a no-op reporting alreadyFree when the port is free (0.620267ms)
  ✔ terminates the occupant and reports freed when the port releases (0.387384ms)
  ✔ escalates to SIGKILL when the occupant ignores SIGTERM (50.304388ms)
  ✔ never kills its own process (12.593434ms)
  ✔ fails with an actionable error when the port never releases (228.959911ms)
  ✔ fails with an actionable error when no occupant pid is found (2.668283ms)
  ✔ terminates a verified occupant when verifyFn approves it (0.309991ms)
  ✔ refuses to kill any occupant when verifyFn rejects it (0.307668ms)
  ✔ treats a throwing verifyFn as unverified instead of killing (2.222819ms)
✔ freePort (298.896155ms)
[remediate] --tasks-dir requires a value
Usage: node scripts/remediate-no-verdict-rejections.mjs [--apply] [--tasks-dir <dir>] [--log <file>] [--no-backup]
[remediate] tasks dir not found: /tmp/kainbain-remediate-absent
[remediate] dry-run: 1 task(s) would be repaired (re-run with --apply)
  - task-1: removed 1 spurious failure(s), repaired 1 report(s), removed stale verdictImplicitPassStages
▶ parseArgs
  ✔ defaults to a dry run that writes nothing (15.863002ms)
  ✔ honours --apply, --no-backup, --tasks-dir, and --log (0.293241ms)
  ✔ lets the last of --apply/--dry-run win (0.277692ms)
  ✔ records an error instead of throwing when a value is missing (0.223376ms)
  ✔ ignores unknown flags (a typo degrades to a dry run, never a write) (4.32858ms)
✔ parseArgs (35.682696ms)
▶ backupPathFor
  ✔ appends .bak (2.784901ms)
✔ backupPathFor (3.007224ms)
▶ remediateTasks
  ✔ reports victims without writing in dry-run mode (19.871008ms)
  ✔ repairs task and report files with backups, then idles on re-run (20.094578ms)
  ✔ leaves a task with only genuine failures byte-identical (11.373556ms)
  ✔ returns an error for a missing tasks dir instead of throwing (0.595871ms)
✔ remediateTasks (53.366538ms)
▶ main
  ✔ exits 2 with usage on argument errors before touching files (17.250654ms)
  ✔ exits 1 on a missing tasks dir (0.298781ms)
  ✔ dry-runs a temp tasks dir and exits 0 (30.102817ms)
✔ main (47.875474ms)
▶ parseArgs
  ✔ defaults to the api suite, 5 runs, no pattern (2.041994ms)
  ✔ parses every flag (15.240609ms)
  ✔ rejects an unknown suite, unknown flag, and non-positive runs (1.486994ms)
  ✔ rejects a flag with no value (2.384588ms)
✔ parseArgs (28.27264ms)
▶ normalizePattern
  ✔ strips the suite directory prefix so the runner resolves the filter in its own workspace (2.552527ms)
  ✔ passes through a bare substring filter unchanged (0.229496ms)
  ✔ rejects an unknown suite (0.280643ms)
✔ normalizePattern (13.185005ms)
▶ buildRepeatCommand
  ✔ targets the suite workspace through npm with no shell (22.973519ms)
  ✔ passes the pattern as a workspace-relative positional filter after -- (3.764844ms)
  ✔ maps canary to its own workspace (2.563523ms)
  ✔ rejects an unknown suite (0.330091ms)
✔ buildRepeatCommand (30.004096ms)
▶ extractFailureSignatures
  ✔ strips ANSI colour and keeps vitest FAIL headlines once each (0.652471ms)
  ✔ falls back to Error lines when the run died before reporting tests (27.97461ms)
  ✔ caps the number of signatures (0.325809ms)
  ✔ returns an empty list for a clean run (9.823203ms)
✔ extractFailureSignatures (61.575064ms)
▶ summarizeRuns
  ✔ counts passes, failing run numbers, and distinct signatures (8.386328ms)
  ✔ reports a zero pass rate for an empty record set without dividing by zero (0.138978ms)
✔ summarizeRuns (8.661478ms)
▶ runRepeat
  ✔ runs the suite N times, logs JSONL + raw output, and reports a green pass rate (22.21534ms)
  ✔ records failures with their signatures and returns ok:false (47.801592ms)
✔ runRepeat (70.278155ms)
▶ runParallel
  ✔ all branches pass -> ok:true with a PASS line per branch (173.369868ms)
  ✔ one branch fails -> ok:false, FAIL names the branch, the other still passes, output shown (1342.928066ms)
  ✔ all branches fail -> ok:false (302.119792ms)
  ✔ seven branches work (mirrors the gate overlap window) (547.516647ms)
  ✔ reports lines in argument order even when a later branch finishes first (1293.69325ms)
  ✔ a missing command fails its branch instead of crashing the run (533.951419ms)
  ✔ passing branch output stays hidden (413.37184ms)
  ✔ lowPriority branches still run (niceness is best-effort) (561.56821ms)
✔ runParallel (5179.013105ms)
▶ runParallel progress output (no silent blackout)
  ✔ announces every branch at spawn, in argument order, before any result line (250.414735ms)
  ✔ emits a still-running tick naming outstanding branches while a slow branch runs (400.90613ms)
  ✔ emits no tick when every branch settles inside the interval (121.221125ms)
  ✔ progressIntervalMs 0 disables the tick entirely (426.437156ms)
  ✔ an injected failing branch still prints its full details unchanged (113.893004ms)
  ✔ resolveProgressIntervalMs: option wins, then env, then the 30s default (0.329582ms)
  ✔ formatElapsedSeconds renders compact human durations (0.302029ms)
✔ runParallel progress output (no silent blackout) (1314.69124ms)
▶ hung-branch guard (a timed-out branch fails the gate, it cannot hang it)
  ✔ reports exit 124 and settles even when the branch never emits close (105.302022ms)
  ✔ keeps the branch's captured output when it is reaped (99.555221ms)
  ✖ reaps the whole branch process tree, not just the direct child (11200.049321ms)
✖ hung-branch guard (a timed-out branch fails the gate, it cannot hang it) (11427.08193ms)
▶ vitest workers: defaults govern (no cap)
  ✔ scripts/run-tests.mjs sets no worker cap (0.359265ms)
  ✔ api vitest config uses vitest defaults (7.277625ms)
  ✔ frontend vitest config uses vitest defaults (0.208065ms)
✔ vitest workers: defaults govern (no cap) (8.033332ms)
▶ api worker pool: thread workers, per-file isolation kept
  ✔ runs the api suite on the threads pool (no fork per file) (0.331389ms)
  ✔ never disables per-file isolation (0.282177ms)
  ✔ keeps the per-file isolation setup file installed (0.155851ms)
✔ api worker pool: thread workers, per-file isolation kept (0.931903ms)
▶ vitest node-env contract: node builtins stay out of shared happy-dom workers
  ✔ no frontend suite imports the api tree (no pin escape hatch) (54.329369ms)
  ✔ every node:-importing suite runs in node env or the forks pool (20.090023ms)
  ✔ every forks-pinned suite is excluded from the main project (no double run) (1.153031ms)
✔ vitest node-env contract: node builtins stay out of shared happy-dom workers (75.773112ms)
▶ runSupervised
  ✔ streams each child's output with its prefix (728.160084ms)
  ✔ resolves with the first child's exit code and stops the sibling (548.997025ms)
  ✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5949.468991ms)
  ✔ a missing command fails the run instead of hanging (75.053166ms)
  ✔ SIGTERM to the supervisor stops every child and resolves ok (542.972293ms)
✖ runSupervised (7850.898375ms)
▶ buildBranches
  ✔ builds the eleven canonical branches in order when bash and docker exist (40.154774ms)
  ✔ every branch spawns a binary with argv (never a shell string) (0.417366ms)
  ✔ unit tests run at normal priority, the rest low (0.453386ms)
  ✔ reports SKIP (non-fatal) for Security Script Tests without bash (0.965125ms)
  ✔ reports SKIP (non-fatal) for Container Tests without a docker daemon (0.560494ms)
  ✔ reports SKIP (non-fatal) for Dependency Check without the depcheck binary (0.43708ms)
  ✔ keeps Dependency Check runnable (low priority, via npm) when the binary exists (0.262075ms)
  ✔ container tests run the docker suite through node --test (1.353638ms)
  ✔ harness self-tests run the ported node suites (not the old shell one) (0.807965ms)
  ✔ includes Canary Tests by default (npm test parity with deploy.sh --prod) (1.182039ms)
  ✔ omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1) (0.476239ms)
  ✔ spawns Canary Tests last as npm run test:canary (0.326703ms)
✔ buildBranches (52.513519ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (0.641209ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.218584ms)
✔ splitGatePhases (1.006424ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.324994ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.129156ms)
  ✔ opts out via --no-canary (0.123163ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.114858ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.133909ms)
  ✔ skip flags win over the legacy opt-in flags (1.563888ms)
✔ resolveCanary (2.657485ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (1.065548ms)
  ✔ reports true when the root tree carries the Windows binary (0.814246ms)
  ✔ reports false when the platform's binary name is missing (0.60057ms)
  ✔ reports false when the root tree has no binaries at all (0.398876ms)
✔ depcheckAvailable (3.139632ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (1.665221ms)
  ✔ returns zero and does not throw when directory does not exist (0.276899ms)
✔ pruneStaleTestDirectories (2.119582ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (7.593122ms)
✔ installSteps (21.156816ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (7.983036ms)
  ✔ root .npmrc documents the per-dir mirrors (8.086299ms)
✔ installSteps npmrc (16.465881ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.325993ms)
  ✔ installs the browser alone on macOS and Windows (10.225831ms)
✔ playwrightAttempts (10.8562ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.320957ms)
✔ npxExecutable (0.573182ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (18.528799ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.755937ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.307044ms)
✔ browserInstallTargets (20.920111ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-NbjElF/Sanity/docs' -> '/tmp/kainbain-sanity-notes-CfdIlF/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-OhIlJG/Sanity/docs' -> '/tmp/kainbain-sanity-notes-GEcDKG/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-OhIlJG/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-GEcDKG/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-OhIlJG/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-GEcDKG/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-mihEEH/Sanity/docs' -> '/tmp/kainbain-sanity-notes-fkKIEH/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-aEJIHH/Sanity/docs' -> '/tmp/kainbain-sanity-notes-LiHLHH/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-aEJIHH/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-LiHLHH/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-aEJIHH/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-LiHLHH/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-FMjClp/Sanity/docs' -> '/tmp/kainbain-sanity-notes-gOaGlp/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-miHHcA/Sanity/docs' -> '/tmp/kainbain-sanity-notes-JnLKcA/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-miHHcA/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-JnLKcA/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-miHHcA/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-JnLKcA/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (21.850505ms)
  ✔ leaves no fixture residue in the OS temp dir (33.716987ms)
✔ checkStorageSanity (57.351264ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.753231ms)
  ✔ rejects a missing entry path or a different file (0.400462ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (896.913849ms)
✔ isMainModule (898.445431ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (31.461911ms)
  ✔ returns 0 when the notes space has no tasks dir (10.982613ms)
✔ countNotesTasks (54.528385ms)
ℹ tests 287
ℹ suites 72
ℹ pass 278
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24736.145397

✖ failing tests:

test at tests/deploy-reexec.test.mjs:101:2
✖ passes --wait and a node-aware PATH to systemd-run (8.750909ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-JcIFpD/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:102:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-JcIFpD/argv.log'
  }

test at tests/deploy-reexec.test.mjs:113:2
✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (2.847546ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-BHePHE/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:114:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-BHePHE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:119:2
✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (2.310195ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-lLlJKE/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:120:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-lLlJKE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:127:2
✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (4.599762ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-geddME/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:133:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-geddME/argv.log'
  }

test at tests/deploy-reexec.test.mjs:140:2
✖ omits the attempt-id setenv on manual runs without an attempt id (2.574087ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-amJHbE/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:141:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-amJHbE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:280:2
✖ omits --pipe from the real re-exec argv while keeping --wait (2.239003ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-nopipe-IEgNoE/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runReexecCapture (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:312:15)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:317:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-nopipe-IEgNoE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:324:2
✖ emits engine-visible heartbeats while the detached unit runs (6.185333ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  null !== 0
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:364:11)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/run-parallel.test.mjs:337:2
✖ reaps the whole branch process tree, not just the direct child (11200.049321ms)
  AssertionError [ERR_ASSERTION]: the grandchild should have been reaped with the branch's process group
  
  true !== false
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/run-parallel.test.mjs:381:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/run-supervised.test.mjs:128:2
✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5949.468991ms)
  AssertionError [ERR_ASSERTION]: grandchild orphaned the wrapper's pipes
  
  false !== true
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/run-supervised.test.mjs:163:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
Running Canary Tests... [0;31mFAIL[0m (70s)
----------------------------------------------------------------------
Details for Canary Tests:

> kainbain@1.0.0 test:canary
> npm run test --prefix canary-e2e


> canary-e2e@1.0.0 test
> node ../scripts/canary-preflight.mjs && playwright test

canary-preflight: port 3399 already free
canary-preflight: port 5299 already free
Port 3399: already free
Port 5299: already free

Running 135 tests using 1 worker

  ✘    1 tests/accessibility.spec.js:69:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › orchestrator view has no axe violations (4ms)
  ✘    2 tests/accessibility.spec.js:74:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations (4ms)
  ✘    3 tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations (5ms)
  ✘    4 tests/accessibility.spec.js:89:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer view has no axe violations (4ms)
  ✘    5 tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations (4ms)
  ✘    6 tests/accessibility.spec.js:101:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations (4ms)
  ✘    7 tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations (4ms)
  ✘    8 tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations (4ms)
  ✘    9 tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations (4ms)
  ✘   10 tests/accessibility.spec.js:146:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations (4ms)
  ✘   11 tests/accessibility.spec.js:157:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) (4ms)
  ✘   12 tests/accessibility.spec.js:177:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus (4ms)
  ✘   13 tests/accessibility.spec.js:186:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape (4ms)
  ✘   14 tests/accessibility.spec.js:198:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus (4ms)
  ✘   15 tests/accessibility.spec.js:211:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape (4ms)
  ✘   16 tests/accessibility.spec.js:243:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar (3ms)
  ✘   17 tests/accessibility.spec.js:272:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations (5ms)
  ✘   18 tests/accessibility.spec.js:278:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations (4ms)
  ✘   19 tests/accessibility.spec.js:284:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations (4ms)
  ✘   20 tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations (4ms)
  ✘   21 tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations (4ms)
  ✘   22 tests/accessibility.spec.js:316:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations (3ms)
  ✘   23 tests/accessibility.spec.js:327:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations (4ms)
  ✘   24 tests/accessibility.spec.js:344:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations (3ms)
  ✘   25 tests/accessibility.spec.js:365:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) (3ms)
  ✘   26 tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL (1ms)
  ✘   27 tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override (2ms)
  ✘   28 tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published (1ms)
  ✓   29 tests/engine-isolation.spec.js:20:6 › scratch-stack engine isolation › containment-state file resolves inside the scratch roots (40ms)
  ✓   30 tests/engine-isolation.spec.js:34:6 › scratch-stack engine isolation › agent stages run on the mock harness, never ambient models (15ms)
  ✘   31 tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console (1ms)
  ✘   32 tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console (1ms)
  ✘   33 tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable (1ms)
  ✘   34 tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit (2ms)
  ✘   35 tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges (3ms)
  ✘   36 tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with engine controls (2ms)
  ✘   37 tests/functional.spec.js:54:6 › KainBain Functional E2E Tests › right rail never overlaps the center transport controls at any supported width (2ms)
  ✘   38 tests/functional.spec.js:134:6 › KainBain Functional E2E Tests › in-place column task creation (2ms)
  ✘   39 tests/functional.spec.js:152:6 › KainBain Functional E2E Tests › project selector lists projects and switches (3ms)
  ✘   40 tests/functional.spec.js:174:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration (3ms)
  ✘   41 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px (1ms)
  ✘   42 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px (1ms)
  ✘   43 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 375px (1ms)
  ✘   44 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px (1ms)
  ✘   45 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px (1ms)
  ✘   46 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px (1ms)
  ✘   47 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px (2ms)
  ✘   48 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px (1ms)
  ✘   49 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px (1ms)
  ✘   50 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 859px (2ms)
  ✘   51 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1024px (1ms)
  ✘   52 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1280px (1ms)
  ✘   53 tests/homepage.spec.js:4:5 › homepage has correct title (2ms)
  ✘   54 tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit (2ms)
  ✘   55 tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip (3ms)
  ✘   56 tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column (3ms)
  ✘   57 tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls (3ms)
  ✘   58 tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping (3ms)
  ✘   59 tests/mobile-responsive.spec.js:113:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) (3ms)
  ✘   60 tests/mobile-responsive.spec.js:142:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) (7ms)
  ✘   61 tests/mobile-responsive.spec.js:158:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) (8ms)
  ✘   62 tests/mobile-responsive.spec.js:210:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover (2ms)
  ✘   63 tests/mobile-responsive.spec.js:225:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip (3ms)
  ✘   64 tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed (3ms)
  ✘   65 tests/mobile-responsive.spec.js:263:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector (3ms)
  ✘   66 tests/mobile-responsive.spec.js:341:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen (3ms)
  ✘   67 tests/mobile-responsive.spec.js:368:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover (2ms)
  ✘   68 tests/mobile-responsive.spec.js:408:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport (3ms)
  ✘   69 tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B (15ms)
  ✘   70 tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected (15ms)
  ✘   71 tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (2ms)
  -   72 tests/pr-review.spec.js:349:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7)
  -   73 tests/pr-review.spec.js:391:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff
  -   74 tests/pr-review.spec.js:487:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow
  ✘   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (1ms)
  ✘   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (2ms)
  ✘   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (2ms)
  ✘   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (3ms)
  ✘   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2ms)
  ✘   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2ms)
  ✘   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (3ms)
  ✘   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2ms)
  ✘   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (3ms)
  ✘   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (3ms)
  ✘   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2ms)
  ✘   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (3ms)
  ✘   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (1ms)
  ✘   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (1ms)
  ✘   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (5ms)
  ✘   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (4ms)
  ✘   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (4ms)
  ✘   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (5ms)
  ✘   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (2ms)
  ✘   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2ms)
  ✘   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (3ms)
  ✘   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2ms)
  ✘   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (3ms)
  ✘   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (3ms)
  ✘   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2ms)
  ✘  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (3ms)
  ✘  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2ms)
  ✘  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (4ms)
  ✘  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (3ms)
  ✘  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (1ms)
  ✘  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (3ms)
  ✘  106 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (4ms)
  ✘  107 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (7ms)
  ✘  108 tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (3ms)
  ✘  109 tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3ms)
  ✘  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (3ms)
  ✘  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3ms)
  ✘  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (1ms)
  -  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout
  -  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page
  ✘  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (3ms)
  ✘  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3ms)
  ✘  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (11ms)
  ✘  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (4ms)
  ✘  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3ms)
  ✘  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (4ms)
  ✘  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (3ms)
  ✘  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (4ms)
  ✘  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3ms)
  ✘  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (3ms)
  ✘  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (3ms)
  ✘  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2ms)
  ✘  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (3ms)
  ✘  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2ms)
  ✘  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (3ms)
  ✘  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2ms)
  ✘  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3ms)
  ✘  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (3ms)
  ✘  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Engine controls: Start engine, skip current stage, and Look Back in Now Playing Bar (4ms)
  ✘  134 tests/workflow.spec.js:99:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3ms)
  ✘  135 tests/workflow.spec.js:116:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3ms)


  1) tests/accessibility.spec.js:69:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › orchestrator view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-60249--view-has-no-axe-violations/error-context.md

  2) tests/accessibility.spec.js:74:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-bc793--view-has-no-axe-violations/error-context.md

  3) tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-824ca--tray-has-no-axe-violations/error-context.md

  4) tests/accessibility.spec.js:89:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-1f429--view-has-no-axe-violations/error-context.md

  5) tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-77cb9--view-has-no-axe-violations/error-context.md

  6) tests/accessibility.spec.js:101:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-90adb--view-has-no-axe-violations/error-context.md

  7) tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-29414--view-has-no-axe-violations/error-context.md

  8) tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-ab226--view-has-no-axe-violations/error-context.md

  9) tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-6f0c2-ards-have-no-axe-violations/error-context.md

  10) tests/accessibility.spec.js:146:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-977ed--view-has-no-axe-violations/error-context.md

  11) tests/accessibility.spec.js:157:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-d25f1--7-1-node-negative-control-/error-context.md

  12) tests/accessibility.spec.js:177:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-6d109-chable-and-visible-on-focus/error-context.md

  13) tests/accessibility.spec.js:186:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-44f1c-t-dropdown-closes-on-Escape/error-context.md

  14) tests/accessibility.spec.js:198:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-ad6f8-n-Escape-and-restores-focus/error-context.md

  15) tests/accessibility.spec.js:211:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-db734--inspector-closes-on-Escape/error-context.md

  16) tests/accessibility.spec.js:243:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-b5155--task-in-the-NowPlaying-bar/error-context.md

  17) tests/accessibility.spec.js:272:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-635bb--view-has-no-axe-violations/error-context.md

  18) tests/accessibility.spec.js:278:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-9b4b5-odels-has-no-axe-violations/error-context.md

  19) tests/accessibility.spec.js:284:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-6d46d--view-has-no-axe-violations/error-context.md

  20) tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-2dcd0--open-has-no-axe-violations/error-context.md

  21) tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-daca0--view-has-no-axe-violations/error-context.md

  22) tests/accessibility.spec.js:316:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-0adc5-setup-has-no-axe-violations/error-context.md

  23) tests/accessibility.spec.js:327:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-7e818-tatus-has-no-axe-violations/error-context.md

  24) tests/accessibility.spec.js:344:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-5ee16--open-has-no-axe-violations/error-context.md

  25) tests/accessibility.spec.js:365:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/accessibility-Accessibilit-668eb--controls-negative-control-/error-context.md

  26) tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/app-status-App-status-goto-fdb6d-hen-the-API-publishes-a-URL/error-context.md

  27) tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/app-status-App-status-goto-5f22e-rs-the-networkHost-override/error-context.md

  28) tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/app-status-App-status-goto-19b05--—-when-no-URL-is-published/error-context.md

  29) tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/footer-overlay-Footer-over-5216c--collapsed-activity-console/error-context.md

    Error Context: test-results/footer-overlay-Footer-over-5216c--collapsed-activity-console/error-context.md

  30) tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/footer-overlay-Footer-over-70ccb-n-expanded-activity-console/error-context.md

    Error Context: test-results/footer-overlay-Footer-over-70ccb-n-expanded-activity-console/error-context.md

  31) tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/footer-overlay-Footer-over-795e0-eeps-its-controls-clickable/error-context.md

    Error Context: test-results/footer-overlay-Footer-over-795e0-eeps-its-controls-clickable/error-context.md

  32) tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-b6164-ng-and-orchestrator-cockpit/error-context.md

  33) tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-a2e2b-ge-columns-with-type-badges/error-context.md

  34) tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with engine controls 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-cfcbc-ng-bar-with-engine-controls/error-context.md

  35) tests/functional.spec.js:54:6 › KainBain Functional E2E Tests › right rail never overlaps the center transport controls at any supported width 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-4999a-rols-at-any-supported-width/error-context.md

  36) tests/functional.spec.js:134:6 › KainBain Functional E2E Tests › in-place column task creation 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-0b335--place-column-task-creation/error-context.md

  37) tests/functional.spec.js:152:6 › KainBain Functional E2E Tests › project selector lists projects and switches 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔═════════════════════════════���══════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-b427a-lists-projects-and-switches/error-context.md

  38) tests/functional.spec.js:174:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/functional-KainBain-Functi-cee4d-s-per-project-configuration/error-context.md

  39) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-eb052-r-overlap-nor-clip-at-320px/error-context.md

  40) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-0becc-r-overlap-nor-clip-at-360px/error-context.md

  41) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 375px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-c8455-r-overlap-nor-clip-at-375px/error-context.md

  42) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-9d4fd-r-overlap-nor-clip-at-390px/error-context.md

  43) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-dc06a-r-overlap-nor-clip-at-414px/error-context.md

  44) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-5dc46-r-overlap-nor-clip-at-430px/error-context.md

  45) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-d1245-r-overlap-nor-clip-at-480px/error-context.md

  46) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-dbd5c-r-overlap-nor-clip-at-640px/error-context.md

  47) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-64c6e-r-overlap-nor-clip-at-768px/error-context.md

  48) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 859px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-814b8-r-overlap-nor-clip-at-859px/error-context.md

  49) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1024px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-2ca85--overlap-nor-clip-at-1024px/error-context.md

  50) tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1280px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/header-responsive-Header-r-190cb--overlap-nor-clip-at-1280px/error-context.md

  51) tests/homepage.spec.js:4:5 › homepage has correct title ──────────────────────────────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/homepage-homepage-has-correct-title/error-context.md

  52) tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit ──────────────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/homepage-homepage-displays-the-orchestrator-cockpit/error-context.md

  53) tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-95a5c-e-column-selector-tab-strip/error-context.md

  54) tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-d37ac-ys-the-corresponding-column/error-context.md

  55) tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-f02e9-h-accessible-touch-controls/error-context.md

  56) tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-62688-re-visible-without-clipping/error-context.md

  57) tests/mobile-responsive.spec.js:113:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-bf790-ile-task-7a411b12-c213d3a9-/error-context.md

  58) tests/mobile-responsive.spec.js:142:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-2da42-top-task-7a411b12-c213d3a9-/error-context.md

  59) tests/mobile-responsive.spec.js:158:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-R-07fba-ty-on-mobile-task-7a411b12-/error-context.md

  60) tests/mobile-responsive.spec.js:210:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-t-880aa-enu-never-a-tooltip-popover/error-context.md

  61) tests/mobile-responsive.spec.js:225:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-t-10d39-t-without-popping-a-tooltip/error-context.md

  62) tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-t-7b83b-pector-and-it-can-be-closed/error-context.md

  63) tests/mobile-responsive.spec.js:263:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-t-3980a-thout-opening-the-inspector/error-context.md

  64) tests/mobile-responsive.spec.js:341:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Header-c-34693-h-floor-and-stays-on-screen/error-context.md

  65) tests/mobile-responsive.spec.js:368:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Desktop--0cf89-k-and-tooltip-only-on-hover/error-context.md

  66) tests/mobile-responsive.spec.js:408:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/mobile-responsive-Mobile-s-541b2-t-and-clear-within-viewport/error-context.md

  67) tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  68) tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/now-playing-cross-project--003a9-another-project-is-selected/error-context.md

    Error Context: test-results/now-playing-cross-project--003a9-another-project-is-selected/error-context.md

  69) tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/pr-review-PR-Review-E2E-op-06c1d-review-stale-→-pass-→-merge/error-context.md

  70) tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/reasoning-levels-browser-R-ef95b-lid-handling-null-harnesses/error-context.md

  71) tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-chat-retrosp-ca34e--then-the-reply-replaces-it/error-context.md

  72) tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-chat-retrosp-f414d--and-toasts-with-a-way-back/error-context.md

  73) tests/retrospective.spec.js:13:5 › retrospective page renders without page errors ────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospective-page-renders-without-page-errors/error-context.md

  74) tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-cd6dc-renders-without-page-errors/error-context.md

  75) tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-7ab9b-a-time-behind-the-tab-strip/error-context.md

  76) tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-7707c-ls-keep-touch-sized-targets/error-context.md

  77) tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-9232c--the-vertical-scroll-region/error-context.md

  78) tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-70466-page-never-scrolls-sideways/error-context.md

  79) tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/retrospective-retrospectiv-65b2b-p-and-shows-all-three-panes/error-context.md

  80) tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors ─────────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/runtime-errors-app-renders-without-uncaught-page-errors/error-context.md

  81) tests/runtime-errors.spec.js:23:5 › app renders without console errors ───────────────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/runtime-errors-app-renders-without-console-errors/error-context.md

  82) tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/settings-Settings-save-rou-07336-s-persist-across-UI-and-API/error-context.md

  83) tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/settings-Settings-save-rou-999ef-and-keeps-the-stored-config/error-context.md

  84) tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/survey-verify-question-me--c8135-o-survey-file-skip-advances/error-context.md

    Error Context: test-results/survey-verify-question-me--c8135-o-survey-file-skip-advances/error-context.md

  85) tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/survey-verify-question-me--a7aff-nces-file-stays-append-only/error-context.md

    Error Context: test-results/survey-verify-question-me--a7aff-nces-file-stays-append-only/error-context.md

  86) tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/survey-verify-question-me--97851-ders-answers-and-fits-375px/error-context.md

    Error Context: test-results/survey-verify-question-me--97851-ders-answers-and-fits-375px/error-context.md

  87) tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/survey-verify-question-me--c631c-ia-continue-without-parking/error-context.md

    Error Context: test-results/survey-verify-question-me--c631c-ia-continue-without-parking/error-context.md

  88) tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-10449-t-on-mobile-across-all-tabs/error-context.md

  89) tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-c9ee1--on-a-short-mobile-viewport/error-context.md

  90) tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-b3188-ls-never-covers-the-tab-bar/error-context.md

  91) tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-90f3e-s-at-full-height-on-desktop/error-context.md

  92) tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-b8fb6-rt-never-covers-the-tab-bar/error-context.md

  93) tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-26f59--unknown-section-falls-back/error-context.md

  94) tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-764f2-mains-on-the-settings-route/error-context.md

  95) tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-3b7a8-em-Settings-in-a-new-window/error-context.md

  96) tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/system-settings-mobile-Sys-cdee0--navigation-no-popout-trap-/error-context.md

  97) tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-editing-Task-view-edi-c73ec-t-the-end-title-line-intact/error-context.md

  98) tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-editing-Task-view-edi-431ba-ip-preserves-edited-content/error-context.md

  99) tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-errors-Task-view-erro-70461-ith-a-Show-more-less-toggle/error-context.md

  100) tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-inspector-Task-inspec-5894b-it-mode-with-context-tokens/error-context.md

  101) tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-inspector-Task-inspec-3e91e-t-tokens-edit-restores-them/error-context.md

  102) tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-inspector-Task-inspec-2fcff-nd-keeps-the-inspector-open/error-context.md

  103) tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  104) tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  105) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  106) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  107) tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/task-logs-Agent-log-readab-f3e6a-nders-readably-across-feeds/error-context.md

  108) tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state ─────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-Visuals-Desktop-Empty-state/error-context.md

  109) tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-e80ca-cution-task-card-in-canvas-/error-context.md

  110) tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-bc914-history-tasks-session-tree-/error-context.md

  111) tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state ──────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-Visuals-Tablet-Empty-state/error-context.md

  112) tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-8c0a5-cution-task-card-in-canvas-/error-context.md

  113) tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-46fe0-history-tasks-session-tree-/error-context.md

  114) tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ──────────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-Visuals-Mobile-Empty-state/error-context.md

  115) tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-41220-cution-task-card-in-canvas-/error-context.md

  116) tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-dashboard-Dashboard-d581d-history-tasks-session-tree-/error-context.md

  117) tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-header-Header-Visua-a97ef-header-band-at-Mobile-375px/error-context.md

  118) tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-header-Header-Visua-3fb0f-eader-band-at-Tablet-1024px/error-context.md

  119) tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-header-Header-Visua-73da6-ader-band-at-Desktop-1280px/error-context.md

  120) tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop ─────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-homepage-Homepage-Visuals-visual-regression---Desktop/error-context.md

  121) tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet ──────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-homepage-Homepage-Visuals-visual-regression---Tablet/error-context.md

  122) tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile ──────────

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/visual-homepage-Homepage-Visuals-visual-regression---Mobile/error-context.md

  123) tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/websocket-frontend-connect-33560--and-receives-the-handshake/error-context.md

  124) tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/workflow-Workflow-E2E-Test-a0b86-ard-appears-in-kanban-stage/error-context.md

  125) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  126) tests/workflow.spec.js:66:6 › Workflow E2E Tests › Engine controls: Start engine, skip current stage, and Look Back in Now Playing Bar 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/workflow-Workflow-E2E-Test-b9c90-ook-Back-in-Now-Playing-Bar/error-context.md

  127) tests/workflow.spec.js:99:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/workflow-Workflow-E2E-Test-b0511-ject-loads-its-own-workflow/error-context.md

  128) tests/workflow.spec.js:116:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel 

    Error: browserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/error-context.md

  128 failed
    tests/accessibility.spec.js:69:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › orchestrator view has no axe violations 
    tests/accessibility.spec.js:74:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings view has no axe violations 
    tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations 
    tests/accessibility.spec.js:89:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer view has no axe violations 
    tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 
    tests/accessibility.spec.js:101:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations 
    tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:146:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations 
    tests/accessibility.spec.js:157:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) 
    tests/accessibility.spec.js:177:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 
    tests/accessibility.spec.js:186:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 
    tests/accessibility.spec.js:198:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus 
    tests/accessibility.spec.js:211:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:243:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/accessibility.spec.js:272:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
    tests/accessibility.spec.js:278:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:284:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 
    tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 
    tests/accessibility.spec.js:316:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations 
    tests/accessibility.spec.js:327:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 
    tests/accessibility.spec.js:344:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations 
    tests/accessibility.spec.js:365:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 
    tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL 
    tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override 
    tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published 
    tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console 
    tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit 
    tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges 
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with engine controls 
    tests/functional.spec.js:54:6 › KainBain Functional E2E Tests › right rail never overlaps the center transport controls at any supported width 
    tests/functional.spec.js:134:6 › KainBain Functional E2E Tests › in-place column task creation ─
    tests/functional.spec.js:152:6 › KainBain Functional E2E Tests › project selector lists projects and switches 
    tests/functional.spec.js:174:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 375px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 859px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1024px 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1280px 
    tests/homepage.spec.js:4:5 › homepage has correct title ────────────────────────────────────────
    tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit ────────────────────────
    tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip 
    tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column 
    tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls 
    tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping 
    tests/mobile-responsive.spec.js:113:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:142:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:158:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 
    tests/mobile-responsive.spec.js:210:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover 
    tests/mobile-responsive.spec.js:225:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip 
    tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 
    tests/mobile-responsive.spec.js:263:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 
    tests/mobile-responsive.spec.js:341:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen 
    tests/mobile-responsive.spec.js:368:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover 
    tests/mobile-responsive.spec.js:408:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport 
    tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected 
    tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 
    tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses 
    tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it 
    tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back 
    tests/retrospective.spec.js:13:5 › retrospective page renders without page errors ──────────────
    tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors ─
    tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip 
    tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets 
    tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region 
    tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways 
    tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes 
    tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors ───────────────────
    tests/runtime-errors.spec.js:23:5 › app renders without console errors ─────────────────────────
    tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API 
    tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config 
    tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances 
    tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only 
    tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px 
    tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking 
    tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs 
    tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport 
    tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar 
    tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop 
    tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar 
    tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back 
    tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route 
    tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window 
    tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle 
    tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state ────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state ─────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ─────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop ────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet ─────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile ─────────────
    tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake 
    tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Engine controls: Start engine, skip current stage, and Look Back in Now Playing Bar 
    tests/workflow.spec.js:99:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow 
    tests/workflow.spec.js:116:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel 
  5 did not run
  2 passed (1.2m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.