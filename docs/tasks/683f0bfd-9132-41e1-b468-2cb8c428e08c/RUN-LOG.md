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
- **12:37–13:05** — CI fast-gate `…-123714`: all twelve fast branches PASS
  (incl. the de-flaked `useOnboarding` suite); canary 138/140 — 2 failed in
  `tests/task-lifecycle.spec.js` (`submit -> kanban placement -> advance ->
  complete`, `clicking a card opens the slide-over task inspector`), both with
  `page.goto: Target page, context or browser has been closed` in
  `waitForAppReady` (helpers.js:65). Branch adds zero product code vs base
  `7ac148ce` (only the 1-line unit-test de-flake, which does not ship to the
  canary build), so these cannot be regressions from this task.
- **13:06:07** — Fresh read-only snapshot (`runners-now/`, `…T130607Z.*`):
  **still `0.1.0` everywhere, knob `0.1.0`, `availableVersions ["0.1.0"]`, no
  nudges** — verdict NOT-CONVERGED for both named runners; backend still
  build 637 (no restart). AFTER recount remains blocked on the human
  PROD-ACTION (raise knob to `0.2.1`); no knob change, no restarts, no reaps
  performed (observe-only, q9).
- **13:08** — Flake confirmation: `tests/task-lifecycle.spec.js` re-run solo
  on its scratch stack → **4 passed (1.1m)**, including both CI-failed tests.
  BEFORE-table re-verified against `recount-before-table.json` (149/72/77,
  125 ≤15s median 4s, 28 post-`finished`, 49 escalated, 0 server-restart,
  0 `gitFailure`, per-runner 108/41, 24/24 vocab cap strings) — matches
  `RECOUNT-BEFORE.md` + `BASELINE.md` exactly.
- **14:28–14:45** — This run (server2-alpha, stage 5 re-run after CI report of a
  `Linting (frontend)` failure in fast-gate `…-133841`, verdict dir not present
  on this checkout):
  - **Lint**: `npm run lint --prefix frontend` → **0 errors** (221 warnings,
    pre-existing); the two touched files (`useOnboarding.js`,
    `useOnboarding.test.js`) lint clean individually. The reported failure does
    NOT reproduce on HEAD `3bb0e68f` — it matches the already-reverted 12:07
    out-of-scope hook edit (`react-hooks/set-state-in-effect`), reverted 12:27;
    the branch's only remaining frontend delta vs `7ac148ce` is the 1-line
    test-only de-flake. No fix needed; nothing changed.
  - **De-flaked test**: `npx vitest run src/hooks/useOnboarding.test.js` →
    4/4 pass.
  - **Kit suite**: `bin/tests/run-tests.sh` → **71 passed, 0 failed** (log
    `raw/tests-run-20261123T143202Z.log`).
  - **Survey re-read**: task `SURVEY.md` answers unchanged (all recommended);
    source `RESPONSE_SURVEY.md` still `"answers": {}` → q9 gradual/no-restart
    stays a hard constraint.
  - **Fresh snapshot** (`runners-now/`, `…T143103Z.*`): **still `0.1.0`
    everywhere, knob `0.1.0`, `availableVersions ["0.1.0"]`, no nudges** —
    NOT-CONVERGED both named runners; backend still build 637, `deployedAt`
    11:36:08Z, headSha `65580333` (no restart). AFTER stays blocked on the
    human PROD-ACTION (raise knob to `0.2.1`).
  - **Mid recount** (`fleet-recount.sh mid-1431`, fetched 14:32:40–14:33:06Z,
    81/81 tasks, 0 failed → `recount-mid-1431-table.json`): 148 runner
    interrupts (103 local / 45 server2), 70 reasoned, 78 bare, 118 ≤15s
    (median 4s), 22 ≥2min, 34 post-`finished`, 49 escalated, 0 server-restart,
    0 `gitFailure`, reason vocabulary 100% workdir-cap strings (0 non-cap).
    9 interrupts are newer than the canonical BEFORE (11:46:55Z): 5 bare +
    4 cap-reasoned, all on 0.1.0 — negative control holds.
  - **Non-monotonicity note**: the total dipped 149→148 although time passed,
    because the recount counts rows in each task's CURRENT `history` array,
    which churns as tasks advance (8 tasks changed status/shape in-window;
    e.g. this task 5→1, `8c7e2d15` 1→0 on failed→in_stage). The recount is a
    point-in-time snapshot, not a cumulative counter — the AFTER comparison
    MUST stay timestamp-gated at each runner's converge time (plan §4.2), as
    already specified. Canonical BEFORE (`recount-before-*`, 11:46Z) untouched.
  - **E5 extension** (6 new post-`finished` interrupts, see `E5-SWEEP.md`
    addendum): 4× `7f6220c3` server2-alpha bare → Cause 2 (pushed:true commit
    + `Backend 413 on complete-execution` in-window, journal-decisive); 1×
    `44125086` 13:01:05Z server2-alpha bare → Cause 5 MERGE_CONFLICT covered
    (push-path SURVEY.md conflict; local output `e0cde7ef` landed 13:01:04,
    push refused); 1× `7f347a7a` 12:16:09Z local-alpha bare → evidence gap
    (206-host worktree+journal unreachable from server2 — no key auth;
    origin window negative, no recovery branch). Ticket decision unchanged:
    **no new Cause-5 code ticket** (no uncovered commit-loop class found).
  - Observe-only held: zero knob changes, restarts, updates, reaps, re-runs.

## 2026-11-24 run diary (UTC, post-merge + AFTER observation)

- **02:15–02:16** — Branch synced with `origin/main` (merge `cd9b26a2`, 34 ahead /
  16 behind → 0 behind, no conflicts, ort strategy). Diff brings S1 cap-refusal
  counting + re-dispatch backoff (`e85d88a3`), S4 transient tolerance (`65580333`),
  and S7 boot-reconcile (`65b518e4`) into this branch; no product-code delta beyond
  those merges. Observe-only held.
- **02:15:06** — Fresh read-only snapshot (`runners-after/runners-20261124T021506Z.*`,
  `verdict-20261124T021506Z.{json,txt}`): **still `0.1.0` everywhere, knob `0.1.0`,
  `availableVersions ["0.1.0"]`, no nudges** — NOT-CONVERGED both named runners
  (local-alpha build `fbcf8442` lacks `046a6391`; server2-alpha no sha). Backend
  build 637, deployed `2026-11-24T01:05:11Z` (publish-only, `headSha
  e85d88a3…`, "Publish-only deploy (registry + dist) complete"; no restart —
  Cause 6 shut). Tag re-verified: `runner-v0.2.0` NO, `runner-v0.2.1` YES,
  `main` YES for `046a6391`; `runner/version.json` at HEAD now `0.2.1`.
  `--require-converged` would exit 3. AFTER stays blocked on the human
  PROD-ACTION (raise knob to `0.2.1`).
- **02:15:08–37** — AFTER recount (`fleet-recount.sh after`, 81/81 tasks, 0 failed
  → `recount-after-table.json`): 149 runner interrupts (103 local / 46 server2),
  70 reasoned (all `Runner workdir unavailable:` cap strings, 0 non-cap), 79 bare,
  118 ≤15 s (median 4 s), 23 ≥2 min, 35 post-`finished` (22 tasks), 49 escalated,
  0 server-restart, 125 auto-resumed, 0 `gitFailure`, per-runner 103/46. Total held
  at 149 (BEFORE 149) due to history churn — not a regression; §4.2 timestamp
  gating still required. See `RECOUNT-AFTER.md` + `recount-after-*`.
- **02:15:48–56** — E5 sweep (server2 host local probe, since ssh `server2`
  needs `~/.passwrd` which is absent): `e5-sweep.sh local 7f6220c3 44125086
  7f347a7a db49d6c6 158394ab 1cae113f` + `E5_WORK_ROOT/…/mirrors/Kainbain …
  e5-sweep.sh local 7f6220c3 44125086 7f347a7a` → all coarse PRESENT
  (`raw/e5-sweep-after-local.txt`, `raw/e5-sweep-after-server2-local.txt`;
  `raw/e5-sweep-after-server2.txt` is the password-guard stub). Journal
  window-match re-classifies the 7 new post-`finished` rows (35 total):
  5× Cause 2 413 (`7f6220c3` 11:48–12:12 + 01:26:44), 1× covered MERGE_CONFLICT
  (`44125086` 13:01:05), 1× evidence gap (`7f347a7a` 12:16:09, local-alpha host
  unreachable from server2). Ticket decision re-confirmed: **no new Cause-5
  code ticket**. Full table in `RECOUNT-AFTER.md` §E5.
- **02:16** — Kit suite `bin/tests/run-tests.sh` → **95 passed, 0 failed**
  (now 95 checks; 24 post-`e85d88a3` suite expanded). BEFORE-table cross-checks
  (T1/T10) still reproduce `recount-before-table.json` exactly.
- Observe-only held: zero knob changes, restarts, updates, reaps, re-runs.

- **02:40–02:42** — Third observation window (post-`UPGRADE-SAFETY` stage,
  docs-only): fresh read-only snapshot (`runners-after/runners-20261124T024024Z.*`,
  `verdict-20261124T024024Z.{json,txt}`): **still `0.1.0` everywhere, knob `0.1.0`,
  `availableVersions ["0.1.0"]`, no nudges** — NOT-CONVERGED both named runners
  (local-alpha build `fbcf8442` lacks `046a6391`; server2-alpha no sha). Backend
  build 637, deployed `2026-11-24T01:05:11Z` (unchanged since AFTER; publish-only,
  no restart). AFTER3 stays blocked on the human PROD-ACTION (raise knob to `0.2.1`).
- **02:40:27–55** — AFTER2 recount (`fleet-recount.sh after2`, 81/81 tasks, 0 failed
  → `recount-after2-table.json`): 149 runner interrupts (102 local / 47 server2),
  70 reasoned (all `Runner workdir unavailable:` cap strings, 0 non-cap), 79 bare,
  117 ≤15 s (median 4 s), 24 ≥2 min, 36 post-`finished` (22 tasks), 49 escalated,
  0 server-restart, 126 auto-resumed, 0 `gitFailure`. Total held at 149; per-task
  counts identical to AFTER (history churn only). See `RECOUNT-AFTER2.md`.
- **02:41:10** — E5 sweep for the 1 new post-`finished` row (N8 `7f6220c3`
  2026-11-24T02:38:01Z server2-alpha): coarse PRESENT (`33a558a5` origin 02:37:45);
  journal-decisive `Committed 33a558a5… (pushed: true)` + `Runner failed: Backend
  413 on …/complete-execution` same second → **Cause 2** (8th consecutive 413).
  Evidence: `raw/e5-sweep-after2-server2-local.txt` +
  `raw/journal-server2-alpha-after2-window.txt`. Ticket decision re-confirmed
  (third consecutive sweep): **no new Cause-5 code ticket**.
- **02:42** — Kit suite `bin/tests/run-tests.sh` → **95 passed, 0 failed**.
  Stage review `STAGE-REVIEW-20261124.md` (KB Code Standards, branch vs
  `origin/main`): docs-only diff, zero JS, kit documented + tested → PASS.
- Observe-only held: zero knob changes, restarts, updates, reaps, re-runs.

## Effective survey decisions (answers + live-data overrides)

| Q | Answer / decision |
|---|---|
| q1 knob | Answered "already set" — **WRONG, superseded by live data** (knob is `0.1.0` at 09:04/10:36/11:07/11:46/12:22/13:06Z). Task stays observe-only; the raise to `0.2.1` is a human PROD-ACTION recorded as the blocking prerequisite. |
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
