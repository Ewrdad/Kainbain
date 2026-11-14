<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Make runner model discovery reliable and explicit
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1507.955s
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
✅ Settings duplicate check passed (36 files in 159ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (204s)
Running Unit Tests (frontend)... [0;32mPASS[0m (204s)
Running Unit Tests (runner)... [0;32mPASS[0m (204s)
Running Linting (api)... [0;32mPASS[0m (204s)
Running Linting (frontend)... [0;32mPASS[0m (204s)
Running Frontend Build... [0;32mPASS[0m (204s)
Running Security Script Tests... [0;32mPASS[0m (204s)
Running Dependency Check... [0;32mPASS[0m (204s)
Running Dependency Audit Gate... [0;32mPASS[0m (204s)
Running Harness Self-Tests... [0;31mFAIL[0m (204s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 599 of 719 lines; showing the tail)
  ✔ installs the browser alone for every target on macOS and Windows (0.35735ms)
✔ browserInstallTargets (9.307398ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-lZzOjg/Sanity/docs' -> '/tmp/kainbain-sanity-notes-65ZMhj/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-jZ6SMG/Sanity/docs' -> '/tmp/kainbain-sanity-notes-9CO3Jv/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-jZ6SMG/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-9CO3Jv/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-jZ6SMG/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-9CO3Jv/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-zWbd33/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Avoh2G/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-AAL4ej/Sanity/docs' -> '/tmp/kainbain-sanity-notes-GIUPjN/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-AAL4ej/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-GIUPjN/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-AAL4ej/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-GIUPjN/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-ZVCgXj/Sanity/docs' -> '/tmp/kainbain-sanity-notes-ISdmbq/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-ZyxmT9/Sanity/docs' -> '/tmp/kainbain-sanity-notes-ztDrE3/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-ZyxmT9/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-ztDrE3/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-ZyxmT9/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-ztDrE3/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (48.484014ms)
  ✔ leaves no fixture residue in the OS temp dir (599.296732ms)
✔ checkStorageSanity (649.72439ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (21.886817ms)
  ✔ rejects a missing entry path or a different file (1.373853ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (3652.976283ms)
✔ isMainModule (3676.826601ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (2.255311ms)
  ✔ returns 0 when the notes space has no tasks dir (0.728423ms)
✔ countNotesTasks (3.715003ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (158.881213ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (295.273017ms)
  ✔ syncs build-info.json alongside a moved manifest commit (119.377614ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (164.112294ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (324.268783ms)
  ✔ is idempotent: a second run appends no duplicate history (1074.926821ms)
  ✔ leaves an already-current primary manifest alone (335.15669ms)
✔ scripts/sync-tip-dist.mjs (2485.615219ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (15.987512ms)
✔ parseVerifyArgs (17.770318ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (21.737929ms)
✔ findHistoryTokens (21.998592ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (229.689926ms)
  ✔ defaults to the latest token when no SHA is given (352.269596ms)
  ✔ fails when the history token was tampered with (480.929625ms)
  ✔ fails when history names a commit the repo does not know (212.566467ms)
  ✔ fails when history carries no token, and when the task file is missing (271.391286ms)
  ✔ fails the pinned-config check on drifted config (226.947691ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1911.971106ms)
✔ verifyFromRepo (3690.63954ms)
ℹ tests 408
ℹ suites 107
ℹ pass 403
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 76464.44073

✖ failing tests:

test at tests/package-runner-conformance.test.mjs:76:2
✖ a packaged bundle stages through the real applyUpdate (38.023046ms)
  ReferenceError [Error]: build is not defined
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:185:16)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/package-runner-conformance.test.mjs:81:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/package-runner-conformance.test.mjs:135:2
✖ every leg specifier imports from the staged bundle tree (55260.888381ms)
  ReferenceError [Error]: build is not defined
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:185:16)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/package-runner-conformance.test.mjs:150:17)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-release-manifest.test.mjs:111:2
✖ packages a canary version under its full name and stamps version.json (31.457416ms)
  ReferenceError [Error]: build is not defined
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:185:16)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/runner-release-manifest.test.mjs:114:15)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9

test at tests/runner-release-manifest.test.mjs:146:2
✖ leaves the default leg-closure install on for fake roots without crashing (auto-skip) (22.600274ms)
  ReferenceError [Error]: build is not defined
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:185:16)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/runner-release-manifest.test.mjs:150:15)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-release-manifest.test.mjs:165:2
✖ agrees with buildManifest on the asset filename grammar (23.51898ms)
  ReferenceError [Error]: build is not defined
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:185:16)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/runner-release-manifest.test.mjs:170:18)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (204s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.