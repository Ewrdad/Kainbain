<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** please fix horizontal scroll on bottom bar on mobile ![18848.png](assets/18848.png) Currently you can only see one runner which is frustrating and problematic. It should be horizontally scrollable and workable
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1590.271s
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
✅ Settings duplicate check passed (30 files in 87ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (149s)
Running Unit Tests (frontend)... [0;32mPASS[0m (149s)
Running Unit Tests (runner)... [0;32mPASS[0m (149s)
Running Linting (api)... [0;32mPASS[0m (149s)
Running Linting (frontend)... [0;32mPASS[0m (149s)
Running Frontend Build... [0;32mPASS[0m (149s)
Running Security Script Tests... [0;32mPASS[0m (149s)
Running Dependency Check... [0;32mPASS[0m (149s)
Running Dependency Audit Gate... [0;32mPASS[0m (149s)
Running Harness Self-Tests... [0;31mFAIL[0m (149s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 480 of 600 lines; showing the tail)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (4.127532ms)
  ✔ returns zero and does not throw when directory does not exist (0.207266ms)
✔ pruneStaleTestDirectories (4.474845ms)
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (22.563849ms)
  ✔ still builds plain final versions (1.699515ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (2.133127ms)
  ✔ sha256FileHex matches the manifest's hashing (10.106498ms)
✔ buildManifest (42.656108ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (64.697181ms)
  ✔ rejects non-semver versions instead of tarring them (0.548611ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (16.853079ms)
  ✔ agrees with buildManifest on the asset filename grammar (147.23242ms)
✔ packageRunner (229.75315ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (18.818254ms)
✔ installSteps (39.082417ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (0.820253ms)
  ✔ root .npmrc documents the per-dir mirrors (0.294589ms)
✔ installSteps npmrc (1.374153ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.324957ms)
  ✔ installs the browser alone on macOS and Windows (25.617528ms)
✔ playwrightAttempts (26.184929ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.227558ms)
✔ npxExecutable (4.783546ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (19.087598ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.237439ms)
  ✔ installs the browser alone for every target on macOS and Windows (25.456916ms)
✔ browserInstallTargets (45.354132ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-EPOJFO/Sanity/docs' -> '/tmp/kainbain-sanity-notes-muwD7W/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Hwfsj2/Sanity/docs' -> '/tmp/kainbain-sanity-notes-n3SXrc/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-Hwfsj2/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-n3SXrc/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-Hwfsj2/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-n3SXrc/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-oTCPtx/Sanity/docs' -> '/tmp/kainbain-sanity-notes-SNCeOC/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-tfyvFy/Sanity/docs' -> '/tmp/kainbain-sanity-notes-X0AP3m/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-tfyvFy/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-X0AP3m/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-tfyvFy/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-X0AP3m/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-2AX5hn/Sanity/docs' -> '/tmp/kainbain-sanity-notes-aRV7UT/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-YkGvF5/Sanity/docs' -> '/tmp/kainbain-sanity-notes-c9zAIl/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-YkGvF5/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-c9zAIl/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-YkGvF5/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-c9zAIl/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (20.709775ms)
  ✔ leaves no fixture residue in the OS temp dir (147.246938ms)
✔ checkStorageSanity (171.554895ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.507604ms)
  ✔ rejects a missing entry path or a different file (1.66693ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1632.402095ms)
✔ isMainModule (1635.124699ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.253772ms)
  ✔ returns 0 when the notes space has no tasks dir (1.844996ms)
✔ countNotesTasks (9.654502ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (369.743786ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (286.478679ms)
  ✔ is idempotent: a second run appends no duplicate history (374.344432ms)
  ✔ leaves an already-current primary manifest alone (217.567305ms)
✔ scripts/sync-tip-dist.mjs (1273.753108ms)
ℹ tests 344
ℹ suites 89
ℹ pass 343
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 37036.990941

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (4103.369558ms)
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
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-a654a254-ba7c-4f38-bb5e-d767fc25b6ff/tests/check-jsdoc-example.test.mjs:164:10)
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
Running Container Tests... [0;32mPASS[0m (149s)
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
Running Canary Tests... [0;32mPASS[0m (675s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.