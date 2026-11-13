# Implementation Plan — Runners unable to take tasks from non-"active" pipelines

Task: `55460086-15a9-4bb4-89ad-8d0a6eea0d72`
Date: 2026-11-12
Stage: plan (docs-only; no code changed)

## Goal

Runners pick up waiting work from **every** pipeline (workflow) in **every**
project, with no dependence on which pipeline the UI has focused as "active".
The stuck audit-workflow task from the report must be claimed and started
without anyone switching views.

## Success Criteria

1. A task waiting (`in_stage`, runnable, unblocked, unclaimed) on a
   non-active workflow is returned by the runner fleet scan with the
   requirements of its **own** stage, and `POST /runners/dispatch` assigns it
   to a capable runner.
2. The same holds for the direct-claim path (`POST /tasks/:id/claim`).
3. Switching the UI's active pipeline changes **nothing** about what gets
   dispatched (view-only selection).
4. No regression: active-workflow tasks, single-workflow projects, alias
   stages, runner policy/operator-scope gates, and the central-queue order
   (task `16d6fbd6`) behave exactly as before.
5. `npm run test:unit`, `npm run lint`, and `npm run docs:check` pass.

## Background / evidence (researched this run)

- "Pipeline" in the UI is a **workflow inside a project**: `project.workflows[]`
  plus `project.activeWorkflowId` (`api/projectStore.js`). `project.stages` is
  a mirror of the **active** workflow's stages (e.g. `projectStore.js:339,721`:
  `stages: normalizeStages(activeWf?.stages ...)`).
- Both dispatch paths plus the queue display share one central-queue seam
  (`api/flow/scheduler/sortCentralQueue.js`) per
  `docs/EngineDetails/TaskQueueing.md`, and both scans resolve stages the
  workflow-aware way (`resolveStagesForTask` in
  `api/flow/stageResolution.js`, which honours `task.workflowId`).
- **Prime suspect (verified by reading):**
  `api/flow/dispatch/taskRequirements.js:27-35` resolves the task's stage from
  `task.stages` (nothing in `api/`, `runner/`, `shared/`, or `frontend/src`
  ever sets it — reads only) falling back to `project.stages` (the **active**
  workflow's stages), with a `stages[0]` fallback when the id is not found.
  `scanClaimableTasks` (`api/flow/dispatch/scanClaimableTasks.js:66`) calls
  this **after** correctly resolving the stage, then drops the task when
  `req.runnableType` is false. For a task on a non-active workflow whose stage
  ids differ from the active workflow's, the lookup misses, falls back to the
  active workflow's first stage, and the task is either excluded or matched
  against the wrong harness/model/tier/kind/stageId. This precisely produces
  "only the active pipeline's tasks get picked up".
- Same latent pattern lives in `isDispatchServable`
  (`api/flow/dispatch/isDispatchServable.js:31-40`), but its only production
  caller (`executeStage.js:245`) passes already-resolved `stages`+`stage`, so
  it is safe today; it still needs a guard so the fallback cannot silently
  mis-resolve later.
- The direct-claim route computes the same `req` and enforces the same gates
  (`api/flow/runnerRoutes.js:945-964`), so it shares the bug for
  non-active-workflow tasks.
- Cross-project dispatch is already global by design: runners narrow only via
  the explicit `KAINBAIN_RUNNER_PROJECTS` allowlist
  (`runner/daemon.js:2356`, `client.dispatchClaim`), the operator
  project-scope check (`operatorConfigVerdict`, enforced in `runnerMatches`),
  and fleet/per-project caps (`runnerRoutes.js:1116-1130`). `findNextCandidateTask`
  documents that the scan never looks at the UI-focused project
  (`api/flow/scheduler/findNextCandidateTask.js:29-30`). Phase 0 must still
  prove no `activeProjectId`/active-workflow read leaks into any dispatch or
  claim path.
- Tasks are always stamped with `workflowId` at creation (defaulting to the
  then-active workflow, `api/work/taskLifecycle.js:226-235`), so the fix can
  rely on `task.workflowId` plus the deleted-workflow fallback already in
  `resolveStagesForTask`.
- UI state: `activeWorkflowId` is localStorage-persisted view state
  (`frontend/src/context/useWorkflow.js`); the context already supports
  cross-pipeline runner-job jumps (`KainBainContext.jsx:282`). The "single
  active pipeline" impression is presentation, not engine state.

## Survey (SURVEY.md) — decisions

The grill survey (`SURVEY.md`) was generated but **not answered**
(`"answers": {}`). The plan proceeds on the recommendations below; each is
reversible and flagged where the user should confirm.

| # | Survey question | Recommendation (assumed) |
|---|---|---|
| q1 | What to do with "active" pipeline? | **Keep as view-only**: it changes what the operator sees, never what workers do. Do NOT remove the selector (operators still need focus) and do NOT add pause semantics here (scope creep; per-pipeline pause becomes a separate task if wanted). |
| q2 | Fix scope? | **Fix workers + tidy the screen**: backend claim/dispatch fix first; then a small UI pass so nothing implies only one pipeline is live (queue counts already global; labels/copy only). No new pause/resume switch. |
| q3 | Cross-project sharing? | **Keep how it works today, just fix the bug**: runners stay global with the existing project allowlist/scope gates. No new cross-project policy. |
| q4 | Acceptance check? | **Both**: (a) the stuck audit-workflow task starts on its own; (b) waiting jobs on several pipelines all move without switching views. Encode (b) as an automated test, verify (a) against the live report. |

Open question for the user (confirm before Phase 3): is view-only + label
tidy acceptable, or do you want a per-pipeline pause switch? The backend fix
does not depend on the answer.

## Approach — make change easy, then make the change

The bug is a **stage-resolution seam** problem: three consumers resolve "the
task's stage" three different ways. The plan first makes the seam single and
tested (characterization + repro tests, one helper), then flips the two buggy
call sites onto it (a small, reviewable diff), then tidies UI/docs. Big
research and test-scaffolding work comes first; the behaviour change itself is
deliberately tiny and last.

## Steps

### Phase 0 — Prove the mechanism (research + repro, no behaviour change)

1. **Audit every `project.stages` / `task.stages` / `activeWorkflowId` /
   `activeProjectId` read** on the dispatch and claim paths:
   `scanClaimableTasks`, `taskRequirements`, `isDispatchServable`,
   `isRunnerClaimable`, `operatorConfigVerdict`, `runnerMatches`,
   `claimStore` routes in `runnerRoutes.js` (`/runners/dispatch`,
   `/tasks/:id/claim`), `executeStage` cutover, `kickIfRunnable`
   (`api/work/kickIfRunnable.js`), and the queue display. Record each as
   safe (uses `resolveStagesForTask` or caller-resolved stage) or suspect.
   Expected outcome: exactly `taskRequirements` (+ its callers) and the
   `isDispatchServable` fallback are suspect.
2. **Write a failing end-to-end repro test first** (red, committed with the
   fix later): project with two workflows (active `default`, non-active
   `audit`, disjoint stage ids); task A waiting on `audit`; capable runner
   registered. Assert:
   - `scanClaimableTasks` includes task A with `req.stageId` equal to the
     audit stage (fails today: wrong/excluded),
   - `POST /runners/dispatch` assigns task A (use the existing
     `runnerRoutes.test.js` harness style),
   - `POST /tasks/:id/claim` succeeds for task A with correct requirements.
   Keep the repro in `api/flow/dispatch/scanClaimableTasks.test.js` (+ a
   route-level case in `api/flow/runnerRoutes.test.js`).
3. **Characterize current active-workflow behaviour** with a passing test so
   the fix cannot silently change it: same fixture, task on the active
   workflow dispatches identically before/after.

### Phase 1 — Make change easy (single seam, no behaviour change)

4. **Introduce one stage-resolution seam for requirements.** Recommended:
   extend `taskRequirements(project, task, stages?)` (or
   `taskRequirements(project, task, { stages, stage })`) so callers that
   already resolved stages pass them in, and default the missing argument to
   `resolveStagesForTask(project, task)` — never `project.stages` directly.
   Keep the exact legacy return shape. Update the JSDoc `@param`/`@example`
   (repo rule: `npm run check:jsdoc-example` must pass; one function per
   file per `npm run check:one-function`).
5. **Migrate the safe callers to the seam without changing results**:
   `scanClaimableTasks` passes its already-resolved `stages` (it holds
   `cand.stage` today and throws it away); the claim route passes resolved
   stages the same way; `isDispatchServable` callers keep passing explicit
   stages. Prove with the Phase 0 characterization tests: all green, zero
   behaviour delta.
6. **Harden the fallbacks**: remove or loud-fail the `stages[0]` guesses in
   `taskRequirements` and `isDispatchServable` for the unresolved case
   (return `runnableType: false` / `false` with the stage unknown, matching
   `getScheduledQueue`'s strict "no stages[0] fallback" rule). Tasks pointing
   at deleted stages stay parked (existing "leave alone" contract in
   `resolveCandidateStage`), never mis-served.

### Phase 2 — Make the change (the fix)

7. **Flip the default**: with the seam in place, the only behaviour change is
   that `taskRequirements` resolves through `resolveStagesForTask`
   (workflow-aware) instead of `project.stages` (active-workflow-only).
   The Phase 0 repro tests go green here; no other test should change
   outcome. This is intentionally a ~5-line diff plus JSDoc.
8. **Run the full affected suites**: `npx vitest run` in `api/` for at least
   `api/flow/dispatch/`, `api/flow/scheduler/`, `api/flow/runnerRoutes*.js`,
   `api/flow/execution/`, `api/work/kickIfRunnable*`, then the whole
   `npm run test:unit` gate.

### Phase 3 — UI tidy (view-only active pipeline, per q1/q2)

9. **Confirm active-selection is display-only**: grep that no frontend
   dispatch/claim trigger sends `activeWorkflowId`/`activeProjectId` as a
   scope filter; document the result in the task notes.
10. **Copy/label pass only** (no new controls): wherever the UI implies a
    single live pipeline (pipeline switcher label, queue/empty states, runner
    monitor hints), reword to "viewing" language, e.g. "Viewing: Audit —
    runners serve all pipelines". Keep `activeWorkflowId` persistence as is.
11. **Do NOT build** a per-pipeline pause switch in this task. If the user
    answers q1 with "pause switch", spin it off as a follow-up task with its
    own plan (it needs a persisted per-workflow flag, dispatch-gate wiring,
    and UI — a feature, not this bugfix).

### Phase 4 — Docs, rollout, assurance

12. **Docs updates** (same change):
    - `docs/EngineDetails/TaskQueueing.md`: add a short "Workflow-aware
      requirements" note — dispatch resolves each task's stage from its own
      workflow, never the active one; active pipeline is view-only.
    - `CHANGELOG.md`: bugfix entry referencing this task id.
    - Check `npm run docs:check` (link checker + JSDoc examples).
13. **Live verification against the report**: with the fix deployed, confirm
    the stuck audit-workflow task is picked up with no view switching, and
    that `GET /runners/monitor` shows cross-pipeline assignment identity.
    Record the observed evidence (task id, runner, timestamps) in the task
    folder.
14. **Regression watch**: run `npm run test:repeat` for the touched suites if
    available/cheap; run `npm run lint` (api + frontend).

## Validation Plan

| Step | Command / check | Expected evidence |
|---|---|---|
| Repro (red first) | `npx vitest run api/flow/dispatch/scanClaimableTasks.test.js api/flow/runnerRoutes.test.js` (from `api/`) | New non-active-workflow cases fail before Phase 2, pass after; all pre-existing cases pass throughout |
| Scheduler/display parity | `npx vitest run api/flow/scheduler api/flow/taskScheduler.test.js api/flow/singleActiveInvariant.test.js` | Green; central-queue order unchanged |
| Full unit gate | `npm run test:unit` (repo root) | Green (api + frontend) |
| Static gates | `npm run lint`, `npm run docs:check`, `npm run check:one-function` | Green |
| Visual (only if Phase 3 touches layout) | `npm run capture:screenshot` on the pipeline switcher/queue views | Screenshot shows "viewing" wording; no server left running |
| Live acceptance (q4) | Audit-workflow stuck task + multi-pipeline waiting set, no view switching | Tasks start; monitor shows cross-pipeline holds |

Highest-risk validation: the **live acceptance** — the repro tests prove the
mechanism, but only the reported stuck task proves the production symptom is
gone. If it does not move, re-open Phase 0 (suspect runner-side
`projectIds` allowlist scoping or operator project-scope config on that
runner, not the scan).

## Risks / Open Questions

- **q1–q4 unanswered** (`SURVEY.md` has `"answers": {}`). Proceeding on the
  recommendations table above; the backend fix is identical under every
  answer, only Phase 3 scope varies. Confirm the pause-switch question before
  Phase 3.
- **Legacy tasks without `workflowId`**: fall back to `project.stages`
  (active workflow) by design. If the production stuck task lacks
  `workflowId`, Phase 0 must say so explicitly and the fix must include a
  backfill/migration rule — do not guess; read the task record.
- **Runner-config scoping mistaken for the bug**: a runner with
  `KAINBAIN_RUNNER_PROJECTS` set or operator project-scope limits will still
  ignore out-of-scope projects after the fix. That is configuration, not a
  stall — verify runner config during live acceptance before declaring
  failure.
- **Non-goals**: per-pipeline pause/resume, cross-project policy changes,
  scheduler priority changes, removing the active-pipeline selector.

## Work-order summary (big pieces first)

1. Phase 0 audit + red repro tests (research-heavy, de-risks everything).
2. Phase 1 seam + fallback hardening (structural, zero behaviour delta).
3. Phase 2 one-spot fix + full test gate (the change).
4. Phase 3 UI copy tidy (small, needs q1 confirmation).
5. Phase 4 docs + live acceptance + regression watch (assurance).

