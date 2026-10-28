# ADR: Runner boxes in the Now Playing bar

Date: 2026-10-27. Implements `IMPLEMENTATION_PLAN.md` in this folder.

## Decision

With 1-4 live runner entries, the left side of `frontend/src/components/layout/NowPlayingBar.jsx`
renders compact per-runner boxes (runner name, task first line, `Stage:` line, health dot plus
status word as text) beside the compact engine status chip. With 0 or 5+ entries the bar renders
the legacy single-task view byte-identical to before. Centre transport and the right rail are
untouched.

## Files

- `frontend/src/components/layout/runnerBoxUi.js` — pure helpers: task-state colour map
  (`getRunnerBoxStyle`), `resolveRunnerStatusWord`, `formatRunnerStatusDisplay`,
  `buildRunnerBoxAriaLabel`, `truncateRunnerText`, `shouldShowRunnerBoxes` gate plus
  `RUNNER_BOX_MAX_COUNT = 4`.
- `frontend/src/components/layout/selectRunnerEntries.js` — derives entries from context data
  only (no backend, no fetching).
- `frontend/src/components/layout/RunnerBox.jsx` — one box; button (opens inspector) when it
  has a task, greyed-out `idle` panel when not.
- `frontend/src/components/layout/RunnerBoxesRow.jsx` — `role="list"` row, null outside 1-4.
- `frontend/src/components/layout/NowPlayingBarLeft.jsx` — extracted legacy left view plus the
  `EngineStatusChip` kept beside the boxes (survey q8).
- `NowPlayingBar.jsx` — accepts optional `runnerEntries` (null derives from context);
  `uiPreferences.showRunnerBoxes === false` is the kill switch (absent means enabled, so no
  stored-profile migration).

## Deliberate deviation from the plan's provisional q7 fallback

The plan provisionally derived entries from any open task (grouped by `workflowId`, else one
per task). That was narrowed: context-derived entries come ONLY from tasks carrying explicit
runner association (`runnerId`/`runner` fields); plain queue data yields `[]` and the legacy
view. Reasons: on this single-task engine an open task is queued work, not a runner, so the
fallback would paint queued tasks as live runners; and it flips pinned single-task-view tests
(e.g. the universal/pipeline-switch regression) into box mode. The `runnerEntries` prop covers
tests, story states, and a future registry (which swaps `selectRunnerEntries` in one file).

## Colour meaning (survey q3)

Task state per box: green running, amber paused/interrupted, red failed, blue
checkpoint/waiting_human, grey queued/idle. System-health colouring needs a heartbeat backend
that does not exist; recorded follow-up, not built here. Colour is never the sole signal: the
status word always renders as text and the dot is `aria-hidden`.

## Cleanup stage (2026-10-28)

- `runnerBoxUi.js` gains `coerceBoxText` (fail-closed box text: trims strings,
  coerces numeric/boolean/bigint primitives, falls back for blank/objects —
  objects can never leak `[object Object]` into a box). `RunnerBox.jsx` uses
  it for both id and label, removing the duplicated mutable (`let`) coercion
  branches in favour of immutable bindings.
- `NowPlayingBar.jsx` wraps the context-derived `selectRunnerEntries` call in
  try/catch: a poisoned task payload (throwing getter, bad-merge Proxy) falls
  back to the legacy single-task view instead of blanking the bar, so the
  transport controls keep working on an operational screen. Explicit
  `runnerEntries` props bypass the derivation untouched.
- Cleanup hardening (2026-10-28): the try/catch moved into a unit-testable
  `resolveRunnerBoxEntries` helper in `selectRunnerEntries.js` (explicit prop
  wins, else derive, poison degrades to `[]`), so the bar owns a single
  immutable binding; `taskRecency` renamed to `readTaskRecency` (verb-first
  per KB standards); `RunnerBox` normalises the status word once so dot
  colour, visible word, and aria label can never disagree on untrimmed or
  non-string input; `RunnerBoxesRow` keys use the same fail-closed id
  coercion as the box test ids (a Symbol id can no longer throw in the key).
  Full `npm run test --prefix frontend`: 284 files / 3856 tests green;
  eslint clean on all touched files; `check-one-function-per-file` and
  `check-jsdoc-example` gates pass; `npm run build --prefix frontend` green.
  Ops continuity is unchanged: kill switch
  (`uiPreferences.showRunnerBoxes === false`), no stored-profile migration,
  no backend, revert is deleting the `showRunnerBoxes` branch.
- New tests: `coerceBoxText` unit cases; a poisoned-payload bar test proving
  the legacy fallback. Full `npm run test --prefix frontend`: 284 files /
  3851 tests green; eslint clean; `check-one-function-per-file` and
  `check-jsdoc-example` gates pass; `npm run build --prefix frontend` green.
  No api files touched (`test:api` vite failure remains pre-existing and out
  of scope).
- Cleanup hardening 2 (2026-10-28): `buildRunnerBoxAriaLabel` only appends
  task/stage when they are non-blank strings (an object from a bad merge
  can no longer leak "[object Object]" into the accessible name);
  `RunnerBox` builds the label from explicit fields instead of `{...entry}`
  so one poisoned getter cannot blank the bar, and the `Stage:` line only
  renders for non-blank strings (else the `—` fallback). New tests: object
  task/stage label case; non-string task/stage box case. Full
  `npm run test --prefix frontend`: 284 files / 3858 tests green; eslint
  clean on all touched files; both gates pass; `npm run build --prefix
  frontend` green. Ops continuity unchanged: kill switch
  (`uiPreferences.showRunnerBoxes === false`), no stored-profile migration,
  no backend, revert is deleting the `showRunnerBoxes` branch.

- Cleanup hardening 3 (2026-10-28): `selectRenderableRunnerEntries` now
  probes every field the box render reads inside try/catch and drops entries
  whose reads throw. This closes a real fail-safe hole: a throwing getter
  smuggled via the explicit `runnerEntries` prop (which bypasses derivation
  untouched) crashed React mid-render in `RunnerBoxesRow`, blanking the whole
  footer including transport controls — proven by a failing test before the
  fix. Healthy entries still pass through by reference (the "explicit wins
  untouched" contract and its identity test are unchanged); the gate and the
  row share the filter so they can never disagree. `getRunnerBoxStyle` trims
  and lower-cases before the map and `RunnerBox` lower-cases the normalised
  word, so 'RUNNING' colours the same green dot as 'running' — dot, word,
  and aria label can never disagree on case. New tests: 2 unit (case colours,
  throwing-entry filter), 1 box (uppercase word), 2 bar (poisoned explicit
  entry beside a healthy box; poisoned-only falls back to legacy). Full
  `npm run test --prefix frontend`: 284 files / 3863 tests green; eslint
  clean on all touched files; both gates pass; `npm run build --prefix
  frontend` green. Ops continuity unchanged: kill switch, no migration, no
  backend, revert is deleting the `showRunnerBoxes` branch.

## Verification (this session)

- `npm run test:frontend`: 278 files / 3789 tests pass, including 6 new/extended runner-box
  suites (status map, selector, box, row, bar integration).
- `npm run lint:frontend`: 0 errors; eslint clean on all touched files.
- `node scripts/check-one-function-per-file.mjs`: PASS.
- `node scripts/check-jsdoc-example.mjs`: PASS.
- `npm run build --prefix frontend`: builds in ~3s.
- `npm run test:api`: FAILS at vitest startup (`Cannot find package 'vite'` — the api lockfile
  has no `vite` entry). Proven pre-existing by re-running on the stashed untouched tree; no api
  file was touched by this change. Needs a lockfile fix outside this task's scope.
- Canary e2e not run (spins its own server stack; avoided per the live-ops caution).
- Headless Chromium visual pass (isolated vite on 127.0.0.1:5231, temporary
  harness since removed): n=0 legacy idle view; n=1-4 boxes showing runner
  name, task first line, `Stage:` line, health dot + status word, engine badge
  retained, no legacy title; n=6 legacy fallback with task name/stage/key chip;
  transport + right rail intact in every mode. elementFromPoint hit-testing
  proves no box paints under transport buttons (row clips + scrolls: 684px
  content in a 384px row at 1280, 110px at 700px). 60fps during row scroll and
  across 700/1024/1280 resizes. Screenshots read back and inspected.

## Cleanup stage (2026-10-28, final pass)

- Reviewed every runner-box file against `./docs/KB Code Standards.md`:
  verb-first functions, labelled data-import args, MARK + `@example` JSDoc
  on every export, tests co-located, no class or pattern language, one
  top-level `function` per file. No structural changes were needed.
- One real edge fixed in `RunnerBox.jsx`: the `Stage:` line tooltip was
  gated on the raw `entry.stageName` truthiness, so a junk truthy value (a
  number, an object) left a stray "—" tooltip. A single `hasStageName` flag
  now gates both the line and its tooltip; pinned by a new assertion in
  `RunnerBox.test.jsx`.
- Full verification: `npm run test --prefix frontend` 284 files / 3863
  tests green; eslint clean; `check-one-function-per-file` and
  `check-jsdoc-example` PASS; `npm run build --prefix frontend` green.
  Working tree had no api changes, so the pre-existing `test:api` vite
  failure stays out of scope (proven pre-existing on the stashed tree).
  (One false alarm during the pass: an early rect-overlap check flagged
  clipped-away boxes whose unclipped rects extend under buttons —
  getBoundingClientRect ignores clipping; hit-testing confirmed nothing paints
  there. The check was corrected, full pass green.)
