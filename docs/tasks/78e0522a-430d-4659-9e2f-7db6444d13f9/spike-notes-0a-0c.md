# Spike notes — Steps 0a–0c (restart mechanism, version-list source, auto-update matrix)

Research for task `78e0522a` (Restart/Update split + per-runner version pinning).
Decisions below are as implemented; file/line pointers are to this branch.

## 0a — Restart mechanism

Question: what does "reboot the runner on its current version" mean mechanically?

- Rejected: backend kills the runner remotely (the backend has no shell on
  runner hosts — coordination-only, R05 stands), and host-service reboot
  (out of scope).
- Chosen: a new `requestRestart` backend-to-runner command, symmetric with
  `requestUpdate` (`RUNNER_COMMANDS` in `api/flow/runnerRegistry.js`,
  consumed in `handlePendingCommands` in `runner/daemon.js`, advertised in
  `SUPPORTED_RUNNER_COMMANDS`). It reboots at once — a live execution is
  stopped, never drained (survey q2 destructive semantics); the orphaned
  claim lease expires so the work re-queues exactly like a crash.
- Hook detail found during review: the `kainbain-runner` wrapper only
  re-execs when the `current` symlink target changed (a staged update), so
  a bare `process.exit(0)` would STOP a same-version runner instead of
  rebooting it. The daemon therefore writes a `restart-requested`
  sentinel beside the install root (`requestWrapperRestart` in
  `runner/updates/state.js`) before exiting 0; the wrapper consumes it and
  boots the SAME tree again. Exit 0 + sentinel keeps systemd
  `Restart=on-failure` supervision quiet. A stale sentinel (crash between
  write and exit) causes at most one extra boot. Unwrapped
  (`node main.js`) runners exit without rebooting — documented in
  `docs/runner-update-runbook.md`, same class as staged updates there.
- No update check is interleaved (Restart ≠ Update, survey q1); the ack is
  confirmed with a final heartbeat first so peek-until-ack redelivery
  cannot restart-loop the rebooted runner.

## 0b — Version-list + desired-version source of truth

- `desiredVersion` lives in `operatorConfig` (`'latest'` default,
  backfilled for old state; strict PATCH validation — `latest`/null or a
  parseable version, else 400 `INVALID_DESIRED_VERSION`).
- The Settings dropdown needs no release-catalogue fetch (offline-safe):
  `fleetKnownVersions` in `api/flow/runnerVersionCompat.js` unions every
  runner-reported version with the recommended/minimum knobs, newest-first,
  capped at 30 (same bound as the runner update client). The UI unions
  that with running + recommended + the stored pin so the current
  selection is always renderable.
- The setting rides the heartbeat `update` directive; the daemon reads the
  pin via `pinnedDesiredVersion` (fail-open to latest-tracking on old
  backends/junk). Fixed pins above recommended are allowed; below minimum
  still 409s (floor unchanged) with a distinct "pin cannot clear the
  floor" banner + disabled Update.

## 0c — Idle-only auto-update vs restart-triggered update (truth table)

| Setting | State | Behaviour |
|---|---|---|
| `latest` | idle (incl. after a restart, once idle) | auto-updates (hourly idle check + daily backend nudge); red banner until converged |
| `latest` | busy | red banner + Update button; never interrupted |
| pinned | any | never automatic (no nudges, no idle installs); manual Update installs exactly the pin when newer, fails loud otherwise |
| pinned = running | — | no warning (unless below minimum — the floor always warns red) |

- Backend nudge (`shouldAutoRequestUpdate`) and the daemon idle check
  (`maybeSelfUpdate`, non-force) both gate on latest-only; force paths
  (manual Update, 409 floor) resolve the pin as the check target.
- A restart never installs anything by itself; a Latest runner converges
  at its next idle check after the reboot.
