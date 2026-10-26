---
title: System Architecture
section: how-it-works
order: 10
slug: architecture
---

# System Architecture

> Formerly also covered by `how-kainbain-works` (file `kainbain-overview.md`, removed) — that overview's
> two-halves intro and task flow are consolidated here; see Workflow Pipeline & Stage Types
> (`#/docs/pipeline-stages`) and Agent Execution & Sandboxing (`#/docs/agent-execution`) for detail.

KainBain is an AI task orchestrator: you define a multi-stage workflow pipeline, submit tasks, and watch an AI agent execute each stage while you review, reject, or re-route work through a kanban board.

## The two halves

- **`api/` — Fastify backend.** A thin HTTP + WebSocket layer over domain stores (`ProjectStore`, `TaskStore`, `SessionStore`, `TaskQueue`) and the agent SDK. Agent sessions are disk-persisted and isolated per project, so a restart resumes rather than loses work.
- **`frontend/` — React (Vite) UI.** State is centralized in `KainBainContext`, composed from small domain hooks (websocket, tasks, workflow, projects, notifications). Components stay thin; the context owns the state.

## How a task flows through the system

1. You submit a goal (Orchestrator view or `POST /tasks`).
2. The prompt engine curates a stage-specific prompt for the task's current stage.
3. The scheduler dispatches it to the agent queue; the harness executes it in a project-scoped session.
4. Stage output lands as a report artifact; the task advances to the next stage.
5. Human stages pause for your approval — approve, reject with feedback, or re-route. Approving the last stage completes the task.
6. Live progress streams over WebSocket (`/ws?projectId=...`); the board syncs without refresh.

## One pipeline for all projects

There is a single global execution queue: at most one task runs at a time no matter how many projects hold work, ordered linearly (follow-on from the just-completed task first, then the task closest to completion, then the oldest). The **Now Playing bar** reflects that one queue — the named task, status badge, timer, queue depth, and Skip/play-pause all resolve from the engine owner, so **switching projects only changes the board/canvas view** and never moves the bar. Skip and play/pause likewise act on the engine owner's task in its owning project, regardless of which project is selected.

## Key design rules

- **API routes stay thin** over testable domain modules (see `api/agentGuide.js` for the convention).
- **Review comments anchor to diff files *and* stage reports.** The review sidecar (`docs/tasks/<taskId>/review-comments.json`) accepts report paths (`docs/tasks/<taskId>/*.md`) as valid anchors alongside git-diff paths, so reports stored outside the repository (centralised docs) can be reviewed line by line without a diff. Human approval/rejection reports fold those threads into the durable record and, on approval, into the task goal for the next stage.
- **Sessions are per-project and disk-persisted**, with an idle TTL and cleanup sweep.
- **One port serves everything in production**: the API serves the built frontend from the same origin, behind nginx at `https://kainbain.home`.
