---
title: Ports & Environment
section: working-with
order: 20
slug: ports-env
---

# Ports & Environment

KainBain is a small distributed system that runs on your machine. Each piece
needs its own TCP port so the pieces can talk to each other, and each piece
reads settings from environment variables. This page lists the ports and the
important variables — and when to leave the defaults alone.

> **Beginners:** you can leave every value at its default and KainBain will
> work. Change a value only if something else already uses that port, or you
> are deploying. After every change: restart that piece (see Changing a
> variable below).

## Port map

| Piece | Default | Override |
| --- | --- | --- |
| API backend (the brain: stores projects, runs stages) | `http://localhost:3100` | `PORT` |
| Frontend dev server (the browser dashboard) | `:5173` | VITE_PORT (dev-server flag; see Install & Run (`#/docs/install-run`)) |
| OpenCode server (only if a project uses the OpenCode harness) | `http://127.0.0.1:4096` | `OPENCODE_URL` (connect to a running server instead of the spawned one) |

The API listens on all interfaces (`HOST`, default `0.0.0.0`); set
`HOST` to `127.0.0.1` to lock it to loopback. The frontend learns the
API origin from `frontend/.env` (`VITE_API_BASE` / `VITE_WS_URL`),
inlined at dev start and at `vite build`. In production both are served
from one origin behind nginx at `https://kainbain.home`.

There is no separate dispatcher port: runner dispatch mode is a loop
inside the runner daemon that polls the backend — see Adding a New
Runner (`#/docs/add-new-runner`). Runner connection settings (backend
URL, join token, credential, id) are plain environment on the runner
host, documented on that page.

## Changing a variable — the right way

1. Edit the environment for the process that reads it (`.env` file, systemd env file, or the installer's prompt).
2. Restart that process. Environment changes do not take effect until a restart.
3. Re-run the quick verify below and confirm the UI reflects the change.

> Restart after every env edit. The app does not hot-reload environment
> variables.

## Environment variables

Every tunable is declared once in the config schema (`api/config/schema.js`)
and documented in the generated root `.env.example` (grouped by concern) —
this article stays the pointer for ports plus the operational knobs below.
The live configuration is introspectable with secrets redacted via
`GET /status/config`.

The retry/timeout knobs (`KAINBAIN_AGENT_TIMEOUT_MS`, `KAINBAIN_CI_TIMEOUT_MS`,
`KAINBAIN_QUEUE_ENTRY_TIMEOUT_MS`, `KAINBAIN_MAX_AUTO_ITERATIONS`, …) are global defaults: each project may
override them in Project Settings › Retry & Timeouts (Project tab), and a per-stage override
(when set) still wins over both. Precedence per stage is **stage → project →
global**; a project budget of `0` disables that loop for the project, and a
blank project field follows the global default. Hitting retry on a failed
stage restarts every budget from zero.

Deploying elsewhere? Point `VITE_API_BASE` / `VITE_WS_URL` at your API origin (or leave them empty for same-origin production builds).

## Network-agnostic defaults

KainBain assumes nothing about your network: there are no implicit `.home`
domains, Tailscale/LAN allowances, CA paths, or git hosts. Three knobs carry
what used to be hardcoded, plus one frontend build var:

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `CORS_ALLOWED_ORIGINS` | _(unset)_ | Comma-separated exact origins allowed past CORS. Loopback (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`) and origin-less clients are always allowed; every other origin must be listed |
| `NODE_EXTRA_CA_CERTS` | _(unset)_ | Custom CA bundle path, honored only when explicitly set (Node native; no implicit fallback) |
| `KAINBAIN_GIT_REMOTE_TEMPLATE` | _(unset)_ | Default git remote for new projects, e.g. `https://git.example.com/${USER}/${SLUG}.git` (`${SLUG}`/`${NAME}`/`${USER}`). D11: creating a project with neither `gitUrl` nor a template is rejected (400 naming the missing remote) — existing local-only projects stay available via adoption (`POST /projects/register`) |
| `KAINBAIN_GIT_AUTHOR_NAME` / `KAINBAIN_GIT_AUTHOR_EMAIL` | `KainBain Agent` / `kainbain@local` | Repo-local (`--local`) git identity provisioned before engine commits when the machine has no `user.name`/`user.email`; global config is never touched |

Token-bearing remote URLs are credential-redacted in API responses,
`project.json`, and prompts; git keeps authenticating against the live remote
in `.git/config`.

## Global storage locations

System Settings (`#/system-settings` → **Storage**) shows these live values from the running backend
(`GET /status/config`). The tab is read-only: every knob below is
environment-driven and applied at boot, so changing one means setting its
variable and restarting the app.

| Storage row | Variable | Default |
| ----------- | -------- | ------- |
| Projects folder | `PROJECTS_ROOT` | `/home/server/projects` |
| Centralised docs location | `NOTES_SPACE_ROOT` | `/home/server/apps/notes/silverbullet/space/Projects/Personal` |
| agy binary | `KAINBAIN_AGY_BIN` | `agy` (name on `PATH` or absolute path) |
| codex binary | `KAINBAIN_CODEX_BIN` | `codex` (name on `PATH` or absolute path; theoretical shim — refuses with a setup hint when missing) |
| codex auto-approve | `KAINBAIN_CODEX_YOLO` | `true` (no approval UI exists yet; `0` restores per-action approvals) |
| muse binary | `KAINBAIN_MUSE_BIN` | `muse` |
| vibe binary | `KAINBAIN_VIBE_BIN` | `vibe` (`~/.local/bin` is also searched) |
| vibe CLI implementation | `KAINBAIN_VIBE_CLI` | `python` (pins the classic CLI the harness targets; `rust`/`auto` also accepted) |
| opencode binary | `KAINBAIN_OPENCODE_BIN` | `opencode` (`~/.opencode/bin` is also searched) |
| Installation directory | — (display-only, parent of the dist dir) | the repo checkout |
| Built frontend served by the API | `KAINBAIN_DIST` | `<repo>/frontend/dist` |

New projects link their `<project>/docs` folder to a directory under the
centralised docs location (e.g. this repo's `./docs` is a symlink to
`<notes-space>/KainBain`). The in-app Docs tab directory (`KAINBAIN_SITE_DOCS`,
default `<repo>/site-docs`) is intentionally not a Storage setting.

The tab always keeps every row above visible: if the running backend's config
spec does not report a location (schema drift / older backend), it renders as
`(not set)` with its variable name instead of disappearing.

## First-run onboarding knobs

Set by `deploy/install.sh` (contributor `npm run dev` setups leave both off):

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `KAINBAIN_SEED_DEMO` | `false` | Seed one local-only "Welcome Tour" demo project (one agent stage plus a human review) on boot when the store holds zero projects, so a fresh install opens on a live board. The seed runs once (marker file) and never overwrites real projects |
| `KAINBAIN_EXPECTED_RUNNER_ID` | _(unset)_ | Runner id the installer created (`--runner-id`). When set, `GET /runners/bootstrap` and `GET /onboarding` report whether that Runner has checked in yet, so the first-run UI waits for it by name instead of showing a bare empty fleet |

## Harness controls

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `KAINBAIN_DEFAULT_HARNESS` | `pi` | Default harness for agent stages (`pi`, `antigravity`, `muse`, `vibe`, or `opencode`). |
| `KAINBAIN_DEFAULT_MODEL` | `deepseek-v4-flash:0731-cloud` | Default model for new projects / stages when none is set. |
| `KAINBAIN_MUSE_MSP` | `auto` | Muse ACP/MSP negotiation mode (`auto` enables ACP/MSP only when the installed Muse supports it; never `true`). |
| `KAINBAIN_MUSE_YOLO` | `true` | Run Muse in auto-approve ("YOLO") mode. |
| `KAINBAIN_VIBE_ACP` | `auto` | Vibe ACP mode (`auto` enables ACP only when the target CLI supports it). |
| `KAINBAIN_VIBE_AUTO_APPROVE` | `true` | Auto-approve Vibe ACP permission requests. |
| `KAINBAIN_AGY_ACP` | `auto` | Antigravity session transport (`on` = two-way ACP session, `off` = legacy per-turn exec, `auto` = ACP only when `KAINBAIN_AGY_ACP_BIN` is set). |
| `KAINBAIN_AGY_ACP_BIN` | _(unset)_ | Standalone Antigravity ACP agent binary (blank = `agy acp` subcommand when mode is `on`). |
| `KAINBAIN_AGY_SANDBOX` | `false` | Pass `--sandbox` to `agy` runs (default OFF: unrestricted runs). |
| `KAINBAIN_AGY_SKIP_PERMISSIONS` | `true` | Pass `--dangerously-skip-permissions` to `agy` runs (default ON: auto-approved tools). |

Per-harness setup (install the CLI, point a runner at it) lives in the link
guides: Link Runner to Pi (`#/docs/link-runner-pi`), Link Runner to Muse
(`#/docs/link-runner-muse`), Link Runner to OpenCode
(`#/docs/link-runner-opencode`). Model auth keys (OpenAI, Anthropic, …)
are not KainBain variables at all — they live only on the machine where
the harness runs, and the backend never handles them.

## Homelab migration

The previous implicit homelab behavior is fully restorable through config
alone (no code compat shims — the implicit behavior was the bug):

```sh
CORS_ALLOWED_ORIGINS=https://kainbain.local,http://192.0.2.20:3100
KAINBAIN_GIT_REMOTE_TEMPLATE=https://github.com/Ewrdad/${SLUG}.git
NODE_EXTRA_CA_CERTS=/home/server/certs/ca/ca.crt
```

The production systemd unit already sets `NODE_EXTRA_CA_CERTS` explicitly and is unaffected.

The full variable list lives in the config schema (`api/config/schema.js`) and
the generated root `.env.example` — this article stays the pointer for ports
plus the network-agnostic knobs above.

## Quick verify

```bash
curl -s http://localhost:3100/status | head -c 300
curl -s http://localhost:3100/status/config | head -c 300
```

If anything is bound to a non-default port or address, use that value in
the URLs. Then open System Settings in the UI and confirm the value you
changed is visible where applicable.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| A port refuses connection | A process expected a different port than it was given. Use lsof or ss to see which process owns it, then align `PORT` / VITE_PORT |
| Changed a variable, nothing happened | You must restart the process that reads it — see Changing a variable above |
| Empty runners table though a runner is running | The runner's backend URL does not match the backend you are looking at, or its join credential is wrong — see Adding a New Runner (`#/docs/add-new-runner`) |
| Model list empty | The harness binary is missing or misconfigured. Wait for discovery, or check that harness's link guide (`#/docs/link-runner-pi`, `#/docs/link-runner-muse`, `#/docs/link-runner-opencode`) |

Start at Getting Started (`#/docs/getting-started`); your next step is
probably Install & Run (`#/docs/install-run`), Adding a New Runner
(`#/docs/add-new-runner`), or Load Existing Projects
(`#/docs/existing-projects`).
