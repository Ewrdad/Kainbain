# Implementation Plan — `!running` and `!tasked` column filters

## Goal

Add two new `!` system filters to the board search bar, matching the existing
`!failed` / `!human` UX (type `!…` in the search bar, autocomplete, removable
chips):

- `!running` — only shows columns (stage columns) that contain running tasks.
- `!tasked` — only shows columns that contain tasks.

Constraints from the task: frontend/UI only (no backend effect); columns must
appear/disappear live as tasks move between columns or start/finish, with no
page refresh; non-tag filters keep the `!` prefix convention.

## Success Criteria

1. Typing `!running` / `!tasked` in the UnifiedSearchBar offers autocomplete,
   commits to an amber `!` chip, and filters the board.
2. With `!running` active, only columns containing at least one running task
   are visible; with `!tasked`, only columns containing at least one task.
3. Columns show/hide automatically as tasks change stage or running state over
   the websocket-fed board state — no refresh, no polling.
4. No file under `api/`, `runner/`, or `shared/` (backend-owned) is changed;
   no new endpoint, payload field, or migration.
5. `npm run test:frontend`, `npm run lint:frontend`, and the repo doc checks
   pass; new behavior is covered by committed unit/integration tests.

## Context — how the existing `!` filters work (verified in code)

- Registry: `frontend/src/components/workflow/systemFilters/registry.js` holds
  `SYSTEM_FILTERS` (`failed`, `human`), each `{ id, label, description,
  match(task, stages) }`. The barrel comment states the seam explicitly:
  "Adding a future native filter is one entry in `registry.js` … the parser,
  suggestions, chips, and board filtering all read this registry."
- Parser/suggestions/chips are fully registry-driven and need **no changes**:
  `searchQueryParser.js` (`parseSearchQuery`), `UnifiedSearchBar.jsx`
  (suggestions from `SYSTEM_FILTERS`, chips), `useBoardFilters.js`
  (`derivedSystemFilters`).
- Task filtering: `filterBoardTasksWithTags` in
  `frontend/src/components/workflow/nodeModel.js` applies the completed
  toggle, then stage visibility, then text query, then
  `systemFilterMatches(id, task, stages)` (AND/OR across multiple `!` filters
  follows `tagMode`). Called from
  `useCanvasSearchFilter.js`, which returns `filteredTasks` plus
  `tagRenderEntries` / `visibleStages` / `allStagesHiddenByTags`.
- Column hiding today exists **only for `#` tag filters** via
  `groupStagesByTagFilter` in `stageTagFilter.js` (non-matching runs collapse
  behind `CollapsedStageRunBar`; all-hidden renders the "No stages match the
  selected tags" empty state with a Clear button in `WorkflowCanvas.jsx`).
  `!` filters currently filter **tasks within** columns — they never hide a
  column. Making `!` filters hide columns is therefore a **new filter
  dimension**, not a one-line registry addition. This is the biggest design
  decision in this plan (see Step 1).
- "Running" already has a single source of truth:
  `isTaskRunning(task, engineState, isAgentRunning)` in
  `frontend/src/components/tasks/runningTask.js`. KainBain executes one task
  at a time; the engine owner (`engineState.activeTaskId` while
  `engineState.status === 'running'`) is the lock, and bare `running_*`
  status labels are stale-prone and must NOT be trusted when an engine
  snapshot exists. Any `!running` predicate must reuse this helper, not
  re-implement status sniffing.
- Current registry signature `match(task, stages)` cannot express "running":
  `engineState` / `isAgentRunning` (from `useKainBain()` in `WorkflowCanvas`)
  never reach `systemFilterMatches` or `filterBoardTasksWithTags`. Threading
  that context through is the "make the change easy" refactor (Step 2).
- Live data already flows over websocket-fed context (`tasks`, `engineState`
  in `KainBainContext`); board memos recompute on prop change, so liveness is
  a matter of correct `useMemo` dependencies, not polling.
- Repo conventions that constrain the implementation: one function per file
  (`scripts/check-one-function-per-file.mjs`, cf. `isFailedTask.js` /
  `isHumanTask.js` one-per-file helpers); JSDoc `MARK` blocks on every
  module; `systemFilterMatches` degrades unknown ids / throwing predicates
  to `false` so a bad filter can never wipe the board — new predicates must
  preserve that.

## Survey disposition (SURVEY.md is unanswered)

`SURVEY.md` contains 4 questions with `"answers": {}` — no user answers were
recorded. The plan proceeds on reversible defaults below; each is flagged
`[ASSUMPTION — survey Qn]` at its implementation step so a later survey
answer can flip it with a one-line change plus test updates.

| # | Question | Assumed default | Rationale |
|---|----------|-----------------|-----------|
| Q1 | What counts as "running"? | Only tasks genuinely executing right now (`isTaskRunning`: engine owner under a running engine) | Reuses the single source of truth; "anything unfinished" would just duplicate the show-completed toggle and mislead. Also matches the task text: "keep an eye on where active tasks are". |
| Q2 | Which columns stay visible under `!tasked`? | Columns with any task in the current board task set (i.e. after the completed toggle; default lean fetch ⇒ effectively unfinished, all tasks when show-completed is on) | Self-consistent with what the user can see; avoids showing a column whose only tasks are hidden by the completed toggle. Literal "even finished" and this default differ only when show-completed is on, and then they agree. |
| Q3 | Combining with other words / `!` filters? | AND (narrow down: everything typed must match) | Matches existing pinned behavior: `useCanvasSearchFilter.test.js` asserts "Text ANDs with the system filter". |
| Q4 | Filter matches nothing? | Short message + clear-filter button, reusing the `allStagesHiddenByTags` empty-state pattern | Consistent with the existing tag-filter empty state; "silent empty board" would look like a loading bug. |

## Approach — make the change easy, then make the change

**Make the change easy (Steps 1–3, no user-visible behavior change):**

1. Decide and spike the column-filter seam (research + thin slice first —
   biggest risk).
2. Thread optional engine context through the filter pipeline
   (`systemFilterMatches`, `filterBoardTasksWithTags`) in a backward-
   compatible way; reuse `isTaskRunning`.
3. Extract a pure, unit-testable column-visibility selector that composes
   `#` tag visibility with the new `!` column visibility.

**Make the change (Steps 4–6):** add the two registry entries + one-per-file
helpers, wire the selector into `useCanvasSearchFilter` / `WorkflowCanvas`
with correct memo deps for liveness, extend the empty state, then tests and
docs.

## Steps

### Step 1 — Spike the column-filter seam (research + decision; do first)

**Why first:** this is the only architectural unknown. Everything else is
mechanical once the seam is chosen. Timebox: half a session.

1. Read `filterBoardTasksWithTags` (`nodeModel.js`), `groupStagesByTagFilter`
   (`stageTagFilter.js`), `useCanvasSearchFilter.js` (memos + deps), and the
   `tagRenderEntries` render loop + `allStagesHiddenByTags` branch in
   `WorkflowCanvas.jsx` (~lines 152–158, 563–600).
2. Decide between:
   - **(A, recommended)** Keep one registry; mark column-scoping filters
     with `hidesColumns: true` on the entry. Column visibility = the column
     contains ≥1 task passing that filter's task predicate evaluated over
     the board task set. Task-level filtering inside surviving columns is
     unchanged (existing `!failed`/`!human` semantics preserved).
   - **(B)** Separate column-filter registry/mechanism. More code, two
     sources of truth for `!` tokens; only choose if (A) fights the parser.
3. Spike: hardcode a prototype predicate and prove that `tagRenderEntries`
   composition (tag collapse runs × column-filter hiding) renders sanely,
   including the `#tag` + `!running` combined case (AND per Q3 assumption).
4. Record the decision and the exact composition order in this file before
   proceeding:
   recommended order — tag visibility first (existing), then column-filter
   visibility, then task filtering within surviving columns.

**Validation:** throwaway spike only (no commit); decision note appended to
this plan. No test changes yet.

### Step 1 decision (recorded 2026-11-10, implementer)

- **Seam: option (A).** One registry; column-scoping entries carry
  `hidesColumns: true`. A new `isColumnSystemFilter(id)` helper (one function
  per file, exported from the `systemFilters` barrel) owns that lookup so the
  hook, the selector, and the clear-actions all read one source.
- **Composition order:** column-filter visibility ∩ tag visibility, computed as
  filter-then-group — `groupStagesByTagFilter(stages ∩ columnVisible, tags,
  mode)`. The visible set is identical to tag-first-then-column (intersection
  commutes); filter-then-group reuses the existing grouping untouched in one
  call. Known cosmetic edge: a column-hidden stage sitting between two
  tag-hidden stages lets those two merge into one collapsed bar — truthful
  (every stage in the bar is genuinely tag-hidden), positions stay true
  (render keys/indexes still use the full stage list).
- **Column-hidden stages are omitted** (no collapsed rail) — they carry no
  tasks of interest.
- **`allStagesHiddenByTags` must be recomputed tag-dimension-only** over the
  full stage list (today it reads the final `visibleStages`, which becomes the
  intersection). Sibling flag `allStagesHiddenByColumnFilters` =
  column-filters-active && intersection-empty, so a `#tag` + `!running` mix
  that empties the board via the intersection still gets an empty state
  (Q4: never a silent empty board). Render precedence: tag branch first
  (preserves existing `#`-only tests), column branch second.
- **Mobile pill:** `hiddenStageCount` (stages − visible) counts both
  dimensions; the pill clears both via a new `clearStageVisibilityFilters`
  (prop renamed from `onClearStageTagFilter`), with a dynamic aria-label that
  keeps the legacy "(clears the tag filter)" wording when only tags are
  active so existing pill tests stay green unmodified.

### Step 2 — Thread engine context through the filter pipeline (refactor, no behavior change)

**Goal:** `match` predicates can optionally see engine liveness without
breaking the two existing entries or any caller.

1. Extend `systemFilterMatches(id, task, stages)` with an optional 4th
   argument `ctx` (`{ engineState, isAgentRunning }`), forwarded as the 3rd
   argument to `entry.match(task, stages, ctx)`. Existing 2-arg predicates
   keep working (extra arg ignored); unknown ids / throwing predicates still
   degrade to `false`.
2. Extend `filterBoardTasksWithTags` with an optional `filterCtx` option,
   forwarded to each `systemFilterMatches` call.
3. Add a one-per-file helper module per filter, following the
   `isFailedTask.js` / `isHumanTask.js` pattern:
   - `systemFilters/isRunningTask.js` → wraps `isTaskRunning(task,
     ctx?.engineState, ctx?.isAgentRunning)` (import from
     `../../tasks/runningTask.js`). `[ASSUMPTION — survey Q1]`:
     genuinely-executing only.
   - `systemFilters/isTaskedTask.js` (naming: match registry id `tasked`;
     predicate = "task exists in the board set", i.e. always true for a
     non-null task — the column selector counts tasks per column; see
     Step 3. `[ASSUMPTION — survey Q2]`: evaluated over the
     completed-toggle-filtered board set.)
4. Keep registry entries for `running`/`tasked` OUT in this step (pure
   plumbing; no user-visible change).

**Files:** `systemFilters/systemFilterMatches.js`,
`systemFilters/isSystemFilterToken.js` (untouched, verify only),
`nodeModel.js`, new `systemFilters/isRunningTask.js`,
new `systemFilters/isTaskedTask.js` (or equivalent names), barrel
`systemFilters/index.js` exports.

**Validation:** `npm run test:frontend -- systemFilters` and
`npm run test:frontend -- nodeModel` green; no snapshot changes.

### Step 3 — Extract the column-visibility selector (refactor, no behavior change)

**Goal:** a pure function that answers "which stages survive the active `!`
column filters", unit-testable without rendering.

1. Add `filterVisibleStagesByColumnFilters({ stages, tasks, columnFilterIds,
   filterCtx })` (name TBD in Step 1; lives in `nodeModel.js` next to
   `filterBoardTasksWithTags`, re-exported as needed):
   - Only ids whose registry entry has `hidesColumns: true` participate;
     `failed`/`human` never hide columns (backward compatibility).
   - A stage survives iff ≥1 task in `tasks` with
     `task.currentStageId || task.stageId === stage.id` passes the
     corresponding predicate. Multiple column filters combine per `tagMode`
     semantics already used for `!` filters (OR in `any`, AND in `all`) —
     consistent with Q3 AND default when combined with text (text still ANDs
     at the task level).
   - `tasks` input = the board task set AFTER the completed toggle (Q2
     assumption) — document the choice in the JSDoc.
2. Compose with tags in `useCanvasSearchFilter`: `visibleStages` /
   `tagRenderEntries` = tag grouping ∩ column-filter visibility. Keep
   collapsed-run behavior for tag-hidden stages; column-filter-hidden stages
   are omitted (they carry no tasks of interest, so a collapsed rail would be
   noise — document if Step 1 spike says otherwise).
3. Wire `engineState` + `isAgentRunning` from `WorkflowCanvas` (already in
   scope via `useKainBain()`) into `useCanvasSearchFilter` args and add them
   to the `filteredTasks` / visibility `useMemo` dependency arrays — this is
   the liveness mechanism (websocket updates re-render with no refresh).

**Validation:** new unit tests for the selector (see Validation Plan);
existing `useCanvasSearchFilter.test.js` and `WorkflowCanvas.tagFilter.*`
suites green (proves no regression for `#` tags and task-level `!` filters).

### Step 4 — Register `!running` and `!tasked` (the user-visible change)

1. Add two entries to `DEFAULT_SYSTEM_FILTERS` in
   `systemFilters/registry.js` (order: `failed`, `human`, `running`,
   `tasked` — existing first, new appended to preserve display order):
   - `{ id: 'running', label: 'Running', description: 'Show only columns
     with a task executing right now.', match: (task, stages, ctx) =>
     isRunningTask(task, ctx), hidesColumns: true }`
   - `{ id: 'tasked', label: 'Has tasks', description: 'Show only columns
     that contain tasks.', match: (task) => task != null,
     hidesColumns: true }`
2. No parser/suggestion/chip changes expected (registry-driven) — verify by
   test, not by reading.
3. Update the pinned registry-order test in `systemFilters.test.js`
   (`['failed', 'human']` → `['failed', 'human', 'running', 'tasked']`).

**Validation:** `npm run test:frontend -- systemFilters` green; manual check
via headless suite that `!r…` suggests `running`.

### Step 5 — Empty state + toolbar counts for column filters

1. Extend the `allStagesHiddenByTags` branch in `WorkflowCanvas.jsx` (or add
   a sibling `allStagesHiddenByColumnFilters` branch) to render the Q4
   message, e.g. "No columns match the active filters" with a "Clear filters"
   button that strips the `!` column tokens from `searchQuery` (mirror
   `clearTagFilter`, which already preserves `systemFilters` — add the
   inverse that preserves text + `#` tags).
2. Decide in Step 1 whether `hiddenStageCount` in `CanvasToolbar.jsx`
   ("Hidden (n)") pill) counts column-filter-hidden stages too; recommended
   yes, with the pill clearing both tag and column filters.
3. Mobile: `resolveEffectiveMobileStageId` already parks on the first stage
   with visible tasks — verify it receives the column-filtered stage list so
   the single-column mobile view cannot strand on a hidden column.

**Validation:** `WorkflowCanvas` render tests for the empty state + clear
action (desktop and mobile stage-tab cases).

### Step 6 — Docs + final verification

1. User-facing: add `!running` / `!tasked` wherever `!failed` / `!human` are
   documented for the search bar (search `site-docs/` and in-app help copy,
   e.g. `SystemGuideModal`, glossary, toolbar tooltips/placeholders — the
   placeholder `Search tasks, #tags, or !filters…` needs no change).
2. Code docs: JSDoc `MARK` blocks on every new module (repo convention);
   update the `systemFilters` barrel comment if it enumerates filter ids.
3. Run the full gates (see Validation Plan) and confirm zero backend diff
   (`git status` shows only `frontend/` + docs + this plan).

## Validation Plan

Primary gate: `npm run test:unit` (runs `test:api` + `test:frontend`); the
api suite must pass unchanged (proves no backend effect). Focused suites
during development:

| Step | Command / check | Expected evidence |
|------|-----------------|-------------------|
| 1 | Spike render (throwaway) | Screenshots or test output showing tag × column composition; decision note in this file |
| 2 | `npm run test:frontend -- systemFilters nodeModel` | Green; existing tests unmodified and passing |
| 2–3 | New unit tests: `isRunningTask` (owner+running ⇒ true; stale `running_*` label without ownership ⇒ false; no snapshot ⇒ label trusted — mirrors `runningTask.test.js`); `isTaskedTask`; column selector (empty board, task moves stage, mixed settled/live) | New test files committed next to the modules |
| 3 | `npm run test:frontend -- useCanvasSearchFilter WorkflowCanvas.tagFilter` | Green, no snapshot churn |
| 3 | New hook test: `!running` visibility flips when `engineState` changes with tasks untouched (rerender with new `engineState.activeTaskId`) | Proves no-refresh liveness through the real memo chain |
| 4 | `npm run test:frontend -- UnifiedSearchBar searchQueryParser` | `!running`/`!tasked` parse, suggest (autocomplete on `!r…`/`!t…`), chip, and remove |
| 5 | New `WorkflowCanvas` render tests: all-hidden message + Clear button; mobile tab parks on a surviving column | Committed `.test.jsx` |
| 5 | `npm run capture:screenshot` (only if a visual check is needed) | Headless render of filtered board; no long-lived servers |
| 6 | `npm run lint:frontend`, `npm run docs:check` (or `test:frontend` equivalent per CI), `node scripts/check-one-function-per-file.mjs` if standalone | Zero errors; new modules comply with one-function-per-file + JSDoc conventions |
| 6 | `git status --porcelain` | Only `frontend/**`, `site-docs/**`/help copy, and this plan changed |

Edge cases the tests must pin: unknown `!bogus` still degrades (never wipes
the board); throwing predicate degrades to `false`; `!running` with no engine
snapshot trusts the label (isolated-render fallback, same as `isTaskRunning`
today); `!tasked` with show-completed off hides completed-only columns (Q2
assumption — one test names the assumption so a survey flip is findable);
`!running !failed` combination follows `tagMode` any/all like existing `!`
filters; text + `!running` ANDs.

## Risks / Open Questions

1. **Survey unanswered (Q1–Q4).** Mitigation: reversible defaults above, each
   pinned by a named test; flipping any answer is a one-line predicate/message
   change. If the user answers the survey before implementation, apply answers
   and delete the corresponding assumption flags.
2. **Column-filter × tag-collapse interaction.** A stage hidden by `#tags`
   (collapsed rail) vs hidden by `!running` (omitted) need distinct,
   non-confusing rendering. De-risked by the Step 1 spike before any
   committed code.
3. **`!tasked` vs empty-column noise.** If most columns always have tasks,
   `!tasked` rarely changes the board — acceptable; it is a review aid, and
   `!running` is the high-signal filter.
4. **Stale `running_*` labels.** Mitigated by reusing `isTaskRunning`
   (engine-owner lock) instead of status sniffing; the no-snapshot fallback
   (trust the label) matches every other monitor surface.
5. **Performance.** Column visibility recomputes per render over
   tasks × stages; same order as existing `filteredTasks` memo. No concern
   unless boards exceed thousands of tasks; the memo deps already bound
   recomputation to actual state changes.

## Non-goals

- No backend changes (`api/`, `runner/`, shared backend contracts, new
  websocket fields, migrations).
- No persistence/URL-sync for `!` filters (existing `!` filters are
  session-persisted via `kainbain:board:search` only; `#` tags own URL sync —
  unchanged).
- No new toolbar pills/toggles; the search bar is the only entry point.
- No changes to `!failed` / `!human` task-level semantics.
