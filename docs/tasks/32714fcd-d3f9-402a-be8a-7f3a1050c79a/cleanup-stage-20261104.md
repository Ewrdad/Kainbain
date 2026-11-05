# Cleanup / hardening stage (2026-11-04)

Goal: make the onboarding change rigid, fail-safe, and regression-free.

## Review outcome

The stage-1..N implementation was read end to end against `docs/KB Code
Standards.md` (MARK JSDoc + runnable `@example`, labelled destructured
params, co-located tests, functional style, no design-pattern language in
new code). Diffed against the merge-base with `main` (not `main` itself —
main has since merged an unrelated `filterTaskFiles` PR-review feature that
this branch never had; confirmed NOT a regression of this task).

## Fixes made in this stage

1. `deploy/uninstall.sh` — fail-safe hardening of the destructive path:
   `--install-dir` is now normalized (trailing slashes stripped, symlinks
   resolved via `pwd -P` when the dir exists), and the guard refuses `/`,
   `$HOME`, **and any ancestor of `$HOME`** (e.g. `--install-dir ~/` or
   `/home` previously slipped past the exact-match guard while `--purge`
   could `rm -rf` it). `--purge` now requires `docker-compose.yml` PLUS
   `.env` or `release-manifest.json` (install.sh always writes all three),
   so a directory that merely happens to hold one marker (a source
   checkout with only `docker-compose.yml`) is never purged.
2. `deploy/install.sh` — `--adopt-from` container-path translation now
   honors `KAINBAIN_PROJECTS_CONTAINER_PATH` (same override the compose
   template reads) instead of hardcoding `/workspace/projects`.
3. `api/project/seedDemo.js` + `api/index.js` — the `KAINBAIN_SEED_DEMO`
   seed is now one-time per install: a `seed-demo.json` marker in the
   engine state dir (host state dir via compose; removed by
   `uninstall.sh --purge`) suppresses re-seeding, so deleting all projects
   on purpose does not resurrect the Welcome Tour on next boot.
4. Tests added: uninstall guard cases (home, trailing-slash home, ancestor
   of home, symlink-to-home, single-marker purge refusal, trailing-slash
   normalization), install `--adopt-from` container-path override,
   registry handover cases (revoke+re-approve collectible by the same boot
   nonce; public payloads never expose `credential`/`joinNonce`/
   `credentialExposed`), seed marker cases (written 0600 on success,
   suppresses later empty-store boots, directory marker counts as seeded).

## Deliberately NOT changed

- `deny`/`revoke` keep the stored join nonce: the nonce is immutable once
  set so a same-boot Runner can collect a re-issued credential, and a
  restarted Runner (new nonce) safely falls back to the manual paste (D2).
  Clearing the nonce on revoke was tried and rejected — it would break the
  same-boot re-approval handover without enabling the restarted one.

## Verification (all green, this checkout)

- `api` vitest: 395 files / 6473 passed (exit 0)
- `frontend` vitest: exit 0 (full suite)
- `runner` node --test (16 files): exit 0
- `npm run lint` (api + frontend): 0 errors
- `npm run docs:check`: PASS (doc links + jsdoc-@example baseline)
- `deploy/*.test.sh` (install, install-runner, redeploy, uninstall,
  update, homelab-pull): ALL PASS, incl. the new guard/parity cases

Canary e2e was not re-run here: the last two CI canary failures were
environmental (scratch port 3399 still held by an orphaned process from a
killed 24-min run; the preflight correctly refused to kill an
unrecognized pid — fail-safe by design). No canary files were touched by
this task.
