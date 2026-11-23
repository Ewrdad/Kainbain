# S7 implementation report — boot reconcile PIN

Task: `05b5d046-9480-40e3-8ec9-c06596c51acc`
Type: test-only PIN. Zero behaviour change. One new file, no prod edits.
New file: `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`

## 1. Reconstruction basis (GUIDE-06/WIDE_NET/TDD docs absent)

Step 1.1 verification, run on branch
`kb/05b5d046-9480-40e3-8ec9-c06596c51acc`:

```bash
ls docs/tasks/ | grep 2e66; find docs -name 'GUIDE-06*' -o -name 'TDD-TEST*' | head
```

Output: empty. `docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
does not exist, so RESPONSE.md S7, GUIDE-06, WIDE_NET Cause 6,
TDD-TEST-EXAMPLES.md and RESPONSE_SURVEY.md could not be read
literally. The spec was therefore reconstructed from, in priority
order: (1) the task text's four-case spec, (2)
`api/flow/scheduler/reconcileInterruptedRuns.js` (exact strings and
branches), (3) `api/flow/scheduler/orphanedRunningStatuses.js`, (4)
existing test conventions in `api/flow/scheduler/*.test.js`.

SURVEY.md round 1 ("proceed as described?") is answered Yes, so there
are no pending behaviour decisions. If the real GUIDE-06 §2 surfaces
at review with different assertion wording, only assertion-text
tweaks should be needed — the four pinned behaviours are unambiguous
from code.

## 2. Spec-mapping table

| # | Spec case | Test name | Code branch pinned |
|---|---|---|---|
| 1 | Orphan flip + history row | "orphaned running_* tasks flip to interrupted with a server-restart history row" | `reconcileInterruptedRuns.js` lines 36–61: status flip, `wasInterrupted`, `updatedAt`, `_recordHistory` with `"Stage execution interrupted by server restart"`, `[{projectId, taskId}]` return; `in_stage` control untouched |
| 2 | Engine-owned task untouched | "the engine owner's live task is untouched" | Owner guard line 38 (`store.engineState?.activeTaskId !== task.id`): owner keeps `running_agent`, no history, absent from return; orphan still flips |
| 3 | Idempotence | "a second pass reconciles nothing and writes no further history (idempotent)" | Second call returns `[]`, no further `_recordHistory` calls; mirrors `performStartupRecovery`'s "sync, idempotent" step-1 comment |
| 4 | Legacy `running_deploy` | "legacy running_deploy records still reconcile" | `ORPHANED_RUNNING_STATUSES` legacy entry flips with the same history row and return shape |

The fake store is self-contained (local `makeBootStore`/`bootTask`,
no imports from `taskScheduler.test.js`). Fail-safe branches stay
covered in `taskScheduler.test.js` and are not re-tested here.

## 3. Evidence

- Baseline: `flow/scheduler/schedulerPure.test.js` green (8/8) before
  the change; `git status` clean before the change.
- PIN first run: `npm run test:api -- --run
  flow/scheduler/reconcileInterruptedRuns.boot.test.js` → 4/4 pass,
  unmodified. PIN established, no §3.5 deviation.
- Adjacent suites: `flow/scheduler flow/taskScheduler.test.js
  taskStore.summaryDurations.test.js singleActiveInvariant.test.js
  flow/noDeploySpecialBehaviour.guard.test.js` → 15 files, 261 tests,
  all pass (guard green: `running_deploy` string in the test file
  does not trip the deploy-literal guard).
- Full gate: `npm run test:api` → 7644 passed, 3 skipped, 0 failed.
- Lint: `npm run lint:api` → 0 errors; no findings reference the new
  file (647 warnings are pre-existing elsewhere).
- `git status` after: exactly one new file,
  `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`.
  Zero prod-code and zero existing-test modifications.

Note: `api/node_modules` was absent in this checkout, so `npm ci
--prefix api` was run once to execute the suites. No lockfile or
manifest changes resulted.

## 4. Ops handoff — deferred PROD check (GUIDE-06 §4, PROD-READ-ONLY)

NOT run by this task (needs operator permission). For an operator:

1. Read-only: search prod task history for rows whose action
   contains "interrupted by server restart".
2. ANY such row re-opens Cause 6 (backend restart orphans) for
   investigation.
3. Any writer of that exact string other than
   `reconcileInterruptedRuns` is a bug.

## 5. Fold note

Independent task; may be folded into S1/S6 at review but must never
be skipped. The pinned file is
`api/flow/scheduler/reconcileInterruptedRuns.boot.test.js` — review
can verify inclusion either way.
