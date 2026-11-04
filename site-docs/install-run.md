---
title: Install & Run
section: working-with
order: 10
slug: install-run
---

# Install & Run

New here? Start at First-Time Setup (`#/docs/first-time-setup`) for the
ordered path; this page is the install/run detail reference.

## Prerequisites

Node.js ≥ 20.11 (LTS; see `.nvmrc` — the live host runs v26.x), plus model access
via LiteLLM or Ollama Cloud depending on your harness.

## First-time setup

```bash
npm install            # root (playwright)
npm install --prefix api
npm install --prefix frontend
npm install --prefix canary-e2e
```

## Running it

```bash
npm run setup          # once per clone: all deps + Playwright Chromium
npm run build          # build api + frontend
npm run deploy         # ./deploy.sh (tests + build, idempotent)
npm run dev            # start API + frontend dev servers (any OS)
./publish.sh --detect  # build + push changed components; then ~/apps/kainbain/redeploy.sh deploys
```

For manual control instead of the all-in-one script:

```bash
# API on :3100
(cd api && npm install && PORT=3100 node index.js)
# Frontend dev server on :5173 (reads frontend/.env)
(cd frontend && npm install && npm run dev)
```

Open the frontend dev server (or `https://kainbain.home` in production). If the board is empty, that is normal — create a project next.

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
approve the Runner in Settings › Harness › Runners (one click — it
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

(Formerly in `working-with-kainbain`, removed — kept here as the detail reference.)

```bash
npm run build              # build api + frontend
npm run test:unit          # run unit tests (api + frontend)
npm run capture:screenshot # headless screenshot of the UI (useful for PRs)
```
