# Auto-approve walkthrough — human-stage holds

Manual gate for the human-stage auto-approve feature (plan §6.5). Run on the
isolated scratch stack from `00-setup-and-teardown.md` (API `:3417`, mock
harness, throwaway roots) — never against live `:3100`. Name everything
`MT <RUN_ID> auto-approve …`.

> The save boundary refuses holds under 60s, so this walkthrough uses a
> 61s hold instead of real days. The sweeper cadence on scratch can stay at
> its 60s default — expect each auto step within ~2 sweep intervals.

## MT-AUTO-01 — stamp on entry

1. Create project `MT <RUN_ID> auto-approve` and PUT its workflow to three
   stages: `Build` (agent), `Review` (human, `autoApproveAfterMs: 61000`),
   `Done` (agent).
2. `POST /tasks` with `stageId: <review id>`; record `enteredStageAt`.
3. `GET /tasks/:id` shows `status: waiting_human` and
   `autoApproveAt = enteredStageAt + 61s` exactly.

Expect: the stamp is present and the delta is exactly 61000 ms.

## MT-AUTO-02 — reminder inside the lead window

1. Short holds halve into the reminder lead (61s hold → ~30s lead), so wait
   ~35s after entry.
2. One `task.auto_approve_soon` webhook arrives (check the scratch alert
   sink) naming the stage and the deadline ("silence approves
   automatically").
3. `GET /tasks/:id` shows `autoApproveRemindedAt` set; no second reminder
   arrives before the deadline.

Expect: exactly one reminder, marker persisted.

## MT-AUTO-03 — early manual approve wins

1. Create a second task at `Review`; `POST /tasks/:id/advance` immediately.
2. Wait past its (now-cancelled) deadline + one sweep.
3. `GET /tasks/:id` shows it advanced once, history has no `Auto-approved`
   line, and no `task.auto_approve` webhook fired for it.

Expect: manual outcome identical to before the feature; the timer never fires.

## MT-AUTO-04 — auto-advance past the deadline

1. Let the MT-AUTO-01 task pass its deadline; wait ~2 sweeps.
2. `GET /tasks/:id` shows `in_stage` at `Done`, `autoApproveAt: null`.
3. History holds `Auto-approved after 61 seconds (automatic): held since
   <entered>, deadline <deadline>, fired <fired>` plus
   `Advanced to stage 'Done' (automatic)`.
4. `GET /tasks/:id/reports` shows `# Human approval (automatic): Review`
   with the same three timestamps; the timeline row is badged `automated`
   with status `Advanced`.
5. One `task.auto_approve` webhook (`info`) fired; `GET /engine/state`
   shows `schedulerStats.autoApproved >= 1`.

Expect: all four surfaces (history, timeline, report, webhook) say
automatic with matching timestamps.

## MT-AUTO-05 — restart keeps the deadline (never early)

1. Create a third task at `Review`; record its `autoApproveAt`.
2. Restart the scratch API mid-wait.
3. `GET /tasks/:id` shows the identical `autoApproveAt`; after the
   deadline + ~2 sweeps the task auto-advances (late-or-on-time, never
   before the recorded deadline).

Expect: deadline survives the restart byte-identically; firing is never early.

## Cleanup

Delete the `MT <RUN_ID> auto-approve` project (tasks go with it) and stop
the scratch stack per `00-setup-and-teardown.md`. Attach payload excerpts
(`autoApproveAt`, history lines, report header) and timestamps to the stage
report as evidence.
