# Stage verification — S1 cleanup/rigidify pass (task 3b82f6ae)

This note records the red/green evidence and the cleanup-stage hardening for
the backend change: capacity refusals excluded from the runner-death count +
re-dispatch backoff (30s doubling to 5min after 3 consecutive resumes) +
refusing-runner hide window (~2min) on the fleet scan.

## Red/green repro (GUIDE-01 §3 equivalent, run locally)

Script: 5 interrupts with `reason: "Runner workdir unavailable: Worktree cap
reached (~5)"` on the same task+stage via `ExecutionLedger.interruptExecution`,
then `isAutoResumableWithReason(task, { type: "agent" })`.

| Tree | runnerInterruptCount | escalated | interruptEscalations | capacityRefusalCount | parked as runner-death-loop |
|---|---|---|---|---|---|
| base `main` @ 6558033 (worktree) | 5 | true | 1 | n/a (field absent) | **true (bug reproduced)** |
| branch `kb/3b82f6ae` (fix) | 0 | false | 0 | 5 | **false — resumable** |

Pin (must hold on both trees): 5 BARE interrupts (no reason) →
`interruptCount 5, escalated true, parkedAsDeathLoop true` on base AND branch.
Confirmed identical — true death streaks still park.

## Cleanup-stage changes (this stage)

- `resumeBackoffRemainingMs`: result now also clamped to the computed
  backoff, so a future-dated reference timestamp (runner clock skew) can
  never extend the wait past the curve. Fail-safe both directions.
- `fireQueueEmptyPush` re-check now calls `findNextCandidateTask(store,
  { ignoreBackoff: true })` (threaded through to `findResumedCandidate`):
  a resumed task held in its backoff window still counts as pending work,
  so the queue must not page the operator as "empty" while it waits out a
  30s–5min delay. Dispatch paths never pass `ignoreBackoff`.
- Co-located unit tests added next to each new module per KB Code
  Standards: `scheduler/resumeBackoff.test.js`,
  `scheduler/resumeBackoffRemainingMs.test.js`,
  `scheduler/capacityRefusalHide.test.js`,
  `scheduler/autoResumeTask.resumeStreak.test.js` (streak increment / stage
  reset / corrupt-streak fail-safe / null stage / idempotency),
  plus fleet-path backoff+hide cases in `dispatch/scanClaimableTasks.test.js`
  and an `ignoreBackoff` case + a queue-empty-push case
  (`taskScheduler.push.test.js`).
  `findResumedCandidate.priority.test.js` was slimmed to candidate-selection
  behavior only (pure-function curves moved to their co-located files).
- Documented that the resume/death streak counters are in-memory per
  process (same as the pre-existing `runnerInterruptCount`; task markdown
  does not persist them): after a restart the streak restarts at 1, which
  fails safe — backoff can only delay, never park.

## Durability / continuity of operations

- Ledger: cap refusals still set `status: "interrupted"` and record the
  reason in history (with_reason stays visible); only the death counter is
  excluded. Completion clears all streak fields. Stage change restarts
  both counters per task+stage.
- Scheduler polls on an interval, so a backed-off task re-enters candidacy
  automatically when the delay elapses — no timer or manual kick needed;
  no path can strand the task (backoff is time-based, capped at 5min).
- Fleet path: `scanClaimableTasks` honors the same backoff and hides the
  task from the refusing runner (`runnerId` plumbed from
  `runnerRoutes.js` dispatch scan) for ~2min; all other runners still see
  it. The hide fails open (expired/garbage/missing → visible).
- Garbage handling everywhere: corrupt timestamps collapse to the epoch
  (delay 0 / hide expired — never a park); non-integer streaks read as 0;
  null task/reason safe.

## Gates (this stage)

- `npx vitest run` on all touched files: 50+ tests green (see run output).
- Full `npm run test:api`, `npm run lint:api`,
  `node scripts/check-one-function-per-file.mjs`,
  `node scripts/check-jsdoc-example.mjs` — see stage output; all green.
