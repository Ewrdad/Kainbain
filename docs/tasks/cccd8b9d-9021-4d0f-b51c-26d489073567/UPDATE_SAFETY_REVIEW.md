# Update-safety review: Uncomplete (reopen) — existing installs

- **Branch:** `kb/cccd8b9d-9021-4d0f-b51c-26d489073567` vs `main` (`93970db0…`)
- **Head:** `6ba182aa` “persist pre-completion snapshot … kick scheduler on reopen”
- **Scope:** 33 files, all additive except `completeTask` snapshot (see below).
  No `package.json`, env, config, runner, or deploy changes.
- **Question:** does this break existing installs on update (startup crash,
  task loss, corruption, wedged scheduler)? **Verdict: PASS — no break found.**
  This file is the audit trail; the stage verdict is in the final message.

## 1. Persisted `task.md` frontmatter — the main install risk

- New fields `statusBeforeComplete` / `stageBeforeComplete` in
  `api/work/taskPersistence.js` `saveTaskMarkdown` are written **only when
  truthy** (`...(task.statusBeforeComplete ? […] : [])`). `null`,
  `undefined`, and `""` all omit the line. `createTask`
  (`api/work/taskLifecycle.js`) never initializes them, and `uncompleteTask`
  clears them to `null`, so a never-completed or reopened task re-saves
  byte-identical to pre-feature shape (except additive history/timeline).
- `parseTaskMarkdown` reads them as `data.statusBeforeComplete || null`.
  Absent on legacy files → `null`, no throw. Verified in memory:
  legacy file parses to `status: completed, currentStageId: stage-3,
  snapshot: null/null`; file with `paused/stage-2` parses back exactly.
- `_parseFrontmatter` (`api/work/taskFiles.js`) is unchanged from `main`
  (verified via `git show main:…`): it maps every `key: value` line into
  `data`. Old code therefore **ignores** the two new keys rather than
  rejecting them; new code **defaults** missing keys to `null`. Both
  directions are tolerant. Downgrade note: old code re-saving a new
  completed file drops the snapshot lines but preserves
  `status: completed` — the task stays completed, only the reopen fidelity
  is lost. That is acceptable downgrade loss, not corruption.
- Quoting reuses the existing `_formatFrontmatterValue` channel already used
  for `currentStageId` (escape `\` then `”`, quote wrapping). Round-trip
  verified, including quoted-stage edge case.

## 2. `completeTask` / `uncompleteTask` semantics

- `completeTask` (`api/flow/stageTransitions.js`) early-returns when already
  `completed`, so **legacy completed tasks are never mutated** on first
  `completeTask`/`scanTasks`/save after upgrade. Verified: re-complete is
  same-object no-op, history length and snapshot unchanged.
- `resolveReopenedStatus` (`api/flow/stagePolicy.js`) is pure and total:
  `null` → `{ idle, null }`; legacy completed → `{ idle, currentStageId }`;
  `running_*` snapshot → `{ in_stage, … }`; terminal snapshot
  (`completed/done/failed/cancelled` via `isTerminalTaskStatus`) → `idle`;
  whitespace snapshot → `idle`. Verified for all six cases.
- `uncompleteTask` returns `null` for missing, same task for non-completed
  (mirrors `completeTask` idempotence), pushes one `Uncompleted` history and
  one `Reopened` timeline row, never interrupts/starts a run. Verified:
  complete → uncomplete restores `paused/s-1`, clears snapshot to
  `null/null`, double-uncomplete stays a no-op (one `Uncompleted` entry).

## 3. Other consumers — no break

- **Route:** `POST /tasks/:id/uncomplete` (`api/flow/taskFlowRoutes.js`)
  mirrors `complete`: same `resolveAndGuardProject`, same 404 shape, additive
  path (no shadowing of `/tasks/:id`). Old clients never call it; new
  frontend call failure is caught and logged (`useTaskMutations.js`), not a crash.
- **Timeline/history:** `Reopened` rows carry `duration: "--"`,
  `durationSeconds: undefined`. `shared/stageDurations.js`
  `parseDuration("--")` → `null` and is ignored; `runAttribution.js`
  `isArrivalTimelineRowStatus("Reopened")` → `false` (not an arrival, never
  stamped); frontend `timelineDotClass`/`timelineTextClass` fall through to
  `bg-secondary`/`text-secondary`. `timelineMetadata` JSON round-trips the
  `Reopened` row (verified in memory). History `Uncompleted` has no enum
  consumer that would reject it.
- **Scheduler:** `TaskStore.uncompleteTask` runs the existing
  `_kickIfRunnable` → `kickIfRunnable` (`api/work/kickIfRunnable.js`), which
  only kicks on `in_stage` and never throws. Unknown/stale restored stage
  safely parks: `findNextCandidateTask` skips `stageIndex === -1`.
  `WORKTREE_REAPABLE_STATUSES` handling is unchanged; a missing worktree is
  re-provisioned on next pickup (`ensureTaskWorktree`).
- **Startup:** `scanTasks` (`api/work/taskLifecycle.js`) just parses + syncs
  reports; `ORPHANED_RUNNING_STATUSES` recovery is untouched. Completed
  tasks are never auto-resumed. Board `excludeCompleted`
  (`api/work/taskWorkRoutes.js`) and `isTaskBlocked` keep keying on
  `status !== "completed"`, so a reopened task correctly reappears / re-blocks.
- **Summaries:** `toTaskSummary` (`api/work/taskIdentity.js`) passes `…rest`
  through, so summaries now carry `statusBeforeComplete: null|string` additively.
  Old frontends ignore unknown JSON fields; no strict-equality consumer found.
- **Frontend:** `TaskCompleteToggleButton.jsx` preserves the old Complete
  rendering for non-completed tasks (same default classes; detail-page call
  site keeps its `px-4` override). `disabled={isMutating || pendingAction ===
  action}` is equivalent to the old `disabled={isMutating}` because
  `isMutating === pendingAction !== null` in both shells. Wiring
  (overlay → details tab, detail page, context) is complete; `testUtils` stub updated.
- **Docs:** `api/agentGuide.js` endpoint + `site-docs/api-reference.md` and
  `site-docs/pipeline-stages.md` additions are additive.

## 4. Evidence

- Inline Node (no files written): legacy/new parse, save-conditional,
  `resolveReopenedStatus` ×6, `complete`/`uncomplete` idempotence + missing
  + legacy→`idle`, `kickIfRunnable` never-throws.
- Targeted suites at HEAD (observed): `work/taskPersistence.test.js` 74 pass;
  `flow/stagePolicy.test.js` + `flow/stageTransitions.test.js` 88 pass;
  `routes/tasks.test.js` 38 pass; `taskStore.test.js` 160 pass;
  `TaskCompleteToggleButton.test.jsx` 5 pass. Prior full-run report
  (`automated-tests-failure-20261115-232533.md`) showed API PASS; its two
  frontend failures (104-vs-105 count, undisabled busy button) were fixed in
  `b125fbbd` and the JSDoc baseline now reads
  `PASS (680 missing, baseline (680 grandfathered))`.

## 5. Intended behaviour changes (not breaks)

- `running_*` snapshot reopens as `in_stage` (completing killed the run).
- Terminal snapshot collapses to `idle`; reopened `waiting_human` loses its
  prior `autoApproveAt` deadline (waits for explicit operator action).
- `enteredStageAt` is not reset on reopen, so duration analytics may show a
  long `timeInStage` for the revisited stage. Only affects tasks that use
  Uncomplete; existing untouched tasks are unaffected.

## 6. Conclusion

No startup crash, data loss, scheduler wedge, or API/frontend break on update
was found. Existing completed, failed, paused, and queued tasks load and
behave as before; only tasks completed **after** the update carry a snapshot,
and only an explicit Uncomplete action reopens them. **PASS.**
