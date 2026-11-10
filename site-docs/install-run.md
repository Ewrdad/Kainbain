---
title: Install & Run
section: working-with
order: 10
slug: install-run
---

# Install & Run

This page is the detail reference for every install, run, and deploy
command. New here? Start at First-Time Setup (`#/docs/first-time-setup`)
for the ordered path, then come back here when you need a specific command.

## Prerequisites

- **Node.js** `^20.19.0` or `>=22.12.0` (the `engines` field in `package.json`), plus **npm** `>=10`. A recent LTS works; the live host runs v26.x.
- **Git** — runners clone and push through git.
- **Model access for your harness** (optional at install time): the app boots without any agent CLI or API key. Its `GET /status` probes report `disabled`, never an error — see Cold start in First-Time Setup (`#/docs/first-time-setup`).

## First-time setup (one clone, once)

From the repo root:

```bash
npm run setup          # once per clone: all deps + Playwright Chromium
```

That installs the root, `api/`, `frontend/`, and `canary-e2e/`
dependencies and the Playwright Chromium browser used by screenshots
and end-to-end tests.

## Running it

```bash
npm run dev            # start API + frontend dev servers (any OS)
```

`npm run dev` binds the API to `:3100` (`PORT` overrides) and the
frontend to `:5173` (`VITE_PORT` overrides), clearing whatever already
occupies those ports first. (`./deploy.sh --dev` still works — it
delegates to the same runner.)

For manual control instead of the all-in-one script:

```bash
# API on :3100
(cd api && npm install && PORT=3100 node index.js)
# Frontend dev server on :5173 (reads frontend/.env)
(cd frontend && npm install && npm run dev)
```

The frontend learns the API origin from `frontend/.env`:

```text
VITE_API_BASE=http://localhost:3100
VITE_WS_URL=ws://localhost:3100
```

Vite inlines `VITE_*` vars at dev-server start and at `vite build` —
after editing `.env`, restart the dev server (or rebuild). Leave both
empty for same-origin production builds.

Open the frontend dev server (or your production origin). If the board
is empty, that is normal — create a project next
(`#/docs/first-project`).

## Quick verify

```bash
curl -s http://localhost:3100/status | head -c 300
curl -s http://localhost:3100/docs | head -c 300
```

| Check | Expected |
| --- | --- |
| API `http://localhost:3100/status` | JSON health payload, HTTP 200 |
| API `http://localhost:3100/docs` | Docs index JSON (lists every slug) |
| Frontend `http://localhost:5173` | App loads, board visible |
| API docs `http://localhost:3100/documentation` | Swagger UI loads |

## Docker install (new users)

No checkout needed — this is the path the front page documents:

```bash
curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash
curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash -s -- --dry-run  # preview first
```

Useful flags: `--adopt-from DIR` adopts the git checkouts one level under
`DIR` (cap 20; `DIR` must live under `--projects-dir` so the backend can
see it), `--seed-demo`/`--no-seed` controls the starter project (seeded by
default — one agent stage plus a human review so the board demonstrates
value immediately), `--runners 0`/`--no-runner` skips the local Runner,
`--join-token` reuses an existing Runner token instead of generating one.

After install, open the printed URL (default `http://localhost:3100`):
approve the Runner in System Settings › Runners (one click — it
collects its own credential, no paste needed), then follow the setup
checklist on the board: connect the Runner, create or adopt a project,
run your first task. New projects need a fetchable git remote — paste it
into the creation dialog, or adopt an existing checkout instead (adoption
never needs a remote).

To remove an install (for example a botched one), preview first, then run:

```bash
curl -fsSL https://kainbain.ewrdad.uk/uninstall.sh | bash -s -- --install-dir ~/apps/kainbain --dry-run
(cd ~/apps/kainbain && ./uninstall.sh --help)
```

Removal is state-preserving by default (the stack, Runner units, and
install bookkeeping go; `projects/`, `data/`, `notes/`, and the shared
join token stay). `--images` also drops the pulled images, `--purge
--yes` deletes user state under the install dir too, and `--all-runners`
removes every Runner unit — see `./uninstall.sh --help`.

## Common commands

(Formerly in `working-with-kainbain`, removed — kept here as the detail
reference.)

```bash
npm run build              # build api + frontend
npm test                   # full verification gate
npm run test:unit          # run unit tests (api + frontend)
npm run docs:check         # docs integrity + coverage gates
npm run capture:screenshot # headless screenshot of the UI (useful for PRs)
```

## Deploying

Production deploys publish components, then restart them on demand:

```bash
./publish.sh --detect  # build + push changed components; then ~/apps/kainbain/redeploy.sh deploys
```

The full story — manifest, health gate, auto-rollback, deploy
continuity — lives in Self-Deployment & Rollback
(`#/docs/self-deploy`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EADDRINUSE` on `:3100` or `:5173` | Something already occupies the port. `npm run dev` clears the occupants automatically; otherwise stop them yourself or set `PORT` / `VITE_PORT` |
| Changed `frontend/.env`, nothing happened | `VITE_*` values are inlined at dev-server start and at build time. Restart `npm run dev` (or rebuild) after editing |
| Opened the wrong port and found another service | Wrong port: KainBain's API is `:3100`, frontend dev is `:5173` (on the author's host, `:3000` is Forgejo) |
| `npm run setup` Playwright step needs root | The browser system-dependency step needs apt/root; the script falls back to the browser alone. Install the OS packages manually only if Chromium fails to launch |
