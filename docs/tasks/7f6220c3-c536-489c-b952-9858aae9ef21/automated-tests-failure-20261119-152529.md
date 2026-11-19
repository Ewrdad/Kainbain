<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add support for projects having the kainbain docs in a seperate repo large projects may end up bloated with the project kainbain tasks/docs or we may be working on a repo with others who are non kainbain users. There may be reasons we dont want kainbain specific docs in the repo (maybe we just dont want to reveal the information publicly) therefore as an advance option we should be able to give a remote repo that is used to store kainbain specific information. This will need to be loaded onto runners adjacent to the main project repo, with synced task branches in order to keep things as similar to normal operations as possible . In UI configuration this should be allowed from the default when you import/create a new project (especially on an import)  Goal is allow people to use this without having their full team go in on it  (or so I can stealth use kainbain at work )
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 207.079s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 1s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (37 files in 206ms)
✅ Frontend imports check passed (754 files in 366ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (197s)
Running Unit Tests (frontend)... [0;32mPASS[0m (197s)
Running Unit Tests (runner)... [0;32mPASS[0m (197s)
Running Linting (api)... [0;32mPASS[0m (197s)
Running Linting (frontend)... [0;32mPASS[0m (197s)
Running Frontend Build... [0;32mPASS[0m (197s)
Running Security Script Tests... [0;32mPASS[0m (197s)
Running Dependency Check... [0;32mPASS[0m (197s)
Running Dependency Audit Gate... [0;32mPASS[0m (197s)
Running Proof Hygiene... [0;32mPASS[0m (197s)
Running Binary Guard... [0;32mPASS[0m (197s)
Running Harness Self-Tests... [0;31mFAIL[0m (197s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/harness-self-tests.full.log
(trimmed 991 of 1111 lines; showing the tail)
✔ buildManifest (9.498139ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (50.580029ms)
  ✔ rejects non-semver versions instead of tarring them (0.580575ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.457619ms)
  ✔ leaves the default leg-closure install on for fake roots without crashing (auto-skip) (43.408683ms)
  ✔ stageLegNpmDeps fails closed with a named error when the root has no api/package.json (20.408472ms)
  ✔ agrees with buildManifest on the asset filename grammar (241.280255ms)
✔ packageRunner (359.892832ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (1.465127ms)
✔ installSteps (4.753186ms)
▶ hookInstallStep
  ✔ pins the setup hook-install step: runs scripts/install-git-hooks.mjs with node from the repo root (0.489038ms)
✔ hookInstallStep (0.77791ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (0.598737ms)
  ✔ root .npmrc documents the per-dir mirrors (14.486412ms)
✔ installSteps npmrc (17.567493ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (1.998256ms)
  ✔ installs the browser alone on macOS and Windows (7.071061ms)
✔ playwrightAttempts (9.387773ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (25.478809ms)
✔ npxExecutable (25.68484ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (0.578808ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.085171ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.377823ms)
✔ browserInstallTargets (2.228456ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-lmJOYZ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-BLXZyG/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-01roMo/Sanity/docs' -> '/tmp/kainbain-sanity-notes-xHM9ae/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-01roMo/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-xHM9ae/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-01roMo/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-xHM9ae/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-9j6wa6/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Z53AX9/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-T7ztZs/Sanity/docs' -> '/tmp/kainbain-sanity-notes-tRenrq/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-T7ztZs/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-tRenrq/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-T7ztZs/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-tRenrq/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-jxh4mE/Sanity/docs' -> '/tmp/kainbain-sanity-notes-0SoUAn/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-VbxBQI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-3ebqRU/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-VbxBQI/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-3ebqRU/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-VbxBQI/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-3ebqRU/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (13.298524ms)
  ✔ leaves no fixture residue in the OS temp dir (806.785812ms)
✔ checkStorageSanity (830.267232ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.676248ms)
  ✔ rejects a missing entry path or a different file (0.249951ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (748.844516ms)
✔ isMainModule (750.204634ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (26.148865ms)
  ✔ returns 0 when the notes space has no tasks dir (0.518056ms)
✔ countNotesTasks (26.948384ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (52.762611ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (51.128832ms)
  ✔ syncs build-info.json alongside a moved manifest commit (194.122651ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (154.292193ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (250.885219ms)
  ✔ is idempotent: a second run appends no duplicate history (299.248463ms)
  ✔ leaves an already-current primary manifest alone (250.72307ms)
✔ scripts/sync-tip-dist.mjs (1256.089026ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (13.469943ms)
✔ parseVerifyArgs (17.081922ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.642561ms)
✔ findHistoryTokens (31.572278ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (225.24192ms)
  ✔ defaults to the latest token when no SHA is given (261.662387ms)
  ✔ fails when the history token was tampered with (136.976309ms)
  ✔ fails when history names a commit the repo does not know (93.954167ms)
  ✔ fails when history carries no token, and when the task file is missing (61.8974ms)
  ✔ fails the pinned-config check on drifted config (49.674052ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (377.577511ms)
✔ verifyFromRepo (1207.766074ms)
ℹ tests 687
ℹ suites 170
ℹ pass 686
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 90173.823182

✖ failing tests:

test at tests/publish.test.mjs:113:2
✖ runner gate runs the same suite list as scripts/run-tests.mjs (no under-tested channel) (19.589523ms)
  AssertionError [ERR_ASSERTION]: publish.sh runner gate names every suite in the gate branch
  + actual - expected
  ... Skipped lines
  
    [
      'runner/ciBranchWorkdir.test.js',
      'runner/client.test.js',
      'runner/config.test.js',
      'runner/daemon.test.js',
  ...
      'runner/modelDiscovery.test.js',
  -   'runner/project.docsRepo.test.js',
      'runner/project.test.js',
      'runner/updates-check.test.js',
      'runner/updates-compat.test.js',
      'runner/updates-daemon.test.js',
      'runner/updates-fixture.test.js',
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/tests/publish.test.mjs:126:10)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'runner/ciBranchWorkdir.test.js', 'runner/client.test.js', 'runner/config.test.js', 'runner/daemon.test.js', 'runner/gitOps.test.js', 'runner/harness.test.js', 'runner/harnessModelDiscovery.test.js', 'runner/impromptu.test.js', 'runner/logEvents.test.js', 'runner/modelDiscovery.test.js', 'runner/project.test.js', 'runner/updates-check.test.js', 'runner/updates-compat.test.js', 'runner/updates-daemon.test.js', 'runner/updates-fixture.test.js', 'runner/updates-manifest.test.js', 'runner/updates-platform.test.js', 'runner/updates-state.test.js', 'runner/updates-verify.test.js', 'runner/updates-wrapper.test.js' ],
    expected: [ 'runner/ciBranchWorkdir.test.js', 'runner/client.test.js', 'runner/config.test.js', 'runner/daemon.test.js', 'runner/gitOps.test.js', 'runner/harness.test.js', 'runner/harnessModelDiscovery.test.js', 'runner/impromptu.test.js', 'runner/logEvents.test.js', 'runner/modelDiscovery.test.js', 'runner/project.docsRepo.test.js', 'runner/project.test.js', 'runner/updates-check.test.js', 'runner/updates-compat.test.js', 'runner/updates-daemon.test.js', 'runner/updates-fixture.test.js', 'runner/updates-manifest.test.js', 'runner/updates-platform.test.js', 'runner/updates-state.test.js', 'runner/updates-verify.test.js', 'runner/updates-wrapper.test.js' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (197s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Harness Self-Tests; verdict at /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-7f6220c3-c536-489c-b952-9858aae9ef21/docs/tasks/7f6220c3-c536-489c-b952-9858aae9ef21/ci-fast-gate-20261119-152210/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.