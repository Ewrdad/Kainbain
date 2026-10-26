# Canary E2E Suite

Playwright end-to-end tests that drive the real app (Vite frontend + API
backend) and guard UI/integration behavior unit tests cannot see. Serial
runner (`workers: 1`): every spec shares one mutable backend, so specs reset
state explicitly and never run in parallel.

## Stack model

Default (no env vars): Playwright **auto-provisions an isolated scratch
stack** — API on `:3399` with a scratch `PROJECTS_ROOT`, Vite on `:5299`
wired to that API, scheduler disabled. A bare `npm run test:canary` never
touches the live `:3100`/`:5173` pair (see the 2026-09-11 incident note in
`playwright.config.js`).

Operator stack: set **BOTH** `CANARY_BASE_URL` and `CANARY_API_URL` to drive
an already-running stack you own. Setting exactly one is a configuration
error (fail-fast in `playwright.config.js`).

## Commands

```bash
npm run test:canary            # full suite on the scratch stack (from repo root)
npm run test:visual            # visual-regression specs only (tests/visual)
npx playwright test <name>     # one spec file, e.g. `task-inspector` (from canary-e2e/)
npx playwright test --headed <name>  # watch it in a real browser while debugging
```

## Gate wiring

- `npm test` runs canary **by default**: the Canary Tests branch is part of
  the full gate, so `npm test` and `deploy.sh --prod` gate on the exact same
  suites (regressions surface in the earliest automated stage, not at the
  merge/deploy gate). Skip it for fast sanity cycles with
  `./run-tests.sh --no-canary` or `KAINBAIN_SKIP_CANARY=1`.
- **Pre-merge (required):** keep `npm test` (or `npm run test:canary`) green.
- **Pre-deploy (blocking):** `deploy.sh --prod` (non-fast) runs the fast
  branches as its `final-test-suite` gate (`./run-tests.sh --no-canary`) and
  then this suite once as its `canary-e2e` gate — identical coverage, no
  suite run twice. Emergency opt-out only: `KAINBAIN_SKIP_CANARY=1`.
- The scratch ports (`:3399`, `:5299`) are freed via
  `scripts/canary-preflight.mjs` before the suite boots (this package's
  `test` script runs it first, so every invocation path is covered), so an
  orphaned scratch process cannot abort the run with a false port-collision
  failure (the #KB-0417 deploy incident). The preflight only terminates
  processes that verify as scratch-stack occupants; anything else parked on
  those ports is left alone and reported loudly.

## Helper API (`tests/helpers.js`)

Single home for shared fixtures — new specs MUST import from here instead
of redefining helpers:

| Helper | Purpose |
|---|---|
| `waitForAppReady(page)` | Load the app; wait for the project selector (projects loaded). |
| `selectProject(page, name)` | Pin the UI's active project via the selector menu. |
| `waitForAppReadyOnProject(page, name?)` | Ready + pin to `"Project A"` (default). Use when API assertions target one project. |
| `activeProjectId(request, name?)` | Backend id for a project name (takes `request`, never `page`). |
| `projectStages(request, projectId)` | Active workflow's stage list. |
| `resetProject(request, projectId)` | `POST /test/reset` for deterministic state (scratch only). |
| `stopEngine(request, projectId)` | `POST /compute/stop`: free the global engine before `/execute` (auto-dispatched agent runs 409 it). |
| `listTasks` / `findTaskByGoal` | Read tasks via the API. |
| `createTaskViaApi(request, projectId, goal, extra?)` | Create a task (goal = title); `extra` carries `stageId`/`workflowId`/`execute`. |
| `waitForTaskVisible(page, goal)` | Wait for the board card. |
| `openTaskInspector(page, goal)` / `closeTaskInspector(page)` | Slide-over inspector open/close. |
| `waitForFontsSettled(page)` | Wait for the icon font before geometry measurements. |
| `boxesOverlap(a, b)` | Bounding-box intersection check. |
| `taskButtonKey(taskId)` | Mirrors the card's `#KB-XXXX` button label. |
| `collectPageErrors(page)` | Uncaught-page-error collector for a final `toEqual([])`. |
| `API_BASE`, `MOBILE_VIEWPORT`, `SHORT_MOBILE_VIEWPORT`, `DESKTOP_VIEWPORT` | Shared constants. |

Plus `tests/urls.js` (`APP_URL`, `API_URL`) — the only place env URLs resolve.

## Adding a regression spec (checklist)

1. Add a row to the traceability table below (regression → task id → spec).
2. One focused spec file per area; the header comment names the regression
   and the guarding task id (`MARK: … (task <id>)` precedent) so
   ``rg "task <id>"`` finds the guard.
3. Import readiness/seeding from `./helpers` — no per-file copies.
4. Prefer role/text queries; add `data-testid` to the component only where
   geometry or ambiguous text makes role queries flaky.
5. Seed via the API (`createTaskViaApi`); self-provision fixture projects
   under `/tmp` when the test needs custom stages — never mutate live data.
6. Prove fail-before/pass-after where the old path is reproducible (or
   document why it cannot be), and run the new file 3× for flakes.

## Regression → spec traceability

| Regression | Task | Guarding spec |
|---|---|---|
| Task-view error wall of text; capped render + Show more/less | `1c7a7c5d` | `task-errors.spec.js` |
| System Settings tab bar covered on mobile | `5ad55777` | `system-settings-mobile.spec.js` |
| System Settings is a full screen (`#/system-settings`), popout-first entry | `cd669cc3` | `system-settings-mobile.spec.js` |
| Goto-app / app-status link visibility | `da0608f9` | `app-status.spec.js` |
| Dynamic Context Tokens hidden in preview, shown in edit | `20670b9c` | `task-inspector.spec.js` |
| Click-to-copy task ID | `fa5f7234` | `task-inspector.spec.js` |
| Default preview view for existing tasks (just-created: edit) | `6df5eecd` | `task-inspector.spec.js` (+ `TaskGoalSection.test.jsx` unit pin) |
| Attached-image markdown appended at end, title intact | `37ecfdac` | `task-editing.spec.js` |
| Agent-log feed readability + error states | `45c2750d` | `task-logs.spec.js` |
| MR-style review loop (diff, comments, fail/pass, merge) | — (core flow) | `pr-review.spec.js` (runs on scratch; was `CANARY_API_URL`-gated) |
| Footer/now-playing overlap | — | `footer-overlay.spec.js`, `mobile-responsive.spec.js` |
| Workflow canvas operations | — | `workflow.spec.js` |
| Settings render + save round-trip | — | `functional.spec.js`, `settings.spec.js` |
| Retrospective page + chat | — | `retrospective.spec.js`, `retrospective-chat.spec.js` |
| Websocket handshake/reconnect | — | `websocket.spec.js` |
| Task lifecycle transitions | — | `task-lifecycle.spec.js` |
| Runtime-error surface | — | `runtime-errors.spec.js` |
| Accessibility (WCAG AAA scans) | — | `accessibility.spec.js` |
| Homepage smoke | — | `homepage.spec.js` |

## Coverage map (Phase 0 gap matrix, condensed)

Which user-visible surfaces each spec touches (`bf5695e4` inventory):

| Surface / route | Spec(s) |
|---|---|
| Orchestrator board (`#/`) | `homepage`, `functional`, `task-lifecycle`, `workflow`, `mobile-responsive` |
| Task inspector (details/edit/preview/copy/errors) | `task-inspector`, `task-editing`, `task-errors` |
| Task logs tab | `task-logs` |
| Files & Repo (`#/explorer`) + goto-app link | `app-status` |
| Project settings (`#/settings`) | `functional` (render), `settings` (save round-trip) |
| System settings (mobile tab bar) | `system-settings-mobile` |
| Review page (`#/tasks/:id/review`) | `pr-review` |
| Retrospective (`#/retrospective`) + chat | `retrospective`, `retrospective-chat` |
| WebSocket handshake | `websocket` |
| Footer / now-playing overlap | `footer-overlay`, `mobile-responsive` |
| Runtime-error surface | `runtime-errors` |
| Accessibility scans | `accessibility` |
| Visual baselines | `visual/homepage`, `visual/dashboard` |

Known gaps (no E2E touch; candidates for the next expansion): docs tab
article rendering via `GET /docs/:slug`, workflow canvas add/move/toggle
stage mutations, human-checkpoint approve/reject advancing the pipeline.

## Suite health notes

- Zero silent skips: every skip must be explicit and documented. (Prior
  silent skip `pr-review.spec.js`'s `ISOLATED` gate was removed — it now
  self-provisions its fixture repo + project on the scratch backend.)
- Playwright version split (root `^1.62.1` vs `canary-e2e` `^1.40.0`) is
  known and left as-is: no failure has been traced to it, and a bump would
  churn visual snapshots for no proven gain.
