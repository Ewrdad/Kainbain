# Research spike — develop alongside KainBain (E0.1 + E0.2)

Date: 2026-11-09. Question: what must a developer know to hand-edit a
KainBain-managed project safely, and what product seams does that need?
Sources read, not guessed: `api/flow/stageTransitions.js`
(`pauseTask`/`resumeTask`/`interruptLiveRun`), `api/flow/taskControl.js`
(`abortTask`, `steerTask`), `api/flow/taskFlowRoutes.js`,
`api/work/taskBranches.js`, `api/work/taskWorkspace.js`,
`api/work/taskWorkRoutes.js` (`GET /tasks/:id`), `api/git/branch.js`,
`api/git/workingTreeRecovery.js` (`recoverDirtyTree` ladder,
`requireCleanWorkingTree`), `api/git/workingTreeStatus.js`,
`api/projectStore.js` (`workspaceIsolation`), `frontend/src/components/tasks/TaskDetailPageContent.jsx`
+ `taskBranch.js`, `site-docs/api-reference.md`,
`site-docs/pipeline-stages.md`, `site-docs/red-shared-gate.md`.

## R1 — control-surface truth

- **Pause kills the live run, it is not scheduler-only.** `pauseTask`
  calls `interruptLiveRun`, which runs `killTaskProcess` (child process
  group) plus `sessionStore.abort()`, then releases engine ownership and
  parks the task as `paused`. A paused task keeps engine ownership
  recorded so the settling run's cleanup releases the engine to idle
  instead of stranding it. (`api/flow/stageTransitions.js`)
- **Resume re-runs the current stage from scratch.** `resumeTask` sets
  `in_stage` and calls `executeStage` for the current stage. Uncommitted
  partial agent work from the killed run is lost; committed work on the
  task branch (agent or hand-made) survives and is picked up. Hand edits
  must therefore be **committed on the task branch** before resume.
- **Remote-runner leases:** when a Runner holds the task, `steerStore`
  queues guidance against the lease (`D5 unified steer`, ADR 0011) and
  the files may live on another machine. Pause still parks the task, but
  there are no local files to edit — steer or wait for a review gate.
- **Visibility audit:** `GET /tasks/:id` returned the full task plus
  `claim` (live Runner holder) but nothing derived: no guaranteed branch
  name, no isolation mode, no worktree path. `task.branch` is only set
  when explicitly patched; the frontend derived `kb/<id>` itself
  (`taskBranch.js`). Gap confirmed → §4.2 helper + `workingLocation`
  field + inspector line.
- **Dirty-tree guard:** `requireCleanWorkingTree` runs the Step 1
  automated recovery ladder first (`recoverDirtyTree`: sweep engine
  debris → marked stash `kainbain-task-<taskId>` for tracked edits →
  journaled via `drainDirtyTreeRecoveries`), and throws
  `GitDirtyTreeError` with blocking paths + ladder trail only when still
  dirty. Untracked user files are never swept or stashed — they survive
  to the failure report. Implemented literally, the plan's original
  "message-only, no auto-stash" §4.3 would have regressed this ladder
  (risk-review failure 2026-11-09); §4.3 was recomposed as a
  message-only improvement **on top of** the ladder
  (`HAND_EDIT_RECOVERY_HINT` appended to both throw paths).
- **Merge story:** per-task branches (`kb/<taskId>`, `taskBranches.js`)
  merge back per the pipeline; `main` movement is the normal rebase/merge
  case. Hand edits belong on a separate branch merged first (Flow A) or on
  the task branch while paused (Flow B) — never force-pushed over `kb/*`.
  Conflicts fail the merge stage (`GitMergeConflictError`, auto-abort)
  instead of overwriting.

## Survey confirmation (received during implementation, 2026-11-09)

`SURVEY.md` was answered after the plan stage (previously `"answers": {}`).
Confirmed values vs the §0 proposed defaults:

- Q1 now selects **separate branch as the primary meaning** of "working
  alongside" (not pause-first). The guide was reordered accordingly: Flow A
  is the separate-branch flow, Flow B is pause-edit-resume. Both flows
  were already in scope (Q2 confirmed all four change kinds).
- Q3 selects Other with notes "needs a smart merge. fail a merge stage
  etc". Satisfied by existing behaviour, documented in Flow A: merges run
  `merge --no-edit` / `merge --squash` with auto-abort on conflict
  (`MERGE_STRATEGY`, `SQUASH_MERGE_STRATEGY` in `api/git/merge.js`) and a
  conflicted merge throws `GitMergeConflictError`, failing the merge stage
  for human resolution instead of overwriting. No new merge machinery.
- Q4 selects "a safe separate setup" with notes "maybe a create branch
  button or something". Covered by the existing task-branch ownership +
  `Copy Checkout` button + `workingLocation`; a dedicated create-branch
  button is recorded as a follow-up, not built in this stage (new UI
  widget, explicitly tentative in the notes).
- Q5/Q6 match the defaults (simple steps first; detailed walkthrough).
  The walkthrough runbook covers Q6.

## R2 — docs contract + conflict inventory + settings taxonomy

- **Site-docs contract** (`site-docs/README.md`): four frontmatter fields,
  unique `order` per section, `#/docs/<slug>` cross-links resolved by the
  integrity test, `bash`/`text` fences, pipe tables, no raw HTML, no
  secrets. Chosen: slug `develop-alongside`, section `working-with`,
  order `46` (free: neighbours are 40/45/50). Verified at build time by
  `npm run docs:check`.
- **"Only the agent writes" sites (top load-bearing):** working-tree
  cleanliness guards (`workingTreeStatus.js`), the recovery ladder
  (`workingTreeRecovery.js`), branch switches (`git/branch.js`,
  `ensureTaskBranch`), staged auto-commits (`commitAllIfNeeded` with
  `expectedBranch` affinity), report/task-markdown writers
  (`_saveTaskMarkdown`), quarantine/worktree provisioning
  (`taskWorkspace.js`). All are already safe under pause; the ladder
  covers the dirty case; no new locking or scheduler work needed.
- **Settings taxonomy:** safe with task paused = pipeline files, project
  settings, review comments. Never hand-edit = `.kainbain/` state
  (`sessions/`, `worktrees/`, `quarantine/`), `docs/tasks/` bookkeeping,
  another task's `kb/*` branch. Matches `existing-projects.md` and
  `projectStore.js` (`workspaceIsolation`: `quarantine` default,
  `worktree` opt-in, `off`).

## Decision record

- §0 survey defaults confirmed as-is (survey unanswered): warn-don't-clobber,
  pause-first primary flow, concurrent same-file editing unsupported.
- §4.1: verification-only — pause/resume already round-trips; no code change.
- §4.2: built (`resolveTaskWorkingLocation` + `workingLocation` + inspector line).
- §4.3: message-only on top of the ladder (risk-review composition).
