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
