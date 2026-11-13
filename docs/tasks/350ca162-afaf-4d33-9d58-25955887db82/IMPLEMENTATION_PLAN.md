# Implementation Plan — Global Runners Across Pipelines

## 0. Problem statement

The Runner fleet monitor behaves like a view scoped to the pipeline the
operator is looking at. When a Runner is executing work for *another* pipeline,
the UI only knows that Runner's `runnerId`, `projectId`, `taskId`, and
`stageId`. Task titles and stage names can only be resolved from the `tasks`
and `stages` arrays that belong to the *currently selected* project/workflow,
so a cross-pipeline assignment renders as "Task details unavailable" and a raw
stage id. The Runner card also has no way to take the operator to that work,
which is why the card looks "held steady."

The grill-me survey settled the product contract:

- q1: show the *real* job and step being worked on, even when they belong to
  another pipeline;
- q2: the Runner list must look identical on every pipeline page — all
  Runners, all the time;
- q3: clicking/tapping a Runner that is busy elsewhere must jump to that job in
  its own pipeline;
- q4: the name and step must update live while work moves along.

## 1. Governing principle — make the change easy, then make the change

Phase A (easy) makes every Runner-dependent surface independent of the
selected project/workflow and centralises cross-pipeline lookup on the backend.
Phase B (change) swaps the scoped data flow for the global one and adds
navigation. Each phase lands with its own tests, so regressions are caught
before the next phase begins.

## 2. Definitions used throughout

- **Pipeline** = project + active workflow. A "different pipeline" means a
  different `projectId` and/or `workflowId` than the view the operator is on.
- **Assignment** = one row of `GET /runners/monitor#liveAssignments`, produced
  from `ClaimStore.liveHolds()`.
- **Runner card** = desktop `PerRunnerTasksWidget` card and compact mobile row.
- **Stage name** = display name resolved from the task's own workflow stages,
  never from the view's `stages` array.

## 3. Phase A — make the data global (backend first)

### A1. Backend: enrich `liveAssignments` with cross-pipeline identity

File: `api/flow/runnerRoutes.js`, handler `GET /runners/monitor`.

For each hold, resolve (best-effort, never throw):

1. `project = projectStore.getProject(hold.projectId)`.
2. `task = taskStore.getTask(hold.projectId, hold.taskId)`.
3. `stages = resolveStagesForTask(project, task)` (already used elsewhere).
4. `stage =` first stage whose `id === hold`'s reported stage or
   `task.currentStageId`; resolve its display name (`stage.name || stage.title`).
5. `workflow = projectStore.getWorkflow(projectId, task?.workflowId)` when
   `task.workflowId` is set; otherwise `projectStore.getActiveWorkflow`.

Add these fields to the assignment object, keeping every existing field
identical so older UI/clients do not regress:

```text
projectName: project?.name ?? null,
workflowId: task?.workflowId ?? null,
workflowName: workflow?.name ?? project?.activeWorkflowName ?? null,
taskTitle: task?.title ?? null,
taskGoal: task?.goal ?? null,
taskStatus: task?.status ?? null,
stageName: stage?.name || stage?.title || (stageId ? String(stageId) : null),
```

Guard each lookup in try/catch and default to `null`; a missing task/project
must still produce a valid assignment carrying the raw ids.

Introduce a small helper `buildRunnerAssignmentSummary({ hold, projectStore,
taskStore })` in a new module
`api/flow/runnerAssignmentSummary.js` so the monitor handler stays short and
the summary logic is unit-testable without Fastify.

### A2. Backend: cross-pipeline task hydrate path is already available

No new endpoint is required: `GET /tasks/:id?projectId=...` already accepts
`projectId`. Document in `api/flow/runnerRoutes.js` comments that cross-pipeline
Runners expose both ids, which is what the UI uses to hydrate full task details
(log entries, reports). This keeps A1's payload small.

### A3. Backend tests

Extend `api/flow/runnerRoutes.test.js` monitor assertions:

- an assignment whose `projectId` differs from the test's "active" project
  still returns `taskTitle`, `stageName`, `projectName`;
- missing task returns the assignment with those fields `null` rather than
  throwing;
- stage name resolves from the task's workflow when `project.stages` differs.

## 4. Phase B — make the UI consume the global data

### B1. Widget: resolve details from the assignment first

File: `frontend/src/components/observability/widgets/PerRunnerTasksWidget.jsx`.

Precedence for task display:

1. a local `task` from the `tasks` prop when `task.id === assignment.taskId`
   and its `projectId` matches (rich object — log tail available);
2. otherwise a lightweight task built from `assignment.taskTitle` /
   `assignment.taskGoal` / ids (global fallback).

Precedence for stage name:

1. `stageById.get(assignment.stageId)` when the view's `stages` contain it;
2. otherwise `assignment.stageName`;
3. otherwise the raw id (current behaviour).

Add a small pure helper `resolveAssignmentTask(assignment, localTask)` and
`resolveAssignmentStageName(assignment, stages)` exported from the widget module
so tests exercise them directly.

### B2. Widget: hydrate cross-pipeline tasks for the log tail

Add internal state `hydratedTasks: Map<string, task>`. On new assignments whose
task is not in the local `tasks` prop and whose `projectId` is known, call
`api.getTask(projectId, taskId)` once (guarded by a ref of requested ids) and
merge the result into a `taskById`-style map used for `RunnerLogTail`.

Fail closed: a rejected hydrate leaves title/stage from A1 intact; the tail
simply stays empty. Never throw from render.

This keeps log tails live for runners on the current pipeline and makes them
appear for other pipelines when their task detail poll lands; because the tile
already shows title/stage immediately from A1, the card never looks stuck.

### B3. Widget: do not depend on view filters

Callers in `ObservabilityDashboard.jsx` and `MobileMonitorView.jsx` today pass
`filteredTasks` / `runnerTasks`. Keep accepting those props (back-compat), but
document their intent as "optional enrichment for the active pipeline." The
card must render correctly with `tasks=[]` for a cross-pipeline assignment
because A1 provides the identity.

### B4. Widget: clickable Runner jumps to its job

Survey q3. Add an explicit "Open task" affordance in the full card and compact
row that calls a new optional prop `onOpenTask(assignment)`.

Keep the rest of the card non-navigable so existing selection/edit tests do not
break.

### B5. Navigation plumbing

File: `frontend/src/context/KainBainContext.jsx`.

Expose a memoised `openRunnerTask(assignment)`:

- validate `assignment.projectId` and `assignment.taskId`;
- if `projectId !== activeProjectId`, call `selectProject(projectId)` first
  (this loads tasks + workflow + WebSocket);
- fetch the full task via `api.getTask(projectId, taskId)`;
- `setSelectedTask(full)`;
- switch to the orchestrator view (or canonical task view) and, when needed,
  focus the task's stage;
- on failure, `notifyError('Could not open Runner task', …)` and log.

Pass `openRunnerTask` through context value. `ObservabilityDashboard` and
`MobileMonitorView` consume it via `useKainBain()` and forward as `onOpenTask`
to `PerRunnerTasksWidget`. This keeps the widget testable with a mock callback.

## 5. Phase C — "global and identical on every page" (UI shell)

### C1. Stop filtering Runners by selected project anywhere

Audit every callsite in `frontend/src` that reads Runner state and gates it on
`selectedProjectId`:

- `ObservabilityDashboard.jsx`: `runnerTasks={filteredTasks}` may remain for
  enrichment, but the widget no longer depends on it for identity. Do not
  wrap `PerRunnerTasksWidget` in a project filter; it always polls
  `/runners/monitor` (global).
- `MobileMonitorView.jsx`: same.
- Any dashboard preset that hides the runner widget when no task is running in
  the selected pipeline: remove the condition; the widget decides emptiness
  from the global assignment list.

### C2. Keep one poller

`useRunnerMonitor` already polls `/runners/monitor` (global backend endpoint).
Do not add a per-project variant. Document that this endpoint is intentionally
project-agnostic.

### C3. Live progress

The 5s poll in `useRunnerMonitor` plus the 1s elapsed timer already covers q4.
Use the assignment's `executionId` + `stageId` in the card key so React
re-renders when the stage changes even for injected overrides.

## 6. Make-change-easy refactors (landed before Phase B)

1. Extract `buildRunnerAssignmentSummary` (backend) with unit tests.
2. Export the two resolve helpers (frontend) with unit tests.
3. Add `openRunnerTask` as a no-op-safe context action before wiring callers.
4. Add JSDoc `@example` lines marking the new fields.

## 7. Testing plan

### Backend

- `api/flow/runnerRoutes.test.js`
  - monitor includes identity fields for a cross-project hold;
  - handler returns `null` fields rather than 500 when task/project missing;
  - workflow-specific stage names win over `project.stages`.
- `api/flow/runnerAssignmentSummary.test.js` (new)
  - pure function edge cases: missing task, missing project, unknown stage id,
    workflow with own stages.

### Frontend unit (`npm run test:unit`)

- `PerRunnerTasksWidget.test.jsx`
  - existing tests continue to pass (back-compat for `tasks`/`stages`);
  - new test: assignment with `projectId: 'other'`, no matching `tasks` prop,
    no matching `stages` prop renders `taskTitle` and `stageName` from the
    assignment (this is the regression guard for the issue);
  - new test: clicking the open-task affordance calls `onOpenTask` with the
    assignment;
  - new test: rejected `api.getTask` leaves title/stage intact and no crash.
- Add tests for `resolveAssignmentTask` and `resolveAssignmentStageName`.

### Frontend integration-ish

- `ObservabilityDashboard` smoke test: with `selectedProjectId` set to project A
  and an assignment on project B, the runner card still shows project B's task
  title.

### Manual / visual verification

- Follow repo guidance: `npm run capture:screenshot` for monitor (desktop + mobile
  widths) showing a cross-pipeline assignment, plus an engine-state check.
- Prefer existing mocked assignments in tests; do not start long-lived servers.

### Regression gate

- `npm run test:unit` must pass.
- `npm run lint` must pass for touched files.
- Add one fixture to the existing runner widget test file rather than a new
  parallel file, to keep the test surface small.

## 8. Documentation plan

- Update `AGENTS-MAP.md` / runner docs snippet for "Runners are global: their
  monitor never filters by the selected pipeline."
- JSDoc updates:
  - `GET /runners/monitor` response shape (new identity fields);
  - `PerRunnerTasksWidget` props (`onOpenTask`, enrichment-only `tasks`);
  - `useRunnerMonitor` already-global note.
- Add a short ADR note or changelog entry under `CHANGELOG.md` referencing the
  issue title.

## 9. Rollout / compatibility

- All new backend fields are additive; old frontends ignore them.
- Old backends (without A1) make the UI fall back to tasks/stages as today;
  B1 keeps that path working.
- `onOpenTask` is optional; tests that do not pass it keep rendering.
- No DB/schema migration: holds are in-memory; new identity comes from the
  existing task/project stores.

## 10. Out of scope

- Converting the scheduler/queue to be pipeline-independent (it already is for
  ownership; only the Runner *display* was scoped).
- runner-side (process) changes: the Runner already reports `projectId` etc.
- Changing routes or auth model.

## 11. Success criteria (Definition of Done)

1. A Runner working on pipeline B shows its real task title + stage name while
   the operator views pipeline A.
2. The Runner list is identical across pipeline views (no filtering by selected
   project).
3. Clicking a Runner on another pipeline navigates to that task in its pipeline.
4. Name + stage update at least on the next 5s poll while work moves stages.
5. All new + existing tests pass; no console errors in monitor views.
