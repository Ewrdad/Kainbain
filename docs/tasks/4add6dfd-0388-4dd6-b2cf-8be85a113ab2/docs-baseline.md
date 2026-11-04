# Docs baseline — 2026-11-04 (task 4add6dfd)

Recorded before Wave A–E rewrites. Branch state at record time: prior
`site-docs/add-new-runner.md` draft present (order 20, dangling links).

## Gates

- `npm run docs:check` → **RED**, exactly 2 failures, both in
  `siteDocs.integrity.test.js`, both caused by `add-new-runner.md`:
  1. duplicate `order: 20` in `working-with` (collides with `ports-env`);
  2. dangling `#/docs/harness-pi` + `#/docs/harness-muse` cross-links.
  All other 35 docs tests passed (apiCoverage, agentGuide, envCoverage,
  plus the remaining integrity assertions).
- `node scripts/check-duplicate-settings.mjs` → **GREEN**
  (31 files).
- `npm run test:unit` → deferred to final gate (API suite alone takes
  ~3 minutes; will run green-check at the end).

## Pre-existing issues found during source-truth review

These are fixed by the waves, not new regressions:

1. `add-new-runner.md` (prior draft): wrong order, dangling links,
   stale UI path `Settings › Harness › Runners` (the Harness tab was
   replaced by System Settings › Runners — see
   `frontend/src/components/settings/settingsTabs.js` + the legacy
   `['harness', 'runners']` alias in `SystemSettingsPage.jsx`), plus
   unverified env claims.
2. Root scratch file `.tmp-write-ports-env.md` (prior draft): contains
   claims contradicted by code — a "Dispatcher on :3101" (no such
   server exists; dispatch is a daemon loop over `POST /runners/dispatch`),
   `KAINBAIN_PORT` (real var is `PORT`), `KAINBAIN_RUNNER_BACKEND_URL`
   (real var is `KAINBAIN_RUNNER_BACKEND`), `KAINBAIN_PI_*` vars (none
   exist — pi is an in-process SDK), and "frontend uses relative URLs"
   (real vars are `VITE_API_BASE`/`VITE_WS_URL`). Superseded by the
   Wave A `ports-env` rewrite; scratch file removed.
3. `first-project.md`: `Files & Links` tab name is stale (real tab is
   `Files & Repos`); adopt + state-folder sections move to
   `existing-projects.md` per plan.
4. `first-time-setup.md`: install block duplicates `install-run.md`;
   adopt section condenses to a link to `existing-projects.md`.

## Reference host facts (this box)

- Node v24.22.2, npm 11.19.1. Engines field wants
  `^20.19.0 || >=22.12.0` — satisfied.
- Harness CLIs on PATH: `muse` 1.4.14 only. `pi`, `agy`/`antigravity`,
  `vibe`, `opencode`, `codex` all absent.
- Ports: API `:3100` (`PORT`), frontend dev `:5173` (vite default),
  OpenCode default `http://127.0.0.1:4096` (spawned per project or
  `OPENCODE_URL`).
