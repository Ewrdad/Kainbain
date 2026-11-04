# Implementation Plan: Horizontal Scroll for Runner Boxes in Now Playing Bar

**Task:** `b15f4ec4-786a-4edf-9a18-d38d538d825e` — "this should be scrollable at the bottom".
Runners are cut off at the bottom bar on mobile and unreachable. Make the
runner row horizontally scrollable. Reference screenshot:
`docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/assets/18743.png`
(shows `local-bra…` clipped mid-box at mobile width with `Runners 2` in the header).

**Survey basis (`SURVEY.md`):** Round 1 (generated `2026-10-30T23:32:47Z`,
stage `stage-1792362077711`) asked a single question `q1`: "I think this is
simple enough to not require questions. Do you agree?" with options
"Yes – just make the runners row scroll sideways so all runners can be
reached" / "No – I want something different (explain in Notes)".
`answers` is empty (`{}`) — no response was recorded. This plan therefore
assumes the plain behaviour: a native horizontal scroll/swipe strip with no
snap points, arrows, pagination, or carousel animation. If review asks for
snap/arrow affordances, they are a follow-up, not part of this change.

**Principle:** Make change easy, then make the change. Research, reproduce,
and isolate the clipping behaviour first (Phases 0–1); only then touch layout
(Phase 2), so the fix is a small reviewable diff with a passing gate on both
sides.

---

## 1. Goal

With 2+ runners configured at 360–390 px viewport width, every runner box in
the bottom Now Playing bar is reachable by horizontal scroll/swipe. None is
permanently clipped or hidden behind an unreachable overflow indicator.

## 2. Success Criteria

1. Every configured runner renders a box; all boxes are reachable by touch
   swipe / mouse scroll / keyboard at 360–390 px width.
2. The bar stays 72 px tall, fixed to the viewport bottom, with safe-area
   padding intact; the page body gains no horizontal scrollbar.
3. Each box keeps its existing controls (inspect, pause/resume, skip) working
   by touch, mouse, and keyboard.
4. `npm run test:frontend` (and hence `npm run test:unit`) passes; the canary
   right-rail overlap gate still passes.
5. No new dependencies, no API changes, no desktop layout regression.

## 3. Non-Goals

- No change to runner data fetching (`resolveRunnerBoxes`, monitor polling),
  health logic, queue chip, engine badge, or desktop layout.
- No new dependencies, no backend/API changes.
- No multi-row wrapping (would break the fixed 72 px bar height).
- No arrow/pagination buttons (crowded 72 px bar; swipe + keyboard suffice).
- No snap-point or animated carousel behaviour.

---

## 4. Current State Inventory (verified by reading the code)

### 4.1 Component to fix

- `frontend/src/components/layout/NowPlayingBar.jsx` — the strip to fix is the
  runner-box row (`data-testid="now-playing-runner-boxes"`). Pre-fix baseline:
  the row clips at the bar edge and rendering is hard-capped
  (`MAX_VISIBLE_RUNNER_BOXES = 4`, `runnerBoxes.slice(0, 4)`) with a `+N more`
  overflow chip whose `title` tooltip lists hidden runners — unusable on touch.
  Verified: `resolveRunnerBoxes` already returns the full fleet, so the bug is
  purely presentational (clipping + render cap), not data.
- Each box already carries `shrink-0`, so boxes will not squash once the
  parent allows scrolling — the parent overflow plus the JS slice are the only
  two things hiding runners.
- `frontend/src/components/layout/NowPlayingBar.test.jsx` — the cap-and-chip
  test pins the old behaviour and must be rewritten into new-behaviour tests,
  not deleted.
- `frontend/src/index.css` — home of the thin-scrollbar styling for the strip.

### 4.2 Layout contracts that must hold

- Footer: `fixed bottom-0 h-[72px]`, `pb-[env(safe-area-inset-bottom)]`.
- Left side flex chain (`flex-1 min-w-0`) must keep `min-w-0` discipline so the
  scroll container cannot push into the right rail on desktop.
- Right rail (`data-testid="now-playing-right-rail"`) keeps `overflow-hidden`
  as cheap insurance; tooltips are portal-rendered to `document.body`, so they
  stay unclipped.
- Right-rail queue chip is `hidden sm:flex`, so on mobile the strip gets the
  full bar width.

### 4.3 Existing gates that touch this area

- `frontend/src/components/layout/NowPlayingBar.test.jsx` — cap-and-chip test.
- `canary-e2e/tests/functional.spec.js` — "right rail never overlaps the
  runner boxes" gate (rect intersections at 640/768/800/900/1024/1280 px).
- `canary-e2e/tests/mobile-responsive.spec.js` — compact-bar visibility; page
  body must keep zero horizontal overflow.
- `canary-e2e/tests/workflow.spec.js` — "Now Playing bar: runner boxes own
  play/skip" E2E.

---

## 5. Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Scroll vs. alternatives | Native `overflow-x-auto` strip | Touch swipe works free; no JS, no new deps |
| Render cap + `+N more` chip | Remove both; render all boxes | A cap contradicts "all runners reachable"; chip `title` is unusable on touch |
| Multi-row wrap | Rejected | Would break the fixed 72 px bar height |
| Arrow/pagination buttons | Rejected | Extra controls in a crowded 72 px bar; swipe + keyboard suffice |
| Vertical behaviour | Stay `overflow-y-hidden` | Bar height must not grow; boxes keep current size |
| Large fleets (10+ runners) | Long scrollable strip, fixed-size boxes | Bar unaffected; strictly better than unreachable runners |
| Scrollbar affordance | Thin 3 px themed scrollbar (`scrollbar-width: thin`, webkit override) | Fits the bar's visual language without stealing space |
| Keyboard access | Focusable strip (`tabIndex={0}`) + `aria-describedby` sr-only hint | Passes axe `scrollable-region-focusable` (WCAG 2.1.1); native Tab into boxes scrolls them into view |
| Motion | No smooth-scroll animation | `prefers-reduced-motion` safe |

---

## 6. Work Plan (in order — research and easy-making first)

### Phase 0 — Research and reproduce (do first)

1. Read the full runner-strip JSX in `NowPlayingBar.jsx` (footer through the
   boxes container) and note every class constraining width/overflow on the
   footer → left-side flex → boxes container chain.
2. Confirm the data layer is innocent: `resolveRunnerBoxes` returns the full
   roster (union of registry actives + assignment-only ids); the clipping is
   the render slice plus container overflow.
3. Reproduce headlessly: render the bar with 2–6 runners at 390 px via the
   existing test harness or `npm run capture:screenshot -- --width 390`
   against a fixture. Confirm which runners are unreachable. Record widths and
   which boxes clip as the before-evidence (cf. `assets/18743.png`).
4. Search repo-wide for importers of `MAX_VISIBLE_RUNNER_BOXES` (expect only
   the component + its test) so removal is safe.

### Phase 1 — Make the change easy (before the fix)

5. Isolate the cap logic so the fix is a one-spot edit: gather the slice,
   `hiddenRunnerCount`, and overflow-chip JSX (one contiguous block).
6. Add a temporary characterisation test pinning current behaviour (cap +
   chip) so the Phase 2 diff visibly flips exactly one behaviour. Phase 3
   rewrites it into the new-behaviour tests.

### Phase 2 — Make the change (the fix itself)

7. **Container:** change the `now-playing-runner-boxes` row to
   `overflow-x-auto` + `overflow-y-hidden` (keep `flex`, `min-w-0`,
   `max-w-full`, `whitespace-nowrap`, `overscroll-contain`), add the
   `now-playing-runner-strip` class for the thin scrollbar, `-webkit-overflow-scrolling: touch`,
   and `scroll-padding-inline` so a scrolled-to box clears the strip edge.
8. **Render all boxes:** drop `.slice(0, MAX_VISIBLE_RUNNER_BOXES)`; delete
   the `+N more` chip and `hiddenRunnerCount`; delete
   `MAX_VISIBLE_RUNNER_BOXES` (prefer removal + test update over a dead
   export — importers checked in step 4).
9. **Accessibility:** focusable region (`tabIndex={0}` with the documented
   `jsx-a11y/no-noninteractive-tabindex` disable), `aria-describedby` pointing
   at an sr-only hint (`RUNNER_STRIP_SCROLL_HINT = 'Scroll horizontally to see
   every runner.'`); keep each box's existing `aria-label`s; no smooth scroll.
10. **Styling:** add the `.now-playing-runner-strip` block to
    `frontend/src/index.css` (thin scrollbar, transparent track, rounded
    thumb, `overscroll-behavior-x: contain`, touch scrolling).
11. **Guard the footer contract:** confirm the strip's scroll does not push
    into the right rail (desktop) or create page-level horizontal scroll
    (mobile). Keep `min-w-0` on the flex parent.

### Phase 3 — Tests and documentation

12. Rewrite the cap test into new-behaviour tests in `NowPlayingBar.test.jsx`:
    - 6 runners → all 6 boxes rendered, no `now-playing-runner-overflow` chip,
      no `+N more` text, header count honest (`Runners 6`, `aria-label`).
    - Strip carries horizontal-scroll classes, `now-playing-runner-strip`,
      `tabindex="0"`, accessible description = scroll hint; boxes keep
      `shrink-0`; never `flex-wrap` / `overflow-hidden`.
    - Per-box controls (pause/skip/inspect) still fire for a box that would
      previously have been capped away (e.g. `runner-5`).
    - Single-runner case keeps the singular `aria-label` inside the same
      scrollable strip.
13. Update component docs: replace the `runnerBoxVisibilityCap` MARK comment
    with the `runnerBoxStrip` MARK comment (no render cap, horizontal scroll,
    `shrink-0`, tab stop, reduced-motion safe). No user-docs change needed
    (pure CSS/layout fix).

---

## 7. Validation Plan

| Check | Command / method | Expected outcome |
|---|---|---|
| Frontend unit tests (primary gate) | `npm run test:frontend` | Green |
| Full unit suite | `npm run test:unit` (api + frontend) | Green (at minimum the frontend half) |
| Lint on touched files | `npm run lint:frontend` | Clean |
| Frontend build | `npm run build --prefix frontend` | Passes |
| E2E overlap gate | `canary-e2e/tests/functional.spec.js` — right rail vs. runner boxes at 640/768/800/900/1024/1280 px | Zero rect intersections |
| Mobile E2E | `canary-e2e/tests/mobile-responsive.spec.js` + `workflow.spec.js` Now Playing case | Compact bar visible; runner play/skip pass |
| Headless visual check | `npm run capture:screenshot -- --width 390` (and 768) with 2+ runners; save after-shot next to `assets/18743.png` | First box fully visible, last box reachable by scroll, bar/rail layout intact. No persistent dev server — isolated headless runner only |
| Touch/keyboard pass | Manual swipe or Playwright swipe + Tab script | Swipe reaches the last box; Tab reaches every box's buttons; no page-level horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`) |

Highest-risk step: the E2E overlap gate — a scrollable strip that grows the
flex child could reintroduce rail overlap on desktop if `min-w-0` discipline
slips. Run the canary subset explicitly.

---

## 8. Risks and Open Questions

| Risk / question | Assessment | Mitigation |
|---|---|---|
| Large fleet (10+ runners) makes a long strip | Boxes stay fixed-size and scroll; bar unaffected — strictly better than unreachable runners | No action; monitor if fleets grow very large |
| `+N more` chip's `title` listed hidden runner IDs | No information loss — all boxes now render | Confirm no other consumer relied on the chip (step 4 search) |
| No survey response recorded — assumption of plain swipe-to-scroll | Flagged as assumption in the header | If review asks for snap/arrow affordances, add as a follow-up |
| Desktop regression if scroll container grows flex child | Right-rail overlap gate catches it | Run the canary subset explicitly; keep `min-w-0` |
| Touch `title` tooltip was the only way to see capped runners on mobile | Intentional removal — runners are now directly visible | None needed |

Open questions: none — the survey's non-response defaults to the plain
horizontal-scroll reading of the task text, and all technical facts were
verified in the workspace.

---

## 9. Rollout and Documentation

1. Land this plan file in the task directory and keep work on the task branch
   (`kb/b15f4ec4-786a-4edf-9a18-d38d538d825e`).
2. Execute phases in order; keep each phase to one commit so review can see
   the before/after.
3. No user-facing documentation change is required — pure CSS/layout fix.
   Internal docs: update the MARK comment in `NowPlayingBar.jsx` (step 13).
4. After merge, verify on a real mobile device that swipe works and no
   page-level horizontal scroll was introduced.

---

## 10. Files Touched (expected)

- `frontend/src/components/layout/NowPlayingBar.jsx` — container overflow
  classes, remove slice/chip/cap, focusable strip + sr-only hint.
- `frontend/src/components/layout/NowPlayingBar.test.jsx` — rewrite cap test
  into scroll/new-behaviour tests.
- `frontend/src/index.css` — `.now-playing-runner-strip` thin-scrollbar block.
- `docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/assets/` — after-screenshot
  at 390 px for the record.
- No backend, no API surface, no new dependencies.
