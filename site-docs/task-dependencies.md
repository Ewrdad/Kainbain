---
title: Task Dependencies
section: working-with
order: 45
slug: task-dependencies
---

# Task Dependencies

One task can wait on another: the blocked task sits in its agent or CI column but never executes until every blocker completes. Create a chain of tasks, approve once, and the orchestration releases each step in order.

## Set a dependency

- Open the task inspector and use **Blocked by** to choose prerequisite tasks from the searchable dropdown (search by title or `#KB-…` key). Only other active, non-complete tasks are offered. Each selected entry shows its live status so you can see what is being waited on. Save applies the change; Clear removes every dependency.
- Via API, pass `blockedBy` (array of task ids) on create or PATCH:

```bash
curl -X POST http://localhost:3100/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Build UI", "goal": "Build the UI…", "blockedBy": ["<api-task-id>"]}'
```

## While blocked

- The scheduler skips blocked tasks, manual run returns HTTP 409, and Run controls are disabled on the card and in the inspector.
- `GET /tasks/queue` ranks blocked tasks last with reason `Blocked by: <ids>`, and the card shows a Blocked badge.
- A blocked task reads `BLOCKED` in the card status row and in the inspector and detail-page headers instead of any `*_READY` label. The row itself stays short; hovering (or a screen reader) names the blockers as `#KB-XXXX` keys, capped at three with a `+N more` suffix. Stronger signals keep precedence: a running, failed, retrying, or completed task keeps its own label.
- Completing every blocker releases the dependent on the next scheduler tick — no extra click needed.

## Rules

| Rule | Behaviour |
| --- | --- |
| Self-block | Rejected with HTTP 400 (`Task cannot block itself`). |
| Unknown id | Rejected with HTTP 400 — a typo never looks like success. |
| Dependency cycle | Rejected with HTTP 400 before it can deadlock the queue. |
| Failed or cancelled blocker | The dependent stays blocked; cancel or re-point it once a human has judged the failure. |

Dependencies are same-project only. Tasks without `blockedBy` behave exactly as before.
