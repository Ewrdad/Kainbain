# Implementation Plan — Markdown-rendered PR review for reports

## Goal

Make the Reports tab of PR review read like a document instead of a
line dump: render report markdown by default, keep per-part anchored
commenting, show highlight affordances only on hover/focus, remove the
thick per-line dividers, and fix the excessive vertical gaps — while
keeping every existing comment anchor working.

## Context and evidence

- Current UI: [ReportReviewView.jsx](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/components/review/ReportReviewView.jsx)
  defaults to `mode='lines'`: one row per source line inside a
  `divide-y divide-border-standard/30` container, a gutter number per
  line, and a hover `⊕` button per line. `Rendered Preview` mode uses
  [MarkdownViewer.jsx](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/components/common/MarkdownViewer.jsx)
  but supports no commenting.
- Probable root cause of the "massive gaps": each line row contains a
  `⊕` button with `min-h-[44px] min-w-[44px]`, which stretches **every**
  row to at least 44px tall even when the button is invisible
  (`md:opacity-0` still occupies layout). The `divide-y` border on
  every row is the "thick lines" complaint.
- Comment contract (must not break): `useReview.addComment` payloads
  use `scope: 'file' | 'line'` with `filePath`, integer `line`,
  `side: 'right'`, `lineText`, `body`
  ([useReview.js](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/context/useReview.js),
  [ReportReviewView.test.jsx](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/components/review/ReportReviewView.test.jsx)).
  Report threads are grouped by integer line in `ReportReviewView`
  (`byLine` map) and matched across `./` spellings via
  [reportPaths.js](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/components/review/reportPaths.js).
- Markdown engine: `parseMarkdownBlocks` in `MarkdownViewer.jsx` is a
  custom line-based parser that **drops source line numbers** — blocks
  carry no `startLine`/`endLine`. Any anchored commenting in rendered
  mode needs that mapping first. This is the biggest enabling piece of
  work, so it goes first (see Phase 1).
- Host page: [TaskReviewPage.jsx](/home/server2/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/frontend/src/components/tasks/TaskReviewPage.jsx)
  renders `ReportNavigator` + `ReportReviewView` in the Reports tab;
  no host-page contract change is planned.
- Survey (`SURVEY.md` in this task folder): all 5 questions are
  **unanswered** (`"answers": {}`). This plan adopts the survey's
  Recommended options as defaults and lists them as assumptions to
  confirm in Open Questions. The task's `assets/image.png` screenshot
  is not present in the workspace, so visual claims rest on the task
  text plus code reading.

## Survey mapping (all currently assumed, not answered)

| # | Survey question | Adopted answer |
|---|---|---|
| Q1 | First view when opening a report | Readable document; comment affordance on hover |
| Q2 | Comment on one specific part | Hover any block, small comment button for that part |
| Q3 | Hover behavior | Only the block under the mouse is gently highlighted |
| Q4 | Spacing / thick lines / gaps | Compact reading view: collapse blanks, small even spacing, no dividers |
| Q5 | Keep raw view | Yes, keep a Readable / Raw switch |

## Success Criteria

1. Reports tab opens in a rendered markdown reading view by default,
   with a working switch back to the raw line view.
2. Every rendered block (heading, paragraph, list item, code block,
   table, quote) offers an anchored comment via hover/focus, without
   navigating away from the reading view.
3. All pre-existing comments (file scope and integer-line scope) still
   render, anchored to the correct block after the change.
4. No always-on dividers or row striping in reading view; highlight
   appears only on hover/focus of a block.
5. Vertical rhythm is compact: no 44px-tall rows, blank source lines
   collapse, spacing is small and even.
6. Keyboard, screen-reader, touch, and reduced-motion behavior is no
   worse than today (comment buttons reachable without a mouse).
7. `npm run test:unit`, `npm run lint`, and the docs checks pass;
   before/after screenshots document the change.

## Approach

Two principles govern the sequencing:

1. **Make the change easy, then make the change.** Phases 0–1 add
   fixtures, characterization tests, source-line tracking in the
   markdown parser, and small anchor helpers — all without changing
   visible behavior. The visible redesign (Phases 2–3) then becomes a
   thin composition step on top of tested seams.
2. **Biggest unknowns first.** The block→line anchor mapping and the
   `MarkdownViewer` extension seam are the only real research risks;
   they are spiked and decided in Phase 1, before any restyle work.

Key technical decisions:

- **Anchor rendered comments to source start-lines, reusing the
  existing contract.** A block comment submits the same payload as
  today (`scope: 'line'`, integer `line`, `side: 'right'`,
  `lineText`), with `line` = the block's first source line. No API,
  sidecar-store, or `useReview` change. Existing threads group under
  the block whose line span contains them.
  Rejected: text-highlight anchoring (new model, selection edge
  cases); report-general-only comments (violates the anchored-comment
  requirement); showing full line numbers in reading view (violates
  the clean-reading requirement — instead show a subtle `L12–14`
  chip on hover/focus and in thread headers for traceability).
- **Extend, don't fork, the markdown renderer.** Add optional props to
  `MarkdownViewer` (e.g. `renderBlockWrapper(block, children)` plus
  block identity/line-span data attributes). Default rendering is
  unchanged, so all other callers (goal summary, preview panes) are
  unaffected. Rejected: a separate review-only markdown fork (two
  renderers to keep in sync).
- **Fix gaps structurally, not by tuning pixels.** The 44px `⊕`
  buttons become absolutely-positioned overlays (or a single floating
  action) so they never contribute to row height; per-line `divide-y`
  is removed in reading view; blank lines collapse because the block
  parser already skips them. Touch targets stay ≥44px on the button
  itself without stretching the row.
- **Keep Raw view as the escape hatch** (survey Q5): rename the toggle
  to `Readable | Raw lines`, default `Readable`. Raw keeps today's
  per-line numbers and `⊕` wiring untouched.

## Steps

### Phase 0 — Safety net (no behavior change)

1. Add a shared report fixture
   (e.g. `frontend/src/components/review/__fixtures__/report.md`
   plus a JS export): headings, paragraphs, bullets, ordered list,
   code fence, table, quote, `---`, blank runs, CRLF section, and a
   long line. Reuse it from both parser and view tests.
2. Add characterization tests pinning today's behavior: line-row
   count, `./` path matching, composer payloads, CRLF handling,
   preview toggle. (Most exist in `ReportReviewView.test.jsx`; add
   only missing gap cases such as empty-line rows and long reports.)
3. Capture baseline screenshots with the headless tool
   (`npm run capture:screenshot`) of the Reports tab in both modes
   for the fixture report. Store under this task's docs folder.

### Phase 1 — Make the change easy (no visible change; biggest work first)

4. **Spike (time-boxed): block→line mapping.** Extend
   `parseMarkdownBlocks` to record `startLine`/`endLine` (1-based,
   CRLF-normalized) on every block, and per-item spans for list
   items and table rows if cheap; otherwise block-level spans only
   with items inheriting the parent span. Spike exit criteria: all
   existing `MarkdownViewer` tests pass unchanged; new tests prove
   spans for each block type; CRLF and trailing-newline edge cases
   covered. If per-item spans prove messy, decide block-level-only
   and record it here.
5. Add `reportAnchors.js` in `frontend/src/components/review/`:
   pure helpers `blockForLine(blocks, line)` and
   `threadsForBlock(threadsByLine, block)` that map existing
   integer-line threads onto line spans. Unit-test with threads on
   blank lines, first/last lines, and lines inside multi-line
   blocks (code fences, paragraphs).
6. Add the `MarkdownViewer` extension seam: optional
   `renderBlockWrapper` (or `blockProps`) prop emitting stable
   `data-block-id`, `data-start-line`, `data-end-line` attributes.
   Default output byte-identical; prove with existing tests plus
   one wrapper test.
7. Small prep refactor in `ReportReviewView`: extract the line-row
   JSX into a `ReportLineRow` component and the composer-submit
   builders into helpers shared by both modes. No visual change;
   existing tests keep passing.

### Phase 2 — Rendered reviewable mode (the change)

8. Build `ReportReadableView` (new file in `review/`): renders the
   report through the extended `MarkdownViewer`, wraps each block in
   a hover/focus group showing a `⊕` block-comment button and a
   subtle `Lx–Ly` chip, renders grouped threads plus inline
   composers under their block, and keeps the file-level thread
   section and read-only (`canComment=false`) gating with the same
   payload shapes as Phase 0 pins.
9. Wire it into `ReportReviewView` as the default `Readable` mode;
   rename the toggle to `Readable | Raw lines`; keep Raw mode as
   the extracted `ReportLineRow` list. Update mode persistence if
   any; keep `data-testid="report-review-view"` and
   `data-report-path` stable.
10. Hover-only highlight: block wrapper gets a gentle
    `hover:`/`focus-within:` background; no `divide-y`, no borders
    between blocks. Gutter line numbers appear only in Raw mode.

### Phase 3 — Spacing, gaps, and polish

11. Apply the compact reading styles: collapse blank lines (parser
    already skips empties — verify, don't re-implement), small even
    `space-y`, remove divider lines/boxes around blocks, keep code
    blocks and tables as today's `MarkdownViewer` renders them.
12. Fix the 44px-row defect: `⊕` buttons become overlay-positioned
    (absolute, outside layout flow) in both modes so rows size to
    content. Verify with a test asserting row height classes and a
    before/after screenshot measuring the same report's scroll
    height shrinking substantially with identical content.
13. Accessibility pass: every `⊕` reachable by Tab with a visible
    focus ring and `aria-label` naming the block (e.g. "Add comment
    on paragraph, lines 12 to 14"); threads announced in reading
    order; `prefers-reduced-motion` disables smooth scroll/highlight
    transitions; touch devices get an always-visible affordance that
    does not inflate row height.

### Phase 4 — Land, document, clean up

14. Update/extend tests (see Validation Plan) and remove any
    superseded assertions about `divide-y` rows or preview-toggle
    labels only where the intended behavior changed.
15. Documentation: refresh the `MARK: ReportReviewView` JSDoc and new
    components' JSDoc; add a short "Reviewing reports" note to the
    user-facing docs if a review guide exists in `site-docs/` or
    `docs/`; add a `CHANGELOG.md` entry.
16. Re-run the full gates, capture after screenshots, and attach the
    before/after pair plus scroll-height numbers to this task's docs
    folder.

## Validation Plan

- **Primary gate:** `npm run test:unit` (runs API + frontend suites)
  and `npm run lint` must pass. Focused runs during development:
  `npm run test --prefix frontend -- ReportReviewView`,
  `... MarkdownViewer`, `... reportAnchors`, `... TaskReviewPage`.
- **Per-phase evidence:**
  - Phase 0: new fixture + characterization tests pass; baseline
    screenshots stored.
  - Phase 1: parser span tests (each block type + CRLF + trailing
    newline), `reportAnchors` unit tests (blank-line and
    multi-line-block threads), wrapper-seam test proving default
    output unchanged; full frontend suite green.
  - Phase 2: component tests for hover/focus `⊕` per block type,
    composer payload equality with Raw mode, legacy thread
    placement (thread on line N appears under the block spanning
    N), read-only gating, mode toggle default + persistence.
  - Phase 3: scroll-height/screenshot comparison, keyboard-only
    walkthrough, reduced-motion and narrow-viewport checks.
- **Visual verification:** headless only —
  `npm run capture:screenshot` against fixture reports; no
  long-lived dev servers. Compare baseline vs. after for divider
  removal, gap collapse, and hover-highlight behavior.
- **Manual checklist (cannot be automated):** open a real task's
  Reports tab, comment on a heading/paragraph/code block/list item,
  reload and confirm thread placement, flip Readable/Raw, Pass/Fail
  still works, outdated-badge (`headSha` mismatch) still shows.
- **Highest-risk validation:** legacy integer-line threads landing
  under the correct rendered block (Phase 1 step 5 + Phase 2 tests).
  If this fails, the fallback is block-level-only spans with
  unmatched threads shown in a small "Unplaced comments" section —
  decided in the Phase 1 spike, not during polish.

## Risks / Open Questions

- **Survey unanswered:** Q1–Q5 adopted the Recommended options. If
  the requester disagrees (e.g. wants raw-first, text-highlight
  commenting, or always-visible line numbers), Phases 2–3 change
  shape — confirm before implementing.
- **Screenshot missing:** `assets/image.png` is referenced by the
  task but absent from the workspace; gap/line claims are inferred
  from code (44px buttons, `divide-y`). The Phase 0 baseline
  screenshot replaces it as ground truth.
- **Non-goals:** no `useReview`/API/sidecar changes; no `DiffView`
  (code diff) restyle; no new markdown syntax support; no changes to
  `TaskReviewPage` tabs, Pass/Fail flow, or `ReportNavigator`.
- **Rollback:** each phase is independently revertible; Phase 2 keeps
  Raw mode intact, so the worst-case fallback is flipping the default
  back to Raw with one prop.

## Sources

None — all material claims trace to workspace files read during this
run (`ReportReviewView.jsx`, `MarkdownViewer.jsx`, `TaskReviewPage.jsx`,
`reportPaths.js`, `useReview.js`, `ReportReviewView.test.jsx`,
`SURVEY.md`, `package.json`, `scripts/capture-screenshot.mjs`).
No external libraries or APIs are recommended.
