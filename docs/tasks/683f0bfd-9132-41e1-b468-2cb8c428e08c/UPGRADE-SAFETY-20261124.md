# Upgrade-safety review — S5 rollout (0.1.0 → 0.2.1) and this docs-only branch

**Task:** `683f0bfd-9132-41e1-b468-2cb8c428e08c` · **Date:** 2026-11-24
**Question asked this stage:** will the current change, as implemented, break
existing installs on update? If yes, fail the stage; do not fix. Docs-only audit.
**Verdict: PASS — no install-breaking change found.** This file is the only file added this stage.

## 1. This branch introduces zero runtime changes

`git diff main...HEAD --name-only` lists only files under
`docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/` (recounts, snapshots, scripts
under that folder, `IMPLEMENTATION_PLAN.md`, `BASELINE.md`, etc.).
`git diff main...HEAD --name-only | grep -v '^docs/'` is empty, and a search for
`scripts/|runner/|api/|frontend/` in the diff is empty. No backend, runner,
installer, Docker, CI, or config file is touched, so `git pull` of this branch and
the runner self-update channel are unaffected by it. Observation scripts in
`bin/` are read-only by inspection and header comment: `fleet-recount.sh` (GETs
only, writes only under the task folder), `runners-snapshot.sh` (GETs only),
`e5-sweep.sh` (ls/git/log/for-each-ref/journalctl only, explicit "READ-ONLY: it
never reaps, deletes, restarts, updates, or modifies anything").

Hygiene note (not a break): `bin/tests/__pycache__/mock-api.cpython-314.pyc` is
tracked under docs/. It is never packaged into the runner bundle or backend
image (which ship `runner/` and `api/`, not `docs/`), so it cannot break installs.
Flagged for cleanup on the next task-folder touch, not a FAIL.

## 2. The 0.1.0 → 0.2.1 runner release this stage rolls out is backward compatible

Verified from the tags live on 2026-11-24:

- `runner/version.json` at `runner-v0.1.0`, `runner-v0.2.0`, `runner-v0.2.1` all
  declare `"requires": { "backendApi": ">=1.0.0 <2.0.0" }` and
  `api/version.json` accepts `runner >=1.0.0 <2.0.0` unchanged. The updater's
  compat gate therefore treats 0.2.1 as installable against the same backend;
  no new API floor was introduced.
- No runner source file is deleted between `runner-v0.1.0..runner-v0.2.1`
  (`--diff-filter=D` under `runner/` is empty; deletions are only old
  `docs/tasks/*/task.md` files). Install layout (`releases/`, `current`/`previous`
  symlinks, `update-state.json`) is unchanged, so existing
  `$KAINBAIN_RUNNER_INSTALL_ROOT` stays valid; the wrapper's new
  `doctor` subcommand and `restart-requested` sentinel are additive.
- New runner env vars all have safe defaults and are opt-outs, not requirements:
  `KAINBAIN_RUNNER_IMPROMPTU` defaults to `1` (opt out with `0`),
  `KAINBAIN_RUNNER_DISCOVERY_STALE_MS` defaults to `24h`,
  `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS` defaults to `0`. `.env.example` diff
  adds only additive knobs with defaults; `KAINBAIN_RUNNER_MIN_VERSION` and
  `KAINBAIN_RUNNER_RECOMMENDED_VERSION` stay `0.1.0`. Existing env files boot unchanged.
- Wire changes are additive and tolerated both ways: `complete-execution` gains
  optional `gitFailure`/`configHash`/`committed` (`runner/client.js` spreads them
  only when present; old backends ignore unknown keys). New impromptu endpoints
  are only polled when the feature is enabled; the dispatch loop is unaffected.
  `shared/gitFailure/*` is pure classification (hook-rejected/commit-failed/
  merge-conflict) with a prior PASS upgrade-safety review
  (`docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/review-upgrade-safety-20261121-093235.md`).
- The one behavior change with an operator-visible effect is documented as a
  migration note, not a silent break: model advertisement moves from pin-wins to
  pin ∪ discovered, and malformed pins (bare ids, 2-part `provider::model` keys)
  are now dropped with a boot warning into `facts.errors` instead of advertised
  (`runner/config.js`, `runner/README.md` "Migration note"). The pin itself is
  never dropped to a broken scan. The runbook's one upgrade note (WP1 tenant
  fence: old runners without `projectId` get `400 MISSING_PROJECT_ID`) does not
  affect the current fleet — `runner-v0.1.0`'s `client.js` already sends
  `projectId` on every write, and the live fleet proves it (see §3).

## 3. Live fleet is still healthy on 0.1.0; lag is expected, not breakage

Latest snapshot `runners-after/runners-20261124T021506Z.tsv` (02:15Z): `local-alpha`
and `local-bravo` on `0.1.0` build `fbcf8442` (2026-11-14), `server2-alpha` on
`0.1.0`, knobs `recommendedVersion 0.1.0` / `minimumVersion 0.1.0`,
`availableVersions ["0.1.0"]`, `updateAvailable` false, no pending nudges.
Per `docs/runner-update-runbook.md` step 5 the knob raise to `0.2.1` is a human
PROD-ACTION that has not landed, so no runner can nudge yet; the runbook also
states updates are at most daily and idle-only, and `BASELINE.md`/`RECOUNT-AFTER.md`
record the gates as BLOCKED-not-converged with zero forced restarts (survey q9).
A runner that has not updated is not a broken install — it is a still-running
`0.1.0` install dispatching normally against backend build 637 (publish-only
deploy, no restart, `server_restart` 0 in all recounts).

## 4. Conclusion

No persistence migration, no removed file, no new required config, no API floor
raise, and no branch-local code that ships. Existing installs (`git pull` or
`current` symlink flip 0.1.0 → 0.2.1 on idle) keep booting with their current
env, install root, and worktrees. Nothing to fail; no fix needed.
