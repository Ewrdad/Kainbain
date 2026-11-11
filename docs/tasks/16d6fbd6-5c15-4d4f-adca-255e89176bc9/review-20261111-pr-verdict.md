# PR Review — Central Queue Across Pipelines (16d6fbd6)

**Reviewer:** docs-only PR review stage (2026-11-11)
**Branch:** `kb/16d6fbd6-5c15-4d4f-adca-255e89176bc9` vs `main`
**Scope:** 36 files, +1722 / -148 lines (docs + code + tests + config + frontend)

## Verdict: PASS (with one non-blocking observation)

## What was reviewed

- Previous reports: SURVEY.md, DIAGNOSIS.md, IMPLEMENTATION_PLAN.md, two automated-tests failure reports, code-standards-review-20261111-141600.md
- Code diff: `api/flow/scheduler/centralQueue*.js` (4 new helpers), `api/flow/scheduler/findNextCandidateTask.js`, `api/flow/scheduler/getScheduledQueue.js`, `api/flow/dispatch/scanClaimableTasks.js`, `api/work/taskWorkRoutes.js`, `api/taskStore.js`, `api/config/schema.js`, `.env.example`, `docs/EngineDetails/TaskQueueing.md`, `docs/queue-scheduler-idle.md`, `CHANGELOG.md`, `frontend/src/components/layout/QueuePopupModal.jsx`
- Tests: `centralQueueFairness.test.js` (7 scenarios), `centralQueueSeam.test.js` (11 scenarios), plus updated `scanClaimableTasks.test.js`, `taskScheduler.test.js`, `QueuePopupModal.test.jsx`

## Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| Achieves goal | ✅ | One central queue across all projects; both dispatch paths and display sort through `sortCentralQueue`. Dispatch proven independent of UI focus (explicit test over focused/other/null). |
| Follows plan | ✅ | Phases 0–3 traceable: diagnosis names starvation + unbounded follow-on, seam collapses two mirrored orderings, fairness policy = oldest-first + percentage tiebreak + 15 min ceiling per survey q3. |
| Code standards | ✅ | Functional pure helpers, single responsibility, JSDocs with examples, co-located tests, no mutation of inputs, defensive timestamp handling. Prior code-standards review already passed. |
| Easy to modify | ✅ | Single comparator seam (`compareCentralQueueCandidates`) + policy resolver; rollback is config-only `KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along`. |
| Best practices | ✅ | Bounded worst-case wait, corrupt timestamps collapse to epoch (never hidden), overdue bucket oldest-first, follow-on gated by ceiling. |
| Tech debt | ✅ No unnecessary debt | 4 small helpers replace duplicated sort logic; no new abstractions, no stored queue state (derived). |
| Docs updated | ✅ | `TaskQueueing.md` is now the canonical "how is next task chosen?" doc, `queue-scheduler-idle.md` links to it, `CHANGELOG.md` + `.env.example` + schema docs describe defaults and rollback. |

## Evidence it works (science-experiment stance)

- **Repro harness** in `centralQueueFairness.test.js` constructs two pipelines (focused 3-stage late, other 2-stage early, 1h wait) and asserts embedded scheduler picks `task-other` — fails on pre-fix code, passes now.
- **Fleet path** and **display path** assert identical ordering; a focused vs unfocused vs no-session matrix asserts identical outcomes.
- **Starvation bound**: follow-on pre-empt blocked when other candidate overdue; follow-on still wins when nothing overdue — covers both sides of the ceiling.
- **Perpetual influx**: 5-tick loop with churning late-stage candidate still yields other pipeline — proves bounded wait under load.
- **Seam tests** pin policy defaults (oldest-first + 15 min), overhead tiebreak (2/2 =100% beats 9/10=90%), legacy mode, ISO timestamps, non-mutation.
- Automated run 2: **all unit suites green** (433 passed, 7006 tests). First run's single `priorityReason` failure was fixed on this branch.

## Non-blocking observation

Both automated-tests reports fail canary on `reasoning-levels-browser.spec.js` (`pi catalogue null` vs expected 7 levels). This failure appears identically on both runs and is unrelated to queue/scheduler changes (it probes harness catalogues). Treat as pre-existing environment flake, not a regression of this task. No action required for this PR; file a separate flake if it persists on `main`.

## Risks & mitigations verified

- Single-active invariant untouched (by design, per DIAGNOSIS). Load-bearing serialization preserved.
- `GET /tasks/queue` without `projectId` now returns all projects — intended UX per task title; per-project filter retained via explicit `?projectId=`.
- Ordering change is user-visible but rollback is config-only with no migration.

## Human-reviewer aid

No live-server screenshots generated (docs-only stage constraint). UI change is minimal and test-covered: `QueuePopupModal` header adds per-project counts and "Running now: …" line; existing `QueuePopupModal.test.jsx` covers list/empty/error states.

