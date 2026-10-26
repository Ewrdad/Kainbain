# 06 — Files, docs, skills, review, reports (scratch only)

Setup: file 00 + disposable project (`$PID`). The disposable project's
`cwd` lives under `$MT_ROOT/projects/…` — file fixtures go there only.

## MT-DOC-01 — List project files

- **Priority:** P0.
- Steps: `curl -s "$BASE/projects/$PID/files"`;
  `curl -s "$BASE/projects/$PID/files?path=<subdir>"` for a subdir you
  create inside the project cwd (`mkdir -p <cwd>/mt-fixture`).
- Expected: `200`; entries have name/kind; subdir listing contains only
  that subdir's entries; listing a file path or missing dir → clean
  4xx, not 500.
- Cleanup: `rmdir`/`rm -rf` only the `mt-fixture` dir you created inside
  the scratch cwd; re-list root to confirm it is gone.

## MT-DOC-02 — Read file content (+ raw/preview)

- **Priority:** P0.
- Steps: write `mt-fixture/hello.md` (`# MT hello`) inside the scratch
  cwd; `GET $BASE/projects/$PID/files/content?path=mt-fixture/hello.md`;
  `GET $BASE/projects/$PID/files/raw?path=mt-fixture/hello.md`;
  repeat for a missing file.
- Expected: content returns the exact UTF-8 text; raw returns the bytes
  (image files get a preview URL shape `/projects/<id>/files/raw?path=…`);
  missing file → 404; binary file is detected (not dumped as garbled
  text into the explorer).
- Cleanup: delete `mt-fixture/hello.md` (with MT-DOC-01 cleanup);
  verify content GET now 404s.

## MT-DOC-03 — Docs index and article

- **Priority:** P0. Read-only (also allowed on live).
- Steps: `curl -s $BASE/docs`; pick the first `slug`;
  `curl -s -D - $BASE/docs/<slug> -o /tmp/mt-doc.md`; check headers;
  `curl -s $BASE/docs/does-not-exist-mt`.
- Expected: index is `[{slug,title,section,order}]` with sections
  `how-it-works`/`working-with`; article is `200` with
  `Content-Type: text/markdown` and non-empty body starting with a
  heading; bogus slug → 404. Same slugs render in the UI (MT-UI-07).
- Cleanup: `rm -f /tmp/mt-doc.md`. No server state changed.

## MT-DOC-04 — Skills library (global + project overlay)

- **Priority:** P1. Read-only parts allowed on live.
- Steps: `curl -s $BASE/skills`; `curl -s "$BASE/skills?projectId=$PID"`;
  `curl -s $BASE/skills/<first-name>`; `curl -s $BASE/skills/nope-mt`.
- Expected: list includes the shipped defaults (stage-report,
  stage-verdict, question-me, …); detail returns raw `SKILL.md`
  markdown + parsed config; bogus name → 404. Project overlay only
  *adds/overrides* — global entries still present.
- Cleanup: none for reads. If you imported a skill (MT-DOC-05), its
  cleanup is mandatory there.

## MT-DOC-05 — Import and delete a project skill

- **Priority:** P1.
- Steps: `POST $BASE/projects/$PID/skills/import` with a minimal
  throwaway skill (follow the shape in `GET /agent`; a tiny `SKILL.md`
  named `mt-$RUN_ID-skill`); `GET $BASE/skills?projectId=$PID`;
  import the same name again; import an oversized/invalid payload.
- Expected: import succeeds once and the skill appears in the project
  overlay; re-import behaviour (replace or reject) is clean and
  recorded; invalid/oversized → 4xx with nothing half-written
  (detail GET 404s afterwards).
- Cleanup: `curl -s -X DELETE $BASE/projects/$PID/skills/mt-$RUN_ID-skill -H 'Content-Type: application/json' -d '{}'`;
  verify the overlay list no longer contains it and the global list is
  unchanged.

## MT-DOC-06 — Stage reports: write and list

- **Priority:** P0.
- Steps: create a task; `POST $BASE/tasks/$TID/report {"projectId":"$PID","stageName":"MT Stage","content":"MT report body"}`;
  `GET $BASE/tasks/$TID/reports?projectId=$PID` (query form per route);
  execute a stage (MT-EXEC-01) and list again.
- Expected: manual report appears verbatim; execution adds an
  auto-generated report (stage name, status, duration). Reports belong
  to the task — another project's task id returns nothing/404.
- Cleanup: delete the task; verify reports are gone with it
  (`GET …/reports` → 404/empty).

## MT-DOC-07 — Review: get, comment, reply, edit, delete

- **Priority:** P0.
- Steps: create a task;
  `GET $BASE/projects/$PID/tasks/$TID/review`;
  `POST …/review/comments {"body":"MT review comment"}` (field names
  per `/agent`/route schema — adapt and record);
  `POST …/comments/<cid>/replies {"body":"MT reply"}`;
  `PATCH …/comments/<cid> {"body":"MT edited"}`;
  re-GET the review after each step.
- Expected: review loads (empty state is fine pre-diff); comment +
  reply nest correctly with author/timestamps; PATCH edits only that
  comment; comments from another project/task are not visible here.
- Cleanup: `DELETE …/comments/<cid>` (with `-H 'Content-Type: application/json' -d '{}'`);
  verify the thread is gone; delete the task. No review files remain
  under the scratch project (check its `docs/tasks/<tid>` dir is
  removed with the task, or record an orphan as FAIL).

## MT-DOC-08 — Task images: upload, list, fetch, delete

- **Priority:** P2.
- Steps: create a 1×1 PNG fixture locally; 
  `POST $BASE/projects/$PID/tasks/$TID/images` (multipart, field per
  `/agent`); `GET …/images`; `GET …/images/<name>`;
  upload a non-image / oversized file.
- Expected: valid image listed and fetchable byte-identical;
  non-image/oversized → 4xx, not stored (list unchanged).
- Cleanup: `DELETE …/images/<name>` (JSON-body quirk applies);
  verify list empty; delete the task; `rm` the local fixture.

## MT-DOC-09 — Task logs and stuck-check

- **Priority:** P1.
- Steps: after MT-EXEC-01: `GET $BASE/tasks/$TID/logs?projectId=$PID`;
  `POST $BASE/tasks/$TID/stuck-check {"projectId":"$PID"}`.
- Expected: logs are chronological with kinds (`assistant`/`system`/
  `telemetry`/…) and the mock session lines; stuck-check returns a
  verdict object (not a 500) for both a fresh and an executed task.
- Cleanup: delete the task; logs endpoint → 404/empty afterwards.

## MT-DOC-10 — Retrospective chat (smoke)

- **Priority:** P2. `BLOCKED` is fine without a real harness/model.
- Steps: `POST $BASE/retrospective/chat` with a minimal documented
  payload (per `/agent`); open `#/retrospective` in the UI.
- Expected: on scratch/mock the endpoint either answers from available
  task data or fails with a clean, readable error — never a hang or
  500 stack trace; UI renders the same state.
- Cleanup: no persistent state expected; verify `GET /tasks?projectId=$PID`
  is unchanged (retrospective is read/analysis, not mutation). Delete
  any task you created for it.
