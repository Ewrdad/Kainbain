# Implementation Plan — Make site docs more usable

## Goal

Make `site-docs` articles easier to scan and navigate by giving headers a
collapsible open/close behaviour and more prominent styling, and make task
screens generally easier to read.

Surfaces in scope:

- Docs article body: [DocsView.jsx](/home/server2/.kainbain/runner-work/kb-e3369ccb-10e9-443f-934b-78c7f8d34583/frontend/src/components/docs/DocsView.jsx) rendering markdown through [MarkdownViewer.jsx](/home/server2/.kainbain/runner-work/kb-e3369ccb-10e9-443f-934b-78c7f8d34583/frontend/src/components/common/MarkdownViewer.jsx).
- Task readability: task list cards ([TaskCard.jsx](/home/server2/.kainbain/runner-work/kb-e3369ccb-10e9-443f-934b-78c7f8d34583/frontend/src/components/tasks/TaskCard.jsx)), task detail/history/review panes under `frontend/src/components/tasks/`.
- No API change expected: docs index/article endpoints stay as-is; this is a
  frontend rendering change over the existing `api.docsIndex()` /
  `api.docsArticle()` contract.

## Success Criteria

1. Every `h2` section in a docs article can be collapsed and expanded by
   clicking (or keyboard-activating) its header; collapsed state hides only
   that section's body, never sibling sections.
2. Collapsed/expanded state is visible at a glance (chevron/arrow icon plus
   `aria-expanded`) and headers are visibly more prominent than body text
   (size, weight, spacing — exact tokens decided in Step 4).
3. Heading order and accessibility stay intact: no skipped heading levels, all
   toggles keyboard-operable with visible focus, `prefers-reduced-motion`
   respected, existing `DocsView heading order` test still passes.
4. Tasks are measurably easier to read: larger/more-spaced body text, clearer
   status labels/colours, and progressive disclosure of secondary details —
   scoped to whichever screens the survey answers confirm (default: task list
   + task details first).
5. `npm run test:unit` and `npm run lint` pass; new behaviour is covered by
   committed frontend tests; docs/changelog updated.

## Approach

Follow "make change easy, then make the change":

- **Phase A (make change easy):** extract a pure, tested "section model" from
  the markdown block list and centralise header styling, so the collapsible
  feature is a small state layer on top of a well-tested seam — not inline
  logic inside the 738-line `MarkdownViewer`.
- **Phase B (make the change):** add opt-in collapsible sections plus
  prominence styling behind a `MarkdownViewer` prop, wire it on in `DocsView`
  only, then do the task-readability pass as a separate, independently
  revertable unit.
- **Big/risky work first:** evidence recovery (missing screenshot, unanswered
  survey) and the section-model spike come before any styling, because they
  decide scope. Styling tokens and task-readability polish come last.

Deliberate non-goals for the first slice: collapsing `h3` sub-sections (survey
Q1 option kept as a follow-up), persisting open/closed state across visits
(survey Q2 "remember" option kept as a follow-up), a generated table of
contents (survey Q3 option kept as a follow-up), backend/API changes, and any
change to raw-markdown output or `parseMarkdownBlocks` line-span contract
(consumed by review UIs via `renderBlockWrapper`).

## Context and evidence

- Current article rendering: `DocsView` fetches markdown and renders
  `<MarkdownViewer content={article} />`. Headings render as plain `h1`–`h6`
  with Tailwind classes (e.g. `h2` = `text-base font-bold … border-b`,
  `h3` = `text-sm font-semibold text-primary`). There is no collapse logic
  anywhere in the viewer today.
- `parseMarkdownBlocks` already produces a typed block list with stable
  `startLine`/`endLine` spans; grouping "everything under an `h2` until the
  next `h2`" is a pure function over that list, which is why Phase A is cheap.
- `MarkdownViewer` is shared (task descriptions, review UIs, docs). Any new
  behaviour MUST be opt-in via props so non-docs consumers render
  byte-identical output by default.
- Survey state: [SURVEY.md](/home/server2/.kainbain/runner-work/kb-e3369ccb-10e9-443f-934b-78c7f8d34583/docs/tasks/e3369ccb-10e9-443f-934b-78c7f8d34583/SURVEY.md) contains 6 grill questions (collapsible
  scope, default open/closed, prominence options, task screens, readability
  options, screen size) but `"answers": {}` — all unanswered. This plan treats
  each as a decision with a recommended default (see Decisions) and a
  confirmation step (Step 0).
- Evidence gaps: the task references `assets/image.png` and
  `idea-20261110-003533.md` in the task folder, but the folder contains only
  `SURVEY.md`. Step 0 recovers or explicitly waives the screenshot.

## Key decisions (survey factored in)

| Survey Q | Recommended default | Why | Confirm in Step 0 |
|---|---|---|---|
| Q1 collapsible scope | Only `h2` section titles | Smallest grouping unit that matches "headers difficult to see and group"; `h3` nesting adds state/anchor complexity for a later slice | Yes |
| Q2 initial state | All sections open, with Expand all / Collapse all | Least disruptive, preserves existing tests, deep-link/anchor and find-in-page behaviour; "remember last state" is a follow-up via localStorage | Yes |
| Q3 prominence | Bolder + larger `h2`, more vertical space, chevron icon | Directly answers "more prominent" with the cheapest tokens; colour/shading and mini-TOC are follow-ups | Yes |
| Q4 task screens | Task list + task details first | Highest-traffic surfaces; history/review follow if survey says so | Yes |
| Q5 readability levers | Spacing/typography + status labels first, then progressive disclosure | Typography and status chips are low-risk CSS/component tweaks; hiding details changes information architecture, so it goes second | Yes |
| Q6 screen size | Desktop-first, verify no mobile regression | Docs/task boards are desktop-heavy; keep responsive behaviour intact | Yes |

If survey answers arrive before Step 3, adopt them over these defaults where
they conflict and note the swap in the implementation notes. If they never
arrive, ship the defaults.

## Steps

### Step 0 — Evidence recovery and scope lock (research, first)

- Try to recover the missing screenshot: check the task tracker attachments,
  ask the requester to re-attach `assets/image.png`, and record what "headers
  difficult to see and group" looks like concretely (which article, which
  viewport).
- Resolve the 6 unanswered survey questions: send the survey link/answers to
  the requester, or hold a 10-minute walkthrough of Q1–Q6 and record answers
  in `SURVEY.md` (append a dated answers block; do not rewrite history).
- If neither the image nor answers arrive within the agreed window, proceed on
  the recommended defaults above and mark them as assumptions in the final
  report.
- Deliverable: scope lock note (one paragraph: which headers collapse, initial
  state, prominence levers, task screens, screen size).
- Validation: scope note reviewed; no code changed.

### Step 1 — Spike: section model over parsed blocks (research, first)

- Timebox: half a day. Write a throwaway (or `/tmp`) probe that imports
  `parseMarkdownBlocks`, feeds it 3–4 real articles from `site-docs/*.md`
  (one short, one long with many `h2`s, one with no `h2`, one with code
  tables/lists between headers), and groups blocks into
  `{ heading, level, blocks[] }` sections.
- Confirm edge cases: content before the first `h2` (keep always visible),
  consecutive `h2`s (empty section), `h1` title handling (never collapsible),
  and that `startLine`/`endLine` spans survive grouping untouched for the
  `renderBlockWrapper` review seam.
- Decide the exact grouping rule (proposed: split on `h2` only; `h1` and
  pre-first-`h2` content stay outside sections).
- Deliverable: spike notes + 2–3 fixture markdown strings promoted into the
  test suite in Step 2.
- Validation: manual run of the probe; no production code changed.

### Step 2 — Make change easy: extract section model + header styles (refactor)

- In `frontend/src/components/common/`, extract a pure helper (proposed:
  `markdownSections.js` with `groupBlocksIntoSections(blocks)`) plus unit
  tests (`markdownSections.test.js`) covering: no-`h2`, pre-`h2` preamble,
  consecutive `h2`s, all block types inside a section, span preservation.
- Centralise the six heading class strings from `MarkdownViewer` into one
  exported map (e.g. `HEADING_STYLES`) so prominence tweaks touch one place;
  keep rendered output byte-identical in this step (existing
  `MarkdownViewer.*.test.jsx` must pass unmodified).
- Add shared docs fixtures (short/long/edge-case markdown) usable by both the
  new unit tests and the later `DocsView` collapse tests.
- Run: `npm run test:frontend`, `npm run lint:frontend`.
- Deliverable: refactor-only diff, no visible behaviour change.

### Step 3 — Make the change: collapsible `h2` sections in docs

- Add opt-in props to `MarkdownViewer` (proposed:
  `collapsibleSections={false}` default, `defaultCollapsed={false}`), so only
  `DocsView` enables them and every other consumer is unaffected.
- Behaviour: each `h2` becomes a toggle control (button semantics,
  `aria-expanded`, chevron icon rotating on state, full header row clickable,
  keyboard operable). Collapsed sections hide body blocks with no layout jump
  beyond the collapse itself; `h1`/preamble never collapse.
- Add Expand all / Collapse all controls in `DocsView` above the article (or
  in the article header row) with clear labels.
- Respect `prefers-reduced-motion` (no animated height when reduced motion is
  set) and keep heading levels unchanged (`h2` stays `h2` — toggle is a button
  inside/around it, not a level change).
- Tests (committed, alongside existing suites):
  - `MarkdownViewer.collapsible.test.jsx`: renders toggles only when opted
    in; click toggles one section; keyboard Enter/Space toggles;
    `aria-expanded` correct; non-opt-in output byte-identical; preamble/`h1`
    never collapsible; empty section safe.
  - `DocsView.test.jsx` additions: expand-all/collapse-all buttons work;
    existing heading-order, routing, filter, and XSS tests still pass.
- Run: `npm run test:frontend`, `npm run lint:frontend`.
- Deliverable: collapsible docs headers behind an explicit opt-in.

### Step 4 — Header prominence styling

- Apply the locked Q3 levers to the centralised heading styles: larger + bolder
  `h2` (proposed: step up one type size, semibold→bold), increased
  above/below spacing, chevron affordance from Step 3, and a subtle
  bottom-border or background treatment consistent with the existing theme
  tokens (no new palette; reuse `--accent`/surface tokens).
- Check contrast against `frontend/src/theme/*` contrast tests and the global
  focus-visible ring; verify the sidebar `h2` avenue labels
  (`text-[10px] uppercase`) still read as navigation, not article headers.
- Capture before/after headless screenshots of 2–3 representative articles via
  `npm run capture:screenshot` (no long-lived dev server) and attach to the
  task for visual review.
- Run: `npm run test:frontend` (contrast tests included),
  `npm run capture:screenshot`.
- Deliverable: prominence styling + screenshot evidence.

### Step 5 — Task readability pass (separate, revertable unit)

- Sub-step 5a (typography + status): audit `TaskCard`, `TaskDetailsTab*`,
  history and review panes for body text size, line-height, and spacing;
  standardise on the existing type scale (no new scale); make status labels
  clearer (consistent chip component, colour + text, not colour alone for
  a11y). Cover with component tests asserting the new classes/labels.
- Sub-step 5b (progressive disclosure): hide secondary details (long metadata,
  raw timestamps, verbose history rows) behind "Show more" disclosures on the
  agreed screens only; key facts (title, status, stage, owner/next action)
  stay visible. Each disclosure needs `aria-expanded` and a committed test.
- Keep each sub-step independently revertable; do not mix with docs-header
  changes in one diff.
- Run: `npm run test:frontend`, `npm run lint:frontend`, plus targeted
  `capture:screenshot` for the touched screens.
- Deliverable: readability improvements scoped to survey-confirmed screens.

### Step 6 — Documentation and changelog

- Update the relevant `site-docs/*.md` authoring notes if header conventions
  changed (e.g. "use `h2` for collapsible sections"), add a short paragraph to
  the user-facing docs about collapsing sections, and add a `CHANGELOG.md`
  entry.
- Record final decisions (survey answers or defaults used), file inventory of
  changed components/tests, and follow-ups (persist state, `h3` nesting,
  mini-TOC) in the task folder.
- Run: `npm run docs:check` (link + example checks).
- Deliverable: docs + changelog diff.

### Step 7 — Full verification and handoff

- Run the primary gates crisp: `npm run test:unit` (api + frontend),
  `npm run lint`, `npm run docs:check`, and the frontend contrast/a11y suites.
- Re-run the Step 0 scope note as an acceptance checklist against the built UI
  (headless screenshots, not a persistent server); verify keyboard-only
  operation of every new toggle and disclosure.
- Hand off: link screenshots, test output, changed files, and known follow-ups;
  flag anything left red or skipped explicitly (nothing ships red).

## Validation plan (per-step evidence)

| Step | Command / check | Expected evidence |
|---|---|---|
| 0 | Read `SURVEY.md` answers block; view recovered image | Scope lock note; or explicit "proceeding on defaults" record |
| 1 | Throwaway probe over `site-docs/*.md` | Grouping rule confirmed; edge cases listed |
| 2 | `npm run test:frontend`, `npm run lint:frontend` | All green, no snapshot/output change |
| 3 | `npm run test:frontend` incl. new `*.collapsible.test.jsx` + `DocsView` additions | New tests green; old tests unmodified and green |
| 4 | Contrast/a11y suites + `npm run capture:screenshot` | No contrast regressions; before/after screenshots attached |
| 5 | `npm run test:frontend`, screenshots of task screens | Component tests green; visual diff attached |
| 6 | `npm run docs:check` | Link/example checks green |
| 7 | `npm run test:unit`, `npm run lint` | Full gates green; acceptance checklist signed off |

Manual checks that cannot be automated: keyboard-only toggle operation, screen
reader announcement of `aria-expanded`, reduced-motion behaviour, and the
requester's visual sign-off on prominence/readability.

## Risks and open questions

- **Survey unanswered + screenshot missing:** mitigated by Step 0 timebox and
  documented defaults; risk is rework if answers contradict defaults — kept
  small by scoping Step 3 to `h2`-only with an opt-in prop.
- **Shared-viewer blast radius:** mitigated by opt-in props and byte-identical
  default output; risk is a review-UI regression via `renderBlockWrapper` —
  mitigated by span-preservation tests in Step 2.
- **Heading-order/a11y regressions:** mitigated by keeping real heading levels
  and extending the existing heading-order test; contrast suites guard the
  styling step.
- **Scope creep into task IA:** mitigated by splitting 5a/5b and tying screens
  to survey Q4; anything beyond the agreed screens is a follow-up.
- Open questions (all resolve in Step 0): Q1–Q6 answers; location of the
  original screenshot; whether "remember open state" is needed for v1.

## Follow-ups (out of scope for v1)

- Persist per-article collapse state (localStorage) if Q2 asks for "remember".
- Nested `h3` collapsing if Q1 asks for sub-titles.
- Mini table-of-contents / section list at top of article if Q3 asks for it.
- Colour/shaded header backgrounds beyond the subtle v1 treatment.
