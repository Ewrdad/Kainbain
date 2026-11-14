<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Render runner counts instead of unavailable badges in pickers
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1918.622s
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
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 721ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (35 files in 162ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;32mPASS[0m (243s)
Running Unit Tests (frontend)... [0;32mPASS[0m (243s)
Running Unit Tests (runner)... [0;32mPASS[0m (243s)
Running Linting (api)... [0;32mPASS[0m (243s)
Running Linting (frontend)... [0;32mPASS[0m (243s)
Running Frontend Build... [0;32mPASS[0m (243s)
Running Security Script Tests... [0;32mPASS[0m (243s)
Running Dependency Check... [0;32mPASS[0m (243s)
Running Dependency Audit Gate... [0;32mPASS[0m (243s)
Running Harness Self-Tests... [0;31mFAIL[0m (243s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 594 of 714 lines; showing the tail)
  ✔ returns 0 when the notes space has no tasks dir (0.851833ms)
✔ countNotesTasks (75.626092ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (392.481102ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (657.422168ms)
  ✔ syncs build-info.json alongside a moved manifest commit (563.481907ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (740.605062ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (592.810918ms)
  ✔ is idempotent: a second run appends no duplicate history (1649.025191ms)
  ✔ leaves an already-current primary manifest alone (355.382979ms)
✔ scripts/sync-tip-dist.mjs (5009.909612ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (17.328515ms)
✔ parseVerifyArgs (20.224437ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.932178ms)
✔ findHistoryTokens (11.042025ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (588.359098ms)
  ✔ defaults to the latest token when no SHA is given (474.407376ms)
  ✔ fails when the history token was tampered with (459.294855ms)
  ✔ fails when history names a commit the repo does not know (517.633359ms)
  ✔ fails when history carries no token, and when the task file is missing (354.804983ms)
  ✔ fails the pinned-config check on drifted config (222.303984ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1828.157979ms)
✔ verifyFromRepo (4448.427701ms)
ℹ tests 391
ℹ suites 102
ℹ pass 390
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 55969.737778

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (9097.668236ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'fleetHarnessBadge',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'fleetHarnessBadgeNode',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'fleetModelRowBadge',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'fleetModelRowBadgeNode',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'fleetUnverifiedBadge',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'fleetUnverifiedBadgeNode',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'fleetUnverifiedNote',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'fleetUnverifiedNoteNode',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'notCurrentlyServedAnnotation',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'notCurrentlyServedBadge',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'notCurrentlyServedBadgeNode',
  +     file: 'frontend/src/services/modelStatus.js',
  +     kind: 'const'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-4ec027a7-0566-4d48-9fbc-37fc95ceea50/tests/check-jsdoc-example.test.mjs:164:10)
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
    actual: [ { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetHarnessBadge', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetHarnessBadgeNode', kind: 'function' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetModelRowBadge', kind: 'function' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetModelRowBadgeNode', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetUnverifiedBadge', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetUnverifiedBadgeNode', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetUnverifiedNote', kind: 'function' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'fleetUnverifiedNoteNode', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'notCurrentlyServedAnnotation', kind: 'const' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'notCurrentlyServedBadge', kind: 'function' }, { file: 'frontend/src/services/modelStatus.js', exportName: 'notCurrentlyServedBadgeNode', kind: 'const' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (243s)
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
⏳ still running: Canary Tests (13m00s)
⏳ still running: Canary Tests (13m30s)
⏳ still running: Canary Tests (14m00s)
⏳ still running: Canary Tests (14m30s)
⏳ still running: Canary Tests (15m00s)
⏳ still running: Canary Tests (15m30s)
Running Canary Tests... [0;32mPASS[0m (940s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.