# 03 — Task lifecycle (scratch only)

Setup: file 00 + a disposable project (MT-PROJ-01) with its default
workflow. Note its stage ids first:

```bash
curl -s $BASE/projects/$PID/workflow   # default seeded pipeline:
# 1 Idea (agent) · 2 Technical Elab (agent) · 3 Plan (agent)
# 4 Review Plan (human) · 5 In Progress (agent) · 6 Deploy (ci)
export TID=""   # set per test
```

Reminder: scheduler is **off** on scratch — nothing moves unless a test
moves it. That is what makes these assertions deterministic.

## MT-TASK-01 — Create task into a stage

- **Priority:** P0.
- Steps: `curl -s -X POST $BASE/tasks -H 'Content-Type: application/json' -d "{\"goal\":\"MT $RUN_ID first task\",\"projectId\":\"$PID\",\"stageId\":\"1\"}"`
- Expected: `200`; task has `id` (`$TID`), `goal`/`title`,
  `currentStageId:"1"`, `status:"in_stage"`, `blockedBy:[]`, `history`
  containing `Created and placed in stage …`. `GET $BASE/tasks?projectId=$PID`
  lists it; `GET $BASE/tasks/$TID?projectId=$PID` matches.
- Cleanup: MT-TASK-04 (delete) at file end; intermediate tests reuse it.

## MT-TASK-02 — Preview does not create

- **Priority:** P0.
- Steps: count tasks; `POST $BASE/tasks/preview {"goal":"MT preview only","projectId":"$PID","stageId":"1"}`;
  count tasks again; `GET $BASE/tasks/queue?projectId=$PID`.
- Expected: `200` with a rendered/curated prompt containing the goal and
  stage prompt, and verdict guidance for an agent stage. Task count and
  queue unchanged — preview is side-effect free.
- Cleanup: none needed; assert the count equality as the cleanup proof.

## MT-TASK-03 — Patch task (edit + stage move via PATCH)

- **Priority:** P0.
- Steps: `PATCH $BASE/tasks/$TID {"projectId":"$PID","title":"MT $RUN_ID renamed","goal":"MT $RUN_ID renamed goal"}`;
  then `PATCH … {"projectId":"$PID","stageId":"2"}`; GET after each.
- Expected: fields update; `stageId` PATCH moves `currentStageId` to `2`
  with a history entry. Patching a bogus task id → 404; bogus stage → 4xx
  with the task unmoved.
- Cleanup: PATCH title/goal back and move back to stage `1`; verify by GET.

## MT-TASK-04 — Delete task

- **Priority:** P0.
- Steps: create a throwaway task (`MT $RUN_ID to-delete`), then
  `curl -s -X DELETE $BASE/tasks/<id> -H 'Content-Type: application/json' -d '{}'`
  (see README: bare JSON-typed DELETE with empty body is a known 400).
- Expected: success; subsequent GET → 404; list no longer contains it;
  deleting it again → 404 (not 500).
- Cleanup: this is the cleanup pattern for every task test. Verify with
  `GET $BASE/tasks?projectId=$PID` filtered by `MT $RUN_ID` at file end:
  zero remain except any test that explicitly says it keeps one.

## MT-TASK-05 — Advance through stages

- **Priority:** P0.
- Steps: from stage 1: `POST $BASE/tasks/$TID/advance {"projectId":"$PID"}`;
  repeat; also advance once with `{"projectId":"$PID","guidance":"MT guidance note"}`.
- Expected: each advance increments `currentStageId` by exactly one
  workflow position, `status` stays coherent (`in_stage`/`waiting_human`
  at the human stage), history records `Advanced to stage …`, and the
  guidance text is appended to the goal/prompt when checked via GET.
- Cleanup: `POST /tasks/$TID/jump {"projectId":"$PID","stageId":"1"}` back
  to stage 1 (or delete per MT-TASK-04); verify `currentStageId`.

## MT-TASK-06 — Move and jump (non-linear placement)

- **Priority:** P0.
- Steps: `POST /tasks/$TID/move {"projectId":"$PID","stageId":"3"}`;
  `POST /tasks/$TID/jump {"projectId":"$PID","stageId":"5"}`;
  each with a bogus `stageId` first.
- Expected: bogus → 4xx, position unchanged. Valid calls land exactly on
  the requested stage; move/jump history entries recorded. Missing
  `stageId` → 400.
- Cleanup: jump back to stage `1`; verify.

## MT-TASK-07 — Complete

- **Priority:** P0.
- Steps: jump to the last stage, then `POST /tasks/$TID/complete {"projectId":"$PID"}`.
- Expected: `status:"completed"`; task no longer appears in
  `GET /tasks/queue?projectId=$PID`; completing again does not resurrect
  or error catastrophically (idempotent success or clean 4xx — record
  which; must match pre-refactor).
- Cleanup: delete the completed task (MT-TASK-04). Completed tasks are
  data too — do not leave them in the disposable project.

## MT-TASK-08 — Idempotent create

- **Priority:** P1.
- Steps: POST the same create twice with
  `"idempotencyKey":"mt-$RUN_ID-1"` and identical goal/project/stage.
- Expected: exactly one task exists for that key/goal (second response
  returns the same task id, or a documented duplicate-guard response).
  Two distinct tasks with the same key = FAIL.
- Cleanup: delete the created task; verify list has no `mt-$RUN_ID-1` goal.

## MT-TASK-09 — blockedBy: chain, release, and queue ranking

- **Priority:** P0.
- Steps: create A, then B with `"blockedBy":["<A>"]`, then C with
  `"blockedBy":["<B>"]`. Check `GET /tasks/queue?projectId=$PID`.
  Complete A (`jump` to last stage + `complete`, MT-TASK-07), re-check.
- Expected: B and C show `blockedBy` as sent; queue ranks blocked tasks
  last with a `Blocked by: …` reason. Completing A releases B (no manual
  step) on the next scheduler/queue read. Executing a still-blocked task
  (`POST /tasks/<C>/execute`) → `409`.
- Cleanup: delete C, then B, then A (reverse order); verify queue empty
  of `MT $RUN_ID` entries.

## MT-TASK-10 — blockedBy validation (fail closed)

- **Priority:** P0.
- Steps, each expecting `400` and **no task created** (count check):
  self-block (`blockedBy` containing the new task's own would-be id is
  impossible pre-create, so instead PATCH an existing task to block on
  itself); unknown id (`blockedBy:["x"]` — verified pre-write: returns
  `400 Unknown task ID in blockedBy: x`); a cycle (PATCH B→C after C→B);
  a task id from a *different* project.
- Expected: all rejected with readable errors; a blocker that is
  `failed`/deleted keeps dependents blocked (fail-closed) rather than
  silently releasing them — verify by failing/deleting a blocker in a
  throwaway pair and re-reading the dependent.
- Cleanup: delete every throwaway task created; PATCH any surviving
  task's `blockedBy` back to `[]` and verify.

## MT-TASK-11 — Default-project fallback (deliberate omission)

- **Priority:** P1.
- Steps: activate the disposable project (MT-PROJ-04), create a task
  **without** `projectId`, list `GET /tasks` without `projectId`.
- Expected: task lands in the activated disposable project only. Then
  re-activate Project A and confirm the task is *not* visible there.
- Cleanup: delete the task (pass `projectId` explicitly), re-activate
  Project A, verify both projects' task lists are `MT`-free.

## MT-TASK-12 — Survey round-trip (if stage requires it)

- **Priority:** P2. Skip (`SKIP`) if the seeded workflow has no survey.
- Steps: `GET $BASE/tasks/$TID/survey?projectId=$PID`;
  `POST $BASE/tasks/$TID/survey {"projectId":"$PID","answers":{…}}`
  with partial answers, then complete answers, then
  `{"projectId":"$PID","action":"skip"}` on a second throwaway task.
- Expected: GET reports rounds/status/missing-required accurately;
  partial POST merges without advancing; complete POST advances;
  `skip` clears the pending survey without losing the task.
- Cleanup: delete both tasks; verify `surveyPending:false` on any
  surviving task you touched.
