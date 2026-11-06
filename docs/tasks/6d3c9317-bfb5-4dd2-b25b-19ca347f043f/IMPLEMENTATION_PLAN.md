# Implementation Plan — Queue number reflects tasks waiting to be picked up

Task: queue number at the bottom-right `NowPlayingBar` does not match the tasks actually waiting to be picked up.

Source of truth for intent: `docs/tasks/6d3c9317-bfb5-4dd2-b25b-19ca347f043f/SURVEY.md`.

## 1. Contract captured from the grill-me survey

The queue chip and the queue popup must describe the **same set of tasks**: tasks that are
waiting for a runner/scheduler to pick them up **right now**.

Include a task only when all of the following hold:

1. It is not terminal: status is not `completed`, `done`, `failed`, or `cancelled`.
2. Its status is `in_stage`, or it is `interrupted` and passes `isAutoResumable` for its
   current stage.
3. Its current stage resolves and is an automated stage type (`agent`, `ci`/`script`,
   or `merge`), and that stage is not paused.
4. It is not `waiting_human` and it is not sitting on a `human` stage.
5. It is not blocked (`store.isTaskBlocked(projectId, taskId).blocked === false`).
6. It is not claimed by a live runner lease (`store.claimStore.describe(taskId)` is empty).
7. Its status is not `paused`, `advancing`, `checkpoint`, `idle`, or any `running_*`.
8. It is not the active engine owner while the engine is actively running/advancing.

Consequences of the survey (do not regress these into the plan):

- `q1`: the chip counts only waiting tasks, never tasks already being worked on.
- `q2`: the popup (`getScheduledQueue` / `useScheduledQueue`) lists only waiting tasks;
  active/running tasks are hidden.
- `q3`: blocked and paused tasks are neither counted nor listed.
- `q4`: failed, cancelled, and waiting-human tasks are neither counted nor listed.

The chip (`openQueueDepth`) and the popup length must therefore be equal once a refresh
has settled. The popup footer can still show `N open tasks counted · M shown`, but that
message becomes a transient refresh/timing diagnostic only.

## 2. Current code paths to change

Backend:

- `api/work/countOpenTasksGlobal.js` — currently counts every task whose status is not
  `completed`/`done`. That is the number shown by the chip via `resolveEngineState()`.
- `api/flow/scheduler/getScheduledQueue.js` — currently includes running, blocked,
  and paused tasks (sorted last), so it does not match the chip.
- `api/work/resolveEngineState.js` — applies `countOpenTasksGlobal()` to
  `snapshot.openQueueDepth`.
- `api/watch/observabilityMetrics.js` — exposes `stats.queueDepth = queue.length`.

Frontend:

- `frontend/src/components/layout/activeTaskVisibility.js` — fallback for
  `queueDepth` when `engineState.openQueueDepth` is absent (`openTasks.length` filter is
  only "not completed").
- `frontend/src/components/layout/QueuePopupModal.jsx` — old footer note and copy assume
  failed/cancelled/waiting-human tasks count toward the number.
- `frontend/src/components/layout/NowPlayingBar.jsx` — comments/document contract.
- `frontend/src/components/tasks/taskFormatters.js` — candidate place for a frontend
  waiting-task helper.

Docs:

- `docs/EngineDetails/TaskQueueing.md` — "Queue chip and popup (bottom bar)" section.
- JSDoc comments in touched backend/frontend files.

## 3. Principle: make the change easy, then make the change

### Phase 0 — preparation (no behavior change)

0.1 Confirm a clean starting tree on branch `kb/6d3c9317-bfb5-4dd2-b25b-19ca347f043f`.
0.2 Run the current gates to establish a baseline:
   - `npm run test:api`
   - `npm run test:frontend`
   Save the results.
0.3 Read the touched tests before editing behavior:
   - `api/work/taskEngineState.test.js`
   - `api/engineStateSnapshot.test.js`
   - `api/watch/observabilityMetrics.test.js`
   - `api/flow/taskScheduler.test.js`
   - `frontend/src/components/layout/QueuePopupModal.test.jsx`
   - `frontend/src/components/layout/activeTaskVisibility.test.js`
   - `frontend/src/components/layout/NowPlayingBar.test.jsx`

### Phase 1 — make the change easy: shared eligibility predicate

1.1 Create `api/flow/scheduler/isWaitingForPickup.js`.
   Export one predicate, e.g. `isWaitingForPickup(task, context)`.

   Input context:
   - `store`
   - `project` (optional; if missing, resolve from `store.projectStore.getProject(task.projectId)`)
   - `stage` (optional; if missing, resolve via `resolveStagesForTask(project, task)` +
     `candidateStageIndex`)
   - `blocked` (optional boolean)
   - `claimed` (optional boolean)
   - `engineState` (optional; defaults to `store.getEngineState()` or `store.engineState`)
   - `resolveStagesForTask` injection seam for tests (follow the scheduler style).

   Rules implemented exactly as the contract in section 1. The predicate must never throw:
   an unreadable project map, missing store, or missing stage resolves to `false` for that
   task rather than corrupting the whole scan.

   Important: resolution must stay read-only. Do not call `store.listTasks()` or any disk
   rescanning method; iterate the in-memory maps (`store.tasksByProject`) exactly as
   `countOpenTasksGlobal` does today. `store.projectStore.getProject` is in-memory.

1.2 Add tests in `api/flow/scheduler/isWaitingForPickup.test.js` before changing consumers.
   Cover at least:
   - completed/done/failed/cancelled → false
   - waiting_human / human stage → false
   - paused / advancing / checkpoint / idle / running_* → false
   - blocked task → false
   - claimed task → false
   - active engine owner while running → false
   - stage paused → false
   - interrupted but not auto-resumable → false
   - interrupted and auto-resumable → true
   - in_stage on automated, unpaused, unblocked, unclaimed stage → true

1.3 Add a frontend waiting-task helper in
   `frontend/src/components/tasks/taskFormatters.js`,
   e.g. `isWaitingForPickupTask(task)`.

   It cannot reproduce the backend's stage/block resolution perfectly, so it should be a
   conservative status-level fallback used only when `openQueueDepth` is absent and for
   offline snapshots:
   - completed/done/failed/cancelled/waiting_human/paused/advancing/checkpoint/idle/
     running_* → false
   - a task with a non-empty `blockedBy` array → false
   - interrupted with no resumable signal → false
   - otherwise → true

   Export and unit test it in `taskFormatters.test.js`.

### Phase 2 — make the change (backend)

2.1 Rewrite `countOpenTasksGlobal(store)` to count only `isWaitingForPickup(task, { store })`.
   - Iterate `store.tasksByProject` exactly as today; project record via
     `store.projectStore.getProject(projectId)`; active engine via `store.engineState`.
   - For the global depth, pass undefined `filterProjectId` so all projects count.
   - Keep the "fail safe, not fail closed" behavior: a readable map's count is retained
     even if another map is unreadable.
   - Update JSDoc example/constraints.

2.2 Rewrite `getScheduledQueue(store, filterProjectId)` so it includes a task only when
   `isWaitingForPickup(task, { store, project, stage, blocked, claimed })` is true.
   - Remove the broad guard that excludes only terminal/waiting_human/human stage; replace
     with the predicate.
   - Remove the `isRunning` priority rank 0 branch and its "Active Execution" reason if no
     queued task is running anymore. Keep `isRunning: false` on emitted items for
     compatibility, or drop it in a later compatibility pass.
   - Keep blocked/paused annotations dead code out of the item builder? Since those tasks
     no longer enter items, remove their `priorityRank` branches, or leave guarded by
     the predicate. Cleaner: remove.
   - Keep sorting and queueOrder assignment unchanged.
   - Keep circuit containment annotation; tripped engine still defers otherwise-waiting
     tasks.

2.3 Update `isSchedulerRunnable` callers? No change needed, but document that waiting
   count now mirrors scheduler pickup eligibility more closely (without exposing every
   internal opt-in flag such as `allowInterrupted` semantics beyond `isAutoResumable`).

2.4 Resolve engine snapshot expectations:
   - `resolveEngineState` remains responsible for calling `countOpenTasksGlobal`.
   - Because the active owner is excluded when running, an engine in `running` state
     reports one less waiting task than the total open task list.

### Phase 3 — frontend

3.1 Update fallback in `resolveUniversalNowPlaying`:
   - `openTasks` should be filtered with `isWaitingForPickupTask(task)` before
     `.length`.
   - Keep `engineState.openQueueDepth` as the authoritative value when numeric.

3.2 Update `QueuePopupModal.jsx`:
   - Remove the stale footer sentence about failed/cancelled/waiting-human counting
     toward the number but never dispatching. Replace with a sentence stating that the
     popup lists the tasks actually waiting to be picked up.
   - Retain `queue-reconciliation` test id and both-number footer for transient
     refresh diagnostics.
   - Keep empty-state text as is.

3.3 Update comments in `NowPlayingBar.jsx` to describe the narrowed contract. No status
   logic change; `queueDepth` already reads `universal.queueDepth`.

3.4 Rename any misleading CSS/test strings? Only if a test rename is required for clarity.

### Phase 4 — documentation

4.1 Rewrite the "Queue chip and popup (bottom bar)" section of
   `docs/EngineDetails/TaskQueueing.md`:
   - The chip counts tasks waiting to be picked up, not all open tasks.
   - failed, cancelled, waiting_human, paused, blocked, active/running, and
     non-auto-resumable interrupted tasks are excluded from both the chip and the popup.
   - The popup lists exactly the same set, in dispatch order.
   - The footer numbers should normally match; a mismatch means one view is stale, not
     that there is a second bug class.

4.2 Update JSDoc:
   - `countOpenTasksGlobal`
   - `getScheduledQueue`
   - `resolveUniversalNowPlaying`
   - `isWaitingForPickup` / frontend helper.

4.3 Add a CHANGELOG entry under the unreleased section describing the semantic change
   to the queue number.

## 4. Tests to update / add

Backend unit tests:

- `api/flow/scheduler/isWaitingForPickup.test.js` (new) — eligibility matrix from section 1.
- `api/work/taskEngineState.test.js` — update `countOpenTasksGlobal` expectations:
  - no longer counts `running_agent`, blocked, paused, waiting_human, failed,
    cancelled, or non-runnable interrupted.
  - keep missing-map and corrupt-entry behavior tests.
- `api/engineStateSnapshot.test.js` — the running-owner scenario now reports
  `openQueueDepth: 1` instead of `2` because the active owner is excluded while it
  runs. Idle/completion scenarios remain as before.
- `api/watch/observabilityMetrics.test.js` — queue depth now mirrors the narrowed set;
  update fixtures that relied on blocked/paused/running tasks being queued.
- `api/flow/taskScheduler.test.js` — replace assertions that expected excluded tasks
  to appear in `getScheduledQueue`. Add direct tests asserting equality between chip
  count and popup length for mixed-status fixtures.
- `api/work/taskWorkRoutes.test.js` (if it asserts queue payloads) — adjust expected
  rows.

Frontend unit tests:

- `frontend/src/components/tasks/taskFormatters.test.js` — helper coverage.
- `frontend/src/components/layout/activeTaskVisibility.test.js` — fallback queue
  expectations.
- `frontend/src/components/layout/QueuePopupModal.test.jsx` — rewrite mismatch
  assertions:
  - A mixed queue with running/blocked/paused tasks should show 0 or only the
    actually waiting rows, with matching count.
  - Remove or update the "counted-but-empty" case so both sides are 0 when nothing
    is waiting.
- `frontend/src/components/layout/NowPlayingBar.test.jsx` — chip scenarios should now
  use only waiting tasks and expect exact counts.

Manual / visual verification:

- Use the existing test seeds (or add a temporary fixture script) with:
  1. two waiting tasks in project A,
  2. one task actively running in project B,
  3. one blocked task and one paused task in project A,
  4. one failed and one waiting-human task in project B.
- Expected chip number: 2.
- Open popup: exactly those two rows, in dispatch order.
- Complete one waiting task, re-check: chip drops to 1 and popup drops to 1.
- Capture screenshot with `npm run capture:screenshot` for evidence if the UI
  contract changes.

Performance / correctness checks:

- Add an assertion in tests that `countOpenTasksGlobal` completes without touching
  disk and without mutating cache size.
- Add an assertion that it returns 0 and does not throw for `{}` and empty maps,
  as today.
- Verify no second source of truth still counts all open tasks after the change.
  Search for `status !== "completed" && status !== "done"` in scheduling/front-end
  code paths.

## 5. Acceptance criteria

1. `countOpenTasksGlobal(store)` equals the length of `getScheduledQueue(store)` (global
   scope) for a mixed-status task set covering running, blocked, paused, failed,
   cancelled, waiting-human, human-stage, interrupted non-resumable, active owner,
   and waiting tasks.
2. Tasks being actively worked on (running/active owner/claimed) never appear in
   `getScheduledQueue` and do not increment the chip.
3. Tasks that cannot currently be picked up (blocked, paused, human, failed, cancelled,
   waiting-human, non-resumable interrupted) never appear in the queue and do not
   increment the chip.
4. `npm run test:api` and `npm run test:frontend` pass after the test updates in
   section 4.
5. The documentation in `docs/EngineDetails/TaskQueueing.md` matches the new contract.

## 6. Risks and rollback

- Stage resolution and blocked checks make `countOpenTasksGlobal` heavier. It must
  remain read-only and never call `listTasks` or disk rescan. If profiling shows a
  regression, cache per-tick only; but first keep it simple.
- Some existing tests assert the old reconciliation note. They must be updated, not
  skipped; the new policy intentionally removes that user-facing explanation gap.
- Claim store is attached at runtime in `api/index.js`; tests without
  `store.claimStore` must still pass by treating missing claim store as "not
  claimed".
- If eligibility proves too aggressive in production, the rollback is to revert
  `countOpenTasksGlobal.js`, `getScheduledQueue.js`, and the frontend fallback
  together; all three must move in lockstep to keep the two numbers consistent.

KAINBAIN_VERDICT: PASS
