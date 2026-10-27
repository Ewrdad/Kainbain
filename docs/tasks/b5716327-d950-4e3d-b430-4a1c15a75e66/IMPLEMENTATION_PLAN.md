# Implementation Plan: Runner boxes in the Now Playing bar

Task folder: `docs/tasks/b5716327-d950-4e3d-b430-4a1c15a75e66/`
Source request: modify the Now Playing bar so that with fewer than 5 runners its left side shows little boxes containing runner name, task name, stage, and a colour health indicator.
Plan scope: planning only — no code is changed in this stage.

## Goal & scope guard

*Replace only the left side of the Now Playing bar* (`frontend/src/components/layout/NowPlayingBar.jsx` `.flex-1 min-w-0` block) with compact per-runner boxes when 1-4 runner entries are present. Each box shows runner name, task name, stage, plus a colour indicator that is never the sole status signal. Zero runners and 5+ runners render the existing single-task view byte-identical to today. Transport centre and right rail (`data-testid="now-playing-right-rail"`) are out of scope. No runner registry backend is built in this slice — boxes derive from data already in `KainBainContext`; a heartbeat backend is a recorded follow-up.

**q8 adjustment:** the engine-wide status badge (IDLE/RUNNING/PAUSED/FAILED/CHECKPOINT/WAITING_HUMAN/INTERRUPTED) and its decorative dot are *kept* as a compact leading chip beside the boxes. They describe the dispatcher as a whole and several existing tests pin them; removing them is deferred to the optional "full replace" decision and is a one-line change if the user chooses it. The per-task title area is what the boxes occupy.

## Inputs and survey position

- Feature request: under 5 runners, left side becomes little boxes with runner name, task name, stage, and some colour indicator of health.
- Grill survey (`SURVEY.md`) is present but `answers` is `{}` — every survey answer below is a provisional default, not a user decision. Re-confirm with the user before locking B1/B2. Round 1 and Round 2 are both factored in.
- Prior reports named in the stage brief (`idea-20261027-171152.md`, `check-for-plan-*.md`) are not present in this checkout; only `SURVEY.md` exists in the task folder. No prior findings could be reused beyond the survey questions themselves.

### Survey factored in — provisional defaults (reversible)

| # | Survey question | Provisional decision | Rationale & how it shapes the plan |
|---|-----------------|----------------------|-------------------------------------|
| q1 | 5+ runners | Keep the current single-task view (no scrolling row, no summary) | The 72px bar cannot fit 5+ boxes without crushing the 4 transport controls. Keeps the invariant simple: `showRunnerBoxes = entries.length > 0 && entries.length < 5`. If the user later picks "scrolling row" or "expandable summary", only B2 changes. |
| q2 | Box contents | Runner name + task name + stage + status word | Covers the request (name/task/stage) plus a text status word so the colour in q3 is never the only signal (WCAG 1.4.1 Use of Colour). Elapsed time is deferred — it would need per-box timers / polling and does not fit the compact box. |
| q3 | Colour meaning | Task state per box: green=running, amber=paused, red=failed, blue=checkpoint/waiting_human, grey=idle/unknown | Only mapping computable from data already in context (`engineState.status`, `task.status`, `isStagePaused`). System health and combined schemes need a health backend that does not exist. |
| q4 | Click behaviour | Open that runner's task in the slide-over inspector via `setSelectedTask(task)` | Reuses the existing click on the active-task title; display-only navigation, no dispatcher mutation. "Switch main view to that runner" would need a runner-centric view that does not exist. |
| q5 | Idle runner (no task) | Greyed-out box labelled `idle` (`opacity` + grey border/dot) | Keeps fleet shape visible; hiding would make the bar flicker as runners go idle. |
| q6 | Long names | Truncate with `…` (`truncate` / `text-overflow: ellipsis`), full value in `title` and tooltip | Only option that protects the transport controls. Wrapping to two lines would grow the bar beyond 72px and overlap the right rail. |
| q7 | What "runner" means | Runner entries are derived **first by a task-level `runnerId`/`runner` field if the data carries one, else grouped by `workflowId` (pipeline/board that owns the work), else one entry per open task. | There is no runner registry backend (confirmed by grep), so the selector must degrade gracefully and stay deterministic. Grouping by workflow keeps boxes aligned with the bar's existing provenance chip and avoids duplicating one pipeline across many tasks; the fallback to one-entry-per-task covers the "each task in the queue" reading. Documented in `selectRunnerEntries` so a later backend swap is one-file. |
| q8 | Keep status badge too | **Keep the global engine status badge and dot beside the boxes.** | The badge encodes dispatcher state (RUNNING/PAUSED/FAILED/…) which is global, not per-runner, and several tests pin its text/classes. Full replacement (boxes only) is recorded as a trivial follow-up if the user decides. |

Threshold rule derived from the request + q1: **1-4 entries → boxes; 0 or >=5 → existing single-task view.**

## Research findings (verified in this checkout — big pieces first)

1. **Bar anatomy — `frontend/src/components/layout/NowPlayingBar.jsx` (~582 lines; verified).** Left side is the `flex-1 min-w-0` block starting at line 254 (`<div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">`, ~lines 254-341): status dot, `Active Task` label, status badge (`IDLE`/`RUNNING`/`CHECKPOINT`/`PAUSED`/`FAILED`/`INTERRUPTED` + stuck-queue chip), clickable task title (`data-testid="now-playing-task-name"` / `"now-playing-idle-hint"`), stage name, task key. Centre is 4 transport buttons (Look Back / Jump to Active / Play-Pause / Skip etc.); right rail starts at line 511 with queue depth + elapsed timer. Only the left container (lines 254-341) is touched; the badge/dot chip stays (q8).

2. **Display contract — `frontend/src/components/layout/activeTaskVisibility.js`.** Exports `resolveActiveTaskDisplay`, `resolveUniversalNowPlaying`, `resolveOwnerTask`, `resolveCandidateTask`. Universal contract: the engine owns a single global queue; the bar never follows `selectedPipeline` / `currentStageId`. Single-active invariant must hold — runner boxes name tasks, they never change engine ownership.

3. **Existing tests & gates.** `frontend/src/components/layout/NowPlayingBar.test.jsx` (jsdom, `renderWithKainBain` from `frontend/src/testUtils.jsx`), `activeTaskVisibility.test.js`, render helper `renderWithKainBain` (context overrides). Canary overlap gate: `canary-e2e/tests/functional.spec.js` + `canary-e2e/tests/now-playing-cross-project.spec.js`. Primary verification gate per stage brief: `npm run test:unit` (`test:api` + `test:frontend`); headless visual via `npm run capture:screenshot`.

4. **No runner domain exists.** Grep for `getRunnerMonitor|runnerMonitor|liveAssignments|RunnerBoxes` returns nothing; `api/flow/` has no runner registry or routes; `frontend/src/components/observability/` has no per-runner widget. Only matches are `agentRunner` / harness runners (unrelated). So there is no `/runners/monitor` endpoint, no polling hook, no freshness helper. Any heartbeat-based health design needs a backend that does not exist yet — explicitly out of scope here. Note: the queue already has `scheduledQueue` (open tasks) which is the closest existing data, and `engineState.openQueueDepth` for the count — boxes should key off those, not invent a new source.

## Approach — make change easy, then make the change

> No backend, no new data fetching in this slice. Derive boxes from data already in `KainBainContext` (tasks + stages + engineState), injected as an optional prop so tests and story states stay deterministic and the bar degrades silently when the prop is absent. A real runner registry / heartbeat backend is recorded as a follow-up, not built now.

Big pieces / research are ordered first (Phase 0 and Phase A) so that later work cannot discover a structural blocker. The bar is split into a seam before any new UI appears, keeping every existing test green at each checkpoint.

## Step-by-step workflow (ordered: big/research early)

### Phase 0 — Research & contract freeze (0.5 day, blocks everything)

1. Freeze the box data shape from context-available fields only: `{ runnerId: string, runnerLabel: string, taskId: string|null, taskTitleFirstLine: string|null, stageName: string|null, statusWord: string, healthClass: string }`. Confirm `stageName` resolves via existing `resolveDisplayedStage(activeTask, stages, engineState)`.
2. Freeze the <5 gate: live runner entry count 1-4 → boxes; else fallback. Idle entries render greyed-out `idle` boxes (q5).
3. Freeze interaction: `<button type="button">` per box, `onClick` → `setSelectedTask(task)` (q4), `aria-label` per box, health dot `aria-hidden`, no nested interactive elements.
4. Freeze runner identity resolution per q7 (runnerId → workflowId → task id) and document it in `selectRunnerEntries`.
5. Confirm truncation rule (q6): `truncate`, `title` attribute = full name, keyboard focusable to reveal tooltip.

Exit: written contract in this file; no code yet.

### Phase A — Make change easy: refactor-only, no behaviour change (1 day)

**A1. Extract the left column seam.**
New `frontend/src/components/layout/NowPlayingBarLeft.jsx` containing the current left view (status dot, badge, clickable title, stage name, task key) with the same props the bar already computes (`activeTask`, `displayedStageName`, `statusBadge`, `badgeClasses`, `dotClasses`, `activeWorkflowLabel`, `onOpenTask`). `NowPlayingBar.jsx` imports it and passes the same values — output byte-identical; snapshot / DOM tests pass unchanged. This is the exact branch point the box view will use.

**A2. Add a pure helper module.**
New `frontend/src/components/layout/runnerBoxUi.js`: status→colour map reusing the bar's badge palette (running `#7bdb85`/green, paused `#ffb77f` amber, failed `error` red, checkpoint `#9acbff` blue, idle/unknown `text-muted` grey), `getRunnerBoxStyle(statusWord)`, truncation helper, and `buildRunnerBoxAriaLabel(entry)`. Unit-test it directly (no DOM needed). Keeps colour logic out of JSX and makes WCAG 1.4.1 auditing trivial.

**A3. Add the optional injection point (feature-flagged dormant).**
`NowPlayingBar` accepts `runnerEntries?: RunnerBoxEntry[]` default `[]` / context-derived via a tiny selector `selectRunnerEntries(tasks, stages, engineState)` following q7. Empty or length >=5 renders `NowPlayingBarLeft`; nothing polls, nothing throws when the prop is absent. Every existing test stays green by default because the prop is absent.

Checkpoint A: `npm run test:frontend` green; `npm run test:unit` green; canary `now-playing-cross-project` green; `npm run capture:screenshot` shows no visual diff.

### Phase B — Make the change: feature (1.5 days)

**B1. New `frontend/src/components/layout/RunnerBox.jsx` (compact box).**
Fixed `min-w-[120px] max-w-[180px]`, `truncate`, `title` tooltip on each text line, `data-testid="runner-box-<runnerId>"`, lines: runner name (bold), task first line via `formatTaskTitleFirstLine`, `Stage: <name>` (or `—` when absent), status word text plus colour border-left / dot. Idle variant: `opacity-60`, grey border, text `idle`. Implemented as `<button type="button">` with `aria-label`; no-task box renders as non-clickable panel (display-only). No nested interactive elements.

**B2. New `frontend/src/components/layout/RunnerBoxesRow.jsx` (row container).**
`role="list"` / `aria-label="Live runners"`, each box in `role="listitem"`, `flex items-center gap-2 min-w-0 overflow-x-auto` (horizontal scroll if needed). `sm:`-and-up only — below `sm` keep the single-task view (already mobile-optimised). `if (entries.length === 0 || entries.length >= 5) return null` so parent falls back. Handles 1-4 boxes.

**B3. Wire `NowPlayingBar.jsx`.**
Compute `entries = runnerEntries ?? selectRunnerEntries(...)`. Compute `showRunnerBoxes = entries.length > 0 && entries.length < 5 && uiPreferences?.showRunnerBoxes !== false`. Replace only the left container: `{showRunnerBoxes ? <RunnerBoxesRow .../> : <NowPlayingBarLeft .../>}` (badge/dot chip remains per q8). Keep centre transport and right rail untouched. Respect a kill switch (`uiPreferences.showRunnerBoxes === false` forces old view) for instant rollback.

Checkpoint B: new unit tests green; bar renders boxes for 2-4 entries, fallback for 0 and 5+; `title` tooltips present; axe colour-contrast clean because status word text accompanies colour.

### Phase C — Harden the bar contract (0.5 day)

**C1. Layout overlap guard.** Re-run the right-rail shrink contract at 640/768/1024/1280px: boxes live in a bounded left container (`flex-1 min-w-0`) and never paint under transport controls. Add/extend `now-playing-runners.spec.js` (or extend `now-playing-cross-project`) seeding 2-4 runners, asserting boxes render with no transport bounding-box overlap; toggle to 5+ and assert fallback; 0 runners → `now-playing-idle-hint` still present.

**C2. Invariant guard.** Confirm single-active invariant still holds (`activeTaskVisibility.test.js` untouched and green) and Skip / Look Forward gating still derives from `resolveUniversalNowPlaying(...).hasNextTask / candidateTask`, not from boxes. Timer and queue-depth chips unchanged.

**C3. Accessibility gate.** Axe / manual check: colour is never the sole status signal (status word present per box), focus ring visible on boxes, `aria-label` per box includes runner + status.

Checkpoint C: full `npm run test:unit` green; canary `functional.spec.js` overlap gate green.

## Assurance plan — how we prove it worked

### Automated tests (primary gate: `npm run test:unit`)

| Suite | What it proves |
|-------|---------------|
| `frontend/src/components/layout/runnerBoxUi.test.js` (new) | Pure status→colour map, truncation helper, aria-label builder — no DOM, fast feedback. |
| `frontend/src/components/layout/RunnerBox.test.jsx` (new) | Renders name/task/stage, colour per status, click calls `onOpenTask`, no-task box is display-only (no click handler), `title` holds full long name, idle grey variant. |
| `frontend/src/components/layout/RunnerBoxesRow.test.jsx` (new) | 1-4 boxes rendered as `role="listitem"`, 5+ returns `null`, 0 returns `null`, correct `data-testid` per entry. |
| `frontend/src/components/layout/NowPlayingBar.test.jsx` (extended, not rewritten) | New block: box mode replaces `now-playing-task-name` (assert absence of old title, presence of `runner-box-*`), 5+ falls back to `now-playing-task-name`, default no-prop run is unchanged (regression guard). Existing tests (queue chip, timer, transport, badge) remain green. |
| `frontend/src/components/layout/activeTaskVisibility.test.js` | Unchanged and green — proves single-active invariant not broken. |
| `npm run test:frontend` (full file) + `npm run test:unit` (api+frontend) | CI gate. Lint clean (`npm run lint` if present). |

### Headless visual / e2e (no long-lived servers)

- `npm run capture:screenshot` of box mode (2 boxes, long names) and fallback mode (5+ boxes) at 1024px — stored as plan artefacts, not committed.
- Canary-e2e: new or extended `now-playing-cross-project.spec.js` seeding 2-4 runners via context overrides / mock fixtures, asserting boxes visible with no transport overlap at 640/768/1024/1280; toggling to 5+ asserts fallback; idle toggle asserts grey idle boxes. Re-run `canary-e2e/tests/functional.spec.js` overlap gate.
- Isolated headless test runner or existing mock fixtures only — do not spawn a long-lived dev server per stage brief.

### Documentation

- Short ADR / `site-docs` note (or `docs/architecture/now-playing.md` if it exists) recording: threshold `<5` → boxes else fallback; colour = task state; heartbeat health awaits a runner backend; interaction = `setSelectedTask`; runner identity resolution per q7; badge retained per q8. This is the durable record beyond this plan file.
- JSDoc `@example` on `RunnerBox`, `RunnerBoxesRow`, `runnerBoxUi` exports so `npm run docs:check` stays green (if the project uses it).
- Inline code comments on the `showRunnerBoxes` branch and the kill switch explaining the fallback.

## Risks and rollback

| Risk | Mitigation |
|------|------------|
| Space crush / overlap with transport | `<5` gate, `sm:`-and-up gating, `truncate` + `title`, fixed `max-w` per box, horizontal scroll confined to left container, canary overlap gate at 4 widths. |
| No backend exists (no runner registry) | Derive from context, optional prop (`runnerEntries`). Feature is dormant (old view) until entries exist — zero risk to existing deployments. |
| Colour-only status signal (a11y) | Status word text always beside colour; dot is `aria-hidden`. |
| Runner identity ambiguity (q7) | Selector prefers an explicit `runnerId`, then `workflowId`, then task id; one-entry-per-task fallback caps at the same <5 gate and degrades cleanly. |
| Survey answers may change | Table of provisional defaults (q1-q8) is reversible; q1/q7/q8 changes are localised to B2/selector/badge chip — no architectural churn. |
| Global badge could feel redundant with per-box colours (q8) | Keep badge now (zero test churn); full-replace is a one-line follow-up documented in the ADR. |

**Rollback:** one flag `uiPreferences.showRunnerBoxes === false` (or omit the prop) restores the old left side. Phase A split means revert is deleting one branch (`showRunnerBoxes ? … : …`) — no scattered changes. Feature flag defaults to `true` only when entries are present.

## Success criteria

- 1-4 runners: left side shows compact boxes with runner name, task name, stage, and state colour that also appears as text. Long names truncate with full value on hover/focus.
- 0 or 5+ runners: view identical to today; all pre-existing `npm run test:unit` tests pass.
- Idle runners show greyed-out `idle` boxes; no visual overlap with transport controls at any tested width.
- Clicking a box opens its task inspector; keyboard focus + `aria-label` works; colour is not the sole signal.
- No change to engine ownership, queue depth, elapsed timer, or transport gating.
- Global engine status badge remains visible beside the boxes (q8 default).

## Open questions (only what the repo cannot answer)

- Survey answers (q1-q8) are empty — defaults above are provisional and reversible. Confirm especially q7 (runner identity) and q8 (badge retention) before implementation.
- No other blockers. Heartbeat/system-health colouring (q3's "system health" option) requires a backend that does not exist; recorded as follow-up in the ADR.

## Estimated effort & sequencing note

Phases 0→A→B→C total ~3-3.5 days. Ordering respects "big pieces early": research/contract and the seam extraction come before any new UI, so structural blockers surface on day 1 rather than mid-feature.

## Done
