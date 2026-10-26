# Task Queue


## General Concept
The general idea is to turn all these tasks into a linear set of activities(starting with assuming there’s only one queue for early implementations).  This will require logical separations 

## Priority

1. Follow on from just completed task
2. Closest to completion (furthest right)
3. Oldest updated task

### Follow on from just completed tasks (#1)

If a task is to go directly to a review or other agentic stage then that should be followed. This is to reduce work becoming stale and/or the risk something else changes related things in that time. 

So by default if task 1234 goes from one agentic step to another then continue with a new 1234 instance on the new steps 

### Closest to completion (furthest right) (#2)

We want to prioritise finishing work over starting new ones.  Therefore we want to prioritise things that are the nearest to the Finished.  Obviously the stages are flexible but distance too done is important . 

This obviously only applies to agentic/automated work not human reviewable. But could see the engine moving something to final review (a human step), then after the review is done the engine can then go “oh its done lets close this off” etc

### Oldest Ticket (#3)

Finally we need just want to avoid tickets/tasks sitting around forever. So therefore we ant to pick the task that has been sitting still the longest, only if the above rules arent satisfied. This  should also allow the encapsulation of all tasks.

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

