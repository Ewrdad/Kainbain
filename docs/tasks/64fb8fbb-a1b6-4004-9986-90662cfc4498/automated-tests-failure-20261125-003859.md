<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Validate human review feedback asset references at submit time
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1167.943s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406 (verdict.json + untrimmed failed-branch logs land here)
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 877ms

found 0 vulnerabilities
Workspace dependencies installed (canary-e2e).
✅ Settings duplicate check passed (43 files in 153ms)
✅ Frontend imports check passed (774 files in 471ms)
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
⏳ still running: Unit Tests (api) (2m00s), Unit Tests (frontend) (2m00s), Linting (api) (2m00s), Linting (frontend) (2m00s), Harness Self-Tests (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
⏳ still running: Unit Tests (api) (4m30s)
Running Unit Tests (api)... [0;32mPASS[0m (289s)
Running Unit Tests (frontend)... [0;32mPASS[0m (289s)
Running Unit Tests (runner)... [0;32mPASS[0m (289s)
Running Linting (api)... [0;32mPASS[0m (289s)
Running Linting (frontend)... [0;31mFAIL[0m (289s)
----------------------------------------------------------------------
Details for Linting (frontend):
Full log: Linting (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/linting-frontend.full.log
(trimmed 245 of 365 lines; showing the tail)
  123:18  warning  Generic Object Injection Sink               security/detect-object-injection
  186:26  warning  Function Call Object Injection Sink         security/detect-object-injection
  186:48  warning  Generic Object Injection Sink               security/detect-object-injection
  187:7   warning  Generic Object Injection Sink               security/detect-object-injection
  191:31  warning  Function Call Object Injection Sink         security/detect-object-injection
  191:62  warning  Generic Object Injection Sink               security/detect-object-injection
  196:25  warning  Function Call Object Injection Sink         security/detect-object-injection
  196:58  warning  Generic Object Injection Sink               security/detect-object-injection
  464:26  warning  Variable Assigned to Object Injection Sink  security/detect-object-injection
  468:20  warning  Generic Object Injection Sink               security/detect-object-injection
  800:43  warning  Generic Object Injection Sink               security/detect-object-injection
  800:83  warning  Generic Object Injection Sink               security/detect-object-injection
  815:32  warning  Generic Object Injection Sink               security/detect-object-injection
  815:72  warning  Generic Object Injection Sink               security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/WorkflowCanvasModels.test.jsx
  169:15  warning  Found non-literal argument to RegExp Constructor  security/detect-non-literal-regexp

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/hooks/useStageDnD.js
  33:5   warning  Generic Object Injection Sink  security/detect-object-injection
  33:44  warning  Generic Object Injection Sink  security/detect-object-injection
  39:5   warning  Generic Object Injection Sink  security/detect-object-injection
  41:8   warning  Generic Object Injection Sink  security/detect-object-injection
  43:9   warning  Generic Object Injection Sink  security/detect-object-injection
  62:5   warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/hooks/workflowHooks.test.js
  122:9   warning  Generic Object Injection Sink  security/detect-object-injection
  124:29  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/pipelineTransfer.js
  184:7   warning  Generic Object Injection Sink  security/detect-object-injection
  184:18  warning  Generic Object Injection Sink  security/detect-object-injection
  185:16  warning  Generic Object Injection Sink  security/detect-object-injection
  186:7   warning  Generic Object Injection Sink  security/detect-object-injection
  186:18  warning  Generic Object Injection Sink  security/detect-object-injection
  197:5   warning  Generic Object Injection Sink  security/detect-object-injection
  197:16  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/pipelineTransfer.test.js
  93:24  warning  Variable Assigned to Object Injection Sink  security/detect-object-injection
  95:13  warning  Generic Object Injection Sink               security/detect-object-injection
  98:67  warning  Generic Object Injection Sink               security/detect-object-injection
  99:18  warning  Function Call Object Injection Sink         security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/stageAnalytics.js
  87:23  warning  Variable Assigned to Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/components/workflow/stageAnalytics.test.js
  17:40  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/context/KainBainContext.test.jsx
  234:14  warning  Function Call Object Injection Sink  security/detect-object-injection
  234:56  warning  Function Call Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/context/useReview.js
  139:21  warning  Generic Object Injection Sink                                                                                     security/detect-object-injection
  235:5   warning  React Hook useCallback has an unnecessary dependency: 'review'. Either exclude it or remove the dependency array  react-hooks/exhaustive-deps

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/context/useUiPreferences.test.js
  20:31  warning  Generic Object Injection Sink  security/detect-object-injection
  22:9   warning  Generic Object Injection Sink  security/detect-object-injection
  25:16  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/hooks/useFeedbackAssets.js
  46:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

  44 |
  45 |   useEffect(() => {
> 46 |     refresh();
     |     ^^^^^^^ Avoid calling setState() directly within an effect
  47 |   }, [refresh]);
  48 |
  49 |   return { names, available, refresh };  react-hooks/set-state-in-effect

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/routing.js
  198:24  warning  Generic Object Injection Sink             security/detect-object-injection
  217:20  warning  Generic Object Injection Sink             security/detect-object-injection
  217:65  warning  Generic Object Injection Sink             security/detect-object-injection
  224:3   warning  Potential timing attack, left side: true  security/detect-possible-timing-attacks
  225:3   warning  Potential timing attack, left side: true  security/detect-possible-timing-attacks

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/services/domainRequests.test.js
  42:69  warning  Generic Object Injection Sink        security/detect-object-injection
  78:12  warning  Function Call Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/services/harnessPrefs.js
  57:5   warning  Generic Object Injection Sink  security/detect-object-injection
  76:17  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/services/imageRetry.test.js
   89:32  warning  Function Call Object Injection Sink  security/detect-object-injection
  147:32  warning  Function Call Object Injection Sink  security/detect-object-injection
  171:32  warning  Function Call Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/services/taskImages.js
  29:7   warning  Unsafe Regular Expression                         security/detect-unsafe-regex
  62:34  warning  Found non-literal argument to RegExp Constructor  security/detect-non-literal-regexp

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/setupTests.js
  33:29  warning  Generic Object Injection Sink  security/detect-object-injection
  35:7   warning  Generic Object Injection Sink  security/detect-object-injection
  38:14  warning  Generic Object Injection Sink  security/detect-object-injection
  46:25  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/theme/lightThemeContrast.test.js
  24:10  warning  Found readFileSync from package "node:fs" with non literal argument at index 0  security/detect-non-literal-fs-filename

/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/frontend/src/theme/observabilityContrast.test.js
  122:18  warning  Found readFileSync from package "node:fs" with non literal argument at index 0  security/detect-non-literal-fs-filename

✖ 223 problems (2 errors, 221 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.

----------------------------------------------------------------------
Running Frontend Build... [0;32mPASS[0m (289s)
Running Security Script Tests... [0;32mPASS[0m (289s)
Running Dependency Check... [0;32mPASS[0m (289s)
Running Dependency Audit Gate... [0;32mPASS[0m (289s)
Running Proof Hygiene... [0;32mPASS[0m (289s)
Running Binary Guard... [0;32mPASS[0m (289s)
Running Harness Self-Tests... [0;32mPASS[0m (289s)
Running Container Tests... [0;32mPASS[0m (289s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Linting (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/verdict.json"
Fast-gate verdict: FAILED — Linting (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Linting (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/linting-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Linting (frontend); verdict at /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Linting (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/verdict.json"
Fast-gate verdict: FAILED — Linting (frontend)
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Linting (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/linting-frontend.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-64fb8fbb-a1b6-4004-9986-90662cfc4498/docs/tasks/64fb8fbb-a1b6-4004-9986-90662cfc4498/ci-fast-gate-20261125-003406/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.