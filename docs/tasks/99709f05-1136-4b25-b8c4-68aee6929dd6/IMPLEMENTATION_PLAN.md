## Goal

Fix the task "Retrying" status so it appears only when the same stage actually
runs again after a problem, and fix the history/timeline so a stage that ran
multiple times shows once with a try count instead of spamming one row per
attempt.

Decisions from [SURVEY.md](./SURVEY.md) (binding for this plan):

- "Retrying" shows only when the same step runs again after a problem.
- Normal forward movement shows the new step name as In progress.
- History shows one line per step with a try count (for example "Tried 3 times").
- Retries happen by themselves only when there is an error (no new manual
  retry button; no removal of existing recovery controls either).

## Success Criteria

- A task that fails back or advances to a different stage never shows
  RETRYING; it shows the new stage as In progress (board card, inspector, and
  detail page agree).
- A task shows RETRYING only while the same stage is being re-executed after
  a transient/infrastructure error or an auto-iteration of the same stage.
- The stage timeline shows one row per stage visit with an attempt count
  (for example "Retrying — attempt 2/5" collapsed into "Tried 3 times")
  instead of one "Retrying" row per attempt.
- The audit log keeps every attempt as evidence but groups or labels repeats
  so the sequence reads as retries of one stage, not moves between stages.
- Existing unit suites (`npm run test:unit`, at minimum the task/flow suites
  below) stay green; new regression tests cover the changed behavior.

## Approach

Make the change easy first, then make the change.

The root problem is a single boolean with no stage scope: `task.autoRetrying`
is set `true` by two backend paths —
`api/flow/routing/orchestrators/handleTransientFailure.js` (same-stage retry,
writes a "Retrying" timeline row per attempt) and
`api/flow/routing/resolvers/beginAutoIteration.js` via
`api/flow/routing/orchestrators/handleStageFailure.js` (failback retry, which
may land on a *different* stage and writes no timeline row) — and cleared only
in `api/flow/execution/executeStage.js` when the next attempt starts. The
frontend (`frontend/src/components/tasks/TaskCard.jsx`,
`TaskDetailOverlayContent.jsx`, `TaskDetailPageContent.jsx`) treats
`task.autoRetrying === true` as "RETRYING wins over everything". So any
failback to another stage still reads RETRYING until the next execution
clears the flag, and every transient attempt appends another identical-stage
"Retrying" timeline row (rendered by `buildDisplayTimeline` in
`frontend/src/components/tasks/taskFormatters.js` plus `TaskHistoryTab.jsx` /
`TaskDetailHistoryPane.jsx`).

The fix has two halves that must land together: (1) scope the retry signal to
the stage it belongs to, and (2) collapse repeated same-stage rows at render
(and stop writing one stored row per attempt where cheap to do so).

## Steps

### Phase 0 — Characterization (make the change easy; no behavior change)

1. Add failing-first reproduction fixtures before touching logic:
   - Backend: task that transient-retries in stage A (two `handleTransientFailure`
     calls), then a task that auto-iterates/fails back from stage B to stage A.
     Assert current (buggy) observable: `autoRetrying === true` while
     `currentStageId` differs from the retried stage; timeline contains N
     same-stage "Retrying" rows.
   - Frontend: extend `frontend/src/components/tasks/__fixtures__/duplicateInProgressTimeline.js`
     (or a sibling fixture) with a same-stage retry sequence; assert current row
     count. Keep the existing duplicate-arrival fixture green.
2. Map every reader/writer of `autoRetrying` and every writer of the
   `"Retrying"` timeline status (`grep autoRetrying`, `grep '"Retrying"'`):
   writers are `handleTransientFailure.js`, `beginAutoIteration.js`,
   `resetAttemptBudgets.js`, `deferForCircuitTrip.js`, `settleOperatorAbort.js`,
   `executeStage.js`; readers are `TaskCard.jsx`, `TaskDetailOverlayContent.jsx`,
   `TaskDetailPageContent.jsx`, `stagePace.js`, `retrospectiveStats.js`. Record
   the inventory in the implementing PR description.

### Phase 1 — Backend: scope the retry signal to the retried stage

3. Stamp the retry with its stage: when setting `task.autoRetrying = true`,
   also record which stage is being retried and the attempt/budget
   (for example `task.retryStageId` / `task.retryAttempt` / `task.retryMaxAttempts`;
   reuse `transientRetryLadder` and `autoIterationCount` where they already exist).
   Clear all three wherever `autoRetrying` is cleared today
   (`executeStage.js`, `resetAttemptBudgets.js`, `settleOperatorAbort.js`,
   `deferForCircuitTrip.js`, exhaustion/parked paths).
4. Stop the flag from leaking across stage moves: any transition that changes
   `task.currentStageId` to a different stage (failback, `moveToStage`,
   scheduler dispatch of another stage) clears `autoRetrying` unless the new
   stage equals the stamped retry stage. The invariant: `autoRetrying === true`
   implies "the task's current stage is the stage being retried".
5. Distinguish the two retry kinds in the returned status/history:
   - Same-stage transient retry keeps working as today but writes at most one
     stored "Retrying" timeline row per stage visit (update attempt count on
     the existing row instead of appending), OR keeps appending and leaves
     collapsing to the frontend (decide in Phase 0 based on which writers
     tests already pin; prefer single-row-update since the survey wants one
     line per step).
   - Failback auto-iteration that lands on a different stage must not produce
     a "retrying" status at all — it is forward movement; record it as a
     normal move/failback row.

### Phase 2 — Frontend: derive RETRYING from scoped state

6. Replace the bare `task.autoRetrying === true` checks in `TaskCard.jsx`,
   `TaskDetailOverlayContent.jsx`, and `TaskDetailPageContent.jsx` with one
   shared helper (put it next to `buildDisplayTimeline` in `taskFormatters.js`,
   for example `isRetryingSameStage(task)`): true only when `autoRetrying` is
   set AND the stamped retry stage matches the task's current stage AND the
   task carries a failure/lastError for this visit. Otherwise fall through to
   existing FAILED/IN PROGRESS logic, so a moved task shows the new stage name
   as In progress per the survey.
7. Keep `stagePace.js` and `retrospectiveStats.js` semantics: auto-retrying
   tasks still count as running work, but only while the scoped helper is true;
   a moved task is normal in-progress work, not retry work.

### Phase 3 — History/timeline: one line per step with a try count

8. Collapse consecutive same-stage "Retrying" rows in `buildDisplayTimeline`
   (so all three views — overlay, detail page, survey panel — inherit it):
   one row per stage visit showing the attempt count (for example status text
   "Retrying ×3" or duration/reason suffix "Tried 3 times"), preserving the
   newest reason, timestamp, and run attribution. Never collapse across
   different stages or across a Failed/Completed boundary.
9. Group the audit log (`history` array rendering in `TaskHistoryTab.jsx` /
   `TaskDetailHistoryPane.jsx`) the same way: keep every attempt entry in
   stored data, but render repeats of the identical same-stage retry action as
   one expandable/grouped line with a count. Exact-match dedupe already exists;
   extend it to prefix-match the transient-retry action text.

### Phase 4 — Docs and cleanup

10. Update user-facing wording docs that describe RETRYING (inspector tab
    description mentioning "retries", any stage-status docs under
    `site-docs/` and `docs/`) to state the new rule: same-stage re-run only.
11. Remove or correct stale comments that say "auto-retrying tasks count as
    running work" where the scoping changed them; add a short comment at the
    new helper stating the invariant from step 4.

## Validation Plan

- New regression tests (written in Phase 0, green after Phases 1–3):
  - `api/flow/transientRetryPolicy.test.js` (or `stageFailureRouting.test.js`):
    transient retry in stage A then simulated move to stage B clears
    `autoRetrying`; same-stage retry keeps it with the stage stamp.
  - `api/flow/stageFailureRouting.test.js`: failback auto-iteration to a
    different stage returns a non-"retrying" status and a move/failback
    timeline row, not "Retrying".
  - `frontend/src/components/tasks/taskFormatters.test.js`: N same-stage
    "Retrying" stored rows render as one row with count 3; rows across
    different stages are untouched.
  - `TaskCard.test.jsx` / `TaskDetailPage.test.jsx`: task with
    `autoRetrying: true` but `currentStageId` different from the retry stage
    renders IN PROGRESS (new stage), not RETRYING; same-stage renders RETRYING.
- Existing gates: `npm run test:api`, `npm run test:frontend`
  (together `npm run test:unit`), plus `npm run lint:api` /
  `npm run lint:frontend` for touched files.
- Manual check with the headless screenshot tool
  (`npm run capture:screenshot`): open a task mid-transient-retry (shows
  RETRYING, one timeline row with count) and a task just failed back to a new
  stage (shows new stage In progress, no RETRYING). No long-lived servers.

## Risks / Open Questions

- Risk: external consumers keying on `autoRetrying === true` (alerts, webhooks,
  `stage:retry` process events). Mitigation: keep the boolean for
  compatibility; the stage stamp is additive, and events keep firing.
- Risk: collapsing stored timeline rows could destroy per-attempt forensics.
  Mitigation: collapse at display time by default; if Phase 0 shows stored-row
  update is risky, keep appending in storage and collapse only in
  `buildDisplayTimeline` (attempt count derived from the run, ladder kept in
  `transientRetryLadder`).
- Open question (checked against the repo; no replay data available): the two
  screenshots in the task (`18851.png`, `18852.png` under `assets/`, not
  present in this checkout) could not be inspected — the plan assumes the
  second shows the timeline spamming the same stage. If the implementing turn
  finds the assets, confirm the spam shape (same-stage repeats vs.
  arrival/live-row duplicate already covered by the `duplicateInProgressTimeline`
  fixture) and adjust step 8 accordingly.
- Non-goals: no new manual Retry button (survey: automatic retry on error
  only); no changes to retry budgets, delays, or backoff policy.
