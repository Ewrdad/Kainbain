---
title: Ports & Environment
section: working-with
order: 20
slug: ports-env
---

# Ports & Environment

This host runs Forgejo on `:3000`, so KainBain uses its own ports: the **API defaults to `http://localhost:3100`** (override with `PORT`) and the **frontend dev server runs on `:5173`**. The frontend learns the API origin from `frontend/.env` (`VITE_API_BASE` / `VITE_WS_URL`), inlined at dev start and at `vite build`. In production both are served from one origin behind nginx at `https://kainbain.home`.

## Environment variables

Every tunable is declared once in the config schema (`api/config/schema.js`)
and documented in the generated root `.env.example` (grouped by concern) —
this article stays the pointer for ports. The live configuration is
introspectable with secrets redacted via `GET /status/config`.

The retry/timeout knobs (`KAINBAIN_AGENT_TIMEOUT_MS`, `KAINBAIN_CI_TIMEOUT_MS`,
`KAINBAIN_QUEUE_ENTRY_TIMEOUT_MS`, `KAINBAIN_MAX_AUTO_ITERATIONS`, …) are global defaults: each project may
override them in Project Settings › Retry & Timeouts, and a per-stage override
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
| `KAINBAIN_GIT_REMOTE_TEMPLATE` | _(unset)_ | Default git remote for new projects, e.g. `https://git.example.com/${USER}/${SLUG}.git` (`${SLUG}`/`${NAME}`/`${USER}`). Blank = no remote: `gitUrl`/`gitRepo` stay null and no `origin` is added |
| `KAINBAIN_GIT_AUTHOR_NAME` / `KAINBAIN_GIT_AUTHOR_EMAIL` | `KainBain Agent` / `kainbain@local` | Repo-local (`--local`) git identity provisioned before engine commits when the machine has no `user.name`/`user.email`; global config is never touched |
| `VITE_NOTES_VIEWER_URL` | _(unset)_ | External notes-viewer base URL for report deep links (supports `${PROJECT}`/`${PATH}`); unset degrades to the in-app `#/explorer` route |

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

## Harness controls

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `KAINBAIN_DEFAULT_HARNESS` | `pi` | Default harness for agent stages (`pi`, `antigravity`, `muse`, `vibe`, or `opencode`). |
| `KAINBAIN_MUSE_MSP` | `auto` | Muse ACP/MSP negotiation mode (`auto` enables ACP/MSP only when the installed Muse supports it; never `true`). |
| `KAINBAIN_MUSE_YOLO` | `true` | Run Muse in auto-approve ("YOLO") mode. |
| `KAINBAIN_VIBE_ACP` | `auto` | Vibe ACP mode (`auto` enables ACP only when the target CLI supports it). |
| `KAINBAIN_VIBE_AUTO_APPROVE` | `true` | Auto-approve Vibe ACP permission requests. |
| `KAINBAIN_AGY_ACP` | `auto` | Antigravity session transport (`on` = two-way ACP session, `off` = legacy per-turn exec, `auto` = ACP only when `KAINBAIN_AGY_ACP_BIN` is set). |
| `KAINBAIN_AGY_ACP_BIN` | _(unset)_ | Standalone Antigravity ACP agent binary (blank = `agy acp` subcommand when mode is `on`). |
| `KAINBAIN_AGY_SANDBOX` | `false` | Pass `--sandbox` to `agy` runs (default OFF: unrestricted runs). |
| `KAINBAIN_AGY_SKIP_PERMISSIONS` | `true` | Pass `--dangerously-skip-permissions` to `agy` runs (default ON: auto-approved tools). |

## Homelab migration

The previous implicit homelab behavior is fully restorable through config
alone (no code compat shims — the implicit behavior was the bug):

```sh
CORS_ALLOWED_ORIGINS=https://kainbain.local,http://192.0.2.20:3100
KAINBAIN_GIT_REMOTE_TEMPLATE=https://github.com/Ewrdad/${SLUG}.git
NODE_EXTRA_CA_CERTS=/home/server/certs/ca/ca.crt
```

plus `VITE_NOTES_VIEWER_URL=http://notes.local` in `frontend/.env` before
`vite build` (Vite inlines `VITE_*` vars at build time). The production
systemd unit already sets `NODE_EXTRA_CA_CERTS` explicitly and is unaffected.

The full variable list lives in the config schema (`api/config/schema.js`) and
the generated root `.env.example` — this article stays the pointer for ports
plus the network-agnostic knobs above.
