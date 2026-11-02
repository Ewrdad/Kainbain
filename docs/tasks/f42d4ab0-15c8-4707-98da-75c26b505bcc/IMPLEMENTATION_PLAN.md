# Implementation Plan — Clickable queue chip with queue-order popup

## Goal

Make the queue number in the UI clickable so it opens a popup showing the
execution queue in its current order, giving the operator a visual way to
debug why the number "doesn't seem to ever go down".

## Success Criteria

- Clicking (or keyboard-activating) the queue chip in the bottom bar opens a
  popup listing the queue in its current dispatch order (#1, #2, …).
- Each row shows, at minimum: position, task name, project, current stage,
  and blocked/waiting reason when applicable.
- The popup's contents reconcile with the chip number well enough to debug
  with (any deliberate count-vs-list difference is labelled in the UI, not
  silent).
- `npm run test:unit` passes; new unit tests cover the popup open/close,
  ordering, empty/error states, and the chip's click behaviour.
- No long-lived dev servers are used for verification (headless runners /
  `npm run capture:screenshot` only).

## Current behaviour (researched, not assumed)

- The chip lives in the bottom bar right rail
  (`frontend/src/components/layout/NowPlayingBar.jsx`, ~L638-666). It is
  currently a non-interactive `div role="status"` with an `InfoTooltip`,
  hidden on phones (`hidden sm:flex`).
- The number comes from `resolveUniversalNowPlaying`
  (`frontend/src/components/layout/activeTaskVisibility.js`): it prefers
  `engineState.openQueueDepth` (global, all projects) and falls back to the
  loaded-list open count. `openQueueDepth` is computed by
  `countOpenTasksGlobal` (`api/work/countOpenTasksGlobal.js`): every task
  whose status is neither `completed` nor `done`, across ALL projects —
  including `failed`, `waiting_human`, `paused`, and blocked tasks.
- This already explains the reported symptom: the dashboard shows the
  active-project slice (2 tasks) while the chip counts every open task in
  every project, including terminal-ish states like `failed` that never
  "go down" on their own.
- An ordered queue list already exists: `QueueOrderWidget`
  (`frontend/src/components/observability/widgets/QueueOrderWidget.jsx`)
  renders `scheduledQueue` with rank, project, priority reason, stage, and
  task key. The monitor feeds it from `api.observabilityStatus(...).observability.queue`
  with a client-side fallback (`ObservabilityDashboard.jsx` ~L173, L252-266,
  L491-510).
- The canonical ordered source is `GET /tasks/queue`
  (`api/work/taskWorkRoutes.js` ~L179-202) → `taskStore.getScheduledQueue`
  → `getScheduledQueue` (`api/flow/scheduler/getScheduledQueue.js`), which
  sorts by priority rank and stamps `queueOrder`. BUT the route resolves a
  project via `resolveAndGuardProject` (`api/projectResolution.js`): with no
  `projectId` it returns the ACTIVE project's queue, never the global
  queue — even though `getScheduledQueue(store, undefined)` supports
  global. Also note `getScheduledQueue` EXCLUDES `failed`, `cancelled`,
  `waiting_human`, and human-stage tasks, while the chip number INCLUDES
  them — so chip count and queue length legitimately differ today.
- The exact interaction precedent is `BuildHashTrigger` +
  `ChangelogModal` (`frontend/src/components/layout/`): a right-rail
  element opening a dialog built on the shared accessible `Modal`
  (`frontend/src/components/Modal.jsx`, Escape/backdrop close, focus trap).
  `WidgetManagerModal` is a second `Modal` consumer.

## Survey synthesis (`SURVEY.md`)

All five survey questions are still unanswered (`"answers": {}`), and the
prior `idea-20261102-*.md` file is not on disk. The plan therefore carries
each question as a decision with a reversible default (marked [D]),
so implementation is unblocked and the operator can still override:

- q1 (what the number counts): [D] keep the global open-task meaning for
  now; make the popup reconcile it (see Step 4). Changing the count
  definition is deferred to Step 5, conditional on q4.
- q2 (row contents): [D] show all five: task name, position, project,
  current step, waiting/blocked reason. All are already present on
  `getScheduledQueue` items (`title`, `queueOrder`, `projectName`,
  `currentStageName`, `priorityReason`/`blockers`).
- q3 (view-only vs actions): [D] view-only list + click-a-row-opens-inspector
  (reuses the existing `setSelectedTask` pattern from the bar). No
  reorder/cancel — the scheduler owns order and there is no reorder API.
- q4 (fix the number too, or popup only): [D] popup first (this plan's
  core), number-semantics fix as a separately-gated follow-up step once
  the popup provides evidence. This is the "make change easy, then make
  the change" split.
- q5 (which number opens the popup): [D] the bottom-bar chip only — it is
  the only queue number in the main UI. (KPI widgets show queue depth too,
  but only inside the monitor view.)

## Approach — make change easy, then make the change

1. **Research spike first.** The one architectural unknown is the popup's
   data source: nothing today serves the GLOBAL ordered queue to the
   frontend (chip = global count, queue endpoints = project-scoped).
   Resolve this before building UI.
2. **Make change easy.** Extract the queue-list rendering and the
   queue-fetch logic into shared units so the popup reuses — not forks —
   the monitor's list. Keep every refactor behaviour-preserving with the
   existing tests green.
3. **Make the change.** Convert the chip to a button opening a `Modal`
   popup; wire the shared list into it.
4. **Then** decide the count-semantics fix with popup evidence in hand.

## Steps

### Phase 0 — Research spike: pick the popup's data source (do first)

1. Confirm what `api.observabilityStatus(undefined)` returns for
   `.observability.queue` when no project filter is set (global or
   active-project?). Read the API route + one backend test.
2. Confirm `GET /tasks/queue` without `projectId` returns the active
   project's queue (per `resolveAndGuardProject`) and check the 404 test
   in `api/routes/tasks.test.js` (~L865) for contract constraints.
3. Decide ONE source (recommendation order):
   - (a) If the observability queue already serves global order, reuse
     `api.observabilityStatus(undefined)` + `subscribeObservability` refresh
     (same pattern as `ObservabilityDashboard.jsx` ~L243-308).
   - (b) Else, extend `GET /tasks/queue` with an explicit global mode
     (e.g. `?projectId=all`, mirroring the monitor's `selectedProjectId`
     convention) that calls `getScheduledQueue(store, undefined)`.
     Backend-only addition; no existing contract changes.
   - (c) Fallback: popup shows the active-project queue and labels the
     chip-vs-list scope difference. Only if (a) and (b) are both rejected.
4. Record the decision + the chip-vs-list inclusion difference
   (`failed`/`waiting_human` counted but not queued) as the popup's
   reconciliation copy.

### Phase 1 — Make change easy (shared seams, no behaviour change)

5. Extract a presentational `QueueOrderList` component from
   `QueueOrderWidget` (props: `items`, `engineState`, `onSelectTask?`,
   `compact?`). `QueueOrderWidget` becomes a thin wrapper. Keep all
   existing `QueueOrderWidget.test.jsx` assertions passing unchanged.
6. Extract a `useScheduledQueue({ projectScope, enabled })` hook holding
   the fetch + `subscribeObservability`-triggered refresh + poll
   currently inline in `ObservabilityDashboard.jsx`, with `enabled` so it
   only fetches while the popup is open (mirror `ChangelogModal`'s
   fetch-on-open). Wire the dashboard to the hook with no visual change.
7. Add/extend the API client only if Phase 0 picks (b): e.g.
   `api.getTaskQueue('all')` via `flowRequests` in
   `frontend/src/services/flow/index.js`, plus backend route handling and
   a route test.

### Phase 2 — Make the change (the popup)

8. Create `QueuePopupModal` in `frontend/src/components/layout/` on the
   shared `Modal`: header with count + scope label (e.g. "Queue — all
   projects, #1 runs next"), body = `QueueOrderList`, footer = one-line
   reconciliation note from Phase 0 step 4 (e.g. "N open tasks counted;
   M shown — failed / waiting-human tasks count but never dispatch").
   States: loading, empty ("Queue is Clear" copy consistent with the
   widget), error + Retry (mirror `ChangelogModal`).
9. Convert the bottom-bar chip (`NowPlayingBar.jsx` ~L638-666) from `div`
   to `button` opening the modal (precedent: `BuildHashTrigger`).
   Preserve `role="status"` semantics for the count (nested live region
   inside the button, or `aria-label` kept on the button), keep the
   `InfoTooltip`, keep WCAG 1.4.3 no-text-animation contract, and keep the
   canary overlap gate (`functional.spec.js` button-vs-rail rect checks)
   green. Decide mobile: [D] also render a compact chip button on phones
   OR document that the popup is sm+ only — the chip is currently hidden
   on mobile, so phone users otherwise get no entry point.
10. Row click opens the inspector via existing `setSelectedTask`
    (per q3 default); `Escape`/backdrop closes with focus restore (free
    from `Modal`).

### Phase 3 — Testing plan (runs alongside Phases 1–2, gates done)

11. Unit/integration (primary gate, `npm run test:unit`):
    - `useScheduledQueue`: fetch-on-enable only, refresh on
      observability event, error state, empty state.
    - `QueueOrderList`/`QueueOrderWidget`: order badges (#1..#n match
      `queueOrder`), active-item single-active invariant, blocked/waiting
      reasons rendered (extend `QueueOrderWidget.test.jsx`).
    - `NowPlayingBar` popup wiring (extend `NowPlayingBar.test.jsx`):
      chip is a button with the queue `aria-label`, click opens modal,
      Escape/backdrop closes, count text unchanged, existing
      right-rail/overlap assertions still pass.
    - If Phase 0 picks (b): backend route test for global mode
      (order + cross-project inclusion), mirroring
      `api/work/taskWorkRoutes.test.js` "GET /tasks/queue".
12. Headless UI check (no dev servers): extend or add a
    `npm run capture:screenshot` invocation opening the bar + popup at
    desktop width (and 640px if mobile entry is added) to eyeball layout;
    keep screenshots under the task docs folder.
13. Regression: full `npm run test:frontend` + `npm run test:api`
    (== `test:unit`), plus `npm run lint:frontend` for the touched files.

### Phase 4 — Count-semantics follow-up (gated on q4 answer + popup evidence)

14. Only after the popup ships: with visual evidence, decide whether to
    redefine the chip (e.g. exclude `failed`, or show `queued+active`
    instead of all-open). Implement as a separate change with its own
    tests (`activeTaskVisibility.test.js`,
    `api/engineStateSnapshot.test.js`) — never bundled into the popup
    diff, so the popup remains a clean before/after debugging lens.

### Phase 5 — Documentation plan

15. Update the `NowPlayingBar` / `queueDepth` JSDoc (`MARK: queueDepth`)
    to document click-to-open and the count-vs-list reconciliation rule.
16. Add JSDoc `MARK` blocks on `QueuePopupModal` and `useScheduledQueue`
    following the repo's one-function-per-file + `@example` conventions
    (`npm run check:one-function`, `check:jsdoc-example` must pass).
17. Short operator note (tooltip/`behindTheScenes` copy + one paragraph in
    the relevant docs page, e.g. the monitor/orchestrator guide): what the
    number counts, what the popup lists, and why they can differ.
18. Run `npm run docs:check` if docs pages are touched.

## Validation Plan (evidence per phase)

| Phase | Check | Expected evidence |
|---|---|---|
| 0 | Read route + observability code, run targeted backend tests | Decision (a)/(b)/(c) recorded; no code changed |
| 1 | `npm run test --prefix frontend -- QueueOrderWidget` + dashboard suites | Green, no snapshot/visual change |
| 2 | `npm run test --prefix frontend -- NowPlayingBar` | New open/close/order assertions green |
| 2 | `npm run capture:screenshot` (bar + open popup) | PNG in task docs folder, layout sane |
| 3 | `npm run test:unit`, `npm run lint` | All green |
| 5 | `npm run docs:check` (if docs touched) | Green |

Highest-risk validation: the canary overlap gate (`functional.spec.js`
button-vs-rail rect checks at 640–1280px) — converting the chip to a
button must not change its box; run the canary suite if available in this
environment.

## Risks / Open Questions

- **Survey unanswered.** All q1–q5 defaults above are marked [D] and
  reversible; if the operator answers the survey before implementation,
  the answers override the defaults (biggest swing: q4 "popup only" vs
  "fix the number too", and q3 if full reorder/cancel is wanted — that
  would need a new backend API and is currently out of scope).
- **Global ordered queue has no endpoint.** Phase 0 exists to resolve
  this; option (b) is a small additive backend change, not a redesign.
- **Chip-vs-list mismatch is real by design** (`failed`/`waiting_human`
  counted, not queued). The popup must label it, or the "debugging lens"
  will look like a second bug. The count redefinition itself stays in
  Phase 4.
- **Mobile entry point.** The chip is hidden on phones today; decide in
  Step 9 whether the popup gets a phone entry point or is sm+ only.
- Non-goals: queue reorder/cancel actions, scheduler/priority-rule
  changes, changing `openQueueDepth` semantics inside the popup diff,
  restyling the monitor's queue widget beyond the shared extraction.
