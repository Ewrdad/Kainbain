<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Make runner model discovery reliable and explicit
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1710.661s
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

added 351 packages, and audited 352 packages in 6s

85 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 420 packages, and audited 421 packages in 5s

143 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 807ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (35 files in 230ms)
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
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Linting (frontend) (1m30s), Dependency Check (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s), Linting (frontend) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;32mPASS[0m (251s)
Running Unit Tests (frontend)... [0;32mPASS[0m (251s)
Running Unit Tests (runner)... [0;32mPASS[0m (251s)
Running Linting (api)... [0;32mPASS[0m (251s)
Running Linting (frontend)... [0;32mPASS[0m (251s)
Running Frontend Build... [0;32mPASS[0m (251s)
Running Security Script Tests... [0;32mPASS[0m (251s)
Running Dependency Check... [0;32mPASS[0m (251s)
Running Dependency Audit Gate... [0;32mPASS[0m (251s)
Running Harness Self-Tests... [0;31mFAIL[0m (251s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 554 of 674 lines; showing the tail)
  ✖ packages a canary version under its full name and stamps version.json (22.887597ms)
  ✔ rejects non-semver versions instead of tarring them (0.8775ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (0.734571ms)
  ✖ agrees with buildManifest on the asset filename grammar (11.816378ms)
✖ packageRunner (52.07598ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (34.189311ms)
✔ installSteps (42.604871ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (36.945098ms)
  ✔ root .npmrc documents the per-dir mirrors (9.352235ms)
✔ installSteps npmrc (46.74944ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.421076ms)
  ✔ installs the browser alone on macOS and Windows (7.592637ms)
✔ playwrightAttempts (8.402549ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (33.676575ms)
✔ npxExecutable (34.043972ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (34.632705ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.334267ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.273987ms)
✔ browserInstallTargets (44.719854ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-PdpFOw/Sanity/docs' -> '/tmp/kainbain-sanity-notes-0QdXPB/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-eaLdsu/Sanity/docs' -> '/tmp/kainbain-sanity-notes-crFBXe/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-eaLdsu/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-crFBXe/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-eaLdsu/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-crFBXe/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-IEAwbz/Sanity/docs' -> '/tmp/kainbain-sanity-notes-3nIA5W/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-6B8Ipn/Sanity/docs' -> '/tmp/kainbain-sanity-notes-0SSWns/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-6B8Ipn/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-0SSWns/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-6B8Ipn/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-0SSWns/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-6Gi1iG/Sanity/docs' -> '/tmp/kainbain-sanity-notes-ow58CJ/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-SYKx7y/Sanity/docs' -> '/tmp/kainbain-sanity-notes-w6cgsx/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-SYKx7y/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-w6cgsx/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-SYKx7y/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-w6cgsx/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (69.5506ms)
  ✔ leaves no fixture residue in the OS temp dir (292.086784ms)
✔ checkStorageSanity (383.228712ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (1.622258ms)
  ✔ rejects a missing entry path or a different file (0.340701ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (3560.226879ms)
✔ isMainModule (3562.733056ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (5.268108ms)
  ✔ returns 0 when the notes space has no tasks dir (12.328928ms)
✔ countNotesTasks (18.154199ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (830.333862ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (303.115578ms)
  ✔ syncs build-info.json alongside a moved manifest commit (322.113133ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (214.203983ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (531.1615ms)
  ✔ is idempotent: a second run appends no duplicate history (836.471392ms)
  ✔ leaves an already-current primary manifest alone (551.563829ms)
✔ scripts/sync-tip-dist.mjs (3633.862906ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (15.142583ms)
✔ parseVerifyArgs (25.785551ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.81089ms)
✔ findHistoryTokens (1.049786ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (320.701811ms)
  ✔ defaults to the latest token when no SHA is given (262.480556ms)
  ✔ fails when the history token was tampered with (344.221234ms)
  ✔ fails when history names a commit the repo does not know (391.896962ms)
  ✔ fails when history carries no token, and when the task file is missing (158.568018ms)
  ✔ fails the pinned-config check on drifted config (476.076034ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (2544.594046ms)
✔ verifyFromRepo (4505.178071ms)
ℹ tests 393
ℹ suites 103
ℹ pass 391
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 102768.839318

✖ failing tests:

test at tests/runner-release-manifest.test.mjs:111:2
✖ packages a canary version under its full name and stamps version.json (22.887597ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-pkgroot-jRcdhA/api/package.json'
      at Object.readFileSync (node:fs:483:20)
      at stageLegNpmDeps (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:117:31)
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:170:22)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/runner-release-manifest.test.mjs:114:15)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-pkgroot-jRcdhA/api/package.json'
  }

test at tests/runner-release-manifest.test.mjs:146:2
✖ agrees with buildManifest on the asset filename grammar (11.816378ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-pkgroot-Z94D68/api/package.json'
      at Object.readFileSync (node:fs:483:20)
      at stageLegNpmDeps (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:117:31)
      at packageRunner (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/scripts/package-runner.mjs:170:22)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-77a4072e-3b0b-42b1-bd0b-3b21e129dd4b/tests/runner-release-manifest.test.mjs:151:18)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-pkgroot-Z94D68/api/package.json'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (251s)
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
⏳ still running: Canary Tests (14m00s)
⏳ still running: Canary Tests (14m30s)
Running Canary Tests... [0;32mPASS[0m (889s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.