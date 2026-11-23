<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** add per pipeline configurable main branch this meaans users should be okay to use non-main as the base branch ## example workflow 1) I want to work towards a new feature. So I manually create a feature branch 2) I create a new pipeline or two with the main configured to this feature branch 3) I create a new task, creating a standard branch off the feature branch rather than main 4) work is done on feature branch 5) merge stage merges change back into feature branch 6) 3-5 continue till I am happy with feature.  this will also be used to fit work into a standard ticket workflow
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 198.7s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (37 files in 126ms)
✅ Frontend imports check passed (756 files in 295ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (190s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (190s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/unit-tests-frontend.full.log
(trimmed 23243 of 23363 lines; showing the tail)
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
                ...

[32m- Expected:[39m
true

[31m+ Received:[39m
undefined

[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m838:7[22m[39m
    [90m836|[39m     expect(
    [90m837|[39m       document.getElementById('project-git-input')?.classList.contains…
    [90m838|[39m     ).toBe(true);
    [90m   |[39m       [31m^[39m
    [90m839|[39m   });
    [90m840|[39m });
[90m [2m❯[22m runWithExpensiveErrorDiagnosticsDisabled node_modules/@testing-library/dom/dist/config.js:[2m47:12[22m[39m
[90m [2m❯[22m checkCallback node_modules/@testing-library/dom/dist/wait-for.js:[2m124:77[22m[39m
[90m [2m❯[22m checkRealTimersCallback node_modules/@testing-library/dom/dist/wait-for.js:[2m118:16[22m[39m
[90m [2m❯[22m Timeout.<anonymous> node_modules/happy-dom/src/window/BrowserWindow.ts:[2m2595:6[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22mrenders the Model Aliases section and includes aliases in the save payload
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toBeInTheDocument()[22m

[31melement could not be found in the document[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1587:62[22m[39m
    [90m1585|[39m
    [90m1586|[39m   // The stored alias renders as a collapsed card; expand it to edit.
    [90m1587|[39m   expect(await screen.findByTestId('model-aliases-section')).toBeInThe…
    [90m   |[39m                                                              [31m^[39m
    [90m1588|[39m   fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
    [90m1589|[39m   expect(screen.getByLabelText('Alias 1 name')).toHaveValue('small');

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22muntouched aliases are omitted from the save but the concurrency token is sent
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toBeInTheDocument()[22m

[31melement could not be found in the document[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1658:62[22m[39m
    [90m1656|[39m   fireEvent.click(screen.getByText('Aliases'));
    [90m1657|[39m
    [90m1658|[39m   expect(await screen.findByTestId('model-aliases-section')).toBeInThe…
    [90m   |[39m                                                              [31m^[39m
    [90m1659|[39m
    [90m1660|[39m   // Saving WITHOUT touching the alias table omits the key (a stale pa…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22ma saved alias edit stops re-sending the table on later saves (no stale re-send)
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toBeInTheDocument()[22m

[31melement could not be found in the document[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1692:62[22m[39m
    [90m1690|[39m
    [90m1691|[39m   // Edit the alias and save: the first payload carries the table.
    [90m1692|[39m   expect(await screen.findByTestId('model-aliases-section')).toBeInThe…
    [90m   |[39m                                                              [31m^[39m
    [90m1693|[39m   fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
    [90m1694|[39m   fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { …

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/6]⎯[22m[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22mclearing every alias row still sends the (empty) list — an explicit wipe
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toBeInTheDocument()[22m

[31melement could not be found in the document[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1738:62[22m[39m
    [90m1736|[39m   fireEvent.click(screen.getByText('Aliases'));
    [90m1737|[39m
    [90m1738|[39m   expect(await screen.findByTestId('model-aliases-section')).toBeInThe…
    [90m   |[39m                                                              [31m^[39m
    [90m1739|[39m   // Removing the only row marks the table touched, so the save carrie…
    [90m1740|[39m   // explicit empty list (the backend clears on empty) rather than omi…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m358 passed[39m[22m[90m (359)[39m
[2m      Tests [22m [1m[31m6 failed[39m[22m[2m | [22m[1m[32m4923 passed[39m[22m[90m (4929)[39m
[2m   Start at [22m 16:49:43
[2m   Duration [22m 71.78s[2m (tests 54%, setup 19%, worker 9%, import 6%, transform 6%, environment 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (190s)
Running Linting (api)... [0;32mPASS[0m (190s)
Running Linting (frontend)... [0;32mPASS[0m (190s)
Running Frontend Build... [0;32mPASS[0m (190s)
Running Security Script Tests... [0;32mPASS[0m (190s)
Running Dependency Check... [0;32mPASS[0m (190s)
Running Dependency Audit Gate... [0;32mPASS[0m (190s)
Running Proof Hygiene... [0;32mPASS[0m (190s)
Running Binary Guard... [0;32mPASS[0m (190s)
Running Harness Self-Tests... [0;32mPASS[0m (190s)
Running Container Tests... [0;32mPASS[0m (190s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=opted_out verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: opted out (--no-canary)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/verdict.json

KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=opted_out verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: opted out (--no-canary)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261120-164939/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.