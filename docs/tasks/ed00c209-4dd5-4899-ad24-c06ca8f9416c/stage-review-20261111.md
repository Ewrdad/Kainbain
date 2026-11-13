# Stage Review — Bottom "Now Playing" bar live updates (task ed00c209)

Date: 2026-11-11. Reviewer: stage review (PR-review gate). Branch `kb/ed00c209-4dd5-4899-ad24-c06ca8f9416c` vs `main`.
Method: assumed broken, looked for proof it works. Read the full source diff, the plan, the survey,
and both prior assessments; re-ran the tests and linters myself; traced the backend freshness
mechanisms the fix depends on.

Note: `review-plan-20261111-112822.md` named in the stage brief is absent from the task docs folder
(same finding as the two prior assessments). Review proceeded from `IMPLEMENTATION_PLAN.md`,
`SURVEY.md`, and the branch diff itself.

## Verdict: PASS — suitable to integrate

## Does it achieve the goal? Yes

- Runner-box stage staleness (root cause 1): the ids-only no-op key is gone. `buildFleetSnapshotKey`
  covers task/stage/paused/heartbeat/serving per assignment plus registry status, so a stage switch
  with an unchanged roster republishes within one 5s fleet poll. Proven by the Step 0 repro test
  (`NowPlayingBar.test.jsx`: box shows "Idea", task list + monitor move to stage 2, box shows
  "Review" after one 5s tick, no refresh) and the hook-level republish test.
- Queue-chip staleness (root cause 2): `useWebSocket` now schedules a 500ms-debounced
  `GET /status` refresh on every `TASK_UPDATED`/`TASK_DELETED` frame, plus `ENGINE_STATE` replace
  and a 15s visibility-gated safety poll. I verified against the backend that queue-affecting paths
  broadcast task frames (`taskLifecycle.js`, `stageTransitions.js` advance/complete/failback,
  `taskControl.js` pause/resume/abort/steer, `autoApproveSweep`, `autoResumeTask`,
  `parkTaskForSurvey`, `moveToStage`/`createTask`/`deleteTask`). Claim/release paths that broadcast
  no task frame are covered by the 15s safety net — still inside the survey's 15–30s bound.
- Backend stage freshness (the key-fix dependency): `/runners/monitor` derives `stageId` from
  `executionLedger.stageFor(executionId)` (updated on runner progress) with live `taskStore`
  enrichment (`taskStatus`/`taskTitle`/`stageName`); a stage advance completes one execution and
  starts another, so the polled payload changes and the content key moves. `stageNameFor`
  precedence was deliberately left unchanged, per the plan's cross-pipeline caution.
- Survey fit (q1 near-live 15–30s; q2 queue + stage + titles; q3 small extra load OK; q4 pause in
  background): met or beaten — 5s fleet, ~1s queue chip on activity, 15s safety nets, background
  pause + catch-up on all three pollers (each with a dedicated hidden-tab test).

## Did it follow the plan? Yes (via documented allowed options)

- Steps 3–5, 8–9 implemented as planned: shared `useFleetDirectory` poller, central
  `pollingCadences.js`, content-key fix, visibility gating, budget tests.
- Step 6 took the plan's explicit fallback (frontend refresh on task frames + safety poll) instead
  of a backend broadcast — the plan said "pick one; do not ship both". Zero `api/`/`shared/`
  changes confirmed by diff, so no migration, contract, or old-backend risk.
- Step 7 (runner WS frames) not implemented — plan-marked optional. Not needed to meet the bound.

## Code standards / best practices / modifiability / tech debt

- Compliant: descriptive names, no banned jargon, functional/pure core, co-located tests, JSDoc
  with rationale + `@example`, fail-safe degradation (last-good sides, miss-keeps-picture, outage
  guards), in-flight sharing, publish-only-on-change, debounced bursts. No new deps, no config
  changes, API-compatible refactors (`useRunnerMonitor` signature/return unchanged, override
  injection preserved). Cadences live in one module; tuning is a one-constant change.
- No new tech debt of note. Residual edge (not fail-worthy): in the short window where the monitor
  payload is unchanged but the WS task list is already fresh, `stageNameFor` still prefers the
  assignment stage — bounded by the 5s poll and inside the survey bound; inherent to the poll-based
  design the plan chose. Two trivial observations from the standards review (`pattern` wording,
  missing `@example` on two internal helpers consistent with file convention) are non-blocking.

## Docs updated? Yes

- `CHANGELOG.md` entry, `site-docs/pipeline-stages.md` live-monitor contract, `MARK` JSDoc on every
  new/changed mechanism, `SURVEY.md` answers recorded. `update-safety` and `code-standards-review`
  notes present in the task folder.

## Evidence I observed this session (not copied from prior reports)

- Touched suites: 130/130 pass (`NowPlayingBar`, `activeTaskVisibility`, `useScheduledQueue`,
  `useFleetDirectory`, `pollingCadences`, `tabVisibility`, `useWebSocket`).
- Consumer/contract suites: 102 pass (`PerRunnerTasks`, `KainBainContext`, `api.surface`, mobile monitor).
- Full frontend suite: 341 files / 4640 tests, all pass.
- `eslint` on all 15 changed frontend files: clean, exit 0.
- `check-jsdoc-example.mjs`: PASS. `git diff main...HEAD -- api/ shared/`: empty.
- No live app touched: no servers started, no backend writes. Screenshots intentionally skipped —
  the change is behavioral timing with no visual delta, so a screenshot cannot evidence freshness;
  the fake-timer repro tests are the proof. Canary e2e overlap gate not re-run (needs servers);
  bar geometry is untouched and the `overflow-hidden` right-rail contract test passes in-suite.
