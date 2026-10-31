# Implementation Plan: Horizontal Scroll for Runner Boxes in Now Playing Bar

**Task:** Make the runner boxes in the bottom Now Playing bar horizontally scrollable on mobile/narrow viewports so no runner is cut off and every runner can be reached by swiping or scrolling. Reference screenshot: `assets/18743.png`.

**Survey basis:** `SURVEY.md` round 1 — single question: "I think this is simple enough to not require questions. Do you agree?" with options "Yes — just make the runners row scroll sideways" / "No — explain in Notes". No answers were recorded (empty `answers: {}`). Assumption: proceed with the plain horizontal-scroll behaviour requested in the task text. No alternative design was asked for. If review requests snap points, arrow buttons, or a different treatment, handle as a follow-up — not in this change.

**Principle:** Make change easy, then make the change. Isolate and characterise the current capping/clipping behaviour before touching layout, so the fix itself is a small, reviewable diff with a passing gate on both sides.

---

## 1. Goals

1. With 2+ runners configured at 360–390 px viewport width, every runner box is reachable by horizontal scroll inside the bar — none permanently clipped or hidden.
2. The bar stays 72 px tall, fixed to the viewport bottom, with safe-area padding intact; page body gains no horizontal scrollbar.
3. Each box keeps its existing controls (inspect, pause/resume, skip) working by touch and mouse; keyboard users can reach every box.
4. `npm run test:frontend` (and hence `npm run test:unit`) passes; the canary overlap gate still passes.
5. No new dependencies, no API changes, no desktop layout regression.

## 2. Non-Goals

- No change to runner data fetching, health logic, queue chip, engine badge, or desktop layout.
- No new dependencies, no backend/API changes.
- No multi-row wrapping (would break the fixed 72 px bar height).
- No arrow/pagination buttons (extra controls in an already crowded 72 px bar; swipe + keyboard suffice — revisit only if review asks).
- No snap-point or animated carousel behaviour in this change.

---

## 3. Current State Inventory

### 3.1 Component to fix

- `frontend/src/components/layout/NowPlayingBar.jsx` — the strip to fix is the runner-box row: the container with `data-testid="now-playing-runner-boxes"` currently uses `overflow-hidden` (clips everything past the edge). Rendering is hard-capped by `MAX_VISIBLE_RUNNER_BOXES = 4` (`runnerBoxes.slice(0, 4)`) with a `+N more` overflow chip for the rest. That combination is the reported bug: on mobile the second box is cut mid-box and the rest are unreachable except via the chip's `title` tooltip (unusable on touch).
- Each individual box already carries `shrink-0`, so boxes will not squash once the parent allows scrolling — the parent's `overflow-hidden` plus the JS slice are the only two things hiding runners.
- `frontend/src/components/layout/NowPlayingBar.test.jsx` — the "past the render cap … '+N more' chip" test pins the current cap-and-chip behaviour and must be rewritten, not deleted.

### 3.2 Screenshot evidence

- `docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/assets/18743.png` shows `local-bra…` cut off at the bar's right edge at mobile width, with `Runners 2` in the header — consistent with the `overflow-hidden` container, not with any backend/data issue. `resolveRunnerBoxes` already returns the full fleet; the bug is purely presentation.

### 3.3 Existing gates that touch this area

- `frontend/src/components/layout/NowPlayingBar.test.jsx` — cap-and-chip test.
- `canary-e2e/tests/functional.spec.js` — "right rail never overlaps the runner boxes" gate: measures runner-box button rects vs. rail rects; a scrollable strip must keep passing it.
- `canary-e2e/tests/mobile-responsive.spec.js` — compact-bar visibility test; page body must keep zero horizontal overflow.
- `frontend/src/components/layout/` — right-rail vs. footer contract; tooltips are portal-rendered so they stay unclipped.

---

## 4. Guiding Principle: Make Change Easy, Then Make the Change

We first isolate and characterise the current behaviour (reproduce, measure, pin with a test) and only then change layout. This keeps the fix to a small, reviewable diff and prevents a risky monolithic rewrite of the bar.

---

## 5. Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Scroll vs. alternatives | Native `overflow-x-auto` strip | Touch swipe works free; no JS, no new deps |
| Render cap + `+N more` chip | Remove both; render all boxes | A cap contradicts "all runners reachable"; chip's `title` tooltip is unusable on touch |
| Multi-row wrap | Rejected | Would break the fixed 72 px bar height |
| Arrow/pagination buttons | Rejected | Extra controls in an already crowded 72 px bar; swipe + keyboard suffice |
| Vertical behaviour | Stay `overflow-y-hidden` | Bar height must not grow; boxes keep current size |
| Large fleets (10+ runners) | Long scrollable strip, fixed-size boxes | Bar unaffected; strictly better than unreachable runners |
| Scrollbar affordance | Thin/autohide, themed if possible | Fits the bar's visual language without stealing space |

---

## 6. Work Plan (in order — research and easy-making first)

### Phase 0 — Reproduce and measure (do first, ~30 min)

1. Read the full runner-strip JSX in `NowPlayingBar.jsx` (footer through the boxes container) and note every class constraining width/overflow on the footer → left-side flex → boxes container chain.
2. Reproduce headlessly: render the bar with 2–6 runners at 390 px via the existing test harness or `node scripts/capture-screenshot.mjs` against a fixture, and confirm which runners are unreachable and that the cause is the slice + `overflow-hidden` (not missing data — `resolveRunnerBoxes` already returns the full fleet).
3. Record the outcome (widths, which boxes clip) as the before-evidence.

### Phase 1 — Make the change easy (before the fix)

4. Isolate the cap logic so the fix is a one-spot edit: gather the slice, `hiddenRunnerCount`, and overflow-chip JSX (one contiguous block) and confirm nothing else imports `MAX_VISIBLE_RUNNER_BOXES` besides the component and its test (search repo-wide first).
5. Add a temporary characterisation test pinning current behaviour (4-box cap + chip) so the Phase 2 diff visibly flips exactly one behaviour. Keep it; Phase 3 rewrites it into the new-behaviour test.

### Phase 2 — Make the change (the fix itself)

6. **Container:** Change the `now-playing-runner-boxes` row from `overflow-hidden` to `overflow-x-auto` (keep `overflow-y-hidden`), keep `flex` + `shrink-0` boxes, add a thin/autohide scrollbar affordance that fits the theme, `-webkit-overflow-scrolling: touch` equivalent, and `scroll-padding` so a scrolled-to box is fully visible.
7. **Render all boxes:** Drop the `.slice(0, MAX_VISIBLE_RUNNER_BOXES)`; delete the `+N more` chip and `hiddenRunnerCount`; delete or repurpose `MAX_VISIBLE_RUNNER_BOXES` (prefer removal + test update over a dead export — check for other importers first).
8. **Accessibility:** Make the strip keyboard-traversable — focusable region with an `aria-label` such as "Runner list, scroll horizontally for more runners"; roving via native Tab into boxes is acceptable (document the choice). Keep each box's existing `aria-label`s and respect `prefers-reduced-motion` (no smooth-scroll animation).
9. **Guard the footer contract:** Confirm the strip's scroll does not push into the right rail (desktop) or create page-level horizontal scroll (mobile; right rail is `hidden sm:flex`, so the strip gets full width there). Tooltips are portal-rendered, so they stay unclipped.

### Phase 3 — Tests and docs

10. Rewrite the cap test into new-behaviour tests in `NowPlayingBar.test.jsx`:
    - 6 runners → all 6 boxes rendered, no `now-playing-runner-overflow` chip.
    - Strip container carries horizontal-scroll classes and an accessible scroll-region label.
    - Per-box controls (pause/skip/inspect) still fire for a box that would previously have been capped away.
11. Update component docs: revise the `runnerBoxVisibilityCap` MARK comment (cap no longer exists) and the right-rail overlap comment if the gate needed adjusting. No user-docs change needed (pure CSS/layout fix).

---

## 7. Validation Plan

| Check | Command / method | Expected outcome |
|---|---|---|
| Frontend unit tests | `npm run test:frontend` | Green — primary gate |
| Full unit suite | `npm run test:unit` (api + frontend) | Green (at minimum the frontend half above) |
| E2E overlap gate | `canary-e2e/tests/functional.spec.js` — "right rail never overlaps the runner boxes" at 640/768/800/900/1024/1280 px | Zero rect intersections |
| Headless visual check | `node scripts/capture-screenshot.mjs --width 390` (and 768) with 2+ runners | First box fully visible, second reachable, bar/rail layout intact. Do not start a persistent dev server — use the isolated headless runner per repo guidance |
| Touch/keyboard pass | Manual swipe or Playwright swipe + Tab script | Swipe reaches the last box; Tab reaches every box's buttons; no page-level horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`) |
| Lint | `npm run lint:frontend` on touched files | Clean |

The E2E overlap gate is the highest-risk step — a scrollable strip that grows the flex child could reintroduce rail overlap on desktop if `min-w-0` discipline slips.

---

## 8. Risks and Open Questions

| Risk / question | Assessment | Mitigation |
|---|---|---|
| Large fleet (10+ runners) makes a long strip | Boxes stay fixed-size and scroll; bar itself unaffected — acceptable and strictly better than unreachable runners | No action needed; monitor if fleets grow very large |
| `+N more` chip's `title` listed hidden runner IDs; after removal that list lives only in the strip | No information loss — all boxes now render | Confirm no other consumer relied on the chip's presence |
| No survey response recorded — assumption of plain swipe-to-scroll with no snap points or arrows | Flagged as assumption in §1 context | If review asks for snap/arrow affordances, add as a follow-up, not in this change |
| Desktop regression if scroll container grows flex child | Right-rail overlap gate catches it | Run the canary subset explicitly; keep `min-w-0` on the flex parent |
| Touch tooltip (`title`) was the only way to see capped runners on mobile; after fix it is gone | Intentional — runners are now directly visible | No mitigation needed |

---

## 9. Rollout and Documentation

1. Land the plan file in this task directory (this file) and commit on the task branch.
2. Execute phases in order; keep each phase to one commit so review can see the before/after.
3. No user-facing documentation change is required — this is a pure CSS/layout fix. Internal docs: update the MARK comment in `NowPlayingBar.jsx` that currently describes the cap.
4. After merge, verify on a real mobile device (or BrowserStack) that swipe works and no page-level horizontal scroll was introduced.

---

## 10. Files Touched (expected)

- `frontend/src/components/layout/NowPlayingBar.jsx` — container overflow classes, remove slice/chip/cap.
- `frontend/src/components/layout/NowPlayingBar.test.jsx` — rewrite cap test into scroll/new-behaviour tests.
- No backend, no API surface, no new dependencies.
