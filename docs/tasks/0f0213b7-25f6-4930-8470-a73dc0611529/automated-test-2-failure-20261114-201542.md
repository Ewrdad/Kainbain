<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Add dependency-manifest guardrail for new frontend imports
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 242.385s
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

added 351 packages, and audited 352 packages in 4s

85 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, mermaid, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 535 packages, and audited 536 packages in 5s

146 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Workspace dependencies installed (api, frontend).
✅ Settings duplicate check passed (36 files in 110ms)
✅ Frontend imports check passed (732 files in 357ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;32mPASS[0m (226s)
Running Unit Tests (frontend)... [0;32mPASS[0m (226s)
Running Unit Tests (runner)... [0;32mPASS[0m (226s)
Running Linting (api)... [0;32mPASS[0m (226s)
Running Linting (frontend)... [0;32mPASS[0m (226s)
Running Frontend Build... [0;32mPASS[0m (226s)
Running Security Script Tests... [0;32mPASS[0m (226s)
Running Dependency Check... [0;32mPASS[0m (226s)
Running Dependency Audit Gate... [0;32mPASS[0m (226s)
Running Harness Self-Tests... [0;31mFAIL[0m (226s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 686 of 806 lines; showing the tail)
[projectStore] '/tmp/kainbain-sanity-projects-98jwK9/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-Qagwo4/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-98jwK9/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-Qagwo4/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-g82lYK/Sanity/docs' -> '/tmp/kainbain-sanity-notes-VpWaFo/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-TG0yPI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-tFj9v1/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-TG0yPI/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-tFj9v1/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-TG0yPI/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-tFj9v1/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (17.754066ms)
  ✔ leaves no fixture residue in the OS temp dir (1267.362526ms)
✔ checkStorageSanity (1286.4067ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.479357ms)
  ✔ rejects a missing entry path or a different file (0.217803ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2494.661313ms)
✔ isMainModule (2495.671812ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (0.814839ms)
  ✔ returns 0 when the notes space has no tasks dir (7.896455ms)
✔ countNotesTasks (8.989446ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (275.04463ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (172.716838ms)
  ✔ syncs build-info.json alongside a moved manifest commit (597.998004ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (436.193068ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (315.890181ms)
  ✔ is idempotent: a second run appends no duplicate history (535.567481ms)
  ✔ leaves an already-current primary manifest alone (184.139772ms)
✔ scripts/sync-tip-dist.mjs (2524.707716ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (1.51299ms)
✔ parseVerifyArgs (2.62336ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.907322ms)
✔ findHistoryTokens (1.059435ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (224.280158ms)
  ✔ defaults to the latest token when no SHA is given (314.755961ms)
  ✔ fails when the history token was tampered with (192.883945ms)
  ✔ fails when history names a commit the repo does not know (269.218138ms)
  ✔ fails when history carries no token, and when the task file is missing (170.31605ms)
  ✔ fails the pinned-config check on drifted config (253.407519ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1431.621927ms)
✔ verifyFromRepo (2886.47306ms)
ℹ tests 455
ℹ suites 120
ℹ pass 452
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 82573.500912

✖ failing tests:

test at tests/install-runner-wrapper.test.mjs:34:2
✖ --dry-run reports the wrapper paths and writes nothing (463.839457ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /INSTALL_ROOT=\/tmp\/kb-install-home-KOCLq8\/\.kainbain\/runner-install/. Input:
  
  'UNIT=/tmp/kb-install-home-KOCLq8/.config/systemd/user/kainbain-runner-local-x.service\n' +
    'ENV=/tmp/kb-install-home-KOCLq8/.kainbain/runner-local-x.env\n' +
    'RUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529/runner\n' +
    'TREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529\n' +
    'INSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\n' +
    'BACKEND=http://localhost:3100\n'
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529/tests/install-runner-wrapper.test.mjs:42:11)
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
    actual: 'UNIT=/tmp/kb-install-home-KOCLq8/.config/systemd/user/kainbain-runner-local-x.service\nENV=/tmp/kb-install-home-KOCLq8/.kainbain/runner-local-x.env\nRUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529/runner\nTREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529\nINSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\nBACKEND=http://localhost:3100\n',
    expected: /INSTALL_ROOT=\/tmp\/kb-install-home-KOCLq8\/\.kainbain\/runner-install/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/install-runner-wrapper.test.mjs:49:2
✖ writes a wrapper unit + env and lays the versioned tree down (1388.038759ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-uyXioD/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529/tests/install-runner-wrapper.test.mjs:62:20)
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
    path: '/tmp/kb-install-home-uyXioD/.kainbain/runner-install/current'
  }

test at tests/install-runner-wrapper.test.mjs:112:2
✖ creates a wrapper unit and lays the versioned tree down (1248.515443ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-axfEAO/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-0f0213b7-25f6-4930-8470-a73dc0611529/tests/install-runner-wrapper.test.mjs:124:20)
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
    path: '/tmp/kb-install-home-axfEAO/.kainbain/runner-install/current'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (226s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.