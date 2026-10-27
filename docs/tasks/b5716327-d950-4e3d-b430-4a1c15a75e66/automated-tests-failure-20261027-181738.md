<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can you please modify the now playing bar in the ui so it can show little boxes for runners I want for under 5 runners to replace the left side with little boxes that just have the runners name, task name and stage and maybe some sort of colour indicator of health
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 22.373s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 4 packages in 782ms

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Running Security Script Tests... SKIP (no bash on PATH (the security-scan harness is bash-only))
Running Dependency Check... SKIP (no depcheck binary in the root tree (run `npm install` to enable the unused-dependency check))
Running Container Tests... SKIP (no Docker daemon reachable (container build/boot tests need one))
✅ Settings duplicate check passed (23 files in 121ms)
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

✅ Settings duplicate check passed (23 files in 284ms)

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
Running Linting (frontend)... [0;32mPASS[0m (3s)
Running Frontend Build... [0;31mFAIL[0m (3s)
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
Running Harness Self-Tests... [0;31mFAIL[0m (17s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
▶ usesOperatorStack
  ✔ is false when neither operator URL is set (scratch stack is ours) (1.308546ms)
  ✔ is true when either operator URL is set (0.249124ms)
✔ usesOperatorStack (9.380391ms)
▶ isScratchOccupant
  ✔ accepts a scratch API by cwd or command shape (3.15064ms)
  ✔ accepts a scratch vite by its dedicated port flag (0.316536ms)
  ✔ rejects an unrelated occupant on the API port (13.654555ms)
  ✔ rejects an unrelated occupant on the vite port (0.55067ms)
  ✔ rejects a real dev vite on the live dev port (8.819313ms)
  ✔ rejects an arbitrary occupant on an unknown port (0.292142ms)
  ✔ is not fooled by the empty/legacy probe shape (22.709629ms)
✔ isScratchOccupant (50.227604ms)
▶ probeProcess
  ✔ reads cmdline and cwd from /proc on linux (20.519618ms)
  ✔ still classifies when the cwd link is unreadable (0.577493ms)
  ✔ returns null when the process is gone (8.054609ms)
  ✔ falls back to ps on non-linux platforms (0.395862ms)
  ✔ returns null on non-linux when the process is gone (0.254967ms)
✔ probeProcess (42.560491ms)
▶ freeScratchPorts
  ✔ is a no-op when the operator drives their own stack (0.722227ms)
  ✔ frees both scratch ports when their occupants verify (9.312856ms)
  ✔ reports success without touching an already-free port (0.244172ms)
  ✔ fails closed when an occupant does not verify as scratch (0.52009ms)
  ✔ treats an uninspectable occupant as unverified (3.379154ms)
✔ freeScratchPorts (25.321558ms)
▶ scanSourceForDuplicateIdentifiers
  ✔ reports no violations for a clean module (28.292356ms)
  ✔ detects the task-efa802a6 splitReasoning duplicate import (1.319618ms)
  ✔ detects duplicate variable declarations (0.734183ms)
  ✔ detects var redeclarations that the parser permits (0.617232ms)
  ✔ detects an import colliding with a variable declaration (1.812894ms)
  ✔ detects duplicate function declarations (0.622187ms)
  ✔ detects duplicate class declarations (1.23084ms)
  ✔ detects duplicate destructured variable declarations (2.09085ms)
  ✔ detects duplicate default imports (1.485683ms)
  ✔ detects duplicate namespace imports (1.317126ms)
  ✔ detects an exported variable colliding with an import (1.195691ms)
  ✔ detects a named default export colliding with a variable (1.199244ms)
  ✔ ignores identifiers shadowed in nested scopes (1.533487ms)
  ✔ ignores block-scoped redeclarations (0.806334ms)
  ✔ ignores duplicate words inside comments and strings (0.9773ms)
  ✔ ignores re-exports with different names (export { x } from 'y') (0.546832ms)
  ✔ reports re-exports with the same name as a parse error (0.440648ms)
  ✔ ignores export-star (export * from 'y') (1.292024ms)
  ✔ ignores side-effect imports (import 'y') (0.871326ms)
  ✔ ignores anonymous default exports (1.5361ms)
  ✔ reports parse errors as violations (0.684655ms)
  ✔ reports const redeclarations caught by the parser itself (0.465693ms)
  ✔ handles empty source code (3.065893ms)
  ✔ handles source with only comments (0.515026ms)
  ✔ reports multiple duplicates in one file (0.60379ms)
  ✔ includes a remediation message on each violation (0.905752ms)
✔ scanSourceForDuplicateIdentifiers (62.385011ms)
▶ findSourceFilesInDirectory
  ✔ returns only source files, excluding tests and non-JS files (4.821691ms)
  ✔ skips node_modules, dist, and other build directories (4.77042ms)
  ✔ returns an empty array for a nonexistent directory (0.210718ms)
  ✔ throws when directoryPath is missing (0.788687ms)
✔ findSourceFilesInDirectory (10.875326ms)
▶ checkDirectoryForDuplicates
  ✔ cleanly scans the real settings directory (392.346033ms)
  ✔ reports injected duplicates (1.6825ms)
  ✔ fails safe when the target directory has no source files (1.960197ms)
  ✔ fails safe when the target directory does not exist (0.413675ms)
  ✔ scans a custom target directory (3.798125ms)
  ✔ reports syntax errors in scanned files (3.751226ms)
✔ checkDirectoryForDuplicates (404.569833ms)
▶ formatViolationsReport
  ✔ renders a helpful message when there are no violations (0.255942ms)
  ✔ renders a populated report with location and identifier (0.122748ms)
  ✔ renders violations without an identifier name (0.11185ms)
  ✔ renders violations without a message (0.107235ms)
  ✔ handles a missing violationsList gracefully (0.079309ms)
✔ formatViolationsReport (0.887482ms)
▶ hasExampleTag
  ✔ detects @example in a JSDoc block (3.177713ms)
✔ hasExampleTag (12.133226ms)
▶ nearestJsdoc
  ✔ finds an attached block and rejects detached ones (0.575279ms)
✔ nearestJsdoc (0.767851ms)
▶ findPublicExports
  ✔ finds functions, classes, bindings, and defaults with example status (10.907082ms)
  ✔ splits multi-declarator consts under one JSDoc block (0.883708ms)
  ✔ skips re-export lists and export-star (1.442318ms)
  ✔ ignores the word export inside comments and strings (1.537749ms)
  ✔ masks template raw text so apostrophes cannot swallow later exports (4.16204ms)
✔ findPublicExports (19.5062ms)
▶ isDocSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (1.721312ms)
  ✔ excludes tests, fixtures, mocks, and scripts (1.912091ms)
✔ isDocSourceFile (7.029775ms)
▶ checkMissing
  ✔ passes baselined exports and fails new ones (3.828873ms)
  ✔ fails everything in strict mode (0.192091ms)
  ✔ reports baseline entries that now carry @example (0.166474ms)
✔ checkMissing (6.024079ms)
▶ formatExampleFailure
  ✔ names the export and gives a fix recipe (0.531358ms)
✔ formatExampleFailure (2.00666ms)
▶ committed-tree grandfather proof
  ✔ the baseline covers every currently-missing export (1619.532235ms)
✔ committed-tree grandfather proof (1619.644482ms)
▶ topLevelFunctions
  ✔ counts one top-level declaration (6.301268ms)
  ✔ counts multiple top-level declarations including async and default (0.264441ms)
  ✔ ignores nested declarations and callbacks (0.224152ms)
  ✔ ignores arrow-function constants (0.191053ms)
  ✔ ignores the word function inside comments, strings, and JSDoc examples (0.367713ms)
  ✔ masks template raw text so apostrophes cannot swallow later code (0.47927ms)
  ✔ still sees functions declared inside ${} interpolations at depth (0.230869ms)
✔ topLevelFunctions (20.503573ms)
▶ isSourceFile
  ✔ covers api, shared, and frontend/src JS/JSX (0.663832ms)
  ✔ excludes tests, specs, configs, and out-of-scope roots (3.885464ms)
✔ isSourceFile (4.932252ms)
▶ checkFiles
  ✔ passes single-function and zero-function files (8.717467ms)
  ✔ fails unlisted multi-function files (0.318516ms)
  ✔ grandfathers allowlisted paths that already existed (1.015812ms)
  ✔ still fails an allowlisted path that is newly added (0.150824ms)
  ✔ reports stale allowlist entries for pruning (5.498238ms)
✔ checkFiles (16.020338ms)
▶ formatFailure
  ✔ names the file, the functions, and the remediation (0.472016ms)
✔ formatFailure (0.613148ms)
▶ git integration
  ✔ resolves a diff base or degrades to null outside git (19.76902ms)
  ✔ lists newly-added paths as an array (60.912976ms)
✔ git integration (80.924164ms)
▶ deploy.sh test gates (static contract)
  ✔ runs the fast branches as the final-test-suite gate without canary (1.791414ms)
  ✔ runs the canary suite exactly once as its own blocking canary-e2e gate (0.801086ms)
  ✔ orders the canary-e2e gate after the final-test-suite gate (0.807305ms)
  ✔ skips the canary gate only on exactly KAINBAIN_SKIP_CANARY=1 (fail-safe) (0.857113ms)
✔ deploy.sh test gates (static contract) (6.452404ms)
▶ deploy / npm test parity (executable contract)
  ✔ final-test-suite branches + canary-e2e gate equal the default npm test branches (1.861576ms)
  ✔ fast branches execute the identical command with and without canary (2.231228ms)
  ✔ the canary-e2e gate command matches the gate's Canary Tests branch (1.157074ms)
  ✔ root test:canary delegates to the canary-e2e package suite (0.402457ms)
✔ deploy / npm test parity (executable contract) (6.106545ms)
▶ deploy.sh re-exec line (static contract)
  ✔ waits for the transient unit so its exit code propagates (--wait) (2.251659ms)
  ✔ injects a node-aware PATH into the transient unit (--setenv) (0.841891ms)
✔ deploy.sh re-exec line (static contract) (4.882526ms)
▶ deploy.sh re-exec behaviour (fake systemd-run)
  ✖ passes --wait and a node-aware PATH to systemd-run (5.556945ms)
  ✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (3.312642ms)
  ✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (8.62621ms)
  ✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (6.974932ms)
  ✖ omits the attempt-id setenv on manual runs without an attempt id (4.991255ms)
✖ deploy.sh re-exec behaviour (fake systemd-run) (32.180175ms)
▶ deploy.sh fail-safe contracts (static)
  ✔ skips the canary E2E gate on exactly KAINBAIN_SKIP_CANARY=1 (parity with npm test) (1.002549ms)
  ✔ labels the release snapshot with the pre-increment build (no mislabel) (3.388336ms)
  ✔ guards the STAGE EXIT trap when the stage dir was never created (1.371893ms)
  ✔ fails fast on missing jq/curl before consuming a build number (2.709236ms)
  ✔ creates the deploy dir before taking the rollback lock (3.533217ms)
  ✔ never re-enters auto-rollback through the ERR trap (3.764914ms)
  ✔ never rolls back a healthy deploy over an nginx reload failure (0.633152ms)
  ✔ always leaves a durable result from rollback-mode failures (0.728678ms)
  ✔ never passes --pipe to systemd-run (dead-reader regression, 2026-10-12) (1.4543ms)
  ✔ needs no stdio detach before restart_service (no pipe, no EPIPE) (3.67724ms)
✔ deploy.sh fail-safe contracts (static) (23.578332ms)
▶ deploy.sh re-exec argv (fake systemd-run, no --pipe)
  ✖ omits --pipe from the real re-exec argv while keeping --wait (3.011942ms)
✖ deploy.sh re-exec argv (fake systemd-run, no --pipe) (3.142902ms)
▶ deploy.sh engine heartbeat pump (foreground liveness)
  ✖ emits engine-visible heartbeats while the detached unit runs (6.736844ms)
✖ deploy.sh engine heartbeat pump (foreground liveness) (6.894336ms)
▶ findDeprecationWarnings
  ✔ flags the three build-log warning shapes from the task screenshot (8.682332ms)
  ✔ passes clean build output (including the chunk-size hint) (2.017418ms)
  ✔ an allowlist entry suppresses its matching line only (0.459552ms)
  ✔ an expired allowlist entry does not suppress (0.840322ms)
  ✔ an entry without an expiry date does not suppress (0.463215ms)
  ✔ an entry with an invalid regex pattern fails closed instead of crashing (0.27459ms)
  ✔ an invalid pattern does not break its valid siblings (0.327308ms)
✔ findDeprecationWarnings (17.750301ms)
▶ compileAllowlistPattern
  ✔ compiles a valid pattern (0.430016ms)
  ✔ returns null for a pattern that does not compile (4.461117ms)
✔ compileAllowlistPattern (6.681404ms)
▶ loadBuildAllowlist
  ✔ loads the shipped allowlist file without crashing (1.041215ms)
✔ loadBuildAllowlist (1.327176ms)
▶ check-no-deprecations binary
  ✔ exits 0 and passes output through when the build is clean (452.030233ms)
  ✔ exits non-zero when the build prints a deprecation warning (413.500897ms)
  ✔ exits non-zero when the build command itself fails (150.71755ms)
✔ check-no-deprecations binary (1016.592142ms)
▶ evaluateAudit
  ✔ reports non-allowlisted high findings as blocking (0.641191ms)
  ✔ ignores moderate and low findings (0.131323ms)
  ✔ an allowlist entry with a valid expiry suppresses its advisory (0.272909ms)
  ✔ an expired allowlist entry does not suppress (0.132721ms)
  ✔ an entry for a different advisory source does not suppress (0.121435ms)
  ✔ tolerates audit output with no vulnerabilities key (0.096009ms)
  ✔ suppresses transitive dependents when the root advisory is allowlisted (0.169302ms)
  ✔ a transitive chain with no reachable advisory stays blocking (0.120421ms)
✔ evaluateAudit (2.237214ms)
▶ resolveDevPlan
  ✔ defaults to API :3100 and frontend :5173 (1.343528ms)
  ✔ honors PORT and VITE_PORT (1.306672ms)
  ✔ supervises the API node process and the Vite npm script (0.600137ms)
  ✔ rejects a garbage port naming the variable (0.843206ms)
✔ resolveDevPlan (6.170785ms)
▶ dev --dry-run
  ✔ prints the plan and exits without touching ports (85.006252ms)
✔ dev --dry-run (85.464463ms)
▶ entry points stay free of Linux-only tooling
  ✔ scripts/run-tests.mjs references no Linux-only tooling (2.344854ms)
  ✔ scripts/depcheck.mjs references no Linux-only tooling (0.278558ms)
  ✔ scripts/dev.mjs references no Linux-only tooling (3.000076ms)
  ✔ scripts/setup.mjs references no Linux-only tooling (0.339107ms)
  ✔ scripts/free-port.mjs references no Linux-only tooling (0.628007ms)
  ✔ scripts/lib/run-parallel.mjs references no Linux-only tooling (0.84199ms)
  ✔ scripts/lib/run-supervised.mjs references no Linux-only tooling (0.300126ms)
  ✔ package.json references no Linux-only tooling (0.277214ms)
✔ entry points stay free of Linux-only tooling (24.17458ms)
▶ root scripts point at the Node runners
  ✔ test runs the Node gate (0.465079ms)
  ✔ dev runs the Node supervisor (3.379973ms)
  ✔ setup runs the Node installer (0.204559ms)
  ✔ depcheck runs the Node fan-out (0.214001ms)
✔ root scripts point at the Node runners (7.839943ms)
▶ workspace test scripts carry no shell env prefix
  ✔ api test runs under Windows cmd (no VAR= prefix) (5.212925ms)
  ✔ frontend test runs under Windows cmd (no VAR= prefix) (1.231029ms)
✔ workspace test scripts carry no shell env prefix (6.598451ms)
▶ run-tests.sh stays a thin shim
  ✔ delegates to the Node gate without its own runner (1.67392ms)
✔ run-tests.sh stays a thin shim (1.794604ms)
▶ installs resolve the way the lockfiles were built
  ✔ root .npmrc pins legacy peer resolution (frontend needs it) (0.325274ms)
✔ installs resolve the way the lockfiles were built (3.197938ms)
▶ isPortOccupied
  ✔ reports false for a free ephemeral port (15.231549ms)
  ✔ reports true for a bound port (2.796954ms)
  ✔ reports false again after the holder closes (1.375516ms)
  ✔ rejects an out-of-range port number (10.034567ms)
✔ isPortOccupied (32.266997ms)
▶ findOccupantPids
  ✔ parses lsof -ti output on linux (1.599636ms)
  ✔ parses lsof -ti output on darwin (3.582592ms)
  ✔ returns an empty list when lsof finds no occupant (exit 1) (0.409497ms)
  ✔ falls back to ss when lsof is missing on linux (0.777686ms)
  ✔ ss fallback only returns pids listening on the requested port (0.692816ms)
  ✔ reports a clear error when neither lsof nor ss exists (0.600844ms)
  ✔ parses netstat -ano output on win32 (0.35416ms)
  ✔ returns an empty list when netstat shows no listener (0.267872ms)
✔ findOccupantPids (9.065476ms)
▶ freePort
  ✔ is a no-op reporting alreadyFree when the port is free (0.532629ms)
  ✔ terminates the occupant and reports freed when the port releases (0.371598ms)
  ✔ escalates to SIGKILL when the occupant ignores SIGTERM (51.065383ms)
  ✔ never kills its own process (15.020298ms)
  ✔ fails with an actionable error when the port never releases (20.072055ms)
  ✔ fails with an actionable error when no occupant pid is found (0.241454ms)
  ✔ terminates a verified occupant when verifyFn approves it (0.263692ms)
  ✔ refuses to kill any occupant when verifyFn rejects it (4.433527ms)
  ✔ treats a throwing verifyFn as unverified instead of killing (0.292046ms)
✔ freePort (92.760866ms)
[remediate] --tasks-dir requires a value
Usage: node scripts/remediate-no-verdict-rejections.mjs [--apply] [--tasks-dir <dir>] [--log <file>] [--no-backup]
[remediate] tasks dir not found: /tmp/kainbain-remediate-absent
[remediate] dry-run: 1 task(s) would be repaired (re-run with --apply)
  - task-1: removed 1 spurious failure(s), repaired 1 report(s), removed stale verdictImplicitPassStages
▶ parseArgs
  ✔ defaults to a dry run that writes nothing (10.898937ms)
  ✔ honours --apply, --no-backup, --tasks-dir, and --log (0.625891ms)
  ✔ lets the last of --apply/--dry-run win (0.197804ms)
  ✔ records an error instead of throwing when a value is missing (0.251229ms)
  ✔ ignores unknown flags (a typo degrades to a dry run, never a write) (0.175451ms)
✔ parseArgs (17.886256ms)
▶ backupPathFor
  ✔ appends .bak (0.263286ms)
✔ backupPathFor (0.469986ms)
▶ remediateTasks
  ✔ reports victims without writing in dry-run mode (3.927547ms)
  ✔ repairs task and report files with backups, then idles on re-run (6.524354ms)
  ✔ leaves a task with only genuine failures byte-identical (6.336066ms)
  ✔ returns an error for a missing tasks dir instead of throwing (2.555973ms)
✔ remediateTasks (21.033817ms)
▶ main
  ✔ exits 2 with usage on argument errors before touching files (2.231594ms)
  ✔ exits 1 on a missing tasks dir (1.398986ms)
  ✔ dry-runs a temp tasks dir and exits 0 (1.506491ms)
✔ main (5.359604ms)
▶ parseArgs
  ✔ defaults to the api suite, 5 runs, no pattern (1.76712ms)
  ✔ parses every flag (0.299008ms)
  ✔ rejects an unknown suite, unknown flag, and non-positive runs (1.062254ms)
  ✔ rejects a flag with no value (0.411087ms)
✔ parseArgs (5.759075ms)
▶ normalizePattern
  ✔ strips the suite directory prefix so the runner resolves the filter in its own workspace (0.630617ms)
  ✔ passes through a bare substring filter unchanged (0.248308ms)
  ✔ rejects an unknown suite (0.366485ms)
✔ normalizePattern (2.052741ms)
▶ buildRepeatCommand
  ✔ targets the suite workspace through npm with no shell (2.347455ms)
  ✔ passes the pattern as a workspace-relative positional filter after -- (0.611009ms)
  ✔ maps canary to its own workspace (0.3533ms)
  ✔ rejects an unknown suite (0.334711ms)
✔ buildRepeatCommand (4.028389ms)
▶ extractFailureSignatures
  ✔ strips ANSI colour and keeps vitest FAIL headlines once each (0.543699ms)
  ✔ falls back to Error lines when the run died before reporting tests (0.195618ms)
  ✔ caps the number of signatures (0.341443ms)
  ✔ returns an empty list for a clean run (0.23114ms)
✔ extractFailureSignatures (2.284051ms)
▶ summarizeRuns
  ✔ counts passes, failing run numbers, and distinct signatures (0.642895ms)
  ✔ reports a zero pass rate for an empty record set without dividing by zero (0.095881ms)
✔ summarizeRuns (0.861964ms)
▶ runRepeat
  ✔ runs the suite N times, logs JSONL + raw output, and reports a green pass rate (2.337636ms)
  ✔ records failures with their signatures and returns ok:false (1.312306ms)
✔ runRepeat (3.821707ms)
▶ runParallel
  ✔ all branches pass -> ok:true with a PASS line per branch (95.870651ms)
  ✔ one branch fails -> ok:false, FAIL names the branch, the other still passes, output shown (1150.068905ms)
  ✔ all branches fail -> ok:false (45.949471ms)
  ✔ seven branches work (mirrors the gate overlap window) (108.670844ms)
  ✔ reports lines in argument order even when a later branch finishes first (844.672459ms)
  ✔ a missing command fails its branch instead of crashing the run (39.571263ms)
  ✔ passing branch output stays hidden (44.109805ms)
  ✔ lowPriority branches still run (niceness is best-effort) (40.587884ms)
✔ runParallel (2373.7935ms)
▶ runParallel progress output (no silent blackout)
  ✔ announces every branch at spawn, in argument order, before any result line (46.700759ms)
  ✔ emits a still-running tick naming outstanding branches while a slow branch runs (401.030289ms)
  ✔ emits no tick when every branch settles inside the interval (40.248563ms)
  ✔ progressIntervalMs 0 disables the tick entirely (345.100497ms)
  ✔ an injected failing branch still prints its full details unchanged (72.747184ms)
  ✔ resolveProgressIntervalMs: option wins, then env, then the 30s default (0.249035ms)
  ✔ formatElapsedSeconds renders compact human durations (0.229783ms)
✔ runParallel progress output (no silent blackout) (907.106927ms)
▶ hung-branch guard (a timed-out branch fails the gate, it cannot hang it)
  ✔ reports exit 124 and settles even when the branch never emits close (92.782304ms)
  ✔ keeps the branch's captured output when it is reaped (70.033122ms)
  ✖ reaps the whole branch process tree, not just the direct child (11056.589657ms)
✖ hung-branch guard (a timed-out branch fails the gate, it cannot hang it) (11220.958916ms)
▶ vitest workers: defaults govern (no cap)
  ✔ scripts/run-tests.mjs sets no worker cap (0.422231ms)
  ✔ api vitest config uses vitest defaults (0.474609ms)
  ✔ frontend vitest config uses vitest defaults (0.199533ms)
✔ vitest workers: defaults govern (no cap) (1.292901ms)
▶ api worker pool: thread workers, per-file isolation kept
  ✔ runs the api suite on the threads pool (no fork per file) (0.347865ms)
  ✔ never disables per-file isolation (0.282392ms)
  ✔ keeps the per-file isolation setup file installed (0.188753ms)
✔ api worker pool: thread workers, per-file isolation kept (1.008143ms)
▶ vitest node-env contract: node builtins stay out of shared happy-dom workers
  ✔ no frontend suite imports the api tree (no pin escape hatch) (20.321193ms)
  ✔ every node:-importing suite runs in node env or the forks pool (16.363325ms)
  ✔ every forks-pinned suite is excluded from the main project (no double run) (0.437432ms)
✔ vitest node-env contract: node builtins stay out of shared happy-dom workers (37.302546ms)
▶ runSupervised
  ✔ streams each child's output with its prefix (272.005787ms)
  ✔ resolves with the first child's exit code and stops the sibling (227.236857ms)
  ✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5243.798273ms)
  ✔ a missing command fails the run instead of hanging (63.716116ms)
  ✔ SIGTERM to the supervisor stops every child and resolves ok (161.653432ms)
✖ runSupervised (5984.056906ms)
▶ buildBranches
  ✔ builds the eleven canonical branches in order when bash and docker exist (4.518037ms)
  ✔ every branch spawns a binary with argv (never a shell string) (0.450474ms)
  ✔ unit tests run at normal priority, the rest low (0.441097ms)
  ✔ reports SKIP (non-fatal) for Security Script Tests without bash (0.672237ms)
  ✔ reports SKIP (non-fatal) for Container Tests without a docker daemon (0.888206ms)
  ✔ reports SKIP (non-fatal) for Dependency Check without the depcheck binary (0.315899ms)
  ✔ keeps Dependency Check runnable (low priority, via npm) when the binary exists (0.546297ms)
  ✔ container tests run the docker suite through node --test (2.344322ms)
  ✔ harness self-tests run the ported node suites (not the old shell one) (1.818091ms)
  ✔ includes Canary Tests by default (npm test parity with deploy.sh --prod) (0.420177ms)
  ✔ omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1) (0.329382ms)
  ✔ spawns Canary Tests last as npm run test:canary (0.357868ms)
✔ buildBranches (15.928996ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (5.514933ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.240429ms)
✔ splitGatePhases (5.917498ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (1.244458ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.182169ms)
  ✔ opts out via --no-canary (0.133386ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.130639ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.136005ms)
  ✔ skip flags win over the legacy opt-in flags (0.128668ms)
✔ resolveCanary (4.072829ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (1.048713ms)
  ✔ reports true when the root tree carries the Windows binary (0.685244ms)
  ✔ reports false when the platform's binary name is missing (4.07388ms)
  ✔ reports false when the root tree has no binaries at all (0.461947ms)
✔ depcheckAvailable (6.942502ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (1.758513ms)
  ✔ returns zero and does not throw when directory does not exist (0.359661ms)
✔ pruneStaleTestDirectories (2.526388ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (2.149817ms)
✔ installSteps (4.180389ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (1.389914ms)
  ✔ root .npmrc documents the per-dir mirrors (0.327587ms)
✔ installSteps npmrc (1.984666ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (2.136454ms)
  ✔ installs the browser alone on macOS and Windows (1.781058ms)
✔ playwrightAttempts (4.446805ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.927896ms)
✔ npxExecutable (1.765154ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (8.71066ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.253457ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.213958ms)
✔ browserInstallTargets (9.507298ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-doPJEI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-HDPNEI/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HPEDNI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-KPGFNI/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-HPEDNI/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-KPGFNI/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-HPEDNI/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-KPGFNI/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-JDfJcI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-HKpLcI/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-DcDkgI/Sanity/docs' -> '/tmp/kainbain-sanity-notes-eEamgI/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-DcDkgI/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-eEamgI/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-DcDkgI/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-eEamgI/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-aFlIdO/Sanity/docs' -> '/tmp/kainbain-sanity-notes-OgbMdO/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-kJeKlO/Sanity/docs' -> '/tmp/kainbain-sanity-notes-FcOMlO/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-kJeKlO/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-FcOMlO/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-kJeKlO/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-FcOMlO/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (15.505056ms)
  ✔ leaves no fixture residue in the OS temp dir (8.931885ms)
✔ checkStorageSanity (26.150728ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.888757ms)
  ✔ rejects a missing entry path or a different file (0.339656ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (215.384107ms)
✔ isMainModule (216.981977ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.337237ms)
  ✔ returns 0 when the notes space has no tasks dir (0.761429ms)
✔ countNotesTasks (2.422871ms)
ℹ tests 287
ℹ suites 72
ℹ pass 278
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17060.732845

✖ failing tests:

test at tests/deploy-reexec.test.mjs:101:2
✖ passes --wait and a node-aware PATH to systemd-run (5.556945ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-GGfKeH/argv.log'
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
    path: '/tmp/kb-deploy-reexec-GGfKeH/argv.log'
  }

test at tests/deploy-reexec.test.mjs:113:2
✖ propagates a failing unit's exit code to the caller (no vacuous PASS) (3.312642ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-ngAejH/argv.log'
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
    path: '/tmp/kb-deploy-reexec-ngAejH/argv.log'
  }

test at tests/deploy-reexec.test.mjs:119:2
✖ pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop) (8.62621ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-oOGnmH/argv.log'
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
    path: '/tmp/kb-deploy-reexec-oOGnmH/argv.log'
  }

test at tests/deploy-reexec.test.mjs:127:2
✖ re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution) (6.974932ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-gBCCHI/argv.log'
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
    path: '/tmp/kb-deploy-reexec-gBCCHI/argv.log'
  }

test at tests/deploy-reexec.test.mjs:140:2
✖ omits the attempt-id setenv on manual runs without an attempt id (4.991255ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-reexec-NmPnNI/argv.log'
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
    path: '/tmp/kb-deploy-reexec-NmPnNI/argv.log'
  }

test at tests/deploy-reexec.test.mjs:280:2
✖ omits --pipe from the real re-exec argv while keeping --wait (3.011942ms)
  Error: ENOENT: no such file or directory, open '/tmp/kb-deploy-nopipe-icAfJJ/argv.log'
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
    path: '/tmp/kb-deploy-nopipe-icAfJJ/argv.log'
  }

test at tests/deploy-reexec.test.mjs:324:2
✖ emits engine-visible heartbeats while the detached unit runs (6.736844ms)
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
✖ reaps the whole branch process tree, not just the direct child (11056.589657ms)
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
✖ reaps wrapper grandchildren that inherit stdio (npm/vite shape) (5243.798273ms)
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