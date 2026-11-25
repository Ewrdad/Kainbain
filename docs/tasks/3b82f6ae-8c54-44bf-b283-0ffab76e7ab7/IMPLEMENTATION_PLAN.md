# Implementation plan — S1: stop counting worktree-cap refusals as runner deaths; re-dispatch backoff

Task: `3b82f6ae-8c54-44bf-b283-0ffab76e7ab7`. Backend-only (`api/`), no runner rollout needed.

## 1. Goal and scope

- (1) `api/flow/executionLedger.js` `interruptExecution`: do not increment
  `runnerInterruptCount` / escalate when the reason starts with
  `"Runner workdir unavailable:"`; count those on a separate
  `capacityRefusalCount` with its own operator-visible threshold (never parks).
- (2) Scheduler (`api/flow/scheduler/scheduleTick.js` /
  `findResumedCandidate.js`): after N consecutive resumes of the same
  task+stage, delay re-dispatch (30s doubling to 5min cap) and/or sort behind
  fresh work; prefer a DIFFERENT runner than the refuser; keep the first
  resume fast.
- (3) Keep runner-death-loop parking for true death streaks
  (`api/flow/scheduler/isAutoResumableWithReason.js`).

Non-goals / coordination: ticket `e3d4e9db` adds RUNNER-side setup-failure
backoff — complementary, do not duplicate it. This ticket is the BACKEND
counter exclusion + scheduler backoff only.

## 2. Input status (read before starting)

### 2.1 Grill survey (SURVEY.md) — UNANSWERED

`docs/tasks/3b82f6ae-8c54-44bf-b283-0ffab76e7ab7/SURVEY.md` round 1 has five
questions and `"answers": {}` — no answers were recorded. The plan below
adopts each question's Recommended option as the working default, and every
affected phase lists the survey question it depends on so an implementer can
re-check if answers arrive later:

| Survey q | Default (Recommended) | Drives phase |
|---|---|---|
| q1 cap refusals never park | Yes, never park; separate visibility-only counter | Phase 3 |
| q2 backoff shape | First retry instant; after 3 consecutive resumes 30s doubling to 5min; fresh work first | Phase 4 |
| q3 backoff scope | ALL repeatedly resumed tasks (covers reason-less interrupts from old runners) | Phase 4 |
| q4 runner avoidance | Hide task from refusing runner ~2min (backend cannot direct-assign) | Phase 4, step 4.4 |
| q5 guardrails | Bare/crash streaks still park after 5; capacity counter never parks | Phase 5 (pin tests) |

If survey answers arrive before implementation, re-read this table first: a
non-Recommended answer changes only its row's phase, not the whole plan.

### 2.2 Source research — MISSING from this checkout

The ticket cites `docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
(`RESPONSE.md`, `WIDE_NET_ANALYSIS.md`, `TDD-TEST-EXAMPLES.md`,
`RESPONSE_SURVEY.md`, `GUIDE-01-worktree-cap-loop.md`, `GUIDE-07` §5 fleet
script). None of these exist in this checkout (`ls docs/tasks/2e663986*`
fails; no `GUIDE-*` anywhere under `docs/`; ticket `e3d4e9db` also absent).
So Phase 0 reconstructs the two load-bearing artifacts locally instead of
blocking: a GUIDE-01-§3-style repro snippet and a GUIDE-07-§5-style fleet
check. If the research task is later fetched, diff its S1 section against
§5–§7 and update this plan.

## 3. Verified current-state findings (code read, not assumed)

- Counting: `interruptExecution` (`api/flow/executionLedger.js:644-651`)
  increments `runnerInterruptCount` unconditionally and escalates at
  `MAX_RUNNER_INTERRUPTS = 5`. Confirmed — matches the ticket's evidence.
- Parking: `isAutoResumableWithReason.js:52-57` parks at
  `runnerInterruptCount >= 5` with reason `runner-death-loop`.
- Reason wire: runner sends `` `Runner workdir unavailable: ${err.message}` ``
  on `WORKTREE_CAP_REACHED` (`runner/daemon.js:2306`) via
  `client.interrupt({ reason })`; ledger stores it trimmed to 500 chars in
  history (`executionLedger.js:653-658`). Prefix match on
  `"Runner workdir unavailable:"` is therefore stable.
- Rule-0 priority: `findResumedCandidate.js:82-94` sorts ALL resumable
  interruptions oldest-first and `findNextCandidateTask.js:54-55` returns the
  Rule-0 hit ahead of everything, with no resume-count or delay concept.
- Runner re-claim path: runners claim from `scanClaimableTasks`
  (`api/flow/dispatch/scanClaimableTasks.js`), which only lists `in_stage`
  tasks sorted via the shared `sortCentralQueue` seam — the ~150ms
  re-dispatch loop runs through `scheduleTick` → `autoResumeTask` (flip to
  `in_stage`) → immediate re-offer, which is why the same still-full runner
  re-claims. Any delay/sort fix must cover BOTH `findResumedCandidate`
  (embedded) and `scanClaimableTasks` (fleet), or the loop survives on the
  uncovered path.
- Existing pin tests: `executionLedger.test.js:765-797` (escalation at 5, the
  "~L778" pin) and `taskScheduler.test.js:569-584` (death-loop parking at 5).
  Both must keep passing unchanged.
- No existing resume-count/backoff state: no `consecutiveResumes`-like field
  exists on tasks; this plan introduces one (see Phase 4).

## 4. Work order rationale (big / research pieces first)

"Make change easy, then make the change": Phase 0 (research + repro) and
Phase 1 (test-only refactors: pure helpers + harnesses) come before any
behavior change, are individually committable, and de-risk the later phases.
Ledger exclusion (Phase 3) lands before scheduler backoff (Phase 4) because
it is smaller, independently verifiable, and removes the parking harm even if
backoff slips.

## 5. Phase 0 — Research recovery + bug confirmation (do first)

Goal: replace the missing GUIDE artifacts with local equivalents and confirm
the bug red before touching behavior.

- 0.1 Reconstruct the GUIDE-01 §3 snippet as a throwaway node script (under
  `/tmp`, not committed): build a minimal `claimStore`/`taskStore` harness
  (copy the `claimed(ctx)` pattern at the top of `executionLedger.test.js`),
  call `interruptExecution` 5x with
  `reason: "Runner workdir unavailable: Worktree cap reached (~5)"` on the
  same task+stage, and assert the CURRENT (buggy) outcome:
  `runnerInterruptCount === 5`, `escalated === true`, and
  `isAutoResumableWithReason(task, {type:"agent"}).reason ===
  "runner-death-loop"`. Keep this script for Phase 6 re-run (expect flipped
  assertions).
- 0.2 Reconstruct the GUIDE-07 §5 fleet check as a script: scan task docs (or
  the live API if available) counting `escalated` / `with_reason` interrupts;
  record the before numbers (ticket claims 42 escalations fleet-wide, all 49
  reasoned interrupts cap refusals). After the fix, escalated must drop while
  `with_reason` stays visible.
- 0.3 Measure the re-dispatch interval: time interrupt → `scheduleTick`
  re-offer on a scratch task to confirm the "~150ms Rule-0 re-claim" claim;
  record the number in the implementation notes.
- 0.4 Decision checkpoint: confirm survey defaults from §2.1 still hold (or
  apply any newly arrived answers to the table).

Exit criteria: §0.1 script demonstrates parking after 5 cap refusals on the
unmodified tree.

## 6. Phase 1 — Make the change easy (no behavior change)

Small, test-covered refactors that the later phases plug into. Each step must
leave the full suite green on its own.

- 1.1 Extract a pure reason classifier `isCapacityRefusalReason(reason)`
  (new file `api/flow/capacityRefusal.js`, one function per file per repo
  convention + `scripts/check-one-function-per-file.mjs`): returns true iff
  the trimmed reason starts with `"Runner workdir unavailable:"`. Cover with
  a unit test (prefix, case where reason is null/empty/other, leading
  whitespace). No callers yet.
- 1.2 Extract the interrupt-count/escalate block in `interruptExecution`
  (`executionLedger.js:644-665`) into a shape the ledger method still calls
  identically (pure helper or clearly delimited section), so Phase 3's branch
  is a 10-line diff, not a rewrite. Full `api` suite green before/after.
- 1.3 Add a shared scheduler-test harness if none fits: `findResumedCandidate`
  and `scanClaimableTasks` tests need a fake store with
  `projectStore.listProjects`, `listTasks`, `isTaskBlocked`, `claimStore`.
  Reuse the seed pattern in `api/flow/taskScheduler.test.js` (~L640-700);
  only add a helper if two new test files would otherwise duplicate it.
- 1.4 Constants: decide names now so tests can import them —
  `MAX_CAPACITY_REFUSALS_BEFORE_NOTE` (operator visibility note, e.g. 5;
  never parks) and backoff constants (`RESUME_BACKOFF_THRESHOLD = 3`,
  `RESUME_BACKOFF_BASE_MS = 30_000`, `RESUME_BACKOFF_MAX_MS = 300_000`).
  Put ledger constants with the ledger, scheduler constants in the new
  backoff module.

## 7. Phase 2 — Red tests first (must fail before Phase 3/4)

Write these before the behavior change and watch them fail:

- 2.1 `api/flow/executionLedger.capInterruptLoop.test.js`:
  - 5 consecutive cap-refusal interrupts on same task+stage →
    `runnerInterruptCount` stays 0 (or absent), `escalated === false`,
    `interruptEscalations` counter stays 0, status still `interrupted`,
    reason still recorded in history, `capacityRefusalCount === 5`.
  - Mixed streak: cap refusals do not reset a genuine death streak (decide
    and document: recommended — a cap refusal neither increments nor resets
    `runnerInterruptCount`; a completion/stage-change still resets both).
  - Cap-refusal streak across a stage change restarts `capacityRefusalCount`
    per task+stage, mirroring `runnerInterruptCount` semantics.
- 2.2 `api/flow/scheduler/findResumedCandidate.priority.test.js`:
  - Fresh `in_stage` work wins over a task with ≥ N consecutive resumes
    (survey q2/q3 default: threshold 3, all resume kinds).
  - First and second resumes keep Rule-0 priority (fast path pinned).
  - Backoff delay: a 3rd-resume task is skipped until 30s elapsed, 4th until
    60s, capped at 5min (inject `now` — never wall-clock in the sort).
  - Different-runner preference / refusing-runner hide (survey q4): task
    hidden from the refusing runner for ~2min while visible to others.
- 2.3 Keep-pins (must stay green throughout, no edits): the 5x bare-interrupt
  escalation test (`executionLedger.test.js:765-797`), the 5x death-loop
  parking test (`taskScheduler.test.js:569-584`), and the reasoned-history
  test (`executionLedger.test.js:746-763`, updated only if its
  `interruptCount: 1` expectation legitimately becomes 0 — prefer updating
  that one assertion with a comment over weakening the test).

## 8. Phase 3 — Ledger: exclude cap refusals from death counting

File: `api/flow/executionLedger.js` (`interruptExecution`, ~L639-678).

- 3.1 Branch on `isCapacityRefusalReason(reason)`:
  - Cap refusal: leave `runnerInterruptCount`/`runnerInterruptStage`
    untouched; maintain `task.capacityRefusalCount` /
    `task.capacityRefusalStage` with the same per-task+stage consecutive
    semantics (stage change restarts at 1); still set
    `status = "interrupted"`, still record history with the reason, still
    `interrupts += 1`; add a `capacityRefusals += 1` monitor counter.
  - Return shape: keep `{ interrupted, interruptCount, escalated }` and add
    `capacityRefusal: true, capacityRefusalCount` so callers/tests can tell.
- 3.2 Operator visibility (survey q1/q5): at `capacityRefusalCount ===
  MAX_CAPACITY_REFUSALS_BEFORE_NOTE`, push a history note ("capacity
  refusals noted … never parks") — visibility only, no escalation counter,
  no parking hook.
- 3.3 Reset semantics: `completeExecution` clears the capacity fields exactly
  like it clears `runnerInterruptCount`/`runnerInterruptStage`
  (`executionLedger.js:540-543`). Document the mixed-streak rule from 2.1.
- 3.4 Re-run Phase 0 script: 5 cap interrupts → count 0, no park. Run
  `npm run test --prefix api -- executionLedger` + full `npm run test:api`.

## 9. Phase 4 — Scheduler: re-dispatch backoff + fresh-work priority

Survey defaults: q2 (3 strikes, 30s doubling to 5min, fresh first), q3 (all
resumes), q4 (hide from refuser ~2min). New state must be durable on the task
(it already persists via `_saveTaskMarkdown`) and time-injectable.

- 4.1 Track consecutive resumes per task+stage: add
  `task.consecutiveResumes` / `task.consecutiveResumeStage`, incremented in
  `autoResumeTask` (`api/flow/scheduler/autoResumeTask.js`) when the stage
  matches (else reset to 1), cleared on completion/stage advancement. New
  pure module `api/flow/scheduler/resumeBackoff.js`: `resumeBackoffMs(task,
  stageId, nowMs)` → 0 below threshold, else
  `min(30s * 2^(n-3), 5min)`. Unit-test the curve incl. cap and garbage
  timestamps (follow the `interruptionTimestampMs` collapse-to-0 pattern).
- 4.2 Enforce the delay in `findResumedCandidate.js`: skip candidates whose
  `now - interruptedAt < resumeBackoffMs(...)`. Thread an injectable `now`
  (param defaulting to `Date.now()`) from `findNextCandidateTask` and
  `scheduleTick` so tests pin exact boundaries. First resume (count < 3)
  keeps today's instant Rule-0 path — no behavior change there.
- 4.3 Fresh work wins: when a resumed candidate is in backoff, `Rule 0` must
  not shadow fresh work — the skip in 4.2 already lets Rules 1–3 run; add the
  explicit test from 2.2 proving a fresh `in_stage` task dispatches while a
  backed-off resume waits. ALSO apply the same skip in
  `scanClaimableTasks.js` (fleet path): without it the runner fleet still
  re-claims instantly and the fix only covers the embedded scheduler.
- 4.4 Prefer a different runner (survey q4): on a cap refusal, record
  `task.lastCapacityRefusal = { runnerId, at }` in the ledger; both
  `findResumedCandidate` (embedded: skip when the only claimant would be that
  runner — only if the candidate-selection context knows the runner, else
  skip this sub-step for embedded) and `scanClaimableTasks` (fleet: filter
  the task from listings for that runner for ~2min; needs the requesting
  runner id in `opts`) honor the hide window. If plumbing the runner id
  through proves invasive, implement fleet-side only and note embedded as a
  follow-up — but do not silently drop q4; record the decision.
- 4.5 `isAutoResumableWithReason.js`: NO change to the death-loop branch
  except confirming it keys only off `runnerInterruptCount` (never the new
  capacity counter). Add a comment citing this task.

## 10. Phase 5 — Assurance: tests, gates, and fleet confirmation

- 5.1 Red→green: the Phase 2 tests fail on the base tree (record the failure
  output in the task notes) and pass after Phases 3–4. Pin tests from 2.3
  pass unmodified (except the single documented assertion if needed).
- 5.2 Full gates, in order: `npm run test:api`, `npm run test:frontend`
  (untouched but cheap), `npm run lint:api`,
  `node scripts/check-one-function-per-file.mjs`, plus the repo's doc checks
  if JSDoc/examples were touched (`npm run docs:check`).
- 5.3 Fleet confirmation (GUIDE-07 §5 equivalent): re-run the Phase 0.2
  script — escalated count must drop toward zero for cap-driven tasks while
  `with_reason` history stays visible; re-run the 0.3 timing check — repeat
  resumes now observe the backoff curve while first resumes stay fast.
- 5.4 Edge sweep (each gets a test or a written reason it needs none):
  null/empty/other reasons, reason with leading whitespace, stage change
  mid-streak, completion clearing both counters, corrupt `updatedAt`,
  backoff cap at 5min, hide-window expiry, old runners sending no reason
  (covered by q3-all-resumes default).

## 11. Documentation plan

- 11.1 Code-adjacent: JSDoc `MARK` blocks on the new classifier, backoff
  module, and new task fields (repo convention); update the `G7` /
  `MAX_RUNNER_INTERRUPTS` comment in `executionLedger.js` to describe the
  exclusion.
- 11.2 Task notes: record Phase 0 before/after numbers, the red-test failure
  output, and any survey-answer deltas in this task's docs folder.
- 11.3 Operator docs: if a runbook/EngineDetails page documents
  runner-death-loop parking or the interrupt counters, update it (parking
  still applies to crash streaks; new `capacityRefusals` counter and history
  note are visibility-only). Check `docs/EngineDetails/TaskQueueing.md`
  (cited by `findNextCandidateTask`) for Rule-0 wording that needs the
  backoff caveat.

## 12. Risks and open questions

- Missing research (§2.2): constants (N=3, 30s→5min, 2min hide) come from the
  ticket/survey, not the unread GUIDE — flag if the GUIDE surfaces different
  values.
- Unanswered survey (§2.1): defaults are the Recommended options; any late
  answer maps to exactly one phase via the table.
- Runner-id plumbing for q4 (step 4.4) is the highest-unknown-cost item;
  timebox it and fall back to fleet-side-only with a written follow-up.
- Two dispatch paths (embedded + fleet) must both honor backoff (§3 finding)
  or the loop survives on one path — the plan covers both in 4.2–4.3.

## 13. Done checklist

- [ ] Phase 0 script parks after 5 cap refusals on base, does not park after fix
- [ ] `executionLedger.capInterruptLoop.test.js` green (5 cap → count 0, no park)
- [ ] `findResumedCandidate.priority.test.js` green (fresh wins after N resumes)
- [ ] 5x bare/crash interrupts still park (pins unmodified)
- [ ] `npm run test:api`, `lint:api`, one-function-per-file check green
- [ ] Fleet re-check: escalated down, with_reason visible; first resume still fast
- [ ] JSDoc + operator docs updated; before/after numbers recorded
