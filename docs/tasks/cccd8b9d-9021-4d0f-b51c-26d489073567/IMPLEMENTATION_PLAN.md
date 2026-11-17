# Implementation Plan: Uncomplete (reopen) completed tasks

## 0. Context and deliverable

- **Repository:** KainBain runner (branch `kb/cccd8b9d-9021-4d0f-b51c-26d489073567`).
- **Feature:** Once a task is completed, the Complete button should become an
  Uncomplete button that restores the task to its pre-completion workflow state,
  where it behaves like any other non-completed task.
- **Deliverable of this stage:** this plan file only
  (`docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/IMPLEMENTATION_PLAN.md`).
  Implementation, tests, and docs updates happen in later stages.
- **Note on survey/idea inputs:** The stage brief points at `SURVEY.md`
  (grill-me survey) and `idea-20261115-222317.md` in this task's docs folder,
  but that folder is empty in this checkout (only `.`/`..` present at plan
  time). This plan therefore treats the survey outcome as **assumed** (Section
  2) and lists the resulting open questions explicitly (Section 6) so they can
  be confirmed before coding.

### Assumed survey decisions (to confirm against SURVEY.md when available)

1. Scope is a symmetric **uncomplete/reopen**, not delete-and-recreate: history
   and timeline are preserved, with a new "Reopened/Uncompleted" entry.
2. The trigger is the **same button position** as Complete: the Complete button
   swaps to Uncomplete once the task is completed (in both the task detail tab
   and the task detail page, which currently duplicate the button).
3. "Restore it to before" means **the workflow state the task had immediately
   before completion** (stage + runnable status), not merely "not completed".
4. Uncomplete uses the **same authorization** as Complete (no new role).
5. No resurrection of execution: a reopened task becomes **runnable/idle**, it
   does not restart a run by itself.

## 1. Principle: make the change easy, then make the change

1. **Seam first, behaviour second.** Extract the duplicated Complete button
   into one shared component and add a pure status-resolution helper with no
   behaviour change, before adding any backend route.
2. **Mirror, don't fork.** `uncompleteTask` mirrors `completeTask` at every
   layer (store delegate, flow transition, route, service method, mutation
   hook) so future changes to one have an obvious counterpart.
3. **Keep non-completed tasks byte-identical.** No change to statuses, history,
   or timeline for tasks that are never uncompleted; `statusBeforeComplete`
   (or equivalent) is only written by the complete path going forward, with a
   derivation fallback for tasks completed before this feature ships.
4. **One call site at a time.** Backend transition + tests, then route/service,
   then one UI surface, then the second UI surface reusing the same component.

## 2. Scope map (grounded in current code)

Research verified the current complete path end to end; the uncomplete path
touches the same surfaces symmetrically:

### Backend / domain

- `api/flow/stageTransitions.js` — `completeTask` (MARK: completeTask, ~line
  603+) sets `status = "completed"`, clears failure/retry flags, pushes a
  `Completed` history entry and a `Completed` timeline row, after
  `interruptLiveRun`. New `uncompleteTask` belongs beside it.
- `api/taskStore.js` — `completeTask` delegate (~line 816) wrapping the flow
  function; add an `uncompleteTask` delegate the same way.
- `api/flow/taskFlowRoutes.js` — `POST /tasks/:id/complete` (MARK: Complete
  Task); add `POST /tasks/:id/uncomplete` with the same
  `resolveAndGuardProject` + 404 pattern.
- `api/flow/index.js` — re-exports flow functions (`completeTask`, ...); add
  the new function to keep the barrel consistent.
- Task status model: `completed` is set in `stageTransitions.js`; surrounding
  code also uses `idle`, `in_stage`, `running_*`, `interrupted`, plus terminal
  neighbours (`WORKTREE_REAPABLE_STATUSES` in `api/work/taskLifecycle.js`
  includes `"completed"`). The exact restore target needs Phase 0 research.

### Frontend

- `frontend/src/components/tasks/TaskDetailsTabContent.jsx` (~lines 475–519) —
  Complete button, currently rendered only when `task.status !== 'completed'`.
- `frontend/src/components/tasks/TaskDetailPageContent.jsx` (~lines
  1190–1232) — duplicated Complete button with the same gate.
- `frontend/src/context/useTaskMutations.js` — `completeTask` (~line 350)
  calls `api.completeTask` then `refreshTasks` + success notification;
  add `uncompleteTask` mirroring it.
- `frontend/src/services/work/index.js` (~line 57) — `completeTask` service
  method (`POST /tasks/:id/complete`); add `uncompleteTask`.
- `frontend/src/components/tasks/TaskCard.jsx` — `isCompleted`
  (`task.status === 'completed'`, ~line 127) drives DONE badge/styling and
  hides checkpoint/survey rows; a reopened task must flow back through the
  existing non-completed branches with no special-casing beyond status.

### Out of scope

- Bulk uncomplete, undo-for-any-action, or generic status editing.
- Auto-resuming execution on reopen (task becomes runnable; the user runs the
  next stage explicitly).
- New roles/permissions; API surface test additions beyond the new endpoint.

## 3. Step-by-step plan (research/big pieces first)

### Phase 0 — Contract research (do first; blocks Phase 1 decisions)

1. **Enumerate the status model.** Grep all writers of `task.status` in
   `api/flow`, `api/work`, `api/taskStore.js` and list every reachable status;
   confirm which statuses a task can hold immediately before `completeTask`
   runs (human-gated? mid-run? idle?) by reading callers of the complete
   route and the UI gates.
2. **Decide the restore target.** Two candidate designs; pick one and record
   why:
   - (a) **Snapshot at complete time**: `completeTask` also stores
     `statusBeforeComplete` (+ `stageBeforeComplete`) on the task; uncomplete
     restores them. Exact, but only works for tasks completed after this
     ships — needs a fallback for older tasks.
   - (b) **Derive from history/timeline**: uncomplete reads the last
     non-terminal history/timeline entry to infer stage + status. Works for
     old tasks, but inference can be wrong.
   - Recommended: (a) with (b) as fallback (`idle` + current `currentStageId`
     when neither snapshot nor history yields a target). Confirm against
     SURVEY.md.
3. **Confirm timeline/history conventions.** Read `store._recordTimelineWithDiffStat`
   and `_recordHistory` usage in `completeTask`; decide the reopen entries
   (proposed: history action `"Uncompleted"`/`"Reopened"`, terminal-style
   timeline row `status: "Reopened"` so reports stay coherent).
4. **Check consumers of `completed`.** Search for `=== 'completed'` /
   `!== 'completed'` across `frontend/src` and `api` (board filter
   `excludeCompleted` in `taskWorkRoutes.js`, retrospective stats, survey
   gating) and list each behaviour a reopened task must regain; verify none
   caches terminal state elsewhere (notifications, scheduler stats).

### Phase 1 — Make the change easy (no behaviour change)

1. **Extract a shared task-action button.** Create one component (e.g.
   `TaskCompleteToggleButton.jsx` under `frontend/src/components/tasks/`)
   encapsulating the `pendingAction`/`runTaskAction` + button markup now
   duplicated in `TaskDetailsTabContent.jsx` and `TaskDetailPageContent.jsx`;
   rewire both call sites to it with identical props/behaviour. Validate with
   the existing `TaskDetail*` and `TaskCard` frontend tests (no new tests
   yet; behaviour must be unchanged).
2. **Add a pure status helper.** Add `resolveReopenedStatus(task)` (name TBD,
   beside the flow functions or in `taskLifecycle.js`) implementing the
   Phase-0 decision as a pure function: input task (+ history) → output
   `{ status, stageId? }`, defaulting to `idle`. Unit-test the mapping
   exhaustively (snapshot present, snapshot absent + history present,
   neither present) before any writer uses it.

### Phase 2 — Backend: `uncompleteTask` + route (the change)

1. **Flow transition** in `api/flow/stageTransitions.js`, mirroring
   `completeTask`:
   - Return `null` when task missing; no-op (return task) when status is not
     `completed` — symmetric with complete's early return.
   - Do **not** interrupt or start runs (a completed task has no live run by
     construction); assert/verify no live run rather than stopping one.
   - Set status from `resolveReopenedStatus`, restore `currentStageId` when
     the snapshot/fallback provides one, touch `updatedAt`, push history
     (`Uncompleted`) and timeline (`Reopened`) entries, persist to disk.
   - Clear nothing else destructively: keep prior timeline, reports, and
     survey answers intact.
2. **Store delegate** in `api/taskStore.js` (`uncompleteTask`, same JSDoc
   style as `completeTask`), plus barrel export in `api/flow/index.js`.
3. **Route** `POST /tasks/:id/uncomplete` in `api/flow/taskFlowRoutes.js`,
   copying the complete route's guard/404 shape.
4. **(If Phase 0 chose snapshot)** Extend `completeTask` to persist
   `statusBeforeComplete`/`stageBeforeComplete` before overwriting status.
5. **Tests (backend):**
   - `completeTask` still behaves identically for never-reopened tasks.
   - Uncomplete on missing task → null/404; on non-completed task → no-op.
   - Complete → uncomplete round-trip restores snapshot status/stage and
     appends history + timeline entries.
   - Legacy completed task (no snapshot) falls back to derived/`idle` state.
   - Double-uncomplete is a safe no-op; complete → uncomplete → complete
     works (re-completion re-snapshots).

### Phase 3 — Frontend wiring

1. **Service + mutation:** add `uncompleteTask` to
   `frontend/src/services/work/index.js` (`POST /tasks/:id/uncomplete`) and
   to `useTaskMutations.js` mirroring `completeTask` (refresh + `Task
   Reopened` notification, error log `Failed to uncomplete task`). Extend
   `frontend/src/services/api.surface.test.js` for the new method.
2. **Button swap** in the shared component from Phase 1: when
   `task.status === 'completed'`, render `↺ Uncomplete` (label TBD, confirm
   wording with survey: "Uncomplete" vs "Reopen") wired to the new mutation
   with its own `pendingAction` key (e.g. `'uncomplete'`, separate
   `aria-busy`); otherwise render the existing Complete button unchanged.
   Both detail surfaces inherit the swap automatically.
3. **Card/list coherence:** verify `TaskCard` needs no edit (its
   `isCompleted` branches already key off status); add/extend a
   `TaskCard.test.jsx` case asserting a reopened-status fixture renders the
   non-completed presentation.
4. **Tests (frontend):** mutation hook test (success notification + refresh,
   failure path logs without crashing), button-state test (completed →
   shows Uncomplete; after action shows Complete), accessibility (busy state,
   label).

### Phase 4 — Verification and documentation

1. **Automated gates** (primary gate per repo guidance): `npm run test:unit`
   (api + frontend suites), plus lint for touched packages. If time allows,
   run the full `npm test` runner script path.
2. **Manual/isolated check:** with headless tooling only (no long-lived
   servers; use existing mock fixtures or `npm run capture:screenshot` if a
   visual check is needed): complete a task, confirm the button reads
   Uncomplete, uncomplete it, confirm it behaves like any other task (runnable
   stage actions visible, board filter includes it, retrospective no longer
   counts it completed).
3. **Documentation updates** (part of the change, not an afterthought):
   - User-facing task lifecycle docs: document Uncomplete where Complete is
     described.
   - API surface docs if the repo documents task routes (check
     `agentGuide`/site-docs coverage gates — `docs:check` validates them).
   - CHANGELOG entry if the repo convention covers features.

## 4. Validation plan (how we prove it worked)

| Check | Command / method | Expected evidence |
|---|---|---|
| Backend unit/integration | `npm run test:api` (covers `taskStore`, `stageTransitions`, route tests) | New uncomplete cases green; no regressions in complete/flow tests |
| Frontend unit | `npm run test:frontend` (TaskCard, detail, api.surface suites) | Button-swap and mutation cases green |
| Full unit gate | `npm run test:unit` | Green (primary verification gate) |
| Lint | `npm run lint:api` + `npm run lint:frontend` for touched files | Clean |
| Docs gates | `npm run docs:check` if docs touched | Clean |
| Manual round-trip | Isolated/headless run or fixture-driven check | Complete → Uncomplete → runnable task; board/retrospective coherent |

## 5. Risks and mitigations

- **Wrong restore target** (task reopens into a dead-end stage/status):
  mitigate by snapshotting at complete time (exact) + tested fallback, and by
  Phase 0's consumer audit.
- **Legacy completed tasks** (no snapshot): covered by derivation/`idle`
  fallback + explicit test.
- **Duplicated button drift**: mitigated by extracting the shared component
  before wiring the new action.
- **Reports/analytics double-counting** (a task completed, reopened,
  completed again): timeline entries make each transition explicit; verify
  retrospective stats handle multiple Completed rows or document the caveat.

## 6. Open questions (blocked on missing SURVEY.md / idea file)

1. **Button wording:** "Uncomplete" (task text) vs "Reopen" — confirm the
   survey's chosen label.
2. **Restore target confirmation:** exact pre-completion stage+status (with
   snapshot) vs simply "back to the queue as idle" — confirm Section 0
   assumption 3.
3. **Permissions:** is uncomplete allowed for the same actor as complete, or
   restricted further?
4. **Re-run semantics:** after uncomplete, may the task immediately run the
   next stage, or should it require explicit user action? (Plan assumes the
   latter.)
