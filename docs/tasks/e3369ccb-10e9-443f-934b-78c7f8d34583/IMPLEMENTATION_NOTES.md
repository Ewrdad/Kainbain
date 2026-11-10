# Implementation Notes — Make site docs more usable (task e3369ccb)

## Scope lock (Step 0)

- The referenced `assets/image.png` does not exist in the task folder, and
  `SURVEY.md` round 1 has `"answers": {}` (all 6 questions unanswered). The
  `idea-*.md` and `review-plan-*.md` files named in the stage brief are also
  absent. No requester contact was possible in this session, so the work
  ships the plan's recommended defaults, recorded here as assumptions:
  - Q1: only `h2` section titles collapse (no `h3` nesting).
  - Q2: all sections start open, with Expand all / Collapse all (no
    persisted state).
  - Q3: prominence via larger + bolder `h2`, more vertical space, and a
    chevron icon (no colour/shading overhaul, no mini-TOC).
  - Q4: task list + task details first (history audit log included as the
    progressive-disclosure target; review screens untouched).
  - Q5: spacing/typography + status labels first, then one disclosure.
  - Q6: desktop-first, no mobile regression (responsive classes untouched).

## Section-model spike (Step 1, throwaway)

- A temporary vitest probe grouped `architecture.md` (4 sections),
  `api-reference.md` (27 sections), `faq.md` (0 sections — all preamble),
  and `install-run.md` (8 sections, code/tables/lists inside sections).
- Confirmed: `h1` + pre-first-`h2` content stays in the preamble, every block
  type nests inside sections, and `startLine`/`endLine` spans survive
  grouping untouched. The probe file was deleted after the run.

## Files changed

Production:

- `frontend/src/components/common/markdownSections.js` (new) —
  `groupBlocksIntoSections(blocks)` pure section model (arrow const, so the
  one-function-per-file gate ignores it).
- `frontend/src/components/common/MarkdownViewer.jsx` — new `HEADING_STYLES`
  export (single home of the six heading class strings); block rendering
  extracted into `renderMarkdownBlock` shared by both paths; opt-in
  `collapsibleSections` / `defaultCollapsed` / `sectionVisibilitySignal`
  props; `h2` prominence (`text-base`→`text-lg`, `font-bold`→`font-extrabold`,
  `mt-2.5 mb-1`→`mt-4 mb-2`, stronger rule). Default rendering is unchanged
  apart from the `h2` prominence tokens.
- `frontend/src/components/docs/DocsView.jsx` — enables `collapsibleSections`
  and renders Expand all / Collapse all only when the loaded article holds
  `h2` sections.
- `frontend/src/components/tasks/TaskCard.jsx` — title `text-sm font-semibold`,
  meta row `text-[9px]`→`text-[10px]`, status label wrapped in a chip
  (dot + text preserved).
- `frontend/src/components/tasks/TaskDetailsTabContent.jsx` — banner
  explainers `text-xs`→`text-sm`, steering helper `text-[11px]`→`text-xs`.
- `frontend/src/components/tasks/TaskGoalSection.jsx` — running-stage warning
  guidance `text-[11px]`→`text-xs`.
- `frontend/src/components/tasks/TaskDetailHistoryPane.jsx` — audit log
  previews 5 events behind a Show all / Show fewer disclosure
  (`aria-expanded`); timeline always full.
- `site-docs/README.md` — authoring rule for `##` collapsible sections.
- `site-docs/faq.md` — user-facing paragraph about collapsing sections.
- `CHANGELOG.md` — Unreleased Added + Changed entries.

Tests (all co-located with their components):

- `frontend/src/components/common/markdownSections.test.js` (new, 8 tests).
- `frontend/src/components/common/MarkdownViewer.collapsible.test.jsx`
  (new, 16 tests).
- `frontend/src/components/docs/DocsView.test.jsx` (+3 tests).
- `frontend/src/components/tasks/TaskCard.readability.test.jsx` (new, 5 tests).
- `frontend/src/components/tasks/TaskDetailsTabContent.test.jsx` (new, 4 tests).
- `frontend/src/components/tasks/TaskDetailHistoryPane.test.jsx` (+2 tests).
- `frontend/src/components/tasks/TaskGoalSection.test.jsx` (+1 test).

## Design notes

- Collapse state resets when the article changes (positional ids must not
  leak across articles), and each expand/collapse-all nonce applies once —
  both adjust during render, never in an effect (keeps
  `react-hooks/set-state-in-effect` clean).
- Toggle is a native `<button type="button">` inside the real `h2`, so
  heading order is unchanged and Enter/Space work by platform default.
  The chevron is `aria-hidden`, animated, and `motion-reduce`-safe; the
  button carries the repo's standard `focus-visible` ring.
- `renderBlockWrapper` still receives every block with its original index in
  collapsible mode, so review-UI line anchoring is unaffected.

## Follow-ups (out of v1 scope, per plan)

- Persist per-article collapse state (localStorage) if Q2 asks for "remember".
- Nested `h3` collapsing if Q1 asks for sub-titles.
- Mini table-of-contents at the top of articles if Q3 asks for it.
- Colour/shaded header backgrounds beyond the v1 type/spacing treatment.
- Task review-screen readability pass if Q4 asks for it.
