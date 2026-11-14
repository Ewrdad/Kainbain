---
description: A sample skill that lets a non-KainBain AI agent integrate with the KainBain live service — discover projects, create, view, and manage tasks, and watch the agent engine run them through the pipeline.
name: kainbain-agent
lastUpdated: 2026-08-24
---

# KainBain Agent Integration Skill

This skill teaches an AI agent how to operate the live **KainBain** task-orchestrator
service over HTTP + WebSocket. It lets a non-KainBain agent create, view, manage, and
execute tasks, and subscribe to live engine events, without reading KainBain's source.

Start by fetching the live, always-current guide:

```text
GET /agent          → full structured JSON guide (recommended)
GET /agent/guide    → human-readable markdown
GET /agent/schema   → compact machine manifest (endpoints, statuses, WS events)
```

OpenAPI spec (interactive) lives at `/documentation` on the API base.

## Prerequisites / setup

- The KainBain API must be reachable. Dev default: `http://localhost:3100`.
  Production is served at `https://kainbain.local` (same origin as the UI).
- No auth token is currently required — requests from the local network /
  `.home` origins are accepted. Confirm via `GET /status` (`status: "ok"`).

## Core concepts

- **Project** — a workspace with an ordered list of **stages** (a workflow).
- **Stage** — one step a task passes through. Types: `agent` (AI execution),
  `human` (review checkpoint), `ci` (script verification).
- **Task** — a discrete unit of work created into a stage. This is the object
  you create and manage.
- **projectId** is optional on most routes; omitted → the currently **active**
  project.

## Creating a task

```http
POST /tasks
{
  "projectId": "<projectId>",     // optional; defaults to active project
  "title": "Implement health endpoint",
  "goal": "# Implement health endpoint\n\n## Steps\n1. Add `GET /health` returning JSON status.",
  "execute": true,                 // true = dispatch to AI queue now
  "blockedBy": [],                 // optional; same-project task ids this task waits on
  "idempotencyKey": "<deterministic key>"  // optional; makes retries safe
}
```

- `goal` accepts rich Markdown **verbatim** — headings, lists, tables, fenced code blocks, ` ```mermaid ` diagrams, and image references (`![alt](assets/name.png)` or absolute URLs). Create stores it byte-identical (no trimming or re-wrapping) and it renders as markdown in the UI and in `docs/tasks/<taskId>/task.md`. The goal's **first line** (e.g. `# <title>`) becomes the task title; the `#` marker is stripped when storing.
- Use `idempotencyKey` to make creation safe to retry.
- To preview a task's prompt without running it: `POST /tasks/preview`.

### Recommended two-stage layout for readable tasks

The `creating-new-tickets` skill drafts each ticket as its own Markdown file in the current task's directory first, then sends that file's exact contents — so tickets land as structured documents instead of paragraphs:

1. Write one file per ticket under the current task's docs folder, e.g. `docs/tasks/<current-task-id>/drafts/draft-<slug>.md`, starting with a `# <title>` first line (the skill's template: Context / Steps / Acceptance criteria / Notes with code, mermaid, image refs).
2. `POST /tasks` with `goal` = the **exact file contents** and `title` = the file's first line (verbatim, `#` included — the API strips it when storing).
3. For local images only: after the task exists, upload each picture via `POST /projects/<projectId>/tasks/<taskId>/images`, then `PATCH /tasks/<taskId>` with a `goal` whose `![alt](assets/<name>)` refs use the names returned by the upload (never guessed filenames). Absolute `https://` image URLs pass through unchanged and need no upload.


## Viewing tasks

```text
GET /tasks                       # list (optionally ?workflowId=...)
GET /tasks/:id                   # one task
GET /tasks/:id/reports           # artifacts a stage produced
GET /status                      # engine snapshot (active task, idle/running)
```

## Managing a task

| Action | Call |
| --- | --- |
| Advance / approve | `POST /tasks/:id/advance` `{ guidance? }` |
| Reject with feedback | `POST /tasks/:id/reject` `{ feedback }` |
| Move / jump stage | `POST /tasks/:id/move` / `.../jump` `{ stageId }` |
| Fail back to a stage | `POST /tasks/:id/failback` `{ fallbackStageId }` |
| Execute a stage | `POST /tasks/:id/execute` |
| Follow up / steer | `POST /tasks/:id/follow-up` `{ prompt }` · `.../steer` `{ guidance }` |
| Pause / resume / retry / abort | `POST /tasks/:id/pause` · `.../resume` · `.../retry` · `.../abort` |
| Complete | `POST /tasks/:id/complete` |
| Edit fields | `PATCH /tasks/:id` `{ title, goal, prompt, status, blockedBy, stageId }` |
| Delete | `DELETE /tasks/:id` |

## Watching live events (WebSocket)

Connect to:

```text
ws://localhost:3100/ws?projectId=<projectId>   # or wss://kainbain.local/ws?...
```

Frames are JSON: `{ type, sessionId, payload, timestamp }`. Useful types:
`MSG_UPDATE`, `TOOL_START/UPDATE/END`, `AGENT_DONE`, `PROCESS_STDOUT/STDERR/EXIT`,
`STAGE_ENTER/COMPLETE/FAILBACK`, `ENGINE_STATE`, `NOTIFICATION`, `SYSTEM_LOG`.
Use `GET /session/history` after (re)connecting to reconcile missed events.

## Example: create → advance → complete

1. `GET /projects` → pick `projectId`.
2. `POST /tasks` `{ projectId, goal: "...", execute: true }` → `task.id`.
3. `GET /tasks/:id` → poll `status` / `currentStageId`.
4. On a human/review stage, `POST /tasks/:id/reject { feedback }` or
   `POST /tasks/:id/advance`.
5. `POST /tasks/:id/complete` when done.

## Notes & best practices

- Prefer the **active project** by omitting `projectId` where it is not specific.
- The engine is **single-threaded** — poll `GET /status` and honor
  `engine.status === "running"` before dispatching more execution to avoid
  queueing surprises. Prefer WebSocket events over polling when real-time
  matters.
- Respect stage types: don't auto-advance a `human` stage without a decision;
  use `reject { feedback }` to fail a task back.
- Tasks may be `blocked` by `blockedBy` dependencies; check before executing.
