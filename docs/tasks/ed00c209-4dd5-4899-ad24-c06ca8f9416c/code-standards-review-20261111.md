# Code Standards Review – Bottom "Now Playing" Bar Freshness (task ed00c209)

Branch `kb/ed00c209-4dd5-4899-ad24-c06ca8f9416c` vs `origin/main`.
Standards: `docs/KB Code Standards.md`. Scope: 8 source files + 7 test files
(all frontend), plus CHANGELOG / site-docs / task-docs entries.

## Verdict: COMPLIANT (PASS)

## What changed (source)

- New `frontend/src/hooks/useFleetDirectory.js`: one shared 5s fleet poller
  (monitor + registry) with a content key covering task/stage/paused/
  heartbeat fields, last-good sides on misses, publish-only-on-change.
- New `frontend/src/services/pollingCadences.js`: single home for the
  5s / 15s / 15s / 500ms cadences with rationale beside each value.
- New `frontend/src/services/tabVisibility.js`: background-tab pause +
  catch-up-on-return helper.
- `NowPlayingBar.jsx` / `PerRunnerTasksWidget.jsx`: both fleet surfaces now
  read through the shared poller (two pollers become one); queue chip JSDoc
  documents the live engine snapshot.
- `useWebSocket.js`: debounced engine-snapshot refresh on TASK_UPDATED /
  TASK_DELETED plus a visibility-gated 15s safety poll; previously
  undocumented `onTaskUpdated`/`onTaskDeleted`/`onReviewUpdated`/`onReconnect`
  params now documented (params pre-existed on main — docs-only improvement).
- `activeTaskVisibility.js`: malformed snapshot depths fail safe to the
  loaded-list count (never prints `NaN`); fractional depths floor.
- `useScheduledQueue.js`: constants + shared visibility helper replace
  inline 15s / 500ms / visibility literals.

## Check against each value

### User understandable over technical language — PASS

- Long descriptive names throughout (`liveAssignments`, `registryList`,
  `needsMonitor`, `safePollMs`, `buildFleetSnapshotKey`,
  `subscribeTabVisible`). Short vars (`a`, `r`, `m`, `x`, `y`, `sub`) appear
  only inside tiny map/filter/catch scopes, matching pre-existing style.
- No banned jargon: searched all 8 changed source files for
  `factory|barrel|singleton|observer|decorator|design pattern` — zero hits.
- Common language kept: task, stage, runner, queue, assignment, fleet,
  roster are all pre-existing vocabulary in these files.
- JSDoc in plain English with WHY, not just what: every new function and
  constant explains rationale (why misses key as `'miss'`, why the
  visibility catch-up is deliberately not edge-triggered, why the tick uses
  the fastest request, why each cadence value). Includes `@example` on all
  new exports and test MARKs.
- Labelled input pattern `({a, b}) => {}` used for every multi-field input
  (`buildFleetSnapshotKey`, `subscribeFleet`, `useFleetDirectory`,
  `useRunnerMonitor`). One positional exception: internal recursive
  `orderKeyValue(value, seen)` threads a `seen` accumulator — the textbook
  case where labelling hurts clarity, and positional helpers already exist
  (`resolveOwnerTask`). Observation only.

### Functional over Object orientated — PASS

- No classes added (searched); no currying pseudo-classes (unsubscribe
  closures match the existing `subscribeObservability` convention).
- Pure core: `buildFleetSnapshotKey`, `orderKeyValue`, `isTabVisible`, and
  the `resolveUniversalNowPlaying` hardening are side-effect free; IO and
  timers are isolated in named functions with minimal inputs.
- State lives in one clearly defined, commented place: the module-level
  poller block in `useFleetDirectory.js` (subscribers, content key,
  last-good sides) with documented clear-on-last-unsubscribe semantics.
- Every function name carries a verb: build, read, stop, publish, load,
  restart, subscribe, refresh, schedule, order, is*.
- Single responsibility holds: key building, side reading, miss detection,
  publishing, timing, and subscribing are separate functions.

### Co-location over abstraction — PASS

- All 7 test files sit next to their source file (new: `useFleetDirectory`,
  `tabVisibility`, `pollingCadences` suites; extended: bar, visibility,
  websocket, scheduled-queue suites).
- Internal helpers live in the same file as their caller (tighter than the
  named-folder rule). Shared helpers are justified by repetition, not
  speculation: cadences (4 consumers), tab visibility (3 consumers), fleet
  poller (3 surfaces: bar, widget, mobile header).
- Placement follows existing homes: cross-cutting helpers in `services/`
  beside `api.js`/`observabilityEvents.js`; the hook in `hooks/` beside
  `useScheduledQueue.js`. Nothing is a single-line abstraction: cadences
  carry rationale with 2–4 consumers each; `tabVisibility` adds SSR guards
  and fail-safe semantics.
- Naming is searchable for the reported symptom: fleet, polling cadences,
  tab visibility, queue chip. The shared poller exists for a stated
  business intent (strictly reduce load while fixing freshness), with the
  before/after (ids-only key → content key) documented at the fix site.

### Tested over trusted — PASS (verified by execution)

- Step 0 repro tests pin the exact reported bugs: runner-box stage switch
  with an unchanged roster within one 5s poll (no refresh), and queue-chip
  refresh shortly after task activity without a reconnect.
- Fail-safe typing: array checks, `Number.isFinite` + floor, missing-method
  guards, miss-keeps-last-good; failures stay observable (`logger.error`)
  and degradation is documented ("How it fails" in `useFleetDirectory`).
- Lowest effective level: unit tests for the key builder, visibility, and
  cadence invariants; hook tests for polling/visibility behaviour; no new e2e.
- Observed results this session: `vitest run` on all 7 touched suites —
  **130/130 passed**; `eslint` on all 15 changed frontend files — **clean,
  exit 0**. No dead imports (`api`/`useRef` removals verified clean).

### Fast iteration over long planning — PASS

- Small scoped change with survey checkpoints honoured: near-live bound met
  and beaten (5s fleet, ~1s queue chip), queue + stage + titles prioritised
  (survey q2), background pause + catch-up (survey q4), load strictly
  reduced despite q3 permitting a small increase.

## Non-blocking observations (do not fail)

1. `tabVisibility.js` module JSDoc says "the `useBoardSync` pattern" —
   colloquial "pattern" (established approach), not a named design pattern,
   so compliant; "approach" would read stricter.
2. Internal `refreshEngineSnapshot` / `scheduleEngineRefresh` in
   `useWebSocket.js` lack `@example` tags — consistent with existing
   internal helpers in that file (`addProcessLog` has none either).
3. `orderKeyValue(value, seen)` is positional (see above) — justified
   recursion accumulator.

## Files reviewed

Source: `frontend/src/hooks/useFleetDirectory.js` (new),
`frontend/src/services/pollingCadences.js` (new),
`frontend/src/services/tabVisibility.js` (new),
`frontend/src/components/layout/NowPlayingBar.jsx`,
`frontend/src/components/layout/activeTaskVisibility.js`,
`frontend/src/context/useWebSocket.js`,
`frontend/src/hooks/useScheduledQueue.js`,
`frontend/src/components/observability/widgets/PerRunnerTasksWidget.jsx`.
Tests: the 7 co-located suites listed above. Docs: CHANGELOG entry,
`site-docs/pipeline-stages.md` freshness contract, SURVEY.md,
IMPLEMENTATION_PLAN.md, update-safety note. (The
`review-plan-20261111-112822.md` report named in the stage brief is absent
from the worktree; review proceeded from the diff itself.)
