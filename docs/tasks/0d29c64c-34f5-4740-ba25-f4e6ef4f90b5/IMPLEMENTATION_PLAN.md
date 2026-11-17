# Implementation Plan — Fix Settings Page Overflow (Named Workflows)

## Goal

Fix the text overflow on the Settings page where named-workflow names (and any
sibling content with the same defect) spill outside their bounding boxes, so
every card on the page clips cleanly at any name length and on desktop and
small screens. Follow "make change easy, then make the change": first isolate a
reusable overflow-safe pattern with a reproduction, then apply it everywhere it
is needed.

## Context and Evidence

- Overflow site (verified in source):
  [WorkflowManagementPanel.jsx](/home/server2/.kainbain/runner-work/kb-0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/frontend/src/components/settings/WorkflowManagementPanel.jsx:259)
  renders the workflow name as a bare
  `<span className="font-bold text-sm text-text-high">{wf.name}</span>` with no
  truncation, wrapping, or `min-w-0` constraint, inside a flex header row
  (line 230) that also holds the rename button, Active/Default badges, and the
  Switch / Make Default / Delete buttons (lines 275–315). A long name grows
  the flex item past the `max-w-3xl` card. The stage-pill strip (lines 319–338)
  has the same exposure for long stage names (`stage.name` at line 328).
- Host page:
  [ProjectSettings.jsx](/home/server2/.kainbain/runner-work/kb-0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/frontend/src/components/settings/ProjectSettings.jsx:291)
  mounts the panel under the "Named Workflows" tab; sibling sections
  (Skills, Addresses, form sections) share card styling and must be audited for
  the same defect.
- Existing tests to keep green:
  [ProjectSettings.test.jsx](/home/server2/.kainbain/runner-work/kb-0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/frontend/src/components/settings/ProjectSettings.test.jsx:1041)
  ("switches to Named Workflows sub-tab and manages workflows").
- Verification tooling: `npm run test:unit` (primary gate),
  `npm run test:frontend`, `npm run lint:frontend`,
  `npm run capture:screenshot` for headless visual checks (no long-lived dev
  servers per stage guidance).
- The task screenshot (`assets/image.png`) was not present in the repo, so this
  plan is grounded in the source above instead of the image.

## Survey Input (SURVEY.md) — Status and Assumptions

[SURVEY.md](./SURVEY.md) contains four questions but no recorded answers
(`"answers": {}`). The plan therefore adopts these defaults, each reversible at
implementation time:

| # | Survey question | Assumed answer | Rationale |
|---|---|---|---|
| q1 | Fix scope | All boxes on the Settings page with the same spill-over | Task says "fix it all as much as possible" |
| q2 | Long-name treatment | Truncate with `…` + full name on hover (`title`) / accessible label | Keeps card grid stable; wrapping allowed as fallback if truncation looks cramped |
| q3 | Redesign freedom | Small tidy-up first; redesign the card header only if truncation still looks ugly | Matches "make change easy, then make the change" |
| q4 | Viewports | Both desktop and small screens | Overflow is typically worse on narrow viewports |

If the task owner answers SURVEY.md before implementation, the implementer
adopts those answers over the assumptions above.

## Success Criteria

- No text (workflow name, stage pill, badge, button label) renders outside its
  card border on the Settings → Named Workflows tab at 320px, 768px, and
  1440px widths, with names up to 200 characters including unbroken strings
  (no spaces).
- The full name remains discoverable for truncated text (hover tooltip and an
  accessible name/label).
- All sibling Settings sections with the same card pattern are audited; every
  instance of the defect found there is fixed with the same pattern.
- Existing frontend tests pass; new regression tests for long names pass.
- Headless before/after screenshots show the overflow gone at all three widths.

## Approach

Two phases, in this order:

1. **Make change easy.** Create one reusable overflow-safe pattern (a small
   `TruncatedLabel`-style helper or a shared Tailwind class set: `min-w-0`,
   `truncate`/`overflow-hidden`, `text-ellipsis`, `title` passthrough) plus a
   deterministic reproduction (story/fixture with very long names). Prove the
   pattern fixes the reproduction in isolation.
2. **Make the change.** Apply the pattern to the Named Workflows cards first,
   then to every sibling Settings card with the same defect found in the audit.
   Only if truncation still looks ugly or unworkable (per the task's free
   rein), restructure the card header (e.g. stack name above actions on narrow
   widths) — still reusing the same pattern.

Key decisions:

- **Truncate, don't wrap, by default** (q2 assumption): wrapping long names
  makes card heights unpredictable and can still overflow with unbroken
  strings; truncation with `title` keeps layout stable and names discoverable.
- **Fix the flex container, not just the text**: the root cause is a flex item
  without `min-w-0`/`overflow` constraints, so the fix must constrain the
  container (`min-w-0` on the name wrapper, `flex-1`/`shrink` balance with the
  action buttons), not only style the span.
- **Shared pattern, not per-card ad-hoc classes**: one helper keeps the q1
  "fix it all" scope consistent and reviewable.

## Steps

### Step 0 — Reproduce and measure (research; do first)

- Build a reproduction fixture: Named Workflows tab with workflow names of
  ~60, ~120, and ~200 chars (including a spaceless string), plus long stage
  names, at 320px / 768px / 1440px widths.
- Capture headless before-screenshots with `npm run capture:screenshot` (or
  the existing mock fixtures / isolated headless runner) at each width.
- Record exactly which elements overflow their cards (name span, pills, badges,
  buttons). This list is the fix checklist for Step 3.
- Depends on: nothing. Blocks: Step 1–3.

### Step 1 — Make change easy: reusable truncation pattern + regression test scaffold

- Add one small shared helper (new tiny component or shared class string in
  the settings components area) implementing: `min-w-0` container,
  `truncate` + `title={fullName}`, preserved accessible label.
- Add regression tests alongside the existing settings tests covering: very
  long name, spaceless long name, long stage names, narrow viewport class
  behavior. Tests assert the truncation attributes/classes are present and the
  full name is exposed via `title`/accessible name (jsdom cannot measure
  pixels, so visual proof stays in Step 4).
- Prove the helper fixes the Step 0 reproduction in isolation before touching
  production cards.
- Depends on: Step 0. Blocks: Step 2–3.

### Step 2 — Audit sibling Settings sections (research; do early)

- Audit every Settings section rendering user-controlled text in cards/boxes
  (Skills, Addresses, Aliases, Files & Repos, form sections, badges/pills) for
  the same unconstrained-flex/text pattern.
- Produce a short hit list (file + line + element). Anything on the list joins
  the Step 3 fix; anything clean is noted as checked so q1 "fix it all" is
  demonstrably covered.
- Depends on: Step 0 (shares the reproduction method). Blocks: Step 3.

### Step 3 — Make the change: apply the pattern

- 3a. Named Workflows card header: constrain the name flex item (`min-w-0`,
  `flex-1`), apply the Step 1 helper to `wf.name`, keep rename affordance,
  Active/Default badges, and action buttons reachable without overlap.
- 3b. Stage-pill strip: apply the same pattern to `stage.name` (max-width +
  truncate + `title`).
- 3c. Every Step 2 hit-list item: same pattern, no bespoke variants.
- 3d. Redesign fallback (only if 3a still looks ugly/unworkable): restructure
  the card header (e.g. name row stacked above an actions row; actions wrap
  cleanly on narrow screens). Requires fresh Step 4 screenshots and a note in
  the change summary explaining why truncation was insufficient.
- Depends on: Steps 1–2. Blocks: Step 4.

### Step 4 — Verify and document

- Re-run the Step 0 fixture; capture after-screenshots at all three widths and
  confirm zero overflow.
- Run gates: `npm run test:frontend` (full), `npm run lint:frontend`,
  `npm run test:unit` if backend-adjacent files were touched (not expected).
- Update docs: short note in the task folder or component docs describing the
  shared pattern and where it is applied, so future cards reuse it.
- Depends on: Step 3.

## Validation Plan

| Check | Command / method | Expected evidence |
|---|---|---|
| Regression tests (new) | `npm run test:frontend` incl. new long-name tests | All pass; truncation attrs asserted |
| Existing settings tests | `npm run test:frontend` (ProjectSettings suite) | No regressions |
| Lint | `npm run lint:frontend` | Clean |
| Visual: desktop | `npm run capture:screenshot` at 1440px, before/after | No text outside card borders |
| Visual: tablet | Same at 768px | Same |
| Visual: small screen | Same at 320px | Same; actions usable, not overlapped |
| Accessibility spot-check | Inspect truncated elements | Full name in `title` and accessible name |
| Scope audit | Step 2 hit list dispositioned | Every hit fixed or documented as clean |

Highest-risk validation: the 320px screenshot — narrow widths are where the
flex header (name + badges + three buttons) is most likely to still collide;
if it fails, trigger Step 3d.

## Risks / Open Questions

- **Screenshot unavailable**: `assets/image.png` is not in the repo; the plan
  targets the source-verified overflow instead. If the image shows a different
  panel, re-run Step 0 against that panel.
- **Survey unanswered**: q1–q4 assumptions above stand until the owner answers;
  the riskiest is q2 (truncate vs wrap) — implementation should keep the
  choice to a single helper so flipping it is a one-line change.
- **Non-goals**: backend changes, workflow behavior changes, app-wide
  typography redesign beyond the Settings page (q1 scope stops at Settings
  unless the audit finds a shared component whose fix naturally propagates).
- **Rollback**: purely presentational change; revert the component diff if
  visual checks regress.
