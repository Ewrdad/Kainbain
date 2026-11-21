# RESPONSE — follow-up solutions for "high level of interruptions"

Task: `2e663986-aaf3-4afe-8dcf-3adad34acdb4` ("noticing a high level of interruptions").
Date: 2026-11-21. Stage: triage of `WIDE_NET_ANALYSIS.md` + replication guides into
reviewable, parallelisable follow-up tasks.

Inputs reviewed: `WIDE_NET_ANALYSIS.md` (6 causes + amplifier, 118 interrupts surveyed
across 61 tasks in project `0fd41821`), `REPLICATION-INDEX.md`, `GUIDE-01`–`GUIDE-07`,
`TDD-TEST-EXAMPLES.md`, and `assets/image.png` (task `7f6220c3` timeline showing repeated
"Auto-resumed after server restart" rows and inflated "Tried N times" badges).
Key code seams were spot-checked in the repo (`executionLedger.js`,
`autoResumeTask.js`, `daemon.js` cap branch, `project.js` cap refusal) and match the
analysis. No prod commands were run; all prod procedures below are quoted from the
guides as procedures for a later permitted step.

## Triage verdict: what is worth tackling

| Cause (per WIDE_NET_ANALYSIS) | Evidence strength | Tackle? | Solution |
|---|---|---|---|
| 1. Worktree-cap exhaustion loop (49/118, reason-proven) | high | **Yes** | S1: stop counting cap refusals as deaths + add re-dispatch backoff |
| 2. HTTP 413 on `complete-execution` (5 proven, ≤15 suspected) | high (proven case) | **Yes** | S2: raise/shrink the completion payload + never crash-loop on 413 |
| 3. local-alpha setup-phase deaths (~60 bare/fast, fault unnamed) | medium (localised, root unknown) | **Yes, investigate first** | S3: prod-journal investigation (E1/E6), then a targeted fix from findings |
| 4. Backend-unreachable/502 crashing daemon mid-run | medium-low | **Yes** | S4: non-fatal transient backend errors in-assignment |
| 5. Commit/push crash loop | medium (fix `046a6391` already merged 11-21, needs rollout) | **Rollout + verify, no new code yet** | S5 (with S6); new code only if E5 finds uncovered cases |
| 6. Backend restarts orphaning tasks (0/118) | high (ruled out) | **No — monitor only** | S7: one regression-pin test + recount; no behaviour change |
| Amplifier: instant Rule-0 re-dispatch, death-counter misuse, "Tried N" inflation, "server restart" mislabel | high (confirmed mechanics) | **Yes — cheapest wins** | S1 (counter/backoff) + S6 (display fixes) |
| Cross-cutting | — | **Yes** | S5: 0.2.x runner rollout + fleet before/after recount |

Dropped / deferred: nothing is dropped outright except Cause 6 as an active fix
(zero occurrences; monitor-only). Cause 3 gets an investigation task rather than a
fix task because any fix written before E1 (local-alpha journal) would be guessing.

Coordination note: task `db49d6c6` ("Fix runner recovery commits failing on pre-commit
hooks") has an `IMPLEMENTATION_PLAN.md` that touches the same `executeAssignment`
generic-catch containment area as S4. Whoever picks up S4 must read that plan first
and either build on it or explicitly scope against it to avoid duplicate/overlapping
daemon-catch changes. Likewise S5-verify covers the rollout of the `1cae113f` fix
(`046a6391`); do not re-implement deterministic-git-failure handling.

## Blocking / parallelism map

```
S1 (backend counter+backoff) ──────────────┐
S2 (413 payload) ──────────────────────────┤  all parallel,
S4 (daemon transient tolerance) ───────────┤  no code dependencies
S6 (display labels/counts) ────────────────┤  between them
S7 (reconcile regression pin) ─────────────┘
S3 (local-alpha journal investigation) ──blocks──> S3b (targeted setup fix, TBD from findings)
S5 (0.2.x rollout + recount) ──enables──> reason-based confirmation for S3/S4
                                           (code work proceeds in parallel; only the
                                           *prod confirmation* of S3/S4 waits on S5)
```

Recommended creation order (all can then run in parallel): S1, S2, S6, S7, S3, S5, S4.
Immediate relief comes from S1 (backend-only, no runner rollout needed) and S2-backend.

Global before/after metric for every solution: the fleet-count script in
`GUIDE-07 §5` (runner_interrupts / with_reason / auto_resumed / server_restart /
escalated per task) plus the `WIDE_NET_ANALYSIS.md §2` table, re-run after each fix
rolls out. A fix has worked when its signature row drops and nothing else rises.

---

## S1 — Cap refusals must not count as runner deaths; add re-dispatch backoff (backend-only)

**Answers Cause 1 + part of the amplifier.** All 49 reasoned interrupts are
`WORKTREE_CAP_REACHED` refusals, yet `interruptExecution` increments
`runnerInterruptCount` unconditionally, so five capacity refusals park the task as a
`runner-death-loop` (42 escalations fleet-wide). And every interrupt re-dispatches
in ~150 ms with Rule-0 priority, so the same still-full runner re-claims instantly.

**Proposed change (backend, `api/`):**
1. In `api/flow/executionLedger.js` `interruptExecution`: do not increment
   `runnerInterruptCount` (and do not escalate) when the reason indicates graceful
   capacity refusal — i.e. reason starts with `Runner workdir unavailable:`.
   Record the refusal in history as today (keep the reason string; it is the
   detector), but track it on a separate counter (e.g. `capacityRefusalCount`)
   with its own operator-visibility threshold rather than the death bound.
2. In the scheduler (`api/flow/scheduler/scheduleTick.js` / `findResumedCandidate.js`):
   add backoff for repeatedly resumed tasks — e.g. after N consecutive resumes of the
   same task+stage, delay re-dispatch (bootstrapped small, e.g. 30 s → 5 min) and/or
   sort behind fresh work, and prefer dispatch to a *different* runner than the one
   that just refused. Keep the first resume fast (today's behaviour) so genuine
   one-off flakes still recover instantly.
3. Keep `isAutoResumableWithReason.js` `runner-death-loop` parking for true death
   streaks (crashes with no capacity reason).

**Tests (from `TDD-TEST-EXAMPLES.md` / GUIDE-01 + GUIDE-07):**
- Red: `api/flow/executionLedger.capInterruptLoop.test.js` — five cap-reason
  interrupts leave `runnerInterruptCount` at 0, no `runner-death-loop` park.
- Red: `api/flow/scheduler/findResumedCandidate.priority.test.js` — after N
  consecutive resumes, fresh work wins over the flapping task.
- Keep a pin: five *bare/crash* interrupts still park (existing behaviour in
  `executionLedger.test.js` around line 778 must keep passing).

**How to confirm the bug (before writing the fix):**
- Local (SAFE-LOCAL): run the GUIDE-01 §3 backend snippet — it demonstrates five
  cap refusals parking as `runner-death-loop` on current code.
- Prod (PROD-READ-ONLY, needs permission): `GET /tasks/<id>` on `350ca162`,
  `db24c124`, `7b69d365` — confirm cap-reason strings followed by `Runner deaths
  escalated` at count 5. After the fix + deploy (backend-only, no runner rollout):
  re-run the same histories on new interrupts and the GUIDE-07 §5 fleet script —
  `escalated` should drop while `with_reason` stays visible.

**Parallel/blocking:** none. Backend-only; safe to ship first.
**Risk:** low-medium. Touching the escalation rule changes parking behaviour — the
pin tests above are the guard. Smallest safe slice is the counter exclusion alone;
backoff can be a second commit in the same task if review prefers.

## S2 — Fix the 413 completion-payload loop (backend limit + runner payload + no crash on 413)

**Answers Cause 2 (proven: 5 crash-loop laps on `7f6220c3` Merge resolver, 11-20
21:19–21:47, restart counters 830→834).** After a fully successful run + push, the
`complete-execution` POST exceeds Fastify's default 1 MiB JSON body limit
(`api/index.js:116` sets no `bodyLimit`) and is rejected with 413; the daemon's
generic catch interrupts (bare on 0.1.0) and rethrows → `exit(1)` → systemd restart →
full stage re-run → same 413. Deterministic, burns a whole run per lap.

**Proposed change (both sides; either half alone breaks the loop, both together
remove the class):**
1. Backend: set an explicit `bodyLimit` for the runner `complete-execution` route
   (raise to a deliberate value, e.g. 10 MiB — document why, do not just copy the
   accessibility route's value without checking it) and log rejected oversize
   bodies with task id + byte size so the next 413 is diagnosable from backend
   logs instead of invisible (today the backend rejects before routing and leaves
   no task-history trace).
2. Runner: shrink `collectTaskFiles` (`runner/daemon.js:1820`) so the envelope
   cannot exceed the agreed limit — exclude binary assets (PNG screenshots) or
   downsample the file set, and account for `output` (20 KiB) + JSON overhead in
   the cumulative cap rather than capping the files array at 1 MiB and then adding
   the envelope on top.
3. Runner: treat HTTP 413 from `complete-execution` as a deterministic,
   non-retryable completion failure (report once as failed with the size details,
   return — never rethrow). A 413 is proof the stage ran fine and only the report
   was too big; it must never become an interrupt + restart.

**Tests:**
- Pin (passes today): `api/bodyLimit.default.test.js` + `api/flow/runnerRoutes.bodyLimit.413.test.js`
  (GUIDE-02 §2) — then flip to assert the new explicit limit after the change.
- `runner/daemon.collectTaskFiles.test.js` (GUIDE-02 §3) — many sub-256 KiB files +
  output + envelope must stay under the agreed limit.
- Daemon-level: stubbed `client.complete` throwing a 413-shaped error → failed
  completion recorded, no interrupt, no rethrow (mirror the GUIDE-04 §3 shape).

**How to confirm the bug:**
- Local (SAFE-LOCAL): the GUIDE-02 §2 `app.inject` test proves >1 MiB bodies get
  413 on current wiring; the §3 test proves the file+envelope composition exceeds it.
- Prod (PROD-READ-ONLY, needs permission): backend access log 11-20 21:15–21:47 for
  the five 413s + sizes (E2); `Backend 413` sweep on both runner journals (E3);
  `kb-7f6220c3` worktree shows pushed stage-output commits for the looped executions
  (do NOT reap that worktree — it is the exhibit). After fix: no new `Backend 413`
  lines; any future oversize report surfaces as a failed completion with size details.

**Parallel/blocking:** none on other solutions. Internal order: backend limit raise
can ship before the runner payload shrink (backend deploys immediately; runner needs
rollout). Coordinate the agreed limit value between the two halves in the task's plan.
**Risk:** low. Raising a body limit is safe; the runner shrink must keep task-docs
sync useful (assert the kept-file set in tests).

## S3 — Investigate the local-alpha setup-phase deaths (evidence task, then targeted fix)

**Answers Cause 3 — the volume-dominant signature (96/118 local-alpha, 99/118 ≤15 s
after `started`, median 4.7 s, no `prompted`).** The fault is localised to
`prepareWorkdir` but genuinely unnamed, because deployed 0.1.0 attaches no reason on
the generic path. Writing a fix now would be guessing.

**Proposed task shape — strict two-phase, investigation first:**
1. Phase A (PROD-READ-ONLY, needs explicit permission + backend-host access):
   collect E1 — local-alpha daemon journal on `192.168.1.206` (user `server`) for
   the exhibit windows (`c5c465c4` 11-19 12:15–12:37; `7f6220c3` 11-20 15:38–15:43,
   18:39–18:41, 11-21 10:16 + 13:34): the `Runner failed: <message>` lines name the
   fault, restart-counter deltas separate crash-loops from in-process re-claim loops.
   Also E6: runner build provenance via `GET /runners`, plus work-root/disk/git-mirror
   health on the backend host at those times. Exact commands are in GUIDE-03 §4.
2. Phase B: write the targeted fix from whatever Phase A names (likely candidates:
   git lock/fetch/push-race handling, docs-worktree handling — note `7f6220c3` IS the
   separate-docs-repo task — stale mirror, disk/permissions). If Phase A is
   inconclusive, the fallback deliverable is defined hardening, not a shrug:
   per-step timing + error capture inside `prepareWorkdir` so the next occurrence
   self-diagnoses, plus the generic S4 containment below.
3. Cheap parallel hardening that does NOT wait for Phase A (include in this task or
   S4, reviewer's call): assert/record the runner version on every interrupt history
   row so old-build bare interrupts stay attributable (GUIDE-03 §2 TDD angle).

**Tests:** GUIDE-03 §2 backend storm pin + `runner/project.setupFaults.test.js`
failure-shape pins (§3) are the regression floor. The Phase-B fix must add its own
red test reproducing the named fault in a temp work root.
**How to confirm the bug:** Phase A *is* the confirmation — a `Runner failed:`
message timestamp-joined to a `started` → bare-interrupt pair. Post-0.2.x-rollout
(S5), bare interrupts should vanish and reasons should name this cause directly;
re-run the §2 counts as the before/after test.
**Parallel/blocking:** Phase A is independent and can start immediately (needs access
permission, not code). Phase B (S3b) is the only task in this response blocked on
another task's output. Prod *confirmation* of the fix waits on the S5 rollout.
**Risk:** low (read-only) for Phase A. Do not let Phase B expand into "rewrite
setup" — one named fault, one fix, one red test.

## S4 — Make in-assignment transient backend errors non-fatal (daemon containment)

**Answers Cause 4 (501 `fetch failed` + 16 `Backend 502` since 11-19 on server2-alpha;
a proven 502 window 11-20 20:40:20–20:40:57 during backend build 637).** Today any
in-`try` backend-call failure inside `executeAssignment` sends an interrupt and
rethrows → process exit → systemd restart. Heartbeat failures are tolerated (lease
TTL) but in-assignment call failures are fatal, so every LAN blip or backend restart
window can kill a run.

**Proposed change (runner, `runner/daemon.js` + `runner/client.js`):**
1. In the `executeAssignment` catch (`runner/daemon.js:2299-2452`): transient backend
   errors (`fetch failed` network errors, 502/503/504 status) during an assignment
   send an interrupt *with reason* and **return** (keep polling) instead of rethrowing —
   the same report-and-return precedent as the existing `WORKTREE_CAP_REACHED` and
   deterministic-`gitFailure` branches. Lease TTL already bounds the damage.
2. Add bounded retries with backoff for idempotent calls (heartbeat, dispatch poll)
   so the idle loop stops crash-cycling (restart counters 366→367 in the 11-19 sample)
   — or at minimum sleep-and-continue instead of exit on those paths.
3. Keep fatal: `STALE_EPOCH` (epoch fencing must propagate), auth failures, and
   genuinely unknown errors — enumerate the non-fatal set explicitly (status codes +
   `fetch failed` cause) rather than inverting the catch-all, so new failure modes
   stay loud.

**Must-read before coding:** `docs/tasks/db49d6c6-*/IMPLEMENTATION_PLAN.md`
(runner recovery containment) — build on it or scope against it; do not land a
second competing catch-restructure.
**Tests:** `runner/client.backendOutage.test.js` (GUIDE-04 §2: 502 shape, dropped-socket
shape, recovery) + the §3 daemon fatality-boundary test flipped red
(`expect(rethrown).toBe(false)` for transient errors, still-true for stale-epoch).
Register any new `runner/*.test.js` in `scripts/run-tests.mjs` (`buildBranches`).
**How to confirm the bug:** local — the §2/§3 tests fail-or-pin the fatality on current
code. Prod (PROD-READ-ONLY, needs permission): E4 timestamp-join of server2-alpha
`Runner failed: fetch failed|Backend 502` lines against `started` → interrupt pairs
on `db24c124`, `1f8959ca`, `f56e9878`, `ef21e99b`, `bae668cb`; E7 backend/proxy
availability log for 11-19 → 11-21. After rollout: crash-restart rate in the runner
journal drops while assignment success rate holds.
**Parallel/blocking:** code-independent of S1/S2/S6. Shares the daemon catch with the
`db49d6c6` work — sequence with that task, not with anything here.
**Risk:** medium. Changing fatal→non-fatal can mask real failures — the explicit
non-fatal enumeration + reason-on-interrupt + journal loudness are the guards.

## S5 — Roll out 0.2.x runners and run the fleet before/after recount (ops + verification)

**Covers Cause 5 verification and unlocks diagnosis of Causes 3–4.** Deployed runners
are 0.1.0 (main `f430f53`, 11-11); repo is 0.2.0 with interrupt reasons and
deterministic-git-failure handling (`046a6391`, merged 11-21 09:38 in `7ac148ce`).
Rollout is backend-nudged, at most daily per runner, idle-converge
(`docs/runner-update-runbook.md`), so lag is expected — but until it lands, every new
interrupt is still bare and every commit-hook rejection still crash-loops.

**Proposed steps:**
1. Confirm both runners (`local-alpha`, `server2-alpha`) converge to the build
   containing `046a6391` per the runbook; record `GET /runners` versions before/after.
2. Re-run the `WIDE_NET_ANALYSIS.md §2` counts + GUIDE-07 §5 fleet script: bare
   interrupts should drop to ~0, reasons should name Causes 1/3/4 directly, and
   deterministic commit failures should surface as FAILED completions with
   `gitFailure` payloads, never as interrupts.
3. Run the E5 forensics sweep (GUIDE-05 §4): for each remaining post-`finished`
   interrupt, check `kb-<taskId>` worktrees (`158394ab`, `db49d6c6`, `1cae113f`,
   `7f6220c3`) for stage-output-commit presence (present → Cause 2/4 territory;
   absent → Cause 5). Only if E5 finds commit-loop cases the `046a6391` fix does not
   cover should a new Cause-5 code task be created.
4. Record the post-rollout counts in the task folder as the new baseline for S1–S4.

**How to confirm the underlying bugs:** this task *is* the confirmation harness —
before/after counts plus the journal sweeps (E3 `Backend 413`, E4 502/fetch-fail,
E5 hook/commit lines). No new unit tests; deliverable is the recount + version record.
**Parallel/blocking:** runs in parallel with all code work; only prod *confirmation*
of S3/S4/S2-runner-half waits on it.
**Risk:** low. Follow the runbook; do not force-restart runners mid-assignment to
speed convergence (observe only — forced restarts are PROD-ACTION and risk new
interrupts, which is exactly what we are measuring).

## S6 — Fix the misleading display: resume label + "Tried N times" (backend + frontend)

**Answers the amplifier's display half — the cheapest, lowest-risk task, and the one
that fixes what the reporter actually saw.** `autoResumeTask` uses one history string
for both recovery routes, so 100 runner-path resumes display as "server restarts that
never happened" (0 recorded); `summarizeStageRuns` counts every `Resumed` row into
`tryCount`, producing the screenshot's ×6/×10/×11 badges.

**Proposed change:**
1. Backend (`api/flow/scheduler/autoResumeTask.js`): distinct history strings per
   recovery route — keep `Auto-resumed after server restart — prioritised in queue`
   for genuine reconcile recoveries, add e.g. `Auto-resumed after runner interrupt —
   prioritised in queue` (include runner id + reason when present) for runner-path
   resumes. Use the existing `interruptedBy` marker to pick the route.
2. Frontend (`frontend/src/components/tasks/taskFormatters.js` `summarizeStageRuns`,
   `:483-536`): exclude `Resumed` rows from `tryCount` (they are infra re-tries, not
   stage attempts) — or show them separately (e.g. `Tried 2 times · 4 infra resumes`).
   Update `formatTryCount` (`:556`) accordingly.
3. Update the existing pins that encode current behaviour (`taskFormatters.test.js`
   `summarizeStageRuns` cases, `taskScheduler.test.js:896` autoResume block,
   `stallRecovery`/`startupRecovery` integration tests referencing the label) —
   this is an intended contract change, not a regression; each updated assertion must
   state the new expected string/count explicitly.

**Tests:** `api/flow/scheduler/autoResumeLabel.test.js` (GUIDE-07 §2 — pin-then-red),
frontend `summarizeStageRuns` pin-then-red (§4). Full gate: `npm run test:api`,
`npm run test:frontend`.
**How to confirm the bug:** local — the §2/§4 pin tests pass on current code, proving
the mislabel and the inflation; the red tests fail until fixed. Prod (read-only):
map `assets/image.png`-style rows to `GET /tasks/7f6220c3` history — Resumed rows
counted into badges, runner-path resumes labelled "server restart".
**Parallel/blocking:** fully independent. Good first task.
**Risk:** low. User-visible strings change — keep old-row rendering backward compatible
(histories already written keep the old string; only new resumes use the new one).

## S7 — Regression-pin the boot reconcile + keep Cause 6 ruled out (tiny backend test task)

**Cause 6 is ruled out (0/118, publish-only deploys, observed restart orphaned
nothing) — this task keeps it ruled out.** `reconcileInterruptedRuns` is the one path
that *should* write `interrupted by server restart`; pin it so future boot-order or
status-set changes are caught, and re-run the zero-count check after each deploy.

**Proposed change:** add `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`
exactly as specified in GUIDE-06 §2 (orphan flip + history row, engine-owned task
untouched, idempotence, legacy `running_deploy` coverage). No behaviour change.
**How to confirm:** the tests pass immediately (PIN, not red). Prod (PROD-READ-ONLY):
the GUIDE-06 §4 loop — any `interrupted by server restart` row re-opens Cause 6.
**Parallel/blocking:** independent; can be folded into S1 or S6 if review prefers
fewer tasks, but kept separate here so it is never skipped.
**Risk:** negligible.

---

## Suggested review checklist (for the reviewing agent + human)

- [ ] Each task above names its files/seams, its red/pin tests with run commands,
  and both a local repro and a prod read-only confirmation — nothing ships on
  "looks right".
- [ ] S3 stays investigation-first: no Phase-B fix without a named fault from E1.
- [ ] S4 is sequenced with (not duplicated against) the `db49d6c6` containment work.
- [ ] S2's backend limit and runner payload cap agree on one number, documented.
- [ ] New `runner/*.test.js` files are registered in `scripts/run-tests.mjs`;
  new/renamed exports get `MARK:` JSDoc + `npm run check:jsdoc-example`.
- [ ] No PROD-READ-ONLY/PROD-ACTION command runs without explicit user permission;
  `kb-7f6220c3` is not reaped (2.8 MiB exhibit + pushed commits).
- [ ] S5's post-rollout recount is recorded as the baseline before S1–S4 claim victory.
