# Decisions — compress the mobile quick-view top bar

Step 1 research note (2026-11-02). No live screenshots: the capture tool
(`scripts/capture-screenshot.mjs`) needs a running app URL and this stage
must not disturb live operations, and `assets/18850.png` / the idea doc are
absent from this checkout and its history. Baseline taken from code instead.

## Baseline (from `MobileMonitorView.jsx`)

Three vertical bands in the compact header plus the runner section:

1. Row 1: `← Back` + 📡 + `EngineStatePill` (`ACTIVE: <stage>` / `CHECKPOINT`
   / `PAUSED` / `IDLE`) + right-aligned bare task title.
2. Row 2: model-details chips (`flex-wrap`, up to 5 chips: alias, harness,
   model, provider/source line, scripted/idle fallbacks) — the tallest band,
   wraps to several lines at 360px.
3. Below the header: per-runner compact rows (kept — the user likes them).

Tallest band: row 2 (model chips). Pill row duplicates the stage that the
right-side title path already avoids duplicating.

## Adopted assumptions (survey unanswered, `"answers": {}`)

- q1 recommended: active chip names task + stage (`<task> · <stage>`).
- q2 recommended: drop the legacy global pill whenever runner rows/fleet
  presence is shown; keep it as the fallback with zero runners configured.
- q3 default: shortest header first; details may truncate behind `title`
  tooltips (existing 360px no-scroll contract wins over showing everything).
- q4 default: simplify model/harness details first; title/back area last
  (`← Back` keeps its 44px touch target).
- q5: no work — compact rows already render live assignments only, with the
  `Fleet idle` empty state otherwise.

## Validation note (2026-11-02, implement stage)

- `before-360.png` / `after-360.png` / `after-360-idle.png` /
  `after-1280-compact.png` were NOT captured: the capture tool needs a
  running app URL and this stage must not disturb live operations. Standing
  in: a structural "header is two rows" test, the untouched 360px
  no-horizontal-scroll contract test, and the desktop explicit-compact
  dashboard tests (same component, same compressed header).
- Gates observed green: `npm run test:unit` (api + frontend, 3966 frontend
  tests), `npm run lint` (0 errors), `npm run docs:check` (exit 0).
- No new colour tokens: header text stays `text-slate-300` on `#0f172a`
  (the pinned contrast pair); `EngineStatePill` and
  `resolveMobileModelDetails` semantics untouched.

## Follow-up (2026-11-02, implement stage continued)

- The `tests/check-jsdoc-example.test.mjs` grandfather gate failed on 5
  exports with no attached `@example`: the new `mobileHeaderMode.js`
  `export default` (this task) plus 4 pre-existing detached blocks in
  `api/aliasTargets.js`, `api/flow/dispatch/runnerMatches.js`, and
  `api/routes/projects.js` (other tasks' code, doc blocks separated from
  their exports). Fixed by attaching docs only — new `@example` JSDoc on
  the default export, pure doc-block moves in the api files, one added
  `@example` line on `saveValidationProbes`. No runtime code changed
  (one function relocated verbatim); full api suite re-ran green after.
- Re-verified gates: frontend 3966 passed, api 6155 passed (+1 skipped),
  `npm run lint` 0 errors, `npm run docs:check` exit 0, jsdoc grandfather
  test 14/14. The prior CI run's `runner/project.test.js` failure and
  canary E2E failures did not reproduce here (project test 20/20 in
  isolation; canary needs a live app URL + browsers and was not re-run —
  this stage must not disturb live operations).

## Traceability

- Steps 4–5 rework stays contained in the Step 2 resolver
  (`resolveMobileHeaderMode`) if the user answers q1/q2 differently.
- `EngineStatePill.jsx` and `resolveMobileModelDetails` stay semantically
  untouched (shared with desktop); all change is conditional rendering in
  `MobileMonitorView`.

## Cleanup (2026-11-02, cleanup stage)

- Simplified `resolveMobileHeaderMode` to `{ showEnginePill, activeChip }`:
  the dropped `showRunnerRows` was consumed by no production code, was
  always the exact negation of `showEnginePill`, and misnamed the
  registry-only case (where the widget renders the `Fleet idle` empty
  state, not rows). Fleet presence stays as the honest local
  `fleetPresent`. Plan §Step 2 proposed the wider shape; this keeps the
  smaller honest contract.
- Unified `resolveMobileModelLine` nullish handling: omitted/undefined
  details now return null like explicit null (the view renders the same
  `Idle — no active model` fallback text either way), so the JSDoc
  "nullish renders the idle fallback" holds for every nullish input.
- Added two view-level tests: registry-only fleet (pill hidden, named
  chip, `Fleet idle` state) and the single-announcer pin (pill-on mode:
  the pill carries `role="status"`, the task-only title carries none).
- Regression sweep vs `main`: `formatMobileMonitorTitle` moved verbatim
  (import update only in its test); model-line fallbacks (`Unknown` /
  `unknown`, alias unresolved wording, full-ref tooltip) match the old
  chips; `EngineStatePill`, `resolveMobileModelDetails`, desktop cockpit,
  and `NowPlayingBar` untouched; new props are optional with defaults.
- Operations continuity: no API/backend change; the compact view still
  runs exactly one fleet poller at the same 5s cadence (the rows reuse
  the header's read via overrides instead of polling themselves); every
  fleet/payload failure direction keeps the legacy pill visible
  (fail-safe, never a hidden status); frontend-only change, no data
  migration, safe to ship and to roll back.
- Gates re-verified: frontend 3985 passed (293 files), api 6153 passed +
  3 skipped (372 files), `lint:frontend` 0 errors (touched files
  warning-free), `check-jsdoc-example` PASS, jsdoc grandfather test
  14/14. Pre-existing, out of scope: `check-one-function-per-file`
  fails on `api/flow/dispatch/runnerMatches.js`,
  `frontend/src/hooks/useFleetModelCatalog.js`, and
  `frontend/src/services/fleetModelOptions.js` — verified identical on
  `main` (this branch's doc-only moves added no functions); left for its
  owner task.

## Cleanup hardening (2026-11-03, cleanup stage continued)

- `useRunnerMonitor` now guards missing fleet endpoint methods with
  explicit `typeof` checks instead of relying on a swallowed TypeError:
  old backends and partial api mocks read as empty fleet (legacy pill
  stays visible), never throw. Failure contract added to the JSDoc.
- Compact runner rows hardened for the 360px no-sideways-scroll
  contract: `min-w-0` down the flex chain (without it `truncate` cannot
  bite), `truncate` + full-text `title` tooltips on runner id, stage,
  and harness pills, `shrink-0` on the freshness dot. Text content and
  test ids unchanged — normal ids render pixel-identical.
- `MobileMonitorView.test.jsx` now mocks the fleet api surface with an
  empty-fleet default: no test touches the real network (removes the
  happy-dom teardown `AbortError` noise) and the suite is deterministic.
- Five new maintained tests: view-level malformed-override fail-safe
  (pill visible + `Fleet idle`, no poll), one-fleet-read-per-tick pin
  (initial + 5s ticks, 3 calls per 10s — a doubled poller would read
  6), widget rejection fail-safe, widget sync-throw fail-safe, and
  compact-row truncation pins.
- Standards notes (deliberate, grandfathered): `formatMobileMonitorTitle`
  keeps its positional signature (it was exported from the view on
  `main`; the re-export exists for older importers, and a labelled
  object would break them — new code `resolveMobileHeaderMode` already
  uses the labelled options object); `runnerFreshness` keeps its
  pre-existing verb-less name (shared, renaming risks regressions);
  new modules stay flat siblings matching `mobileModelDetails.js`
  (a `MobileMonitorView/` subfolder would churn imports for no
  behavior gain). No design-pattern mentions in touched code; new
  files declare one top-level function each (not flagged by
  `check-one-function-per-file`).
- Gates re-verified: frontend 3990 passed (293 files), api 6153 passed
  + 3 skipped (372 files, counts identical to the prior stage), `npm
  run lint` 0 errors (touched files warning-free), `npm run docs:check`
  exit 0, harness `check-component-compat` + `detect-changed-components`
  + `check-jsdoc-example` 26/26. `check-one-function-per-file` still
  fails only on the same 3 pre-existing files (this stage added no
  functions anywhere). Canary E2E not re-run (needs a live app URL +
  browsers; this stage must not disturb live operations).
- Operations continuity: frontend-only, no backend/API change, same 5s
  cadence now pinned by test (exactly one fleet read per tick, rows
  reuse the header's read); deprecated `stats`/`queueCount` props and
  formatter re-exports retained (the dashboard still passes the legacy
  props); every fleet failure direction keeps the legacy pill visible;
  rollback is a plain revert with no migration. Known tradeoff stands:
  on first load the pill shows until the first fleet read lands
  (fail-visible by design, one quick swap).

## Final cleanup (2026-11-03, cleanup stage continued)

- No production change: two prior cleanup passes left the view, the two
  new resolver modules, and the widget hardened and fully pinned, and a
  fresh-eyes re-read found no remaining defect worth churning tested
  code for. Every wrong-type primitive through the new paths was traced
  (`?.` guards plus `?? {}`/`Array.isArray` at each step; property reads
  on strings/numbers cannot throw) and the legacy-fallback direction
  holds on every failure input.
- Two regression pins added (test-only): a view-level assignments-only
  half-override test (one override still skips the poll; header and rows
  agree) and a resolver-level wrong-type `activeTask` test (no crash,
  chip null, pill follows fleet presence). Both cover documented
  contracts (`optional props`, fail-safe on bad input) that had no pin.
- Deliberately unchanged: checkpoint/paused with an idle-but-registered
  fleet keeps the pill hidden per the adopted survey q2 direction
  (per-runner state is the signal; rework stays contained in
  `resolveMobileHeaderMode` if the user answers otherwise); positional
  signatures, re-export shims, and the 3 pre-existing
  `check-one-function-per-file` flags stay as documented above.
- Gates re-verified below before the verdict; canary E2E failures in CI
  are environmental (`net::ERR_INSUFFICIENT_RESOURCES` on page load, 26
  failed / 108 passed) and unrelated to this frontend-only change.

## Cleanup hardening pass 2 (2026-11-03, test-rigidity sweep)

- Test hygiene, no production change: `MobileMonitorView.test.jsx` now
  renders through a `renderView` helper that flushes the header's single
  fleet poll inside `act` (the same `await act(async () => {})` pattern the
  dashboard compact tests use), so assertions run on the settled state.
  The fake-timer "one shared poller" test advances its timers inside
  `act` too, wrapping the runner rows' 1s elapsed-clock interval. Result:
  0 `not wrapped in act` warnings across the file (previously warned on every polled render). The
  `PerRunnerTasksWidget` fake-timer poll-cadence test got the same act
  wrap (was the source of its file's 6 warnings; now 0).
- One new edge-case pin at each level: view-level "fleet shown, task
  unnamed, idle" (pill hidden, chip still reads `No active stage` with
  `role="status"` — never a blank header) and widget-level future-start
  elapsed formatting (`formatRunnerElapsed` with a start after now renders
  `—`, never negative time).
- Re-verified gates after the sweep: frontend 293 files / 3993 tests
  passed, api 372 files / 6155 passed + 1 skipped, `lint:frontend` 0
  errors (touched files warning-free; the 6 remaining observability
  warnings are pre-existing in untouched `ObservabilityDashboard` files),
  `check-jsdoc-example` PASS, `check-one-function-per-file` PASS.
- Regression sweep vs `main` unchanged: `EngineStatePill`,
  `mobileModelDetails`, `ObservabilityDashboard`, and `NowPlayingBar` have
  no diff on this branch; desktop full monitor and the desktop explicit
  compact path render the same component with the same fallbacks.

## Cleanup decontamination (2026-11-03, cleanup stage continued)

- Found cross-task contamination in `646bf9f` (a runner stage-output
  commit): a one-function-per-file split of the dispatch gate and the
  fleet model catalogue — 7 new files (`claimEligibleRunner.js`,
  `effectiveRunnerModels.js`, `fleetCountsById.js`,
  `fleetModelsForHarness.js`, `fleetServesHarness.js`,
  `withFleetModels.js`, `effectiveModelSelection.js`), gutted originals
  (`runnerMatches.js`, `useFleetModelCatalog.js`, `fleetModelOptions.js`
  reduced to re-exports), plus a `check-doc-links` allowlist line and a
  weaker `saveValidationProbes` doc in `api/routes/projects.js`. None of
  it is imported by the mobile header path; `main` does not have the
  split; the re-export shim even says "Barrel", which the KB standards
  forbid. Keeping it would have landed another task's dispatch-hot-path
  refactor under this mobile-UI review.
- Reverted by restoring the exact `main` versions of the 5 touched files
  and deleting the 7 split files (working-tree edit, no history rewrite).
  Only the split files themselves ever imported the new paths, so no
  caller needed touching; `main`'s originals export every name the tests
  and components import.
- Branch-vs-base is now task-only: the 5 view/resolver/widget sources +
  their tests, the `8b7fd3b` doc-only api moves (now byte-identical to
  `main`, so merge-clean), task docs, and one committed jsonl noise file.
- Gates re-verified after the revert: frontend 293 files / 3993 passed,
  api 372 files / 6153 passed + 3 skipped, `npm run lint` 0 errors,
  `npm run docs:check` exit 0 (the dropped `bundled-changelog`
  allowlist is unneeded — no doc references it), harness
  `check-jsdoc-example` + `check-component-compat` +
  `detect-changed-components` 26/26, frontend build exit 0, 0 `act`
  warnings in the two task view/widget suites.
- `check:one-function` (manual gate, not in CI) now fails on exactly the
  same 3 pre-existing files as `main` again (`runnerMatches.js`,
  `useFleetModelCatalog.js`, `fleetModelOptions.js`) — the split had
  fixed it as a side effect, but that fix belongs to its owner task.
- No production change to the task code itself: a fresh-eyes re-read of
  the view, both resolvers, the title formatter, and the widget found the
  fail-safe contracts honest and the edge cases pinned (wrong-type
  `activeTask`/registry/assignments, null engine snapshot, malformed
  overrides, poller sharing, single screen-reader announcer, 360px
  truncation chain). The number-registry path was traced end to end and
  renders coherently (pill hidden + `Fleet idle` rows + named chip).
- Operations continuity unchanged: frontend-only, no backend/API change,
  same 5s single-poller cadence pinned by test, legacy pill fallback on
  every failure direction, deprecated props and formatter re-exports
  retained, plain-revert rollback with no migration. Canary E2E not re-run
  (needs a live app URL + browsers; CI's 13 failures are `waitForAppReady`
  timeouts in unrelated specs, failing before any mobile-monitor code
  could run).

## Cleanup verification (2026-11-03, cleanup stage continued)

- Fresh-eyes re-audit, no production change: every wrong-type primitive
  through the view, both resolvers, the title formatter, and the widget
  was traced (`?.` guards plus `?? {}`/`Array.isArray` at each step) and
  the failure direction stays legacy-pill-visible on every input. Two
  genuine coverage gaps pinned (test-only): widget-level
  missing-endpoint-methods (mixed-version rollout — an old backend
  exposes no fleet endpoints, so the hook reads empty fleet and never
  calls what is not there) and view-level wrong-type props (engine
  snapshot, task, and lists arriving as text render the IDLE pill + `No
  active stage` + `Harness: Unknown` + `Fleet idle`, never a crash).
- Merge safety vs `main`: the 3 branch api files are byte-identical to
  the `main` tip (the same doc moves landed there — merge-clean), and
  `main` has since touched only files this branch never touches
  (`NowPlayingBar`, backend/ops) — no conflicts expected. Model-line
  wording re-verified line by line against `main`'s chips; the title
  formatter logic is verbatim; desktop full cards render identically for
  well-shaped data.
- Gates: frontend 293 files / 3995 passed, api suite green (exit 0),
  `npm run lint` 0 errors (touched files warning-free), `npm run
  docs:check` exit 0, frontend build exit 0, jsdoc grandfather 14/14, 0
  `act` warnings in the task suites. `check:one-function` (manual, not
  CI) still fails only on the same 3 pre-existing files as `main`; new
  modules declare one function each. Canary E2E not re-run (needs a live
  app + browsers; CI's failures are `waitForAppReady` timeouts in
  unrelated specs).
- Operations: frontend-only, no migration, plain-revert rollback;
  mixed-version safe in both directions; the single shared 5s poller is
  pinned by test (strictly fewer fleet requests than `main`'s separate
  widget poll).

## Cleanup final audit (2026-11-03, cleanup stage continued)

- Fresh-eyes audit, no production change: the view, both resolvers, the
  title formatter, and the widget were re-read end to end and every
  wrong-type primitive re-traced (`?.` plus `?? {}`/`Array.isArray` at
  each step; property reads on strings/numbers cannot throw). The
  legacy-pill-visible failure direction holds on every input, the
  single-announcer a11y contract and the 360px truncation chain are
  pinned, and a formatter-importer search shows only the view itself,
  its re-export shim, and co-located tests — no external caller can
  break from the module split.
- One decontamination: deleted the committed runner session transcript
  (`2026-11-03T03-03-00-663Z_*.jsonl`) at the repo root — 241 lines of
  accidental commit noise, referenced by nothing. Branch-vs-base is now
  task-only: the 5 view/resolver/widget sources + their tests, doc-only
  api moves, and task docs.
- `check:one-function` (manual, not CI) fails on exactly the same 3
  files as `main` (`runnerMatches.js`, `useFleetModelCatalog.js`,
  `fleetModelOptions.js`): verified the gate script and its allowlist
  are byte-identical to `main`, the 3 files are unlisted there too, and
  branch-vs-main top-level function counts match (3/8/3) — the api
  diffs move doc blocks only. New modules declare one function each.
  Splitting those files belongs to their owner task, not this
  mobile-UI cleanup.
- Gates re-verified below before the verdict (focused 105/105 first,
  then the full unit gate once after the deletion).
