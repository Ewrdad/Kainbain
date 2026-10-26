---
title: Activity Stream
section: how-it-works
order: 70
slug: activity-stream
---

# Activity Stream

The activity stream is the live narrative of what the system is doing: agent messages, tool calls, process output, stage transitions, and system events, each with a severity. It powers the activity drawer in the Orchestrator view and the session timeline.

## Where it comes from

- **WebSocket frames** (`MSG_*`, `TOOL_*`, `PROCESS_*`, `STAGE_*`, `NOTIFICATION`, `ENGINE_STATE`, `SYSTEM_LOG`) arrive in real time and are appended to the per-project feed.
- **Task logs** are structured entries (`task.logEntries`), the only stored log representation. When an agent needs its own stage stream, it should use the feed endpoint (`GET /tasks/:id/logs?feed=main|thinking|tools|telemetry|raw&format=entries|text`) instead of reading verbose log text — `format=text` is a derived view over the entries; rendered `processLogs` text is no longer stored.
- **Stage reports** (`GET /tasks/:id/reports`, `POST /tasks/:id/report`) are the durable artifacts each stage leaves behind — the stream is ephemeral, reports are the record.

## Reading it

- Watch `STAGE_ENTER` / `STAGE_COMPLETE` / `STAGE_FAILBACK` to follow pipeline movement.
- `STAGE_CHECKPOINT_WAIT` means a task is parked at a human gate — it needs you, not more time.
- `PROCESS_EXIT` with a nonzero code precedes `failed`; check the preceding `PROCESS_STDERR` frames first.
- The Observability view aggregates the same events into per-project metrics when you want trends instead of the live tail.

## Log viewer

Every log surface (task Logs tab, monitor console, orchestrator activity
drawer) shares one viewer with multi-select category lanes, each showing its
own count: **Direct output**, **Tool calls**, **Thinking traces**, **CI
logs**, **Stage movement**, **Verbose debug**, **System**,
**Human/checkpoints**, **Errors**, **Git**, and **Telemetry/raw**. Toggle
lanes to choose what you see, search to narrow further, and switch between
**Compact** and **Full** density with optional timestamps (`HH:MM:SS`,
millisecond, or ISO). Error lines and human checkpoints are highlighted directly within the stream and filterable via the category lanes, maximizing vertical log visibility. Full
thinking blocks stay collapsed until you open the Thinking traces lane, and
Verbose debug plus Telemetry stay off until you opt in.

## Unified logging (see also #/docs/unified-logging)

Task logs now carry additional feeds and kinds for telemetry, permissions,
plans and raw evidence. See `#/docs/unified-logging` for the full record schema
and per-harness mapping.
