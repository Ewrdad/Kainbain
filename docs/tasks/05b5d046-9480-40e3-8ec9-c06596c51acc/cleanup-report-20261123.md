# S7 cleanup/hardening report — boot reconcile PIN (stage: cleanup)

Task: `05b5d046-9480-40e3-8ec9-c06596c51acc`
Source research located this stage at
`/home/server/projects/kainbain/docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
(RESPONSE.md S7, GUIDE-06 §2/§3/§4, WIDE_NET_ANALYSIS Cause 6, TDD-TEST-EXAMPLES,
RESPONSE_SURVEY — no survey question, no behaviour decision pending).

## What this stage changed (2 files)

1. `api/flow/scheduler/reconcileInterruptedRuns.js` — fail-safe hardening only.
   Happy-path behaviour is byte-identical for every real store shape; the
   changes only close holes where a malformed store/task could abort the whole
   reconcile pass (the exact path whose orphans this task pins at zero):
   - `projectStore.listProjects()` throwing or returning a non-array now
     degrades to "reconcile nothing" instead of throwing out of the function.
   - a non-array `listTasks()` return for one project now skips only that
     project (previously the `for...of` threw outside the per-project try and
     aborted **all remaining projects** — a server-restart orphan in a later
     project would have stayed `running_*`).
   - the engine-owner guard now requires a real id match
     (`task?.id != null && activeTaskId === task.id`); previously an id-less
     record with no active owner was silently skipped (`undefined !==
     undefined` → false). It now fails towards `interrupted`, never towards
     a stuck `running_*`.
   - JSDoc: fixed the malformed opener (`/**` → `/***`), documented the
     fail-safe contract. `MARK:` + `@description` + `@example` kept directly
     above the export; still exactly one top-level named function
     (`check:one-function-per-file` PASS).
2. `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js` — 4 → 10 tests.
   The four GUIDE-06 §2 cases are kept verbatim in intent (orphan flip +
   server-restart history row, engine-owned task untouched, idempotence,
   legacy `running_deploy`), now additionally asserting `_saveTaskMarkdown`
   persistence and exact history-row counts. Added:
   - the GUIDE-06 §2 literal set-membership pin (`ORPHANED_RUNNING_STATUSES`
     covers running_agent/ci/merge + advancing + legacy running_deploy, and
     excludes terminal/queued labels);
   - multi-project attribution (`{projectId, taskId}` per project, per-cwd
     save calls);
   - fail-safe pins: throwing/non-array/absent `listProjects` → `[]` without
     throwing; one broken project (throwing or non-array `listTasks`) never
     blocks the other projects; id-less orphan still reconciles; store without
     history/markdown helpers still flips.

## Evidence

- Boot PIN file standalone: `npx vitest run
  flow/scheduler/reconcileInterruptedRuns.boot.test.js` → **10/10 pass**.
- Adjacent suites (`flow/scheduler`, `flow/taskScheduler.test.js`,
  `taskStore.summaryDurations.test.js`, `flow/singleActiveInvariant.test.js`,
  `flow/noDeploySpecialBehaviour.guard.test.js`, `flow/startupRecovery.test.js`)
  → 16 files, **285/285 pass** — existing reconcile/isolation/WP6 coverage
  unaffected by the hardening.
- Full gate `npm run test:api` → **468 files, 7652 passed, 1 skipped,
  0 failed** (exit 0; total test count 7647 → 7653 = +6 new, the 2 fewer
  skips are environment-conditional tests that ran this time).
- `npx eslint` on both changed files → clean; full `npm run lint:api` →
  0 errors (647 warnings = pre-existing baseline).
- `node scripts/check-jsdoc-example.mjs` → PASS; `node
  scripts/check-one-function-per-file.mjs` → PASS (880 files).
- `git status`: only the two intended files modified.

## Regression analysis

No behaviour change for any reachable real-store state: `listProjects`/
`listTasks` on the real store always return arrays (or throw, already caught);
tasks always carry ids. The owner-guard equivalence was verified case-by-case
(id set/active set, id set/active null, engineState absent, task null — all
identical; only id-less+no-owner changes, towards the safe direction). The
boot call site (`performStartupRecovery` step 1) is unchanged and still wraps
the call in try/catch; the shutdown path (`api/index.js`) and the disk-load
path (`taskPersistence.js`) share `ORPHANED_RUNNING_STATUSES`, which is
untouched.

## Ops handoff — still deferred (PROD-READ-ONLY, needs explicit permission)

NOT run (no permission granted this stage): the GUIDE-06 §4 read-only loop
over `http://192.168.1.206:3100` task histories. Rule unchanged: **any**
`interrupted by server restart` / `recovered after server restart` history row
re-opens Cause 6; the only legitimate writer of that string is
`reconcileInterruptedRuns` (now pinned by the 10-test boot suite).
