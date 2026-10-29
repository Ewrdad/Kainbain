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

## Common commands

(Formerly in `working-with-kainbain`, removed — kept here as the detail reference.)

```bash
npm run build              # build api + frontend
npm run test:unit          # run unit tests (api + frontend)
npm run capture:screenshot # headless screenshot of the UI (useful for PRs)
```
