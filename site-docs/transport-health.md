---
title: Transport & Health
section: how-it-works
order: 40
slug: transport-health
---

# Transport & Health

## Real-time transport

The UI stays live over a project-bound WebSocket (`/ws?projectId=...`). Frames are JSON (`{ type, sessionId, payload, timestamp }`) covering messages, tool calls, process output, stage transitions, checkpoints, and engine state. The board merges `TASK_UPDATED` payloads instantly and reconciles with a coalesced refresh.

Background tabs are throttled hard by browsers, so the app also polls lightly while visible and forces a catch-up refresh on focus/visibility — the board never stays stale.

## Health model

`GET /status` reports global health, an engine snapshot (`idle` vs `running`, active task id), and build info. Probes cover the model backends (LiteLLM, Ollama Cloud) and the host device (memory pressure can flip device health to `error`).

- Results are cached briefly (15 s default) with `?refresh=true` to bypass.
- The header traffic light reflects the aggregate; the Observability view (keyboard `4` / `O`) shows per-project metrics and hides the global header in favor of its own telemetry header.

## Compute engine

`POST /compute/start` and `POST /compute/stop` toggle the execution engine per project (keyboard `P`). `GET /compute/status` reports whether any sessions are active, and `GET /compute/models` lists runnable models with an optional refresh.
