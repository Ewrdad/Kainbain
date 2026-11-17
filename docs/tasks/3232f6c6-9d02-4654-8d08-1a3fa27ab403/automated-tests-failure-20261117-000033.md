<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Remove inert runner package-lock stub
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 250.946s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 117 packages, and audited 118 packages in 903ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640 (verdict.json + untrimmed failed-branch logs land here)
Dependencies missing for frontend (@testing-library/dom, mermaid, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 535 packages, and audited 536 packages in 5s

146 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 704ms

found 0 vulnerabilities
Workspace dependencies installed (frontend, canary-e2e).
✅ Settings duplicate check passed (36 files in 111ms)
✅ Frontend imports check passed (745 files in 280ms)
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
Running Unit Tests (api)... [0;32mPASS[0m (226s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (226s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/unit-tests-frontend.full.log
(trimmed 22224 of 22344 lines; showing the tail)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mremove button drops the skill from stage.skills
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mrefresh control re-fetches the skills library
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m28 tests[22m[2m)[22m[33m 1111[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22mharness row offers the default harness plus the Alias entry (alias-free empty state)
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).not.toBeDisabled()[22m

Received element is disabled:
  [31m<button
  aria-controls="project-harness-select-listbox"
  aria-expanded="false"
  aria-haspopup="listbox"
  aria-label="AI Harness"
  class="w-full flex items-center justify-between gap-2 bg-surface-container hover:bg-surface-container-high border rounded-sm transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none select-none min-h-[44px] px-3 py-1.5 text-xs border-border-standard focus-visible:border-primary text-on-surface font-mono "
  disabled=""
  id="project-harness-select"
  role="combobox"
  type="button"
/>[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1225:30[22m[39m
    [90m1223|[39m   const harnessTrigger = await screen.findByRole('combobox', { name: '…
    [90m1224|[39m   expect(harnessTrigger.id).toBe('project-harness-select');
    [90m1225|[39m   expect(harnessTrigger).not.toBeDisabled();
    [90m   |[39m                              [31m^[39m
    [90m1226|[39m   fireEvent.click(harnessTrigger);
    [90m1227|[39m   expect(screen.getByRole('option', { name: /pi \(default\)/i })).toBe…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m352 passed[39m[22m[90m (353)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m4790 passed[39m[22m[90m (4791)[39m
[2m   Start at [22m 23:56:51
[2m   Duration [22m 78.83s[2m (tests 53%, setup 20%, worker 9%, environment 6%, transform 6%, import 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (226s)
Running Linting (api)... [0;32mPASS[0m (226s)
Running Linting (frontend)... [0;32mPASS[0m (226s)
Running Frontend Build... [0;32mPASS[0m (226s)
Running Security Script Tests... [0;32mPASS[0m (226s)
Running Dependency Check... [0;32mPASS[0m (226s)
Running Dependency Audit Gate... [0;32mPASS[0m (226s)
Running Proof Hygiene... [0;32mPASS[0m (226s)
Running Binary Guard... [0;32mPASS[0m (226s)
Running Harness Self-Tests... [0;32mPASS[0m (226s)
Running Container Tests... [0;32mPASS[0m (226s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (frontend); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-3232f6c6-9d02-4654-8d08-1a3fa27ab403/docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/ci-fast-gate-20261116-235640/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.