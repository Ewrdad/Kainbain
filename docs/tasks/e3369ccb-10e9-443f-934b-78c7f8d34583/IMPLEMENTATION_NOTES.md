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

## Cleanup / hardening pass (this stage)

Found and fixed one real bug, plus fail-safe and standards hardening. No
user-visible behaviour changed except the bug fix.

Bug fix — stale collapse-all leaked into the next article: `DocsView` held
the one-shot `sectionVisibilitySignal` across article switches, and because
the viewer remounts per article (it unmounts while the next article loads),
the old signal applied to the new article — contradicting the documented
"every article opens all-open" promise (and the `site-docs/faq.md` line
"Sections always open expanded"). The signal now drops when the slug changes,
during render (never in an effect, keeping `react-hooks/set-state-in-effect`
clean — same precedent as `TaskGoalSection`'s task-switch reset). Pinned by
`DocsView.test.jsx` "a collapse-all never leaks into the next article"
(proven red before the fix, green after).

Fail-safe hardening:

- `MarkdownViewer`: a blank `##` heading renders an "Untitled section"
  fallback so the toggle always keeps an accessible name (a nameless button
  fails a11y checks); `aria-controls` is only set while expanded so the id
  never dangles at an unmounted body; unknown visibility-signal actions are
  still ignored but now reported once via `logger.warn` so a sender typo
  cannot hide; `renderMarkdownBlock` renders nothing for a malformed block
  instead of crashing the article.
- `TaskDetailHistoryPane`: non-array `timelineData`/`auditEvents` (a null
  task payload) render as empty lists instead of crashing the detail view.
- `groupBlocksIntoSections`: null entries pass through untouched so
  positional ids and review-wrapper indices never shift (pinned by test).

Standards cleanup (per `docs/KB Code Standards.md`):

- `renderMarkdownBlock` takes one labelled input object instead of four
  positional arguments; JSDoc corrected where it claimed `HEADING_STYLES`
  values were all historical (`h2` intentionally carries the new prominence
  tokens); failure modes documented on the `MarkdownViewer` props
  (unknown-action ignore+warn, signal consumed on article change,
  `defaultCollapsed` applies on mount/article change only).
- Deliberately NOT changed: `groupBlocksIntoSections(blocks)` stays a
  single positional argument to match its siblings (`parseMarkdownBlocks`,
  `sanitizeUrl`); `markdownSections.js` stays in `common/` next to its main
  consumer, mirroring the existing `DocsView` → `common/MarkdownViewer`
  import; no new files, so the one-function-per-file allowlist is untouched.

Test counts after this stage: `markdownSections.test.js` 9,
`MarkdownViewer.collapsible.test.jsx` 18, `DocsView.test.jsx` 16,
`TaskDetailHistoryPane.test.jsx` 5 (others unchanged). Full frontend suite at
handoff: 331 files / 4499 tests green;
`eslint` 0 errors; `check-one-function-per-file`, `check-jsdoc-example`,
`check-doc-links` pass; `prettier --check` clean on touched files.

Transfer / continuation of operations (operational environment):

- No API, backend, database, or persisted-state changes: collapse state is
  in-memory React state only (no localStorage keys added), so there is no
  migration, no backfill, no stale cross-version state, and nothing to clean
  on rollback — redeploying the previous frontend bundle fully reverts.
- Blast radius of the global `h2` prominence tokens (shared viewer): visual
  only, across task goal previews, reports, review UIs, file preview, and
  settings previews. Verified: full frontend suite green, no test or
  canary-e2e selector pins the old tokens, no snapshot files reference them.
- Deploy/rollback is a static bundle swap; a mid-session deploy behaves like
  any SPA reload (docs reopen all-open, history panes reopen previewed).
