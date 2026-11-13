# Dispatch/claim audit — task 55460086 (2026-11-12)

Phase 0 step 1 + Phase 3 step 9 record. Every `project.stages` /
`task.stages` / `activeWorkflowId` / `activeProjectId` read on the
dispatch and claim paths, each marked safe or suspect. Fixed items name
the change; safe items name why.

## Suspect (fixed this task)

- `api/flow/dispatch/taskRequirements.js` — read `task.stages`, else
  `project.stages` (the viewed pipeline's mirror), plus a `stages[0]`
  guess. FIXED: new optional `stages` param; default
  `resolveStagesForTask(project, task)` (the task's own pipeline);
  unknown stage parks (`runnableType: false`, `stageId: null`).
- `api/flow/dispatch/scanClaimableTasks.js:66` — called
  `taskRequirements(project, task)` after correctly resolving the stage,
  then dropped the task on `runnableType: false`. FIXED: passes its
  already-resolved `stages`.
- `api/flow/runnerRoutes.js` `POST /tasks/:id/claim` — same mis-resolved
  `req` drove the operator-config and stage-policy gates. FIXED:
  resolves the task's own pipeline stages and passes them in.
- `api/flow/dispatch/isDispatchServable.js` — `stages[0]` fallback could
  silently mis-resolve later (safe today: only caller passes
  stages+stage). FIXED: strict resolve via `resolveCandidateStage`, no
  `[0]` guess; explicit `stage` stays authoritative for requirements.

## Safe (no change)

- `api/flow/execution/executeStage.js:261` fallback check — calls
  `taskRequirements(project, task)` with no stages; fixed via the new
  workflow-aware default (legacy single-pipeline projects resolve to
  `project.stages` exactly as before).
- `findNextCandidateTask`, `getScheduledQueue`, `isWaitingForPickup`,
  `sortCentralQueue`, `runnerMatches`, `operatorConfigVerdict`,
  `isRunnerClaimable`, `selectRunnerForTask`, `resolveAliasRequirement`
  — resolve via `resolveStagesForTask`/`candidateStageIndex` or take
  `req` as input; no `active*` read.
- `POST /runners/dispatch` core loop, `ciPayloadFor`, attribution
  stamps, integration-lease peek — all use `resolveStagesForTask`.
- `kickIfRunnable` — status check only, no stage reads.
- Runner-side narrowing (`KAINBAIN_RUNNER_PROJECTS` allowlist in
  `runner/daemon.js`, operator project scope, fleet/per-project caps) —
  explicit configuration, not a stall.
- Frontend: no UI code calls `/runners/dispatch` or `/tasks/:id/claim`
  (runner daemon polls); no runner request sends `activeWorkflowId` /
  `activeProjectId` as a scope filter. Verified by grep over
  `frontend/src` (only reads left are view-state + task filing).

## Known same-class items left for follow-up (out of plan scope)

- `POST /runners/:id/skip` (`runnerRoutes.js:475`) advances via
  `project.stages` — wrong next stage for tasks on non-viewed pipelines.
- `resolveStage(project, stageId)` (`stagePolicy.js:326`) searches only
  `project.stages`, so filing a task onto a non-viewed pipeline by
  stage id needs a switch-create-switch-back (used in the new tests).
