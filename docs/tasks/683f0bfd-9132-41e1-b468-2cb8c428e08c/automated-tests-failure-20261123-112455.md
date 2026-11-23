<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Roll out 0.2.x runners and run fleet before/after interrupt recount
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 313.694s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950 (verdict.json + untrimmed failed-branch logs land here)
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
Dependencies missing for frontend (@testing-library/dom, mermaid, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 535 packages, and audited 536 packages in 7s

146 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 3s

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (43 files in 203ms)
✅ Frontend imports check passed (768 files in 457ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s), Dependency Check (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Linting (frontend) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
⏳ still running: Unit Tests (api) (4m30s)
Running Unit Tests (api)... [0;32mPASS[0m (286s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (286s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/unit-tests-frontend.full.log
(trimmed 23719 of 23839 lines; showing the tail)

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mrefresh control re-fetches the skills library
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m28 tests[22m[2m)[22m[33m 1634[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/hooks/useOnboarding.test.js[2m > [22museOnboarding[2m > [22mstays idle until enabled flips true
[31m[1mAssertionError[22m: expected null to deeply equal { runner: { …(3) }, …(6) }[39m

[32m- Expected:[39m
{
  "adoptable": [
    {
      "name": "foo",
      "path": "/repos/foo",
    },
  ],
  "complete": false,
  "hasRun": false,
  "projectCount": 0,
  "runner": {
    "hasFreshRunner": false,
    "nextAction": "approve-runner",
    "nextActionDetail": "Approve it.",
  },
  "steps": [
    {
      "detail": "Approve it.",
      "done": false,
      "id": "runner",
      "title": "Connect a Runner",
    },
  ],
  "taskCount": 0,
}

[31m+ Received:[39m
null

[36m [2m❯[22m src/hooks/useOnboarding.test.js:[2m66:36[22m[39m
    [90m 64|[39m       expect(result.current.loading).toBe(false);
    [90m 65|[39m     });
    [90m 66|[39m     expect(result.current.summary).toEqual(SUMMARY);
    [90m   |[39m                                    [31m^[39m
    [90m 67|[39m   });
    [90m 68|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m363 passed[39m[22m[90m (364)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m4976 passed[39m[22m[90m (4977)[39m
[2m   Start at [22m 11:20:11
[2m   Duration [22m 113.99s[2m (tests 50%, setup 22%, worker 9%, transform 7%, import 7%, environment 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (286s)
Running Linting (api)... [0;32mPASS[0m (286s)
Running Linting (frontend)... [0;32mPASS[0m (286s)
Running Frontend Build... [0;32mPASS[0m (286s)
Running Security Script Tests... [0;32mPASS[0m (286s)
Running Dependency Check... [0;32mPASS[0m (286s)
Running Dependency Audit Gate... [0;32mPASS[0m (286s)
Running Proof Hygiene... [0;32mPASS[0m (286s)
Running Binary Guard... [0;32mPASS[0m (286s)
Running Harness Self-Tests... [0;32mPASS[0m (286s)
Running Container Tests... [0;32mPASS[0m (286s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (frontend); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/unit-tests-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-683f0bfd-9132-41e1-b468-2cb8c428e08c/docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/ci-fast-gate-20261123-111950/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.