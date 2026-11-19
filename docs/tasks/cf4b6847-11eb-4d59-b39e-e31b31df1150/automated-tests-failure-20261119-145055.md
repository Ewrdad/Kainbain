<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add per pipeline configurable main branch this meaans users should be okay to use non-main as the base branch ## example workflow 1) I want to work towards a new feature. So I manually create a feature branch 2) I create a new pipeline or two with the main configured to this feature branch 3) I create a new task, creating a standard branch off the feature branch rather than main 4) work is done on feature branch 5) merge stage merges change back into feature branch 6) 3-5 continue till I am happy with feature.  this will also be used to fit work into a standard ticket workflow
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 255.413s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648 (verdict.json + untrimmed failed-branch logs land here)
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 1s

found 0 vulnerabilities
Workspace dependencies installed (canary-e2e).
✅ Settings duplicate check passed (37 files in 148ms)
✅ Frontend imports check passed (754 files in 438ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Linting (frontend) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;31mFAIL[0m (244s)
----------------------------------------------------------------------
Details for Unit Tests (api):
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-api.full.log
(trimmed 4405 of 4525 lines; showing the tail)

[36m [2m❯[22m taskStore.test.js:[2m3708:30[22m[39m
    [90m3706|[39m   });
    [90m3707|[39m
    [90m3708|[39m   expect(task.failureReason).toContain("does not exist");
    [90m   |[39m                              [31m^[39m
    [90m3709|[39m   expect(task.currentStageId).toBe("dev");
    [90m3710|[39m  });

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/10]⎯[22m[39m

[41m[1m FAIL [22m[49m taskStore.test.js[2m > [22mTaskStore branch support & merge stage[2m > [22mmerge stage without branch mode still merges the derived branch (kb/<taskId>)
[31m[1mAssertionError[22m: expected 'failed' to be 'passed' // Object.is equality[39m

Expected: [32m"[7mpass[27med"[39m
Received: [31m"[7mfail[27med"[39m

[36m [2m❯[22m taskStore.test.js:[2m3732:25[22m[39m
    [90m3730|[39m   });
    [90m3731|[39m
    [90m3732|[39m   expect(result.status).toBe("passed");
    [90m   |[39m                         [31m^[39m
    [90m3733|[39m   // The merge stage operates on the derived task branch even without …
    [90m3734|[39m   expect(gitHelpers.squashMergeBranch).toHaveBeenCalledWith(

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/10]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/mergeReviewBaseline.test.js[2m > [22mexecuteMergeStage review baseline hook[2m > [22mrecords the baseline on merge success with the pre-merge main SHA
[31m[1mAssertionError[22m: expected 'failed' to be 'passed' // Object.is equality[39m

Expected: [32m"[7mpass[27med"[39m
Received: [31m"[7mfail[27med"[39m

[36m [2m❯[22m flow/mergeReviewBaseline.test.js:[2m289:25[22m[39m
    [90m287|[39m    execRunner: okRunner,
    [90m288|[39m   });
    [90m289|[39m   expect(result.status).toBe("passed");
    [90m   |[39m                         [31m^[39m
    [90m290|[39m   expect(task.reviewBaseline).toMatchObject({
    [90m291|[39m    baseSha: MAIN_SHA,

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/10]⎯[22m[39m

[41m[1m FAIL [22m[49m flow/mergeReviewBaseline.test.js[2m > [22mexecuteMergeStage review baseline hook[2m > [22mstill passes the merge when baseline capture itself fails
[31m[1mAssertionError[22m: expected 'failed' to be 'passed' // Object.is equality[39m

Expected: [32m"[7mpass[27med"[39m
Received: [31m"[7mfail[27med"[39m

[36m [2m❯[22m flow/mergeReviewBaseline.test.js:[2m325:25[22m[39m
    [90m323|[39m    execRunner: okRunner,
    [90m324|[39m   });
    [90m325|[39m   expect(result.status).toBe("passed");
    [90m   |[39m                         [31m^[39m
    [90m326|[39m   expect(task.reviewBaseline).toBeUndefined();
    [90m327|[39m  });

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/10]⎯[22m[39m

[41m[1m FAIL [22m[49m work/taskPersistence.test.js[2m > [22mThe Work: reliability-sample persistence[2m > [22mround-trips the pinned base branch through task.md frontmatter
[31m[1mAssertionError[22m: expected '---\nid: "task-base-1"\nprojectId: "p…' to contain 'baseBranch: feature/x'[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- baseBranch: feature/x[39m
[31m+ ---[39m
[31m+ id: "task-base-1"[39m
[31m+ projectId: "proj-1"[39m
[31m+ workflowId: "wf-x"[39m
[31m+ branch: "kb/task-base-1"[39m
[31m+ baseBranch: [7m"[27mfeature/x[7m"[27m[39m
[31m+ reviewBaseline: ""[39m
[31m+ title: "Based task"[39m
[31m+ status: "in_stage"[39m
[31m+ resumedAfterInterruption: false[39m
[31m+ interruptedAt: ""[39m
[31m+ surveyPending: false[39m
[31m+ currentStageId: ""[39m
[31m+ createdAt: "2026-11-19T00:00:00.000Z"[39m
[31m+ updatedAt: "2026-11-19T00:00:00.000Z"[39m
[31m+ enteredStageAt: ""[39m
[31m+ timeInStage: 0[39m
[31m+ reportMetadata: "[]"[39m
[31m+ reliabilitySamples: "[]"[39m
[31m+ timelineMetadata: "[]"[39m
[31m+ autoIterationCount: 0[39m
[31m+ autoRetrying: false[39m
[31m+ autoIterating: false[39m
[31m+ failbackWarningsSent: "[]"[39m
[31m+ outputReport: ""[39m
[31m+ feedback: ""[39m
[31m+ blockedBy: "[]"[39m
[31m+ ---[39m
[31m+[39m
[31m+ # Goal[39m
[31m+ Based task[39m
[31m+[39m
[31m+ # History[39m
[31m+ - (no history recorded)[39m

[36m [2m❯[22m work/taskPersistence.test.js:[2m164:19[22m[39m
    [90m162|[39m    "utf8",
    [90m163|[39m   );
    [90m164|[39m   expect(content).toContain("baseBranch: feature/x");
    [90m   |[39m                   [31m^[39m
    [90m165|[39m
    [90m166|[39m   const rehydrated = parseTaskMarkdown(store, content, "task-base-1", …

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯[22m[39m


[2m Test Files [22m [1m[31m4 failed[39m[22m[2m | [22m[1m[32m452 passed[39m[22m[90m (456)[39m
[2m      Tests [22m [1m[31m10 failed[39m[22m[2m | [22m[1m[32m7507 passed[39m[22m[2m | [22m[33m3 skipped[39m[90m (7520)[39m
[2m   Start at [22m 14:46:52
[2m   Duration [22m 241.40s[2m (tests 69%, import 20%, transform 10%, setup 1%, worker 1%)[22m

[2m    Isolate [22m [33m456 workers spawned[39m[2m · ~141ms startup each (spawn + environment, per file)[22m
[2m            [22m [2mat least ~21.28s faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;31mFAIL[0m (244s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-frontend.full.log
(trimmed 23171 of 23291 lines; showing the tail)
          [36m</span>[39m
          [0m Create New Named Workflow[0m
        [36m</h3>[39m
        [36m<form[39m
          [33mclass[39m=[32m"space-y-3"[39m
        [36m>[39m
          [36m<div[39m
            [33mclass[39m=[32m"grid grid-cols-1 md:grid-cols-2 gap-3"[39m
          [36m>[39m
            [36m<div>[39m
              [36m<label[39m
                [33mclass[39m=[32m"block text-[10px] font-bold uppercase text-text-muted mb-1"[39m
                [33mfor[39m=[32m"new-wf-name"[39m
              [36m>[39m
                [0mWorkflow Name[0m
              [36m</label>[39m
              [36m<input[39m
                [33mclass[39m=[32m"w-full p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"[39m
                [33mid[39m=[32m"new-wf-name"[39m
                [33mplaceholder[39m=[32m"e.g. Hotfix Pipeline, Release Track..."[39m
                [33mrequired[39m=[32m""[39m
                [33mtype[39m=[32m"text"[39m
                [33mvalue[39m=[32m""[39m
              [36m/>[39m
            [36m</div>[39m
            [36m<div>[39m
              [36m<label[39m
                [33mclass[39m=[32m"block text-[10px] font-bold uppercase text-text-muted mb-1"[39m
                [33mfor[39m=[32m"new-wf-template"[39m
              [36m>[39m
                [0mInitial Pipeline Template[0m
              [36m</label>[39m
              [36m<div[39m
                [33mclass[39m=[32m"relative text-left block w-full min-w-0"[39m
                [33mdata-testid[39m=[32m"select-dropdown-container"[39m
              [36m>[39m
                [36m<button[39m
                  [33maria-controls[39m=[32m"new-wf-template-listbox"[39m
                  [33maria-expanded[39m=[32m"false"[39m
                  [33maria-haspopup[39m=[32m"listbox"[39m
                  [33maria-label[39m=[32m"Initial Pipeline Template"[39m
                  [33mclass[39m=[32m"w-full flex items-center justify-between gap-2 bg-surface-container hover:bg-surface-container-high border rounded-sm transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none select-none min-h-[44px] px-3 py-1.5 text-xs border-border-standard focus-visible:border-primary text-on-surface font-mono "[39m
                  [33mid[39m=[32m"new-wf-template"[39m
                  [33mrole[39m=[32m"combobox"[39m
                  [33mtype[39m=[32m"button"[39m
                [36m>[39m
                  [36m<span[39m
                    [33mclass[39m=[32m"flex items-center gap-2 truncate text-left flex-1 min-w-0"[39m
                  [36m>[39m
                    [36m<span[39m
                      [33mclass[39m=[32m"truncate"[39m
                    [36m>[39m
                      [0mStandard (5 Stages: Idea → Elab → Plan → Review → Exec)[0m
                    [36m</span>[39m
                  [36m</span>[39m
                  [36m<span[39m
                    [33maria-hidden[39m=[32m"true"[39m
                    [33mclass[39m=[32m"material-symbols-outlined text-text-muted transition-transform duration-200 text-base shrink-0 select-none "[39m
                  [36m>[39m
                    [0mexpand_more[0m
                  [36m</span>[39m
                [36m</button>[39m
              [36m</div>[39m
            [36m</div>[39m
          [36m</div>[39m
          [36m<div>[39m
            [36m<label[39m
              [33mclass[39m=[32m"block text-[10px] font-bold uppercase text-text-muted mb-1"[39m
              [33mfor[39m=[32m"new-wf-base-branch"[39m
            [36m>[39m
              [0mBase branch[0m
            [36m</label>[39m
            [36m<input[39m
              [33mclass[39m=[32m"w-full p-2 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono outline-none focus:border-primary"[39m
              [33mid[39m=[32m"new-wf-base-branch"[39m
              [33mplaceholder[39m=[32m"Repo default (e.g. main) — or a feature branch"[39m
              [33mtype[39m=[32m"text"[39m
              [33mvalue[39m=[32m"has space"[39m
            [36m/>[39m
            [36m<p[39m
              [33mclass[39m=[32m"mt-1 text-[10px] text-text-muted"[39m
            [36m>[39m
              [0mNew tasks branch off this branch and merge back into it. Blank means the repo's default branch.[0m
            [36m</p>[39m
          [36m</div>[39m
          [36m<div[39m
            [33mclass[39m=[32m"flex items-center justify-between pt-1"[39m
          [36m>[39m
            [36m<label[39m
              [33mclass[39m=[32m"flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none"[39m
            [36m>[39m
              [36m<input[39m
                [33mclass[39m=[32m"rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0"[39m
                [33mtype[39m=[32m"checkbox"[39m
              [36m/>[39m
              [36m<span>[39m
                [0mSet as project default workflow[0m
              [36m</span>[39m
            [36m</label>[39m
            [36m<button[39m
              [33mclass[39m=[32m"px-4 py-2 bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"[39m
              [...
[90m [2m❯[22m waitForWrapper node_modules/@testing-library/dom/dist/wait-for.js:[2m163:27[22m[39m
[90m [2m❯[22m node_modules/@testing-library/dom/dist/query-helpers.js:[2m86:33[22m[39m
[36m [2m❯[22m src/components/settings/WorkflowManagementPanel.baseBranch.test.jsx:[2m137:25[22m[39m
    [90m135|[39m     });
    [90m136|[39m     fireEvent.click(screen.getByRole('button', { name: 'Create Workflo…
    [90m137|[39m     expect(await screen.findByText(/cannot contain spaces/i)).toBeInTh…
    [90m   |[39m                         [31m^[39m
    [90m138|[39m     expect(context.createWorkflow).not.toHaveBeenCalled();
    [90m139|[39m   });

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m357 passed[39m[22m[90m (358)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m4883 passed[39m[22m[90m (4884)[39m
[2m   Start at [22m 14:46:55
[2m   Duration [22m 112.12s[2m (tests 49%, setup 22%, worker 9%, import 8%, transform 6%, environment 5%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (244s)
Running Linting (api)... [0;32mPASS[0m (244s)
Running Linting (frontend)... [0;32mPASS[0m (244s)
Running Frontend Build... [0;32mPASS[0m (244s)
Running Security Script Tests... [0;32mPASS[0m (244s)
Running Dependency Check... [0;32mPASS[0m (244s)
Running Dependency Audit Gate... [0;32mPASS[0m (244s)
Running Proof Hygiene... [0;32mPASS[0m (244s)
Running Binary Guard... [0;32mPASS[0m (244s)
Running Harness Self-Tests... [0;32mPASS[0m (244s)
Running Container Tests... [0;32mPASS[0m (244s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api);Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api), Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-api.full.log
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (api), Unit Tests (frontend); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api);Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api), Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-api.full.log
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-144648/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.