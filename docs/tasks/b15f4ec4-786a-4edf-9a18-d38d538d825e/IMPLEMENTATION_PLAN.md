## Goal

Make the runner boxes in the bottom Now Playing bar horizontally scrollable on
narrow (mobile) viewports, so no runner is cut off and every runner can be
reached by swiping/scrolling. Small, CSS-level change in one component.

## Success Criteria

- With 2+ runners configured at a 360–390px wide viewport, every runner box
  is reachable by horizontal scroll inside the bar; none is permanently
  clipped or hidden behind a cap.
- The bar stays 72px tall, fixed to the viewport bottom, with safe-area
  padding intact; page body gains no horizontal scrollbar.
- Each box keeps its existing controls (inspect, pause/resume, skip) working
  by touch and mouse; keyboard users can reach every box.
- `npm run test:frontend` (and hence `npm run test:unit`) passes; the
  canary overlap gate still passes.
- No new dependencies, no API changes, no desktop layout regression.

## Context and Evidence

- The strip to fix is the runner-box row in
  `frontend/src/components/layout/NowPlayingBar.jsx`: the container with
  `data-testid="now-playing-runner-boxes"` currently uses
  `overflow-hidden` (clips everything past the edge), and rendering is
  hard-capped by `MAX_VISIBLE_RUNNER_BOXES = 4` (`runnerBoxes.slice(0, 4)`)
  with a `+N more` overflow chip for the rest. That combination is exactly
  the reported bug: on mobile the second box is cut mid-box and the rest are
  unreachable except via the chip's `title` tooltip.
- Each individual box already carries `shrink-0`, so boxes will not squash
  once the parent allows scrolling — the parent's `overflow-hidden` plus the
  JS slice are the only two things hiding runners.
- The screenshot (`docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/assets/18743.png`)
  shows `local-bra…` cut off at the bar's right edge at mobile width, with
  `Runners 2` in the header — consistent with the `overflow-hidden`
  container, not with any backend/data issue.
- Survey input (`SURVEY.md`): round 1 asked whether to just "make the
  runners row scroll sideways" and recorded **no answers**, so there is no
  respondent direction to incorporate. Assumption: proceed with the plain
  horizontal-scroll behavior the task text requests; no alternative design
  was asked for. Flag if a reviewer wants snap points, arrow buttons, or a
  different treatment.
- Existing gates that touch this area and will need attention:
  - `frontend/src/components/layout/NowPlayingBar.test.jsx` — the
    `"past the render cap … '+N more' chip"` test pins the current
    cap-and-chip behavior and must be rewritten, not deleted.
  - `canary-e2e/tests/functional.spec.js` — the "right rail never overlaps
    the runner boxes" gate measures runner-box button rects vs. rail rects;
    a scrollable strip must keep passing it.
  - `canary-e2e/tests/mobile-responsive.spec.js` — compact-bar visibility
    test; page body must keep zero horizontal overflow.
- Verification tooling per repo guidance: unit/integration suites are the
  primary gate (`npm run test:unit`); visual checks use the isolated
  headless runner (`node scripts/capture-screenshot.mjs`), never a
  long-lived background server.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Scroll vs. alternatives | Native `overflow-x-auto` strip | Touch swipe works free; no JS, no new deps |
| Render cap + `+N more` chip | Remove both; render all boxes | A cap contradicts "all runners reachable"; chip's `title` tooltip is unusable on touch |
| Multi-row wrap | Rejected | Would break the fixed 72px bar height |
| Arrow/pagination buttons | Rejected | Extra controls in an already crowded 72px bar; swipe + keyboard suffice |
| Vertical behavior | Stay `overflow-y-hidden` | Bar height must not grow; boxes keep current size |

## Work Plan (in order — research and easy-making first)

### Phase 0 — Reproduce and measure (do first, ~30 min)

1. Read the full runner-strip JSX (`NowPlayingBar.jsx`, footer through the
   boxes container) and note every class constraining width/overflow on the
   footer → left-side flex → boxes container chain.
2. Reproduce headlessly: render the bar with 2–6 runners at 390px via the
   existing test harness or `capture-screenshot.mjs` against a fixture, and
   confirm which runners are unreachable and that the cause is the
   slice + `overflow-hidden` (not missing data — `resolveRunnerBoxes`
   already returns the full fleet).
3. Record the outcome (widths, which boxes clip) as the before-evidence.

### Phase 1 — Make the change easy (before the fix)

4. Isolate the cap logic so the fix is a one-spot edit: gather the slice,
   `hiddenRunnerCount`, and overflow-chip JSX (one contiguous block) and
   confirm nothing else imports `MAX_VISIBLE_RUNNER_BOXES` besides the
   component and its test (search repo-wide first).
5. Add a temporary characterization test pinning current behavior (4-box cap
   + chip) so the Phase 2 diff visibly flips exactly one behavior. Keep it;
   Phase 3 rewrites it into the new-behavior test.

### Phase 2 — Make the change (the fix itself)

6. Container: change the `now-playing-runner-boxes` row from
   `overflow-hidden` to `overflow-x-auto` (keep `overflow-y-hidden`),
   keep `flex` + `shrink-0` boxes, add `scrollbar` affordance that fits the
   theme (thin/autohide is fine), `-webkit-overflow-scrolling: touch`
   equivalent, and `scroll-padding` so a scrolled-to box is fully visible.
7. Render all `runnerBoxes` (drop the `.slice`); delete the `+N more` chip
   and `hiddenRunnerCount`; delete or repurpose `MAX_VISIBLE_RUNNER_BOXES`
   (prefer removal + test update over a dead export — check for other
   importers first).
8. Accessibility: make the strip keyboard-traversable (focusable region with
   an `aria-label` such as "Runner list, scroll horizontally for more
   runners", roving via native Tab into boxes is acceptable — document the
   choice), keep each box's existing `aria-label`s, and respect
   `prefers-reduced-motion` (no smooth-scroll animation).
9. Guard the footer contract: confirm the strip's scroll does not push into
   the right rail (desktop) or create page-level horizontal scroll (mobile;
   right rail is `hidden sm:flex`, so the strip gets full width there).
   Tooltips are portal-rendered, so they stay unclipped.

### Phase 3 — Tests and docs

10. Rewrite the cap test into new-behavior tests in
    `NowPlayingBar.test.jsx`:
    - 6 runners → all 6 boxes rendered, no `now-playing-runner-overflow`.
    - Strip container carries horizontal-scroll classes and an accessible
      scroll-region label.
    - Per-box controls (pause/skip/inspect) still fire for a box that would
      previously have been capped away.
11. Update component docs: revise the `runnerBoxVisibilityCap` MARK comment
    (cap no longer exists) and the right-rail overlap comment if the gate
    needed adjusting. No user-docs change needed (pure CSS/layout fix).

## Validation Plan

- `npm run test:frontend` — full frontend suite; must be green (primary gate).
- `npm run test:unit` — api + frontend; run if time permits, at minimum the
  frontend half above.
- E2E overlap gate (`canary-e2e/tests/functional.spec.js`, "right rail never
  overlaps the runner boxes"): run the headed/headless canary subset covering
  640/768/800/900/1024/1280px; expect zero rect intersections. Highest-risk
  step — a scrollable strip that grows the flex child could reintroduce rail
  overlap on desktop if `min-w-0` discipline slips.
- Headless visual check: `node scripts/capture-screenshot.mjs` at
  `--width 390` (and 768) with 2+ runners configured; confirm by viewing the
  PNG that the first box is fully visible, the second is reachable, and the
  bar/rail layout is intact. Do not start a persistent dev server for this.
- Manual touch/keyboard pass (or Playwright swipe + Tab script): swipe
  reaches the last box; Tab reaches every box's buttons; no page-level
  horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`).
- `npm run lint:frontend` for the touched files.

## Risks and Open Questions

- Risk: removing the cap means a large fleet (10+ runners) makes a long
  strip; boxes stay fixed-size and scroll, so the bar itself is unaffected —
  acceptable, and strictly better than unreachable runners.
- Risk: the `+N more` chip's `title` listed hidden runner ids; after removal
  that list lives only in the strip itself — no information loss, since all
  boxes now render.
- Open question (assumption, see Context): no survey response was recorded,
  so plain swipe-to-scroll with no snap points or arrows is assumed. If
  review asks for snap/arrow affordances, add as a follow-up, not in this change.
- Non-goals: no change to runner data fetching, health logic, queue chip,
  engine badge, or desktop layout; no new dependencies.
