<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can we make sure the model information is being pased through accurately ![image.png](assets/image.png) We seem to have some sort of regression when moving to the runner architecture where we are reporting default for model constantly. And like in this case reporting a model that isnt in use as its a CI stage I want the runner to be able to accurately report (through the backend) to the ui what model choices etc it is running. And I want to make sure the general model catalogue behaviours work.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 3013.154s
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
✅ Settings duplicate check passed (30 files in 82ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Dependency Check (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (131s)
Running Unit Tests (frontend)... [0;32mPASS[0m (131s)
Running Unit Tests (runner)... [0;32mPASS[0m (131s)
Running Linting (api)... [0;32mPASS[0m (131s)
Running Linting (frontend)... [0;32mPASS[0m (131s)
Running Frontend Build... [0;32mPASS[0m (131s)
Running Security Script Tests... [0;32mPASS[0m (131s)
Running Dependency Check... [0;32mPASS[0m (131s)
Running Dependency Audit Gate... [0;32mPASS[0m (131s)
Running Harness Self-Tests... [0;31mFAIL[0m (131s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 421 of 541 lines; showing the tail)
  ✔ runs Canary Tests in the serial phase after the fast overlap window (4.705377ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (2.933414ms)
✔ splitGatePhases (7.804673ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.203096ms)
  ✔ accepts the legacy --canary opt-in as a no-op (2.687348ms)
  ✔ opts out via --no-canary (0.107232ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.079295ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.077346ms)
  ✔ skip flags win over the legacy opt-in flags (0.081674ms)
✔ resolveCanary (3.461012ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (7.292214ms)
  ✔ reports true when the root tree carries the Windows binary (0.395856ms)
  ✔ reports false when the platform's binary name is missing (3.926873ms)
  ✔ reports false when the root tree has no binaries at all (0.37259ms)
✔ depcheckAvailable (13.53002ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (11.490352ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (4.13131ms)
  ✔ reports not installed when a package manifest is unreadable (2.298666ms)
✔ workspaceDepsInstalled (21.162103ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (13.858311ms)
  ✔ does not spawn when every workspace dependency is already present (11.227797ms)
  ✔ installs each missing package through npm and re-verifies (1.373794ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (8.757807ms)
✔ ensureWorkspaceDeps (36.534329ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (0.797354ms)
  ✔ returns zero and does not throw when directory does not exist (0.26879ms)
✔ pruneStaleTestDirectories (23.627342ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (1.457843ms)
✔ installSteps (3.201465ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (1.21264ms)
  ✔ root .npmrc documents the per-dir mirrors (2.138332ms)
✔ installSteps npmrc (5.007126ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.376161ms)
  ✔ installs the browser alone on macOS and Windows (0.427556ms)
✔ playwrightAttempts (1.030053ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.354792ms)
✔ npxExecutable (0.760774ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (2.421827ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (5.132414ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.654394ms)
✔ browserInstallTargets (8.508622ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-nWU3d7/Sanity/docs' -> '/tmp/kainbain-sanity-notes-NkBZbP/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-pTQHk6/Sanity/docs' -> '/tmp/kainbain-sanity-notes-aTqcrR/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-pTQHk6/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-aTqcrR/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-pTQHk6/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-aTqcrR/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-0c3glc/Sanity/docs' -> '/tmp/kainbain-sanity-notes-X5xctm/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-6z3js2/Sanity/docs' -> '/tmp/kainbain-sanity-notes-gFlgk0/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-6z3js2/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-gFlgk0/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-6z3js2/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-gFlgk0/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-kKXgPx/Sanity/docs' -> '/tmp/kainbain-sanity-notes-pfs2Xt/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-u9r4qN/Sanity/docs' -> '/tmp/kainbain-sanity-notes-FiFqUd/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-u9r4qN/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-FiFqUd/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-u9r4qN/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-FiFqUd/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (56.652646ms)
  ✔ leaves no fixture residue in the OS temp dir (245.637173ms)
✔ checkStorageSanity (303.779065ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.551779ms)
  ✔ rejects a missing entry path or a different file (0.333576ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1249.971821ms)
✔ isMainModule (1251.244068ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (3.959784ms)
  ✔ returns 0 when the notes space has no tasks dir (1.102623ms)
✔ countNotesTasks (6.230474ms)
ℹ tests 313
ℹ suites 80
ℹ pass 312
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 28024.613145

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (4573.278165ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'mergeBranch',
  +     file: 'api/git/merge.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'SQUASH_MERGE_STRATEGY',
  +     file: 'api/git/merge.js',
  +     kind: 'const'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-e3b2624a-bc24-4698-9c78-86af7f6f3b5b/tests/check-jsdoc-example.test.mjs:164:10)
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
    actual: [ { file: 'api/git/merge.js', exportName: 'mergeBranch', kind: 'function' }, { file: 'api/git/merge.js', exportName: 'SQUASH_MERGE_STRATEGY', kind: 'const' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (131s)
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
Running Canary Tests... [0;32mPASS[0m (530s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.