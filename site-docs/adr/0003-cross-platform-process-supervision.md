# ADR 0003 — Cross-platform process supervision

**Status:** Accepted
**Date:** 2026-10-04
**Task:** `a4fabec2-2cfb-4c38-87bf-9953f31bfb60`
**Audit:** docs/tasks/b61469b8-5c10-498d-aa52-5bba8a397a9d/AUDIT.md (notes-space run archive, pre-reversal; not a repo path)
§4.1 (L-6…L-9), §4.2, §4.4; peer review F-2, F-3.

## Context

Process execution was Linux-literal: `/bin/sh` spawn, negative-PID group kill
(which throws on Windows), `command -v git` via `/bin/sh`, SIGTERM→SIGKILL
escalation with no Windows equivalent, hardcoded `HOME=/home/server`,
`USER=server`, `/run/user/<uid>` fallbacks, and health checks that flatline on
Windows (`os.loadavg()` returns zeros there). There was zero
`process.platform` branching in non-test source, so stages and harness
children could not run safely on macOS/Windows.

Hard constraint: the app is in active use for its own development, so every
change keeps observable Linux behavior identical (same spawn path, same
signals, same escalation timing, same health-response shape on Linux).

## Decision

Introduce a small platform abstraction and migrate the five Linux-literal
sites onto it:

- **D1 — No `tree-kill` dependency; native `api/utils/processTree.js`.**
  `taskkill /PID <pid> /T /F` ships with every Windows install and POSIX
  group-kill already works; a dependency buys almost nothing and adds
  supply-chain surface to a security-sensitive kill path. Two functions:
  `killProcessTreeSync(pid, opts)` (sync abort/timeout paths) and
  `killProcessTree(pid, opts)` (async, for escalating supervisors). Both
  accept `{ platform }` so tests inject `win32` without touching the
  read-only `process.platform`. Unknown platforms fall back to `child.kill`
  semantics; a dead pid is success on every branch, never a throw.
- **D2 — Two modules, not one.** `api/utils/platform.js` (`isWindows`,
  `resolveShell`, `buildStageEnv`, `findOnPath`) owns env/shell concerns;
  `api/utils/processTree.js` owns termination. They change for different
  reasons, and `humanGitSafety.audit.js` needs only `findOnPath`.
- **D3 — Windows shell is `COMSPEC` (`cmd.exe`), not PowerShell.**
  PowerShell changes quoting semantics and startup cost; `COMSPEC` is the OS
  contract. POSIX shell is `SHELL || "/bin/sh"`. Args prefix: POSIX `["-c"]`,
  Windows `["/d", "/s", "/c"]`. Windows spawns use `detached: false` plus
  `windowsHide: true` (cleanup goes through `taskkill /T`, no pgid needed).
- **D4 — `killTaskProcess` stays synchronous.** Timeout/abort paths must not
  await. Windows branch uses sync `taskkill`; POSIX keeps the exact current
  sequence (negative-PID `SIGKILL` → `child.kill` fallback).
- **D5 — `harnessScaffold.kill()` stays sync-shaped; Windows escalation is
  fire-and-forget `taskkill`.** POSIX keeps `SIGTERM →(grace)→ SIGKILL` with
  the same default 200 ms grace. `SIGINT`-first is an opt-in `firstSignal`
  (making it the default would change Linux behavior); the watchdog always
  escalates regardless of the first signal. No grace timer on Windows.
- **D6 — Health: mark load `unsupported_platform`, no CPU sampling.**
  `checkDevice()` is synchronous; real CPU sampling needs a time window and
  would force an async redesign for zero Linux benefit. On `win32` only:
  `loadAvg: null`, `loadStatus: "unsupported"`, load excluded from the
  verdict, message names memory only. macOS `os.loadavg()` works — no change
  there. `loadStatus` is only added when `"unsupported"`, so Linux JSON stays
  byte-compatible.
- **D7 — `os.userInfo()` and `os.homedir()` are both guarded.** `userInfo()`
  throws in minimal containers; `homedir()` can throw when `HOME` is unset.
  Every call has try/catch with fallback to env passthrough, then
  `os.tmpdir()` (HOME) / a generic app identity (USER) — never a hardcoded
  `/home/server` or `server`. `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS`
  are Linux-only.
- **D8 — The git audit keeps its contract; PATH search replaces the shell.**
  `realGitPath()` is now POSIX absolute candidates → `findOnPath("git")`
  (PATHEXT-aware on Windows) → same throw as before. The `#!/bin/sh`
  argv-logging wrapper stays POSIX-only; `install()` throws a clear
  "unsupported on win32" error rather than installing a broken wrapper.

Explicit non-goals: stage *command* portability (an `sh`-syntax command still
will not run under `cmd.exe` — the executor launches, supervises, cleans up,
and reports safely; portable commands are the stage author's job), shell
script porting (`deploy.sh`, `run-tests.sh`), and new binary dependencies.

## Consequences

- Stages (`commandStages.js`), task abort/timeout (`taskControl.js`), and
  agent-harness children (`harnessScaffold.js`, adopted by the antigravity,
  custom, and muse harnesses via the shared `kill()`) terminate whole trees
  on Linux, macOS, and Windows with no negative-PID throws and no orphans.
- `/status` stays healthy-shaped on Windows: no `NaN`, no zero-division, no
  load false alarms; memory/uptime checks intact.
- Linux behavior is pinned by characterization tests that passed before and
  after every step (`commandStages.platform.test.js`, `taskControl.test.js`
  group-kill ordering, `healthChecker.test.js` response-shape keys).
- Windows branches ship mock-tested: no Windows CI exists yet to prove
  runtime behavior (multi-platform CI is tracked separately). `detached:
  false` + `windowsHide: true` on Windows may need console-behavior tuning
  once real Windows runs are observed.
- Windows has no graceful kill at all (`child.kill("SIGTERM")` is
  `TerminateProcess`); immediate `taskkill /F /T` is accepted and documented.
- `findOnPath` matches `command -v` semantics on POSIX (regular file +
  executable bit) and `where`-style PATHEXT search on Windows.

## Verification map

| Finding | Test |
|---|---|
| L-6 `/bin/sh` spawn | `api/utils/platform.test.js` (shell resolution), `api/flow/commandStages.platform.test.js` (Linux spawn shape) |
| L-6b hardcoded env | `api/utils/platform.test.js` (derivation, throwing `os.*`, Linux-only XDG) |
| L-7 group kill / F-2 | `api/utils/processTree.test.js`, `api/flow/taskControl.test.js`, `api/flow/stageCancel.integration.test.js` |
| L-8 `command -v git` | `api/flow/humanGitSafety.audit.test.js` (PATH resolution, win32 install error) + `humanGitSafety.contract.test.js` |
| L-9 escalation | `api/agent/harnesses/shared/harnessScaffold.test.js` (POSIX timing unchanged, win32 taskkill, SIGINT opt-in) |
| F-3 loadavg / §4.4 | `api/healthChecker.test.js` (win32 shape, darwin shape, Linux keys) |
| §4.2 abstraction | `api/utils/platform.js` + `api/utils/processTree.js` exist with unit tests |
