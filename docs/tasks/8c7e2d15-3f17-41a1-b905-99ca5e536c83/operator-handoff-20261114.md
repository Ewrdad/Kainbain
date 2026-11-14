# WP-F Operator handoff — Phases 2–3 (2026-11-14)

THE AGENT WILL NOT EXECUTE ANY STEP BELOW. Survey q23 + task q1 bind this:
the agent recommends runner reinstall / env-edit / restart work; the human
operator executes it. Restarting a runner from inside a task agent running
on it would kill that agent.

Prereads: `gates-20261114.md` (deploy-commit caveat: confirm build 637's
true commit from the deploy log — `/status` claims a stale Oct 30 sha),
`baseline-20261114.md` (current live state).

## Bundle (do first, once)

Build from `main` at or after `fbcf8442` (WP-B merge, 2026-11-14 04:39Z)
— earlier commits lack the leg-closure packaging that fixes the
server2-alpha pi leg:

```bash
git checkout main && git pull && git log --oneline -1   # must contain fbcf8442
bash scripts/package-runner.sh <REF>                    # -> dist/kainbain-runner-<REF>.tar.gz
```

Expected: tarball containing `version.json` (with `build {sha,builtAt,
dirty}` stamped from HEAD), `runner/`, `api/`, `shared/`, leg-closure
`node_modules/` (incl. `@earendil-works/pi-coding-agent`).
Verify: `tar tzf dist/kainbain-runner-<REF>.tar.gz | grep -E
'^(version.json|runner/daemon.js|node_modules/@earendil-works)'`.

Version note: in-tree `runnerVersion` is still `0.1.0`, so `updateAvailable`
will stay false until a proper runner release bumps it (WP-A CI check
`scripts/check-runner-version-bump.mjs` governs the publish path). Prefer
cutting that release via the normal publish path; manual install below
works regardless. Record the bundle REF + `build.sha` (it is the expected
`versions.build.sha` in every Phase 3 receipt).

## Bundle A — local-alpha, local-bravo (host .206)

Per runner `<id>`:

1. Inventory (report back): current cwd of the runner process
   (`readlink /proc/<pid>/cwd`), its service definition / launch script,
   and the env file (`~/.kainbain/runner-local-*.env`).
2. Back up the env file: `cp ~/.kainbain/runner-local-<id>.env
   ~/.kainbain/runner-local-<id>.env.bak-wpf`.
3. Fresh dir + extract (NEVER the engine checkout):
   `mkdir -p ~/.kainbain/runner-install/<id> && tar xzf
   dist/kainbain-runner-<REF>.tar.gz -C ~/.kainbain/runner-install/<id>`.
4. Env edit (q5 default): REMOVE the `KAINBAIN_RUNNER_MODELS` line entirely
   so discovery is the source of truth. Fallback only if removal is
   refused: trim the list to harness-qualified ids
   (`harness::provider::model[::effort]`) whose harness is served by that
   runner — post-WP-B config drops anything else at boot with a warning.
   Keep `KAINBAIN_RUNNER_HARNESSES`, backend URL, and credential lines.
5. Repoint the service definition / launch script's WorkingDirectory (and
   EnvironmentFile if renamed) at the new dir. Rollback: previous install
   path + `.bak-wpf` env file (leave both in place until §6 passes).

## Bundle B — server2-alpha (host server2, this host)

Current install `/home/server2/apps/kainbain/runner/` @ `f430f537`
(bundle layout already; env file has no pins — step 4 is a no-op here):

1. `cp -a /home/server2/apps/kainbain/runner
   /home/server2/apps/kainbain/runner.bak-wpf` (rollback copy).
2. Extract the new bundle over the install root so `version.json`,
   `runner/`, `api/`, `shared/`, `node_modules/` are replaced
   (the env file lives outside at `/home/server2/.kainbain/` and is
   untouched; do NOT copy `.bak-wpf` credentials anywhere).
3. Confirm `node_modules/@earendil-works/pi-coding-agent` exists (N3 fix)
   and `version.json` carries the new `build.sha`.
4. Muse provider check: after restart, `discoveryStatus.muse` must be
   `ok:true` (baseline already 6 models). `MUSE_MSP_MODELS_EMPTY` means the
   Muse CLI answered with zero rows — check the CLI / provider config on
   the host if it appears.

Service (no edit needed unless the path changes): user unit
`kainbain-runner-server2-alpha.service`
(`systemctl --user restart kainbain-runner-server2-alpha`).

## Restart sequence (all runners, one at a time)

1. Pick a QUIESCENT window per runner: no active task agent on the runner
   being restarted (`GET /status` engine idle + runner has no live
   assignment; Settings → Runners). NEVER restart all runners at once.
2. NEVER restart, from inside a task agent, the runner executing that
   agent (q23 self-kill note). server2-alpha is executing WP-F agent work
   right now — restart it only when no agent session runs on it.
3. Restart ONE runner, then wait for re-registration and confirm healthy
   `discoveryStatus` (below) before the next.
4. After all restarts: trigger `requestModelRediscovery` from Settings
   (Re-scan), or per runner:
   `curl -X POST http://192.168.1.206:3100/runners/<id>/commands -H
   'Content-Type: application/json' -d '{"command":"requestModelRediscovery"}'`
   (expect 202; the runner picks it up on its next heartbeat).

## Receipts (report back to the WP-F agent / paste into the task)

Per runner: install path, bundle REF, `KAINBAIN_RUNNER_MODELS` removed or
exact remaining value, and fresh `GET /runners` excerpts: `modelSource`
(expect `discovered` or `pinned+discovered`), `discoveryStatus` (expect one
key per configured harness, `ok:true` or a NAMED error code — never `{}`,
never absent), `versions.build.sha` (expect bundle sha; ALSO report the
deploy-log true backend commit for the §6.1 comparison), and
`codeChangedSinceBoot` (expect false).

STOP rules (q6): any runner reporting `LEG_MODULE_MISSING`, `NOT_YET_RUN`
(after a completed round), a stale `build.sha`, or `codeChangedSinceBoot:
true` → stop, diagnose with the agent, do NOT proceed to purge. Purge +
§6 need a fresh agent run holding explicit recorded permission.
