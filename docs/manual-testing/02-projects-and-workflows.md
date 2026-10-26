# 02 — Projects and workflows (scratch only)

Setup: file 00 complete, `$BASE` + `$RUN_ID` set. Helper used below:

```bash
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }
# create the disposable project once for this file:
curl -s -X POST $BASE/projects -H 'Content-Type: application/json' \
  -d "{\"name\":\"MT $RUN_ID Proj\"}" > /tmp/mt-proj.json
export PID=$(J "['id']" < /tmp/mt-proj.json); echo $PID
```

Every test's cleanup either deletes what it created or verifies the shared
disposable project is back to its post-setup shape. Final cleanup for the
file (always run, even on failure): MT-PROJ-08.

## MT-PROJ-01 — Create project with defaults

- **Priority:** P0. Steps: the create call above (repeat with a second name
  suffix `B` if re-running).
- Expected: `200`; body has `id`, `name:"MT $RUN_ID Proj"`, `slug`,
  `cwd`/`notesPath` **under `$MT_ROOT`**, a default stage list and
  `activeWorkflowId`. `GET $BASE/projects` now includes it;
  `GET $BASE/projects/$PID` returns the same stages.
- Cleanup: deferred to MT-PROJ-08 (shared fixture). Note `cwd` in run log.

## MT-PROJ-02 — Create validation

- **Priority:** P1.
- Steps: `POST /projects` with `{}`; with `{"name":""}`; with a duplicate
  of the MT-PROJ-01 name.
- Expected: missing/empty name → `400` with a readable `error`; no new
  project created (list count unchanged). Duplicate-name behaviour
  (reject or allow-with-new-id) must match pre-refactor behaviour —
  record which; a silent overwrite of the first project is FAIL.
- Cleanup: if duplicate created a second project, `DELETE` it:
  `curl -s -X DELETE $BASE/projects/<dup-id> -H 'Content-Type: application/json' -d '{}'`.

## MT-PROJ-03 — Patch project

- **Priority:** P0.
- Steps: `curl -s -X PATCH $BASE/projects/$PID -H 'Content-Type: application/json' -d '{"name":"MT '$RUN_ID' Proj Renamed"}'`;
  then `GET /projects/$PID`.
- Expected: `200`; name updated everywhere (detail + list); `id`, stages,
  cwd unchanged.
- Cleanup: PATCH the name back to `MT $RUN_ID Proj`; verify via GET.

## MT-PROJ-04 — Activate project / default-project fallback

- **Priority:** P0.
- Steps: `POST $BASE/projects/$PID/activate` (no body needed);
  then `GET $BASE/tasks` with **no** `projectId`.
- Expected: `200`. `/tasks` without projectId resolves to the activated
  project's tasks (empty list is fine). Activating a bogus id → 4xx.
- Cleanup: re-activate the seeded `Project A`
  (`GET /projects`, find by name, POST activate) so later files start from
  a known default; verify `GET /tasks` no longer targets the MT project.

## MT-PROJ-05 — Replace workflow stages (PUT workflow)

- **Priority:** P0.
- Steps:
  1. Save original: `curl -s $BASE/projects/$PID/workflow > /tmp/mt-wf-before.json`
  2. `PUT $BASE/projects/$PID/workflow` with body
     `{"stages":[{"id":"s1","name":"MT Intake","type":"human","prompt":"Check it."},{"id":"s2","name":"MT Build","type":"agent","prompt":"Build it."},{"id":"s3","name":"MT Verify","type":"ci","command":"true"}]}`
  3. `GET $BASE/projects/$PID/workflow`
- Expected: `200`; stages are exactly s1/s2/s3 in order with the names/
  types sent; `currentStageId`/workflow metadata coherent (no dangling
  stage id). Invalid bodies (no `stages`, unknown `type`, duplicate ids)
  → `400`, and the previous stages survive (re-GET to prove).
- Cleanup: restore: `curl -s -X PUT $BASE/projects/$PID/workflow -H 'Content-Type: application/json' -d @/tmp/mt-wf-before.json`
  (send the saved `stages` array in the same shape the PUT expects);
  re-GET and diff stage ids against the saved file; remove `/tmp/mt-wf-before.json`.

## MT-PROJ-06 — Named workflows: create, switch, patch, delete

- **Priority:** P1.
- Steps: `GET /projects/$PID/workflows`;
  `POST /projects/$PID/workflows {"name":"MT Alt","stages":[…one human stage…]}`;
  `POST /projects/$PID/workflows/<wfId>/switch`;
  `PATCH /projects/$PID/workflows/<wfId> {"name":"MT Alt Renamed"}`;
  `GET /projects/$PID/workflow` after each mutating step.
- Expected: list gains `MT Alt`; switch makes it the active workflow
  (`activeWorkflowId` + stage list change atomically); PATCH renames only;
  switching to a bogus workflow id → 4xx and active workflow unchanged.
- Cleanup: switch back to the original `activeWorkflowId` (from
  MT-PROJ-05's saved file), then
  `curl -s -X DELETE $BASE/projects/$PID/workflows/<wfId> -H 'Content-Type: application/json' -d '{}'`;
  verify the named-workflow list no longer contains `MT Alt*`.

## MT-PROJ-07 — Workflow jump / skip endpoints

- **Priority:** P2. (Task-level jump is covered in MT-TASK-07; this is the
  project-workflow variant.)
- Steps: with a task placed in the disposable project (create per
  MT-TASK-01 if needed): `POST /projects/$PID/workflow/jump` and
  `POST /projects/$PID/workflow/skip` using the bodies documented by
  `GET /agent`; also call each with a bogus stage id.
- Expected: valid calls move/skip as documented; bogus ids → 4xx, task
  stage unchanged. If `/agent` shows these endpoints changed shape after
  the refactor, follow `/agent` and record the difference as a finding.
- Cleanup: move the task back to its original stage (MT-TASK-06) or delete
  it (MT-TASK-04 cleanup); verify `GET /tasks/$TID?projectId=$PID`.

## MT-PROJ-08 — Delete project (final cleanup for this file)

- **Priority:** P0.
- Steps:
  1. Stop compute first: `curl -s -X POST $BASE/compute/stop -H 'Content-Type: application/json' -d "{\"projectId\":\"$PID\"}"`
  2. Delete its tasks if any remain (MT-TASK-04 cleanup per task).
  3. `curl -s -X DELETE $BASE/projects/$PID -H 'Content-Type: application/json' -d '{}'`
  4. `GET $BASE/projects` and `GET $BASE/projects/$PID`.
- Expected: delete returns success; list no longer contains `MT $RUN_ID`;
  detail GET → 404. Project A–D untouched. Deleting a bogus id → 4xx,
  not 500. `$MT_ROOT/projects` has no leftover `mt-*` directory for it
  (if a directory remains on disk, record FAIL — orphaned storage).
- Cleanup: this is the cleanup. `rm -f /tmp/mt-proj.json /tmp/mt-wf-before.json`.
