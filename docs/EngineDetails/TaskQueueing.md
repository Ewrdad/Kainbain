# Task Queue


## General Concept
The general idea is to turn all these tasks into a linear set of activities(starting with assuming there’s only one queue for early implementations).  This will require logical separations 

## The central queue (one queue across ALL projects/pipelines)

Since task `16d6fbd6` there is exactly **one central queue** for all waiting
work in all projects. Both dispatch paths — the embedded scheduler
(`findNextCandidateTask`) and the runner fleet scan (`scanClaimableTasks`) —
and the queue display (`getScheduledQueue`, backing `GET /tasks/queue` and
the bottom-bar popup) sort through the same seam
(`api/flow/scheduler/sortCentralQueue.js`), so they can never disagree about
what runs next. **Dispatch never depends on which pipeline the UI has
focused**: the server scheduler ticks on an interval and scans every project;
the only per-runner narrowing is the explicit `KAINBAIN_RUNNER_PROJECTS`
allowlist, which is configuration, not a stall.

### Workflow-aware requirements (the viewed pipeline is view-only)

Every dispatch path resolves each task's stage from the task's **own**
pipeline (`task.workflowId` via `resolveStagesForTask`), never from the
viewed pipeline's stages mirror — the fleet scan (`scanClaimableTasks`)
passes its already-resolved stages into `taskRequirements`, and the
direct-claim route resolves the same way, so a waiting task on any
pipeline is matched against its own harness/model/tier/runner-policy.
Switching the viewed pipeline changes what the operator sees, never what
workers do. A task pointing at a deleted stage is unknown
(`runnableType: false`) and parks, strict like this queue display —
never another stage's job.

### Priority (canonical order)

1. **Resumed interruptions** — oldest interruption first (Rule 0).
2. **Follow-on from the just-completed task** (Rule 1) — a single-use pass,
   *withheld* when any other candidate has waited past the starvation
   ceiling, so a churning pipeline cannot indefinitely pre-empt older
   cross-pipeline work.
3. **Oldest waiting task first, wherever it lives** — the default
   `oldest-first` mode (`KAINBAIN_CENTRAL_QUEUE_ORDER=oldest-first`). Ties
   break to **furthest along as a percentage of the task's own pipeline**
   (`(stageIndex+1)/totalStages`), then absolute stage index — a long
   pipeline's mid-stage work no longer outranks a short pipeline's
   nearly-done work.
4. **Starvation ceiling** — any candidate waiting past the ceiling jumps
   ahead, oldest first. The ceiling is `KAINBAIN_DISPATCH_MAX_WAIT_MS` when
   positive, else a built-in 15 minutes in `oldest-first` mode (the FIFO
   order itself already bounds the wait; the ceiling additionally gates the
   follow-on pass). In legacy mode with the knob at 0 the ceiling is off.

Rollback to the pre-16d6fbd6 order (closest-to-completion by absolute stage
index, then oldest) is config-only: `KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along`.

### Runner dispatch fallback (no starvation behind the fleet)

With `KAINBAIN_RUNNER_EXECUTION_ONLY=1` (default) the scheduler defers
all servable agent stages to runner dispatch. Two backend fallbacks
prevent starvation when the fleet cannot keep up:

* **No-capable-runner fallback** — if no active, fresh runner advertises
  the required harness/model for this task, the defer is skipped and the
  stage runs embedded immediately. Deferring would park the task forever
  behind a fleet that can never claim it.
* **Wall-clock fallback** — a task that has waited for runner dispatch
  past `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS` (default 90 s) falls back
  to embedded even when a capable runner exists but is busy. This bounds
  worst-case wait when a single runner serialises work from many pipelines.
  Set `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS=0` to disable and keep
  runner-only always (e.g. in container-only deploys with no local harness).

### Follow on from just completed tasks (#1)

If a task is to go directly to a review or other agentic stage then that should be followed. This is to reduce work becoming stale and/or the risk something else changes related things in that time. 

So by default if task 1234 goes from one agentic step to another then continue with a new 1234 instance on the new steps 

### Closest to completion (furthest along as a percentage) (#3 tiebreak)

We want to prioritise finishing work over starting new ones.  Therefore we want to prioritise things that are the nearest to the Finished.  Obviously the stages are flexible but distance too done is important — compared as a percentage of the task's own pipeline so pipelines of different lengths compete fairly.

This obviously only applies to agentic/automated work not human reviewable. But could see the engine moving something to final review (a human step), then after the review is done the engine can then go “oh its done lets close this off” etc

### Oldest Ticket (#3 primary)

Finally we need just want to avoid tickets/tasks sitting around forever. So therefore we ant to pick the task that has been sitting still the longest, wherever it lives across projects — this is now the primary rule in the default mode, which also encapsulates all tasks into one queue.

## Blocking

We may need to add a  logic that allows a ticket to block another. For example don’t “add UI” till the api is implemented etc. This is seen in a lot of things like gitlab and jira but this needs to influence the engine. If A blocks B , B should not be started till A is complete.

## Idle invariant (empty queue keeps polling)

An empty queue is **idle**, never **stopped**: when no candidate task is
runnable, `scheduleTick()` returns `null` as a normal idle outcome and the
3 s scheduler interval keeps polling. The loop stops only via an explicit
`stopScheduler()` (or the scheduler-disabled flag).

What guarantees liveness:

- Every terminal execution path resets engine state to `idle` (the agent,
  command, and merge paths all funnel through one `finally`; a mid-run pause
  that the run then outgrows is cleared as stale, while genuine `paused` and
  `checkpoint` states are preserved).
- State broadcasts never throw into execution (`setEngineState` swallows
  bridge errors), so a dead socket cannot strand the engine at `running` —
  the state that would wedge every future tick.
- Moments that create newly runnable work (task created, resumed, retried,
  approved via stage move, aborted, follow-up) arm a debounced ~150 ms
  scheduler kick, and the kick heals a lost interval timer while
  `schedulerRunning` is true.
- `scheduleTick` counts every outcome on `store.schedulerStats`
  (`dispatched` / `no-candidate-idle` / `skipped-busy`, plus last tick and
  dispatch timestamps), exposed via the observability payload alongside
  `schedulerRunning` and the execution-queue depth.

When it "looks off": check `schedulerStats` first. `ticks` climbing with
`no-candidate-idle` means healthy idling; `skipped-busy` stuck high with a
stale `lastDispatchAt` means the engine or queue believes work is still in
flight; `ticks` frozen while `schedulerRunning` is true means the interval
itself is dead.

## Queue chip and popup (bottom bar)

The bottom bar's queue chip counts tasks WAITING to be picked up by a
runner/scheduler across ALL projects — never tasks already being worked on.
`failed`, `cancelled`, `waiting_human`, `paused`, blocked, human-stage,
active/running, and non-auto-resumable `interrupted` tasks are excluded from
both the chip and the popup. Clicking the chip opens a popup listing exactly
that same waiting set in dispatch order (#1 runs next) with each row's
position, task name, project, and current step; clicking a row opens that
task in the inspector.

Both numbers describe one set (the shared `isWaitingForPickup` verdict), so
they normally match. The popup footer still states both numbers ("N open
tasks counted · M shown") as a transient refresh/timing diagnostic: a
mismatch means one view is stale, not that there is a second bug class. If
the chip number never goes down, the waiting tasks are genuinely stuck
outside pickup — check blocks, pauses, and stage states.

