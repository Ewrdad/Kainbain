<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Isolate API tests from live engine state files
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 207.238s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 869ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (35 files in 138ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Dependency Check (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (199s)
Running Unit Tests (frontend)... [0;32mPASS[0m (199s)
Running Unit Tests (runner)... [0;32mPASS[0m (199s)
Running Linting (api)... [0;32mPASS[0m (199s)
Running Linting (frontend)... [0;32mPASS[0m (199s)
Running Frontend Build... [0;32mPASS[0m (199s)
Running Security Script Tests... [0;32mPASS[0m (199s)
Running Dependency Check... [0;32mPASS[0m (199s)
Running Dependency Audit Gate... [0;32mPASS[0m (199s)
Running Harness Self-Tests... [0;31mFAIL[0m (199s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 549 of 669 lines; showing the tail)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (65.332429ms)
  ✔ rejects non-semver versions instead of tarring them (1.567598ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.823042ms)
  ✔ agrees with buildManifest on the asset filename grammar (186.946335ms)
✔ packageRunner (302.076182ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (2.076042ms)
✔ installSteps (24.562435ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (31.231011ms)
  ✔ root .npmrc documents the per-dir mirrors (0.529342ms)
✔ installSteps npmrc (32.211109ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.398107ms)
  ✔ installs the browser alone on macOS and Windows (3.626731ms)
✔ playwrightAttempts (4.442781ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.426264ms)
✔ npxExecutable (0.848671ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (18.928474ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (5.123494ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.343823ms)
✔ browserInstallTargets (24.871492ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-bJVNN1/Sanity/docs' -> '/tmp/kainbain-sanity-notes-4D4iPz/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-hUiR6D/Sanity/docs' -> '/tmp/kainbain-sanity-notes-ID7kCl/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-hUiR6D/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-ID7kCl/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-hUiR6D/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-ID7kCl/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Q1ieW4/Sanity/docs' -> '/tmp/kainbain-sanity-notes-DwPfek/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-GKAbzv/Sanity/docs' -> '/tmp/kainbain-sanity-notes-1gkmRv/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-GKAbzv/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-1gkmRv/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-GKAbzv/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-1gkmRv/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-l0NCsW/Sanity/docs' -> '/tmp/kainbain-sanity-notes-NO7muv/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-uzK73T/Sanity/docs' -> '/tmp/kainbain-sanity-notes-8Phcgk/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-uzK73T/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-8Phcgk/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-uzK73T/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-8Phcgk/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (125.901443ms)
  ✔ leaves no fixture residue in the OS temp dir (342.032308ms)
✔ checkStorageSanity (517.05442ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.736498ms)
  ✔ rejects a missing entry path or a different file (0.36874ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2645.237446ms)
✔ isMainModule (2646.892797ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.81435ms)
  ✔ returns 0 when the notes space has no tasks dir (1.108703ms)
✔ countNotesTasks (13.528296ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (192.387021ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (237.236881ms)
  ✔ syncs build-info.json alongside a moved manifest commit (169.28072ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (371.732944ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (332.752638ms)
  ✔ is idempotent: a second run appends no duplicate history (566.585026ms)
  ✔ leaves an already-current primary manifest alone (273.31935ms)
✔ scripts/sync-tip-dist.mjs (2148.714068ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (7.541999ms)
✔ parseVerifyArgs (9.870107ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (12.558953ms)
✔ findHistoryTokens (12.808019ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (231.550888ms)
  ✔ defaults to the latest token when no SHA is given (158.894523ms)
  ✔ fails when the history token was tampered with (240.890338ms)
  ✔ fails when history names a commit the repo does not know (363.117701ms)
  ✔ fails when history carries no token, and when the task file is missing (385.585324ms)
  ✔ fails the pinned-config check on drifted config (357.506919ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1259.767536ms)
✔ verifyFromRepo (3000.684152ms)
ℹ tests 391
ℹ suites 102
ℹ pass 390
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 46651.059

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (6905.776858ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'tempIsolatedAuthStateDir',
  +     file: 'api/isolatedTestRoots.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'tempAuthStateDir',
  +     file: 'api/testSetup.isolation.js',
  +     kind: 'const'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-99ccc12f-7d71-4781-9b81-9d2902367fba/tests/check-jsdoc-example.test.mjs:164:10)
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
    actual: [ { file: 'api/isolatedTestRoots.js', exportName: 'tempIsolatedAuthStateDir', kind: 'const' }, { file: 'api/testSetup.isolation.js', exportName: 'tempAuthStateDir', kind: 'const' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (199s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.