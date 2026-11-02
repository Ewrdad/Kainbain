<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 825.453s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 103ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (151s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (151s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
(trimmed 11431 of 11551 lines; showing the tail)
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mremove button drops the skill from stage.skills
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mrefresh control re-fetches the skills library
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m27 tests[22m[2m)[22m[33m 1003[2mms[22m[39m
[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Unhandled Errors [49m[22m[31m⎯⎯⎯⎯⎯⎯[39m
[31m[1m
Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.[22m[39m

[31m⎯⎯⎯⎯[39m[1m[41m Unhandled Rejection [49m[22m[31m⎯⎯⎯⎯⎯[39m
[31m[1mEnvironmentTeardownError[22m: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending[39m
[31mThis error originated in "[1msrc/components/workflow/WorkflowCanvasModels.test.jsx[22m" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.[39m
[31m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[39m


[2m Test Files [22m [1m[32m291 passed[39m[22m[90m (291)[39m
[2m      Tests [22m [1m[32m3935 passed[39m[22m[90m (3935)[39m
[2m     Errors [22m [1m[31m1 error[39m[22m
[2m   Start at [22m 09:09:09
[2m   Duration [22m 53.64s[2m (tests 51%, setup 21%, worker 9%, environment 7%, import 6%, transform 5%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (151s)
Running Linting (api)... [0;32mPASS[0m (151s)
Running Linting (frontend)... [0;32mPASS[0m (151s)
Running Frontend Build... [0;32mPASS[0m (151s)
Running Security Script Tests... [0;32mPASS[0m (151s)
Running Dependency Check... [0;32mPASS[0m (151s)
Running Dependency Audit Gate... [0;32mPASS[0m (151s)
Running Harness Self-Tests... [0;32mPASS[0m (151s)
Running Container Tests... [0;32mPASS[0m (151s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
⏳ still running: Canary Tests (3m30s)
⏳ still running: Canary Tests (4m00s)
⏳ still running: Canary Tests (4m30s)
⏳ still running: Canary Tests (5m00s)
⏳ still running: Canary Tests (5m30s)
⏳ still running: Canary Tests (6m00s)
⏳ still running: Canary Tests (6m30s)
⏳ still running: Canary Tests (7m00s)
⏳ still running: Canary Tests (7m30s)
⏳ still running: Canary Tests (8m00s)
⏳ still running: Canary Tests (8m30s)
⏳ still running: Canary Tests (9m00s)
⏳ still running: Canary Tests (9m30s)
⏳ still running: Canary Tests (10m00s)
⏳ still running: Canary Tests (10m30s)
⏳ still running: Canary Tests (11m00s)
Running Canary Tests... [0;32mPASS[0m (668s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.