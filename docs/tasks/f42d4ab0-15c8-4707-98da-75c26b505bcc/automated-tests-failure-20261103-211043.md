<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1656.89s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
  security/detect-object-injection
  234:56  warning  Function Call Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/context/useReview.js
  138:21  warning  Generic Object Injection Sink                                                                                     security/detect-object-injection
  225:5   warning  React Hook useCallback has an unnecessary dependency: 'review'. Either exclude it or remove the dependency array  react-hooks/exhaustive-deps

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/context/useUiPreferences.test.js
  18:31  warning  Generic Object Injection Sink  security/detect-object-injection
  20:9   warning  Generic Object Injection Sink  security/detect-object-injection
  23:16  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/hooks/useFleetModelCatalog/fleetCountsById.js
  17:5  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/routing.js
  184:24  warning  Generic Object Injection Sink             security/detect-object-injection
  193:20  warning  Generic Object Injection Sink             security/detect-object-injection
  193:65  warning  Generic Object Injection Sink             security/detect-object-injection
  200:3   warning  Potential timing attack, left side: true  security/detect-possible-timing-attacks
  201:3   warning  Potential timing attack, left side: true  security/detect-possible-timing-attacks

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/services/domainRequests.test.js
  47:45  warning  Generic Object Injection Sink        security/detect-object-injection
  75:12  warning  Function Call Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/services/harnessPrefs.js
  57:5   warning  Generic Object Injection Sink  security/detect-object-injection
  76:17  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/services/taskImages.js
  28:7   warning  Unsafe Regular Expression                         security/detect-unsafe-regex
  62:34  warning  Found non-literal argument to RegExp Constructor  security/detect-non-literal-regexp

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/setupTests.js
  33:29  warning  Generic Object Injection Sink  security/detect-object-injection
  35:7   warning  Generic Object Injection Sink  security/detect-object-injection
  38:14  warning  Generic Object Injection Sink  security/detect-object-injection
  46:25  warning  Generic Object Injection Sink  security/detect-object-injection

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/theme/lightThemeContrast.test.js
  24:10  warning  Found readFileSync from package "node:fs" with non literal argument at index 0  security/detect-non-literal-fs-filename

/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/theme/observabilityContrast.test.js
  122:18  warning  Found readFileSync from package "node:fs" with non literal argument at index 0  security/detect-non-literal-fs-filename

✖ 191 problems (3 errors, 188 warnings)
  0 errors and 5 warnings potentially fixable with the `--fix` option.

----------------------------------------------------------------------
Running Frontend Build... [0;31mFAIL[0m (145s)
----------------------------------------------------------------------
Details for Frontend Build:

> kainbain@1.0.0 build:frontend
> npm run build --prefix frontend


> frontend@1.0.0 build
> npm run check:react && node scripts/check-no-deprecations.js


> frontend@1.0.0 check:react
> node scripts/check-react-imports.js

✅ React import check passed — all source files that use `React.` import it.
vite v8.3.5 building client environment for production...
transforming...
✓ 309 modules transformed.
✗ Build failed in 20.27s
error during build:
Build failed with 1 error:

[31m[builtin:vite-transform] [0mUnexpected token
      [38;5;246m╭[0m[38;5;246m─[0m[38;5;246m[[0m src/components/observability/ObservabilityDashboard.jsx:1063:9 [38;5;246m][0m
      [38;5;246m│[0m
 [38;5;246m1063 │[0m ╭─▶ [38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m)[0m[38;5;249m}[0m
 [38;5;246m1064 │[0m ├─▶ 
 [38;5;240m     │[0m │      
 [38;5;240m     │[0m ╰────── 
[38;5;246m──────╯[0m

    at aggregateBindingErrorsIntoJsError (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/rolldown/dist/shared/error-D0SD8_tL.mjs:49:18)
    at unwrapBindingResult (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/rolldown/dist/shared/error-D0SD8_tL.mjs:19:128)
    at #build (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/rolldown/dist/shared/rolldown-CMhwwZPA.mjs:145:34)
    at async buildEnvironment (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:34849:66)
    at async Object.build (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:35270:19)
    at async Object.buildApp (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:35267:153)
    at async CAC.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/cli.js:790:3) {
  errors: [Getter/Setter]
}
----------------------------------------------------------------------
Running Security Script Tests... [0;32mPASS[0m (145s)
Running Dependency Check... [0;32mPASS[0m (145s)
Running Dependency Audit Gate... [0;32mPASS[0m (145s)
Running Harness Self-Tests... [0;32mPASS[0m (145s)
Running Container Tests... [0;32mPASS[0m (145s)
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
⏳ still running: Canary Tests (11m30s)
⏳ still running: Canary Tests (12m00s)
⏳ still running: Canary Tests (12m30s)
⏳ still running: Canary Tests (13m01s)
⏳ still running: Canary Tests (13m31s)
⏳ still running: Canary Tests (14m01s)
⏳ still running: Canary Tests (14m31s)
⏳ still running: Canary Tests (15m01s)
⏳ still running: Canary Tests (15m31s)
⏳ still running: Canary Tests (16m01s)
⏳ still running: Canary Tests (16m31s)
⏳ still running: Canary Tests (17m01s)
⏳ still running: Canary Tests (17m31s)
⏳ still running: Canary Tests (18m01s)
⏳ still running: Canary Tests (18m31s)
⏳ still running: Canary Tests (19m01s)
⏳ still running: Canary Tests (19m31s)
⏳ still running: Canary Tests (20m01s)
⏳ still running: Canary Tests (20m31s)
⏳ still running: Canary Tests (21m01s)
⏳ still running: Canary Tests (21m31s)
⏳ still running: Canary Tests (22m01s)
⏳ still running: Canary Tests (22m31s)
⏳ still running: Canary Tests (23m01s)
⏳ still running: Canary Tests (23m31s)
⏳ still running: Canary Tests (24m01s)
⏳ still running: Canary Tests (24m31s)
Running Canary Tests... [0;31mFAIL[0m (1500s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 822 of 942 lines; showing the tail)
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   44 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px (1.0m)
[WebServer] 9:04:38 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   45 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px (1.0m)
[WebServer] 9:05:39 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   46 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px (1.0m)
[WebServer] 9:06:39 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   47 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px (1.0m)
[WebServer] 9:07:40 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   48 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px (1.0m)
[WebServer] 9:08:41 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
  ✘   49 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px (1.0m)
[WebServer] 9:09:41 PM [vite] Internal server error: Transform failed with 1 error:
[WebServer] 
[WebServer] [PARSE_ERROR] Unexpected token
[WebServer]       ╭─[ src/components/observability/ObservabilityDashboard.jsx:1063:9 ]
[WebServer]       │
[WebServer]  1063 │ ╭─▶       )}
[WebServer]  1064 │ ├─▶ 
[WebServer]       │ │      
[WebServer]       │ ╰────── 
[WebServer] ──────╯
[WebServer] 
[WebServer]   Plugin: vite:oxc
[WebServer]   File: /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/src/components/observability/ObservabilityDashboard.jsx
[WebServer]       at transformWithOxc (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7618:19)
[WebServer]       at TransformPluginContext.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:7690:26)
[WebServer]       at EnvironmentPluginContainer.transform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:8582:51)
[WebServer]       at async loadAndTransform (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20155:26)
[WebServer]       at async viteTransformMiddleware (file:///home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/frontend/node_modules/vite/dist/node/chunks/node.js:20375:20)
Timed out after 1500000ms (branch process tree reaped)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.