<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can you please modify the now playing bar in the ui so it can show little boxes for runners I want for under 5 runners to replace the left side with little boxes that just have the runners name, task name and stage and maybe some sort of colour indicator of health
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 23.164s
**Status:** FAILED

### Summary of Changes
Execution failed: npm notice
npm notice New major version of npm available! 11.19.1 -> 12.2.1
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.1
npm notice To update run: npm install -g npm@12.2.1
npm notice


### Execution Output
```

up to date, audited 4 packages in 950ms

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Running Security Script Tests... SKIP (no bash on PATH (the security-scan harness is bash-only))
Running Dependency Check... SKIP (no depcheck binary in the root tree (run `npm install` to enable the unused-dependency check))
Running Container Tests... SKIP (no Docker daemon reachable (container build/boot tests need one))
✅ Settings duplicate check passed (23 files in 191ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
Running Unit Tests (api)... [0;31mFAIL[0m (1s)
----------------------------------------------------------------------
Details for Unit Tests (api):

> kainbain@1.0.0 test:api
> npm run test --prefix api


> api@1.0.0 test
> vitest run


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Startup Error [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯⎯[39m
Error: Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
    at file:///home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601:34
    at file:///home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
    ... 4 lines matching cause stack trace ...
    at async CAC.run (file:///home/server/projects/kainbain/api/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
  cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'
  Require stack:
  - /home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
      at file:///home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
      ... 8 lines matching cause stack trace ...
      at async CAC.run (file:///home/server/projects/kainbain/api/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
    cause: Error: Cannot find module './rolldown-binding.wasi.cjs'
    Require stack:
    - /home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
        at file:///home/server/projects/kainbain/api/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
        ... 8 lines matching cause stack trace ...
        at async CAC.run (file:///home/server/projects/kainbain/api/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
      cause: [Error]
    }
  }
}



----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;31mFAIL[0m (2s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):

> kainbain@1.0.0 test:frontend
> npm run test --prefix frontend


> frontend@1.0.0 test
> npm run check:duplicate-identifiers && vitest run


> frontend@1.0.0 check:duplicate-identifiers
> node ../scripts/check-duplicate-settings.mjs

✅ Settings duplicate check passed (23 files in 237ms)

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Startup Error [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯⎯[39m
Error: Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
    at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601:34
    at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
    ... 4 lines matching cause stack trace ...
    at async CAC.run (file:///home/server/projects/kainbain/frontend/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
  cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'
  Require stack:
  - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
      at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
      ... 8 lines matching cause stack trace ...
      at async CAC.run (file:///home/server/projects/kainbain/frontend/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
    cause: Error: Cannot find module './rolldown-binding.wasi.cjs'
    Require stack:
    - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
        at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
        ... 8 lines matching cause stack trace ...
        at async CAC.run (file:///home/server/projects/kainbain/frontend/node_modules/vitest/dist/chunks/cac.DfDGTQ9W.js:2346:2) {
      cause: [Error]
    }
  }
}



----------------------------------------------------------------------
Running Linting (api)... [0;32mPASS[0m (5s)
Running Linting (frontend)... [0;32mPASS[0m (11s)
Running Frontend Build... [0;31mFAIL[0m (11s)
----------------------------------------------------------------------
Details for Frontend Build:

> kainbain@1.0.0 build:frontend
> npm run build --prefix frontend


> frontend@1.0.0 build
> npm run check:react && node scripts/check-no-deprecations.js


> frontend@1.0.0 check:react
> node scripts/check-react-imports.js

✅ React import check passed — all source files that use `React.` import it.
file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601
			const error = /* @__PURE__ */ new Error("Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.");
			                              ^

Error: Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
    at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601:34
    at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
    ... 2 lines matching cause stack trace ...
    at async node:internal/modules/esm/loader:647:26 {
  cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'
  Require stack:
  - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
      at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
      ... 6 lines matching cause stack trace ...
      at async node:internal/modules/esm/loader:647:26 {
    cause: Error: Cannot find module './rolldown-binding.wasi.cjs'
    Require stack:
    - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
        at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
        ... 6 lines matching cause stack trace ...
        at async node:internal/modules/esm/loader:647:26 {
      cause: Error: Cannot find module '@rolldown/binding-linux-x64-musl'
      Require stack:
      - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
          at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
          ... 6 lines matching cause stack trace ...
          at async node:internal/modules/esm/loader:647:26 {
        cause: Error: Cannot find module './rolldown-binding.linux-x64-musl.node'
        Require stack:
        - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
            at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
            at Array.reduce (<anonymous>)
            at createLoadErrorChain (file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:488:17)
            at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:602:18
            at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
            at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/parse-B7LUicIJ.mjs:3:46
            at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
            at async node:internal/modules/esm/loader:647:26 {
          cause: null
        }
      }
    }
  }
}

Node.js v24.22.1
----------------------------------------------------------------------
Running Dependency Audit Gate... [0;32mPASS[0m (11s)
Running Harness Self-Tests... [0;31mFAIL[0m (17s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
▶ usesOperatorStack
  ✔ is false when neither operator URL is set (scratch stack is ours) (1.090059ms)
  ✔ is true when either operator URL is set (0.350139ms)
✔ usesOperatorStack (10.360151ms)
▶ isScratchOccupant
  ✔ accepts a scratch API by cwd or command shape (0.580541ms)
  ✔ accepts a scratch vite by its dedicated port flag (5.403451ms)
  ✔ rejects an unrelated occupant on the API port (0.543188ms)
  ✔ rejects an unrelated occupant on the vite port (0.478916ms)
  ✔ rejects a real dev vite on the live dev port (2.477117ms)
  ✔ rejects an arbitrary occupant on an unknown port (0.714219ms)
  ✔ is not fooled by the empty/legacy probe shape (17.443139ms)
✔ isScratchOccupant (41.639271ms)
▶ probeProcess
  ✔ reads cmdline and cwd from /proc on linux (18.19883ms)
  ✔ still classifies when the cwd link is unreadable (0.406125ms)
  ✔ returns null when the process is gone (26.931752ms)
  ✔ falls back to ps on non-linux platforms (0.44792ms)
  ✔ returns null on non-linux when the process is gone (0.417064ms)
✔ probeProcess (46.804697ms)
▶ freeScratchPorts
  ✔ is a no-op when the operator drives their own stack (10.338347ms)
  ✔ frees both scratch ports when their occupants verify (18.942398ms)
  ✔ reports success without touching an already-free port (0.267045ms)
  ✔ fails closed when an occupant does not verify as scratch (0.298062ms)
  ✔ treats an uninspectable occupant as unverified (1.384748ms)
✔ freeScratchPorts (31.532087ms)
▶ scanSourceForDuplicateIdentifiers
  ✔ reports no violations for a clean module (97.299434ms)
  ✔ detects the task-efa802a6 splitReasoning duplicate import (4.844949ms)
  ✔ detects duplicate variable declarations (2.691162ms)
  ✔ detects var redeclarations that the parser permits (0.679246ms)
  ✔ detects an import colliding with a variable declaration (0.540131ms)
  ✔ detects duplicate function declarations (5.553495ms)
  ✔ detects duplicate class declarations (1.28685ms)
  ✔ detects duplicate destructured variable declarations (9.120603ms)
  ✔ detects duplicate default imports (0.571789ms)
  ✔ detects duplicate namespace imports (5.295361ms)
  ✔ detects an exported variable colliding with an import (7.622336ms)
  ✔ detects a named default export colliding with a variable (5.754167ms)
  ✔ ignores identifiers shadowed in nested scopes (4.397624ms)
  ✔ ignores block-scoped redeclarations (0.6364ms)
  ✔ ignores duplicate words inside comments and strings (0.88929ms)
  ✔ ignores re-exports with different names (export { x } from 'y') (18.914223ms)
  ✔ reports re-exports with the same name as a parse error (0.371057ms)
  ✔ ignores export-star (export * from 'y') (7.28244ms)
  ✔ ignores side-effect imports (import 'y') (0.396237ms)
  ✔ ignores anonymous default exports (27.677477ms)
  ✔ reports parse errors as violations (0.495659ms)
  ✔ reports const redeclarations caught by the parser itself (0.358525ms)
  ✔ handles empty source code (2.57401ms)
  ✔ handles source with only comments (0.457396ms)
  ✔ reports multiple duplicates in one file (24.281246ms)
  ✔ includes a remediation message on each violation (1.878085ms)
✔ scanSourceForDuplicateIdentifiers (258.902933ms)
▶ findSourceFilesInDirectory
  ✔ returns only source files, excluding tests and non-JS files (40.077769ms)
  ✔ skips node_modules, dist, and other build directories (0.886839ms)
  ✔ returns an empty array for a nonexistent directory (0.228024ms)
  ✔ throws when directoryPath is missing (5.792346ms)
✔ findSourceFilesInDirectory (47.309759ms)
▶ checkDirectoryForDuplicates
  ✔ cleanly scans the real settings directory (449.194654ms)
  ✔ reports injected duplicates (11.775452ms)
  ✔ fails safe when the target directory has no source files (0.450705ms)
  ✔ fails safe when the target directory does not exist (0.390922ms)
  ✔ scans a custom target directory (9.521695ms)
  ✔ reports syntax errors in scanned files (3.327317ms)
✔ checkDirectoryForDuplicates (475.304365ms)
▶ formatViolationsReport
  ✔ renders a helpful message when there are no violations (4.387425ms)
  ✔ renders a populated report with location and identifier (0.159141ms)
  ✔ renders violations without an identifier name (0.101558ms)
  ✔ renders violations without a message (0.107996ms)
  ✔ handles a missing violationsList gracefully (0.079719ms)
✔ formatViolationsReport (5.048753ms)
▶ hasExampleTag
  ✔ detects @example in a JSDoc block (3.611993ms)
✔ hasExampleTag (9.464455ms)
▶ nearestJsdoc
  ✔ finds an attached block and rejects detached ones (0.539696ms)
✔ nearestJsdoc (0.724864ms)
▶ findPublicExports
  ✔ finds functions, classes, bindings, and defaults with example status (15.198823ms)
  ✔ splits multi-declarator consts under one JSDoc block (2.685587ms)
  ✔ skips re-export lists and export-star (0.317154ms)
  ✔ ignores the word export inside comments and strings (0.208735ms)
  ✔ masks template raw text so apostrophes cannot swallow later exports (19.30313ms)
✔ findPublicExports (38.284821ms)
▶ isDocSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.508823ms)
  ✔ excludes tests, fixtures, mocks, and scripts (0.555065ms)
✔ isDocSourceFile (21.893608ms)
▶ checkMissing
  ✔ passes baselined exports and fails new ones (2.817381ms)
  ✔ fails everything in strict mode (0.184131ms)
  ✔ reports baseline entries that now carry @example (0.150623ms)
✔ checkMissing (3.37904ms)
▶ formatExampleFailure
  ✔ names the export and gives a fix recipe (5.350913ms)
✔ formatExampleFailure (5.466454ms)
▶ committed-tree grandfather proof
  ✔ the baseline covers every currently-missing export (1523.038298ms)
✔ committed-tree grandfather proof (1523.143501ms)
▶ topLevelFunctions
  ✔ counts one top-level declaration (2.943719ms)
  ✔ counts multiple top-level declarations including async and default (0.287059ms)
  ✔ ignores nested declarations and callbacks (0.359272ms)
  ✔ ignores arrow-function constants (0.330154ms)
  ✔ ignores the word function inside comments, strings, and JSDoc examples (0.342322ms)
  ✔ masks template raw text so apostrophes cannot swallow later code (0.602132ms)
  ✔ still sees functions declared inside ${} interpolations at depth (0.315574ms)
✔ topLevelFunctions (7.821461ms)
▶ isSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.568337ms)
  ✔ excludes tests, specs, configs, and out-of-scope roots (2.808501ms)
✔ isSourceFile (3.915988ms)
▶ checkFiles
  ✔ passes single-function and zero-function files (2.176094ms)
  ✔ fails unlisted multi-function files (0.216156ms)
  ✔ grandfathers allowlisted paths that already existed (1.293469ms)
  ✔ still fails an allowlisted path that is newly added (0.164464ms)
  ✔ reports stale allowlist entries for pruning (0.244222ms)
✔ checkFiles (4.491228ms)
▶ formatFailure
  ✔ names the file, the functions, and the remediation (0.47425ms)
✔ formatFailure (0.769908ms)
▶ git integration
  ✔ resolves a diff base or degrades to null outside git (14.158665ms)
  ✔ lists newly-added paths as an array (31.740797ms)
✔ git integration (46.061537ms)
▶ deploy.sh test gates (static contract)
  ✔ runs the fast branches as the final-test-suite gate without canary (2.011969ms)
  ✔ runs the canary suite exactly once as its own blocking canary-e2e gate (0.879554ms)
  ✔ orders the canary-e2e gate after the final-test-suite gate (2.730107ms)
  ✔ skips the canary gate only on exactly KAINBAIN_SKIP_CANARY=1 (fail-safe) (2.387926ms)
✔ deploy.sh test gates (static contract) (11.283902ms)
▶ deploy / npm test parity (executable contract)
  ✔ final-test-suite branches + canary-e2e gate equal the default npm test branches (6.952151ms)
  ✔ fast branches execute the identical command with and without canary (1.967998ms)
  ✔ the canary-e2e gate command matches the gate's Canary Tests branch (3.102ms)
  ✔ root test:canary delegates to the canary-e2e package suite (0.660453ms)
✔ deploy / npm test parity (executable contract) (13.30862ms)
▶ deploy.sh re-exec line (static contract)
  ✔ waits for the transient unit so its exit code propagates (--wait) (4.420919ms)
  ✔ injects a node-aware PATH into the transient unit (--setenv) (16.938587ms)
✔ deploy.sh re-exec line (static contract) (23.236641ms)
▶ deploy.sh re-exec behaviour (fake systemd-run)
  ✖ passes --wait and a node-aware PATH to systemd-run (24.954867ms)
  ✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (6.223064ms)
  ✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (6.195409ms)
  ✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (11.258985ms)
  ✖ omits the attempt-id setenv on manual runs without an attempt id (7.13695ms)
✖ deploy.sh re-exec behaviour (fake systemd-run) (58.868789ms)
▶ deploy.sh fail-safe contracts (static)
  ✔ skips the canary E2E gate on exactly KAINBAIN_SKIP_CANARY=1 (parity with npm test) (2.085598ms)
  ✔ labels the release snapshot with the pre-increment build (no mislabel) (2.787397ms)
  ✔ guards the STAGE EXIT trap when the stage dir was never created (1.992291ms)
  ✔ fails fast on missing jq/curl before consuming a build number (2.870946ms)
  ✔ creates the deploy dir before taking the rollback lock (2.682878ms)
  ✔ never re-enters auto-rollback through the ERR trap (1.52206ms)
  ✔ never rolls back a healthy deploy over an nginx reload failure (0.625061ms)
  ✔ always leaves a durable result from rollback-mode failures (4.636447ms)
  ✔ never passes --pipe to systemd-run (dead-reader regression, 2026-10-12) (4.760856ms)
  ✔ needs no stdio detach before restart_service (no pipe, no EPIPE) (0.650595ms)
✔ deploy.sh fail-safe contracts (static) (25.366927ms)
▶ deploy.sh re-exec argv (fake systemd-run, no --pipe)
  ✖ omits --pipe from the real re-exec argv while keeping --wait (11.414586ms)
✖ deploy.sh re-exec argv (fake systemd-run, no --pipe) (11.540553ms)
▶ deploy.sh engine heartbeat pump (foreground liveness)
  ✖ emits engine-visible heartbeats while the detached unit runs (13.093451ms)
✖ deploy.sh engine heartbeat pump (foreground liveness) (13.271814ms)
▶ findDeprecationWarnings
  ✔ flags the three build-log warning shapes from the task screenshot (2.868764ms)
  ✔ passes clean build output (including the chunk-size hint) (0.285311ms)
  ✔ an allowlist entry suppresses its matching line only (0.285179ms)
  ✔ an expired allowlist entry does not suppress (0.204684ms)
  ✔ an entry without an expiry date does not suppress (0.223278ms)
  ✔ an entry with an invalid regex pattern fails closed instead of crashing (0.27781ms)
  ✔ an invalid pattern does not break its valid siblings (0.230175ms)
✔ findDeprecationWarnings (6.730997ms)
▶ compileAllowlistPattern
  ✔ compiles a valid pattern (4.080656ms)
  ✔ returns null for a pattern that does not compile (0.45365ms)
✔ compileAllowlistPattern (13.040018ms)
▶ loadBuildAllowlist
  ✔ loads the shipped allowlist file without crashing (0.368336ms)
✔ loadBuildAllowlist (0.526ms)
▶ check-no-deprecations binary
  ✔ exits 0 and passes output through when the build is clean (246.452967ms)
  ✔ exits non-zero when the build prints a deprecation warning (174.188423ms)
  ✔ exits non-zero when the build command itself fails (163.600387ms)
✔ check-no-deprecations binary (584.475836ms)
▶ evaluateAudit
  ✔ reports non-allowlisted high findings as blocking (0.627ms)
  ✔ ignores moderate and low findings (0.160408ms)
  ✔ an allowlist entry with a valid expiry suppresses its advisory (0.435351ms)
  ✔ an expired allowlist entry does not suppress (0.174911ms)
  ✔ an entry for a different advisory source does not suppress (0.132438ms)
  ✔ tolerates audit output with no vulnerabilities key (0.119132ms)
  ✔ suppresses transitive dependents when the root advisory is allowlisted (1.630247ms)
  ✔ a transitive chain with no reachable advisory stays blocking (0.497539ms)
✔ evaluateAudit (4.262491ms)
▶ resolveDevPlan
  ✔ defaults to API :3100 and frontend :5173 (4.230493ms)
  ✔ honors PORT and VITE_PORT (1.22831ms)
  ✔ supervises the API node process and the Vite npm script (0.576025ms)
  ✔ rejects a garbage port naming the variable (0.953256ms)
✔ resolveDevPlan (9.177688ms)
▶ dev --dry-run
  ✔ prints the plan and exits without touching ports (92.503621ms)
✔ dev --dry-run (92.909864ms)
▶ entry points stay free of Linux-only tooling
  ✔ scripts/run-tests.mjs references no Linux-only tooling (4.159798ms)
  ✔ scripts/depcheck.mjs references no Linux-only tooling (0.527344ms)
  ✔ scripts/dev.mjs references no Linux-only tooling (1.540884ms)
  ✔ scripts/setup.mjs references no Linux-only tooling (1.71177ms)
  ✔ scripts/free-port.mjs references no Linux-only tooling (0.379789ms)
  ✔ scripts/lib/run-parallel.mjs references no Linux-only tooling (0.954424ms)
  ✔ scripts/lib/run-supervised.mjs references no Linux-only tooling (0.326953ms)
  ✔ package.json references no Linux-only tooling (0.816776ms)
✔ entry points stay free of Linux-only tooling (16.393618ms)
▶ root scripts point at the Node runners
  ✔ test runs the Node gate (2.487404ms)
  ✔ dev runs the Node supervisor (0.26934ms)
  ✔ setup runs the Node installer (0.14621ms)
  ✔ depcheck runs the Node fan-out (1.257017ms)
✔ root scripts point at the Node runners (7.42643ms)
▶ workspace test scripts carry no shell env prefix
  ✔ api test runs under Windows cmd (no VAR= prefix) (2.102599ms)
  ✔ frontend test runs under Windows cmd (no VAR= prefix) (0.275009ms)
✔ workspace test scripts carry no shell env prefix (2.519487ms)
▶ run-tests.sh stays a thin shim
  ✔ delegates to the Node gate without its own runner (0.83789ms)
✔ run-tests.sh stays a thin shim (0.983125ms)
▶ installs resolve the way the lockfiles were built
  ✔ root .npmrc pins legacy peer resolution (frontend needs it) (0.279189ms)
✔ installs resolve the way the lockfiles were built (1.143054ms)
▶ isPortOccupied
  ✔ reports false for a free ephemeral port (14.591488ms)
  ✔ reports true for a bound port (2.5026ms)
  ✔ reports false again after the holder closes (4.992265ms)
  ✔ rejects an out-of-range port number (1.447947ms)
✔ isPortOccupied (25.816782ms)
▶ findOccupantPids
  ✔ parses lsof -ti output on linux (1.731026ms)
  ✔ parses lsof -ti output on darwin (0.358777ms)
  ✔ returns an empty list when lsof finds no occupant (exit 1) (1.59422ms)
  ✔ falls back to ss when lsof is missing on linux (0.781925ms)
  ✔ ss fallback only returns pids listening on the requested port (0.775014ms)
  ✔ reports a clear error when neither lsof nor ss exists (0.619649ms)
  ✔ parses netstat -ano output on win32 (0.383363ms)
  ✔ returns an empty list when netstat shows no listener (0.295872ms)
✔ findOccupantPids (7.597658ms)
▶ freePort
  ✔ is a no-op reporting alreadyFree when the port is free (0.518893ms)
  ✔ terminates the occupant and reports freed when the port releases (0.356634ms)
  ✔ escalates to SIGKILL when the occupant ignores SIGTERM (50.300259ms)
  ✔ never kills its own process (0.510695ms)
  ✔ fails with an actionable error when the port never releases (25.812095ms)
  ✔ fails with an actionable error when no occupant pid is found (0.239342ms)
  ✔ terminates a verified occupant when verifyFn approves it (0.341485ms)
  ✔ refuses to kill any occupant when verifyFn rejects it (0.269463ms)
  ✔ treats a throwing verifyFn as unverified instead of killing (0.277572ms)
✔ freePort (79.117606ms)
[remediate] --tasks-dir requires a value
Usage: node scripts/remediate-no-verdict-rejections.mjs [--apply] [--tasks-dir <dir>] [--log <file>] [--no-backup]
[remediate] tasks dir not found: /tmp/kainbain-remediate-absent
[remediate] dry-run: 1 task(s) would be repaired (re-run with --apply)
  - task-1: removed 1 spurious failure(s), repaired 1 report(s), removed stale verdictImplicitPassStages
▶ parseArgs
  ✔ defaults to a dry run that writes nothing (2.385374ms)
  ✔ honours --apply, --no-backup, --tasks-dir, and --log (0.389001ms)
  ✔ lets the last of --apply/--dry-run win (0.257682ms)
  ✔ records an error instead of throwing when a value is missing (0.232993ms)
  ✔ ignores unknown flags (a typo degrades to a dry run, never a write) (0.231778ms)
✔ parseArgs (5.861108ms)
▶ backupPathFor
  ✔ appends .bak (0.508761ms)
✔ backupPathFor (0.684209ms)
▶ remediateTasks
  ✔ reports victims without writing in dry-run mode (3.154362ms)
  ✔ repairs task and report files with backups, then idles on re-run (4.850902ms)
  ✔ leaves a task with only genuine failures byte-identical (1.870247ms)
  ✔ returns an error for a missing tasks dir instead of throwing (1.004506ms)
✔ remediateTasks (11.558698ms)
▶ main
  ✔ exits 2 with usage on argument errors before touching files (2.621219ms)
  ✔ exits 1 on a missing tasks dir (1.427505ms)
  ✔ dry-runs a temp tasks dir and exits 0 (1.45756ms)
✔ main (5.721601ms)
▶ parseArgs
  ✔ defaults to the api suite, 5 runs, no pattern (1.55535ms)
  ✔ parses every flag (0.292994ms)
  ✔ rejects an unknown suite, unknown flag, and non-positive runs (1.109754ms)
  ✔ rejects a flag with no value (0.268544ms)
✔ parseArgs (5.381558ms)
▶ normalizePattern
  ✔ strips the suite directory prefix so the runner resolves the filter in its own workspace (0.595961ms)
  ✔ passes through a bare substring filter unchanged (0.200396ms)
  ✔ rejects an unknown suite (2.058193ms)
✔ normalizePattern (3.893788ms)
▶ buildRepeatCommand
  ✔ targets the suite workspace through npm with no shell (2.260781ms)
  ✔ passes the pattern as a workspace-relative positional filter after -- (0.770926ms)
  ✔ maps canary to its own workspace (0.9318ms)
  ✔ rejects an unknown suite (0.306901ms)
✔ buildRepeatCommand (4.632729ms)
▶ extractFailureSignatures
  ✔ strips ANSI colour and keeps vitest FAIL headlines once each (0.594255ms)
  ✔ falls back to Error lines when the run died before reporting tests (0.49685ms)
  ✔ caps the number of signatures (0.215566ms)
  ✔ returns an empty list for a clean run (0.136873ms)
✔ extractFailureSignatures (2.262536ms)
▶ summarizeRuns
  ✔ counts passes, failing run numbers, and distinct signatures (0.806765ms)
  ✔ reports a zero pass rate for an empty record set without dividing by zero (0.152905ms)
✔ summarizeRuns (1.086318ms)
▶ runRepeat
  ✔ runs the suite N times, logs JSONL + raw output, and reports a green pass rate (2.524478ms)
  ✔ records failures with their signatures and returns ok:false (1.167388ms)
✔ runRepeat (3.843087ms)
▶ runParallel
  ✔ all branches pass -> ok:true with a PASS line per branch (67.885427ms)
  ✔ one branch fails -> ok:false, FAIL names the branch, the other still passes, output shown (1107.291385ms)
  ✔ all branches fail -> ok:false (105.125497ms)
  ✔ seven branches work (mirrors the gate overlap window) (183.465572ms)
  ✔ reports lines in argument order even when a later branch finishes first (867.945389ms)
  ✔ a missing command fails its branch instead of crashing the run (41.695708ms)
  ✔ passing branch output stays hidden (43.566298ms)
  ✔ lowPriority branches still run (niceness is best-effort) (47.24163ms)
✔ runParallel (2467.917327ms)
▶ runParallel progress output (no silent blackout)
  ✔ announces every branch at spawn, in argument order, before any result line (65.917069ms)
  ✔ emits a still-running tick naming outstanding branches while a slow branch runs (407.891564ms)
  ✔ emits no tick when every branch settles inside the interval (67.726522ms)
  ✔ progressIntervalMs 0 disables the tick entirely (353.1139ms)
  ✔ an injected failing branch still prints its full details unchanged (48.876767ms)
  ✔ resolveProgressIntervalMs: option wins, then env, then the 30s default (0.279391ms)
  ✔ formatElapsedSeconds renders compact human durations (1.249202ms)
✔ runParallel progress output (no silent blackout) (945.825324ms)
▶ hung-branch guard (a timed-out branch fails the gate, it cannot hang it)
  ✔ reports exit 124 and settles even when the branch never emits close (91.190096ms)
  ✔ keeps the branch's captured output when it is reaped (72.214471ms)
  ✖ reaps the whole branch process tree, not just the direct child (11065.003093ms)
✖ hung-branch guard (a timed-out branch fails the gate, it cannot hang it) (11231.352103ms)
▶ vitest workers: defaults govern (no cap)
  ✔ scripts/run-tests.mjs sets no worker cap (1.062337ms)
  ✔ api vitest config uses vitest defaults (0.646974ms)
  ✔ frontend vitest config uses vitest defaults (0.463207ms)
✔ vitest workers: defaults govern (no cap) (2.753758ms)
▶ api worker pool: thread workers, per-file isolation kept
  ✔ runs the api suite on the threads pool (no fork per file) (0.821701ms)
  ✔ never disables per-file isolation (0.664977ms)
  ✔ keeps the per-file isolation setup file installed (0.484528ms)
✔ api worker pool: thread workers, per-file isolation kept (2.533857ms)
▶ vitest node-env contract: node builtins stay out of shared happy-dom workers
  ✔ no frontend suite imports the api tree (no pin escape hatch) (47.083351ms)
  ✔ every node:-importing suite runs in node env or the forks pool (19.029698ms)
  ✔ every forks-pinned suite is excluded from the main project (no double run) (0.347714ms)
✔ vitest node-env contract: node builtins stay out of shared happy-dom workers (66.746239ms)
▶ runSupervised
  ✔ streams each child's output with its prefix (187.638216ms)
  ✔ resolves with the first child's exit code and stops the sibling (158.389127ms)
  ✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5175.713533ms)
  ✔ a missing command fails the run instead of hanging (55.71324ms)
  ✔ SIGTERM to the supervisor stops every child and resolves ok (105.790544ms)
✖ runSupervised (5687.248314ms)
▶ buildBranches
  ✔ builds the eleven canonical branches in order when bash and docker exist (4.132393ms)
  ✔ every branch spawns a binary with argv (never a shell string) (0.443435ms)
  ✔ unit tests run at normal priority, the rest low (0.367552ms)
  ✔ reports SKIP (non-fatal) for Security Script Tests without bash (0.543553ms)
  ✔ reports SKIP (non-fatal) for Container Tests without a docker daemon (0.513005ms)
  ✔ reports SKIP (non-fatal) for Dependency Check without the depcheck binary (0.412624ms)
  ✔ keeps Dependency Check runnable (low priority, via npm) when the binary exists (0.304099ms)
  ✔ container tests run the docker suite through node --test (1.263108ms)
  ✔ harness self-tests run the ported node suites (not the old shell one) (0.617446ms)
  ✔ includes Canary Tests by default (npm test parity with deploy.sh --prod) (0.975427ms)
  ✔ omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1) (0.406359ms)
  ✔ spawns Canary Tests last as npm run test:canary (0.320664ms)
✔ buildBranches (12.843877ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (1.408357ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.30417ms)
✔ splitGatePhases (1.889263ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.51137ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.151277ms)
  ✔ opts out via --no-canary (0.103838ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.109039ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.12025ms)
  ✔ skip flags win over the legacy opt-in flags (0.11865ms)
✔ resolveCanary (1.481061ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (0.856121ms)
  ✔ reports true when the root tree carries the Windows binary (0.603211ms)
  ✔ reports false when the platform's binary name is missing (0.583762ms)
  ✔ reports false when the root tree has no binaries at all (0.388075ms)
✔ depcheckAvailable (2.650916ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (1.451528ms)
  ✔ returns zero and does not throw when directory does not exist (0.320844ms)
✔ pruneStaleTestDirectories (2.080849ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (3.28671ms)
✔ installSteps (5.4911ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (2.131634ms)
  ✔ root .npmrc documents the per-dir mirrors (0.479024ms)
✔ installSteps npmrc (2.909895ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.34895ms)
  ✔ installs the browser alone on macOS and Windows (0.910487ms)
✔ playwrightAttempts (1.838597ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.476269ms)
✔ npxExecutable (0.977421ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (1.476664ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (2.26988ms)
  ✔ installs the browser alone for every target on macOS and Windows (3.870376ms)
✔ browserInstallTargets (8.109278ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-fEgOhC/Sanity/docs' -> '/tmp/kainbain-sanity-notes-gFachC/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-GModoC/Sanity/docs' -> '/tmp/kainbain-sanity-notes-igGgoC/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-GModoC/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-igGgoC/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-GModoC/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-igGgoC/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-kfopDD/Sanity/docs' -> '/tmp/kainbain-sanity-notes-leJDED/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-JLfdGD/Sanity/docs' -> '/tmp/kainbain-sanity-notes-oMpfGD/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-JLfdGD/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-oMpfGD/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-JLfdGD/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-oMpfGD/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HeKciM/Sanity/docs' -> '/tmp/kainbain-sanity-notes-mgffiM/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-GOlgCN/Sanity/docs' -> '/tmp/kainbain-sanity-notes-KHNjCN/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-GOlgCN/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KHNjCN/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-GOlgCN/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KHNjCN/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (12.795696ms)
  ✔ leaves no fixture residue in the OS temp dir (6.048914ms)
✔ checkStorageSanity (20.334895ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.548068ms)
  ✔ rejects a missing entry path or a different file (0.383267ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (397.801226ms)
✔ isMainModule (399.124115ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (2.784593ms)
  ✔ returns 0 when the notes space has no tasks dir (0.819093ms)
✔ countNotesTasks (4.2316ms)
ℹ tests 287
ℹ suites 72
ℹ pass 278
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17078.226777

✖ failing tests:

test at tests/deploy-reexec.test.mjs:101:2
✖ passes --wait and a node-aware PATH to systemd-run (24.954867ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-bJCkIJ/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:102:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-bJCkIJ/argv.log'
  }

test at tests/deploy-reexec.test.mjs:113:2
✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (6.223064ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-cahmCK/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:114:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-cahmCK/argv.log'
  }

test at tests/deploy-reexec.test.mjs:119:2
✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (6.195409ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-DhJfGK/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:120:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-DhJfGK/argv.log'
  }

test at tests/deploy-reexec.test.mjs:127:2
✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (11.258985ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-lACgMK/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:133:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-lACgMK/argv.log'
  }

test at tests/deploy-reexec.test.mjs:140:2
✖ omits the attempt-id setenv on manual runs without an attempt id (7.13695ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-ioEijK/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runWithFakeSystemdRun (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:94:20)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:141:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-reexec-ioEijK/argv.log'
  }

test at tests/deploy-reexec.test.mjs:280:2
✖ omits --pipe from the real re-exec argv while keeping --wait (11.414586ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-nopipe-EAJOjL/argv.log'
      at Object.readFileSync (node:fs:483:20)
      at runReexecCapture (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:312:15)
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:317:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/tmp/kb-deploy-nopipe-EAJOjL/argv.log'
  }

test at tests/deploy-reexec.test.mjs:324:2
✖ emits engine-visible heartbeats while the detached unit runs (13.093451ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  null !== 0
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/deploy-reexec.test.mjs:364:11)
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
    actual: null,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/run-parallel.test.mjs:337:2
✖ reaps the whole branch process tree, not just the direct child (11065.003093ms)
  AssertionError [ERR_ASSERTION]: the grandchild should have been reaped with the branch's process group
  
  true !== false
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/run-parallel.test.mjs:381:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/run-supervised.test.mjs:128:2
✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5175.713533ms)
  AssertionError [ERR_ASSERTION]: grandchild orphaned the wrapper's pipes
  
  false !== true
  
      at TestContext.<anonymous> (file:///home/server/projects/kainbain/tests/run-supervised.test.mjs:163:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
Running Canary Tests... [0;31mFAIL[0m (4s)
----------------------------------------------------------------------
Details for Canary Tests:

> kainbain@1.0.0 test:canary
> npm run test --prefix canary-e2e


> canary-e2e@1.0.0 test
> node ../scripts/canary-preflight.mjs && playwright test

canary-preflight: port 3399 already free
canary-preflight: port 5299 already free
Port 3399: already free
Port 5299: already free
[WebServer] [boot] projects root '/tmp/kb-canary-e2e/projects' does not exist — no projects will be discovered. Set PROJECTS_ROOT (and optionally PROJECTS_ROOTS) to your projects directory and restart.
[WebServer] file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601
[WebServer] 			const error = /* @__PURE__ */ new Error("Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.");
[WebServer] 			                              ^
[WebServer] 
[WebServer] Error: Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
[WebServer]     at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:601:34
[WebServer]     at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
[WebServer]     ... 2 lines matching cause stack trace ...
[WebServer]     at async node:internal/modules/esm/loader:647:26 {
[WebServer]   cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'
[WebServer]   Require stack:
[WebServer]   - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
[WebServer]       at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
[WebServer]       ... 6 lines matching cause stack trace ...
[WebServer]       at async node:internal/modules/esm/loader:647:26 {
[WebServer]     cause: Error: Cannot find module './rolldown-binding.wasi.cjs'
[WebServer]     Require stack:
[WebServer]     - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
[WebServer]         at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
[WebServer]         ... 6 lines matching cause stack trace ...
[WebServer]         at async node:internal/modules/esm/loader:647:26 {
[WebServer]       cause: Error: Cannot find module '@rolldown/binding-linux-x64-musl'
[WebServer]       Require stack:
[WebServer]       - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
[WebServer]           at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
[WebServer]           ... 6 lines matching cause stack trace ...
[WebServer]           at async node:internal/modules/esm/loader:647:26 {
[WebServer]         cause: Error: Cannot find module './rolldown-binding.linux-x64-musl.node'
[WebServer]         Require stack:
[WebServer]         - /home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs
[WebServer]             at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:495:18
[WebServer]             at Array.reduce (<anonymous>)
[WebServer]             at createLoadErrorChain (file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:488:17)
[WebServer]             at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:602:18
[WebServer]             at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/binding-BMtuZhvP.mjs:9:49
[WebServer]             at file:///home/server/projects/kainbain/frontend/node_modules/rolldown/dist/shared/parse-B7LUicIJ.mjs:3:46
[WebServer]             at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
[WebServer]             at async node:internal/modules/esm/loader:647:26 {
[WebServer]           cause: null
[WebServer]         }
[WebServer]       }
[WebServer]     }
[WebServer]   }
[WebServer] }
[WebServer] 
[WebServer] Node.js v24.22.1
Error: Process from config.webServer was not able to start. Exit code: 1

----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: npm notice
npm notice New major version of npm available! 11.19.1 -> 12.2.1
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.1
npm notice To update run: npm install -g npm@12.2.1
npm notice

- Triggered fallback routing.