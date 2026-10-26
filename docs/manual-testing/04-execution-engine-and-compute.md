# 04 — Execution engine, compute, and sessions (scratch only)

Setup: file 00 (mock harness, scheduler off) + disposable project.
The engine runs **one task at a time globally** — always quiesce before
and after an execution test:

```bash
curl -s -X POST $BASE/compute/stop -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PID\"}"   # idempotent; safe when idle
curl -s $BASE/status             # engine.status should be "idle"
```

Mock-harness reality (verified 2026-10-25): the mock echoes the curated
prompt, so its output contains the verdict-template text. Assert
dispatch/log/report/failback mechanics, never "the agent did good work".

## MT-EXEC-01 — Execute an agent stage on the mock harness

- **Priority:** P0.
- Steps: create task in stage 1; `POST $BASE/tasks/$TID/execute {"projectId":"$PID"}`;
  poll `GET $BASE/tasks/$TID?projectId=$PID` and `GET $BASE/tasks/$TID/logs?projectId=$PID`
  (or `?projectId` form the logs route accepts) for ~10s;
  `GET $BASE/status` during and after.
- Expected: dispatch recorded (`Dispatched stage … (agent) with model …`
  in history/logs); mock log entries appear (session/model/usage lines);
  a stage report is generated (`reports[]` non-empty, `GET /tasks/$TID/reports`);
  engine returns to `idle` with `activeTaskId:null`. A failback/retry
  cycle from the echoed verdict template is acceptable and must be
  recorded as such — an engine stuck `running` forever is FAIL.
- Cleanup: `POST /compute/stop` for the project; `POST /tasks/$TID/abort`
  if still active; delete the task; verify `engine.status:"idle"` and
  the task's reports are gone with it.

## MT-EXEC-02 — Execute a human stage (checkpoint)

- **Priority:** P0.
- Steps: jump a task to stage 4 (`Review Plan`, human); execute it;
  read the task.
- Expected: task becomes `waiting_human`/`checkpoint` (per `/agent`
  `taskStatuses`); no agent session is dispatched; Approve/Reject are
  the only ways forward (MT-EXEC-03).
- Cleanup: advance or reject the task out of the checkpoint, then delete
  it; verify no task is left `waiting_human` with an `MT $RUN_ID` goal.

## MT-EXEC-03 — Advance (approve) vs reject at a human stage

- **Priority:** P0.
- Steps: two throwaway tasks at stage 4. Task 1:
  `POST /tasks/<id>/advance {"projectId":"$PID","guidance":"MT approved"}`.
  Task 2: `POST /tasks/<id>/reject {"projectId":"$PID","feedback":"MT needs rework"}`;
  also reject with **missing** feedback.
- Expected: Task 1 moves to stage 5. Task 2 fails back to the previous
  stage with the feedback recorded. Missing feedback → `400`
  (feedback is required) and Task 2 does not move.
- Cleanup: delete both tasks; verify.

## MT-EXEC-04 — Failback and retry

- **Priority:** P1.
- Steps: on a task whose stage failed (reuse MT-EXEC-01's if it failed
  back, else place a task and execute until `failed`/failback state):
  `POST /tasks/$TID/failback {"projectId":"$PID","fallbackStageId":"1"}`;
  then `POST /tasks/$TID/retry {"projectId":"$PID"}`.
- Expected: failback lands on the requested earlier stage; retry
  re-dispatches with a freshly curated prompt (GET shows updated
  `curatedPrompt`/history `Retried…`-style entry). Failback to a bogus
  or later stage → 4xx, position unchanged.
- Cleanup: `/compute/stop`, abort if running, delete task, verify idle.

## MT-EXEC-05 — Pause / resume / abort

- **Priority:** P1.
- Steps: create + execute a task; while queued/running:
  `POST /tasks/$TID/pause`, read; `POST /tasks/$TID/resume`, read;
  start again and `POST /tasks/$TID/abort`, read; `GET /status`.
- Expected: pause → `status:"paused"` and no dispatch while paused;
  resume re-dispatches (`interrupted`/paused tasks resume their stage);
  abort stops execution and the engine returns to `idle`. Pausing an
  already-completed task → clean 4xx/no-op (record which).
- Cleanup: abort + `/compute/stop`; delete task; verify `idle`.

## MT-EXEC-06 — Steer and follow-up on a live task

- **Priority:** P2. `BLOCKED` is acceptable if no run stays live long
  enough on the mock harness — record why rather than forcing it.
- Steps: execute a task; `POST /tasks/$TID/steer {"projectId":"$PID","guidance":"MT steer note"}`;
  `POST /tasks/$TID/follow-up {"projectId":"$PID","prompt":"MT follow-up note"}`;
  repeat follow-up with missing `prompt`.
- Expected: valid calls are accepted and visible in logs/history;
  missing `prompt` → `400`. Steering a non-running task → clean 4xx.
- Cleanup: abort, `/compute/stop`, delete task, verify idle.

## MT-EXEC-07 — CI stage execution

- **Priority:** P0.
- Steps: in the disposable project, PUT a workflow whose CI stage runs
  a harmless command (`true` for pass, `false` for fail — save/restore
  the workflow per MT-PROJ-05); place a task in the CI stage; execute.
- Expected: `true` → stage passes (`passed`/advanceable, report written);
  `false` → stage fails and routes to its configured failback, with the
  command output captured in logs/report. A CI stage never produces or
  requires an agent verdict.
- Cleanup: `/compute/stop`; restore the original workflow (MT-PROJ-05
  cleanup); delete the task(s); verify stage list restored.

## MT-EXEC-08 — Engine exclusivity and queue

- **Priority:** P1.
- Steps: create two tasks; execute both back-to-back;
  `GET $BASE/tasks/queue?projectId=$PID`; `GET $BASE/engine/state`
  (if exposed; else use `/status` engine fields).
- Expected: only one runs at a time; the second queues or is rejected
  with `409` (record which — must match pre-refactor); queue order is
  priority order with blocked tasks last. No task is lost.
- Cleanup: `/compute/stop` (cancels queued executions for the project),
  abort actives, delete both tasks, verify queue empty + engine idle.

## MT-EXEC-09 — Circuit breaker: trip and reset

- **Priority:** P1. **Scratch only** (isolated circuit file — never on live).
- Steps: `GET $BASE/status` (record `engine.circuit`);
  `POST $BASE/engine/trip {"reason":"MT manual trip"}` (body per `/agent`;
  adapt if the route wants no body); try to execute a task;
  `POST $BASE/engine/reset`; execute again.
- Expected: while tripped, execution is refused (409-style) with the trip
  reason visible in `/status`; after reset, execution dispatches again;
  trip/reset are recorded with timestamps/reason. `/status` never 500s.
- Cleanup: ensure the breaker is **reset**, engine idle, test task
  deleted. If reset fails, tear down the whole scratch stack
  (MT-SETUP-03) and record FAIL — do not leave a tripped scratch breaker
  for the next file.

## MT-EXEC-10 — Compute sessions and models

- **Priority:** P1.
- Steps: `GET $BASE/compute/models`; `GET $BASE/compute/status`;
  `POST $BASE/compute/start {"projectId":"$PID"}`;
  `GET $BASE/session/status?projectId=$PID` (query form per `/agent`);
  `POST $BASE/compute/stop {"projectId":"$PID"}`.
- Expected: models list contains the mock model on scratch
  (`mock::mock::echo-v1` family) plus any host-discovered models;
  status flips active→inactive across start/stop; start on a bogus
  project → 4xx. `?refresh=true` on models still returns `200`.
- Cleanup: `/compute/stop` (already the last step — repeat it);
  verify `GET /compute/status` shows no active session for `$PID`.

## MT-EXEC-11 — Session history, tree, fork, navigate, restore

- **Priority:** P2.
- Steps (after MT-EXEC-01 produced a session): `GET /session/history`,
  `GET /session/tree`, `GET /session/status` for the project;
  `POST /session/fork {"entryId":"<leaf from tree>"}`;
  `POST /session/navigate {"targetId":"<entry>"}`;
  `POST /session/restore` (body per `/agent`).
- Expected: history contains the mock run's messages/tools; tree is a
  coherent branch structure; fork creates a branch without destroying
  the original leaf; navigate moves the leaf; bogus entry/target ids →
  4xx. Restore on a project with no session → clean 4xx/empty, not 500.
- Cleanup: `/compute/stop`; delete the task(s) that owned the session;
  note in the run log that scratch session files die with `$MT_ROOT`
  at MT-SETUP-03 (verify there: no session files outside `$MT_ROOT`).
