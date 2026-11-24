<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Make in-assignment transient backend errors non-fatal to the runner
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 277.367s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 806ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (43 files in 151ms)
✅ Frontend imports check passed (768 files in 454ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;32mPASS[0m (265s)
Running Unit Tests (frontend)... [0;32mPASS[0m (265s)
Running Unit Tests (runner)... [0;32mPASS[0m (265s)
Running Linting (api)... [0;32mPASS[0m (265s)
Running Linting (frontend)... [0;32mPASS[0m (265s)
Running Frontend Build... [0;32mPASS[0m (265s)
Running Security Script Tests... [0;32mPASS[0m (265s)
Running Dependency Check... [0;32mPASS[0m (265s)
Running Dependency Audit Gate... [0;32mPASS[0m (265s)
Running Proof Hygiene... [0;32mPASS[0m (265s)
Running Binary Guard... [0;32mPASS[0m (265s)
Running Harness Self-Tests... [0;31mFAIL[0m (265s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/harness-self-tests.full.log
(trimmed 985 of 1105 lines; showing the tail)
  ✔ keeps the full canary version and points assetBase at the canary tag (16.27575ms)
  ✔ still builds plain final versions (7.358899ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (2.586035ms)
  ✔ stamps requires.backendApi from the release source tree (5.552959ms)
  ✔ omits requires when the source tree carries no range (legacy shape) (12.78696ms)
  ✔ sha256FileHex matches the manifest's hashing (0.479388ms)
✔ buildManifest (73.790623ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (61.07772ms)
  ✔ rejects non-semver versions instead of tarring them (0.799377ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (12.923557ms)
  ✔ leaves the default leg-closure install on for fake roots without crashing (auto-skip) (41.133966ms)
  ✔ stageLegNpmDeps fails closed with a named error when the root has no api/package.json (0.902619ms)
  ✔ agrees with buildManifest on the asset filename grammar (318.328341ms)
✔ packageRunner (436.202836ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (2.12561ms)
✔ installSteps (31.47082ms)
▶ hookInstallStep
  ✔ pins the setup hook-install step: runs scripts/install-git-hooks.mjs with node from the repo root (16.896292ms)
✔ hookInstallStep (17.20194ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (21.630292ms)
  ✔ root .npmrc documents the per-dir mirrors (0.457759ms)
✔ installSteps npmrc (22.515333ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.460774ms)
  ✔ installs the browser alone on macOS and Windows (6.703482ms)
✔ playwrightAttempts (7.633941ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (2.124963ms)
✔ npxExecutable (2.426719ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (48.957819ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.339211ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.358838ms)
✔ browserInstallTargets (49.957608ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-BWMFuK/Sanity/docs' -> '/tmp/kainbain-sanity-notes-M8fPo4/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-kijly3/Sanity/docs' -> '/tmp/kainbain-sanity-notes-dK0WQx/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-kijly3/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-dK0WQx/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-kijly3/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-dK0WQx/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-ShtrsE/Sanity/docs' -> '/tmp/kainbain-sanity-notes-TelaZt/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-iaIrEA/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Ls7JGg/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-iaIrEA/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-Ls7JGg/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-iaIrEA/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-Ls7JGg/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-1OJ6Io/Sanity/docs' -> '/tmp/kainbain-sanity-notes-7xsZvb/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-RXLKzJ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-bJOtr0/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-RXLKzJ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-bJOtr0/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-RXLKzJ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-bJOtr0/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (102.671356ms)
  ✔ leaves no fixture residue in the OS temp dir (637.412155ms)
✔ checkStorageSanity (745.30222ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (3.506454ms)
  ✔ rejects a missing entry path or a different file (1.786604ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1927.078178ms)
✔ isMainModule (1933.02707ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.109509ms)
  ✔ returns 0 when the notes space has no tasks dir (1.375793ms)
✔ countNotesTasks (3.514716ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (354.093951ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (526.889347ms)
  ✔ syncs build-info.json alongside a moved manifest commit (276.934717ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (217.004906ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (355.890093ms)
  ✔ is idempotent: a second run appends no duplicate history (332.858843ms)
  ✔ leaves an already-current primary manifest alone (393.140878ms)
✔ scripts/sync-tip-dist.mjs (2461.520472ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (3.876107ms)
✔ parseVerifyArgs (15.374862ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (7.948953ms)
✔ findHistoryTokens (8.196767ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (128.170716ms)
  ✔ defaults to the latest token when no SHA is given (348.092714ms)
  ✔ fails when the history token was tampered with (216.103879ms)
  ✔ fails when history names a commit the repo does not know (375.17819ms)
  ✔ fails when history carries no token, and when the task file is missing (164.500291ms)
  ✔ fails the pinned-config check on drifted config (229.155971ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1193.910709ms)
✔ verifyFromRepo (2699.330604ms)
ℹ tests 687
ℹ suites 170
ℹ pass 686
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 97240.857721

✖ failing tests:

test at tests/publish.test.mjs:113:2
✖ runner gate runs the same suite list as scripts/run-tests.mjs (no under-tested channel) (81.189151ms)
  AssertionError [ERR_ASSERTION]: publish.sh runner gate names every suite in the gate branch
  + actual - expected
  
    [
      'runner/ciBranchWorkdir.test.js',
  -   'runner/client.backendOutage.test.js',
      'runner/client.test.js',
      'runner/config.test.js',
      'runner/daemon.test.js',
      'runner/gitOps.test.js',
      'runner/harness.test.js',
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/tests/publish.test.mjs:126:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'runner/ciBranchWorkdir.test.js', 'runner/client.test.js', 'runner/config.test.js', 'runner/daemon.test.js', 'runner/gitOps.test.js', 'runner/harness.test.js', 'runner/harnessModelDiscovery.test.js', 'runner/impromptu.test.js', 'runner/logEvents.test.js', 'runner/modelDiscovery.test.js', 'runner/project.docsRepo.test.js', 'runner/project.test.js', 'runner/updates-check.test.js', 'runner/updates-compat.test.js', 'runner/updates-daemon.test.js', 'runner/updates-fixture.test.js', 'runner/updates-manifest.test.js', 'runner/updates-platform.test.js', 'runner/updates-state.test.js', 'runner/updates-verify.test.js', 'runner/updates-wrapper.test.js' ],
    expected: [ 'runner/ciBranchWorkdir.test.js', 'runner/client.backendOutage.test.js', 'runner/client.test.js', 'runner/config.test.js', 'runner/daemon.test.js', 'runner/gitOps.test.js', 'runner/harness.test.js', 'runner/harnessModelDiscovery.test.js', 'runner/impromptu.test.js', 'runner/logEvents.test.js', 'runner/modelDiscovery.test.js', 'runner/project.docsRepo.test.js', 'runner/project.test.js', 'runner/updates-check.test.js', 'runner/updates-compat.test.js', 'runner/updates-daemon.test.js', 'runner/updates-fixture.test.js', 'runner/updates-manifest.test.js', 'runner/updates-platform.test.js', 'runner/updates-state.test.js', 'runner/updates-verify.test.js', 'runner/updates-wrapper.test.js' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (265s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Harness Self-Tests; verdict at /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-78eac844-250a-44d1-810e-6f047eb5a59e/docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/ci-fast-gate-20261123-091750/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.