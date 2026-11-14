<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Can you make sure the create tasks skill is able to create pretty tasks. Looking at recent task created by the created kainbain task skill they end up being a little ugly and just big paragraphs.  Please do as follows: A) Make sure the api can accept nice looking markdown tasks including codeblocks, mermaid diagrams and image references B) Re-structure the skill so it recommends writing each task as its own MARKDOWN file in its task directory then sending them accross (hopefully to trick agents into making it a more readable bit of documentation) We should still continue the existing behaviour such as the first line title and blocking behaviour just want to make the tasks more human readable. (Which hopefully a two stage execution can do)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 159.347s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 896ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (36 files in 97ms)
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
Running Unit Tests (api)... [0;31mFAIL[0m (151s)
----------------------------------------------------------------------
Details for Unit Tests (api):
(trimmed 10717 of 10837 lines; showing the tail)
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/applyRunnerReport.test.js:[2m62:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[478/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/applyRunnerReport.test.js[2m > [22mThe Flow: applyRunnerReport Runner attribution[2m > [22mrecords the Runner on the Failed row and failure report
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/applyRunnerReport.test.js:[2m100:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[479/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/applyRunnerReport.test.js[2m > [22mThe Flow: applyRunnerReport verdict double-check (old-Runner protection)[2m > [22mB1: passed + well-formed FAIL on an agent stage fails back with rejected
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/applyRunnerReport.test.js:[2m170:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[480/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/applyRunnerReport.test.js[2m > [22mThe Flow: applyRunnerReport verdict double-check (old-Runner protection)[2m > [22mB2: passed + reasonless FAIL still advances (fail-open preserved)
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/applyRunnerReport.test.js:[2m206:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[481/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/applyRunnerReport.test.js[2m > [22mThe Flow: applyRunnerReport verdict double-check (old-Runner protection)[2m > [22mB3: passed + FAIL block on human and CI stages advances unaffected
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/applyRunnerReport.test.js:[2m233:27[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[482/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/executeStage.autoApprove.test.js[2m > [22mexecuteStage human re-park stamping[2m > [22mstarts a fresh wait from the parking moment, not the stale entry time
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/executeStage.autoApprove.test.js:[2m51:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[483/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/executeStage.autoApprove.test.js[2m > [22mexecuteStage human re-park stamping[2m > [22mleaves a live wait untouched on re-execute (no extension, no reminder reset)
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/executeStage.autoApprove.test.js:[2m85:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[484/496]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/execution/executeStage.autoApprove.test.js[2m > [22mexecuteStage human re-park stamping[2m > [22mclears a stale stamp when the stage carries no hold
[31m[1mReferenceError[22m: opts is not defined[39m
[36m [2m❯[22m createTask work/taskLifecycle.js:[2m300:9[22m[39m
    [90m298|[39m   title: taskTitle,
    [90m299|[39m   goal: taskGoal,
    [90m300|[39m   body: opts.body || taskGoal,
    [90m   |[39m         [31m^[39m
    [90m301|[39m   prompt: "",
    [90m302|[39m   currentStageId: resolvedStageId,
[90m [2m❯[22m TaskStore.createTask taskStore.js:[2m462:31[22m[39m
[90m [2m❯[22m flow/execution/executeStage.autoApprove.test.js:[2m115:22[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[485/496]⎯[22m[39m


[2m Test Files [22m [1m[31m52 failed[39m[22m[2m | [22m[1m[32m391 passed[39m[22m[90m (443)[39m
[2m      Tests [22m [1m[31m493 failed[39m[22m[2m | [22m[1m[32m6626 passed[39m[22m[2m | [22m[33m65 skipped[39m[90m (7184)[39m
[2m   Start at [22m 15:04:03
[2m   Duration [22m 149.71s[2m (tests 66%, import 22%, transform 10%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m443 workers spawned[39m[2m · ~105ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~15.39s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;32mPASS[0m (151s)
Running Unit Tests (runner)... [0;32mPASS[0m (151s)
Running Linting (api)... [0;32mPASS[0m (151s)
Running Linting (frontend)... [0;32mPASS[0m (151s)
Running Frontend Build... [0;32mPASS[0m (151s)
Running Security Script Tests... [0;32mPASS[0m (151s)
Running Dependency Check... [0;32mPASS[0m (151s)
Running Dependency Audit Gate... [0;32mPASS[0m (151s)
Running Harness Self-Tests... [0;32mPASS[0m (151s)
Running Container Tests... [0;32mPASS[0m (151s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.