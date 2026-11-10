---
title: First-Time Setup
section: working-with
order: 15
slug: first-time-setup
---

# First-Time Setup

The ordered path from a fresh checkout to a running KainBain with your first
project created. Detail pages cover each step in depth: Install & Run
(`#/docs/install-run`), Ports & Environment (`#/docs/ports-env`), Your First
Project & Workflow (`#/docs/first-project`).

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0` plus npm `>=10` (the `engines` field
  in `package.json` — a recent LTS works).
- Model access for the harness you will use: LiteLLM or Ollama Cloud. Both
  are optional — the app boots without them (their `GET /status` probes
  report `disabled`, never an error), and project settings will guide you to
  install a harness CLI or opt into the zero-credential mock harness for
  evaluation.

## Install

From the repo root:

```bash
npm run setup          # once per clone: all deps + Playwright Chromium
```

(That is the whole install. The per-piece commands live in Install & Run
(`#/docs/install-run`) — this page stays the ordered path, that page stays
the detail reference.)

## Configure

The frontend learns the API origin from `frontend/.env`:

```text
VITE_API_BASE=http://localhost:3100
VITE_WS_URL=ws://localhost:3100
```

Defaults point at a local API on `:3100`. If you deploy elsewhere, point both
at your API origin. Vite inlines `VITE_*` vars at dev-server start and at
`vite build` — after editing `.env`, restart the dev server (or rebuild).

## Run

```bash
npm run dev            # start API + frontend dev servers (any OS)
```

This binds the API to `:3100` (`PORT` overrides) and the frontend to `:5173`
(`VITE_PORT` overrides), clearing whatever already occupies those ports.
(`./deploy.sh --dev` still works — it delegates to the same runner.) For
manual per-piece control, see Install & Run (`#/docs/install-run`).

## Verify

| Check | Expected |
| ----- | -------- |
| Frontend `http://localhost:5173` | App loads, board visible |
| API `http://localhost:3100/status` | JSON health payload, HTTP 200 |
| API `http://localhost:3100/docs` | Index lists `first-time-setup` |
| Docs tab (keyboard `5`) | This article renders in-app |
| API docs `http://localhost:3100/documentation` | Swagger UI loads |

If the board is empty, that is normal — you have no projects yet. Continue
below.

## Your first project

Create a project and shape its pipeline as described in Your First Project &
Workflow (`#/docs/first-project`): one agent stage plus a human review is
enough to start. The Files & Repo tab browses the project's sandboxed
filesystem.

New projects need a fetchable git remote: paste it into the creation
dialog's Git Remote URL field (or set a server-side default remote
template). No remote yet — for example a local-only checkout? Adopt it
instead (below): adoption never needs a remote.

### Already have a repo?

If you want KainBain to work on an existing repository, adopt it instead of
creating a new project: **Project menu → “+ Add Existing Project…”** and enter
the repo's absolute path. Nothing is moved or deleted — KainBain only writes its
state folder (`<repo>/.kainbain`) and, when the repo sits outside every
configured project root, remembers it in `~/.kainbain/projects.json` so it is
re-discovered after a restart. To scan several directories of repos at once,
set `PROJECTS_ROOT` (primary) and `PROJECTS_ROOTS` (extra, path-list separated).
See Load Existing Projects (`#/docs/existing-projects`) for the API form and
the custom state-folder option (`.kb`).

## Cold start with nothing installed

On a box with no agent CLIs (`agy`, `muse`, `opencode`) and no API keys, the
app still boots: `GET /status` stays `ok` with the LiteLLM/Ollama probes
`disabled`, and `GET /harnesses` reports each harness as detected or missing
with a hint naming the fix. Project settings shows the same as badges plus a
guidance panel offering a one-click **mock harness** opt-in — synthetic
`Mock reply: …` output for evaluation/CI, never silently substituted for a
real harness. Installing a CLI into `~/.local/bin` (or anywhere on `PATH`)
is picked up on restart with no config edits.

## Installed via install.sh?

The contributor steps above also apply to Docker installs, with these
differences (detail reference: Install & Run, `#/docs/install-run`):

- Approve the Runner in System Settings › Runners — one click; it
  collects its own credential, no paste needed. If no Runner ever
  appears, the install output tells you how to check the Runner process.
- The board shows a setup checklist (Runner connected → first project →
  first task run) until all three hold; it dismisses and never blocks.
  A seeded install also starts with a Welcome Tour project.
- To remove the install, run `./uninstall.sh --dry-run` from the install
  dir first to preview (state-preserving by default), then without
  `--dry-run` — or with `--purge --yes` to delete user state too.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `EADDRINUSE` on `:3100` or `:5173` | Something already occupies the port. Note `npm run dev` clears the occupants automatically; otherwise stop them yourself or set `PORT` / `VITE_PORT`. |
| Changed `frontend/.env`, nothing happened | `VITE_*` values are inlined at dev-server start and at build time. Restart `npm run dev` (or rebuild) after editing. |
| Opened the wrong port and found another service | Wrong port: KainBain's API is `:3100`, frontend dev is `:5173` (on the author's host, `:3000` is Forgejo). |
| Agent stages fail on model access | Check `GET /status` backend probes (LiteLLM / Ollama Cloud) and the `KAINBAIN_DEFAULT_MODEL` default before re-running. |

## Next steps

- Ports & Environment (`#/docs/ports-env`) — overrides and tunables.
- Self-Deployment & Rollback (`#/docs/self-deploy`) — `./publish.sh` + `redeploy.sh`.
- Triage FAQ (`#/docs/faq`) — symptom → fix index (formerly partly in `working-with-kainbain`, removed).
