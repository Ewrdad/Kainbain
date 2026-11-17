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
git checkout main && git pull
git merge-base --is-ancestor fbcf8442 HEAD && echo BUNDLE-SOURCE-OK
bash scripts/package-runner.sh <REF>                    # -> dist/kainbain-runner-<REF>.tar.gz
```

Expected: tarball with ONE top-level dir
(`kainbain-runner-<version>-<platform>-<arch>/`, tar convention — the
self-update channel strips it automatically, manual installs must pass
`--strip-components=1`, see Bundles A/B) containing `version.json` (with
`build {sha,builtAt,dirty}` stamped from HEAD — NOTE: the stamped sha is
the build-time HEAD, NOT the `<REF>` filename), `runner/`, `api/`,
`shared/`, and the leg-closure under `api/node_modules/` (incl.
`@earendil-works/pi-coding-agent`).
Verify (prefix-tolerant — members carry the top-level dir prefix, so an
anchored `^(version.json|…)` grep matches NOTHING even on a good bundle):

```bash
tar tzf dist/kainbain-runner-<REF>.tar.gz | grep -E '/(version\.json|runner/daemon\.js|runner/main\.js|api/node_modules/@earendil-works/pi-coding-agent/dist/utils/child-process\.js)$'
TOP=$(tar tzf dist/kainbain-runner-<REF>.tar.gz | head -n 1)   # e.g. kainbain-runner-0.1.0-linux-x64/
tar xzOf dist/kainbain-runner-<REF>.tar.gz "${TOP}version.json"  # record build.sha/builtAt/dirty
```

### Staged Bundle B tarball (verified 2026-11-14, cleanup stage — use as-is)

`/home/server2/kainbain-runner-fbcf8442.tar.gz` (sha256
`ac919e2ad17bf1674ed351e148fa65445db868d93b8c9b7f44a94cfd43ade402` —
re-hash before use; mismatch means re-transfer, never install).
Stamps `build.sha de62122cfb642d6728e95f350e795b0641d9524b`
(`builtAt 2026-11-14T13:50:29.798Z`, `dirty:false`; built from this
task's branch, which is docs-only vs main, and contains all five WP
merges incl. WP-B `fbcf8442` — the `fbcf8442` in the FILENAME is just
the packager REF arg). Closure proven: 2161
`@earendil-works/pi-coding-agent` members incl.
`dist/utils/child-process.js` AND its `cross-spawn` dependency — this
bundle fixes BOTH the missing-pi-package and the nested `cross-spawn`
`ERR_MODULE_NOT_FOUND` seen on server2-alpha. Do NOT rebuild from a
newer main just to chase a sha: a rebuild needs full re-verification.
Expected server2-alpha receipt after Bundle B: `build.sha`
`de62122c…` (NOT `fbcf8442…` — a `de62122c` receipt is HEALTHY, not a
stale-sha STOP; run20–22 notes saying "expect fbcf8442" for
server2-alpha are superseded by this record).

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
   dist/kainbain-runner-<REF>.tar.gz -C ~/.kainbain/runner-install/<id>
   --strip-components=1` (`--strip-components=1` is REQUIRED: without
   it the tree lands one level down under
   `kainbain-runner-<version>-<platform>-<arch>/` and the repointed
   service silently boots whatever was there before — or fails to
   find `runner/main.js`). Assert the layout before repointing:
   `test -f ~/.kainbain/runner-install/<id>/runner/main.js &&
   test -f ~/.kainbain/runner-install/<id>/version.json && echo
   LAYOUT-OK`.
4. Env edit (q5 default): REMOVE the `KAINBAIN_RUNNER_MODELS` line entirely
   so discovery is the source of truth. Fallback only if removal is
   refused: trim the list to harness-qualified ids
   (`harness::provider::model[::effort]`) whose harness is served by that
   runner — post-WP-B config drops anything else at boot with a warning.
   Keep `KAINBAIN_RUNNER_HARNESSES`, backend URL, and credential lines.
5. Repoint the service definition / launch script's WorkingDirectory (and
   EnvironmentFile if renamed) at the new dir. The WorkingDirectory
   root MUST contain `runner/main.js` + `version.json` (the LAYOUT-OK
   assert above); pointing it at a dir whose only child is the
   unstripped `kainbain-runner-*/` subdir is the silent-old-boot
   failure from step 3. Supported long-term entrypoint is the
   self-update wrapper (`$INSTALL_ROOT/bin/kainbain-runner` over
   `releases/<version>/unpacked`, laid down via
   `scripts/lib/runner-install-root.sh` `lay_down_runner_install_root`
   — the same layout `scripts/install-local-runner.sh` creates); a
   direct `node runner/main.js` boot is functionally fine for WP-F
   (same daemon, same discovery + build identity) but bypasses
   self-update and the wrapper doctor flags it. Either way, record
   which entrypoint the unit uses. Rollback: previous install
   path + `.bak-wpf` env file (leave both in place until §6 passes).

## Bundle B — server2-alpha (host server2, this host)

Current install `/home/server2/apps/kainbain/runner/` @ `f430f537`
(bundle layout already; env file has no pins — step 4 is a no-op here):

1. `cp -a /home/server2/apps/kainbain/runner
   /home/server2/apps/kainbain/runner.bak-wpf` (rollback copy).
2. Extract the staged bundle over the install root (the env file lives
   outside at `/home/server2/.kainbain/` and is untouched; do NOT copy
   `.bak-wpf` credentials anywhere):
   `tar xzf ~/kainbain-runner-fbcf8442.tar.gz -C
   /home/server2/apps/kainbain/runner --strip-components=1`
   (`--strip-components=1` is REQUIRED: without it the new tree lands
   in `/home/server2/apps/kainbain/runner/kainbain-runner-*/`, the
   unit (`WorkingDirectory=…/runner/runner`, `ExecStart=node main.js`)
   keeps booting the OLD `runner/main.js`, and the restart looks
   successful while changing nothing — verify step 3 catches this).
   Expect `version.json` (new lowercase file), `runner/`, `api/`,
   `shared/` replaced. NOTE: the legacy UPPERCASE `VERSION.json` at
   the root stays behind — nothing reads it (the daemon reads
   `runner/version.json` beside itself; the updater reads lowercase
   `version.json`), so leave it; do NOT delete it mid-rollout (it is
   part of the rollback story until §6 passes).
3. Assert (all three must print OK before any restart):
   `test -f /home/server2/apps/kainbain/runner/runner/main.js &&
   test -f /home/server2/apps/kainbain/runner/version.json && echo
   LAYOUT-OK`; `test -f
   /home/server2/apps/kainbain/runner/api/node_modules/@earendil-works/pi-coding-agent/dist/utils/child-process.js
   && echo PI-DEP-OK` (N3 fix — the dep lives under `api/node_modules`,
   NOT top-level `node_modules`); `node -e
   "console.log(require('/home/server2/apps/kainbain/runner/runner/version.json').build.sha"`
   (expect `de62122c…` per the staged-tarball record above).
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

Per runner: install path, bundle REF, unit entrypoint kind (wrapper
`bin/kainbain-runner` vs direct `node runner/main.js`),
`KAINBAIN_RUNNER_MODELS` removed or exact remaining value, and fresh
`GET /runners` excerpts: `modelSource` (expect `discovered` or
`pinned+discovered`), `discoveryStatus` (expect one key per configured
harness, `ok:true` or a NAMED error code — never `{}`, never absent),
`versions.build.sha` (expect THE STAMPED sha of the bundle that runner
installed — `fbcf8442…`-series for the .206 local runners IF rebuilt
from main@`fbcf8442`, `de62122c…` for server2-alpha from the staged
tarball above; the sha NEVER comes from the tarball filename; ALSO
report the deploy-log true backend commit for the §6.1 comparison),
`codeChangedSinceBoot` (expect false), and `paused` (expect false for
every serving runner — a paused runner keeps `status: active` and
still queues `requestModelRediscovery` (202), but its discovery never
reaches the catalogue or dispatch, so leaving one paused is a fleet
decision that must be recorded as intent, not left as an accident).

STOP rules (q6): any runner reporting `LEG_MODULE_MISSING`, `NOT_YET_RUN`
(after a completed round), a stale `build.sha`, or `codeChangedSinceBoot:
true` → stop, diagnose with the agent, do NOT proceed to purge. Purge +
§6 need a fresh agent run holding explicit recorded permission.
`codeChangedSinceBoot:true` triage (the daemon fingerprints its tree at
boot — file count, total bytes, newest mtime, skipping `.git` and
`node_modules` — and re-scans every heartbeat, so `true` means a file
under the install was provably added, removed, or rewritten after
boot): on the runner host run `find <install-dir> -newermt
'<boot-time>' -not -path '*/node_modules/*' -not -path '*/.git/*'`
(boot time ≈ `versions.bootedAtMs`, or the process start from
`systemctl --user status <unit>`). A benign inspection artifact or
runtime write → record it and re-baseline with a quiescent restart; an
unexpected code change → treat as N1-class drift: reinstall from the
bundle, do NOT just restart over it.

## Phase 4 transfer note (agent executes, operator permits — read before granting)

The purge agent runs (URL-encoded id):
`DELETE /runners/models/catalogue/<id>` → 204 gone, 404
`UNKNOWN_MODEL` already absent (both are non-errors for the purge
target); `DELETE /runners/models/catalogue/quarantine/<id>` likewise
for quarantined rows. A re-advertised id legitimately reappears on the
next snapshot update — absence is confirmed by a fresh GET, never by
the DELETE status alone. Auth: both routes need the admin role, and
API keys are explicitly refused (`allowApiKeys: false` — keys get 403
`forbidden`); while access control is OFF (current live state) the
routes are open. If access control is ever ON, 401/403 means "auth",
NOT "absent" — the purge run must use a human admin session, and a
403 must never be misread as purge-complete. There is deliberately NO
runner-record DELETE endpoint (only revoke/pause/resume), so a
"delete the revoked runner completely" grant is infeasible via API —
revoked records stay for audit.

## Addendum 2026-11-14 (agent safe action) — systemd user-level pin trap

`~/.kainbain/runner-local-{alpha,bravo}.env` is NOT the only source of
`KAINBAIN_RUNNER_MODELS`. `local-alpha` was inheriting a 17-model pin
from the systemd *user* environment (`systemctl --user show-environment`),
so the env-file removal alone never took effect and the upgraded daemon
kept reporting `modelSource: pinned` with `discoveryStatus: {}`. Bravo did
not inherit it. Before restarting any runner, the operator MUST:

```bash
systemctl --user unset-environment KAINBAIN_RUNNER_MODELS
# also check persistence:
grep -R KAINBAIN_RUNNER_MODELS ~/.config/environment.d 2>/dev/null || true
```

Only after the user environment is clean will a post-WP-B restart flip
`modelSource` to `discovered`/`pinned+discovered`.

## Addendum 2026-11-17 (cleanup-stage hardening — operator-visible behavior changes)

The cleanup stage hardened the exact tools this handoff runs. No step above
changes meaning; the tools now fail safe where WP-F hit confusion:

- `scripts/package-runner.sh` refuses a sha-looking REF that matches
  neither HEAD nor its short form (the `fbcf8442`-filename-vs-`de62122c`-
  stamp trap). Either check out the REF first, pass the HEAD short sha,
  or re-run with `--allow-ref-mismatch` when you mean it. Every build
  now prints a transfer receipt (`sha256:` + `stamped build.sha:`) —
  re-hash before install, and compare receipts against the STAMPED sha,
  never the filename.
- `lay_down_runner_install_root` (Bundle A wrapper installs) now asserts
  the laid-down tree (`runner/main.js`, both `version.json` copies, the
  wrapper shim) before `current` may point at it, and warns when the
  tree ships no pi discovery dependency (pi-serving runners will report
  `LEG_MODULE_MISSING` until reinstalled from a real bundle;
  muse/antigravity/vibe-only hosts are unaffected).
- `codeChangedSinceBoot` no longer flips on non-code artifacts left by
  inspection (`*.bak*`, `*~`, `*.log`, `*.tmp`, OS junk) — the false
  positive that forced the run24 local-alpha re-baseline. It now scans
  the whole bundle root (`version.json` + `runner/` + `api/` + `shared/`)
  for installed bundles instead of `runner/` alone, so harness-code
  drift under `api/` is visible — matching the `find <install-dir>`
  triage above. Scan the unpacked bundle root
  (`.../releases/<ver>/unpacked`, or the direct install dir) with that
  `find`, not the wrapper root, for the tightest match to the daemon.
