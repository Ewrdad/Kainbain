# RECOUNT — AFTER2 (third observation window, still pre-rollout)

Task `683f0bfd-9132-41e1-b468-2cb8c428e08c` (S5). Run 2026-11-24T02:40:27–55Z by
`bin/fleet-recount.sh after2 .` against `http://192.168.1.206:3100`, project
`0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (81 tasks). Raw per-task payloads:
`raw/after2/*.json` (81 files). Meta:
`recount-after2-meta.json` (81 fetched, 0 failed; `recount-after2-errors.jsonl`
empty). Machine table: `recount-after2-table.json`; rows: `recount-after2.jsonl`;
E5 worklist: `recount-after2-e5worklist.json` (36 post-finished rows / 22 tasks).

This run was executed **while still NOT-CONVERGED** — the scheduled AFTER
follow-up per `BASELINE.md` gates on both runners CONVERGED, but the
blocking prerequisite (raise `KAINBAIN_RUNNER_RECOMMENDED_VERSION` to `0.2.1`)
has not landed, so no runner can nudge. The recount is therefore a
third observation window, not a post-converge proof. Values below are the
fleet state on 0.1.0 at 2026-11-24T02:40Z. S5 gates are evaluated against
post-converge interrupts only; with no converge timestamp, the gate
verdict is **cannot pass yet** — see `S5 gates` row.

## WIDE_NET §2 table — BEFORE vs AFTER vs AFTER2 (same scope, all pre-rollout)

| Signal | BEFORE 2026-11-23T11:46Z (81 tasks) | AFTER 2026-11-24T02:15Z (81 tasks) | AFTER2 2026-11-24T02:40Z (81 tasks) |
|---|---|---|---|
| Runner-path interrupts | 149 | 149 | **149** |
| With `Reason:` | 72 | 70 | **70** |
| Bare (no reason) | 77 | 79 | **79** |
| ≤15 s after `started` | 125 (median 4 s) | 118 (median 4 s) | **117 (median 4 s)** |
| ≥2 min after `started` | 18 | 23 | **24** |
| Post-`finished` interrupts (E5 scope) | 28 (20 tasks) | 35 (22 tasks) | **36 (22 tasks)** |
| `Auto-resumed after server restart` | 125 | 125 | **126** |
| Server-restart interrupts | 0 | 0 | **0** |
| `Execution recovered after server restart` | 0 | 0 | **0** |
| Death-streak escalations | 49 | 49 | **49** |
| Per-runner split | local-alpha 108 / server2-alpha 41 | local-alpha 103 / server2-alpha 46 | **local-alpha 102 / server2-alpha 47** |
| Tasks with `gitFailureStreak` | 0 | 0 | **0** |

`reason_vocabulary` (24 distinct cap strings, 2026-11-24T02:40Z): every
string is the Cause-1 workdir-cap format
(`Runner workdir unavailable: Worktree cap reached (~5); …`). Verified with
`jq -r '.reason_vocabulary[]' | grep -vc "Runner workdir unavailable:"`
→ 0. Negative control still holds: on still-deployed 0.1.0 runners, no
non-cap reason is ever emitted; all 79 bare + 70 cap are exactly as
expected on 0.1.0. This re-confirms "until the 0.2.x build lands, every
new interrupt is still bare" — see §Convergence below.

Per-task interrupt counts are identical to AFTER (no per-task delta —
diffed `recount-after.jsonl` vs `recount-after2.jsonl`: 0 rows changed);
the total held at 149 despite ~25 min of new interrupts because `history`
arrays churn as tasks complete/advance. The comparison MUST stay
timestamp-gated at each runner's converge time (plan §4.2); canonical
BEFORE tables are untouched.

## Runner versions at AFTER2 time

`bash bin/runners-snapshot.sh runners-after` →
`runners-after/runners-20261124T024024Z.{json,tsv}`,
`deploy-status-20261124T024024Z.json`, `verdict-20261124T024024Z.{json,txt}`:

- `local-alpha` active, `runnerVersion 0.1.0`, build `fbcf8442ee031e2edbc9f0b30195afa410296cf3`
  (built 2026-11-14) — `git merge-base --is-ancestor 046a6391 fbcf8442…` → **NO** →
  NOT-CONVERGED.
- `local-bravo` active, same 0.1.0 build (not a named S5 runner).
- `server2-alpha` active, `runnerVersion 0.1.0`, **no build sha reported** →
  verdict "cannot verify the fix is in the running build" → NOT-CONVERGED.
- Fleet knobs at AFTER2: `recommendedVersion 0.1.0`, `minimumVersion 0.1.0`,
  `availableVersions ["0.1.0"]`, `updateAvailable false`, `pendingCommands []`
  on all active runners — **no update nudge pending** at 02:40Z.
- Backend: `GET /deploy/status` build **637**, deployed 2026-11-24T01:05:11Z
  (publish-only, `lastResult.headSha e85d88a3…`, unchanged since AFTER;
  no new deploy, no restart confound; `server_restart` stays 0).
- Tag verification re-confirmed live: `runner-v0.2.0` NO, `runner-v0.2.1` YES,
  `main` YES for `046a6391`; `runner/version.json` at HEAD reads `0.2.1`.

Per-runner converge timestamps: **none** — both remain NOT-CONVERGED.

## E5 — the 1 new post-`finished` row since AFTER

Diff: AFTER2 has 36 post-finished rows vs AFTER 35 — **1 net-new, 0 removed**:

| # | interrupt ts (UTC) | runner | task | Δ from started |
|---|---|---|---|---|
| N8 | 2026-11-24T02:38:01.630Z | server2-alpha | 7f6220c3 | 292 s |

Sweep: `E5_WORK_ROOT=/home/server2/.kainbain/runner-work
E5_UNIT=kainbain-runner-server2-alpha E5_ORIGIN_REPO=…/mirrors/Kainbain
bash bin/e5-sweep.sh local 7f6220c3` (this host is server2-alpha itself;
ssh `server2` path requires `~/.passwrd` and was not invoked). Output:
`raw/e5-sweep-after2-server2-local.txt`. Journal window:
`raw/journal-server2-alpha-after2-window.txt` (server2-alpha, 02:30–02:45Z).

| new row | coarse (stage-output) | journal window (server2-alpha) | final class |
|---|---|---|---|
| N8 02:38:01 7f6220c3 | PRESENT (origin `33a558a5` landed 02:37:45) | `Committed 33a558a5… (pushed: true)` 02:38:01 + `Runner failed: Backend 413 on /tasks/7f6220c3-…/complete-execution` 02:38:01 (same second) | **Cause 2** (413, post-commit payload limit — S2 territory) |

This is the 8th consecutive 413 on `7f6220c3` since 11-23 (6 on 11-20/21 +
02:38 today) — the loop is still live on 0.1.0, exactly as expected until
`runner-v0.2.1` lands and `d164fb3f` (S2 backend limit) follows.

### Ticket decision (RESPONSE.md S5 step 3, third consecutive sweep)

`shared/gitFailure/isDeterministicGitFailure.js` returns true exactly for
`hook-rejected`, `commit-failed`, `merge-conflict` (verified at HEAD).
The single new classified row is Cause 2 (413, backend payload limit —
S2's ticket `d164fb3f`, not a commit loop). The one standing gap row
(`7f347a7a` 12:16Z, 2026-11-23) remains unclassified, not an uncovered class.

**No commit-loop case outside the covered classes was found → NO new
Cause-5 code ticket is created** (third consecutive sweep: BEFORE 28/28,
AFTER 7/7, AFTER2 1/1).

## S5 gates — post-converge evaluation (all CONVERGENCE-BLOCKED)

Gates evaluated on post-converge interrupts only (plan §4.2). With zero
converge timestamps, the only honest verdict is **BLOCKED**, not
PASS/FAIL.

| Gate | AFTER2 verdict | Evidence |
|---|---|---|
| Bare → ~0 on new interrupts | **BLOCKED — 79 bare on 0.1.0** | `recount-after2-table.json` bare 79 (AFTER 79); reason vocab 100% cap (0 non-cap). Negative control holds; no post-converge interrupts exist to gate. |
| Reasons name Causes 1/3/4 | **BLOCKED — Cause 1 only** | All 70 reasoned are `Runner workdir unavailable:` (Cause 1). Zero setup-fault (Cause 3) or transient 502/fetch-fail (Cause 4) reasons emitted by 0.1.0 — expected; 0.2.x emits those strings. |
| Deterministic commit failures surface as FAILED + `gitFailure`, never interrupts | **BLOCKED — 0 `gitFailure` streaks, commit-loop interrupts still accrue** | `tasks_with_git_failure_streak` 0; N8 (`7f6220c3` 413) is still an interrupt. No FAILED-with-`gitFailure` completions in window. |

## Confound ledger (for S1–S4 attribution)

- Backend build 637 entire AFTER2 window, publish-only, no restart
  (Cause 6 shut, `server_restart` 0).
- S1 (`3b82f6ae`, cap-refusal counting + re-dispatch backoff) merged to
  `main` `e85d88a3` and now in this branch via `cd9b26a2`, but **no runner
  runs it** — cap refusals still count as interrupts on 0.1.0.
- S4 (`78eac844`, transient-error non-fatal) merged `65580333`, also in
  `runner-v0.2.1` (same merge) — no runner runs it.
- S2 backend 413 limit (`d164fb3f`) not landed — 413 loop still live (N8).

## Baseline for S1–S4

This file + `BASELINE.md` (BEFORE half) + `runners-after/` snapshot
(2026-11-24T02:40:24Z verdict) constitute the S1–S4 reference pair.
Because rollout has not happened, the reference remains a **pre-rollout
baseline** at 2026-11-24T02:40Z: 149 interrupts, 79 bare, 36
post-`finished`, 0 `gitFailure`, 0 server-restart, backend 637, all
runners 0.1.0. When the knob is raised and both named runners converge,
the scheduled follow-up in `BASELINE.md` must re-run with timestamp
gating per runner and re-evaluate the three gates above on
post-converge interrupts only. Do not quote the AFTER2 table as a
rollout proof while `verdict-…` says NOT-CONVERGED.

## Re-run commands (frozen kit, identical for the gated AFTER)

```bash
cd docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c
bash bin/runners-snapshot.sh runners-after --require-converged   # exit 0 only when both named runners converged
bash bin/fleet-recount.sh after3 .                               # -> recount-after3-table.json etc. (new label per window)
bash bin/e5-sweep.sh local  <prefixes...>                         # E5 sweep, local host
E5_WORK_ROOT=/home/server2/.kainbain/runner-work E5_UNIT=kainbain-runner-server2-alpha E5_ORIGIN_REPO=/home/server2/.kainbain/runner-work/mirrors/Kainbain bash bin/e5-sweep.sh local <prefixes...>  # server2 host
bash bin/tests/run-tests.sh                                       # kit self-tests (95 checks)
```
