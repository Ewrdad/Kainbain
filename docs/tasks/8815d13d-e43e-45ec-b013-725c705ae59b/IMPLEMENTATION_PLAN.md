# Implementation Plan: Active Task Retry State Review

> **Task title:** "review the active states a task can be"
> **Problem:** Every task appears stuck in the retry state, so the task status is not useful for showing what is actually happening.
> **Survey basis:** `SURVEY.md` (two grill-me rounds). The saved survey answers are empty, so §1 records the defaults this plan locks for implementation; any change to those defaults needs an explicit note in the PR.
> **Principle:** Make change easy, then make the change.
> **Primary verification gate:** `npm run test:unit` plus the canary specs touched by retry/auth/error display.

---

## 1. Survey Decisions Locked For This Plan

The grill-me rounds asked how retry state should look and behave. Because no answers were recorded, the following authoritative defaults are used throughout this plan. They match the existing UI intent where possible and are chosen to match the survey's "Recommended"-style wording.

| ID | Question (SURVEY.md) | Locked decision |
| ---- | ---------------------- | ----------------- |
| Q1 | What does "stuck on retry" look like? | Both: the `RETRYING` badge persists **and** the retry never visibly runs again |
| Q2 | How long should retry show? | Only while a retry is genuinely awaiting execution; clear it the moment a new attempt starts or the task parks |
| Q3 | Final status after budget exhaustion | `failed` / parked, with the last error visible; never a dangling `RETRYING` |
| Q4 | Clear the previous failure after a successful retry? | Yes — clear `failureReason`/`lastError` on the successful attempt (already done in `executeStage`) |
| Q5 | Where must retry state be visible? | Task card badge, inspector header, stage timeline/history, and the Now Playing bar |
| Q6 | Scheduled-but-not-started retry | Show `RETRYING (scheduled)` with attempt `x/y` and the next-attempt timestamp |
| Q7 | Retry progress details | Show `attempt x of y` plus the remaining wait (numeric `nextRetryAt`, not a new timer library) |
| Q8 | What counts as active work on the board? | Running stage, scheduled retry, and waiting-for-human. Parked-after-failure is **not** active |
| Q9 | Manual retry after exhaustion | Keep history, reset the retry budget (via existing `resetAttemptBudgets`) |
| Q10 | Automatic vs operator retries | Distinguish them: auto retries say "Retrying"; manual retries say "RETRYING (manual)" and clear preceding `autoRetrying` |

---

## 2. The Active States A Task Can Be In

Today the backend field is `task.status`, the scheduler keys off `in_stage`, and retry is an orthogonal boolean (`task.autoRetrying`) plus counters (`autoIterationCount`, `infraRetryCount`). That split is exactly why a task can display one thing while the engine stores another.

### 2.1 Backend scheduling statuses (must stay authoritative)

| Status | Who writes it | Runnable? | Meaning |
| -------- | --------------- | ----------- | --------- |
| `idle` | `taskLifecycle` / create | no | Created but not yet placed in a stage |
| `in_stage` | `taskControl`, transitions, execution entry | yes | Sitting in a stage awaiting (re)dispatch |
| `waiting_human` / `checkpoint` | `executeStage`, human checkpoints | no | Paused at a human/review gate |
| `running_agent` / `running_ci` / `running_deploy` | runner watchdog / legacy | historical | Kept only for backward compatibility of old task files |
| `advancing` | stage transitions | transient | Moving to the next stage |
| `blocked` | dependency resolution | no | Held by unfinished blockers |
| `paused` | operator/engine | no | Paused deliberately |
| `interrupted` | stop/crash/reconcile | maybe* | Interrupted, resumable through the continuity plugin |
| `failed` | failure routing | no | Current stage failed and parked (or budget exhausted) |
| `passed` | CI/merge stages | no | A CI or merge stage passed |
| `completed` / `done` | completion paths | no | Through its pipeline |

`*` `interrupted` is only runnable through `isAutoResumable` in `api/flow/scheduler/isSchedulerRunnable.js`.

### 2.2 Retry metadata (must become first-class)

| Field | Writer | Meaning |
| ------- | -------- | --------- |
| `autoRetrying` | `handleTransientFailure`, `handleStageFailure` via `beginAutoIteration`, `deferForCircuitTrip` | Legacy display flag: a retry is inflight or scheduled |
| `autoIterationCount` | `beginAutoIteration` | Auto-failback attempts spent |
| `infraRetryCount` | `handleTransientFailure` | Transient infrastructure retries against the same stage |
| `transientRetryLadder` | `handleTransientFailure` | Per-attempt delay + signal for timeline display |
| `lastError` / `failureReason` | failure handlers | Latest stage failure context |
| `supersededStageId` | operator move | Orphaned-run guard |
| `enteredStageAt` | transitions / `resetAttemptBudgets` | Stage clock anchor for pace timers |

### 2.3 Derived UI states (TaskCard / TaskDetail / stagePace)

The frontend collapses the above into presentation labels. This is the source of drift:

- `TaskCard.jsx:445` — `isRetrying = task.autoRetrying === true`
- `TaskDetailPageContent.jsx:288` / `TaskDetailOverlayContent.jsx:335` — same
- `stagePace.js:92` — auto-retry counts as running for pace colour
- `retrospectiveStats.js:99` — a retrying task is not yet "failed"
- `useTasks` / board filters — active vs parked groupings

Because `autoRetrying` is a **display hint** rather than a **transition flag**, every site derives "retrying" independently. If one writer forgets to flip it, the task stays `RETRYING` forever.

---

## 3. Root Cause Analysis: Why Tasks Stick On Retry

There is no single cause; the state is lost at four hand-off points. All of them must be fixed together, otherwise one will reintroduce the stuck badge.

### 3.1 The parked-on-terminal-first failure path in `handleStageFailure`

`handleStageFailure` (api/flow/routing/orchestrators/handleStageFailure.js)
flips `task.status = "failed"` and clears the timeline, but the **only**
`autoRetrying` mutation on that path happens inside `beginAutoIteration`,
which **only runs when a retry is actually granted**. When the budget is
exhausted it returns `null`, so `task.autoRetrying` keeps whatever value a
*previous* attempt left behind. A task that retried once and then parked is
therefore displayed as `RETRYING` by `TaskCard` even though `status ===
failed`.

Fix: park locally and unconditionally clear every retry flag/countdown at
every terminal outcome (`failed`, exhausted budget, `skipFailback`, operator
move, interrupted).

### 3.2 The retry arming gate depends on `schedulerRunning`

Both failure handlers arm the next attempt like this:

```js
if (taskStore.schedulerRunning) {
    setTimeout(() => { taskStore.scheduleTick().catch(() => {}); }, nextDelayMs);
}
```

(`handleTransientFailure` bottom, `handleStageFailure` bottom, `beginAutoIteration` path)

If the scheduler is **not** running at the moment the timer fires — which is
exactly what happens after a stop/restart, a watchdog stall, or a paused
engine — the retry is silently dropped and `autoRetrying` remains `true`.
The task is then "stuck on retry" with no future dispatch.

Fix: persist a `nextRetryAt` (ISO) on the task and make retry arming go
through one `armRetry(taskStore, task, delayMs)` helper that (a) always
records the deadline, (b) attempts `kickScheduler` after the delay when the
scheduler is running, and (c) leaves an explicit `retryScheduled: true`
marker that the board and the monitor can render even when the engine is
stopped. A stopped engine with a due retry is "waiting for the engine", not
"retrying forever".

### 3.3 State defaults to the scheduling vocabulary, but UI reads a different one

The backend `TASK_STATUSES` in `api/agentGuide.js` does not contain a retry
state, so HTTP/MCP consumers cannot tell a retrying task from an idle
`in_stage` one. `handleTransientFailure` returns `{ status: "retrying" }`
but only persists `task.status = "in_stage"`, which is contradictory.

Fix: keep `in_stage` as the **scheduler identity** (so claim/scan logic must
not change), and add a separate, versioned `task.retryState` enum plus
`task.nextRetryAt`. The backend keeps one rendering vocabulary; the UI no
longer reverse-engineers it from a boolean.

### 3.4 Counters and flags are cleared by scattered ad-hoc statements

`executeStage` clears `autoRetrying = false` and failure fields at start.
`resetAttemptBudgets`, `resetAutoIteration`, `autoResumeTask`, `settleOperatorAbort`,
`deferForCircuitTrip` each re-implement pieces. `beginAutoIteration` sets the
flag but **never clears it again on the retry's success path other than
`executeStage`**. When a retry is skipped by claim offloading, or when the
task is re-dispatched outside `executeStage`, the flag survives.

Fix: move all retry-state transitions into one shared helper and call it
from the single lifecycle entry points, so no dispatcher can bypass it.

---

## 4. The "Make Change Easy" Phase (No Behaviour Change To Shipped Paths)

This phase ships helpers + tests + documentation only. No runnable behaviour
changes yet; every production site keeps reading `task.autoRetrying` while
also understanding the new helper, so the change lands in small, reviewable
commits.

### 4.1 Shared helper: `shared/taskRetryState.js`

Mirror the `shared/servingModelFor.js` / `shared/formatPosture.js` pattern:
one file, consumed by `api/`, `frontend/`, `runner/` (via re-export from
`api/flow/`), so all three can never drift.

- **Exported API (pure, no I/O):**

  ```js
  export const TASK_RETRY_STATES = { NONE: "none", SCHEDULED: "scheduled", RUNNING: "running", EXHAUSTED: "exhausted" };

  export function retryStateOf(task)            // -> { state, attempt, maxAttempts, nextRetryAt, hasRetryableSchedule }
  export function isRetryingTask(task)          // true for SCHEDULED / RUNNING only
  export function retryProgressLabel(task)       // "Retrying 2/5" | "Retrying (scheduled, 2/5)" | ""
  export function clearRetryState(task, opts)    // clears autoRetrying, retryState, nextRetryAt (preserves history)
  export function setRetryScheduled(task, { attempt, maxAttempts, nextRetryAt })
  export function isRetryStuck(task, nowMs)      // true when SCHEDULED and nextRetryAt is older than grace window
  ```

- **Backward-compat rule:** if no `task.retryState` exists, derive it from
  `task.autoRetrying === true` → `SCHEDULED` (= legacy "flag set"). This
  keeps every old task file readable without migration.
- **Grace window:** `2 × delay + 30s` (so a task scheduled 2 s ago is not
  declared stuck; only a long-overdue one is).

### 4.2 Backend mirror: `api/work/taskRetryState.js`

A thin wrapper that imports the shared module and adds task-store-aware
operations:

```js
export function readRetryState(task)
export function setRetryScheduled(taskStore, projectId, taskId, { attempt, maxAttempts, nextRetryAt })
export function clearRetryState(taskStore, projectId, taskId)
export function armRetry(taskStore, task, delayMs, { attempt, maxAttempts, budgetSource, bridge })
```

- All handlers (`handleTransientFailure`, `handleStageFailure`,
  `settleOperatorAbort`, `deferForCircuitTrip`) call these instead of
  mutating `task.autoRetrying` directly.
- `armRetry` is the **single** place that writes `setTimeout` + `kickScheduler`
  logic. It always assigns `task.nextRetryAt`, `task.retryState = "scheduled"`,
  and `task.autoRetrying = true`. When `taskStore.schedulerRunning` is false it
  still writes the deadline and marks `retryScheduledInStandby: true` instead
  of arming a doomed timer.

### 4.3 Frontend mirror:

- `frontend/src/components/tasks/taskRetryState.js` re-exports `retryStateOf` / `isRetryingTask` / `retryProgressLabel` from a tiny shim that imports the shared module (following how `frontend/src/services/modelKeys.js` wraps `shared/modelKeys.js`).
- Replace direct `task.autoRetrying === true` reads in:
  - `frontend/src/components/tasks/TaskCard.jsx`
  - `frontend/src/components/tasks/TaskDetailPageContent.jsx`
  - `frontend/src/components/tasks/TaskDetailOverlayContent.jsx`
  - `frontend/src/components/tasks/stagePace.js`
  - `frontend/src/components/retrospective/retrospectiveStats.js`
  with `isRetryingTask(task)`.

### 4.4 Tests (Easy-Phase, written to fail against old code then pass)

New files, plus additions to existing suites:

- `shared/taskRetryState.test.js` — pure contract:
  - `retryStateOf(null)` → `{ state: "none", … }`
  - legacy `autoRetrying: true` maps to `scheduled`
  - successful terminal clear → `none`, preserves `failureReason` when asked
- `api/work/taskRetryState.test.js` — store-aware:
  - `armRetry` works when `schedulerRunning === false` (no stuck timer, explicit standby marker)
  - `clearRetryState` covers `autoRetrying`, `retryState`, `nextRetryAt`, `retryScheduledInStandby`
- `frontend/src/components/tasks/taskRetryState.test.js` — label strings locked:
  - `"RETRYING"` / `"RETRYING (scheduled)"` / `"RETRYING (manual)"` / counting `"2/5"`
- Existing tests must keep passing unchanged *except* where they assert the
  old `"RETRYING"` precedence order; those get the new state-aware assertions
  in Phase 5.

Also add a characterization test in `api/flow/stageFailureRouting.test.js`:
"when a previously retrying task exhausts its budget, `isRetryingTask(task)`
is false after the parked result". This test fails against current code and
turns green in Phase 5 (§5.3).

---

## 5. The Actual Change (Phases)

### 5.1 Backend: persisted retry state (writer migration)

Files touched (writers):

- `api/flow/routing/orchestrators/handleTransientFailure.js`
  - Replace direct `task.autoRetrying = true/false` lines with `setRetryScheduled` / `clearRetryState`.
  - Exhausted-budget branch calls `clearRetryState` **before** setting `status = "failed"` (and records `retryState: "exhausted"` + `failureReason` preserved).
  - `interrupted` branch: `clearRetryState`, then records `retryState: "none"` with the failure context retained.
  - Bottom of function (retry path): `armRetry(taskStore, task, nextDelayMs, { attempt, maxAttempts, budgetSource, bridge })` instead of the conditional `setTimeout`.
- `api/flow/routing/orchestrators/handleStageFailure.js`
  - Operator-abort / superseded / paused / terminal: `clearRetryState`.
  - Circuit-trip deferral already calls defer; ensure `deferForCircuitTrip` uses the helper too.
  - When `beginAutoIteration` returns non-null: `setRetryScheduled(...attempt...)` + `armRetry(..., 2000ms...)`.
  - When it returns null: `clearRetryState` before `task.status = "failed"`.
- `api/flow/routing/orchestrators/beginAutoIteration.js`
  - Stop writing `task.autoRetrying = true` directly; return `{ maxAttempts, scheduled: true }` and let the caller set state through the helper (keeps the helper the single writer).
- `api/flow/routing/orchestrators/settleOperatorAbort.js`, `deferForCircuitTrip.js`, `resetAttemptBudgets.js`, `resetAutoIteration.js` — migrate to helper calls; remove duplicate flag lines.
- `api/flow/execution/executeStage.js`
  - Replace `task.autoRetrying = false` with `clearRetryState(taskStore?…)` via the in-memory task mirror (executeStage already has `task`), preserving the existing clear of `failureReason`/`lastError`.
  - Set `task.retryState = "running"` while the stage runs, so the board can show "RUNNING, x/y" instead of just "RUNNING" during an in-flight retry. Optional but useful; isolate in this same commit.

- `api/work/taskLifecycle.js`, `api/work/taskControl.js`, `api/flow/stageTransitions.js`, `api/flow/taskScheduler/*`
  - Any transition that moves the task out of the retrying path calls `clearRetryState`. Use a single chokepoint: every place that sets `task.status` to a non-`in_stage`, non-retrying value routes through the helper.

### 5.2 Backend: retry arming robustness

`api/work/taskRetryState.js` implements `armRetry` as follows:

```js
export function armRetry(taskStore, task, delayMs, meta) {
    const nextRetryAt = new Date(Date.now() + Math.max(0, Number(delayMs) || 0)).toISOString();
    setRetryScheduled(task, { attempt: meta.attempt, maxAttempts: meta.maxAttempts, nextRetryAt });
    task.retryBudgetSource = meta.budgetSource || task.retryBudgetSource;

    const arm = () => {
        if (taskStore.schedulerRunning) {
            const t = setTimeout(() => {
                taskStore.scheduleTick().catch(() => {});
            }, delayMs);
            t?.unref?.();
            return true;
        }
        task.retryScheduledInStandby = true;
        // Make the scheduler's "due retries" pass catch it next time it starts.
        if (typeof taskStore.scheduleTick === "function") {
            taskStore._dueRetryIds = taskStore._dueRetryIds || new Set();
            taskStore._dueRetryIds.add(task.id);
        }
        return false;
    };
    return arm();
}
```

- Also patch `startScheduler` / `runScheduledTick` / `findNextCandidateTask` to include tasks whose `_dueRetryIds` contain them (or whose `retryState === "scheduled"` and `nextRetryAt <= now`) even before the explicit tick is armed. This removes the dependence on `schedulerRunning` at enqueue time.
- A small startup-recovery step (`api/flow/scheduler/reconcileDueRetries.js`, called from startup recovery) clears `_dueRetryIds` and re-arms any `retryState === "scheduled"` task whose `nextRetryAt` has passed more than the grace window; if it finds one, it sets `retryState = "exhausted"`, `status = "failed"`, appends history, and fires the same parked notifications used in `handleTransientFailure`'s exhaustion branch. This is what stops the "forever retrying" state after a crash/restart.

### 5.3 Backend: vocabulary + documentation (source of truth)

- `api/agentGuide.js`: extend `TASK_STATUSES` with:
  - `retrying: "An automatic retry is scheduled or in flight (see retryState/retryProgress)."` (used as a **derived/display** label; persisted equivalent is `in_stage` + `retryState`)
  - Clarify `failed: "The current stage failed and is parked; use retry or failback."`
  - Document `retryState`, `nextRetryAt`, `retryAttempt`, `retryMaxAttempts`, `retryBudgetSource`.
- Publish the same in `site-docs/` task section and update `api/agentGuide` JSDoc example tests.

Note: we intentionally **do not** change the scheduler's accepted status from
`in_stage`. Two vocabularies would be worse. Instead `retryState` becomes the
"why is it in_stage" annotation; existing runners and claim scans keep
working untouched. This is the "make easy" principle applied to the biggest
touch surface.

### 5.4 Frontend: label + detail UX

- `frontend/src/components/tasks/TaskCard.jsx`
  - Derive retry info from `retryStateOf(task)` instead of the boolean.
  - Show:
    - `RETRYING (scheduled)` + `2/5` + relative wait (`in 12s`, `due now`) when `retryState === "scheduled"`
    - `RETRYING` + `2/5` when `running`
    - preserve `RETRYING (manual)` variant driven by `task.lastRetrySource === "operator"` (optional, locked by Q10).
- `frontend/src/components/tasks/TaskDetailPageContent.jsx` and `TaskDetailOverlayContent.jsx`
  - Inspector header uses the same label + an "attempt x of y · next in N s" line.
  - Add a collapsible retry ladder (`transientRetryLadder`) on the failure card so the exhausted retries are traceable (Q9 "keep history").
- `frontend/src/components/tasks/stagePace.js`
  - `isPaceExcluded`: exclude only truly parked/terminal; keep running+retrying paced; use `isRetryingTask`.
- `frontend/src/components/layout/NowPlayingBar.jsx`
  - While retry is scheduled but no run is active, label the bar `RETRYING (scheduled)` and show the next-attempt countdown. This stops the "Now Playing: failed task forever" mismatch.
- Board (`useBoardFilters` / `useTaskBoard`)
  - Active group includes `retryState !== "none"` and `waiting_human`; parked (exhausted failed) stays out (Q8).

### 5.5 Retrospective and observability

- `frontend/src/components/retrospective/retrospectiveStats.js` — `isRetrospectiveTaskFailed` already excludes retrying; widen the condition to `retryState !== "none"` so exhausted-but-still-flagged tasks no longer leak as failures.
- `api/observability/alerts.js` / `webhookNotifier.js` — only fire the `task.failed` alert when `retryState === "exhausted"` (or non-retrying failure), never during a normal scheduled retry.
- `api/flow/circuitSensors.js` — when a circuit trip clears after a deferred task, ensure `clearRetryState` is not called prematurely (the task remains scheduled but with a circuit-open annotation).

---

## 6. Edge Cases And Invariants To Enforce

1. **A settled task never shows retry.**
   `isTerminalTaskStatus(status)` OR `status === "paused"` OR interrupted
   must force `retryState = "none"` in every writer.
2. **No timer loss.** Every retry arm goes through `armRetry`. Code review
   grep for `setTimeout.*scheduleTick` must return only this helper.
3. **Scheduler claim safety.** Claim/scan code keeps accepting `in_stage`
   only. `retryState` is presentation/metadata; scheduling identity never
   changes. This avoids 30+ call-site edits for one new state.
4. **Backward read.** Old task markdown without `retryState` reads as
   `scheduled` if `autoRetrying` is true, otherwise `none`. There is no
   migration step.
5. **No duplicate alerts** on retry, exhaustion-only.
6. **Countdown graceful degradation.** Unknown `nextRetryAt` renders nothing
   (not `NaNs`). Timer arithmetic uses `Number.isFinite`.
7. **Manual vs auto.** Set `task.lastRetrySource = "operator"` on
   `/tasks/:id/retry` and `/retryStage`; cleared by `executeStage` start.

---

## 7. Documentation Plan

| File | Change |
| ------ | -------- |
| `api/agentGuide.js` | New retry vocabulary + field doc (used by `/docs` and the agent guide surface) |
| `site-docs/task.states.md` (new, or existing task doc) | Add the state table from §2 and the transition rules from §6 |
| `docs/TASK_LIFECYCLE.md` / `docs/ARCHITECTURE_DOMAINS.md` | Mention retryState ownership under `api/work/taskRetryState.js` and the shared module |
| `docs/TEST_STRATEGY.md` (if present) | Add the new test files to the regression checklist |
| JSDoc in changed files | `MARK` entries for `armRetry`, `retryStateOf`, `clearRetryState`, `isRetryStuck`, plus one example each |
| `CHANGELOG.md` | One line: "Task retry state is now first-class (`retryState`, `nextRetryAt`) so tasks no longer appear stuck in RETRYING" |

All doc updates are part of the implementation commit, not a follow-up, so
docs and code cannot diverge.

---

## 8. Testing Plan

### 8.1 Unit (primary gate: `npm run test:unit`)

Backend:

- `shared/taskRetryState.test.js` — state machine, legacy derivation, stuck-detection, countdown formatting.
- `api/work/taskRetryState.test.js` — `armRetry` with scheduler running vs stopped; `clearRetryState` across all fields.
- `api/flow/stageFailureRouting.test.js` — new case: exhausted retry parks with `isRetryingTask(task) === false`; leaked-flag case turned green.
- `api/flow/transientRetryPolicy.test.js`, `api/flow/stageDecisionIntegration.test.js` — counts/delays unchanged; retry ladder still recorded.
- `api/flow/queueWedgeRecovery.test.js`, `api/flow/stallRecovery.integration.test.js` — retry-state survives reconciliation.
- `api/flow/runningStageAgreement.integration.test.js` — auto-retrying flag contract:
  - existing `expect(task.autoRetrying).toBe(true/false)` stays, plus new `expect(retryStateOf(task).state)` check.

Frontend:

- `frontend/src/components/tasks/taskRetryState.test.js` — label + 2/5 formatters.
- `TaskCard.test.jsx` — stuck-badge regression: a parked failed task whose
  `autoRetrying` lingers from a previous attempt must read `FAILED`, not
  `RETRYING`, once the helper is wired.
- `TaskDetailPage.test.jsx` (lines 789/813 areas that set `autoRetrying: true`) — scheduled variant now renders `RETRYING (scheduled)` with countdown.
- `stagePace.test.js` — pace excludes parked, includes retrying.
- `retrospectiveStats.test.js` — retrying excluded, exhausted parked included as failed.

Property/characterization:

- Add a small "state flip" property test that runs every writer exit path
  (`paused`, `interrupted`, `failed`, `completed`, aborted, circuit-deferred)
  and asserts `retryState === "none"` unless that path explicitly scheduled
  a retry. This single test is the regression net for the whole issue.

### 8.2 Integration / canary

- `canary-e2e/tests/task-errors.spec.js` — extend to (a) assert the parked
  task shows `FAILED`, not `RETRYING`, with the failure banner; (b) a new
  serial spec where transient retry (scheduler on) shows `RETRYING` during
  the backoff then clears on success.
- New canary: engine restart while a retry is scheduled — task must not stay
  stuck; either transitions to parked (over grace window) or runs normally.
- Existing runner canary (task-errors, task-review) must stay green.

### 8.3 Static verification

- `grep -R "setTimeout.*scheduleTick" api/` must return only `armRetry`.
- `grep -R "autoRetrying === true" --include=*.js(x) .` must be gone from UI
  (replaced by `isRetryingTask`).
- JSDoc example tests (`npm run check:jsdoc-example`) and doc link checks
  (`npm run docs:check`).
- Run `npm run check:one-function` to confirm new modules keep one public entry
  point per file where applicable.

### 8.4 Rollback / canary gate

Ship phases behind a build flag only if needed; given the goal is correctness,
prefer a direct commit. If the new state machine causes a regression, the
rollback is to revert the helper rename and keep the pre-existing
`autoRetrying` reads (they remain exact aliases via §4.1 backward compat),
so no data migration is required — old task files keep working.

---

## 9. Implementation Order (Small PR Slices)

1. **PR A – Make change easy:** shared helper + backend mirror + frontend shim + pure unit tests. No behaviour change. (~3 files)
2. **PR B – Writers migrate:** `handleTransientFailure`, `handleStageFailure`, `beginAutoIteration`, `settleOperatorAbort`, `deferForCircuitTrip`, `executeStage`. (~7 files)
3. **PR C – Retry arming robustness:** `armRetry`, startup reconcile, `_dueRetryIds` scanning. (~5 files)
4. **PR D – UI states and detail:** TaskCard/Detail/Page/Overlay, NowPlaying bar, board grouping, retry ladder. (~8 files)
5. **PR E – Vocab + docs + alerts + canary tests:** final polish and verification gate. (~10 files)

Each PR must leave `npm run test:unit` green and the canary suite unchanged in
outcome except for the new assertions explicitly listed above.

---

## 10. Acceptance Criteria

- [ ] No task renders `RETRYING` when `status === "failed"` or the retry
      budget is exhausted.
- [ ] `retryState` and `nextRetryAt` are persisted on every retry arm and
      cleared on every terminal/pause/interrupt/abort.
- [ ] `npm run test:api` and `npm run test:frontend` pass fully.
- [ ] The property test (§8.1) passes on all writer exit paths.
- [ ] Backend `TASK_STATUSES` and new shared helper are present and JSDoc
      examples check green.
- [ ] Canary `task-errors.spec.js` shows `FAILED`, not `RETRYING`, for a
      parked long failure; a retry during backoff clears on success.
- [ ] `grep` checks in §8.3 return empty.

---

## 11. Out Of Scope

- Renaming or splitting the scheduler's `in_stage` vocabulary (too broad;
  explicitly deferred until a separate "status vocabulary" task).
- Changing any timeout, retry budget, or circuit-breaker threshold defaults.
- Migrating historical task markdown files.
- New dashboards or metrics beyond the existing retry ladder display.