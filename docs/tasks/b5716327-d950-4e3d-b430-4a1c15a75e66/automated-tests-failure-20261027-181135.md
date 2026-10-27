<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can you please modify the now playing bar in the ui so it can show little boxes for runners I want for under 5 runners to replace the left side with little boxes that just have the runners name, task name and stage and maybe some sort of colour indicator of health
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 21.68s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 4 packages in 920ms

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Running Security Script Tests... SKIP (no bash on PATH (the security-scan harness is bash-only))
Running Dependency Check... SKIP (no depcheck binary in the root tree (run `npm install` to enable the unused-dependency check))
Running Container Tests... SKIP (no Docker daemon reachable (container build/boot tests need one))
✅ Settings duplicate check passed (23 files in 124ms)
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
Running Unit Tests (frontend)... [0;31mFAIL[0m (1s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):

> kainbain@1.0.0 test:frontend
> npm run test --prefix frontend


> frontend@1.0.0 test
> npm run check:duplicate-identifiers && vitest run


> frontend@1.0.0 check:duplicate-identifiers
> node ../scripts/check-duplicate-settings.mjs

✅ Settings duplicate check passed (23 files in 194ms)

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
Running Linting (api)... [0;32mPASS[0m (3s)
Running Linting (frontend)... [0;32mPASS[0m (4s)
Running Frontend Build... [0;31mFAIL[0m (4s)
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
Running Dependency Audit Gate... [0;32mPASS[0m (5s)
Running Harness Self-Tests... [0;31mFAIL[0m (18s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
▶ usesOperatorStack
  ✔ is false when neither operator URL is set (scratch stack is ours) (26.213457ms)
  ✔ is true when either operator URL is set (0.236161ms)
✔ usesOperatorStack (34.733148ms)
▶ isScratchOccupant
  ✔ accepts a scratch API by cwd or command shape (3.033413ms)
  ✔ accepts a scratch vite by its dedicated port flag (0.333697ms)
  ✔ rejects an unrelated occupant on the API port (4.351158ms)
  ✔ rejects an unrelated occupant on the vite port (5.258808ms)
  ✔ rejects a real dev vite on the live dev port (0.276806ms)
  ✔ rejects an arbitrary occupant on an unknown port (0.210071ms)
  ✔ is not fooled by the empty/legacy probe shape (0.276422ms)
✔ isScratchOccupant (14.422952ms)
▶ probeProcess
  ✔ reads cmdline and cwd from /proc on linux (3.931875ms)
  ✔ still classifies when the cwd link is unreadable (0.385643ms)
  ✔ returns null when the process is gone (0.261348ms)
  ✔ falls back to ps on non-linux platforms (0.342459ms)
  ✔ returns null on non-linux when the process is gone (4.940183ms)
✔ probeProcess (13.2853ms)
▶ freeScratchPorts
  ✔ is a no-op when the operator drives their own stack (3.037305ms)
  ✔ frees both scratch ports when their occupants verify (2.458863ms)
  ✔ reports success without touching an already-free port (0.238116ms)
  ✔ fails closed when an occupant does not verify as scratch (0.438898ms)
  ✔ treats an uninspectable occupant as unverified (0.194582ms)
✔ freeScratchPorts (6.654664ms)
▶ scanSourceForDuplicateIdentifiers
  ✔ reports no violations for a clean module (26.450761ms)
  ✔ detects the task-efa802a6 splitReasoning duplicate import (1.13998ms)
  ✔ detects duplicate variable declarations (0.795639ms)
  ✔ detects var redeclarations that the parser permits (0.613245ms)
  ✔ detects an import colliding with a variable declaration (0.573421ms)
  ✔ detects duplicate function declarations (0.408158ms)
  ✔ detects duplicate class declarations (1.001802ms)
  ✔ detects duplicate destructured variable declarations (1.77932ms)
  ✔ detects duplicate default imports (1.279494ms)
  ✔ detects duplicate namespace imports (0.677778ms)
  ✔ detects an exported variable colliding with an import (1.735327ms)
  ✔ detects a named default export colliding with a variable (0.99006ms)
  ✔ ignores identifiers shadowed in nested scopes (1.587739ms)
  ✔ ignores block-scoped redeclarations (0.937152ms)
  ✔ ignores duplicate words inside comments and strings (0.927143ms)
  ✔ ignores re-exports with different names (export { x } from 'y') (0.468563ms)
  ✔ reports re-exports with the same name as a parse error (0.67113ms)
  ✔ ignores export-star (export * from 'y') (0.60975ms)
  ✔ ignores side-effect imports (import 'y') (0.780372ms)
  ✔ ignores anonymous default exports (1.378332ms)
  ✔ reports parse errors as violations (0.68295ms)
  ✔ reports const redeclarations caught by the parser itself (0.320608ms)
  ✔ handles empty source code (0.363195ms)
  ✔ handles source with only comments (0.601391ms)
  ✔ reports multiple duplicates in one file (0.796261ms)
  ✔ includes a remediation message on each violation (0.760185ms)
✔ scanSourceForDuplicateIdentifiers (52.743359ms)
▶ findSourceFilesInDirectory
  ✔ returns only source files, excluding tests and non-JS files (2.36335ms)
  ✔ skips node_modules, dist, and other build directories (0.875398ms)
  ✔ returns an empty array for a nonexistent directory (0.389119ms)
  ✔ throws when directoryPath is missing (0.792691ms)
✔ findSourceFilesInDirectory (4.75684ms)
▶ checkDirectoryForDuplicates
  ✔ cleanly scans the real settings directory (691.580294ms)
  ✔ reports injected duplicates (5.384879ms)
  ✔ fails safe when the target directory has no source files (1.265717ms)
  ✔ fails safe when the target directory does not exist (0.515402ms)
  ✔ scans a custom target directory (2.401122ms)
  ✔ reports syntax errors in scanned files (4.841701ms)
✔ checkDirectoryForDuplicates (706.83581ms)
▶ formatViolationsReport
  ✔ renders a helpful message when there are no violations (0.377902ms)
  ✔ renders a populated report with location and identifier (0.245602ms)
  ✔ renders violations without an identifier name (0.151186ms)
  ✔ renders violations without a message (0.162001ms)
  ✔ handles a missing violationsList gracefully (0.103813ms)
✔ formatViolationsReport (1.245036ms)
▶ hasExampleTag
  ✔ detects @example in a JSDoc block (6.080631ms)
✔ hasExampleTag (10.095791ms)
▶ nearestJsdoc
  ✔ finds an attached block and rejects detached ones (1.886479ms)
✔ nearestJsdoc (4.516615ms)
▶ findPublicExports
  ✔ finds functions, classes, bindings, and defaults with example status (12.032026ms)
  ✔ splits multi-declarator consts under one JSDoc block (0.943997ms)
  ✔ skips re-export lists and export-star (3.19825ms)
  ✔ ignores the word export inside comments and strings (0.258085ms)
  ✔ masks template raw text so apostrophes cannot swallow later exports (8.302997ms)
✔ findPublicExports (25.316225ms)
▶ isDocSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.489149ms)
  ✔ excludes tests, fixtures, mocks, and scripts (7.848053ms)
✔ isDocSourceFile (8.582707ms)
▶ checkMissing
  ✔ passes baselined exports and fails new ones (3.433888ms)
  ✔ fails everything in strict mode (0.16777ms)
  ✔ reports baseline entries that now carry @example (0.130276ms)
✔ checkMissing (3.976701ms)
▶ formatExampleFailure
  ✔ names the export and gives a fix recipe (0.503479ms)
✔ formatExampleFailure (1.857895ms)
▶ committed-tree grandfather proof
  ✔ the baseline covers every currently-missing export (1868.675987ms)
✔ committed-tree grandfather proof (1868.77879ms)
▶ topLevelFunctions
  ✔ counts one top-level declaration (7.150388ms)
  ✔ counts multiple top-level declarations including async and default (4.302463ms)
  ✔ ignores nested declarations and callbacks (0.264981ms)
  ✔ ignores arrow-function constants (2.534288ms)
  ✔ ignores the word function inside comments, strings, and JSDoc examples (0.467425ms)
  ✔ masks template raw text so apostrophes cannot swallow later code (0.899928ms)
  ✔ still sees functions declared inside ${} interpolations at depth (0.372081ms)
✔ topLevelFunctions (18.356318ms)
▶ isSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (1.442752ms)
  ✔ excludes tests, specs, configs, and out-of-scope roots (4.44226ms)
✔ isSourceFile (6.782837ms)
▶ checkFiles
  ✔ passes single-function and zero-function files (5.157884ms)
  ✔ fails unlisted multi-function files (0.239494ms)
  ✔ grandfathers allowlisted paths that already existed (1.605762ms)
  ✔ still fails an allowlisted path that is newly added (0.187598ms)
  ✔ reports stale allowlist entries for pruning (1.148466ms)
✔ checkFiles (8.669645ms)
▶ formatFailure
  ✔ names the file, the functions, and the remediation (0.92815ms)
✔ formatFailure (2.355057ms)
▶ git integration
  ✔ resolves a diff base or degrades to null outside git (29.691313ms)
  ✔ lists newly-added paths as an array (56.843708ms)
✔ git integration (86.715522ms)
▶ deploy.sh test gates (static contract)
  ✔ runs the fast branches as the final-test-suite gate without canary (15.816884ms)
  ✔ runs the canary suite exactly once as its own blocking canary-e2e gate (0.73037ms)
  ✔ orders the canary-e2e gate after the final-test-suite gate (0.789358ms)
  ✔ skips the canary gate only on exactly KAINBAIN_SKIP_CANARY=1 (fail-safe) (13.540603ms)
✔ deploy.sh test gates (static contract) (75.810125ms)
▶ deploy / npm test parity (executable contract)
  ✔ final-test-suite branches + canary-e2e gate equal the default npm test branches (14.673127ms)
  ✔ fast branches execute the identical command with and without canary (15.647119ms)
  ✔ the canary-e2e gate command matches the gate's Canary Tests branch (1.513407ms)
  ✔ root test:canary delegates to the canary-e2e package suite (0.404017ms)
✔ deploy / npm test parity (executable contract) (32.725948ms)
▶ deploy.sh re-exec line (static contract)
  ✔ waits for the transient unit so its exit code propagates (--wait) (2.45726ms)
  ✔ injects a node-aware PATH into the transient unit (--setenv) (0.829439ms)
✔ deploy.sh re-exec line (static contract) (7.390921ms)
▶ deploy.sh re-exec behaviour (fake systemd-run)
  ✖ passes --wait and a node-aware PATH to systemd-run (5.609068ms)
  ✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (2.737905ms)
  ✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (8.675923ms)
  ✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (12.58563ms)
  ✖ omits the attempt-id setenv on manual runs without an attempt id (11.231449ms)
✖ deploy.sh re-exec behaviour (fake systemd-run) (41.598997ms)
▶ deploy.sh fail-safe contracts (static)
  ✔ skips the canary E2E gate on exactly KAINBAIN_SKIP_CANARY=1 (parity with npm test) (1.035862ms)
  ✔ labels the release snapshot with the pre-increment build (no mislabel) (6.988063ms)
  ✔ guards the STAGE EXIT trap when the stage dir was never created (5.689449ms)
  ✔ fails fast on missing jq/curl before consuming a build number (4.074287ms)
  ✔ creates the deploy dir before taking the rollback lock (1.774243ms)
  ✔ never re-enters auto-rollback through the ERR trap (1.828187ms)
  ✔ never rolls back a healthy deploy over an nginx reload failure (1.341516ms)
  ✔ always leaves a durable result from rollback-mode failures (1.575714ms)
  ✔ never passes --pipe to systemd-run (dead-reader regression, 2026-10-12) (2.354188ms)
  ✔ needs no stdio detach before restart_service (no pipe, no EPIPE) (2.928454ms)
✔ deploy.sh fail-safe contracts (static) (30.389834ms)
▶ deploy.sh re-exec argv (fake systemd-run, no --pipe)
  ✖ omits --pipe from the real re-exec argv while keeping --wait (4.097565ms)
✖ deploy.sh re-exec argv (fake systemd-run, no --pipe) (4.241809ms)
▶ deploy.sh engine heartbeat pump (foreground liveness)
  ✖ emits engine-visible heartbeats while the detached unit runs (11.478305ms)
✖ deploy.sh engine heartbeat pump (foreground liveness) (11.618206ms)
▶ findDeprecationWarnings
  ✔ flags the three build-log warning shapes from the task screenshot (8.659381ms)
  ✔ passes clean build output (including the chunk-size hint) (1.228938ms)
  ✔ an allowlist entry suppresses its matching line only (1.824098ms)
  ✔ an expired allowlist entry does not suppress (2.229758ms)
  ✔ an entry without an expiry date does not suppress (0.606605ms)
  ✔ an entry with an invalid regex pattern fails closed instead of crashing (0.253555ms)
  ✔ an invalid pattern does not break its valid siblings (10.658009ms)
✔ findDeprecationWarnings (37.996338ms)
▶ compileAllowlistPattern
  ✔ compiles a valid pattern (0.392973ms)
  ✔ returns null for a pattern that does not compile (0.431517ms)
✔ compileAllowlistPattern (14.390703ms)
▶ loadBuildAllowlist
  ✔ loads the shipped allowlist file without crashing (0.373842ms)
✔ loadBuildAllowlist (0.496083ms)
▶ check-no-deprecations binary
  ✔ exits 0 and passes output through when the build is clean (241.214881ms)
  ✔ exits non-zero when the build prints a deprecation warning (224.766753ms)
  ✔ exits non-zero when the build command itself fails (109.114139ms)
✔ check-no-deprecations binary (575.341267ms)
▶ evaluateAudit
  ✔ reports non-allowlisted high findings as blocking (0.512944ms)
  ✔ ignores moderate and low findings (0.13791ms)
  ✔ an allowlist entry with a valid expiry suppresses its advisory (2.172325ms)
  ✔ an expired allowlist entry does not suppress (0.21429ms)
  ✔ an entry for a different advisory source does not suppress (0.153522ms)
  ✔ tolerates audit output with no vulnerabilities key (0.139401ms)
  ✔ suppresses transitive dependents when the root advisory is allowlisted (0.610416ms)
  ✔ a transitive chain with no reachable advisory stays blocking (0.209212ms)
✔ evaluateAudit (5.666697ms)
▶ resolveDevPlan
  ✔ defaults to API :3100 and frontend :5173 (1.38283ms)
  ✔ honors PORT and VITE_PORT (2.252535ms)
  ✔ supervises the API node process and the Vite npm script (0.58264ms)
  ✔ rejects a garbage port naming the variable (0.836583ms)
✔ resolveDevPlan (10.104707ms)
▶ dev --dry-run
  ✔ prints the plan and exits without touching ports (99.837058ms)
✔ dev --dry-run (108.500437ms)
▶ entry points stay free of Linux-only tooling
  ✔ scripts/run-tests.mjs references no Linux-only tooling (5.992747ms)
  ✔ scripts/depcheck.mjs references no Linux-only tooling (0.254926ms)
  ✔ scripts/dev.mjs references no Linux-only tooling (1.979795ms)
  ✔ scripts/setup.mjs references no Linux-only tooling (0.839067ms)
  ✔ scripts/free-port.mjs references no Linux-only tooling (0.329084ms)
  ✔ scripts/lib/run-parallel.mjs references no Linux-only tooling (1.933094ms)
  ✔ scripts/lib/run-supervised.mjs references no Linux-only tooling (0.307129ms)
  ✔ package.json references no Linux-only tooling (0.647134ms)
✔ entry points stay free of Linux-only tooling (22.581622ms)
▶ root scripts point at the Node runners
  ✔ test runs the Node gate (0.451086ms)
  ✔ dev runs the Node supervisor (0.274251ms)
  ✔ setup runs the Node installer (0.13396ms)
  ✔ depcheck runs the Node fan-out (0.815638ms)
✔ root scripts point at the Node runners (14.410272ms)
▶ workspace test scripts carry no shell env prefix
  ✔ api test runs under Windows cmd (no VAR= prefix) (0.606421ms)
  ✔ frontend test runs under Windows cmd (no VAR= prefix) (2.24526ms)
✔ workspace test scripts carry no shell env prefix (3.020057ms)
▶ run-tests.sh stays a thin shim
  ✔ delegates to the Node gate without its own runner (1.987773ms)
✔ run-tests.sh stays a thin shim (2.097086ms)
▶ installs resolve the way the lockfiles were built
  ✔ root .npmrc pins legacy peer resolution (frontend needs it) (0.250735ms)
✔ installs resolve the way the lockfiles were built (0.366046ms)
▶ isPortOccupied
  ✔ reports false for a free ephemeral port (14.376602ms)
  ✔ reports true for a bound port (2.74668ms)
  ✔ reports false again after the holder closes (3.264183ms)
  ✔ rejects an out-of-range port number (3.606971ms)
✔ isPortOccupied (26.315653ms)
▶ findOccupantPids
  ✔ parses lsof -ti output on linux (1.524507ms)
  ✔ parses lsof -ti output on darwin (1.117307ms)
  ✔ returns an empty list when lsof finds no occupant (exit 1) (0.418598ms)
  ✔ falls back to ss when lsof is missing on linux (0.836893ms)
  ✔ ss fallback only returns pids listening on the requested port (0.432685ms)
  ✔ reports a clear error when neither lsof nor ss exists (0.711164ms)
  ✔ parses netstat -ano output on win32 (0.351867ms)
  ✔ returns an empty list when netstat shows no listener (0.279215ms)
✔ findOccupantPids (6.580871ms)
▶ freePort
  ✔ is a no-op reporting alreadyFree when the port is free (0.499157ms)
  ✔ terminates the occupant and reports freed when the port releases (0.351636ms)
  ✔ escalates to SIGKILL when the occupant ignores SIGTERM (51.404805ms)
  ✔ never kills its own process (0.463408ms)
  ✔ fails with an actionable error when the port never releases (24.710102ms)
  ✔ fails with an actionable error when no occupant pid is found (0.272645ms)
  ✔ terminates a verified occupant when verifyFn approves it (0.373563ms)
  ✔ refuses to kill any occupant when verifyFn rejects it (0.348668ms)
  ✔ treats a throwing verifyFn as unverified instead of killing (0.325834ms)
✔ freePort (79.186872ms)
[remediate] --tasks-dir requires a value
Usage: node scripts/remediate-no-verdict-rejections.mjs [--apply] [--tasks-dir <dir>] [--log <file>] [--no-backup]
[remediate] tasks dir not found: /tmp/kainbain-remediate-absent
[remediate] dry-run: 1 task(s) would be repaired (re-run with --apply)
  - task-1: removed 1 spurious failure(s), repaired 1 report(s), removed stale verdictImplicitPassStages
▶ parseArgs
  ✔ defaults to a dry run that writes nothing (2.723736ms)
  ✔ honours --apply, --no-backup, --tasks-dir, and --log (0.427122ms)
  ✔ lets the last of --apply/--dry-run win (0.202872ms)
  ✔ records an error instead of throwing when a value is missing (0.195883ms)
  ✔ ignores unknown flags (a typo degrades to a dry run, never a write) (0.18735ms)
✔ parseArgs (6.205686ms)
▶ backupPathFor
  ✔ appends .bak (0.410717ms)
✔ backupPathFor (0.604224ms)
▶ remediateTasks
  ✔ reports victims without writing in dry-run mode (2.903739ms)
  ✔ repairs task and report files with backups, then idles on re-run (9.328331ms)
  ✔ leaves a task with only genuine failures byte-identical (1.101673ms)
  ✔ returns an error for a missing tasks dir instead of throwing (1.851504ms)
✔ remediateTasks (15.829548ms)
▶ main
  ✔ exits 2 with usage on argument errors before touching files (3.096686ms)
  ✔ exits 1 on a missing tasks dir (0.41877ms)
  ✔ dry-runs a temp tasks dir and exits 0 (1.032756ms)
✔ main (4.742773ms)
▶ parseArgs
  ✔ defaults to the api suite, 5 runs, no pattern (1.526219ms)
  ✔ parses every flag (0.27605ms)
  ✔ rejects an unknown suite, unknown flag, and non-positive runs (1.013871ms)
  ✔ rejects a flag with no value (0.311454ms)
✔ parseArgs (5.222428ms)
▶ normalizePattern
  ✔ strips the suite directory prefix so the runner resolves the filter in its own workspace (0.771666ms)
  ✔ passes through a bare substring filter unchanged (0.19819ms)
  ✔ rejects an unknown suite (0.447991ms)
✔ normalizePattern (1.849544ms)
▶ buildRepeatCommand
  ✔ targets the suite workspace through npm with no shell (2.807344ms)
  ✔ passes the pattern as a workspace-relative positional filter after -- (3.64075ms)
  ✔ maps canary to its own workspace (0.501593ms)
  ✔ rejects an unknown suite (0.266777ms)
✔ buildRepeatCommand (7.64931ms)
▶ extractFailureSignatures
  ✔ strips ANSI colour and keeps vitest FAIL headlines once each (0.954323ms)
  ✔ falls back to Error lines when the run died before reporting tests (0.239461ms)
  ✔ caps the number of signatures (0.311992ms)
  ✔ returns an empty list for a clean run (0.14616ms)
✔ extractFailureSignatures (1.890698ms)
▶ summarizeRuns
  ✔ counts passes, failing run numbers, and distinct signatures (1.763499ms)
  ✔ reports a zero pass rate for an empty record set without dividing by zero (0.136628ms)
✔ summarizeRuns (2.040087ms)
▶ runRepeat
  ✔ runs the suite N times, logs JSONL + raw output, and reports a green pass rate (4.013567ms)
  ✔ records failures with their signatures and returns ok:false (4.356862ms)
✔ runRepeat (8.523593ms)
▶ runParallel
  ✔ all branches pass -> ok:true with a PASS line per branch (105.976151ms)
  ✔ one branch fails -> ok:false, FAIL names the branch, the other still passes, output shown (1087.303443ms)
  ✔ all branches fail -> ok:false (58.108738ms)
  ✔ seven branches work (mirrors the gate overlap window) (78.81061ms)
  ✔ reports lines in argument order even when a later branch finishes first (849.973557ms)
  ✔ a missing command fails its branch instead of crashing the run (68.271457ms)
  ✔ passing branch output stays hidden (45.95269ms)
  ✔ lowPriority branches still run (niceness is best-effort) (38.715416ms)
✔ runParallel (2336.745183ms)
▶ runParallel progress output (no silent blackout)
  ✔ announces every branch at spawn, in argument order, before any result line (38.482826ms)
  ✔ emits a still-running tick naming outstanding branches while a slow branch runs (402.713655ms)
  ✔ emits no tick when every branch settles inside the interval (66.944596ms)
  ✔ progressIntervalMs 0 disables the tick entirely (339.219069ms)
  ✔ an injected failing branch still prints its full details unchanged (48.539042ms)
  ✔ resolveProgressIntervalMs: option wins, then env, then the 30s default (0.302202ms)
  ✔ formatElapsedSeconds renders compact human durations (0.21687ms)
✔ runParallel progress output (no silent blackout) (897.237332ms)
▶ hung-branch guard (a timed-out branch fails the gate, it cannot hang it)
  ✔ reports exit 124 and settles even when the branch never emits close (91.746138ms)
  ✔ keeps the branch's captured output when it is reaped (71.466442ms)
  ✖ reaps the whole branch process tree, not just the direct child (11059.362508ms)
✖ hung-branch guard (a timed-out branch fails the gate, it cannot hang it) (11225.183385ms)
▶ vitest workers: defaults govern (no cap)
  ✔ scripts/run-tests.mjs sets no worker cap (0.296021ms)
  ✔ api vitest config uses vitest defaults (0.139146ms)
  ✔ frontend vitest config uses vitest defaults (0.11604ms)
✔ vitest workers: defaults govern (no cap) (0.685248ms)
▶ api worker pool: thread workers, per-file isolation kept
  ✔ runs the api suite on the threads pool (no fork per file) (0.246651ms)
  ✔ never disables per-file isolation (0.184067ms)
  ✔ keeps the per-file isolation setup file installed (0.129512ms)
✔ api worker pool: thread workers, per-file isolation kept (0.707635ms)
▶ vitest node-env contract: node builtins stay out of shared happy-dom workers
  ✔ no frontend suite imports the api tree (no pin escape hatch) (17.916313ms)
  ✔ every node:-importing suite runs in node env or the forks pool (15.998337ms)
  ✔ every forks-pinned suite is excluded from the main project (no double run) (0.35397ms)
✔ vitest node-env contract: node builtins stay out of shared happy-dom workers (34.438443ms)
▶ runSupervised
  ✔ streams each child's output with its prefix (190.690484ms)
  ✔ resolves with the first child's exit code and stops the sibling (119.728211ms)
  ✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5201.121898ms)
  ✔ a missing command fails the run instead of hanging (55.362677ms)
  ✔ SIGTERM to the supervisor stops every child and resolves ok (162.142964ms)
✖ runSupervised (5737.14284ms)
▶ buildBranches
  ✔ builds the eleven canonical branches in order when bash and docker exist (4.702007ms)
  ✔ every branch spawns a binary with argv (never a shell string) (0.396623ms)
  ✔ unit tests run at normal priority, the rest low (0.484368ms)
  ✔ reports SKIP (non-fatal) for Security Script Tests without bash (0.885436ms)
  ✔ reports SKIP (non-fatal) for Container Tests without a docker daemon (0.527806ms)
  ✔ reports SKIP (non-fatal) for Dependency Check without the depcheck binary (0.540784ms)
  ✔ keeps Dependency Check runnable (low priority, via npm) when the binary exists (0.236497ms)
  ✔ container tests run the docker suite through node --test (1.312283ms)
  ✔ harness self-tests run the ported node suites (not the old shell one) (0.894685ms)
  ✔ includes Canary Tests by default (npm test parity with deploy.sh --prod) (0.380727ms)
  ✔ omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1) (0.328933ms)
  ✔ spawns Canary Tests last as npm run test:canary (1.284382ms)
✔ buildBranches (14.532054ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (1.044795ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.281354ms)
✔ splitGatePhases (1.497784ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.471412ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.119846ms)
  ✔ opts out via --no-canary (0.109672ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.10025ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.231002ms)
  ✔ skip flags win over the legacy opt-in flags (0.294773ms)
✔ resolveCanary (1.760439ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (0.902693ms)
  ✔ reports true when the root tree carries the Windows binary (0.668259ms)
  ✔ reports false when the platform's binary name is missing (0.521843ms)
  ✔ reports false when the root tree has no binaries at all (0.305258ms)
✔ depcheckAvailable (2.610244ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (1.510935ms)
  ✔ returns zero and does not throw when directory does not exist (0.239464ms)
✔ pruneStaleTestDirectories (2.026532ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (2.235351ms)
✔ installSteps (4.109377ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (0.970929ms)
  ✔ root .npmrc documents the per-dir mirrors (0.277642ms)
✔ installSteps npmrc (1.531278ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.351522ms)
  ✔ installs the browser alone on macOS and Windows (0.305002ms)
✔ playwrightAttempts (0.950837ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.428011ms)
✔ npxExecutable (0.737211ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (0.623519ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.874203ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.352306ms)
✔ browserInstallTargets (3.206154ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-JaOjkn/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Nifmkn/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-ofcFCo/Sanity/docs' -> '/tmp/kainbain-sanity-notes-AbmHCo/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-ofcFCo/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-AbmHCo/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-ofcFCo/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-AbmHCo/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HHkKHo/Sanity/docs' -> '/tmp/kainbain-sanity-notes-cDbNHo/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HDheJo/Sanity/docs' -> '/tmp/kainbain-sanity-notes-DAigJo/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-HDheJo/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-DAigJo/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-HDheJo/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-DAigJo/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-aFbHEE/Sanity/docs' -> '/tmp/kainbain-sanity-notes-jbgKEE/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-GcOFOE/Sanity/docs' -> '/tmp/kainbain-sanity-notes-KndHOE/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-GcOFOE/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KndHOE/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-GcOFOE/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KndHOE/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (12.771138ms)
  ✔ leaves no fixture residue in the OS temp dir (5.688502ms)
✔ checkStorageSanity (20.090919ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.792926ms)
  ✔ rejects a missing entry path or a different file (1.401686ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (222.346627ms)
✔ isMainModule (224.928584ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.589961ms)
  ✔ returns 0 when the notes space has no tasks dir (0.8214ms)
✔ countNotesTasks (3.040386ms)
ℹ tests 287
ℹ suites 72
ℹ pass 278
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17311.996753

✖ failing tests:

test at tests/deploy-reexec.test.mjs:101:2
✖ passes --wait and a node-aware PATH to systemd-run (5.609068ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-BFjiBE/argv.log'
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
    path: '/tmp/kb-deploy-reexec-BFjiBE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:113:2
✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (2.737905ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-eClEHE/argv.log'
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
    path: '/tmp/kb-deploy-reexec-eClEHE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:119:2
✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (8.675923ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-djKmJE/argv.log'
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
    path: '/tmp/kb-deploy-reexec-djKmJE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:127:2
✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (12.58563ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-OPCJcE/argv.log'
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
    path: '/tmp/kb-deploy-reexec-OPCJcE/argv.log'
  }

test at tests/deploy-reexec.test.mjs:140:2
✖ omits the attempt-id setenv on manual runs without an attempt id (11.231449ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-nnGPBF/argv.log'
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
    path: '/tmp/kb-deploy-reexec-nnGPBF/argv.log'
  }

test at tests/deploy-reexec.test.mjs:280:2
✖ omits --pipe from the real re-exec argv while keeping --wait (4.097565ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-nopipe-hhpbGG/argv.log'
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
    path: '/tmp/kb-deploy-nopipe-hhpbGG/argv.log'
  }

test at tests/deploy-reexec.test.mjs:324:2
✖ emits engine-visible heartbeats while the detached unit runs (11.478305ms)
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
✖ reaps the whole branch process tree, not just the direct child (11059.362508ms)
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
✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5201.121898ms)
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
Running Canary Tests... [0;31mFAIL[0m (3s)
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
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.