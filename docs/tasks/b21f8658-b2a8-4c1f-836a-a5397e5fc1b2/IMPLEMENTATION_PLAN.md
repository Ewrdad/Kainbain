# Implementation Plan — Compress the mobile quick-view top bar

## Goal

Compress the top bar of the mobile quick view (the compact monitor's slim
status header) so it stays short on phones: name the task on the
in-progress/active chip, remove the single-threaded-era global status wording
when per-runner rows are shown, and keep the runner rows the user likes. The
view must stay within 360px with no horizontal scroll.

## Success Criteria

- On a phone-narrow viewport, the compact monitor header is shorter (fewer
  rows / less vertical height) than today while every runner with a live
  assignment still shows its row.
- The active chip names the task plus the stage it is on (survey q1
  recommended option), instead of the stage alone.
- The legacy single global status wording (`ACTIVE: …` / `CHECKPOINT` /
  `PAUSED` / `IDLE` pill) is gone whenever runner rows are shown, and stays
  only as the fallback signal when no runners are shown (survey q2
  recommended option).
- Desktop full monitor, desktop compact-request path, screen-reader status
  announcements, and the 360px no-horizontal-scroll contract all keep
  working; `npm run test:unit` and lint pass.

## Background and evidence

- Target surface (verified by reading the code): the "mobile quick view" is
  `MobileMonitorView` (`frontend/src/components/observability/MobileMonitorView.jsx`),
  the compact logs-only monitor rendered when `showCompact` is true
  (`frontend/src/components/observability/ObservabilityDashboard.jsx:186`,
  compact branch at `:683-706`). It shows automatically on phone-narrow
  viewports (`useIsNarrowViewport`, `frontend/src/components/util/viewport.js`)
  and on desktop only via explicit compact request
  (`monitorCompact.js`).
- Today's header (the "top bar") has three bands:
  1. Row 1: `← Back` + 📡 + `EngineStatePill` (`mobile-engine-state`) +
     right-aligned task title (`mobile-active-stage`, via
     `formatMobileMonitorTitle`).
  2. Row 2: model-details chips (`mobile-monitor-model-details`: alias,
     harness, model, provider/source via `resolveMobileModelDetails`).
  3. Below the header: per-runner compact rows (`PerRunnerTasksWidget`
     with `compact`, one expandable row per live assignment).
- "In progress/active chip is unnamed": `EngineStatePill`
  (`frontend/src/components/observability/EngineStatePill.jsx:61-71`)
  renders `ACTIVE: <stage>` — the stage name only, never the task name.
- "Legacy leftover from single-threaded UI": the one global engine pill
  (`ACTIVE/CHECKPOINT/PAUSED/STOPPED/IDLE`) describes the whole engine while
  the per-runner rows already name each runner's live state. The codebase
  already solved this exact problem once: `NowPlayingBar` fleet mode hides
  its engine-status pill when runner boxes render, with the comment "a
  single global CHECKPOINT/RUNNING/IDLE chip misleads"
  (`frontend/src/components/layout/NowPlayingBar.jsx:412-417`). This plan
  follows that precedent. `NowPlayingBar` itself is a non-goal (bottom bar,
  already fixed).
- Survey state: `SURVEY.md` in this task directory (restored byte-exact
  from commit `ee6ce43`, where it existed but was not an ancestor of this
  branch) has `"answers": {}` — no answers recorded. Its recommended
  options are the survey author's defaults, not user-confirmed choices.
  This plan adopts the q1/q2 recommended options as working assumptions
  (flagged in Risks) and answers q4/q5 from code evidence below.
- Key structural finding ("make change easy" target): `PerRunnerTasksWidget`
  owns its fleet polling internally (`useRunnerMonitor`, `GET
  /runners/monitor` + `GET /runners`), so the header cannot know whether
  runner rows are shown. The header must learn fleet presence before it can
  conditionally drop the pill. `NowPlayingBar`'s `useNowPlayingRunnerDirectory`
  override pattern (context/props overrides that skip polling, used by
  tests) is the in-repo pattern to copy.
- Idle runners (survey q4/q5): `PerRunnerTasksWidget` compact renders rows
  only for live assignments; with zero assignments it renders the "Fleet
  idle" empty state. Idle runners are therefore already collapsed to a
  count-equivalent message in this view — q5 needs no new behavior, and
  q4's "idle runners" option is already satisfied.
- Constraints found in code/tests: 360px no-horizontal-scroll contract with
  `min-w-0`/`overflow-hidden` flex chain (`MobileMonitorView.test.jsx`
  "console wrappers" test); header colour contrast gate
  (`frontend/src/theme/observabilityContrast.test.js`, `#0f172a` header);
  "stage name appears exactly once in the header row" test (will need
  updating deliberately); `EngineStatePill` is shared with the desktop
  dashboard header — do not change its desktop rendering.
- Missing inputs: the screenshot `assets/18850.png` and
  `idea-20261102-092730.md` named in the task do not exist in this checkout
  or in history; the plan proceeds from code evidence instead.

## Approach

"Make change easy, then make the change", with the big/risky pieces first:

1. Research spike first (Step 1): capture the current 360px header, confirm
   the compression target, and lock the survey defaults as assumptions.
2. Make change easy (Steps 2-3): lift fleet-monitor state so the header can
   see runner presence, behind a pure, unit-tested resolver — no visual
   change yet.
3. Make the change (Steps 4-6): conditional pill removal, task-named active
   chip, model-row compression — each step independently verifiable.
4. Assure it (Steps 7-8 + Validation Plan): unit/integration tests,
   headless 360px screenshots, contrast/a11y gates, docs.

## Steps

### Step 1 — Research spike: baseline the header and lock assumptions (first, biggest unknown)

- Capture the current compact header at 360px with the headless tool, e.g.
  `npm run capture:screenshot -- --path "#/observability" --width 360
  --height 800 --out docs/tasks/b21f8658-b2a8-4c1f-836a-a5397e5fc1b2/before-360.png`
  (tool: `scripts/capture-screenshot.mjs`; no background servers — point it
  at the normal dev/prod URL per its `--url`/`KAINBAIN_URL` contract).
- Measure: header pixel height, row count, and which band (Back row, pill,
  model chips) costs the most vertical space.
- Decide and record in this directory (append to this plan or a
  `decisions.md`): adopt survey q1 recommended (task name + stage) and q2
  recommended (remove legacy wording when runners shown); q3 default to
  "shortest header, details may hide behind truncation/expand"; q4 default
  to simplifying model/harness details first, title/back area last.
- Validation: `before-360.png` exists and is referenced by the decision
  note; assumptions below are either confirmed or rewritten.

### Step 2 — Make change easy: lift fleet presence to the header (no visual change)

- Export the existing `useRunnerMonitor` from
  `PerRunnerTasksWidget.jsx` for reuse (it is already exported) and call it
  in `MobileMonitorView` (single poller), passing `assignments`/`registry`
  down as optional props to `PerRunnerTasksWidget` that default to the
  hook's own polling when undefined — mirroring `NowPlayingBar`'s override
  pattern so existing callers and tests keep working with zero edits.
- Add a pure resolver, e.g. `resolveMobileHeaderMode({ assignments,
  engineState, isRunning, … })` in a new tested module next to the view
  (e.g. `mobileHeaderMode.js`), returning at least `{ showRunnerRows,
  showEnginePill, activeChip: { taskName, stageName } | null }`.
- Follow the repo's `MARK:` JSDoc convention with a runnable `@example` on
  every new export — `npm run docs:check` (`check-jsdoc-example`) gates on
  this.
- Validation: `npm run test:frontend` passes with no visual diff (rerun the
  Step 1 screenshot; pixels outside polling timestamps identical);
  `PerRunnerTasksWidget.test.jsx` and `MobileMonitorView.test.jsx` green
  unmodified.

### Step 3 — Make change easy: unit-test the header-mode contract before touching JSX

- Write `mobileHeaderMode.test.js` covering: runners present + running
  (pill off, chip names task + stage); runners present + all between
  assignments (pill off, fleet-idle rows state); no runners configured
  (pill on — legacy single-task display preserved); checkpoint/paused with
  runners shown (pill off; per-runner state is the signal); idle with no
  runners (pill on, `IDLE`, existing fallbacks intact).
- Validation: new test file green; the matrix is reviewed against survey q2
  ("only when runners are shown" is the removal condition).

### Step 4 — Make the change: drop the legacy pill when runner rows show

- In `MobileMonitorView` header row 1, render `EngineStatePill` only when
  the resolver says `showEnginePill` (no fleet presence), keeping the same
  `mobile-engine-state` test id and `role="status"` semantics for the
  fallback path. Do not modify `EngineStatePill.jsx` itself (desktop
  shares it).
- Update `MobileMonitorView.test.jsx`: existing pill assertions gain a
  "no-runners" setup (pass empty assignments override); add "pill hidden
  when runner rows render" test. Update `ObservabilityDashboard.compact.test.jsx`
  if it asserts the pill unconditionally.
- Validation: targeted vitest files green; 360px screenshot shows no pill
  band when a runner is live, pill intact with zero runners.

### Step 5 — Make the change: name the task on the active chip

- Replace the row-1 right-side bare title plus pill-stage split with one
  active chip reading "<task> · <stage>" (task first, truncated with
  full-text `title` tooltip, reusing `formatTaskTitleFirstLine` and
  `resolveDisplayedStage` so the stranded-stage fix from task `072e2cfa`
  keeps holding). Keep the `mobile-active-stage` test id on the element.
- Deliberately update the "stage name appears exactly once" test to the new
  contract (stage appears once, inside the named chip) and extend
  `mobileMonitorTitle.test.js` for the new formatter.
- Validation: `MobileMonitorView.test.jsx` + `mobileMonitorTitle.test.js`
  green; screenshot shows one named chip; a11y: chip keeps a text
  alternative naming task and stage.

### Step 6 — Make the change: compress the model-details row

- Collapse row 2 (alias/harness/model/provider chips) into a single
  truncated line (e.g. `alias · harness · model`, provider/source folded
  into the `title` tooltip), or move it into the runner rows' expandable
  tails where the same serving data already renders
  (`per-runner-compact-harness/model` test ids exist). Keep
  `resolveMobileModelDetails` as the single resolver (it must keep
  mirroring `ActiveTaskPromptWidget` per its contract) — compress
  presentation, not the resolver's semantics.
- Keep the 360px contract: `flex-wrap`/`truncate`/`max-w` preserved;
  rerun the "console wrappers keep min-w-0" test plus a new assertion that
  the header has at most two rows at 360px.
- Validation: `mobileModelDetails.test.js` green unmodified (semantics
  unchanged); view tests green; after-screenshot header strictly shorter
  than `before-360.png`.

### Step 7 — Harden: contrast, a11y, and the desktop compact path

- Any new chip colours must pass
  `frontend/src/theme/observabilityContrast.test.js` (add cases if new
  tokens are introduced; prefer existing slate/emerald tokens).
- Preserve `role="status"`/`aria-live` announcements for state changes in
  both pill-on and pill-off modes; keep `← Back` (44px touch target) and
  keyboard/focus behavior unchanged.
- Verify the desktop explicit-compact path (`requestCompactMonitorView`)
  renders the same compressed header without layout breakage at desktop
  widths (screenshot at 1280px).
- Validation: theme contrast tests green; no new axe/eslint a11y
  violations (`npm run lint:frontend`); 1280px screenshot sane.

### Step 8 — Assure and document

- Tests (primary gate): full `npm run test:unit` (api + frontend), plus
  `npm run lint` and `npm run docs:check` (JSDoc example gate).
- Visual evidence: `after-360.png` (runners live), `after-360-idle.png`
  (no runners, pill fallback), `after-1280-compact.png`, all in this task
  directory, captured with `npm run capture:screenshot` only.
- Docs: update the `MARK:` JSDoc on `MobileMonitorView`,
  `formatMobileMonitorTitle`, and any new module to describe the
  compressed contract; record before/after heights and the survey-default
  decisions in this directory so review can trace each choice to survey
  q1/q2 or a code constraint.

## Validation Plan

| Check | Command / evidence | Expected |
|---|---|---|
| Targeted unit tests | `npm run test --prefix frontend -- MobileMonitorView mobileMonitorTitle mobileModelDetails mobileHeaderMode PerRunnerTasksWidget observabilityContrast compact` | All green |
| Full unit/integration gate | `npm run test:unit` | All green |
| Lint | `npm run lint` | Clean |
| JSDoc/docs gates | `npm run docs:check` | Clean (new exports have `MARK:` + runnable `@example`) |
| 360px compression | `npm run capture:screenshot -- --path "#/observability" --width 360 ...` before/after | Header shorter; runners visible; no horizontal scroll |
| Fallback intact | Same capture with zero live assignments | Pill + idle fallbacks render as today |
| Desktop compact path | Capture at 1280px with compact requested | Same compressed header, no breakage |
| Manual (cannot automate) | Phone viewport: rotate, long task/model names, checkpoint + runners live | Truncation + tooltips hold; no sideways scroll |

Highest-risk validation: the 360px before/after screenshot comparison with
live runners — it is the only check that proves "compressed" rather than
merely "changed".

## Risks / Open Questions

- Survey unanswered (`"answers": {}`): q1/q2 recommended options are
  adopted as assumptions, not confirmed user choices. If the user answers
  differently (e.g. keep the pill, or runner-name chip), Steps 4-5 rework
  is contained because the Step 2 resolver isolates the decision.
- q3 (compress most), q4 details-to-simplify: defaulted in Step 1 to
  shortest-header-first and model/harness-details-first; reversible in
  Step 6.
- q5 idle runners: no work needed — compact rows already show live
  assignments only ("Fleet idle" empty state otherwise).
- Double polling risk when lifting `useRunnerMonitor`: avoided by the
  single-poller + optional-props-default pattern (Step 2); verify with one
  `GET /runners/monitor` per 5s tick in the network log.
- Shared-component risk: `EngineStatePill` and `resolveMobileModelDetails`
  stay semantically untouched; all change is conditional rendering in
  `MobileMonitorView` (+ tests). Desktop full monitor is unaffected by
  construction.
- Missing screenshot/idea inputs (`assets/18850.png`,
  `idea-20261102-092730.md` absent): Step 1 re-baselines from the live UI
  instead.

## Non-goals

- `NowPlayingBar` (bottom bar) — already hides the global pill in fleet
  mode; no changes.
- Desktop full observability header and widgets.
- Backend/API changes — all data (`/runners/monitor`, `/runners`, engine
  state) already exists.
- New user preferences or settings for header density.
