<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Enforce binary-safe proof artifacts and repo-root scratch hygiene
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1019.703s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 926ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (36 files in 100ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (175s)
Running Unit Tests (frontend)... [0;32mPASS[0m (175s)
Running Unit Tests (runner)... [0;32mPASS[0m (175s)
Running Linting (api)... [0;32mPASS[0m (175s)
Running Linting (frontend)... [0;32mPASS[0m (175s)
Running Frontend Build... [0;32mPASS[0m (175s)
Running Security Script Tests... [0;32mPASS[0m (175s)
Running Dependency Check... [0;32mPASS[0m (175s)
Running Dependency Audit Gate... [0;32mPASS[0m (175s)
Running Harness Self-Tests... [0;31mFAIL[0m (175s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 676 of 796 lines; showing the tail)
[projectStore] '/tmp/kainbain-sanity-projects-nbnF8O/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KdUsll/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-nbnF8O/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KdUsll/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-YEilYD/Sanity/docs' -> '/tmp/kainbain-sanity-notes-BvJzlN/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HJYYFz/Sanity/docs' -> '/tmp/kainbain-sanity-notes-TWsPPs/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-HJYYFz/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-TWsPPs/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-HJYYFz/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-TWsPPs/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (104.873364ms)
  ✔ leaves no fixture residue in the OS temp dir (954.366432ms)
✔ checkStorageSanity (1085.565611ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.485509ms)
  ✔ rejects a missing entry path or a different file (37.51728ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1366.261055ms)
✔ isMainModule (1404.608398ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (0.871752ms)
  ✔ returns 0 when the notes space has no tasks dir (2.470066ms)
✔ countNotesTasks (3.635753ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (530.295828ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (198.650779ms)
  ✔ syncs build-info.json alongside a moved manifest commit (175.63943ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (212.111562ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (465.553534ms)
  ✔ is idempotent: a second run appends no duplicate history (446.146627ms)
  ✔ leaves an already-current primary manifest alone (190.218359ms)
✔ scripts/sync-tip-dist.mjs (2221.17693ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (5.396881ms)
✔ parseVerifyArgs (11.63004ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.604757ms)
✔ findHistoryTokens (0.769506ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (250.349536ms)
  ✔ defaults to the latest token when no SHA is given (227.815698ms)
  ✔ fails when the history token was tampered with (175.656385ms)
  ✔ fails when history names a commit the repo does not know (86.311359ms)
  ✔ fails when history carries no token, and when the task file is missing (68.659222ms)
  ✔ fails the pinned-config check on drifted config (189.910399ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (919.29008ms)
✔ verifyFromRepo (1935.007536ms)
ℹ tests 449
ℹ suites 118
ℹ pass 446
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 64541.754745

✖ failing tests:

test at tests/install-runner-wrapper.test.mjs:34:2
✖ --dry-run reports the wrapper paths and writes nothing (88.194367ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /INSTALL_ROOT=\/tmp\/kb-install-home-t3X9iE\/\.kainbain\/runner-install/. Input:
  
  'UNIT=/tmp/kb-install-home-t3X9iE/.config/systemd/user/kainbain-runner-local-x.service\n' +
    'ENV=/tmp/kb-install-home-t3X9iE/.kainbain/runner-local-x.env\n' +
    'RUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/runner\n' +
    'TREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31\n' +
    'INSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\n' +
    'BACKEND=http://localhost:3100\n'
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:42:11)
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
    actual: 'UNIT=/tmp/kb-install-home-t3X9iE/.config/systemd/user/kainbain-runner-local-x.service\nENV=/tmp/kb-install-home-t3X9iE/.kainbain/runner-local-x.env\nRUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/runner\nTREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31\nINSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\nBACKEND=http://localhost:3100\n',
    expected: /INSTALL_ROOT=\/tmp\/kb-install-home-t3X9iE\/\.kainbain\/runner-install/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/install-runner-wrapper.test.mjs:49:2
✖ writes a wrapper unit + env and lays the versioned tree down (1062.919507ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-DUfJEp/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:62:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'readlink',
    path: '/tmp/kb-install-home-DUfJEp/.kainbain/runner-install/current'
  }

test at tests/install-runner-wrapper.test.mjs:112:2
✖ creates a wrapper unit and lays the versioned tree down (774.768771ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-ELXzwD/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:124:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9 {
    errno: -2,
    code: 'ENOENT',
    syscall: 'readlink',
    path: '/tmp/kb-install-home-ELXzwD/.kainbain/runner-install/current'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (175s)
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
Running Canary Tests... [0;32mPASS[0m (837s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.