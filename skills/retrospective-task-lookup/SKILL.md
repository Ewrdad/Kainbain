---
name: retrospective-task-lookup
description: How to look up KainBain task details and analyse past tasks during a retrospective chat turn — how to read the injected task-context block, when and how to fetch deeper detail (report bodies, task files, API), and the citation contract for grounded answers. Use when answering questions about tasks, failures, durations, or trends.
lastUpdated: 2026-10-29
---

# Retrospective Task Lookup

You are answering a retrospective chat turn about KainBain tasks. Some turns
run with file/API tools (pi harness sessions) and some without (mock or
tool-less harnesses). Ground every claim in evidence: the injected context
block first, deeper lookups only when your session has tools.

## 0. General trends / no tasks selected

Some turns arrive with NO selected tasks (no injected `## Task …` block).
Do not pretend specific task context exists and do not invent task ids.
For overview questions, list recent tasks yourself, bounded and cited.

### Listing recent tasks

- `GET {{kbApiBase}}/tasks?projectId=<projectId>` — duration-enriched
  summaries (`id`, `title`, `status`, `stage`, `workflowId`,
  `failureReason`, durations, totals). Optional `workflowId` narrows to
  one pipeline; `GET {{kbApiBase}}/tasks/<id>` hydrates one full task.
  Lists carry summaries only — no log bodies.
- `GET {{kbApiBase}}/tasks/queue?projectId=<projectId>` — scheduled order.
- Start with the newest 10–20 rows. Use the turn's project id, never
  directories or keys. Cite every task id you touch; name unavailable
  rows instead of guessing.

## 1. Read the injected context block

Each turn carries `## Task <id>: <title>` sections (newest task last):

- `status` / `stage` / `workflow` — where the task is in its pipeline.
- `goal` — the task goal, truncated to ~500 chars (an `…` marks truncation).
- `failureReason` / `lastError` — failure evidence; `lastError` is the first
  line only, so treat it as a pointer, not the full story.
- `stageDurations` — per-stage seconds samples plus the active total.
- `reports:` — `StageName=STATUS` pairs (e.g. `Implement=FAILED`),
  newest-stage metadata only, never bodies.
- `recent history (newest last)` — up to 10 audit entries
  (`stage=… status=… at=…`).

A `(Note: the oldest tasks were dropped…)` line means the block hit its char
budget: the tasks shown are the NEWEST. Never claim knowledge of dropped
tasks — say which tasks your answer covers.

`{{projectCwd}}` is the project root on disk; `{{kbApiBase}}` is the API base
(default `http://localhost:3100`).

## 2. Lookup ladder (only when your session has tools)

1. **Context block first.** Most questions (status, failure reason, stage
   history, duration outliers) are answerable without leaving it.
2. **Task files** under `{{projectCwd}}/docs/tasks/<taskId>/`: `task.md`
   holds the record (`# Goal`, `# History`, `# Log Entries` — the stored log,
   no rendered tail); each `<stage-slug>-<timestamp>.md` is one stage run.
   Read the FAILED report plus the entries tail; Runner tasks ran in a
   Runner-host worktree.
3. **API** when files are stale or you need live state:
   `GET {{kbApiBase}}/tasks/<id>` (full task incl. history/reports),
   `GET {{kbApiBase}}/status/observability` (engine + recent failed lists).
   Chat sessions are project-scoped: never assume deploy/systemd access.

If a lookup is impossible (no tools, missing file, API unreachable), say so
and answer from the provided context — never invent the missing detail.

## 3. Analysis contract

- **Cite task ids for every claim** (`task-abc123: …`). A claim without a
  cited source is a guess — label it as such.
- Say **"not in the provided context"** rather than guessing at dropped
  tasks, unlisted fields, or unseen reports.
- Recipes: failure clustering (group by `failureReason`/`lastError` first
  line, then confirm via reports); duration outliers (compare
  `stageDurations` totals within the same stage, not across stages);
  stage-failure rates (count `reports:` pairs per stage).
- Ticket drafts: emit ONE fenced ```json block with `[{title, goal}]` only
  when you genuinely propose new work; the user confirms. Never claim to
  have created, filed, or run anything.

## 4. Anti-patterns

- Don't invent task ids or report contents.
- Don't assume deploy/systemd/journal access — chat sessions are not ops
  shells.
- Don't treat `docs/tasks/active/` scratch notes as authoritative.
- Don't repeat the whole context block back; summarise with citations.
