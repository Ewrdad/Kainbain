# TDD Test Examples — consolidated recipes for the interruption flakes

All snippets are for a follow-up **code stage** (this stage is docs-only, so
no test files were added to the repo). Each recipe: red test first (it should
fail or pin current behaviour), then the code change that turns it green.
Full snippets live in the per-cause guides linked below; this file is the
map + run commands.

## Where each test would live and how to run it

| Guide | Proposed test file | Runner | Command |
|---|---|---|---|
| GUIDE-01 cap loop | `runner/project.worktreeCap.test.js` | node:test | `node --test runner/project.worktreeCap.test.js` |
| GUIDE-01 backend | `api/flow/executionLedger.capInterruptLoop.test.js` | vitest | `cd api && npx vitest run flow/executionLedger.capInterruptLoop.test.js` |
| GUIDE-02 413 | `api/flow/runnerRoutes.bodyLimit.413.test.js`, `api/bodyLimit.default.test.js` | vitest | `cd api && npx vitest run flow/runnerRoutes.bodyLimit.413.test.js bodyLimit.default.test.js` |
| GUIDE-02 payload | `runner/daemon.collectTaskFiles.test.js` | node:test | `node --test runner/daemon.collectTaskFiles.test.js` |
| GUIDE-03 storm | `api/flow/scheduler/bareInterruptStorm.test.js` | vitest | `cd api && npx vitest run flow/scheduler/bareInterruptStorm.test.js` |
| GUIDE-03 setup faults | `runner/project.setupFaults.test.js` | node:test | `node --test runner/project.setupFaults.test.js` |
| GUIDE-04 outage | `runner/client.backendOutage.test.js` | node:test | `node --test runner/client.backendOutage.test.js` |
| GUIDE-05 hook loop | `runner/gitOps.hookCrashLoop.test.js` | node:test | `node --test runner/gitOps.hookCrashLoop.test.js` |
| GUIDE-05 backend | `api/flow/executionLedger.commitLoop.test.js` | vitest | `cd api && npx vitest run flow/executionLedger.commitLoop.test.js` |
| GUIDE-06 reconcile | `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js` | vitest | `cd api && npx vitest run flow/scheduler/reconcileInterruptedRuns.boot.test.js` |
| GUIDE-07 label | `api/flow/scheduler/autoResumeLabel.test.js` | vitest | `cd api && npx vitest run flow/scheduler/autoResumeLabel.test.js` |
| GUIDE-07 priority | `api/flow/scheduler/findResumedCandidate.priority.test.js` | vitest | `cd api && npx vitest run flow/scheduler/findResumedCandidate.priority.test.js` |
| GUIDE-07 tryCount | additions to `frontend/src/components/tasks/taskFormatters.test.js` | vitest | `cd frontend && npx vitest run src/components/tasks/taskFormatters.test.js` |

Housekeeping for the code stage:

- New `runner/*.test.js` files MUST be added to the explicit list in
  `scripts/run-tests.mjs` `buildBranches()` ("Unit Tests (runner)") —
  `tests/run-tests.test.mjs` pins that every runner suite is registered.
- New/renamed exports in `api/`, `shared/`, `frontend/src/` need a JSDoc
  block with `MARK:` + `@description` + `@example`; run
  `npm run check:jsdoc-example` (<1 s) before pushing.
- Full gate: `npm test` (or `npm test -- --no-canary` for a fast cycle);
  per-area: `npm run test:api`, `npm run test:frontend`.

## TDD workflow per issue

1. **Write the red test** from the guide (most are written to FAIL against
   current code — they encode the desired fix: cap refusals not counted as
   deaths, distinct resume label, Resumed rows excluded from tryCount,
   non-fatal transient backend errors, backoff on repeated resumes).
2. **Run it, confirm red.**
3. **Change the seam** named in the guide (`executionLedger.js`,
   `autoResumeTask.js`, `taskFormatters.js`, `daemon.js` catch, …).
4. **Run green**, then the full gate.
5. Tests that only PIN current behaviour (marked "PIN" in the guides, e.g.
   the 413 default, the reconcile flip) should pass immediately — they are
   regression guards, not red tests.

## What CANNOT be tested locally — do not attempt without explicit user permission

| Item | Why | Tier | Where documented |
|---|---|---|---|
| Root cause of local-alpha bare setup deaths | Deployed 0.1.0 attaches no reason; only the local-alpha host journal (192.168.1.206) names it | PROD-READ-ONLY | GUIDE-03 §4 (E1) |
| Fleet-wide interrupt recount / before-after 0.2.x rollout | Live backend API, project `0fd41821` | PROD-READ-ONLY | GUIDE-03 §4 (E6), GUIDE-07 §5 |
| 413 confirmation on real tasks (`7f6220c3`) + journal sweeps | Runner journals + backend access log on prod hosts | PROD-READ-ONLY | GUIDE-02 §4 (E2/E3) |
| Crash-vs-reclaim join for server2-alpha interrupts | server2 journal + task histories | PROD-READ-ONLY | GUIDE-04 §4 (E4) |
| Backend downtime window enumeration | backend/proxy logs on prod host | PROD-READ-ONLY | GUIDE-04 §4 (E7) |
| Worktree forensics on `kb-<taskId>` exhibits | Runner hosts; do NOT reap `kb-7f6220c3` | PROD-READ-ONLY | GUIDE-02 §4, GUIDE-05 §4 (E5) |
| Any re-run of a real agent stage (e.g. resuming parked `7f6220c3`) | Invokes a real agent against the live backend, burns a stage run, mutates task state | PROD-ACTION | GUIDE-03 §4 |
| Restarting/reaping prod runners or backend to force a repro | Mutates shared prod systems | PROD-ACTION | — (not recommended; observe only) |

None of the PROD-READ-ONLY / PROD-ACTION commands in the guides were
executed for this stage. They are procedures only — **run them only with
explicit user permission**.

## Safe local e2e option (no prod, still opt-in)

A full loop reproduction without touching prod is possible against a
**scratch stack**: `docker compose up` a dev backend on localhost, register a
local runner, create a scratch project, pre-fill the runner work root with 5
fresh `kb-*` dirs (Cause 1) or install a failing pre-commit hook in the
scratch project (Cause 5), then watch `GET /tasks/<id>` history. This still
invokes a real agent harness, so treat it as opt-in and time-boxed; the unit
recipes above cover the same mechanics without an agent.
