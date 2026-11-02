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

## Traceability

- Steps 4–5 rework stays contained in the Step 2 resolver
  (`resolveMobileHeaderMode`) if the user answers q1/q2 differently.
- `EngineStatePill.jsx` and `resolveMobileModelDetails` stay semantically
  untouched (shared with desktop); all change is conditional rendering in
  `MobileMonitorView`.
