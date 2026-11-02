# Implementation Plan: Stop Over-Reporting "Retrying"

## Problem summary

Task cards and inspectors currently render `RETRYING` whenever `task.autoRetrying === true`.
`autoRetrying` is set by both:

1. **True in-place retries** – `handleTransientFailure` (same stage, infra blip) and transient
   stall recovery. These *should* say "Retrying".
2. **Cross-stage automatic re-runs** – `handleStageFailure` calls `failbackStage` (which moves
   the task to another stage) and then `beginAutoIteration` sets `autoRetrying = true`. These
   have moved stages and therefore should read as normal `IN PROGRESS` / the new stage, not as
   "Retrying".

The user-facing result is that almost every recovering or advanced task looks like it is
retrying, and its stage history repeats the same stage many times.

Survey decisions (`SURVEY.md`, Round 1) that this plan follows:

- Q1: "Retrying" appears only when the **same** step runs again after a problem.
- Q2: when moving forward to the next step, show the **new step name as In progress**.
- Q3: history shows **one line per step with a try count** (e.g. "Tried 3 times").
- Q4: retry happens **automatically on error only**; no manual retry control.

## Non-goals / constraints

- Do not change normal success advancement semantics (advance/move to next stage).
- Do not remove manual retry *backend* entry points used for recovery in tests unless UI
  controls are removed deliberately in Phase 4.
- Preserve all run-attribution, diff-stat and timeline ordering invariants.
- Keep the fix additive and testable (make the easy change first, then the behavior change).

## Root-cause touchpoints (verified)

Backend:
- `api/flow/routing/resolvers/beginAutoIteration.js` – sets `task.autoRetrying = true`
  unconditionally after a cross-stage failback.
- `api/flow/routing/orchestrators/handleStageFailure.js` – fails back first, then calls
  `beginAutoIteration`; the failback has already moved `task.currentStageId`.
- `api/flow/routing/orchestrators/handleTransientFailure.js` – the legitimate same-stage
  retry path; already sets `autoRetrying` true on the in-place path and false when parked.
- `api/flow/stageTransitions.js` (`moveToStage`, `failbackStage`, `advanceStage`) – stage
  movement and history/timeline writes.

Frontend:
- `frontend/src/components/tasks/TaskCard.jsx` (`isRetrying = task.autoRetrying === true`)
- `frontend/src/components/tasks/TaskDetailPageContent.jsx`
- `frontend/src/components/tasks/TaskDetailOverlayContent.jsx`
- `frontend/src/components/tasks/taskFormatters.js` (`selectDisplayTimeline`,
  `buildDisplayTimeline`) – history de-duplication only removes *exact* duplicates, so a
  stage that repeatedly fails and re-runs produces many near-identical rows.

## Phase plan (make the easy change first)

### Phase 0 – Characterization and fixtures (no production change)

1. Re-read existing tests:
   - `api/flow/stageFailureRouting.test.js`
   - `frontend/src/components/tasks/TaskCard.test.jsx`
   - `frontend/src/components/tasks/TaskDetailPage.test.jsx`
   - `frontend/src/components/tasks/taskFormatters.test.js`
2. Add minimal debug logging only if needed; prefer unit tests.
3. Confirm a reproducing timeline (task with >= 2 failback cycles) from stored fixtures.

Deliverable: failing/characterization tests that assert the desired semantics
(passing only after later phases).

### Phase 1 – Extract a single classification helper (make change easy)

Create one shared predicate so UI and tests stop reading `autoRetrying` directly:

- Frontend helper (recommended location: `frontend/src/components/tasks/stagePace.js` or
  a new `taskRetryState.js`):
  ```
  isRetryInProgress(task) =>
    task?.autoRetrying === true &&
    (task.currentStageId === task.lastError?.stageId ||
     !task.lastError?.stageId)
  ```
  Rationale: a true in-place retry is one where the task is still sitting in the failed
  stage; once failback moves it elsewhere, the predicate becomes false.

- Export matching backend expression in `beginAutoIteration` for future API consumers:
  document whether the iteration moved stages.

No behavior change yet; add unit tests for the helper.

### Phase 2 – Backend: distinguish in-place retry from cross-stage auto iteration (the change)

In `beginAutoIteration(task, stage, error, project)`:

1. Capture the failed stage id before failback logic (already available as `stage?.id`).
2. After `failbackStage` has potentially moved `task.currentStageId`, compare:
   - `moved = String(task.currentStageId) !== String(stage?.id)`.
3. Set:
   - `task.autoRetrying = !moved`
   - `task.autoIterating = true` when moved (new field; keeps the concept alive for UI/counting).
   - Increment `task.autoIterationCount` as before.
4. Keep returning `{ maxAttempts }` unchanged.

Also update `resetAttemptBudgets` and `resetAutoIteration` (if present) to clear both
`autoRetrying` and `autoIterating`.

Expected backend behavior:
- Transient same-stage infra blip: `autoRetrying=true`, `autoIterating=false`.
- Failback to another (or same via fallback policy) stage: if the destination equals the
  failed stage, still `autoRetrying=true`; otherwise `autoRetrying=false`.

Tests to update/add:
- `backend`: extend `stageFailureRouting.test.js` assertions:
  - cross-stage failback with `autoIterationEnabled` now expects `autoRetrying === false`
    and `autoIterating === true`.
  - same-stage fallback (first stage failure) expects `autoRetrying === true`.

### Phase 3 – UI: render `RETRYING` only for in-place retries

Replace direct reads in all three components:
- `TaskCard.jsx`
- `TaskDetailPageContent.jsx`
- `TaskDetailOverlayContent.jsx`

Use:
```
const isRetrying = isRetryInProgress(task);
```

For non-in-place auto iteration, the status label falls through to the normal branch:
- Task card: `RUNNING`.
- Detail pages: `IN PROGRESS`.

This directly implements Q1/Q2: a moved task no longer says "Retrying"; it shows the new
stage / in-progress state.

Update tests:
- `TaskCard.test.jsx`, `TaskDetailPage.test.jsx`: adjust fixtures where
  `autoRetrying: true` is used to simulate cross-stage iteration; add `autoIterating` if
  needed. Preserve cases that simulate a real in-place retry
  (`currentStageId === lastError.stageId`).

### Phase 4 – Remove manual retry as a primary UI affordance (survey Q4)

If product decision remains "automatic only on error":

1. Hide/remove manual "Retry Stage" controls in:
   - `TaskDetailPageContent.jsx` (and related tab content)
   - `TaskDetailOverlayContent.jsx`
2. Keep backend manual retry endpoint for emergency operator usage (do not delete yet) but
   deprecate in UI.
3. Update a11y/keyboard tests and add a migration note in docs.

Risk: High operator impact. Recommend doing this only after Phase 2/3 landed and verified.

### Phase 5 – History: one line per stage with try count (survey Q3)

Current behavior (`selectDisplayTimeline`) de-duplicates *exact* duplicates (`stage +
timestamp + status + duration`), so repeated Fail/Failed-back/Moved rows all survive.

Implement a new projection layer (display only, never mutate stored timeline):

1. Add `summarizeStageRuns(entries, stages)` in `taskFormatters.js`:
   - Group entries by resolved stage label.
   - For repeated entries (same stage), collapse to **one row**.
   - Add `tryCount` (number of attempts observed for that stage) and render text
     `Tried {count} times` when `count > 1`.
   - Keep the latest status/reason and latest run-attribution.
2. `buildDisplayTimeline` calls the grouper before reversing, and preserves special rows:
   - Live Active row logic stays unchanged.
   - Failed outcome rows still show failure reasons but are counted as attempts.
3. Keep exact-dedup first to avoid double collapse; then group.

Try-count source options (choose one in implementation, document decision):
- Count timeline rows per stage (simplest, no schema migration).
- Or read `task.autoIterationCount` (global, not per stage; less precise).
Recommend counting observed rows per stage, capped at a sensible maximum (e.g. 99).

Tests to add:
- `taskFormatters.test.js`: repeated same-stage rows collapse to one with `tryCount > 1`.
- `TaskDetailPage.test.jsx`/overlay: history renders "Tried N times".

### Phase 6 – Documentation, tests, and verification

1. Update `README_IMPLEMENTATION.md` / stage docs if retry semantics are described.
2. Update component JSDoc comments where `autoRetrying` is interpreted.
3. Run:
   - `npm run test:unit` (frontend + API).
   - targeted:
     - `npm test --prefix frontend -- src/components/tasks/...` (as repo supports)
     - `node --test api/flow/stageFailureRouting.test.js`
4. Manual checks:
   - Trigger transient infra failure on same stage → card shows `RETRYING`.
   - Trigger stage failure that failbacks to a different stage → card shows
     `IN PROGRESS`/new stage, not `RETRYING`.
   - History for 3 repeated stage attempts shows one line `Tried 3 times`.
   - No status flicker from `RETRYING` to `IN PROGRESS` on normal advance.

## Rollback strategy

- Phase 1 (helper) and Phase 2 (backend flag split) are additive; to rollback, map
  `autoIterating` back onto `autoRetrying` in the UI helper and restore original
  `beginAutoIteration` behavior.
- Phase 5 history grouping is display-only; rollback by removing the grouper.
- Keep `autoRetrying` as the final API-facing retry flag to avoid breaking older clients.

## Risk register

- Misclassifying a same-stage auto iteration if fallback policy lands on the same stage:
  handled by comparing destination to failed stage id.
- Hidden tests may assert old `autoRetrying=true` on cross-stage failback; Phase 2 updates
  those tests intentionally because the old behavior is the bug.
- History grouping could hide distinct failure reasons; mitigated by counting + preserving
  latest reason, and by not grouping `Failed` outcome details beyond display.
- Manual retry removal in Phase 4 is user-visible; keep behind a feature flag initially if
  uncertainty remains.

## Acceptance criteria

1. A task that moves stages after failure never displays status `RETRYING`.
2. A task retrying in place still displays status `RETRYING`.
3. Timeline shows one row per stage with a try count when repeated attempts occur.
4. No manual retry affordance when Phase 4 is enabled (or it is explicitly deferred).
5. Unit tests pass for affected files.
