# Implementation Plan — Horizontally scrollable runner strip in the mobile bottom bar

## Goal

Fix the mobile bottom bar (`NowPlayingBar`) so every configured runner is
reachable: on a phone viewport the runner boxes must scroll horizontally with
touch swipe instead of clipping after the first visible box. All per-runner
controls (inspect, play/pause, skip) must stay usable while scrolling.

## Background (grounded facts)

- Owner component: `frontend/src/components/layout/NowPlayingBar.jsx`.
- The runner-box strip container (lines ~454-458) is
  `flex items-center gap-1.5 mt-0.5 min-w-0 max-w-full overflow-hidden`:
  it clips with no scroll axis, so on a ~360px phone only ~1 box
  (each `shrink-0 max-w-[280px]`, line ~471) is visible and the rest are
  unreachable.
- A JS render cap, `MAX_VISIBLE_RUNNER_BOXES = 4` (line ~80, sliced at
  line ~293), hides runners beyond the first four behind a `+N more` chip
  (lines ~540-551). Scroll alone would not make those runners reachable.
- Established codebase pattern for mobile horizontal strips:
  `overflow-x-auto … custom-scrollbar` (see `Header.jsx` line ~565,
  `UnifiedSearchBar.jsx` line ~462, `CanvasToolbar.jsx` line ~311), plus
  `overscroll-contain` on scroll regions to stop gesture chaining
  (`LogViewer.jsx` line ~579, guarded by `LogViewer.scroll.test.jsx`).
- Existing gates that constrain the change:
  - `frontend/src/components/layout/NowPlayingBar.test.jsx`: the
    `past the render cap … "+N more" chip` test pins current cap behavior
    and must be updated; the right-rail `overflow-hidden` contract test
    must keep passing.
  - `canary-e2e/tests/functional.spec.js`: right-rail overlap gate at
    640/768/800/900/1024/1280px (runner-box buttons vs right-rail rects).
  - `canary-e2e/tests/mobile-responsive.spec.js`: footer visible,
    boxes-or-idle-hint visible on mobile.
- Survey status: `SURVEY.md` (on `origin/kb/a654a254-…`, commit `e5f5a27`)
  contains 7 questions with **empty answers**; the referenced
  `idea-20261102-091805.md` does not exist locally or on the branch.
  All survey choices below are therefore recommendations with reversible
  defaults, not recorded decisions.

## Survey disposition (q1-q7)

| # | Question | Recommendation |
|---|----------|----------------|
| q1 | Scrollable on small screens? | Yes — this is the task itself. |
| q2 | Swipe vs arrow buttons? | Swipe only (native touch scroll). No arrow-button pattern exists in the bar; arrows add state, focus, and layout cost for no proven need. |
| q3 | Keep full-size boxes or compact? | Keep full size. Compaction is unrequested scope; revisit only if usability testing shows boxes too wide. |
| q4 | Keep the `+N more` label? | Remove it: render all boxes inside the scroll container so scroll replaces paging. |
| q5 | Phones only or desktop too? | One shared implementation; phones gain scrolling, desktop is visually unchanged when boxes fit (a non-overflowing scroll container looks identical). No viewport-branching JS. |
| q6 | Details usable while scrolling? | All of them — runner name, task name, stage name, play/pause, skip — unchanged inside each box. |
| q7 | Keep it simple? | Yes. One container-class change plus cap removal, covered by tests. |

## Success Criteria

1. On a 360-390px viewport with 2+ runners, every runner box is reachable
   by horizontal swipe and every box keeps working inspect / play-pause /
   skip controls.
2. No runner is hidden behind a cap or clip on any viewport: the strip
   renders the full fleet roster and scrolls only when it overflows.
3. Desktop appearance with a fitting fleet is pixel-identical to today
   (no visible scrollbar gutter, no layout shift).
4. Vertical page scroll is never hijacked by the strip (horizontal pan
   only, no scroll chaining into the page).
5. All existing gates still pass: `npm run test:frontend`,
   `npm run test:unit`, frontend lint/build, and the canary overlap +
   mobile specs.

## Approach

Follow "make the change easy, then make the change":

1. **First, characterize and isolate** (no behavior change): baseline
   screenshots and test runs, plus a failing reachability test that pins
   the desired end state (all boxes rendered, container scrollable).
2. **Then, the minimal behavior change**: swap the strip container from
   `overflow-hidden` to the codebase-standard horizontal-scroll classes
   and remove the JS render cap so the container — not a slice — owns
   overflow on every viewport.
3. **Finally, prove it**: unit/integration tests, headless mobile-viewport
   screenshots, and the existing canary overlap/mobile gates.

Key decisions:

- **Remove the cap instead of keeping `+N more`.** The cap is JS
  (`slice(0, 4)`), so a "mobile-only uncap" would need viewport-branching
  JS; a single uncap is simpler and also fixes fleets > 4 on desktop
  (scroll strip instead of an unreachable overflow chip). Rejected
  alternative: keep the cap and scroll within 4 — leaves runners 5+
  unreachable, which contradicts the task ("only see one runner" is the
  symptom; unreachable runners are the disease).
- **No new components, hooks, or dependencies.** The fix reuses
  `overflow-x-auto`, `custom-scrollbar` (thin themed scrollbar from
  `frontend/src/index.css`), `overscroll-contain`, and optionally
  `scroll-smooth` — all already in the codebase.
- **No box redesign.** Boxes keep size, content, and `shrink-0` (required
  so they overflow into the scroll axis instead of squeezing).

## Steps

### Phase 0 — Baseline (research-first; big unknowns up front)

1. Run the frontend suite once to confirm green baseline:
   `npm run test --prefix frontend` (or scoped
   `npx vitest run src/components/layout/NowPlayingBar.test.jsx`
   from `frontend/`).
2. Capture baseline mobile screenshots with the headless tool (no
   long-lived servers):
   `node scripts/capture-screenshot.mjs --width 375 --height 812 --out …`
   against a fleet with 2+ runners. Confirm the defect: one box visible,
   rest clipped.
3. Read the canary overlap gate (`functional.spec.js` lines ~71-154) and
   note its measurement method (rect intersections of rendered box
   buttons vs rail children) so Phase 2 stays compatible: scrolled-out
   boxes still have rects, so keep the right rail's `overflow-hidden`
   and fixed footer layout untouched.

### Phase 1 — Make the change easy (no behavior change)

4. Add a characterization test to `NowPlayingBar.test.jsx` pinning the
   *current* clipping contract (container has `overflow-hidden`, boxes
   beyond 4 absent). This documents the before-state and makes the
   Phase 2 diff reviewable as an intentional contract change.
5. Add the failing target test (red): with 6 active runners, assert
   `now-playing-runner-boxes` carries `overflow-x-auto`, all six
   `now-playing-runner-box-*` test ids render, and
   `now-playing-runner-overflow` is absent. Keep the existing header
   `aria-label` (`6 runners`) assertion — the honest count stays.
6. Extract nothing unless needed: the strip markup (container + map +
   overflow chip) is already one contiguous block (lines ~453-552), so
   the change site is a ~10-line edit. If review prefers it, lift the
   container class list into a named constant for a one-line diff.

### Phase 2 — Make the change

7. In `NowPlayingBar.jsx`:
   - Container (`data-testid="now-playing-runner-boxes"`): replace
     `overflow-hidden` with
     `overflow-x-auto overflow-y-hidden overscroll-contain custom-scrollbar`
     (add `scroll-smooth` to match `UnifiedSearchBar`/`WorkflowCanvas`
     strips; keep `flex items-center gap-1.5 mt-0.5 min-w-0 max-w-full`).
   - Render `runnerBoxes` directly instead of `visibleRunnerBoxes`;
     delete the `+N more` chip block, the `hiddenRunnerCount` derivation,
     and the `MAX_VISIBLE_RUNNER_BOXES` export (or keep the export as
     deprecated if any external importer exists — verify with a repo
     search first).
   - Update the `runnerBoxVisibilityCap` JSDoc block to describe the new
     contract (container scrolls; data layer unchanged).
   - Keep each box `shrink-0` (non-negotiable for scroll overflow) and
     keep the right rail untouched.
8. Update the existing `past the render cap` test to the new contract
   (all six boxes present, no overflow chip) or replace it with the
   Phase 1 target test; remove the Phase 1 characterization test's
   old-contract assertions. Do not weaken any other assertion
   (queue chip, transport, badges, right-rail clip).

### Phase 3 — Prove it (testing plan)

9. Unit/integration (primary gate):
   - `npm run test --prefix frontend` — full frontend suite green.
   - `npm run test:unit` — repo-wide unit gate green.
   - New/updated tests cover: full-fleet rendering, scrollable
     container classes, `overscroll-contain` present (mirror the
     `LogViewer.scroll.test.jsx` assertion style), per-box controls
     still fire (`pauseRunner`/`resumeRunner`/`skipRunner`), inspect
     button still opens the inspector, idle-box pause/skip states
     unchanged.
10. Static gates: `npm run lint --prefix frontend` and
    `npm run build --prefix frontend` green.
11. Visual/mobile verification (headless only, per stage guidance):
    - `node scripts/capture-screenshot.mjs --width 375 …` and
      `--width 768 …`: every runner reachable in the strip; footer
      72px height preserved; no overlap with the right rail.
    - Re-run `canary-e2e/tests/functional.spec.js` overlap gate and
      `canary-e2e/tests/mobile-responsive.spec.js` now-playing test
      if the canary harness is available in this environment; at
      minimum confirm the overlap gate's query set
      (`[data-testid="now-playing-runner-boxes"] button`) still
      resolves and its no-intersection invariant holds with all
      boxes rendered.
12. Manual spot-check (only if a dev server is already running for
    other reasons — do not start a long-lived server for this):
    swipe the strip on a phone-width viewport; confirm momentum
    scrolling, tappable 28px+ controls, no vertical page pull, and
    unchanged desktop rendering.

### Phase 4 — Documentation

13. Update the `NowPlayingBar` and `runnerBoxVisibilityCap` JSDoc to the
    scroll contract (done in step 7 as part of the edit, not as a
    separate doc task).
14. If the repo has user-facing docs naming the 4-box cap or `+N more`
    (search `docs/` and `site-docs/` for `+N more` /
    `MAX_VISIBLE_RUNNER_BOXES`), update those lines; otherwise no doc
    files change — the JSDoc is the contract surface.
15. Record the survey-default decisions (q1-q7 table above) in the task
    file or commit message so a later reviewer knows the unanswered
    survey was dispositioned, not ignored.

## Risks / Open Questions

- **Survey unanswered.** All q1-q7 choices are recommendations. If a
  human later wants arrow buttons (q2) or compact chips (q3), those are
  additive follow-ups on top of this scroll foundation — this plan
  deliberately does not pre-build them.
- **Wide fleets on desktop.** Fleets > 4 now scroll on desktop instead
  of showing `+N more`. This is strictly more capable (all runners
  reachable) and visually identical for fitting fleets; the only
  behavior delta is the removed chip, covered by the updated test.
- **Overlap gate sensitivity.** Rendering more boxes adds more measured
  buttons, but the gate asserts non-intersection with rail children,
  and the footer flex layout (boxes `min-w-0`, rail `flex-none`) is
  unchanged — risk is low; Phase 3 step 11 verifies.
- **Scrollbar aesthetics.** `custom-scrollbar` renders a thin themed bar
  (shared with every other strip); on touch devices it overlays without
  taking layout space. No custom fade affordance is planned — rejected
  as unneeded complexity for a standard scroll container.
- Open question: none blocking. Optional follow-up (out of scope):
  keyboard-accessible scroll buttons for non-touch users with narrow
  viewports — the strip is already keyboard-reachable via Tab through
  box controls, so this is an enhancement, not a gap.
