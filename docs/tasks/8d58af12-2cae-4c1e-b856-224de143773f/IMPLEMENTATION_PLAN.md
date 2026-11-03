# Implementation Plan — Runner config page: hide revoked runners + side-panel layout

## Goal

Rework the System Settings › Runners screen (`frontend/src/components/settings/RunnerConfigurationSection.jsx`)
so that:

1. Revoked runners never appear on the page (no roster row, no detail panel, no selection).
2. The layout matches the `untitled-scene.png` sketch: a runner list on the left,
   the selected runner's settings on the right (instead of today's stacked roster-then-detail).
3. Nothing else changes (survey Q7): same data, same actions, same empty message.

Reference images (relative to this task folder):

- Current (broken) state: `assets/image.png`
- Target design: `assets/untitled-scene.png`

## Survey decisions (from `SURVEY.md` — binding)

- Q1: revoked runners are **hidden completely** (no toggle, no separate section).
- Q2: revoked runners are **completely gone** — no settings/detail panel, not even via selection.
- Q3: **side-by-side layout** — left = runner list, right = clicked runner's details.
- Q4: left list shows **active, paused, and "Needs Setup" (pending)** runners.
  Denied was **not** selected — see Open Question O1 below.
- Q5: right side shows **all current settings** (Runner Name, Projects Available/Loaded,
  Harnesses, Master/Worktree folders, Runs CI / Runs merges / Runs Impromptu toggles)
  plus Approve/Deny or Pause/Revoke buttons. Per the Q5 note: Approve/Deny **only**
  for runners needing setup; otherwise just revoke + settings tweaks.
- Q6: keep the existing empty message (`No Runner registrations yet...`).
- Q7: no extra changes (no search/filter/sort, no button-visibility redesign).

## Current state (verified in repo)

- `frontend/src/components/settings/RunnerConfigurationSection.jsx` renders a vertical
  `<ul data-testid="runner-roster">` of **all** runners (including `status === 'revoked'`,
  see `assets/image.png` with 5 REVOKED rows), then the selected runner's detail form
  (`data-testid="runner-detail-<id>"`) **below** the list.
- Selection defaults to `rows[0]` (`setSelectedId`), so a revoked runner can be
  auto-selected and its settings shown — exactly the reported bug.
- Helpers live in `frontend/src/components/settings/runnerConfigHelpers.js`
  (pure, unit-tested in `runnerConfigHelpers.test.js`).
- API surface in `frontend/src/services/runners/index.js`: `getRunners`,
  `approveRunner`/`denyRunner`/`pauseRunner`/`resumeRunner`/`revokeRunner`,
  `getRunnerConfig`/`updateRunnerConfig`. Backend endpoints are unchanged by this work.
- Screen tests: `RunnerConfigurationSection.test.jsx` (~30 cases covering roster,
  approve/deny/revoke/pause/resume, credential, detail form, projects, tools,
  directories, job switches, reload, assignments, badges).

## Approach — make the change easy, then make the change

Do the refactor in two slices so each is small, reviewable, and independently tested:

- **Slice A (make the change easy):** extract pure, unit-testable helpers for
  *which runners are visible* and *which one is selected*, without touching layout.
  This isolates the revoked-hiding rule in `runnerConfigHelpers.js` where it can be
  tested without React.
- **Slice B (make the change):** re-layout roster + detail into a side-by-side
  panel using the Slice A helpers. No logic changes in this slice beyond wiring.

Filtering is **frontend-only**: `GET /runners` keeps returning everything;
the screen filters before render/selection. Rationale: backend records stay intact
for audit/support; no migration, no API contract change, smallest blast radius.

## Steps

### 1. Research: confirm runner statuses and denied-runner handling (up front)

- Grep the backend runner store for every status value a record can carry
  (`pending`, `active`, `denied`, `revoked`, anything else, e.g. expired/unknown).
  Candidate files: `api/` runner store + tests (the `/runners` route handlers).
- Confirm what `GET /runners` returns today for revoked/denied rows and whether any
  other screen (observability widgets, canary suites) depends on revoked rows rendering.
- **Decision out:** resolve Open Question O1 (denied visibility) before Step 2.
- Validation: notes in the plan PR / task thread listing each status and where it renders.

### 2. Slice A — `visibleRunners` + selection helpers in `runnerConfigHelpers.js`

- Add pure helper, e.g. `visibleRunners(runners)` returning only listable runners:
  - Always exclude `status === 'revoked'` (Q1/Q2).
  - Exclude `status === 'denied'` **iff** O1 resolves to hide (recommended default
    per Q4 — denied was not selected; see O1).
  - Keep `active` (incl. `paused`) and `pending`. Unknown statuses: keep visible
    (fail-open) so a future backend status never silently vanishes; log/annotate instead.
- Add pure helper, e.g. `resolveSelectedId(visible, prevId)`:
  keep `prevId` if still visible, else first visible id, else `null`.
- Unit tests in `runnerConfigHelpers.test.js`: revoked excluded, pending/active/paused
  kept, denied per O1, empty in → empty out, unknown status kept, selection fallback
  when the previously selected runner is revoked/filtered out.
- Validation: `npm run test --prefix frontend` (helpers suite green).

### 3. Slice A wiring — use the helpers in `RunnerConfigurationSection.jsx` (no layout change yet)

- In `loadRunners`: `setRunners(visibleRunners(rows))` (or keep raw rows in state and
  derive `const visible = visibleRunners(runners)` at render — prefer deriving at render
  so a mid-session revoke re-filter happens without reload races).
- Selection: `setSelectedId(prev => resolveSelectedId(visible, prev))`.
- Guard the detail panel: if `selected` is null (e.g. all remaining runners revoked),
  render nothing (or the empty message per Step 5), never a revoked record.
- After `mutate(... 'revoke')` + `loadRunners`, the revoked row disappears and selection
  moves to the next visible runner automatically via the resolver.
- Add/adjust screen tests: revoked fixture rows never render a
  `runner-row-<id>` / `runner-detail-<id>`; revoking the selected runner moves selection;
  existing approve/deny/pause/resume tests keep passing unchanged.
- Validation: frontend unit suite green; manual check against mock: revoked rows gone.

### 4. Slice B — side-by-side layout (the `untitled-scene.png` redesign)

- Restructure the section markup (same file, same testids where possible):
  - Container becomes a two-column layout: left column = roster list
    (`data-testid="runner-roster"`), right column = selected runner detail
    (`data-testid="runner-detail-<id>"`). E.g. CSS grid `md:grid-cols-[240px_1fr]`,
    stacking vertically on narrow screens.
  - Left rows show display name + status badge (`Running` / `Needs Setup` /
    `Paused`), matching the sketch; keep existing `runner-select-<id>`,
    `runner-status-<id>`, `runner-paused-<id>` testids.
  - Right panel keeps **all five** detail areas unchanged (name, Projects
    Available/Loaded, Harnesses Available, Master/Worktree directories, job toggles)
    plus Reload and the contextual action buttons.
- Action-button rule per Q5 note (already mostly true — preserve, don't redesign):
  `pending` → Approve/Deny; `denied` (if visible per O1) → Approve/Revoke, no Deny;
  `active` → Pause/Resume + Revoke. Decide whether these buttons live in the left row,
  the right panel, or both; recommendation: **right panel only** (sketch shows a clean
  list; rows stay one-click selectors), keeping the `ml-auto` row buttons removed.
  Keep every `aria-label` (`Approve runner <id>`, etc.) stable so tests/AT survive.
- Keep `pending` count line, scheduler deferral line, credential-once banner,
  error/notice/loading states as-is.
- Validation: existing `RunnerConfigurationSection.test.jsx` passes with minimal edits
  (selectors are testid-based, layout-agnostic); add 1–2 layout tests
  (e.g. roster and detail render side-by-side in a grid container; clicking a left row
  swaps the right panel).

### 5. Empty state (Q6)

- When the **visible** list is empty (no runners at all, or all revoked/denied),
  render the existing `runner-config-empty` message verbatim:
  "No Runner registrations yet. Boot a Runner pointed at this backend and its join
  request will appear here."
- Note: `runners.length === 0` check must use the **visible** count, not the raw fetch
  count, or a backend with only revoked runners shows a blank page.
- Validation: unit test with an all-revoked fixture asserting the empty message
  and zero roster rows.

### 6. Docs

- Update the `RunnerConfigurationSection` component docstring (MARK block):
  roster = visible (non-revoked) registrations; side-by-side layout.
- If any user-facing settings docs describe the Runners tab roster, add one line that
  revoked runners are hidden. Keep it to 1–2 lines; no new docs pages.
- Validation: `npm run docs:check` if docs were touched (root script), else skip.

### 7. Verification & rollout

- Run: `npm run test:frontend` (full suite), `npm run lint --prefix frontend`.
  Backend untouched → no API tests needed, but run `npm run test:api` if the Step 1
  research touched shared helpers.
- Headless UI check per repo guidance: use `npm run capture:screenshot` (do **not**
  spawn long-lived dev servers) with a mocked runner list covering active + paused +
  pending + revoked, attached to the plan PR/stage output.
- Manual click-through checklist: select each left row → right panel swaps; revoke
  active → row vanishes + selection moves; approve pending → credential banner;
  reload; narrow-viewport stacking.
- Rollout: frontend-only, no migration, no flag. Rollback = revert the one component
  (+ helpers). No data loss: revoked records remain in the backend.

## Risks

- **Denied-runner ambiguity (O1)** — Q4 excludes denied from the list, but Q7 says
  "no extra changes" and existing code/tests deliberately support approving denied
  runners. Hiding denied removes that recovery path from the UI. Mitigation: decide
  in Step 1; recommended default is hide-per-Q4, with backend approve endpoint kept.
- **Unknown future statuses** vanishing if the filter is allow-list-only. Mitigation:
  deny-list (`revoked` + decided-denied) with fail-open default.
- **Selection pointing at a filtered runner** after revoke (stale `selectedId`).
  Mitigation: `resolveSelectedId` + null-guard on the detail panel (Steps 2–3).
- **Layout a11y**: side-by-side must keep a sensible tab/DOM order (list then detail)
  and the existing aria labels. Covered by keeping testids/labels and a narrow-screen
  stacked fallback.

## Open questions

- **O1 — Denied runners: hide or keep?** Q4's selected list (active / paused /
  needs-setup) excludes denied, implying hide; but Q1/Q2 and the task title only say
  revoked, Q7 says no extra changes, and tests cover approving denied runners.
  Recommendation: hide denied too (consistent with Q4), keep the backend endpoint.
  Needs operator confirmation in Step 1.
- **O2 — None.** Q3/Q5/Q6 answers are unambiguous; no further questions after
  repo verification. (`None` confirmed post-discovery.)

## Success criteria

- No revoked runner (row, detail, or selection) can appear on the Runners page
  for any fixture: all-revoked, mixed, revoke-during-session.
- Page layout matches `untitled-scene.png`: left runner list, right settings panel
  for the clicked runner, with all five detail areas + contextual actions intact.
- `npm run test:frontend` and frontend lint pass; new tests cover the filter,
  selection fallback, empty state, and panel swap.
- Docs/component comment updated; screenshot evidence attached.
