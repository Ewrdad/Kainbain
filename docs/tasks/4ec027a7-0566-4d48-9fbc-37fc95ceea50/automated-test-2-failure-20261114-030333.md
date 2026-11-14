<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Render runner counts instead of unavailable badges in pickers
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 215.982s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 738ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (36 files in 141ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (209s)
Running Unit Tests (frontend)... [0;32mPASS[0m (209s)
Running Unit Tests (runner)... [0;32mPASS[0m (209s)
Running Linting (api)... [0;32mPASS[0m (209s)
Running Linting (frontend)... [0;32mPASS[0m (209s)
Running Frontend Build... [0;32mPASS[0m (209s)
Running Security Script Tests... [0;32mPASS[0m (209s)
Running Dependency Check... [0;32mPASS[0m (209s)
Running Dependency Audit Gate... [0;32mPASS[0m (209s)
Running Harness Self-Tests... [0;31mFAIL[0m (209s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 574 of 694 lines; showing the tail)
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (6.571841ms)
  ✔ still builds plain final versions (26.327591ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (1.22495ms)
  ✔ stamps requires.backendApi from the release source tree (9.314468ms)
  ✔ omits requires when the source tree carries no range (legacy shape) (7.456264ms)
  ✔ sha256FileHex matches the manifest's hashing (0.587212ms)
✔ buildManifest (54.276062ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (42.676728ms)
  ✔ rejects non-semver versions instead of tarring them (4.658582ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (4.266476ms)
  ✔ agrees with buildManifest on the asset filename grammar (332.424932ms)
✔ packageRunner (384.795215ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (8.122957ms)
✔ installSteps (31.555542ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (4.10983ms)
  ✔ root .npmrc documents the per-dir mirrors (0.421953ms)
✔ installSteps npmrc (4.922457ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.374864ms)
  ✔ installs the browser alone on macOS and Windows (32.087234ms)
✔ playwrightAttempts (32.861853ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.410666ms)
✔ npxExecutable (0.757471ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (27.426362ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (10.127234ms)
  ✔ installs the browser alone for every target on macOS and Windows (1.41711ms)
✔ browserInstallTargets (39.462902ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-teVdMb/Sanity/docs' -> '/tmp/kainbain-sanity-notes-CRoeif/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Q8zdT5/Sanity/docs' -> '/tmp/kainbain-sanity-notes-IdgtdY/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-Q8zdT5/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-IdgtdY/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-Q8zdT5/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-IdgtdY/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-0Teg58/Sanity/docs' -> '/tmp/kainbain-sanity-notes-42rahj/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-iSCEHZ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-yRhY78/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-iSCEHZ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-yRhY78/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-iSCEHZ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-yRhY78/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-cbAtu5/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Z93S4e/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Xwzm05/Sanity/docs' -> '/tmp/kainbain-sanity-notes-bEXecH/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-Xwzm05/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-bEXecH/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-Xwzm05/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-bEXecH/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (118.144658ms)
  ✔ leaves no fixture residue in the OS temp dir (1072.625322ms)
✔ checkStorageSanity (1220.445835ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.80283ms)
  ✔ rejects a missing entry path or a different file (0.353944ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2607.495718ms)
✔ isMainModule (2609.222558ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (11.177399ms)
  ✔ returns 0 when the notes space has no tasks dir (1.400934ms)
✔ countNotesTasks (13.787264ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (222.555675ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (490.098427ms)
  ✔ syncs build-info.json alongside a moved manifest commit (735.775825ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (527.36668ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (374.570059ms)
  ✔ is idempotent: a second run appends no duplicate history (1012.925717ms)
  ✔ leaves an already-current primary manifest alone (156.338311ms)
✔ scripts/sync-tip-dist.mjs (3538.094519ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (2.179908ms)
✔ parseVerifyArgs (67.017371ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.851803ms)
✔ findHistoryTokens (1.100518ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (416.834784ms)
  ✔ defaults to the latest token when no SHA is given (352.867625ms)
  ✔ fails when the history token was tampered with (262.397764ms)
  ✔ fails when history names a commit the repo does not know (466.983532ms)
  ✔ fails when history carries no token, and when the task file is missing (538.698166ms)
  ✔ fails the pinned-config check on drifted config (281.651542ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1960.078305ms)
✔ verifyFromRepo (4282.232694ms)
ℹ tests 409
ℹ suites 107
ℹ pass 408
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 52204.356259

✖ failing tests:

test at tests/run-parallel.test.mjs:526:2
✖ no frontend suite imports the api tree (no pin escape hatch) (324.115182ms)
  AssertionError [ERR_ASSERTION]: frontend suites must not import the api tree (use canned payloads): src/services/fleetModelOptions/fleetCatalogueContract.test.js
  + actual - expected
  
  + [
  +   'src/services/fleetModelOptions/fleetCatalogueContract.test.js'
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-4ec027a7-0566-4d48-9fbc-37fc95ceea50/tests/run-parallel.test.mjs:542:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'src/services/fleetModelOptions/fleetCatalogueContract.test.js' ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (209s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.