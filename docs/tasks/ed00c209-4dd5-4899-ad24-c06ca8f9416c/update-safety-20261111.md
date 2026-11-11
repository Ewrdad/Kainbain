# Update-safety assessment — bottom Now Playing bar live updates (task ed00c209)

Date: 2026-11-11. Stage question: will the current change break existing installs on update?

Verdict: NO — safe to ship. Frontend-only change, additive and backward compatible.

## What the change touches

Branch diff vs `origin/main` (20 files): only `frontend/src/**`, `CHANGELOG.md`,
`site-docs/pipeline-stages.md`, and this task's docs. Zero changes under `api/`,
`shared/`, migrations, config files, `package.json` files, `frontend/vite.config.*`,
or `frontend/index.html`. No new dependencies, no build-config change, no DB or
file-format migration, no new env vars.

## Why existing installs keep working

1. No new backend contract. The change consumes only pre-existing endpoints
   (`GET /runners`, `GET /runners/monitor`, `GET /status` via the existing
   `api.getRunners` / `api.getRunnerMonitor` / `api.engineStatus` clients) and
   pre-existing WebSocket frames (`TASK_UPDATED`, `TASK_DELETED`, `ENGINE_STATE`).
   The optional `RUNNER_ASSIGNMENT`-style frames from plan Step 7 were NOT
   implemented, so old backends have nothing new to emit.
2. Old-backend / outage guards preserved. `readFleetSide` (`useFleetDirectory.js`)
   and `refreshEngineSnapshot` (`useWebSocket.js`) check `typeof api.* === 'function'`,
   catch rejections, and degrade to the last-good picture (honest empty before first
   success) — the same fail-safe posture the replaced pollers had.
3. No persistent state. No `localStorage` / `sessionStorage` / IndexedDB reads or
   writes, no cached-schema version, nothing that can go stale across an upgrade.
4. API-compatible refactors. `useRunnerMonitor({ pollMs, enabled })` keeps its
   signature with the same effective 5000ms default (now named `FLEET_POLL_MS`);
   its `{ assignments, registry, scheduler }` return shape is unchanged. The bar's
   `assignmentsOverride` / `runnersOverride` injection semantics are preserved, as
   are `PerRunnerTasksWidget`'s `assignmentsOverride` / `registryOverride` props
   and the `MobileMonitorView` single-poller pattern. The `useWebSocket` JSDoc
   additions (`onTaskUpdated`, `onTaskDeleted`, `onReviewUpdated`, `onReconnect`)
   document callbacks that already existed — no signature change for the sole
   consumer (`KainBainContext.jsx`).
5. Narrow behaviour change. The `resolveUniversalNowPlaying` guard (finite,
   non-negative, floored depth) only alters rendering for malformed snapshots
   (NaN/negative/fractional/non-numeric fall back to the loaded-list count);
   healthy backends send non-negative integers, for which output is identical.
   Its only non-comment consumer is `NowPlayingBar.jsx`.
6. Load is net-neutral or lower. Two independent 5s fleet pollers (bar + widget)
   become one shared module-level poller; the new 15s engine-snapshot safety poll
   rides the existing 5s-TTL `/status` cache shared with the build-hash trigger;
   task-frame refreshes are trailing-debounced (500ms) so bursts cost one read;
   background tabs now pause fleet/queue/engine reads (previously the 5s fleet
   polls ran ungated) and catch up on return. Survey q3 approved a small extra
   foreground load; q4 chose pause-and-catch-up, which is what shipped.
7. Import style matches convention. The `.js`-suffixed relative imports in the new
   modules (`pollingCadences.js`, `tabVisibility.js`) match existing usage
   (`wsUtils.js`, `wsMessageDispatch.js`, `auth/index.js`), so the Vite build
   resolves them the same way.

## Verification run

- Focused suites for every touched surface — `NowPlayingBar`, `activeTaskVisibility`,
  `useScheduledQueue`, `useFleetDirectory`, `pollingCadences`, `tabVisibility`,
  `useWebSocket`, per-runner widget: 8 files, 163 tests, all pass.
- Consumer/contract suites — `KainBainContext`, `api.surface`, mobile monitor:
  5 files, 69 tests, all pass.

## Residual notes (non-blocking)

- The `review-plan-20261111-112822.md` report named in the stage prompt was not
  present in the task docs folder; this assessment used `SURVEY.md`,
  `IMPLEMENTATION_PLAN.md`, `idea-20261111-080435.md`, and the branch diff.
- First upgrade load is a fresh frontend bundle against an unchanged backend;
  users on a stale cached bundle simply keep the old refresh-to-update behaviour
  until the new bundle loads — no half-state is possible since no backend field
  was added or removed.
