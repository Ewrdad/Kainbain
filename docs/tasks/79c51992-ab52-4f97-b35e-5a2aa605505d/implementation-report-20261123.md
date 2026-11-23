# S6 implementation report — misleading resume label + Tried-N-times inflation

Task: `79c51992-ab52-4f97-b35e-5a2aa605505d`. Plan: `IMPLEMENTATION_PLAN.md` in this folder.

## 1. Contract sources (research docs absent)

`docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/` does not exist in this
checkout (re-verified at implementation time), so per plan §1.1 the contract
was taken from the task brief's Evidence/Change paragraphs plus live code.
Survey `SURVEY.md` round 1 was still unanswered (`"answers": {}`), so the
Recommended defaults were implemented: q1 = two separate labels, q2 =
show-both (`"Tried 2 times, 4 infra resumes"`).

## 2. Phase-1 discriminator decision + evidence

The brief's `interruptedBy` marker did not exist (repo-wide grep: zero hits
outside this task's plan). Decision: stamp it (plan's recommended option).

- Runner path: `api/flow/executionLedger.js` `interruptExecution` stamps
  `task.runnerInterruptStage` / `task.runnerInterruptCount` plus a history
  line — always, for every runner interrupt (verified lines 644–658).
- Crash path: `api/flow/scheduler/reconcileInterruptedRuns.js` (orphan
  `running_*` → `interrupted`) and the `parseTaskMarkdown` disk-load path
  stamp nothing runner-specific (verified).
- Resume call sites (all three now label correctly via the task marker, no
  call-site change): `api/flow/startupRecovery.js:101` (genuine restart),
  `api/flow/scheduler/scheduleTick.js:182` (runner path, same process),
  `api/continuity/deployReconcile.js:1055` (reconcile route).
- The marker is in-memory only, exactly like the existing G7
  `runnerInterruptStage/Count` fields (verified: neither is written by
  `saveTaskMarkdown` nor read by `parseTaskMarkdown` — no persistence change
  needed). Consequence: a runner-interrupted task resumed after a genuine
  restart reads as a restart recovery, which is correct — the restart is the
  recovery route. `autoResumeTask` consumes the marker read-only; the next
  interrupt overwrites it. Stage completion clears it alongside the G7 reset
  (same function, `executionLedger.js`), so a later crash resume cannot
  mislabel as an old runner death.

## 3. Exact new strings shipped

- Restart route (unchanged): `Auto-resumed after server restart — prioritised in queue`
- Runner route: `Auto-resumed after runner interrupt — prioritised in queue`
  - with id: `… queue (runner r-7)`
  - with id + reason: `… queue (runner r-7, reason: socket hangup)`
  - malformed marker (no usable runner id): bare runner string; blank reason:
    id-only form (never `Reason: undefined`).
- Frontend badge: `Tried {n} times[, {m} infra resume(s)]`; resume-only form
  `{m} infra resume(s)` (singular `1 infra resume`); `null` when the stage ran
  once and never resumed. Field name: `resumeCount`, display-only on copies
  (never persisted), same cap/floor/fail-safe rules as `tryCount`.

## 4. What changed (file inventory)

- New: `api/flow/scheduler/resolveResumeLabel.js` (one function; MARK + JSDoc
  `@example`; exported via `api/flow/scheduler/index.js`),
  `api/flow/scheduler/autoResumeLabel.test.js` (9 tests).
- Backend: `api/flow/scheduler/autoResumeTask.js` (uses the helper for both
  `_recordHistory` and the timeline default reason; JSDoc updated),
  `api/flow/executionLedger.js` (stamp + completion clear),
  `api/flow/taskScheduler.test.js` (restart case pinned to the exact string;
  new runner-route case), `api/flow/stallRecovery.integration.test.js`,
  `api/flow/startupRecovery.integration.test.js` (route-naming comments;
  genuine restart route keeps the old assertion).
- Frontend: `frontend/src/components/tasks/taskFormatters.js`
  (`isInfraResumeRow` predicate, `summarizeStageRuns` partition,
  `formatTryCount` combined label, JSDoc updated),
  `frontend/src/components/tasks/taskFormatters.test.js` (9 new tests + 1
  trap-case `resumeCount` assertion).
- Docs: `docs/resume-stall-recovery-runbook.md`,
  `docs/queue-scheduler-idle.md` (both strings + which route writes which).
- Explicitly not touched: `TaskHistoryTab.jsx`, `TaskDetailHistoryPane.jsx`
  (render the string verbatim — verified, no consumer change),
  `isVisitOutcomeTimelineStatus` semantics (Resumed still a visit outcome;
  suppression test still green), resume/priority/escalation logic, stored
  history/timeline rows (old rows byte-identical; new fields on new rows only).

## 5. Verification (all observed this session)

- `npm run test:api`: 468 files, 7650 passed, 3 skipped — green.
- `npm run test:frontend`: 364 files, 4986 passed — green.
- `npm run lint`: 0 errors (warnings all pre-existing on untouched lines).
- `npm run check:one-function`: PASS (881 scanned).
- `check-jsdoc-example`: PASS; `check-doc-links`: PASS.
- Pin-then-red demonstrated: new backend runner test failed before the stamp
  (1 failed / 8 passed); 8 new frontend tests failed before the counting
  change; all green after. Live repro: `resolveResumeLabel` returns both
  strings above verbatim (node one-liner).
- Backward compat: no parser branches on either prefix (grep: only the helper
  itself plus tests/docs reference the strings); old histories untouched
  (pinned by test).
