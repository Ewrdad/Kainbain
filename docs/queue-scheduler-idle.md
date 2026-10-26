# Queue / Scheduler Idle Invariant

An empty execution queue is **idle and polling, never stopped**.

- `schedulerRunning === true` + engine `status === "idle"` + `queue.size === 0`
  means "waiting for work". The periodic scheduler interval stays armed and
  `scheduleTick()` returning `null` (no candidate) is a normal idle outcome,
  not a stop condition.
- The scheduler stops only via an explicit `stopScheduler()` call or the
  `schedulerDisabled` config flag. Nothing in the dispatch path stops it when
  work runs out.
- Moments that create newly runnable work (task created, resumed, retried,
  approved, aborted, moved) arm a debounced (~150 ms) `kickScheduler()`
  re-tick so pickup does not wait a full interval. The periodic interval
  remains the liveness backstop; `ensureScheduler()` heals a lost timer while
  `schedulerRunning` is true.
- Duplicate dispatch is impossible: `scheduleTick()` re-checks the busy gate
  (`queue.isRunning` / engine `running`), and `executeStage()` keeps its
  stale-duplicate `superseded` check.

## When it "looks off"

1. Read `schedulerStats` on the store (exposed via the observability
   payload): `ticks` / `dispatched` / `idleNoCandidate` / `skippedBusy` /
   `resumedInterrupted` (tasks auto-resumed by startup recovery) plus
   `lastTickAt`, `lastDispatchAt`, `lastOutcome`.
2. `lastOutcome === "no-candidate-idle"` with advancing `lastTickAt` means
   healthy idle — there is simply no runnable task (`paused` and
   `waiting_human` tasks intentionally never dispatch on their own).
3. `lastOutcome === "skipped-busy"` stuck with a stale `lastTickAt` means the
   engine state is wedged at `running`; check for a lost worker or a throwing
   `ENGINE_STATE` broadcast (broadcasts are guarded so they cannot strand
   state, but the log will show the underlying error).
4. UI rule: `schedulerRunning === false` renders "Scheduler Stopped";
   anything else with an empty queue renders "Idle — waiting for work".

## Single-active invariant ("is it running twice?")

KainBain executes **one task at a time** — the whole point of the queue.
If the UI ever shows two tasks as running, the backend is not running
twice: one of the two badges is stale. The rules:

- **Source of truth is the engine owner**: `engineState.activeTaskId`
  while `engineState.status === "running"`. Task `running_*` statuses are
  labels that can go stale (crash, abort, or restart mid-run).
- **Serial execution**: `ExecutionQueue` drains one job at a time; the
  scheduler tick refuses to dispatch while busy (`skipped-busy`); manual
  "Run stage" while another task owns the engine answers **409 "Engine is
  already running another task"** instead of queueing behind an hours-long
  run or double-running.
- **Stale labels collapse to `interrupted`**: restart reconcile
  (`reconcileInterruptedRuns`, covering every `running_*` variant and
  `advancing`) plus the disk-load path (`parseTaskMarkdown`) convert any
  non-owner `running_*` to `interrupted`. Anything still showing a live
  badge without owning the engine is a display bug, not parallel work.
- **Display rule**: every RUNNING badge, queue active slot, and
  executing control derives from the shared `resolveRunningTask` /
  `isTaskRunning` selector (`frontend/src/components/tasks/runningTask.js`).
  A stale runner renders as "Interrupted — retry", and Run buttons show
  "Queued — engine busy" while another task owns the engine.
- **Proving it**: `api/flow/singleActiveInvariant.test.js` (two dispatches
  never hold two live `running_*` at once; reconcile collapses orphans and
  never touches the owner) and the `TaskCard` / `QueueOrderWidget` tests
  (one owner + one stale + queued items render exactly one RUNNING).

## Startup recovery ("pick up where it left off")

After a stop, crash, SIGTERM/SIGINT, or self-deploy restart,
`performStartupRecovery` (`api/flow/startupRecovery.js`, called from
`start()` in `api/index.js`) establishes the initial queue in strict order:

1. `reconcileInterruptedRuns()` — orphaned `running_*` (no engine owner)
   collapse to `interrupted`.
2. `await reconcileInterruptedDeploys()` — deploy/merge interruptions resolve
   from the durable `last-result.json` marker (success advances without
   re-running; failure parks). Awaited, never fire-and-forget, so no dispatch
   can race a deploy decision.
3. Auto-resume — eligible `interrupted` tasks flip back to `in_stage`
   (cleared `wasInterrupted`, fresh auto-iteration budget, history entry
   "Auto-resumed after server restart — prioritised in queue"), exactly like
   a manual resume but without dispatching.
4. `startScheduler()` + one `kickScheduler()` so pickup takes ~150 ms.

Recovery only transitions state; dispatch stays on the normal `scheduleTick`
under the busy gate, so the single-active invariant holds and a busy engine
means recovery transitions state without dispatching. Boot logs one line:
`startup recovery: N interrupted → M auto-resumed, K left for operator`.

## Resume priority (Rule 0)

Interrupted-but-resumable tasks dispatch ahead of everything else (Rule 0,
ahead of follow-on Rule 1), oldest interruption first, with
`priorityReason: "resumed_interrupted"`. The queue display mirrors it with
rank 0.5 ("Resumed after interruption — prioritised", between Active
Execution and Follow-On Priority).

The priority survives the startup flip via a durable marker: auto-resume
stamps `resumedAfterInterruption: true` plus an `interruptedAt` snapshot of
the pre-flip timestamp (both persisted in the task markdown frontmatter), so
a resumed task keeps Rule 0 even though its status is back to `in_stage`,
and oldest-first ordering uses the original interruption rather than the
post-flip `updatedAt`. The first dispatch consumes the marker
(`consumeResumedMarker`); stage moves, manual resume/retry, aborts, and
pauses consume it too (all via the shared `clearResumedMarker` helper in
`stagePolicy.js`), so priority is single-use and never leaks onto later
work.

The auto-resumable set (`isAutoResumable`): agent/ci/script stages only.
Deploy/merge interruptions belong to deploy reconcile; human stages, paused
stages, paused/waiting-human tasks, and blocked tasks never auto-resume past
their checkpoint. Non-idempotent script/CI stages should use human
checkpoints — auto-resume re-runs the stage from its start.
