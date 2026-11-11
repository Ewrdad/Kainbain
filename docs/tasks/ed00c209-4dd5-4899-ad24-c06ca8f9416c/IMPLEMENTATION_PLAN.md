# Implementation Plan — Bottom "Now Playing" bar live updates

## Goal

Make the bottom Now Playing bar (runner boxes with per-runner active task + stage, and the queue-depth chip) update live as work progresses, so users can use it to monitor execution without a full page refresh — while keeping extra server load small and bounded.

## Success Criteria

- A task switching stages updates the corresponding runner box's stage label within the agreed freshness bound with no page refresh.
- The queue chip count tracks tasks waiting for pickup within the same bound (create, complete, advance, pause, resume paths).
- Runner roster changes (busy/idle, new/removed runner) appear within the same bound.
- Foreground polling/request budget is documented and enforced by a test; background-tab load does not increase (polls pause or slow when hidden, with catch-up on return).
- `npm run test:unit` passes; the existing canary overlap gate for the bar (button-vs-rail rect checks at 640px+) still passes.

## Context — what we verified in the repo

- Bar component: `frontend/src/components/layout/NowPlayingBar.jsx`. Runner boxes come from `useNowPlayingRunnerDirectory` (polls `GET /runners/monitor` + `GET /runners` every 5s, ungated by tab visibility). Queue depth comes from `resolveUniversalNowPlaying` (`frontend/src/components/layout/activeTaskVisibility.js`), which prefers `engineState.openQueueDepth` and falls back to the loaded task list.
- The orchestrator canvas looks live because `TASK_UPDATED` WebSocket frames merge instantly (`upsertTask`) plus a 150ms-coalesced list refetch (`frontend/src/context/useTaskBoard.js`, `useBoardSync.js` with 8s foreground safety poll + visibility/focus catch-up).
- Suspected root causes (to confirm with repro tests in Step 0, all read directly from current code):
  1. The bar's runner poll has a no-op guard whose key compares only runner-id lists (`NowPlayingBar.jsx`, `useNowPlayingRunnerDirectory`). An assignment whose stage/task/paused fields change but whose runner set is identical produces the same key, so `setMonitor` never fires and the box keeps the old stage. Additionally `stageNameFor` prefers the (stale) assignment `stageId` over the fresh `task.currentStageId` from the live task list.
  2. `engineState.openQueueDepth` is recomputed inside `resolveEngineState` (`api/work/resolveEngineState.js`) but only reaches the client on `ENGINE_STATE` broadcasts, which fire from `setEngineState` (`api/work/setEngineState.js`) on engine ownership/status transitions — not on every queue-affecting event (create/complete/advance of non-owner tasks). `TASK_UPDATED` frames do not touch `engineState`. So the chip goes stale until a refresh (`fetchHistory` → `engineStatus()`).
  3. There is no WebSocket event for runner assignments; the fleet monitor is poll-only. The bar and `PerRunnerTasksWidget` (`frontend/src/components/observability/widgets/PerRunnerTasksWidget.jsx`, `useRunnerMonitor`, also 5s, also visibility-ungated) poll the same endpoints independently, so two pollers run when both surfaces are mounted.
- Client caches: `GET /status` and observability reads share a 5s TTL cache (`frontend/src/services/client/cache.js`).

## Survey factor-in (`SURVEY.md`)

The grill survey in this folder asks four questions; `answers` is currently empty and the referenced `idea-20261111-080435.md` file is not present in the folder. The plan therefore carries survey-derived defaults as explicit assumptions and keeps each one cheap to change (single constant or single branch):

- q1 (freshness target) → assume **near-live: every 5s or better in the foreground** (matches the existing 5s fleet cadence and 8s board safety net; stage/queue changes pushed over WS where feasible so typical latency is sub-second). If the user answers "relaxed (60s)", drop the WS work and lengthen the safety polls instead.
- q2 (what matters most) → assume **stage of each running task + queue number first, runner busy/idle second, names/titles last**. Work order below reflects this (Steps 5–6 fix stage + queue first; runner WS events in Step 7 are optional).
- q3 (load trade-off) → assume **small extra load is acceptable, but bounded and tested** (Step 9 perf-budget test; background-tab pausing in Step 8).
- q4 (background tabs) → assume **pause in background, catch up on return** (matches the existing `useBoardSync`/`useEngineStatus` visibility pattern). If the user answers "keep updating", keep a slow background cadence (e.g. 30–60s) instead of pausing.

Open question for the task owner: confirm or correct these four assumptions before Step 6 (they only change constants and the Step 8 branch, not the architecture).

## Approach

"Make change easy, then make the change": first consolidate the two fleet pollers and centralise cadences behind tested seams with zero behaviour change (Steps 3–4), then fix freshness in smallest-first order: a frontend-only no-op-key fix (Step 5), queue-depth propagation (Step 6, the one step that may touch the backend), optional runner WS events (Step 7), visibility gating (Step 8). Research and the highest-risk backend decision come first (Steps 1–2).

## Steps

### Step 0 — Baseline repro (research, no behaviour change)

- Add a failing-first frontend test (fake timers) proving the reported bug: render `NowPlayingBar` with a runner assignment on stage A, then deliver a `TASK_UPDATED`-equivalent task update moving the task to stage B plus a changed `/runners/monitor` payload with the same runner ids; assert the box still shows stage A (bug) — this test flips to green in Step 5.
- Add a second repro: `engineState.openQueueDepth` stale while the waiting set changes; assert the chip does not move (bug) — flips green in Step 6.
- Count the current request budget per surface per minute (bar 5s × 2 endpoints, widget 5s × 2, board 8s, health 30s, queue popup 15s) and record it in the plan's test file as the baseline the perf budget must not regress without sign-off.

### Step 1 — Backend broadcast audit (research, decides Step 6)

- Enumerate every backend path that changes the waiting set (`isWaitingForPickup`) or an assignment's stage, and note which ones already call `setEngineState` (owner stage re-point exists in `api/flow/stageTransitions.js`) versus `TASK_UPDATED`-only paths.
- Measure `countOpenTasksGlobal` + `resolveEngineState` cost to confirm broadcast-time recompute is cheap enough to call more often.
- Decision output: exact list of call sites that will emit the queue-depth signal in Step 6, plus a coalescing rule (recommended: trailing 500ms–1s coalesce so stage-advance bursts emit once).

### Step 2 — Freshness + perf budget decision (small, unblocks Steps 5–8)

- Confirm the four survey assumptions above with the task owner (or proceed on defaults and note it).
- Write the budget down: foreground cadences per surface, background behaviour, and the max-requests-per-minute assertion Step 9 will enforce.

### Step 3 — Make change easy: one shared fleet hook (refactor, no behaviour change)

- Extract a single `useFleetDirectory`-style hook (or lift `useRunnerMonitor`) shared by `NowPlayingBar` and `PerRunnerTasksWidget`, preserving the existing override-injection pattern (`assignmentsOverride`/`registryOverride`) so current tests keep working.
- Dedupe: when both surfaces mount, exactly one poller issues the fleet reads (shared module-level subscription or lifted context; in-flight promise sharing already exists for cached endpoints — extend the idea, do not fork it).
- Keep the 5s cadence and the no-op guard behaviour identical in this step; existing tests must pass unmodified (apart from import moves).

### Step 4 — Make change easy: centralise cadences + polling seams (refactor, no behaviour change)

- Move all bar/queue/fleet cadences (5s fleet, 15s queue popup, 8s board safety net stays where it is) into one documented constants module with a rationale comment per value, so Step 8 and future tuning change one place.
- Ensure each poller takes its cadence as an injectable arg (fake-timer tests already rely on this shape) and that visibility gating (Step 8) has a single helper (reuse the `document.visibilityState !== 'hidden'` + focus-listener pattern from `useBoardSync`).

### Step 5 — Fix runner-box stage staleness (frontend-only behaviour change)

- Fix the no-op key to cover assignment content that the boxes render (at minimum `stageId`/`stageName`/`taskId`/`paused`/`lastSeenAt` per runner), so a stage switch with an unchanged roster triggers a re-render. Keep the no-render-on-identical-poll property (the `act()`-warning protection the current ref exists for).
- Re-examine `stageNameFor` precedence (stale assignment `stageId` currently wins over fresh `task.currentStageId`): only change it if Step 0's repro shows the key fix alone is insufficient, because cross-pipeline boxes rely on assignment-side names. Any precedence change needs a dedicated test for the cross-pipeline case.
- Step 0 repro test #1 goes green here.

### Step 6 — Fix queue-depth staleness (backend + frontend behaviour change)

- Recommended: backend emits a queue-depth signal on the call sites listed in Step 1 — either reuse `setEngineState` (full snapshot, `openQueueDepth` recomputed) where an engine write is already happening, or add a lightweight coalesced broadcast carrying just the recomputed depth. Frontend merges it into `engineState` (full `ENGINE_STATE` replace path already exists in `wsMessageDispatch.js`; a depth-only frame needs a small merge reducer + test).
- Fallback if backend broadcast proves too chatty: frontend refreshes `engineStatus()` on `TASK_UPDATED`/observability invalidation (debounced, reusing the 5s TTL cache) plus a visibility-gated safety poll. Pick one; do not ship both mechanisms unsynchronised.
- Alternatives rejected: shortening blind polling below 5s (load without Storm-safety, still stale between ticks); deriving depth from the loaded list only (wrong — it is just the active project's slice, the snapshot is global by design).
- Step 0 repro test #2 goes green here.

### Step 7 — Runner assignment events over WS (optional, only if budget allows)

- If Steps 5–6 leave headroom in the Step 2 budget and 5s poll latency still feels stale, add a `RUNNER_ASSIGNMENT`-style frame on claim/release/stage-change and have the shared hook from Step 3 merge it, keeping the 5s visibility-gated poll as the safety net (same pattern as board sync: WS for immediacy, poll for repair).
- Explicitly out of scope if the owner answers q1 "relaxed": the Step 5 fix + 5s poll already meets a 60s bound.

### Step 8 — Background-tab behaviour + visibility gating

- Gate the bar's fleet poll (and any Step 6 safety poll) on visibility, with immediate catch-up on `visibilitychange`/`focus` — the exact `useBoardSync` pattern. Default per survey assumption: pause when hidden.
- If the owner answers q4 "keep updating", use a slow background cadence instead of a full pause.

### Step 9 — Perf-budget enforcement + docs (assurance, see below)

- Add the automated budget test and update user/dev docs (details in Validation and Documentation plans).

## Validation Plan

- Primary gate: `npm run test:unit` (runs API + frontend suites). Focused runs during development:
  - `npm run test --prefix frontend -- NowPlayingBar activeTaskVisibility useScheduledQueue` for bar/queue selector work.
  - `npm run test --prefix api -- engineStateSnapshot resolveEngineState stageTransitions` for Step 6 backend work.
- New tests (all committed beside the code they cover):
  - Step 0/5: fake-timer test that a stage switch with unchanged roster updates the box; identical-poll-renders-nothing test (no `act()` warnings).
  - Step 6: backend test that each newly-wired transition emits the depth signal with the recomputed count; frontend test that the frame updates the chip without a full refetch; coalescing test (burst → single emission).
  - Step 8: hidden-tab test (timers advance, no fetch) + focus-catch-up test.
  - Step 9: perf-budget test asserting requests/minute per surface stay within the Step 2 budget in foreground and background (mocked `api`, fake timers).
- Regression: existing `NowPlayingBar.test.jsx` suite, `activeTaskVisibility.test.js`, canary overlap gate (`canary-e2e/tests/functional.spec.js` bar geometry checks) — run the canary suite if touched surfaces overlap it.
- Visual check without long-lived servers: `npm run capture:screenshot` for the bar in idle/running/multi-runner states, or existing mock fixtures in headless test runners, per the task's testing guidance.
- Manual live-monitor check (one session, real backend): start two runners, advance a task through two stages, complete a queued task; watch box stage + queue chip update with no refresh; background the tab 1 minute, return, confirm catch-up and no error toasts.
- Highest-risk validation: the Step 6 coalesced broadcast — verify under a rapid stage-advance burst that the chip settles on the correct count exactly once per burst and that `ENGINE_STATE` full-snapshot consumers (badge, owner naming) see no partial frames.

## Documentation Plan

- Update the `NowPlayingBar` MARK docs (`MARK: NowPlayingBar`, `MARK: queueDepth`, `MARK: useNowPlayingRunnerDirectory`) to describe the new freshness mechanism and cadences.
- Update/extend the `useRunnerMonitor` MARK block (or its Step 3 successor) with the single-poller contract.
- Record the freshness budget + background behaviour in the appropriate user-facing spot (System Guide / monitor docs) so "live monitor" expectations are explicit, including the survey answers once given.
- CHANGELOG entry describing the behaviour change (bar + queue chip now live; background-tab policy).

## Risks / Open Questions

- Survey answers are empty and `idea-20261111-080435.md` is missing from the task folder — proceeding on the stated defaults; confirm q1–q4 before Step 6.
- Backend broadcast frequency: emitting on every task mutation could be chatty under sweeps/bursts — mitigated by the Step 1 audit + Step 6 coalescing + Step 9 budget test.
- Cross-pipeline box naming depends on assignment-side stage names; Step 5 precedence changes must not break it — covered by the dedicated test.
- Non-goals: elapsed timers, health traffic lights, percentage bars, global transport controls (all previously removed by decision — do not reintroduce); phone-viewport queue chip (excluded by the canary geometry decision); changing queue dispatch order itself.
- Rollback: Steps 5 and 8 are frontend-only and revert cleanly; Step 6 backend emission can be feature-flagged or reverted to the refresh-fallback without frontend changes if the frame contract is additive.
