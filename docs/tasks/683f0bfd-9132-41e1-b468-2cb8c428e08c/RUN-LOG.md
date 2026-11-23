# RUN-LOG — S5 rollout + recount (`683f0bfd`)

Task: `683f0bfd-9132-41e1-b468-2cb8c428e08c` (RESPONSE.md S5 of `2e663986`).
API base for all prod reads: `http://192.168.1.206:3100` (read-only GETs only).
Observe-only throughout: no restarts, updates, reaps, or re-runs (survey q9).
A parallel recovery branch (`kb-recovery/683f0bfd…/2026-11-23T12-17-57-167Z`)
holds an earlier draft of this log + `BASELINE.md`; this file is the canonical
record for this branch (newer BEFORE recount, fuller E5, fresh 12:22Z snapshot).

## 2026-11-23 run diary (all UTC)

- **08:14:22** — `SURVEY.md` Round 1 generated (q1–q4). Later answered: all
  four recommended options (q1 "already set — observe only", q2 full
  read-only approved, q3 wait-and-watch same-run, q4 same project
  `0fd41821` only). q1's answer is falsified by live data below.
- **09:04** — First BEFORE recount (pre-freeze script, 81 tasks): 145 runner
  interrupts, 70 reasoned, 75 bare. Superseded by the frozen-kit runs.
- **09:04:07** — `runners-before/` snapshot: all active runners `0.1.0`,
  `recommendedVersion 0.1.0`, `availableVersions ["0.1.0"]`, no nudges.
- **10:36:57** — Review read-only `GET /runners` → `runners-review/`:
  unchanged (0.1.0 everywhere, knob 0.1.0, no pending nudges).
- **10:37** — `GET /deploy/status`: backend build **637**, deployed
  2026-11-21T22:00:17Z, headSha `7ac148ce…` (backend carries the fix).
- **10:46:33** — Deep-review FAIL (`REVIEW-20261123T104633Z.md`, F1–F6):
  published `runner-v0.2.0` (`8460e4a8`, 2026-11-19) does NOT contain
  `046a6391` (merged 2026-11-21 09:38 in `7ac148ce`); knob still `0.1.0`;
  kit suite broken (T6 brace, `MOCK_BADJSON_ID` unbound); deliverables missing.
- **11:06:23–29** — Intermediate frozen-kit BEFORE recount: 149 interrupts
  (109 local / 40 server2), 73 reasoned, 76 bare. Superseded by 11:46Z.
- **11:14:07** — main `65580333` (S4 merge: transient backend errors non-fatal).
- **11:19–11:25** — CI fast-gate `…-111950`: frontend unit test
  `useOnboarding > stays idle until enabled flips true` failed (racy
  `waitFor` on `loading`, which never transitions on the enabled-flip path).
- **11:30:02** — NEW tag `runner-v0.2.1` cut from main `65580333`.
  Verified: `merge-base --is-ancestor 046a6391 runner-v0.2.1` → YES,
  `shared/gitFailure.js` present, `runnerVersion 0.2.1`. Fix-bearing
  release now exists — but the knob (below) was not raised with it.
- **11:30:35** — Publish-only deploy finished (registry + dist); live build
  number unchanged at 637.
- **11:36:08** — Backend build 637 `deployedAt` refreshed (publish-only);
  `lastResult.headSha 65580333…`, `engine.updatedAt 11:36:20Z`. No backend
  restart confound (`server_restart` stays 0).
- **11:46:12** — BEFORE runners snapshot (`runners-before/`, with verdicts):
  both named runners NOT-CONVERGED (local-alpha 0.1.0 build `fbcf8442`
  2026-11-14 lacks the fix; server2-alpha reports no sha).
- **11:46:49–55** — Canonical BEFORE recount (`bin/fleet-recount.sh before`,
  81/81 tasks, 0 failed): **149 runner interrupts (108 local-alpha /
  41 server2-alpha), 72 reasoned (all workdir-cap), 77 bare**, 125 ≤15 s
  (median 4 s), 18 ≥2 min, 28 post-`finished` (20 tasks), 49 escalated,
  0 server-restart, 125 auto-resumed, 0 `gitFailure` streaks. See
  `RECOUNT-BEFORE.md` + `recount-before-table.json`.
- **11:47–12:05** — E5 sweep both hosts + journal window joins → `E5-SWEEP.md`:
  28/28 post-`finished` interrupts classified (20 deterministic git failures
  in covered classes + 8 × Cause-2 413s on `7f6220c3`). Decision: **no new
  Cause-5 code ticket** (no uncovered commit-loop class found).
- **12:07:15** — Commit `c680d4df` (this branch HEAD at the time) included an
  out-of-scope prod edit (`frontend/src/hooks/useOnboarding.js`:
  `setLoading(true)` in effect) made while chasing the 11:19 test flake.
- **12:07–12:10** — CI fast-gate `…-120737`: frontend lint FAIL
  (`react-hooks/set-state-in-effect` on that edit — the only error).
- **12:22:51** — Fresh read-only snapshot (`runners-now/`): **still `0.1.0`
  everywhere, knob `0.1.0`, `availableVersions ["0.1.0"]`, no nudges** —
  verdict NOT-CONVERGED for both named runners. The `runner-v0.2.1` tag
  alone moves nothing; runbook step 5 (knob raise) is still pending.
- **12:27** — Kit suite `bin/tests/run-tests.sh` → **71 passed, 0 failed**
  (`raw/tests-run-20261123T122700Z.log`) after the T12 fix (skip the
  password-material grep when `$HOME/.passwrd` is absent + `grep -F`).
  Out-of-scope hook edit reverted (file matches `origin/main` byte-for-byte);
  the flaky test's `waitFor` now also waits for the asserted `summary`
  (1-line test-only de-flake; hook behavior unchanged).

## Effective survey decisions (answers + live-data overrides)

| Q | Answer / decision |
|---|---|
| q1 knob | Answered "already set" — **WRONG, superseded by live data** (knob is `0.1.0` at 09:04/10:36/11:07/11:46/12:22Z). Task stays observe-only; the raise to `0.2.1` is a human PROD-ACTION recorded as the blocking prerequisite. |
| q2 access | Full read-only approved and used (API + both journals + both work roots). |
| q3 wait | Answered "wait-and-watch same-run" — **cannot complete in this run**: convergence is impossible until the knob is raised. Adopted the **q3-fallback**: BEFORE + E5 now, AFTER as a scheduled follow-up (see `BASELINE.md`). |
| q4 scope | Same project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` only (81 tasks). |
| RESPONSE q9 | Hard constraint held: zero forced restarts / updates / reaps / re-runs. |

## Blocking prerequisite (PROD-ACTION, human only)

1. ~~Cut a NEW runner release from a commit ≥ `7ac148ce`~~ — DONE 11:30:02Z:
   `runner-v0.2.1` from `65580333` (merge-base YES). Never move `runner-v0.2.0`.
2. Raise `KAINBAIN_RUNNER_RECOMMENDED_VERSION` to `0.2.1` (runbook step 5).
   Record old→new + timestamp here when done. Until then no runner can
   converge: `availableVersions` stays `["0.1.0"]` and no nudge is sent.
3. Gate the follow-up AFTER run on: both named runners CONVERGED per
   `bin/runners-snapshot.sh <dir> --require-converged` (exit 0).

## Sibling-fix / confound ledger (for S1–S4 attribution)

- Backend build 637 for the whole BEFORE window (deployedAt refreshed
  11:36:08Z by a publish-only deploy; no restart — Cause 6 stays shut).
- `server_restart` 0 and `recovered_server_restart` 0 in the BEFORE recount.
- S1/S2/S4/S6 code fixes: none observed deployed in-window (cap refusals
  still bare-counted, 413s still crash-loop on 0.1.0, zero `gitFailure`
  streaks anywhere). S4 merged to main (`65580333`) but no runner runs it.
- `runner-v0.2.1` (from `65580333`) bundles S4's transient-error tolerance
  with the `046a6391` git-failure handling: the AFTER recount must attribute
  "no more crash-restart on 502/fetch-fail" to S4, not to S5 — S5's gates
  are bare→~0, reasons present, and FAILED+`gitFailure` instead of
  commit-loop interrupts.
