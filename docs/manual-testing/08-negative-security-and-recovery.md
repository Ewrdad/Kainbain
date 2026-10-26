# 08 — Negative, security, and recovery (scratch only)

Setup: file 00 + disposable project. Theme: the refactor must fail
*closed and readably* — 4xx with a useful `error`, never a 500, a stack
trace, a hang, or silent corruption. After **every** test, re-run the
health probe in its cleanup: `curl -s $BASE/status` must be `ok` and
`GET /projects/$PID` unchanged, unless the test says otherwise.

## MT-NEG-01 — Unknown routes and ids

- **Priority:** P0.
- Steps: `GET $BASE/nope-mt`; `GET $BASE/tasks/<random-uuid>?projectId=$PID`;
  `GET $BASE/projects/<random-uuid>`; `POST /tasks/<random-uuid>/advance`.
- Expected: `404` (or documented 4xx) with a JSON `error`, no HTML error
  page, no stack trace, server still healthy.
- Cleanup: health probe (above). Nothing created.

## MT-NEG-02 — Malformed bodies

- **Priority:** P0.
- Steps: `POST /tasks` with invalid JSON (`-d '{bad'`); with
  `Content-Type: application/json` and empty body; `POST /tasks` with
  neither `goal` nor `title`; `PATCH /tasks/<id>` with a wrong-typed
  field (e.g. `"blockedBy":"not-an-array"`).
- Expected: each → `400` with a readable message; task count unchanged
  (list before/after). Empty-JSON-body on POST/DELETE returns the known
  `FST_ERR_CTP_EMPTY_JSON_BODY` 400 (README) — a *changed* message is
  noted, a 500 is FAIL.
- Cleanup: health probe; delete any task that unexpectedly got created
  (that itself is a FAIL to record).

## MT-NEG-03 — Path traversal in files API

- **Priority:** P0. (Verified pre-write: `../` → `403 Forbidden: Path traversal detected`.)
- Steps: `GET /projects/$PID/files/content?path=../secret`;
  `?path=../../etc/passwd`; `?path=%2e%2e%2fsecret`; a symlink escape if
  you plant one inside the scratch cwd pointing outside it;
  same probes against `/files/raw` and `/files?path=../`.
- Expected: every escape → `403`/`400`, body contains no file content
  from outside the project root. A legitimate nested path
  (`mt-fixture/hello.md`, MT-DOC-02) still reads fine — over-blocking
  is also FAIL.
- Cleanup: remove any symlink/fixture you planted (inside `$MT_ROOT`
  only); health probe.

## MT-NEG-04 — Cross-project isolation

- **Priority:** P0.
- Steps: with disposable projects P1+P2 and a task in P1: read/patch/
  execute/delete that task id with `projectId=P2`; read P1's files via
  P2's id; list P2's tasks.
- Expected: cross-project access returns 404/empty — never P1's data.
  P2's list never contains P1's task. (Sessions are per-project too:
  `GET /session/history` for P2 must not show P1's run.)
- Cleanup: delete the P1 task + both projects (MT-PROJ-08 ×2);
  health probe.

## MT-NEG-05 — Conflicting execution (409 paths)

- **Priority:** P1.
- Steps: execute a blocked task (MT-TASK-09 fixture) → expect `409`;
  execute a task while another owns the engine (MT-EXEC-08) → `409` or
  queued (record which, must match pre-refactor); advance a
  `completed` task.
- Expected: conflicts are explicit 4xx with reasons; no task changes
  stage/status as a side effect of a rejected call (GET before/after).
- Cleanup: `/compute/stop`; delete fixtures; engine idle; health probe.

## MT-NEG-06 — Restart persistence

- **Priority:** P0.
- Steps: note the disposable project + a task's full GET body; stop
  **only the scratch API** (PID from MT-SETUP-01; verify cmdline);
  restart it with the *identical* env from MT-SETUP-01; re-GET.
- Expected: project + task survive with same ids/stages/status/history;
  a task left `interrupted` by the shutdown is marked resumable
  (`wasInterrupted`/status per `/agent`), not silently `running`;
  engine boots `idle`; startup log shows recovery counts.
- Cleanup: delete the task + project (MT-PROJ-08); health probe.
  (Full teardown still happens in MT-SETUP-03.)

## MT-NEG-07 — Test-reset is scratch-only discipline

- **Priority:** P1.
- Steps (scratch): create a task; `POST $BASE/test/reset {"projectId":"$PID"}`;
  list tasks. Then confirm you understand the guardrail: **never** call
  this route on `:3100` — do not demonstrate that, just record the
  acknowledgement in the run log.
- Expected: scratch project's tasks/session reset deterministically;
  other seeded projects (Project A) unaffected.
- Cleanup: delete the disposable project (MT-PROJ-08); health probe.

## MT-NEG-08 — Oversized / wrong-type uploads

- **Priority:** P2.
- Steps: skill import with an oversized zip/payload (MT-DOC-05);
  task-image upload with a text file renamed `.png` (MT-DOC-08);
  file-content read of a large/binary file (MT-DOC-02).
- Expected: each rejected with 4xx and a size/type reason; nothing
  partial stored (list/detail checks); server responsive throughout
  (interleave `GET /status`).
- Cleanup: delete task/project fixtures; remove local fixture files;
  health probe.

## MT-NEG-09 — WebSocket connect and events

- **Priority:** P1.
- Steps: open a WebSocket to `ws://localhost:3417/ws`
  (browser console on `$UI`, or a small `node -e` `WebSocket` client);
  then create/advance a task via REST; disconnect and reconnect.
- Expected: socket connects (no auth error on scratch), task/engine
  events arrive for the REST mutations (the same events MT-UI-12 shows
  in the board), reconnect does not replay-duplicate board state after
  reload. Garbage frames do not kill the socket for other clients.
- Cleanup: close your socket/client; delete the task; health probe.

## MT-NEG-10 — Scheduler-off determinism (scratch premise)

- **Priority:** P1.
- Steps: create a task in an *agent* stage; wait 10s (> scheduler tick);
  GET the task; then run the same wait on a fresh task in Project A.
- Expected: with `KAINBAIN_DISABLE_SCHEDULER=true` nothing auto-dispatches:
  status/stage/history unchanged after the wait. (On live the scheduler
  *does* dispatch — do not run this there.)
- Cleanup: delete both tasks; health probe; engine still idle.
