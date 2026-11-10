# Implementation Plan — "Show Completed" must not show a number

Task: `7b69d365-44ba-4942-875a-7fc121e6ab4a`
Target branch: `kb/7b69d365-44ba-4942-875a-7fc121e6ab4a`
Status: plan only — no code changed in this stage.

## Goal

Remove the count from the board's "Show Completed" toggle label entirely.

Today the label reads `Show Completed (N)`. Since the board switched to
lean fetching (completed tasks stay server-side until the toggle is on),
`N` is computed from the tasks already loaded, so it shows `0` when the
toggle is off even when completed tasks exist. That `0` is wrong and
misleading, so the number goes away completely — the label becomes
`Show Completed` with no count in any state.

## Success Criteria

1. The board toolbar renders the toggle label as exactly `Show Completed`
   (no parentheses, no number) whether the toggle is on or off.
2. No `completedCount` value is computed, passed, or rendered anywhere in the
   board toolbar path (no dead prop, no dead selector).
3. Toggle behaviour is otherwise unchanged: on/off still filters completed
   cards, still persists to `localStorage` (`kainbain:showCompleted`), still
   re-fetches with `{ includeCompleted }`, and the tooltip text is unchanged
   unless it mentions the count (it does not).
4. `npm run test:frontend` (and `npm run test:unit` at repo root) pass with
   zero failures; `npm run lint:frontend` passes.
5. No other UI surface loses a count: the observability dashboard KPIs, stage
   badges, and retrospective stats keep their completed counts (they are fed
   by inclusive data sources, not the lean board list).

## Survey input (and evidence gap)

The stage brief asks to factor in the grill-me survey at
`docs/tasks/7b69d365-44ba-4942-875a-7fc121e6ab4a/SURVEY.md` plus
`idea-20261106-183739.md` and `assets/image.png`. At plan time that task
folder did not exist in this checkout (verified: `docs/tasks/` lists 43
other task folders, none matching `7b69d365…`; `git status` clean on the
task branch), so the survey answers and the screenshot could not be read.

Step 0 below recovers that context first. The plan meanwhile assumes the
survey's most likely outcome given the task text — "remove entirely, no
replacement indicator" — and every assumption is marked `ASSUMPTION` so the
implementer can confirm or correct it against `SURVEY.md` once found. If
the survey instead asks for a replacement (e.g. a total fetched lazily, or
"Show Completed" with no count only while off), stop and re-plan: that is a
different change with API work.

## Approach

Follow "make the change easy, then make the change":

- **Phase A (make it easy):** recover the missing survey/image context;
  pin current behaviour with a characterization check; enumerate every
  producer, carrier, and consumer of `completedCount` so the removal is one
  clean cut with no stragglers.
- **Phase B (make the change):** delete the count from the label in
  `CanvasToolbar`, then remove the now-dead `completedCount` prop chain and
  its computation.
- **Phase C (assure it):** update the count-asserting tests to assert the
  new label, run the frontend suite + lint, do one headless visual check of
  the toolbar, and record the change where the repo expects it.

The change is frontend-only. No API, migration, or backend change is needed
because nothing is being replaced — a misleading derived number is deleted.

### Grounded code map (verified by reading the sources)

| Role | Location | Fact |
|---|---|---|
| Render | [CanvasToolbar.jsx](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/CanvasToolbar.jsx:298) | `<span>Show Completed ({completedCount})</span>` inside the checkbox label |
| Prop carrier | [CanvasToolbar.jsx](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/CanvasToolbar.jsx:31) | `completedCount` destructured from props |
| Producer | [useCanvasAnalytics.js](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/hooks/useCanvasAnalytics.js:31) | `activeWorkflowTasks.filter(t => t.status === 'completed').length` |
| Wiring | [WorkflowCanvas.jsx](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/WorkflowCanvas.jsx:296) and :467 | destructures `completedCount` from `useCanvasAnalytics`, passes it to `<CanvasToolbar>` |
| Why 0 | [WorkflowCanvas.jsx](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/WorkflowCanvas.jsx:216) + [useTaskBoard.js](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/context/useTaskBoard.js:35) | lean default: `includeCompleted: readStoredShowCompleted()` (false on first visit); completed tasks are only fetched after the toggle flips, so the pre-toggle count is always 0 |
| Toggle behaviour (keep) | [WorkflowCanvas.toolbar.test.jsx](/home/server2/.kainbain/runner-work/kb-7b69d365-44ba-4942-875a-7fc121e6ab4a/frontend/src/components/workflow/WorkflowCanvas.toolbar.test.jsx:137) | toggle filters cards, refetches with `{ includeCompleted }`, persists/restores via `localStorage` |

### Key decisions

1. **Delete, don't fix, the number.** `ASSUMPTION` (task text is explicit:
   "just removed entirely"). Rejected alternative: fetch a true server-side
   total for the label — that reintroduces the backend cost the lean fetch
   was built to avoid, for a number nobody asked to keep.
2. **Remove the whole `completedCount` chain, not just the interpolation.**
   Leaving the prop/computation in place invites the count to creep back and
   leaves a permanently-0 value that will confuse the next reader. The seam
   (`useCanvasAnalytics`) stays; only its `completedCount` output goes.
3. **Keep every other completed count.** The observability KPI widgets, stage
   badges (`stageAnalytics`), and retrospective stats use inclusive data and
   are out of scope. `ASSUMPTION`, to confirm against `SURVEY.md`.
4. **No label-accessibility change.** The visible text becomes the accessible
   name (`Show Completed`); existing `getByLabelText(/Show Completed/i)`
   queries keep working. No `aria-label` override is needed.

## Steps

### Phase A — Make the change easy (research + seams first)

**Step 0 — Recover the missing survey/image context. (Do first.)**

- Look for `SURVEY.md`, `idea-20261106-183739.md`, and `assets/image.png`
  outside this checkout (task runner attachments, the merge-base commit, or
  the KainBain task view) — they are absent from the branch working tree.
- Read the screenshot to confirm which toggle the report shows (expected:
  the desktop toolbar `Show Completed (0)` label) and read the survey for
  scope answers (entirely removed vs. replaced; tooltip touched or not).
- If the survey contradicts any `ASSUMPTION` in this plan, update the plan
  before touching code. If the survey cannot be found, proceed on the
  assumptions and say so in the delivery summary.

**Step 1 — Enumerate every `completedCount` touchpoint.**

- Search the repo for `completedCount` (known hits: `CanvasToolbar.jsx`,
  `WorkflowCanvas.jsx`, `useCanvasAnalytics.js` + its test,
  `CanvasToolbar.test.jsx`, `CanvasToolbar.collapse.test.jsx`,
  `CanvasToolbar.tagFilter.test.jsx`, `CanvasToolbar.sort.test.jsx`).
- Confirm none of these feeds any other consumer (e.g. no snapshot, story,
  or e2e asserting the count text). Record the final list; it is the
  deletion checklist for Phase B.

**Step 2 — Characterization check (prove the bug before fixing).**

- Run the focused toolbar test file once on the untouched tree and note the
  assertion `screen.getByText('Show Completed (7)')` passing — that is the
  current (wrong-when-lean) behaviour pinned.
- Optionally add nothing yet: this step is observation, not code. It gives
  the implementer a failing-then-passing signal for Step 5.

### Phase B — Make the change

**Step 3 — Remove the count from the label.**

- In `frontend/src/components/workflow/CanvasToolbar.jsx`:
  - Change line 298 to `<span>Show Completed</span>`.
  - Remove the `completedCount` prop from the destructured props (line 31).
- Leave the checkbox, tooltip (`Completed Tasks Archival`), styling, and
  `hidden md:flex` wrapper untouched.

**Step 4 — Remove the now-dead chain.**

- In `frontend/src/components/workflow/WorkflowCanvas.jsx`: stop
  destructuring `completedCount` from `useCanvasAnalytics` (line 296) and
  stop passing `completedCount={completedCount}` to `<CanvasToolbar>`
  (line 467).
- In `frontend/src/components/workflow/hooks/useCanvasAnalytics.js`: remove
  the `completedCount` computation (line 31), its JSDoc mention
  ("completed count" in the `@description`), and the `completedCount` key in
  the return object (line 39). Keep `activeWorkflowTasks`, `stageAnalytics`,
  and `hasActivity` exactly as they are.
- Update the hook's `@example` only if it references the removed key (it
  does not today — verify while editing).

**Step 5 — Update the count-asserting tests (same change, not new scope).**

- `frontend/src/components/workflow/CanvasToolbar.test.jsx`:
  - `baseProps`: drop `completedCount: 3`.
  - Rename `completed toggle shows count and toggles` to
    `completed toggle has no count and toggles`; assert
    `screen.getByText('Show Completed')` (exact match, so a count creeping
    back fails) and `screen.queryByText(/Show Completed \(/)` is null;
    keep the `setShowCompleted(true)` toggle assertion.
- `CanvasToolbar.collapse.test.jsx`, `CanvasToolbar.tagFilter.test.jsx`,
  `CanvasToolbar.sort.test.jsx`: drop the `completedCount` prop from the
  shared props (pure cleanup — those suites do not assert the label).
- `frontend/src/components/workflow/hooks/useCanvasAnalytics.test.js`:
  - Drop the `completedCount` assertions; keep the `activeWorkflowTasks`
    assertions. Rename `completed counting` to something truthful (e.g.
    `active workflow task filtering`) or fold it into the empty-tasks case.
- Do NOT touch `WorkflowCanvas.toolbar.test.jsx` toggle-behaviour tests
  (they query `/Show Completed/i` and are count-agnostic) — they must pass
  unmodified, which proves behaviour preservation.

### Phase C — Assure the change

**Step 6 — Run the verification gates.**

- `npm run test:frontend` (full frontend suite via vitest) — must be green.
- `npm run lint:frontend` — must be green (catches an unused prop left
  behind).
- If time allows, `npm run test:unit` from repo root (api + frontend) as the
  primary gate per the stage's testing guidance.
- Expected signal: the updated tests pass; no other suite references the
  removed label text (a repo-wide search for `Show Completed (` must return
  zero hits afterwards — run it as an explicit check).

**Step 7 — One headless visual confirmation (no long-lived server).**

- Per the stage's testing guidance, do not spawn a dev server. Use the
  repo's headless screenshot tool (`npm run capture:screenshot -- <route>`)
  or the existing `renderWithKainBain` fixture render to confirm the toolbar
  shows `Show Completed` with no number, toggle off and on.
- If the screenshot tool cannot reach the board without a backend, the
  updated exact-match unit test (`getByText('Show Completed')`) is the
  accepted substitute — record which evidence was used.

**Step 8 — Documentation / record-keeping.**

- This plan file (`IMPLEMENTATION_PLAN.md`) stays as the stage artifact.
- No user-docs change is expected (no docs page documents the parenthesised
  count — verify with a quick search of `docs/` and `site-docs/` for
  `Show Completed` during implementation; if a screenshot or doc shows the
  count, update that doc in the same change).
- The implementing stage's summary should note: survey found or not, and
  which visual evidence from Step 7 was produced.

## Validation Plan

| Check | Command / action | Expected evidence |
|---|---|---|
| Focused tests | `npm run test --prefix frontend -- CanvasToolbar useCanvasAnalytics` | all pass, incl. renamed no-count test |
| Full frontend suite | `npm run test:frontend` | 0 failures |
| Lint | `npm run lint:frontend` | clean (no unused vars/props) |
| Primary gate | `npm run test:unit` (repo root) | green |
| No stragglers | repo search for `completedCount` and `Show Completed (` | zero hits in `frontend/src` (tests + code) |
| Behaviour preserved | `WorkflowCanvas.toolbar.test.jsx` unmodified | passes as-is (toggle, refetch scope, persistence) |
| Visual | `npm run capture:screenshot` of board toolbar, toggle off and on | label reads `Show Completed`, no number in either state (or exact-match unit test as substitute, recorded) |
| Docs sweep | search `docs/`, `site-docs/` for `Show Completed` | no stale count references; update if found |

Highest-risk validation: the **no-stragglers search**. The label text is
asserted in several test files and the prop threads through three modules;
a missed reference is the most likely way this small change ships half-done.

## Risks / Open Questions

- **Missing survey/screenshot (open).** The prior-stage reports and the task
  image are absent from this checkout. Step 0 recovers them; all scope
  assumptions above are conditional on that recovery. If the survey scopes
  the fix differently (e.g. keep a count while ON), this plan must be
  revised — do not improvise a hybrid.
- **Scope creep into other counts (risk, mitigated).** `completed` counts
  exist in the observability dashboard, stage badges, and retrospective
  stats. They are explicitly out of scope (see Success Criterion 5); the
  no-stragglers search must be scoped to the toolbar path so it does not
  sweep them up.
- **Mobile toolbar (no risk expected).** The completed toggle lives in the
  `hidden md:flex` desktop row; there is no mobile toggle label to change.
  Confirm during Step 1 that no mobile string duplicates the label.
- **Canary/e2e snapshots (check in Step 1).** If `canary-e2e` snapshots the
  toolbar text, its snapshot needs regenerating; the Step 1 enumeration will
  surface this before any edit.

## Non-goals

- No API or backend change; no new endpoint for a "true total".
- No replacement indicator (badge, tooltip count, title attribute showing a
  number).
- No redesign of the toggle, its tooltip copy, or the lean-fetch behaviour.
- No changes to observability, retrospective, or stage-badge counts.
