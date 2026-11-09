# Implementation Plan: Queue Number Should Reflect Only Waiting Tasks

## 1. Summary of the issue & survey
- The queue chip in the bottom‑right currently counts **all** open tasks (including tasks that are already being executed, blocked, paused, waiting for a human, failed or cancelled).
- The UI **Queue popup** lists those same tasks, and a reconciliation note is shown when the chip number does not match the list length.
- The attached survey (see `SURVEY.md`) clarifies the intended semantics:
  1. **Only tasks that are waiting to be picked up** should contribute to the queue number.
  2. The popup should **hide tasks that are already running**.
  3. **Blocked or paused** tasks should **not be counted** nor displayed.
  4. **Failed / cancelled / waiting‑human** tasks should be removed from both the count and the list.
- Consequently the chip number and the popup list must always match, and the reconciliation note becomes unnecessary.

## 2. Desired behaviour (canonical definition)
A task is *queue‑eligible* when **all** of the following are true:
1. It is **not** in a terminal state (`completed`, `done`, `failed`, `cancelled`).
2. It is **not** a `waiting_human` task (human stage).
3. Its status is either:
   - `in_stage` (the task is idle in an automated stage), **or**
   - `interrupted` **and** the task is *auto‑resumable* (`isAutoResumable(task) === true`).
4. The task is **not** currently being executed by any runner (`store.engineState.activeTaskId === task.id`).
5. The task is **not** blocked (`store.isTaskBlocked(task) === true`).
6. The task is **not** paused (`store.describePaused(task) !== null`).
7. The task is **not** claimed by a runner (`store.claimStore?.describe(task.id)` returns a claim).

Only tasks meeting the above predicate are shown in the **Queue popup** and counted in the **queue chip**.

## 3. High‑level change strategy – *make change easy, then make the change*
| Phase | Goal | Rationale |
|------|------|-----------|
| **A – Extract shared eligibility logic** | Create a pure function `isTaskQueueEligible(store, project, task, activeEngine)` returning a boolean. | Guarantees a single source of truth for both backend list and count calculations. |
| **B – Refactor existing consumers** | - Update `api/work/countOpenTasksGlobal.js` to use the new predicate. <br> - Update `api/flow/scheduler/getScheduledQueue.js` to filter with the predicate instead of the old ad‑hoc rules. | Minimal code movement; tests still pass for the old behaviour until we adjust the predicate. |
| **C – Align UI with backend** | - `frontend/src/components/layout/QueuePopupModal.jsx` should fetch the queue via the existing API (now returning only eligible tasks). <br> - Remove the reconciliation note and any special handling for `running` or `blocked/paused` entries. <br> - Ensure the chip in `NowPlayingBar.jsx` reads the global count (unchanged API) which will now be the correct waiting‑task count. | Guarantees the UI surface reflects the backend definition without duplicated filtering logic. |
| **D – Add a feature flag (optional)** | Guard the new behaviour behind `process.env.QUEUE_WAITING_ONLY` (default `true`). This allows a graceful rollout and an easy revert if regressions appear. | Provides safety for production environments while the change is being validated. |
| **E – Comprehensive testing** | - Unit tests for `isTaskQueueEligible` covering every status combination and edge‑case (blocked, paused, auto‑resumable, claimed, running). <br> - Update/extend `api/work/countOpenTasksGlobal.test.js` to assert the new count. <br> - Update `frontend` component tests (`QueuePopupModal.test.js`, chip count tests) to expect matching numbers and no reconciliation note. <br> - Add an integration test that creates a mix of tasks (running, blocked, paused, failed, waiting‑human, auto‑resumable interrupted, normal waiting) and verifies that the popup list length equals the chip number. | Guarantees behavior is correct across the stack and protects against future regressions. |
| **F – Documentation** | - Update `docs/EngineDetails/TaskQueueing.md` (or the appropriate doc) to describe the *waiting‑to‑be‑picked‑up* definition. <br> - Add inline comments in the new helper file explaining the predicate. <br> - Update UI component docs/comments to note that the popup now only shows waiting tasks. | Keeps the codebase and knowledge base consistent with the new semantics. |
| **G – Release & verification** | Run the full test suite (`npm run test:unit`). <br> - Perform a manual smoke‑test in a dev environment: create tasks in each state, open the Queue popup and confirm the count matches the list. <br> - Verify that no background jobs are disrupted; the change is read‑only (no side‑effects). | Confirms the change satisfies the requirement without impacting live operations. |

## 4. Detailed step‑by‑step implementation
1. **Create helper module** `api/queue/eligibleTask.js`:
   ```js
   // Returns true if the task should appear in the queue count/popup.
   export function isTaskQueueEligible({ store, project, task, activeEngine }) {
     if (!task) return false;
     // 1. terminal states
     if (['completed','done','failed','cancelled'].includes(task.status)) return false;
     // 2. waiting_human (human stage)
     if (task.status === 'waiting_human') return false;
     // 3. status must be in_stage OR (interrupted && auto‑resumable)
     const okStatus = task.status === 'in_stage' ||
       (task.status === 'interrupted' && isAutoResumable(task));
     if (!okStatus) return false;
     // 4. exclude currently running task
     if (activeEngine?.activeTaskId === task.id) return false;
     // 5. blocked
     if (store.isTaskBlocked(task)) return false;
     // 6. paused
     if (store.describePaused(task)) return false;
     // 7. claimed by a runner
     if (store.claimStore?.describe(task.id)) return false;
     return true;
   }
   ```
   *Import `isAutoResumable` from `api/flow/scheduler/rules.js`.*
2. **Refactor `countOpenTasksGlobal.js`**:
   - Replace the existing status‑based switch with a call to the helper for each task of a project (skip `project` when `filterProjectId` given).
   - Keep the try/catch‑avoid‑throw semantics.
   - Return the sum of `eligible` tasks.
3. **Refactor `getScheduledQueue.js`**:
   - After gathering tasks for a project, filter them through `isTaskQueueEligible`.
   - Remove the special handling that forces the active running task to the top of the list (the ranking logic for `priority === 0`).
   - Remove the `blocked/paused` entries that were previously added with `priority === 5/6`.
   - Preserve the `priority` field for future UI sorting if needed, but set it to `0` for all eligible tasks (the UI no longer needs special ordering).
4. **Update UI components**:
   - In `frontend/src/components/layout/QueuePopupModal.jsx` delete the reconciliation block that renders when `countOpenTasksGlobal` !== `popupQueue.length`. The component should now simply render `popupQueue.map(...)`.
   - Adjust any text that mentions *"tasks waiting for a runner"* to match the new definition.
   - Ensure the component does not attempt to render a running task (it will not be present in the list).
   - In `frontend/src/components/NowPlayingBar.jsx` keep the chip rendering unchanged – it will automatically display the correct number once the backend count is fixed.
5. **Add optional flag** (optional but recommended):
   - Read `process.env.QUEUE_WAITING_ONLY` in the helper; if falsy, fall back to the legacy behaviour (return true for all non‑terminal tasks). This flag can be used during staged roll‑out.
6. **Testing**:
   - **Unit**: create `api/queue/eligibleTask.test.js` covering every status path, blocked/paused/claimed, auto‑resumable interrupted, running task.
   - **Update existing tests**:
     * `api/work/countOpenTasksGlobal.test.js` – adjust expectations to exclude running/blocked/paused/failed/cancelled/waiting_human.
     * `frontend/src/components/layout/QueuePopupModal.test.js` – remove expectations about the reconciliation note and ensure the rendered list length equals the chip count.
   - **Integration**: add `api/queue/integration.test.js` that builds a mini store with a mix of tasks, runs `countOpenTasksGlobal` and `getScheduledQueue`, and asserts equality.
7. **Documentation**:
   - Edit `docs/EngineDetails/TaskQueueing.md` (or the appropriate file) to describe the new definition and reference the helper `isTaskQueueEligible`.
   - Add a comment block at the top of `eligibleTask.js` summarising the policy and linking to the survey for future reference.
8. **Run full suite**:
   ```bash
   npm install   # ensure deps are up‑to‑date
   npm run test:unit
   ```
   - All tests must pass.
9. **Manual verification** (local dev server):
   - Start the app (`npm start` or appropriate script).
   - Create tasks in the UI or via the API in each state.
   - Open the Queue popup and verify that only waiting tasks are listed and the chip shows the same number.
   - Confirm that a running task is **not** visible in the popup.
10. **Roll‑out**:
    - Merge to the feature branch with the flag enabled by default.
    - Deploy to a staging environment; monitor for any unexpected drop in queue visibility.
    - Once confidence is high, enable the flag in production (or remove the flag entirely).

## 5. Risks & mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Mis‑identifying a task as *waiting* when it is actually blocked may cause a runner to attempt to pick it up and fail. | Runtime error / task stuck. | The predicate checks `store.isTaskBlocked` **before** returning true. Unit tests explicitly cover blocked scenarios. |
| Changing the API shape may break external integrations that rely on the current queue list ordering (e.g., custom UI extensions). | Breaks downstream tools. | Keep the returned objects identical (same fields) – only the filtering changes. Provide the optional flag to revert to legacy behaviour for a transition period. |
| Hidden side‑effects when accessing `store.describePaused` or `store.claimStore` may trigger disk reads. | Performance hit. | Both functions are already used in other read‑only paths (e.g., scheduler) and are safe‑guarded by `try/catch`. |

## 6. Acceptance criteria
- The queue chip displays **only** tasks that are eligible for pick‑up.
- The Queue popup list length always equals the chip number; no reconciliation note is rendered.
- All unit, integration and UI tests pass.
- Documentation reflects the new definition.
- No change introduces state‑mutating operations; the PR is read‑only from the perspective of the running system.

---
*Prepared by the review assistant.*