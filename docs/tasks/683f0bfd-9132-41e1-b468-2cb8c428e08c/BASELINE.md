# BASELINE — post-BEFORE reference for S1–S4 (S5 q3-fallback record)

This is the "before" half of the rollout proof, frozen 2026-11-23 while all
runners are still `0.1.0`. The AFTER half is a scheduled follow-up (see
below); until the blocking prerequisite lands, every new interrupt is still
emitted by pre-fix builds. S1/S6 confirm against this file + their own
deploys; prod CONFIRMATION of S3/S4/S2-runner-half unblocks only after the
AFTER run.

## Frozen state (2026-11-23)

- **Runners** (11:46:12Z + 12:22:51Z snapshots, `runners-before/` +
  `runners-now/`): `local-alpha` / `local-bravo` / `server2-alpha` all
  `0.1.0`; local-* build `fbcf8442` (2026-11-14, fix NOT in build);
  server2-alpha reports no build sha; knob `recommendedVersion 0.1.0`,
  `availableVersions ["0.1.0"]`, no nudges pending. Verdict: NOT-CONVERGED.
- **Backend**: build 637, `deployedAt` 2026-11-23T11:36:08Z (publish-only
  refresh; `lastResult.headSha 65580333…`, "Publish-only deploy
  (registry + dist) complete").
- **Release tags**: `runner-v0.1.0` = `ae175528` (11-05);
  `runner-v0.2.0` = `8460e4a8` (11-19) — does NOT contain `046a6391`
  (`merge-base --is-ancestor` → rc=1; `shared/gitFailure.js` absent at tag);
  **`runner-v0.2.1`** (cut 11:30:02Z from main `65580333`) — DOES contain
  `046a6391` (merge-base YES, `shared/gitFailure.js` present).
  Note: `0.2.1` also bundles S4's transient-error tolerance (same merge) —
  see the confound ledger in `RUN-LOG.md`.
- **Counts** (project `0fd41821`, 81 tasks, fetched 11:46:49–55Z — see
  `RECOUNT-BEFORE.md`): 149 runner interrupts (108 local / 41 server2),
  72 reasoned (all workdir-cap), 77 bare, 125 ≤15 s (median 4 s), 18 ≥2 min,
  28 post-`finished` (20 tasks), 49 escalated,
  0 server-restart, 125 auto-resumed, 0 `gitFailure` streaks.
- **E5** (see `E5-SWEEP.md`): 28/28 post-`finished` interrupts classified —
  20 × deterministic git failure in `046a6391`-covered classes
  (19 MERGE_CONFLICT + 1 COMMIT_FAILED `index.lock`), 8 × Cause 2
  (`7f6220c3` HTTP 413s on server2-alpha — S2 territory, ticket `d164fb3f`).
  Ticket decision: **no new Cause-5 code ticket** (no uncovered class found).
- **Open evidence gaps**: (a) `kb-158394ab` / `kb-db49d6c6` / `kb-1cae113f`
  worktrees reaped on server2 (their interrupts rest on origin refs + local
  worktrees + journals per the fallback chain); `kb-7f6220c3` on server2
  reaped/recreated 11:38Z (11-20 commits attested by journal, not worktree);
  (b) server2-alpha reports no build sha, so its verdict stays
  "cannot verify" until it does; (c) pre-11-19 server2 journal fetched as
  targeted windows only (full fetch over ssh too slow).

## Blocking prerequisite (human PROD-ACTION, before any AFTER run)

1. ~~Cut NEW tag from a commit ≥ `7ac148ce`~~ — DONE: `runner-v0.2.1`
   (from `65580333`; merge-base YES). Never move `runner-v0.2.0`.
2. Raise `KAINBAIN_RUNNER_RECOMMENDED_VERSION` to `0.2.1` (runbook step 5).
   Record old→new + timestamp in `RUN-LOG.md`.
3. Wait for idle converge (≤ daily nudge per runner; never force-restart).

## AFTER follow-up procedure (scheduled run, same kit)

```sh
D=docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c
bash "$D/bin/runners-snapshot.sh" "$D/runners-after" --require-converged
bash "$D/bin/fleet-recount.sh" after "$D"
bash "$D/bin/e5-sweep.sh" local   $(cat "$D/raw/e5-tasks.txt") > "$D/raw/e5-sweep-after.txt" 2>&1
bash "$D/bin/e5-sweep.sh" server2 $(cat "$D/raw/e5-tasks.txt") > "$D/raw/e5-sweep-server2-after.txt" 2>&1
bash "$D/bin/tests/run-tests.sh"  # must print RESULT: 71 passed, 0 failed
```

Then write `RECOUNT-AFTER.md`: split new interrupts at each runner's converge
timestamp (from `runners-after/verdict-*.txt`) and evaluate the S5 gates on
post-converge interrupts only — bare → ~0; reasons name Causes 1/3/4;
deterministic commit failures arrive as FAILED + `gitFailure` with NO
interrupt row. Record backend build + sibling-fix landings as confounds.

## Watch note 2026-11-24T02:15Z (AFTER observation, still pre-rollout; frozen numbers above stand)

- Snapshot `runners-after/…T021506Z.*` (02:15:06Z): still `0.1.0` everywhere,
  knob `0.1.0`, `availableVersions ["0.1.0"]`, no nudges — NOT-CONVERGED;
  backend build 637, deployed `2026-11-24T01:05:11Z` (publish-only, `headSha
  e85d88a3…`, no restart). Tag/`version.json` re-verified (`runner-v0.2.1`
  contains `046a6391`; HEAD `runner/version.json` reads `0.2.1` after merge
  `cd9b26a2`).
- AFTER recount `recount-after-*` (02:15:08–37Z): 149 interrupts (103/46),
  70 reasoned (all cap), 79 bare, 35 post-`finished` (22 tasks), 49 escalated,
  0 server-restart, 0 `gitFailure`. Total unchanged due to history churn;
  7 net-new post-`finished` rows vs BEFORE — 5× Cause 2 413s (`7f6220c3`
  incl. 2026-11-24T01:26:44Z), 1× covered MERGE_CONFLICT (`44125086`
  13:01:05Z), 1× evidence gap (`7f347a7a` 12:16:09Z). See `RECOUNT-AFTER.md`
  + `E5-SWEEP.md` §addendum. No new Cause-5 ticket.
- Branch merged `main` (`cd9b26a2`, 0-behind, no conflicts). Kit suite
  `95 passed, 0 failed`. See `RUN-LOG.md` 2026-11-24 entry.
- S5 gates all **BLOCKED (not converged)** — do not quote `recount-after-*`
  as rollout proof; the gated AFTER still waits on the knob raise.

## Watch note 2026-11-24T02:40Z (AFTER2 observation, still pre-rollout; frozen numbers above stand)

- Snapshot `runners-after/…T024024Z.*` (02:40:24Z): still `0.1.0` everywhere,
  knob `0.1.0`, `availableVersions ["0.1.0"]`, no nudges — NOT-CONVERGED;
  backend build 637, deployed `2026-11-24T01:05:11Z` (publish-only, no
  restart).
- AFTER2 recount `recount-after2-*` (02:40:27–55Z): 149 interrupts (102/47),
  70 reasoned (all cap), 79 bare, 36 post-`finished` (22 tasks), 49 escalated,
  0 server-restart, 0 `gitFailure`. Per-task counts identical to AFTER;
  1 net-new post-`finished` row (`7f6220c3` 2026-11-24T02:38:01Z, bare,
  Cause 2 413 — 8th consecutive). See `RECOUNT-AFTER2.md`. No new Cause-5
  ticket (third consecutive sweep). Kit suite 95/95. Stage review
  `STAGE-REVIEW-20261124.md`: PASS.
- S5 gates all **BLOCKED (not converged)** — do not quote `recount-after2-*`
  as rollout proof; the gated AFTER still waits on the knob raise.

## Watch note 2026-11-23T14:31–14:45Z (non-canonical; frozen numbers above stand)

- Snapshot `runners-now/…T143103Z.*`: still `0.1.0` everywhere, knob `0.1.0`,
  `availableVersions ["0.1.0"]`, no nudges — NOT-CONVERGED; backend build 637.
- Mid recount `recount-mid-1431-*` (14:32:40–14:33:06Z): 148 interrupts, 0
  non-cap reasons, 9 newer than BEFORE (5 bare + 4 cap, all 0.1.0).
  Total dipped 149→148: task `history` arrays churn as tasks advance, so the
  recount is a point-in-time snapshot — AFTER stays timestamp-gated (§4.2).
- E5 addendum (`E5-SWEEP.md`): 6 newer post-`finished` rows → 4× Cause 2
  (413), 1× covered MERGE_CONFLICT, 1× evidence gap (`7f347a7a` 12:16Z,
  206-host journal unreachable from server2). No new Cause-5 ticket.
- Reported CI `Linting (frontend)` failure (`…-133841`) does not reproduce on
  HEAD `3bb0e68f` (lint 0 errors; only frontend delta is the 1-line test
  de-flake). Kit suite 71/71. See `RUN-LOG.md` 14:28–14:45 entry.

## Kit map (all under this task folder)

`IMPLEMENTATION_PLAN.md` (corrected) · `SURVEY.md` · `RUN-LOG.md` ·
`RECOUNT-BEFORE.md` · `E5-SWEEP.md` · `BASELINE.md` (this file) ·
`bin/fleet-recount.sh` · `bin/runners-snapshot.sh` · `bin/e5-sweep.sh` ·
`bin/server2-ssh.sh` · `bin/lib.sh` · `bin/jq/*` · `bin/tests/run-tests.sh` +
`mock-api.py` · `runners-before/` · `runners-now/` · `runners-review/` ·
`recount-before.*` · `raw/` (evidence + `tests-run-*.log`).
