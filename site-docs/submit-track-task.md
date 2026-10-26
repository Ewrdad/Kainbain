---
title: Submitting & Tracking a Task
section: working-with
order: 40
slug: submit-track-task
---

# Submitting & Tracking a Task

## Submit

Type a goal in the Orchestrator submission panel and confirm the **review prompt** preview — the prompt is curated fresh at dispatch, and the modal is read-only. Keyboard `N` jumps to the input. Or via API:

```bash
# Preview what the agent WOULD receive, without creating anything:
curl -X POST http://localhost:3100/tasks/preview \
  -H 'Content-Type: application/json' \
  -d '{"goal": "Add pagination to the task list", "projectId": "<id>"}'

# Create and dispatch immediately:
curl -X POST http://localhost:3100/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Paginate tasks", "goal": "Add pagination…", "execute": true}'
```

Pass `idempotencyKey` to make creation safe to retry.

## From the repo view

While browsing **Repository & Files**, select any file and press **Create task from here** in the preview toolbar. A dialog opens with the target pipeline and stage plus a description pre-filled with `In reference to: <file path>` — extend it with what needs cleanup or refactoring, then submit. The task lands on the chosen pipeline/stage (the board switches over when it isn't the active one), and automated stages start immediately while human checkpoints wait for review.

## Track

- The **kanban board** shows every task in its current stage; drag between columns or use the card actions.
- The board's **search bar** filters in one field: free text matches goal, title, id, and keywords; `#tag` collapses stages without that tag (e.g. `auth #Dev`); `!filter` applies system-native filters — `!failed` shows only failed tasks, `!human` only tasks waiting at human checkpoints. Everything combines (`auth #Dev !failed`), renders as removable chips, and follows the Any/All toggle (`all` = match every filter, `any` = match at least one). The same bar wraps onto its own row on phones, so filtering works there too.
- Open a card for goal edits, stage history, and reports. Edits auto-save (debounced) and are flushed before any approve/reject, so the agent never advances on stale text.
- On the **History** tab, a failed stage shows the first line of its failure reason inline; **View full reason** opens the complete reason (plus stage id and log excerpts) in a modal that closes via Escape, backdrop click, or the Close button. Entries recorded before failure reasons existed render unchanged.
- Each history entry also shows a small `+N -M` badge beside its duration: the lines added and removed during that stage only (e.g. an Implement stage that adds 1000 lines shows `+1000 -0`, while a following automated-test stage that changes nothing shows `+0 -0`). Entries recorded before badges existed, or when git is unavailable, show no badge. Entries recorded before per-stage badges existed keep their stored numbers unchanged.
- The same meta line carries a small **stage model attribution** footnote (`harness · model`, plus `· alias <name>` when a model alias resolved the pick) on a row for any agent run **of that row's own stage** — the same resolved choice the session init line and the stage report's **Model** line recorded, so a model that keeps failing on one stage is easy to spot. Rows of stages that do not run an agent (CI, merge, deploy, and human checkpoints) intentionally show nothing at all — an agent run's badge never lands on another stage's row. Entries recorded before attribution existed render unchanged.
- `GET /tasks/:id?projectId=...` reads stage, status, and history; `GET /tasks/queue` shows dispatch priority.
- While a task runs, **steer** it (`POST /tasks/:id/steer`) or send **follow-up** guidance without restarting the session.

## Subscribe live

```text
WebSocket /ws?projectId=<id>  ->  { type, sessionId, payload, timestamp }
```

One socket per project replaces all polling. `GET /session/history` catches you up after a reconnect.
