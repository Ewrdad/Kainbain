# 05 — UI: board and views (scratch UI)

Setup: file 00 **with** the UI (`$UI`, API on `$BASE`). Seed data via API
(faster and more reliable than clicking), assert in the browser.
Human path: open `$UI/` yourself. Agent path: drive the same public UI
(headless browser against `$UI`); never inject state via devtools,
localStorage edits, or direct DOM calls — clicks/keys only.

Each test: create fixtures via its API pre-step, delete them in cleanup
(MT-TASK-04 / MT-PROJ-08), and hard-refresh (`Ctrl/Cmd+Shift+R` equivalent:
reload ignoring cache) to prove the final state comes from the server.

## MT-UI-01 — Board loads with the seeded pipeline

- **Priority:** P0.
- Steps: open `$UI/`; wait for the project selector; select `Project A`.
- Expected: title matches `KainBain`; one kanban column per workflow
  stage in order (Idea → … → Deploy for the seeded pipeline); no blank
  board, no error banner, browser console has no uncaught errors.
- Cleanup: none (read-only). Screenshot/console log attached to run log.

## MT-UI-02 — Create task from the board, card placement

- **Priority:** P0.
- Steps (API pre-step optional): create `MT $RUN_ID board task` in
  stage 1 via MT-TASK-01, reload; then also create one task through the
  board's own create affordance in a later column if present.
- Expected: card appears under the correct stage column with the goal/
  title text; card count per column matches `GET /tasks?projectId=…`.
  UI-created tasks (if the affordance auto-executes agent stages, stop
  the engine right after: `POST /compute/stop`) land in the project you
  are viewing, not another project.
- Cleanup: `/compute/stop`; delete both tasks via API; reload; cards gone.

## MT-UI-03 — Drag-and-drop / move between columns

- **Priority:** P1.
- Steps: drag the MT-UI-02 card (or use its move control) to another
  column; reload; check `GET /tasks/<id>`.
- Expected: card is `draggable`, target column accepts the drop, and the
  API's `currentStageId` equals the drop column's `data-stage-id` after
  reload — UI and API agree. Dropping back restores the original stage.
- Cleanup: move back or delete the task; reload; verify column counts
  match the API list.

## MT-UI-04 — Task detail: open, edit, history, logs

- **Priority:** P0.
- Steps: open the MT task's detail (card click → detail page/overlay,
  route `#/tasks/<id>`); edit title/goal and save; inspect History and
  Logs panes; open the canonical `#/tasks/<id>` URL directly;
  open legacy `#/task/<id>` and confirm redirect to `#/tasks/<id>`.
- Expected: edits persist after reload (API GET agrees); history shows
  create/move entries; logs pane renders entries without layout break;
  legacy URL redirects (replace, not a second history entry loop).
- Cleanup: delete the task via API; reload board; detail URL now shows
  a clean not-found/empty state, not a crash.

## MT-UI-05 — Human checkpoint controls (Approve / Reject)

- **Priority:** P0.
- Steps: API-place a task in the human stage (MT-EXEC-02); open it in
  the UI; use **Reject** with feedback; re-place; use **Approve**.
- Expected: checkpoint controls render only at the human stage; Reject
  requires feedback (empty submit blocked in UI and by API `400`);
  after Reject the card sits in the failback column; after Approve it
  sits in the next column. API state matches after reload.
- Cleanup: delete the task; reload; no `waiting_human` MT card remains.

## MT-UI-06 — Project switching and workflow switching

- **Priority:** P0.
- Steps: create the disposable project (MT-PROJ-01) with one MT task;
  switch projects in the selector (Project A ↔ MT project); switch the
  named workflow if the project has more than one.
- Expected: board, columns, and cards always belong to the selected
  project/workflow; no cross-project card flashes or stale columns;
  the selector shows the active project name. API `activeWorkflowId`
  agrees after a workflow switch.
- Cleanup: switch back to Project A + its original workflow; delete the
  MT task and project (MT-PROJ-08); reload on Project A.

## MT-UI-07 — Explorer, Observability, Docs, Retrospective views

- **Priority:** P1.
- Steps: visit each route: `#/explorer`, `#/observability`, `#/docs`,
  `#/retrospective`; open one docs article (`#/docs/<slug>` from
  `GET /docs`); use the system menu's Docs / System Settings entries.
- Expected: every view renders its real content (file tree, metrics,
  article markdown, retrospective UI) with no blank pane or console
  error; unknown slug/route falls back to the default view without a
  white screen. System Settings opens its dedicated screen
  (`#/system-settings`).
- Cleanup: none (read-only). Return to `#/`; confirm board intact.

## MT-UI-08 — Settings screens (project + system)

- **Priority:** P1.
- Steps: open `#/settings` (project) and `#/system-settings` (and one
  `#/system-settings/<section>` deep link); change nothing yet — just
  record the values shown for the disposable project.
- Expected: values match `GET /projects/<id>` and `GET /status/config`;
  deep link lands on the named section; no secret is rendered in plain
  text. (Mutating settings are tested in file 07 via API.)
- Cleanup: if you changed any field to test the form, revert it to the
  recorded value, save, and verify via API GET. Leave Project A active.

## MT-UI-09 — Review page

- **Priority:** P1.
- Steps: API-create a task, open `#/tasks/<id>/review`; add review state
  via file 06 (MT-DOC-07) if needed to have something to render.
- Expected: review page loads the task's diff/comments surface without
  error; legacy `#/task/<id>/review` redirects to the canonical path.
- Cleanup: delete the task; reload; review URL degrades cleanly.

## MT-UI-10 — Survey page

- **Priority:** P2. `SKIP` if no survey-pending task can be produced.
- Steps: produce/open a survey task → `#/tasks/<id>/survey`; answer
  partially, reload, finish; legacy `#/task/<id>/survey` redirect.
- Expected: partial answers survive reload; completion advances the
  task (API agrees); missing-required questions are flagged in the UI.
- Cleanup: delete the task (MT-TASK-12 cleanup); verify `surveyPending`
  false on survivors.

## MT-UI-11 — Responsive + paused/empty states

- **Priority:** P2.
- Steps: at a phone viewport (375×667) and desktop (1280×720): board,
  task detail, system settings. Then view an empty project
  (new disposable project, no tasks).
- Expected: no horizontal scroll or overlapping header/footer at either
  size; empty board shows an intentional empty state, not an error.
  (The deployed title may read `[Paused] KainBain - Orchestrator` when
  the engine is paused — that prefix alone is not a failure.)
- Cleanup: delete the empty disposable project (MT-PROJ-08 pattern);
  restore desktop viewport; leave Project A selected.

## MT-UI-12 — Real-time updates (WebSocket)

- **Priority:** P1.
- Steps: with the board open, create + advance a task **via API** in
  another client/terminal; watch the board without reloading.
  (Protocol-level check: MT-NEG-09.)
- Expected: the card appears/moves live within a few seconds; no manual
  refresh needed; disconnecting/reconnecting the browser does not
  duplicate cards after the next reload.
- Cleanup: delete the task via API; confirm the card disappears (live
  or after one reload — record which).
