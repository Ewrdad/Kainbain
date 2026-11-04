<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add a dynamic accessibility statement to website This should be easy to read and grouped based category. This should comply with wcag guidelines. It can exist in the drop-down on the top right or if you right click the logo in the top left.  It should show both wcag AAA and wcag 3.0 results but more crutailly should be formatted around users needs rather than the strict format of the reports.  It should also have a call to action for raising accessibility issues regardless of their inclusion in standards or not
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 3582.642s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 116 packages, and audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Dependencies missing for api (@earendil-works/pi-coding-agent, @fastify/cors, @fastify/multipart, @fastify/static, @fastify/swagger, @fastify/swagger-ui, @fastify/websocket, @opencode-ai/sdk, adm-zip, eslint-config-prettier, fastify, semver, uuid, web-push, @vitest/coverage-v8, eslint, eslint-plugin-n, eslint-plugin-security, globals, vite, vitest) — installing (npm install --prefix api)...
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 346 packages, and audited 347 packages in 4s

84 packages are looking for funding
  run `npm fund` for details

7 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 418 packages, and audited 419 packages in 4s

143 packages are looking for funding
  run `npm fund` for details

6 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 652ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (30 files in 104ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (172s)
Running Unit Tests (frontend)... [0;32mPASS[0m (172s)
Running Unit Tests (runner)... [0;32mPASS[0m (172s)
Running Linting (api)... [0;32mPASS[0m (172s)
Running Linting (frontend)... [0;32mPASS[0m (172s)
Running Frontend Build... [0;32mPASS[0m (172s)
Running Security Script Tests... [0;32mPASS[0m (172s)
Running Dependency Check... [0;32mPASS[0m (172s)
Running Dependency Audit Gate... [0;32mPASS[0m (172s)
Running Harness Self-Tests... [0;31mFAIL[0m (172s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 480 of 600 lines; showing the tail)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (0.727352ms)
  ✔ returns zero and does not throw when directory does not exist (3.197122ms)
✔ pruneStaleTestDirectories (4.106156ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (30.543271ms)
  ✔ still builds plain final versions (12.44388ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (10.888356ms)
  ✔ sha256FileHex matches the manifest's hashing (0.439798ms)
✔ buildManifest (55.663652ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (38.540126ms)
  ✔ rejects non-semver versions instead of tarring them (0.585815ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.831159ms)
  ✔ agrees with buildManifest on the asset filename grammar (395.464605ms)
✔ packageRunner (443.805623ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (43.644163ms)
✔ installSteps (44.747002ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (43.05222ms)
  ✔ root .npmrc documents the per-dir mirrors (0.321511ms)
✔ installSteps npmrc (43.627785ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.28595ms)
  ✔ installs the browser alone on macOS and Windows (0.216383ms)
✔ playwrightAttempts (0.719729ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.208021ms)
✔ npxExecutable (37.267873ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (3.815897ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (24.562309ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.217953ms)
✔ browserInstallTargets (32.760333ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-X7aPpd/Sanity/docs' -> '/tmp/kainbain-sanity-notes-d31bJD/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-v2vpas/Sanity/docs' -> '/tmp/kainbain-sanity-notes-LXR2dt/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-v2vpas/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-LXR2dt/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-v2vpas/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-LXR2dt/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-5duxMV/Sanity/docs' -> '/tmp/kainbain-sanity-notes-J9jNRR/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-2LOvO1/Sanity/docs' -> '/tmp/kainbain-sanity-notes-pVy4k6/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-2LOvO1/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-pVy4k6/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-2LOvO1/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-pVy4k6/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-0V861E/Sanity/docs' -> '/tmp/kainbain-sanity-notes-hI4L4S/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-gyQuyO/Sanity/docs' -> '/tmp/kainbain-sanity-notes-KSQNcC/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-gyQuyO/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KSQNcC/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-gyQuyO/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KSQNcC/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (52.66352ms)
  ✔ leaves no fixture residue in the OS temp dir (537.180404ms)
✔ checkStorageSanity (591.058457ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.539733ms)
  ✔ rejects a missing entry path or a different file (0.239197ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1126.033167ms)
✔ isMainModule (1127.173932ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (0.968967ms)
  ✔ returns 0 when the notes space has no tasks dir (4.039816ms)
✔ countNotesTasks (5.311568ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (617.64932ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (524.31575ms)
  ✔ is idempotent: a second run appends no duplicate history (931.831649ms)
  ✔ leaves an already-current primary manifest alone (437.760509ms)
✔ scripts/sync-tip-dist.mjs (2518.38265ms)
ℹ tests 344
ℹ suites 89
ℹ pass 343
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 38381.431135

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (4372.899604ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'defaultModelIdsFor',
  +     file: 'api/aliasTargets.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'runnerMatches',
  +     file: 'api/flow/dispatch/runnerMatches.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'saveValidationProbes',
  +     file: 'api/routes/projects.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'validateModelAliasesPayload',
  +     file: 'api/routes/projects.js',
  +     kind: 'function'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-4bda7321-3aef-4ca9-b746-42b8c6969630/tests/check-jsdoc-example.test.mjs:164:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { file: 'api/aliasTargets.js', exportName: 'defaultModelIdsFor', kind: 'function' }, { file: 'api/flow/dispatch/runnerMatches.js', exportName: 'runnerMatches', kind: 'function' }, { file: 'api/routes/projects.js', exportName: 'saveValidationProbes', kind: 'function' }, { file: 'api/routes/projects.js', exportName: 'validateModelAliasesPayload', kind: 'function' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (172s)
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
Running Canary Tests... [0;32mPASS[0m (694s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.