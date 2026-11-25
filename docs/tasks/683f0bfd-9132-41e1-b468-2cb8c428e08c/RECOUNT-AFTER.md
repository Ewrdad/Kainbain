# RECOUNT — AFTER (scheduled follow-up, still pre-rollout)

Task `683f0bfd-9132-41e1-b468-2cb8c428e08c` (S5). Run 2026-11-24T02:15:08–37Z by
`bin/fleet-recount.sh after .` against `http://192.168.1.206:3100`, project
`0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (81 tasks). Raw per-task payloads:
`raw/after/*.json` (81 files). Meta:
`recount-after-meta.json` (81 fetched, 0 failed; `recount-after-errors.jsonl`
empty). Machine table: `recount-after-table.json`; rows: `recount-after.jsonl`;
E5 worklist: `recount-after-e5worklist.json` (35 interrupts / 22 tasks). Stdout/stderr:
captured in runner log stream (frozen kit, same as BEFORE).

This run was executed **while still NOT-CONVERGED** — the scheduled AFTER
follow-up per `BASELINE.md` gates on both runners CONVERGED, but the
blocking prerequisite (raise `KAINBAIN_RUNNER_RECOMMENDED_VERSION` to `0.2.1`)
has not landed, so no runner can nudge. The recount is therefore a
second observation window, not a post-converge proof. Values below are the
fleet state on 0.1.0 at 2026-11-24T02:15Z. S5 gates are evaluated against
post-converge interrupts only; with no converge timestamp, the gate
verdict is **cannot pass yet** — see `Baseline gate` row.

## WIDE_NET §2 table — BEFORE vs AFTER (same scope, both pre-rollout)

| Signal | 11-21 baseline (61 tasks, WIDE_NET §2) | BEFORE 2026-11-23T11:46Z (81 tasks) | AFTER 2026-11-24T02:15Z (81 tasks) |
|---|---|---|---|
| Runner-path interrupts | 118 | 149 | **149** |
| With `Reason:` | 49 (all cap) | 72 | **70** |
| Bare (no reason) | 69 | 77 | **79** |
| ≤15 s after `started` | 99 (median 4.7 s) | 125 (median 4 s) | **118 (median 4 s)** |
| ≥2 min after `started` | 15 | 18 | **23** |
| Post-`finished` interrupts (E5 scope) | — | 28 (20 tasks) | **35 (22 tasks)** |
| `Auto-resumed after server restart` | 100 | 125 | **125** |
| Server-restart interrupts | 0 | 0 | **0** |
| `Execution recovered after server restart` | 0 | 0 | **0** |
| Death-streak escalations | 42 | 49 | **49** |
| Per-runner split | local-alpha 96 / server2-alpha 22 | local-alpha 108 / server2-alpha 41 | **local-alpha 103 / server2-alpha 46** |
| Tasks with `gitFailureStreak` | — | 0 | **0** |

`reason_vocabulary` (26 distinct cap strings, 2026-11-24T02:15Z): every
string is the Cause-1 workdir-cap format
(`Runner workdir unavailable: Worktree cap reached (~5); …`). Count 26
vs BEFORE's 24 (net +2 from history churn: 3 new cap strings accrued,
1 fell off retained histories — all still Cause-1 format); the full list
in `recount-after-table.json` is
machine-verified to contain zero non-cap reasons (checked with
`jq -r '.reason_vocabulary[]' | grep -vc "Runner workdir unavailable:"`
→ 0). Negative control still holds: on still-deployed 0.1.0 runners, no
non-cap reason is ever emitted; all 79 bare + 70 cap are exactly as
expected on 0.1.0. This re-confirms "until the 0.2.x build lands, every
new interrupt is still bare" — see §Convergence below.

Non-monotonicity: BEFORE→AFTER total held at 149 despite ~14 h of new
interrupts, because `history` arrays churn as tasks complete/advance
(the AFTER table counts rows in each task's *current* history, not a
cumulative counter). Per-runner drift local 108→103 / server2 41→46
sums to the same total; the 7 net-new post-`finished` interrupts (§E5
below) accrued on server2-alpha (the 413 loop) while older rows fell
off retained histories on local-alpha. The comparison MUST stay
timestamp-gated at each runner's converge time (plan §4.2); canonical
BEFORE tables above are untouched.

## Runner versions at AFTER time

`bin/runners-snapshot.sh runners-after` →
`runners-after/runners-20261124T021506Z.{json,tsv}`,
`deploy-status-20261124T021506Z.json`, `verdict-20261124T021506Z.{json,txt}`:

- `local-alpha` active, `runnerVersion 0.1.0`, build `fbcf8442ee031e2edbc9f0b30195afa410296cf3`
  (built 2026-11-14) — `git merge-base --is-ancestor 046a6391 fbcf8442…` → **NO** →
  NOT-CONVERGED.
- `local-bravo` active, same 0.1.0 build (not a named S5 runner).
- `server2-alpha` active, `runnerVersion 0.1.0`, **no build sha reported** →
  verdict "cannot verify the fix is in the running build" → NOT-CONVERGED.
- Fleet knobs at AFTER: `recommendedVersion 0.1.0`, `minimumVersion 0.1.0`,
  `availableVersions ["0.1.0"]`, `updateAvailable false`, `pendingCommands []`
  on all active runners — **no update nudge pending** at 02:15Z.
- Backend: `GET /deploy/status` build **637**, deployed 2026-11-24T01:05:11Z
  (publish-only, `lastResult.headSha e85d88a3bc07d87021c7bfc1b19976ad9e078023`,
  "Publish-only deploy (registry + dist) complete", started 2026-11-24T00:49:39Z,
  finished 01:04:00Z). `engine.updatedAt` unchanged — no restart confound;
  `server_restart` stays 0.
- Tag verification re-confirmed live: `runner-v0.2.0` NO, `runner-v0.2.1` YES,
  `main` YES for `046a6391`; `runner/version.json` at HEAD reads `0.2.1`
  after this branch merged `main` (merge `cd9b26a2`).

Per-runner converge timestamps: **none** — both remain NOT-CONVERGED.
`bin/runners-snapshot.sh runners-after --require-converged` would exit 3
(not taken; same verdict reached via `runners-after/verdict-…`).

## E5 — post-`finished` isolates (GUIDE-05 §4 scope, AFTER)

Canonical worklist `recount-after-e5worklist.json` (35 rows, 22 tasks)
is 7 rows larger than BEFORE/2026-11-23T11:46Z (28 rows). Diff vs BEFORE
(`comm` on sorted `ts` sets) shows **7 net-new post-`finished`
interrupts, 0 removed** (verified monotonic across windows: BEFORE 28 →
mid 34 → AFTER 35, 0 removed at every step; churn affects other history
rows, not the post-`finished` ts set):

| # | interrupt ts (UTC) | runner | task | Δ from started |
|---|---|---|---|---|
| N1 | 2026-11-23T11:48:18.916Z | server2-alpha | 7f6220c3 | 182 s |
| N2 | 2026-11-23T11:50:46.895Z | server2-alpha | 7f6220c3 | 111 s |
| N3 | 2026-11-23T11:56:30.966Z | server2-alpha | 7f6220c3 | 305 s |
| N4 | 2026-11-23T12:12:38.745Z | server2-alpha | 7f6220c3 | 145 s |
| N5 | 2026-11-23T12:16:09.780Z | local-alpha | 7f347a7a | 290 s |
| N6 | 2026-11-23T13:01:05.843Z | server2-alpha | 44125086 | 116 s |
| N7 | 2026-11-24T01:26:44.019Z | server2-alpha | 7f6220c3 | 360 s |

Sweep: `bin/e5-sweep.sh local` + `E5_WORK_ROOT=/home/server2/.kainbain/runner-work
E5_UNIT=kainbain-runner-server2-alpha E5_ORIGIN_REPO=…/mirrors/Kainbain
bash bin/e5-sweep.sh local 7f6220c3 44125086 7f347a7a` (host is server2-alpha
itself; `server2` ssh path requires `~/.passwrd` and was not invoked —
substituted with local probe on the same host, same work root and
journal). Output files:
`raw/e5-sweep-after-local.txt`, `raw/e5-sweep-after-server2-local.txt`,
plus the ssh-mode error stub `raw/e5-sweep-after-server2.txt` (PROBE FAILED
/ password file missing — expected on this host; the local-equivalent
run is the authoritative evidence).

Coarse verdict (GUIDE-05 §4: stage-output-commit PRESENT → Cause 2/4
territory; absent → Cause 5 suspect) per `bin/e5-sweep.sh` was
**PRESENT for all three prefixes** on the server2 host work root and
mirror refs. Journal window-match is decisive where available
(plan §2.2/2.3) and re-classifies the 5 classified rows:

| new row | coarse (stage-output) | journal window (server2-alpha `Runner failed:` …) | final class |
|---|---|---|---|
| N1 11:48:18 7f6220c3 | PRESENT (`cc…` history) | `Runner failed: Backend 413 on /tasks/7f6220c3-…/complete-execution` 11:48:18 (committed `f2e66547…`, pushed:true) | **Cause 2** (413, post-commit payload limit) |
| N2 11:50:46 7f6220c3 | PRESENT | 413 same second | Cause 2 |
| N3 11:56:30 7f6220c3 | PRESENT | 413 + `Committed 971a28c5… (pushed: true, base was f2e6654)` | Cause 2 |
| N4 12:12:38 7f6220c3 | PRESENT | 413 + `Committed 1fb31854… (pushed: true)` | Cause 2 |
| N6 13:01:05 44125086 | PRESENT (`e0cde7ef` landed 13:01:04) | `merging origin/kb/44125086… into kb/44125086… conflicts (…/SURVEY.md) — refusing to resolve on the push path` | **Cause 5 MERGE_CONFLICT (covered by `046a6391`)** |
| N5 12:16:09 7f347a7a | PRESENT (`fbc0457e` is the *retry* commit 12:57:25, not this window) | no server2-alpha journal line (interrupt is `local-alpha`); local-alpha host `192.168.1.206` unreachable from server2 (no key auth); origin window `[finished 12:16:06, +30s]` has NO stage-output commit; no recovery branch | **Evidence gap** (Cause-5-suspect, unproven) — coarse PRESENT is a false positive (the only stage-output in origin window is the 41-min-later retry) |
| N7 01:26:44 7f6220c3 | PRESENT (HEAD `c68de47b` + merge `fec8f7eb`) | `Runner failed: Backend 413 on …/complete-execution` 01:26:44 | **Cause 2** (still 0.1.0, still looping) |

Plus the four seed prefixes required by the task (`158394ab`, `db49d6c6`,
`1cae113f`, `7f6220c3`) re-verified PRESENT via origin refs on the mirror
(`raw/e5-sweep-after-local.txt` 02:15:48Z run: all VERDICT
`stage-output commit PRESENT → Cause 2/4 territory`), with
`db49d6c6`/`158394ab`/`1cae113f` still reaped on server2 (absent worktrees,
PRESENT on `refs/heads/kb/…` + `refs/remotes/origin/kb/…`).
`kb-158394ab`, `kb-db49d6c6`, `kb-1cae113f` worktrees remain absent
(reaped 11-20 "Orphaned workdirs" lines); classification for their
original post-`finished` interrupts rests on origin refs + journals per
the fallback chain (see `E5-SWEEP.md`).

### Ticket decision (RESPONSE.md S5 step 3, re-confirmed on AFTER)

`shared/gitFailure/isDeterministicGitFailure.js` returns true exactly for
`hook-rejected`, `commit-failed`, `merge-conflict` (verified at HEAD);
`buildGitFailureDetails` defaults unattributed commit failures (e.g.
`git index.lock is held`) to `commit-failed`. Every classified AFTER
post-`finished` row is either one of those three covered classes or Cause 2
(413, backend payload limit — S2 territory). The 1 gap row (`7f347a7a`
12:16Z) is unclassified, not an uncovered class.

**No commit-loop case outside the covered classes was found → NO new
Cause-5 code ticket is created** (second consecutive sweep). The 046a6391
rollout (`runner-v0.2.1`) is still expected to convert the deterministic
cases into single FAILED completions with `gitFailure` payloads instead of
crash-loops; it has not landed yet (fleet still 0.1.0), so the 413 loop
continues (N7 is the 7th consecutive 413 on `7f6220c3` since 11-23).

## S5 gates — post-converge evaluation (all CONVERGENCE-BLOCKED)

Gates evaluated on post-converge interrupts only (plan §4.2). With zero
converge timestamps, the only honest verdict is **BLOCKED**, not
PASS/FAIL.

| Gate (ImplementationPlan §Success criteria 3) | AFTER verdict | Evidence |
|---|---|---|
| Bare → ~0 on new interrupts | **BLOCKED — 79 bare on 0.1.0** | `recount-after-table.json` bare 79 (BEFORE 77); reason vocab 100% cap (0 non-cap). Negative control holds; no post-converge interrupts exist to gate. |
| Reasons name Causes 1/3/4 | **BLOCKED — Cause 1 only** | All 70 reasoned are `Runner workdir unavailable:` (Cause 1). Zero setup-fault (Cause 3) or transient 502/fetch-fail (Cause 4) reasons emitted by 0.1.0 — expected; 0.2.x emits those strings. |
| Deterministic commit failures surface as FAILED + `gitFailure`, never interrupts | **BLOCKED — 0 `gitFailure` streaks, commit-loop interrupts still accrue** | `tasks_with_git_failure_streak` 0; N6 (`44125086` merge-conflict) is still an interrupt; 7f6220c3 413s are still interrupts (not FAILED). No FAILED-with-`gitFailure` completions in window. |

## Confound ledger (for S1–S4 attribution)

- Backend build 637 entire AFTER window, publish-only, no restart
  (Cause 6 shut, `server_restart` 0).
- S1 (`3b82f6ae`, cap-refusal counting + re-dispatch backoff) merged to
  `main` `e85d88a3` and now in this branch via `cd9b26a2`, but **no runner
  runs it** — cap refusals still count as interrupts on 0.1.0. AFTER
  recount does not claim S1 wins.
- S4 (`78eac844`, transient-error non-fatal) merged `65580333`, also in
  `runner-v0.2.1` (same merge) — no runner runs it; "no more crash-restart
  on 502/fetch-fail" must not be attributed to S5.
- S2 backend 413 limit (`d164fb3f`) not landed — 413 loop still live
  (N7).

## Baseline for S1–S4 (post-rollout half of S5)

This file + `BASELINE.md` (BEFORE half) + `runners-after/` snapshot
constitute the S1–S4 reference pair. Because rollout has not happened,
the reference remains a **pre-rollout baseline** at 2026-11-24T02:15Z:
149 interrupts, 79 bare, 35 post-`finished`, 0 `gitFailure`, 0
server-restart, backend 637, all runners 0.1.0. When the knob is raised
and both named runners converge, the scheduled follow-up in `BASELINE.md`
must re-run with timestamp gating per runner and re-evaluate the three
gates above on post-converge interrupts only. Do not quote the AFTER
table as a rollout proof while `verdict-…` says NOT-CONVERGED.

## Re-run commands (frozen kit, identical for the gated AFTER)

```bash
cd docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c
bash bin/runners-snapshot.sh runners-after2 --require-converged   # exit 0 only when both named runners converged
bash bin/fleet-recount.sh after2 .                                 # -> recount-after2-table.json etc.
bash bin/e5-sweep.sh local  <prefixes...>                         # E5 sweep, local host
E5_WORK_ROOT=/home/server2/.kainbain/runner-work E5_UNIT=kainbain-runner-server2-alpha E5_ORIGIN_REPO=/home/server2/.kainbain/runner-work/mirrors/Kainbain bash bin/e5-sweep.sh local <prefixes...>  # server2 host
bash bin/tests/run-tests.sh                                       # kit self-tests (95 checks)
```
