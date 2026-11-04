---
title: First-Time Setup
section: working-with
order: 15
slug: first-time-setup
---

# First-Time Setup

The ordered path from a fresh checkout to a running KainBain with your first
project created. Each step links to its detail page — Install & Run
(`#/docs/install-run`) for commands, Ports & Environment
(`#/docs/ports-env`) for knobs.

## 1. Prerequisites

- Node.js `^20.19.0` or `>=22.12.0` plus npm `>=10` (see Install & Run (`#/docs/install-run`) for the full list).
- Model access is optional for now: the app boots with no agent CLI and no API keys (see Cold start below).

## 2. Install

From the repo root:

```bash
npm run setup          # once per clone: all deps + Playwright Chromium
```

## 3. Configure

The frontend learns the API origin from `frontend/.env`:

```text
VITE_API_BASE=http://localhost:3100
VITE_WS_URL=ws://localhost:3100
```

Defaults point at a local API on `:3100`. If you deploy elsewhere, point both
at your API origin (or leave them empty for same-origin production builds).
Vite inlines `VITE_*` vars at dev-server start and at `vite build` — after
editing `.env`, restart the dev server (or rebuild).

## 4. Run

```bash
npm run dev            # start API + frontend dev servers (any OS)
```

This binds the API to `:3100` (`PORT` overrides) and the frontend to `:5173`
(`VITE_PORT` overrides), clearing whatever already occupies those ports.
For manual control instead, see Install & Run (`#/docs/install-run`).

## 5. Verify

| Check | Expected |
| ----- | -------- |
| Frontend `http://localhost:5173` | App loads, board visible |
| API `http://localhost:3100/status` | JSON health payload, HTTP 200 |
| API `http://localhost:3100/docs` | Index lists `first-time-setup` |
| Docs tab (keyboard `5`) | This article renders in-app |
| API docs `http://localhost:3100/documentation` | Swagger UI loads |

If the board is empty, that is normal — you have no projects yet. Continue
below.

## 6. Your first project

Create a project and shape its pipeline as described in Your First Project &
Workflow (`#/docs/first-project`): one agent stage plus a human review is
enough to start. The Files & Repo tab browses the project's sandboxed
filesystem.

### Already have a repo?

Adopt it instead of creating a new project — see Load Existing Projects
(`#/docs/existing-projects`). Nothing is moved or deleted.

## Cold start with nothing installed

On a box with no agent CLIs (`agy`, `muse`, `opencode`) and no API keys, the
app still boots: `GET /status` stays `ok` with the LiteLLM/Ollama probes
`disabled`, and `GET /harnesses` reports each harness as detected or missing
with a hint naming the fix. Project settings shows the same as badges plus a
guidance panel offering a one-click **mock harness** opt-in — synthetic
`Mock reply: …` output for evaluation/CI, never silently substituted for a
real harness. Installing a CLI into `~/.local/bin` (or anywhere on `PATH`)
is picked up on restart with no config edits.

## Which page next?

| You want to… | Read |
| --- | --- |
| Understand the whole journey | Getting Started (`#/docs/getting-started`) |
| Run work on more machines | Adding a New Runner (`#/docs/add-new-runner`) |
| Adopt an existing repo | Load Existing Projects (`#/docs/existing-projects`) |
| Change ports or variables | Ports & Environment (`#/docs/ports-env`) |
| Deploy to production | Self-Deployment & Rollback (`#/docs/self-deploy`) |
| Fix something broken | Triage FAQ (`#/docs/faq`) |
