# E5 forensics sweep — post-`finished` interrupts (GUIDE-05 §4)

Task `683f0bfd-9132-41e1-b468-2cb8c428e08c` (S5 of `2e663986`), executed 2026-11-23
~11:47–12:05Z. **Read-only throughout**: no restarts, no updates, no reaps, no
re-runs (survey q9 hard constraint; this task's SURVEY.md q2 approves read-only
backend API + runner journals + worktree reads on both hosts).

## Method

1. **Worklist** (canonical): `recount-before-e5worklist.json` — 28 post-`finished`
   runner interrupts across 20 tasks, from the frozen-kit BEFORE recount
   (`bin/fleet-recount.sh before`, fetched 2026-11-23T11:46:49–55Z, project
   `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`, 81 tasks). Seeds `158394ab` and
   `1cae113f` have no post-`finished` interrupt in retained history and were still
   swept as exhibits. (`raw/e5-worklist-before.json` is the older flat-shaped
   worklist from the 09:04Z run — superseded; canonical = the grouped
   `recount-before-e5worklist.json`.)
2. **Worktree sweep** per host: `bin/e5-sweep.sh local|server2 <prefixes...>`
   (22 prefixes each). Stage-output detection is scoped to the task's own branch
   subject `^kb/$PREFIX.*stage output` (F5 fix from REVIEW-20261123T104633Z; pinned
   by test T7 incl. the cross-task false-positive case). Output:
   `raw/e5-sweep-before.txt` (local), `raw/e5-sweep-server2-before.txt` (server2 —
   no longer empty; ssh works via `bin/server2-ssh.sh`).
3. **Journal join**: full `journalctl --user -u kainbain-runner-local-alpha`
   (goes back to Oct 27; `raw/journal-local-alpha-full.txt`, 417k lines) and
   `journalctl --user -u kainbain-runner-server2-alpha --since 2026-11-19`
   (`raw/journal-server2-alpha-since-20261119.txt`) plus a targeted pre-11-19
   window fetch for `e1fb125a`. For each interrupt, the latest `Runner failed:`
   line on the matching host within [ts−240s, ts+10s] is the window match
   (`raw/e5-window-join-full.json`, merged → `raw/e5-final-classification.json`).
4. **Commit window join** (fallback for gaps): stage-output commits on
   `refs/heads|refs/remotes/origin/kb/<full-task>` with committer date inside
   [last `: finished` ≤ interrupt, interrupt+30s], subject scoped to the task
   (`raw/e5-window-commit-join.json`).

## Worktree / origin verdicts (coarse, GUIDE-05 §4 rule)

- **local host** (`/home/server/.kainbain/runner-work`, origin = this checkout):
  22/22 swept prefixes PRESENT (each task branch carries its own stage-output
  commits; e.g. `kb-7f6220c3` worktree on `kb-recovery/7f6220c3…/2026-11-23T08-25-33-708Z`
  shows `088c4436 … kb/7f6220c3-… stage-1787744723298: Runner local-alpha stage output`).
- **server2 host** (`/home/server2/.kainbain/runner-work`, mirror
  `…/mirrors/Kainbain`): 21/22 PRESENT via origin/mirror refs; `kb-7f6220c3` shows
  "evidence found, no stage-output commit" **only because its worktree was reaped
  and recreated at 11:38Z** (branch tip `f2e66547` = merge of origin/main; the
  11-20 pushed stage-output commits are on the old, reaped worktree — but the
  server2 journal below proves commit+push succeeded and the killer was the 413).
  The four seeds: `7f6220c3` worktree present on server2; `158394ab`, `db49d6c6`,
  `1cae113f` worktrees absent on server2 (reaped — seen in the 11-20
  "Orphaned workdirs" journal lines), but their origin branches carry stage-output
  commits → PRESENT via origin refs on both hosts.

## Journal census (both hosts, read-only)

| host / unit | window | `Runner failed:` | breakdown |
|---|---|---|---|
| local-alpha | since 2026-11-19 | 2588 | 2570× `git … commit -m "recovery: unpushed work from reused worktree (kb/<T>…)" failed … binary-guard check FAILED (N corrupt binaries)` (HOOK_REJECTED) · 3× `merging origin/kb/<T> into kb/<T> conflicts (docs/tasks/<T>/SURVEY.md) — refusing to resolve on the push path` (MERGE_CONFLICT) · 8× `Backend 502 on /runners/heartbeat` · 3× stale-execution epoch · 2× `fetch failed` · 1× `git fetch origin timed out` · 1× `Backend 502 on /runners/dispatch` |
| server2-alpha | since 2026-11-19 | 553 | 524× `fetch failed` · 15× `Backend 502 on /runners/heartbeat` · 3× `Backend 502 on /runners/dispatch` · 9× `Backend 413 on /tasks/7f6220c3-…/complete-execution` · 1× `Backend 413 on …/progress` · 1× merge-conflict push path; **553× `Main process exited`** (every `Runner failed:` → `exit(1)` → systemd restart on 0.1.0) |

The 413 loop is **still live on the 0.1.0 runner this morning**: server2-alpha
`Runner failed: Backend 413 on /tasks/7f6220c3-…/complete-execution` at 11-23
11:40:52, 11:44:38, 11:48:18 (the first two are in the BEFORE worklist; 11:48:18
accrued after the 11:46:55Z recount finished and will land in the AFTER recount).

## Per-interrupt classification (all 28 post-`finished` interrupts)

Journal window-match takes precedence over the coarse worktree rule (plan §2.2/2.3).
Full machine-readable rows: `raw/e5-final-classification.json`.

| interrupt ts (UTC) | runner | task | Δ from started | classification | window evidence |
|---|---|---|---|---|---|
| 2026-11-09T19:41:35Z | local-alpha | 8dafdce1 | 53s | Cause 5 MERGE_CONFLICT (covered by 046a6391) | journal push-path merge conflict |
| 2026-11-10T08:19:56Z | local-alpha | 94e3072d | 1031s | Cause 5 COMMIT_FAILED (`git index.lock is held` → default kind commit-failed; covered) | journal `git index.lock is held` |
| 2026-11-10T21:19:23Z | local-alpha | e3369ccb | 1176s | Cause 5 MERGE_CONFLICT (covered) | journal push-path merge conflict |
| 2026-11-10T21:26:00Z | server2-alpha | e1fb125a | 647s | Cause 5 MERGE_CONFLICT (covered) | targeted journal fetch 11-10 21:00–21:40: merge conflict on push path (StageTypeConfig.jsx, site-docs/review-gates.md) |
| 2026-11-11T00:14:12Z | local-alpha | 3318cbce | 12s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-11T01:00:30Z | local-alpha | 9be2458f | 18s | Cause 5 MERGE_CONFLICT (covered); a stage-output commit `6dae8a64` also landed at 01:00:56 (local commit ok, push-merge refused) | journal + commit window join |
| 2026-11-11T01:48:36Z | local-alpha | ac988ba8 | 1717s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-11T11:21:49Z | local-alpha | ed00c209 | 216s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-13T23:54:37Z | local-alpha | b3dec9b0 | 37s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-14T18:45:48Z | local-alpha | 0f0213b7 | 245s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T07:37:54Z | local-alpha | ee3ca5d2 | 9s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T07:40:44Z | local-alpha | ef569a1a | 130s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T08:22:14Z | local-alpha | 3c12ffcd | 8s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T11:27:14Z | local-alpha | ee3ca5d2 | 205s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T11:38:25Z | local-alpha | b31cab50 | 627s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T20:40:34Z | local-alpha | b3ab7335 | 58s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-16T23:52:08Z | local-alpha | db24c124 | 917s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-20T17:13:24Z | local-alpha | db49d6c6 | 9s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-20T21:19:13Z | server2-alpha | 7f6220c3 | 228s | **Cause 2** — `Backend 413 on complete-execution` after successful commit+push | journal |
| 2026-11-20T21:29:04Z | server2-alpha | 7f6220c3 | 555s | Cause 2 — 413 | journal |
| 2026-11-20T21:35:03Z | server2-alpha | 7f6220c3 | 322s | Cause 2 — 413 | journal |
| 2026-11-20T21:43:25Z | server2-alpha | 7f6220c3 | 466s | Cause 2 — 413 | journal |
| 2026-11-20T21:47:12Z | server2-alpha | 7f6220c3 | 191s | Cause 2 — 413 | journal |
| 2026-11-21T22:08:15Z | server2-alpha | 7f6220c3 | 353s | Cause 2 — 413 | journal |
| 2026-11-23T08:25:23Z | server2-alpha | 3b82f6ae | 82s | Cause 5 MERGE_CONFLICT (covered) — still accruing on 0.1.0 this morning | journal |
| 2026-11-23T09:19:30Z | local-alpha | 79c51992 | 10s | Cause 5 MERGE_CONFLICT (covered) | journal |
| 2026-11-23T11:40:52Z | server2-alpha | 7f6220c3 | 241s | Cause 2 — 413 (today, still 0.1.0) | journal |
| 2026-11-23T11:44:38Z | server2-alpha | 7f6220c3 | 188s | Cause 2 — 413 (today, still 0.1.0) | journal |

Totals: **19 × MERGE_CONFLICT + 1 × COMMIT_FAILED (index.lock) = 20 deterministic
git failures, all inside the `HOOK_REJECTED`/`COMMIT_FAILED`/`MERGE_CONFLICT`
classes that `046a6391` makes non-crashing; 8 × Cause 2 (HTTP 413, all `7f6220c3`
on server2-alpha — S2 backend-limit territory, not a git-failure class).**

## Ticket decision (RESPONSE.md S5 step 3)

`shared/gitFailure/isDeterministicGitFailure.js` returns true exactly for
`hook-rejected`, `commit-failed`, `merge-conflict` (verified at HEAD);
`buildGitFailureDetails` defaults unattributed commit failures (e.g.
`git index.lock is held`) to `commit-failed`. Every post-`finished` interrupt
classified above is either one of those three covered classes or Cause 2 (413,
backend payload limit — S2's ticket `d164fb3f`, not a commit loop).

**No commit-loop case outside the covered classes was found → NO new Cause-5
code ticket is created.** The 046a6391 rollout (runner-v0.2.1) is expected to
convert the 20 deterministic cases into single FAILED completions with
`gitFailure` payloads instead of crash-loops.

## Evidence gaps (explicit, never guessed)

- server2-alpha journal before 2026-11-19 was fetched only as targeted windows
  (full fetch over ssh too slow); the only pre-11-19 server2 worklist row
  (`e1fb125a`, 11-10) was resolved by a targeted fetch (MERGE_CONFLICT above).
- `kb-158394ab`, `kb-db49d6c6`, `kb-1cae113f` worktrees are reaped on server2
  (absent since 11-20 "Orphaned workdirs" lines); classification for their
  interrupts rests on origin-branch refs + local worktrees + journals, per the
  plan's fallback chain. `kb-7f6220c3` on server2 was reaped/recreated 11-23
  11:38Z; its 11-20 pushed commits are attested by the journal `Committed …
  (pushed: true)` + 413 lines, not by the current worktree.
- The coarse worktree rule alone would misclassify reaped-and-recreated worktrees
  as Cause-5; the journal window-join is the decisive evidence where present.
