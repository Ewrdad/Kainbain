# IMPLEMENTATION_PLAN — S5: Roll out 0.2.x runners and run fleet before/after interrupt recount

Task: `683f0bfd-9132-41e1-b468-2cb8c428e08c` (RESPONSE.md S5 of `2e663986-aaf3-4afe-8dcf-3adad34acdb4`).
Type: ops + verification. No code changes, no new unit tests.
Date: 2026-11-23. Status: plan (nothing executed yet).

## Goal

Confirm both production runners (`local-alpha`, `server2-alpha`) converge via the
normal idle-update channel to a build containing the deterministic-git-failure fix
(`046a6391`, merged 11-21 09:38 in `7ac148ce`), then prove with fleet-wide
before/after counts that the 0.2.x rollout resolves the "bare interrupt" class:
bare interrupts drop to ~0, reasons name Causes 1/3/4, and deterministic commit
failures surface as FAILED completions with `gitFailure` payloads instead of
interrupts. Record the post-rollout counts as the new baseline for S1–S4.

## Success criteria

1. `GET /runners` versions recorded before AND after; both named runners observed
   on a `0.2.x` build whose release contains `046a6391` (verified via
   `git merge-base --is-ancestor 046a6391 runner-v0.2.0`, not by version string alone).
2. WIDE_NET §2 counts + GUIDE-07 §5 fleet script re-run on the same scope,
   recorded in the task folder as before/after tables.
3. S5-attributable signals move as predicted: bare interrupts → ~0 on new
   interrupts, `with_reason` names Causes 1/3/4, deterministic commit failures
   appear as FAILED + `gitFailure` (never interrupts). (Cap-escalation and label
   fixes are S1/S6 territory — see §"Attribution boundaries".)
4. E5 forensics sweep (GUIDE-05 §4) executed for every remaining post-`finished`
   interrupt: each classified commit-present (Cause 2/4) or commit-absent
   (Cause 5 suspect), with evidence or an explicit evidence-gap note.
5. Post-rollout baseline recorded in the task folder and usable by S1–S4 as their
   "before" reference (counts + runner versions + backend build + window dates).
6. Zero forced restarts, zero reaped exhibit worktrees, zero agent re-runs:
   observe-only throughout (q9 constraint).

## Grounded facts (verified 2026-11-23 in this checkout)

- HEAD is `7ac148ce` and contains `046a6391` (verified: `git merge-base
  --is-ancestor 046a6391 HEAD` → YES). `046a6391` is the 17-file
  deterministic-git-failure change (daemon branch, `shared/gitFailure/*`).
- `runner/version.json` reads `runnerVersion: 0.2.0`.
  Release tags `runner-v0.1.0` AND `runner-v0.2.0` both exist, so the 0.2.x
  release is already cut (runbook step 4 done). Remaining rollout gates: the
  backend recommended knob + per-runner idle converge.
- Recommended-knob wiring: `api/config/schema.js` key `runnerRecommendedVersion`
  (`KAINBAIN_RUNNER_RECOMMENDED_VERSION`), **default `0.1.0`**. The live value
  must be read at execution time — the default alone cannot confirm the rollout
  is switched on (this is survey q1).
- Runner endpoints exist: `GET /runners` → `runnerRegistry.list()` (fleet
  matrix: versions, badges, update status), `GET /runners/monitor`,
  per-runner `pendingCommands`/`requestUpdate` acks (`api/flow/runnerRoutes.js`).
- Baseline to beat (WIDE_NET §2, project `0fd41821`, 61 tasks, 2026-11-21):
  118 runner-path interrupts (96 local-alpha / 22 server2-alpha), 49 with
  reason (all cap refusals), 69 bare, 99 ≤15 s after `started` (median 4.7 s),
  15 ≥2 min after `started`, 42 death-streak escalations, 0 server-restart
  interrupts, 100 `Auto-resumed after server restart` rows.
- API base for prod reads: `http://192.168.1.206:3100` (`localhost:3100`
  refuses connections from this runner host, per TICKETS doc).
- E5 exhibits are **already absent on this host**: no `kb-158394ab`,
  `kb-db49d6c6`, `kb-1cae113f`, `kb-7f6220c3` under the server2-alpha work
  root (`KAINBAIN_RUNNER_WORK_ROOT=/home/server2/.kainbain/runner-work`,
  only 5 unrelated `kb-*` dirs present). The local-alpha host
  (`192.168.1.206`, `~server`) is unchecked — the sweep must check there
  first and treat absence as an evidence gap with fallbacks (§Phase 2).
- GUIDE-05 §4's path `~/.kainbain/kb-$t` is stale for server2-alpha; the real
  layout is `$KAINBAIN_RUNNER_WORK_ROOT/kb-<taskId>*`. Resolve the work root
  per host before sweeping.

## Survey integration (SURVEY.md + RESPONSE_SURVEY.md)

The task survey (`SURVEY.md`, Round 1, stage-1792362077711) is **generated but
unanswered** (`"answers": {}`); the source survey (`RESPONSE_SURVEY.md` q1–q9)
is likewise unanswered. The plan therefore adopts the recommended option of
each question as a reviewable assumption, keeps the question open, and carries
a fallback branch per question:

| Q | Recommended assumption (plan default) | Fallback if answered otherwise |
|---|---|---|
| q1 (knob already on?) | Observe + record; verify knob state read-only, do NOT change it | If "check and switch on": add one backend config change (`KAINBAIN_RUNNER_RECOMMENDED_VERSION=0.2.0`), no restarts, recorded with before/after value |
| q2 (read-only prod access?) | Full read-only: backend API + runner journals + worktrees on both hosts | API-only: Phases 1/3/4 proceed, Phase 2 E5 becomes journals-unavailable gap note; "docs only": task cannot execute — re-plan as procedure-only doc |
| q3 (wait for converge?) | Wait-and-watch in the same run until both runners converge, then after-recount | Before-now/stop: deliver BEFORE + E5 + versions now, AFTER as a scheduled follow-up run; never "record mid-rollout as after" |
| q4 (recount scope?) | Same project `0fd41821` only, directly comparable to the 11-21 baseline | All-projects: run the same script per project and keep `0fd41821` as the headline comparison table |
| RESPONSE q9 (rollout pace) | **Hard constraint**: gradual idle-converge, never force-restart mid-task | No fallback — any "faster" answer must come from the human explicitly; the plan refuses to include forced restarts on its own authority |

Execution must re-read both survey files for answers before running anything;
an answered survey overrides the assumption row above.

## Approach — make observation easy, then observe

This task changes nothing; its failure mode is fuzzy, non-reproducible numbers.
So Phase 0 ("make change easy") builds all reusable observation tooling first —
frozen scripts, record templates, access checks, and the BEFORE snapshot — and
only then do the time-ordered phases run. Big/volatile evidence comes early:
the BEFORE recount and the E5 sweep run before the convergence wait, because
interrupts keep accruing and worktree exhibits keep getting reaped (all four
E5 seed exhibits are already absent from this host). The long pole — idle
convergence at most daily per runner — waits in Phase 3 without blocking
Phase 1/2 evidence.

Attribution boundaries (what S5 may and may not claim): S1 (cap counting),
S2-backend (413 limit), S4 (transient tolerance), S6 (labels/counts) all change
the same signals. S5's after-recount MUST record the backend build number
(`GET /deploy/status`) and which sibling fixes have landed, and split new
interrupts by timestamp against each runner's converge time. Only interrupts
timestamped after a runner converged to 0.2.x count as "after" for S5.
`escalated` dropping is an S1 signal, not an S5 gate; the S5 gates are bare→~0,
reasons present, and FAILED+`gitFailure` instead of commit-loop interrupts.

## Phase 0 — Setup: tooling, access, knob state, BEFORE snapshot (first)

0.1 Re-read `SURVEY.md` and `RESPONSE_SURVEY.md` for answers; record the
    effective decision per question at the top of the run log.
0.2 Access checks (read-only, stop on first refusal and record it):
    `GET /status/observability`, `GET /tasks?projectId=0fd41821` (expect ~61+
    tasks — confirms project id scope for q4), `GET /runners`,
    `GET /deploy/status` (backend build number), journal read on both hosts,
    work-root listing on both hosts.
0.3 Knob state (q1): record live `runnerRecommendedVersion` /
    `runnerMinVersion` (backend config endpoint or operator-read env).
    Under the default assumption do NOT change them; under the q1-fallback,
    raise recommended to `0.2.0` (config only, no restart) and record old→new.
0.4 Freeze the observation kit in this task folder so S1–S4 re-run identically:
    - `bin/fleet-recount.sh` — GUIDE-07 §5 script pinned to the API base +
      project id, plus a `jq -s` aggregation pass emitting the WIDE_NET §2
      table rows (runner_interrupts, with_reason, bare, ≤15 s, ≥2 min,
      auto_resumed, server_restart, escalated, per-runner split).
    - `bin/runners-snapshot.sh` — `GET /runners` raw JSON → timestamped file.
    - `bin/e5-sweep.sh` — corrected E5 loop resolving `$KAINBAIN_RUNNER_WORK_ROOT`
      per host + journal greps (E3 `Backend 413`, E4 502/`fetch failed`,
      hook/commit lines).
    - `RUN-LOG.md` — timestamped run diary (knob values, backend builds,
      converge times, sibling-fix landings).
0.5 BEFORE snapshot (same run as 0.2): save raw `GET /runners` JSON and run the
    fleet script → `RECOUNT-BEFORE.md` (per-task rows + §2 table). This is the
    "before" half of the rollout proof; everything after compares to it.
0.6 Verify release content: `git merge-base --is-ancestor 046a6391 runner-v0.2.0`
    (must print YES — proves the 0.2.0 release actually carries the fix).

Gate: kit committed in folder, BEFORE counts + BEFORE versions saved, knob
state recorded. All later phases are mechanical re-runs of Phase 0 tooling.

## Phase 1 — BEFORE recount analysis (same data as 0.5, second lens)

1.1 Recompute the WIDE_NET §2 table from the BEFORE snapshot and diff it against
    the 11-21 baseline (new interrupts since 11-21 are expected — runners are
    still 0.1.0; every new one should still be bare, which itself re-confirms
    the "until it lands" premise).
1.2 List every post-`finished` interrupt (≥2 min after `started`, or explicit
    `finished`→interrupt pair) with task id + timestamps — this is the E5
    worklist for Phase 2.
1.3 Confirm the reason vocabulary on new interrupts: cap refusals still reasoned,
    everything else bare. Any *reasoned non-cap* interrupt before convergence
    would contradict the "0.1.0 emits no reasons" premise — flag, don't ignore.

Gate: `RECOUNT-BEFORE.md` holds §2 table + diff vs 11-21 + E5 worklist.

## Phase 2 — E5 forensics sweep (early: exhibits are volatile)

For each post-`finished` interrupt from 1.2 (seeds: `158394ab`, `db49d6c6`,
`1cae113f`, `7f6220c3`, plus any new ones from 1.1):

2.1 Worktree check per host (read-only, never reap): resolve the runner work
    root on that host first, then
    `git -C $WORK_ROOT/kb-<taskId>* log --oneline -3` and look for a
    stage-output commit matching the execution window. Present → Cause 2/4
    territory; absent → Cause 5 suspect. Record exact SHAs or exact absence.
2.2 Journal join (same host, same window): `Runner failed:` line text +
    restart-counter deltas — names hook/commit vs 413 vs 502/fetch-fail.
2.3 Fallback chain when a worktree is absent (already the case on server2-alpha
    for all four seeds): (a) check the sibling host; (b) check `origin` for the
    stage-output SHA (pushed = commit succeeded, Cause 2/4); (c) journal line
    alone; (d) if all absent, record an explicit evidence gap — never guess.
2.4 Verdict per interrupt: Cause-2/4 vs Cause-5-covered-by-`046a6391` vs
    Cause-5-NOT-covered. The third verdict is the ONLY trigger for new code:
    if and only if E5 finds commit-loop cases `046a6391` does not cover
    (a deterministic failure class outside `HOOK_REJECTED`/`COMMIT_FAILED`/
    `MERGE_CONFLICT` that still crash-loops on 0.2.x), file a NEW Cause-5
    code ticket with the journal line + worktree state + failing class.

Gate: `E5-SWEEP.md` with one row per post-`finished` interrupt (evidence or
gap) + the ticket/no-ticket decision with reasoning.

## Phase 3 — Convergence watch (the long pole; observe only)

3.1 Poll `GET /runners` on a slow cadence (30–60 min) and snapshot each poll.
    Per runner record: running version + build facts, `updateAvailable` /
    `belowMinimum` / `updateStatus` badges, pending vs acked `requestUpdate`
    (nudge cooldown is 24 h), busy/idle, pinned-vs-Latest.
3.2 Declare a runner converged at the first poll showing a 0.2.x build whose
    release contains `046a6391`; record the converge timestamp per runner in
    `RUN-LOG.md`. Both converged → proceed to Phase 4 (q3 default).
3.3 If a runner stalls (badge never clears past 24–48 h): triage READ-ONLY per
    the runbook ("a runner says out of date") — `entrypoint: direct` vs
    wrapper, `KAINBAIN_RUNNER_AUTO_UPDATE=0` opt-out, pinned version, pin
    older than running, recommended knob above every release, `updateStatus`
    failure reason — and record the blocking cause. Fixes (migrate, flip the
    switch, Update button) are PROD-ACTION: propose, do not perform.
3.4 NEVER to speed convergence: force-restart mid-assignment, Update-on-busy,
    reaping worktrees, re-running parked tasks. Any of these manufactures the
    interrupts being measured (q9 / PROD-ACTION ban).

Gate: per-runner converge timestamps, or a stalled-runner triage note with a
named blocking cause. Under the q3-fallback (before-now/stop), Phase 3 becomes
a scheduled follow-up run instead of a same-run wait.

## Phase 4 — AFTER recount + journal sweeps (after both converge)

4.1 AFTER snapshot: raw `GET /runners` JSON + fleet script → `RECOUNT-AFTER.md`
    (§2 table + per-task rows), timestamped ≥ both converge times.
4.2 Split new interrupts at each runner's converge time; evaluate the S5 gates
    on post-converge interrupts only: bare → ~0; reasons name Causes 1/3/4
    (cap strings, setup-fault messages, transient 502/fetch-fail strings);
    deterministic commit failures arrive as FAILED completions carrying
    `gitFailure` payloads (`kind`/`phase`/`summary`) with NO interrupt row.
4.3 Journal sweeps (both hosts, post-converge window): E3 `Backend 413` lines
    (expect none-new after S2 lands; any 413 on 0.2.x must pair with a FAILED
    completion, never a crash loop), E4 502/`fetch failed` crash lines
    (expect crash-restarts to persist until S4 lands — reasons now name them),
    hook/commit lines (expect single `commit failed (...)` + FAILED, no
    restart storm).
4.4 Record confounds: backend build number at AFTER time, which of S1/S2/S4/S6
    have deployed, and any deploys that restarted the backend in-window
    (Cause-6 upkeep: any `interrupted by server restart` row re-opens it).

Gate: `RECOUNT-AFTER.md` with the post-converge-gated verdict per S5 gate
(pass/fail + counts), plus the confound ledger.

## Phase 5 — Baseline record + handoff (closes the task)

5.1 Write `BASELINE.md`: the new S1–S4 reference — BEFORE/AFTER §2 tables,
    per-runner versions + converge timestamps, backend builds, window dates,
    E5 verdicts, open evidence gaps, and the exact re-run commands (Phase 0 kit).
5.2 Handoff notes: unblock prod CONFIRMATION of S3/S4/S2-runner-half (code work
    never waited); S1/S6 confirm against `BASELINE.md` + their own deploys.
    If 2.4 triggered, link the new Cause-5 ticket; otherwise state explicitly
    that no new Cause-5 code is needed.
5.3 Review-checklist pass (RESPONSE.md): no PROD command ran without permission;
    exhibit worktrees untouched; recount recorded before any victory claim.

Gate: `BASELINE.md` present and self-contained — a stranger can re-run the
whole proof from the kit + this file alone.

## Validation & assurance plan (how we know it worked)

No unit tests by design (ops task — RESPONSE.md S5: "No new unit tests;
deliverable is the recount + version record"). Assurance instead comes from
executed procedures with saved evidence, each claim cross-checked two ways:

| Claim | Primary evidence | Independent cross-check |
|---|---|---|
| Runners on fix build | `GET /runners` version facts | `git merge-base --is-ancestor 046a6391 runner-v0.2.0` + heartbeat build fields |
| Bare → ~0 | Fleet script `bare` count post-converge | Reason-vocabulary audit (1.3): every new interrupt carries a reason naming a cause |
| No commit crash-loops | FAILED + `gitFailure` completions, no interrupt row | Journal: single `commit failed` per incident, no restart storm |
| E5 classification | Worktree stage-output-commit presence | Journal `Runner failed:` line + origin SHA check |
| No server-restart orphans | `server_restart` count stays 0 | Backend build/`engine.updatedAt` divergence log (Cause-6 upkeep) |

Per-phase gates above double as the test plan: a phase is done only when its
artifact file exists with the named content. Negative controls: (a) BEFORE
snapshot must show still-bare new interrupts (proves the premise that 0.1.0
emits no reasons); (b) any reasoned non-cap interrupt pre-converge, or any
bare interrupt post-converge, fails its gate and must be explained, not
averaged away. Docs assurance: every record file carries timestamps, raw
command output (or the raw JSON), and the exact re-run command.

## Deliverables (all under `docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c/`)

- `IMPLEMENTATION_PLAN.md` (this file) · `SURVEY.md` (prior stage, read-only
  input) · `RUN-LOG.md` · `bin/fleet-recount.sh` · `bin/runners-snapshot.sh` ·
  `bin/e5-sweep.sh` · `runners-before/*.json` + `runners-after/*.json` ·
  `RECOUNT-BEFORE.md` · `RECOUNT-AFTER.md` · `E5-SWEEP.md` · `BASELINE.md`.

## Risks & non-goals

- Convergence may take >24 h per runner (daily nudge, idle-only). Mitigation:
  q3 default waits in-run; q3-fallback splits BEFORE/Phase 2 now, AFTER later.
- S1/S2/S4/S6 landing mid-window confounds attribution. Mitigation: confound
  ledger + per-runner converge-time gating (§Approach).
- E5 exhibits already thinning (all four seeds absent on server2-alpha).
  Mitigation: sweep early (Phase 2), sibling host + origin + journal fallbacks,
  explicit gap notes.
- Access refusal (q2-fallbacks). Mitigation: degraded-scope branches per survey
  row; procedure-only doc as last resort.
- Non-goals: no runner/backend code, no knob change under the default
  assumption, no restarts/updates/reaps/re-runs, no Cause-5 ticket unless 2.4
  triggers, no claiming S1/S2/S4/S6 signals as S5 wins.

## Open questions

1. SURVEY.md q1–q4 unanswered — plan proceeds on recommended-option assumptions
   (table above); execution re-checks for answers first.
2. RESPONSE_SURVEY.md q1–q9 unanswered, including q9 (rollout pace) — q9's
   recommended option is treated as a hard constraint regardless.
3. Live `runnerRecommendedVersion` value — read-only check in 0.3 decides
   whether the rollout is already switched on.
4. Whether any E5 seed worktree survives on the local-alpha host — answered by
   the first sweep in Phase 2.
5. q4-fallback needs the full project list if "all projects" is chosen —
   enumerate via `GET /tasks` without project filter at that point.

## Sources (all inspected in-branch or in-checkout this run)

- `kb/2e663986` branch: `RESPONSE.md` (S5 + blocking map + checklist),
  `WIDE_NET_ANALYSIS.md` (§2 table, Causes 1–6, amplifier, E1–E7 matrix, §6
  method), `GUIDE-05-commit-push-crash-loop.md` (§4 E5 sweep),
  `GUIDE-07-amplifier-requeue-and-display.md` (§5 fleet script),
  `RESPONSE_SURVEY.md` (q9), `TDD-TEST-EXAMPLES.md` (safety tiers),
  `REPLICATION-INDEX.md`, `TICKETS-CREATED-20261122.md` (API base, project).
- `origin/kb/683f0bfd` branch: `SURVEY.md` (q1–q4, unanswered),
  `idea-20261122-181543.md` (Idea approval).
- Checkout: `docs/runner-update-runbook.md` (release/nudge/triage),
  `runner/version.json` (0.2.0), `api/config/schema.js:424-432` (knob
  defaults), `api/flow/runnerRoutes.js:457` (`GET /runners`),
  tags `runner-v0.1.0`/`runner-v0.2.0`, commits `046a6391`/`f430f53`/`7ac148ce`.
