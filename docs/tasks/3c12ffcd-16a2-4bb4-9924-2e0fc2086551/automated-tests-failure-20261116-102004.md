<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Report agent-actionable CI failures before the long serial canary phase
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1003.032s
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
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607 (verdict.json + untrimmed failed-branch logs land here)
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
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 794ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (36 files in 113ms)
✅ Frontend imports check passed (744 files in 376ms)
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
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Linting (frontend) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;32mPASS[0m (225s)
Running Unit Tests (frontend)... [0;32mPASS[0m (225s)
Running Unit Tests (runner)... [0;32mPASS[0m (225s)
Running Linting (api)... [0;32mPASS[0m (225s)
Running Linting (frontend)... [0;32mPASS[0m (225s)
Running Frontend Build... [0;32mPASS[0m (225s)
Running Security Script Tests... [0;32mPASS[0m (225s)
Running Dependency Check... [0;32mPASS[0m (225s)
Running Dependency Audit Gate... [0;32mPASS[0m (225s)
Running Proof Hygiene... [0;32mPASS[0m (225s)
Running Harness Self-Tests... [0;31mFAIL[0m (225s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/harness-self-tests.full.log
(trimmed 818 of 938 lines; showing the tail)
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (35.651409ms)
  ✔ returns zero and does not throw when directory does not exist (0.253681ms)
✔ pruneStaleTestDirectories (37.887639ms)
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.
▶ buildManifest
  ✔ keeps the full canary version and points assetBase at the canary tag (24.123847ms)
  ✔ still builds plain final versions (1.733609ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (0.923846ms)
  ✔ stamps requires.backendApi from the release source tree (6.409495ms)
  ✔ omits requires when the source tree carries no range (legacy shape) (0.831304ms)
  ✔ sha256FileHex matches the manifest's hashing (0.349788ms)
✔ buildManifest (37.873313ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (45.553622ms)
  ✔ rejects non-semver versions instead of tarring them (25.260164ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (7.159239ms)
  ✔ leaves the default leg-closure install on for fake roots without crashing (auto-skip) (143.205663ms)
  ✔ stageLegNpmDeps fails closed with a named error when the root has no api/package.json (22.804182ms)
  ✔ agrees with buildManifest on the asset filename grammar (702.702231ms)
✔ packageRunner (950.171858ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (6.498937ms)
✔ installSteps (10.122973ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (7.385153ms)
  ✔ root .npmrc documents the per-dir mirrors (0.414581ms)
✔ installSteps npmrc (8.047334ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.35589ms)
  ✔ installs the browser alone on macOS and Windows (2.204069ms)
✔ playwrightAttempts (2.899062ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.239713ms)
✔ npxExecutable (7.526164ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (3.99357ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.280383ms)
  ✔ installs the browser alone for every target on macOS and Windows (2.750143ms)
✔ browserInstallTargets (8.557284ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-bf5Fsw/Sanity/docs' -> '/tmp/kainbain-sanity-notes-2AQmyu/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-WEqj26/Sanity/docs' -> '/tmp/kainbain-sanity-notes-HuONob/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-WEqj26/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-HuONob/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-WEqj26/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-HuONob/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-T9kCoL/Sanity/docs' -> '/tmp/kainbain-sanity-notes-StcnBi/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-bbTGp9/Sanity/docs' -> '/tmp/kainbain-sanity-notes-a8fJY4/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-bbTGp9/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-a8fJY4/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-bbTGp9/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-a8fJY4/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-zcE1si/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Q3EwrP/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-5d35vL/Sanity/docs' -> '/tmp/kainbain-sanity-notes-RzN5OL/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-5d35vL/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-RzN5OL/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-5d35vL/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-RzN5OL/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (47.605412ms)
  ✔ leaves no fixture residue in the OS temp dir (1810.402811ms)
✔ checkStorageSanity (1860.706432ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.527897ms)
  ✔ rejects a missing entry path or a different file (0.207899ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1275.860636ms)
✔ isMainModule (1283.978809ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (0.838543ms)
  ✔ returns 0 when the notes space has no tasks dir (0.616521ms)
✔ countNotesTasks (9.294379ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (391.304824ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (832.834435ms)
  ✔ syncs build-info.json alongside a moved manifest commit (804.902276ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (262.450786ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (211.408225ms)
  ✔ is idempotent: a second run appends no duplicate history (464.364288ms)
  ✔ leaves an already-current primary manifest alone (229.016973ms)
✔ scripts/sync-tip-dist.mjs (3204.359363ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (1.407435ms)
✔ parseVerifyArgs (9.918973ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.596126ms)
✔ findHistoryTokens (0.747575ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (262.029536ms)
  ✔ defaults to the latest token when no SHA is given (395.654176ms)
  ✔ fails when the history token was tampered with (354.857719ms)
  ✔ fails when history names a commit the repo does not know (248.828895ms)
  ✔ fails when history carries no token, and when the task file is missing (95.021098ms)
  ✔ fails the pinned-config check on drifted config (174.532942ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (640.202581ms)
✔ verifyFromRepo (2172.110754ms)
ℹ tests 580
ℹ suites 146
ℹ pass 579
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85704.294579

✖ failing tests:

test at tests/check-imports-declared.test.mjs:655:3
✖ the root gate exposes the check and runs it before the overlap window (0.901263ms)
  AssertionError [ERR_ASSERTION]: the imports-declared check must run before the overlap window starts
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/tests/check-imports-declared.test.mjs:674:12)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (225s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Harness Self-Tests; verdict at /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/verdict.json"
Fast-gate verdict: FAILED — Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-3c12ffcd-16a2-4bb4-9924-2e0fc2086551/docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/ci-fast-gate-20261116-101607/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.