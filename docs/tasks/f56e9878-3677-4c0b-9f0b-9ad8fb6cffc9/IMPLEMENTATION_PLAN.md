# Implementation Plan — Task inspector overlaps the toolbar instead of squishing it

Task ID: `f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9`
Working directory: `/home/server2/.kainbain/runner-work/kb-f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9`
Source decision: `docs/tasks/f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9/idea-20261109-220445.md` (human approval: Idea, PASSED)
Survey (authoritative): `docs/tasks/f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9/SURVEY.md`
Screenshot: `docs/tasks/f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9/assets/image.png`

This document is the plan only. No code changes are made by this stage.

Evidence note: at plan time the local branch `kb/f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9`
sits at the main tip and the task directory exists only on
`origin/kb/f56e9878-3677-4c0b-9f0b-9ad8fb6cffc9` (commit `8d05ac6`). The survey
text and screenshot cited below were recovered from that commit
(`git show 8d05ac6:...`). If a later stage syncs the branch, re-verify the
survey answers: at plan time `"answers": {}` (unanswered), so §0 records
recommended defaults derived from the task text rather than answered choices.

---

## 0. Survey decisions applied (authoritative over raw wording)

The survey (`SURVEY.md`, Round 1, stage `question-me`) asks four questions. It
is unanswered, so each row below adopts the task author's stated intent as the
default and names the rejected survey options as considered alternatives. A
human reviewer can flip any row to another listed option without invalidating
the rest of the plan.

| Survey question | Adopted answer (default) | Implementation consequence |
|---|---|---|
| Q1 — what should happen to the top area when a task opens | Task panel slides over the top area — search keeps its normal size underneath | Desktop inspector becomes a true overlay (out of flow). The toolbar keeps full-width sizing. Rejects "keep side by side, just less squish" and "hide sort/show-completed while open". |
| Q2 — which parts may the open task cover | The whole top area including the search — coverage from the right edge, incidental not explicit | No control is explicitly hidden or removed. The right-anchored panel covers whatever is beneath it; on wide screens the left-anchored search stays visible naturally. Rejects "search must stay visible" (would need layout coupling) and "narrower panel" (contradicts reclaiming task space). The existing 80px canvas margin (`VIEWPORT_MARGIN`) still guarantees reachable board. |
| Q3 — narrow/small screens | Unchanged: task already goes full-screen overlay below `md` | Mobile (`fixed inset-0`) is already the requested behavior, so this change is desktop-only. No new stacking/scrolling mode. |
| Q4 — how to get the top area back (optional) | Unchanged: X button + Escape (already implemented); no click-outside, no backdrop | Preserves the existing non-modal "integrated slide-over" contract: the visible board stays interactive (scroll, click another card to switch selection). Adding a backdrop would be a behavior change the task text does not ask for. |

Task-text intent honored: "have the search level bar static and let the task
bar cover things up (The togglings and show completed arent essential to have
on screen always)". "Static" is read as "keeps its size/position" (no squish),
not "always visible above the panel".

---

## 1. Goals and non-goals

### Goals

1. Opening a task on desktop (`>= 768px`) no longer shrinks the board: the
   toolbar (workflow switcher, search, sort, show-completed) keeps the same
   width and wrapping as with no task open.
2. The desktop inspector renders as an overlay anchored to the right edge of
   the orchestrator row, above the canvas (`z-50` over toolbar `z-20`),
   covering the board beneath it instead of compressing it.
3. The inspector reclaims task space: same persisted widths (min 320, default
   560, max 2000, 80px viewport margin), same resize splitter (pointer, touch,
   keyboard, double-click reset), same tab content.
4. Preserved contracts: Now Playing footer reservation (panel ends above the
   72px footer, §4 D4), focus trap + Escape-to-close, glasses viewport keeps
   the inspector closed, mobile overlay pixel-identical.
5. The one existing test encoding the old in-flow desktop contract is updated
   to the new contract (§4 D5), and a regression test proves the toolbar no
   longer squishes.
6. `npm run test:unit` and `npm run lint:frontend` pass; component docblocks
   describe the overlay layout.

### Non-goals

1. No backdrop, scrim, or click-outside-to-close (survey Q4 default; would make
   the panel modal and block board interaction).
2. No explicit hiding/collapsing of toolbar controls while a task is open
   (rejected survey Q1 option 3; coverage is incidental).
3. No mobile layout change (already a full overlay).
4. No width default/min/max changes, no Now Playing bar changes, no full-page
   task view (`TaskDetailPage`) changes.
5. No new dependencies.

---

## 2. Current behavior and root cause (evidence)

The screenshot (`assets/image.png`) shows the failure: with a task open, the
left board column is compressed — the search box, the "Oldest first" sort pill,
and the "SHOW COMPLETED" checkbox stack and narrow, and the stage columns
squeeze beside the wide inspector.

Layout chain (all verified by reading the sources):

1. `frontend/src/components/OrchestratorView.jsx:52` renders a flex row
   (`flex-1 flex h-full overflow-hidden relative`): main canvas column
   (`flex-1`, holding `WorkflowCanvas` + `NowPlayingBar`) with the inspector as
   its next flex sibling (`:78-87`, mounted when `selectedTask` is set).
2. `frontend/src/components/tasks/TaskDetailOverlayContent.jsx:749` — the
   inspector `<aside>` carries
   `fixed inset-0 z-50 md:relative md:inset-auto md:z-50 w-full md:w-auto md:shrink-0 ...`
   plus an inline `style={{ width: ... }}` (`:743`, persisted 320–2000px).
   `md:relative` + `md:shrink-0` make the panel an **in-flow flex item** on
   desktop, so its width is subtracted from the canvas `flex-1` column. That
   subtraction is the squish: `CanvasToolbar.jsx:87` (`flex flex-wrap ...`)
   reflows into a narrower column and wraps.
3. Mobile is already correct: the base (below `md`) classes are
   `fixed inset-0 z-50 w-full` — a true overlay. The bug is desktop-only.
4. Stacking already favors the fix: toolbar is `z-20` (`CanvasToolbar.jsx:87`),
   inspector is `z-50`, so an out-of-flow desktop panel paints above the
   toolbar with no z-index change.

Already-working machinery the plan reuses (no reinvention):

- Footer reservation (`#footer-overlap`): `bottom-[72px]` /
  `h-[calc(100%-72px)]` (`TaskDetailOverlayContent.jsx:735-753`), tested in
  `TaskDetailOverlay.test.jsx:1150-1164` and
  `canary-e2e/tests/footer-overlay.spec.js`.
- Resize: `useTaskInspectorResize` (pointer/touch/keyboard/reset, 80px
  `VIEWPORT_MARGIN`, dynamic max), tested in
  `TaskDetailOverlay.test.jsx:1289-1342` and
  `canary-e2e/tests/task-inspector.spec.js:120-185`. Drag math uses pointer
  deltas, so it is position-scheme agnostic.
- Focus trap + Escape-to-close (`TaskDetailOverlayContent.jsx:163-208`) —
  already overlay-grade dialog semantics; the change only extends the cases
  where they apply (desktop too).
- Mobile secondary-row collapse (`CanvasToolbar.jsx:97-106`) is untouched.

---

## 3. "Make change easy, then make the change"

Big and research-heavy work comes first (P0–P1). Each phase ends with its
evidence gate; a phase is done only when its gate passes. P0–P1 make no
behavior change.

### Phase P0 — Research + failing repro (no behavior change; the big work first)

1. **Verify the positioning chain end to end.** Confirm the orchestrator row is
   the containing block for an absolutely-positioned panel
   (`OrchestratorView.jsx:52` already carries `relative`), the Now Playing
   footer is viewport-fixed (`footer.fixed`, see
   `canary-e2e/tests/footer-overlay.spec.js:148`), and no ancestor between the
   row and the `<aside>` creates a transform/filter containing block that
   would break `absolute` offsets. Record the chain in the step report.
2. **Prove no other consumer depends on in-flow width.** A repo-wide search for
   `md:relative`, `slide-over`, and `side panel` at plan time found exactly one
   production site (the `<aside>` line cited above) and one test encoding the
   desktop contract (`TaskDetailOverlay.test.jsx:1184`). Re-run that search at
   implementation time and list every hit in the report; any new consumer must
   be handled before P2.
3. **Write the failing regression tests first (red).** Add to
   `frontend/src/components/tasks/TaskDetailOverlay.test.jsx` (or a colocated
   `TaskDetailOverlay.overlay.test.jsx` if the file is unwieldy — keep the
   smallest focused test with the project):
   - desktop tokens: `md:absolute`, `md:right-0`, `md:top-0` present;
     `md:relative`, `md:inset-auto`, `md:shrink-0` absent; `fixed` still
     present as the mobile base and no bare `relative` token (Tailwind emits
     `.relative` after `.fixed`, so a bare token would silently break mobile —
     the existing test comment at `:1167-1176` explains why);
   - footer heights unchanged: `bottom-[72px]` / `h-[calc(100%-72px)]` when
     `footerReserved`, `h-full` otherwise.
   - Add the true bug repro at the `OrchestratorView` level: render with and
     without `selectedTask` and assert the canvas column keeps `flex-1` full
     width (e.g. canvas `getBoundingClientRect().width` identical with the
     inspector open vs closed, or toolbar `scrollWidth <= clientWidth`
     unchanged). This test fails today (panel steals flex space) and passes
     after P2.
4. **Baseline the suites.** Run `npm run test:unit` and record green (or any
   pre-existing failures with names, to distinguish later regressions).

_Gate: new regression tests fail for exactly the expected reason (in-flow
desktop tokens / narrowed canvas); old suite green; positioning chain
documented._

### Phase P1 — Preparatory refactor (no behavior change)

1. **Pin the positioning contract in one place.** Extend the existing
   `MARK: footer reservation contract` comment block
   (`TaskDetailOverlayContent.jsx:735-742`) — or add a sibling
   `MARK: desktop overlay positioning` block — stating: mobile `fixed inset-0`;
   desktop out-of-flow `absolute right-0 top-0` inside the orchestrator row;
   canvas keeps full width; footer math unchanged. Comment-only.
2. **Characterize what must survive.** Verify the existing footer-overlap,
   resize/persist, focus/Escape, and glasses-viewport tests are green and name
   them in the report; add a characterization assertion only where a gap is
   found (expected: none — coverage is already strong).
3. **Stage the visual baseline.** Capture before-screenshots (board with a task
   open at 1280px and 1920px widths) with `npm run capture:screenshot`
   (playwright-backed; install it first if the runner reports "Playwright is
   not available", as it did at plan time) or the canary visual specs
   (`canary-e2e/tests/visual`). Store alongside the step report for the P3
   after-comparison.

_Gate: `npm run test:unit` green; diff is comments/tests/fixtures only
(`git diff --stat` shows no production `.jsx` behavior change)._

### Phase P2 — The change (desktop overlay)

One mechanical edit in
`frontend/src/components/tasks/TaskDetailOverlayContent.jsx:749`:

- Replace the desktop positioning tokens `md:relative md:inset-auto` with
  `md:absolute md:right-0 md:top-0`; drop `md:shrink-0` (meaningless
  out of flow; keep `flex-shrink-0` harmless or remove it with the same edit —
  decide in the report).
- Keep everything else on that line: `fixed inset-0 z-50` mobile base,
  `md:z-50`, `w-full md:w-auto md:max-w-none`, border/shadow/animation, the
  footer height conditional, and the inline persisted `width` style.
- Update the component docblock (`:40-55`): "Anchored as a right-hand side
  panel" becomes "right-anchored overlay panel (absolute on desktop, fixed
  full-screen below `md`), non-modal: the visible board stays interactive".
- Update the focus-trap comment (`:163-168`): dialog semantics now apply on
  desktop too, not "on small screens".
- Update the single old-contract assertion
  (`TaskDetailOverlay.test.jsx:1177-1184`): `md:relative` present becomes the
  P0 overlay-token assertion. This is an intended contract change (§4 D5), not
  a weakened test: the P0 regression test is strictly stronger.

_Gate: P0 red tests turn green; no other test needed modification — any
additional failure is investigated as a real regression, never skipped or
deleted._

### Phase P3 — Follow-through (consistency + docs)

1. **Resize-clamp sanity.** Confirm `VIEWPORT_MARGIN` (80px) and
   `getTaskInspectorDynamicMax` still behave: at max drag the overlay covers
   all but 80px of canvas — reachable board remains. No code change expected;
   if the e2e width test (`task-inspector.spec.js:120-185`) asserts board
   widths that assumed in-flow layout, update the assertion to the overlay
   geometry and say so in the report.
2. **A11y pass.** Non-modal overlay: background stays focusable by design
   (matches pre-change desktop behavior where board and panel coexisted);
   focus trap + Escape already cover keyboard users; re-run the a11y/canary
   specs touching the inspector and record results.
3. **Docs.** Update `OrchestratorView.jsx:77` comment ("Slide-Over" wording
   stays; clarify overlay, not flex sibling). Check
   `docs/UI/DESIGN_SPEC.md` for inspector-layout prose (no hit at plan time —
   re-grep; only touch if it describes the old layout). No other doc changes.
4. **Visual after-check + full gates** (see §5).

_Gate: §5 all green; before/after screenshots show toolbar identical with the
inspector open vs closed, and the panel covering the board's right edge._

---

## 4. Key decisions (with rejected alternatives)

- **D1 — `md:absolute` inside the orchestrator row (recommended).** The row is
  already `relative`, so `md:absolute md:right-0 md:top-0` anchors the panel
  with zero new containing-block plumbing, and the existing
  `h-[calc(100%-72px)]` footer math keeps working against the row height.
  _Rejected: `md:fixed` to the viewport_ — would need header-height top
  offsets and would couple the panel to global chrome it currently ignores.
  _Rejected: keep in-flow with a smaller max width_ — contradicts the goal
  (reclaim task space) and survey Q2's rejected "narrower panel" option.
- **D2 — Non-modal, no backdrop, no click-outside-to-close.** Preserves the
  documented "integrated slide-over ... without a full-screen blocking
  backdrop" contract and keeps board interaction (notably clicking another
  card to switch selection) working. Survey Q4 default.
- **D3 — Incidental coverage, nothing explicitly hidden.** No state, no
  toolbar coupling, no a11y burden of hiding focusable controls. Directly
  implements survey Q1 option 1 + task text.
- **D4 — Footer reservation is inviolable.** The `#footer-overlap` contract
  (panel ends above the 72px footer; footer never covers panel) survives
  unchanged on both breakpoints; its unit + e2e tests must pass unmodified.
- **D5 — The `md:relative` test assertion is updated, not deleted.** That
  assertion (`TaskDetailOverlay.test.jsx:1184`) encodes the exact behavior this
  task removes, so updating it is the contract change under review. The
  replacement assertion is stronger (full overlay-token set + canvas-width
  repro), satisfying "make the change easy then make the change" without
  weakening the suite.

---

## 5. Validation plan (assurance the change was implemented)

Primary gate: `npm run test:unit` (runs the API + frontend vitest suites).
Do not spawn long-lived background servers; use the headless runners below.

### 5.1 Focused unit/integration tests (run after every phase)

```sh
# Inspector + orchestrator suites (fast feedback during P0–P2)
npm run test --prefix frontend -- TaskDetailOverlay OrchestratorView
# Toolbar + canvas suites (must stay green untouched)
npm run test --prefix frontend -- CanvasToolbar WorkflowCanvas
# Full primary gate (P1 and P3 gates)
npm run test:unit
# Static gate
npm run lint:frontend
```

Expected evidence: P0 — new overlay/canvas-width tests fail, everything else
green. P2 — new tests pass, and the only modified existing assertion is the
`md:relative` contract test. P3 — full `test:unit` + lint green with no skips
added.

### 5.2 End-to-end (canary, headless)

```sh
npm run test:canary -- task-inspector footer-overlay
```

- `canary-e2e/tests/task-inspector.spec.js` — splitter drag/keyboard/persist
  must still pass; extend with (or add) an assertion that the toolbar search
  input's bounding width is identical with the inspector open vs closed at a
  desktop viewport (the user-visible bug, automated).
- `canary-e2e/tests/footer-overlay.spec.js` — must pass unmodified (D4).
- If the canary harness needs a served frontend, use its own isolated runner
  (no ad-hoc long-lived servers).

### 5.3 Visual verification (headless only)

- Before (P1) / after (P3) screenshots at 1280px and 1920px via
  `npm run capture:screenshot`, or the existing
  `canary-e2e/tests/visual` specs. Precondition: playwright must be installed
  (plan-time runner reported "Playwright is not available" — install or use
  the canary runner, and record which path was used).
- Pass criteria, judged from pixels: (a) toolbar row with inspector open is
  identical to inspector closed (same search width, no wrap); (b) panel covers
  the board's right edge with its shadow; (c) Now Playing footer fully visible
  below the panel; (d) mobile (< 768px) unchanged.

### 5.4 Manual checklist (only what automation cannot prove)

1. Open a task at 1280px and 1920px: search/sort/show-completed keep size;
   panel overlaps columns on the right.
2. Drag the resize splitter to min and max: panel resizes, 80px of board stays
   reachable, width persists across reload.
3. Escape and X close the panel; focus returns to the originating card.
4. With the panel open, click a visible card in another column: selection
   switches (non-modal preserved).
5. Toggle the Now Playing footer off/on: panel height follows the contract.
6. 390px viewport: full-screen overlay, unchanged from before.

### 5.5 Highest-risk validation step

The `OrchestratorView`-level canvas-width repro (§3 P0.3): jsdom does not do
real flex layout, so a pure-width assertion may be vacuous there. If so, move
that assertion to the canary e2e layer (real Chromium geometry) and keep a
token-level assertion (`md:absolute` set) in vitest. Decide in the P0 report —
do not ship a test that cannot fail.

---

## 6. Documentation plan

1. Component docblocks (in the P2 diff): `TaskDetailOverlayContent.jsx`
   MARK block + focus comment; `OrchestratorView.jsx:77` mount comment.
2. Positioning contract comment (`MARK: desktop overlay positioning`, P1):
   the single place future changes consult before touching inspector layout.
3. `docs/UI/DESIGN_SPEC.md`: re-grep for inspector layout prose at P3; update
   only if it describes the old in-flow layout (no hit at plan time).
4. Step reports: P0 (positioning chain + search hits + red-test output), P2
   (diff + contract-test rationale), P3 (full gates + before/after
   screenshots + manual checklist results).
5. No CHANGELOG entry (repo changelog is release-curated; verify at merge
   time), no new ADRs (layout fix, reversible by reverting one line + test).

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Survey unanswered — adopted Q2/Q4 defaults mismatch the author's real want | Medium | Defaults follow the task text verbatim; §0 table makes each flippable at review; Q4 flip (add backdrop) is a small additive follow-up, not a rewrite. |
| Absolutely-positioned panel mis-anchors if an ancestor gains transform/filter later | Low | P0 verifies the containing-block chain; P1 contract comment warns future editors; e2e geometry test catches regressions. |
| jsdom cannot prove the width fix (§5.5) | Medium | Split evidence: token assertions in vitest, geometry in canary e2e + screenshots. |
| Covered board content still focusable via keyboard (non-modal) | Low (accepted) | Same as pre-change desktop (panel + board coexisted); focus trap + Escape cover keyboard flow; documented in docblock. |
| Playwright unavailable for screenshots | Low | Fallback to canary visual specs; record the path used. |
| Branch missing prior stage files locally (evidence note, top) | Low | Survey/screenshot content pinned in this plan; re-verify answers if the branch syncs. |

Rollback: revert the P2 commit (one line + test + comments); P0 tests are
written to fail on the old code, so a revert is immediately detectable.

---

## 8. Open questions / assumptions

Assumptions (all reversible, all flagged for the review step):

1. Q2 default "whole top area coverable, incidentally" is correct — i.e. the
   author does not need the search input pinned above the panel on narrow
   desktop widths. If review says search must stay visible, the follow-up is a
   `max-width`-aware panel cap, not a redesign.
2. Q4 default "X + Escape only" is correct — no backdrop. If review wants
   click-outside-to-close, add it as a separate change with its own a11y
   review (it alters board interactivity).
3. No design-system token or Tailwind config change is needed (all tokens used
   are stock utilities already in the codebase).

Open questions: none blocking implementation. The only question for a human is
confirming assumptions 1–2 at review time.
