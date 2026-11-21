# GUIDE 07 — Amplifier: instant re-queue + display mechanics multiply every flake

Section 4 of `WIDE_NET_ANALYSIS.md`. Not a root cause, but it turns each
interrupt into the screenshot's "quite common" impression (`assets/image.png`)
and into parked tasks.

- **Verdict: REPLICABLE-LOCALLY** (api + frontend unit tests).
- **Code seams:** `api/flow/scheduler/autoResumeTask.js` (single history
  string `Auto-resumed after server restart — prioritised in queue` for BOTH
  recovery routes); `api/flow/scheduler/scheduleTick.js:178-181` (interrupted
  candidate is auto-resumed and dispatched in the same tick — no backoff);
  `api/flow/scheduler/findResumedCandidate.js` (Rule-0: oldest interruption
  first); `api/flow/executionLedger.js` `interruptExecution` (increments
  `runnerInterruptCount` unconditionally — cap refusals count as deaths, see
  GUIDE 01); `frontend/src/components/tasks/taskFormatters.js:483-536`
  (`summarizeStageRuns` sets `tryCount` = grouped row count, capped at
  `STAGE_RUN_TRY_COUNT_CAP = 99` at `:461`) and `:556` (`formatTryCount` ->
  `Tried {n} times`).

## 1. Signature (recognise it)

- `assets/image.png`: every stage row shows "Auto-resumed after server
  restart — prioritised in queue" and a high "Tried N times" badge, while
  backend history shows **zero** actual server-restart interrupts.
- Interrupt -> resume -> re-claim cadence of ~150 ms–60 s with no backoff.

## 2. Safe local tests — the mislabel (api, vitest)

Pin that a runner-path interrupt (no server restart happened) is resumed
under the "server restart" label. Existing harness: `api/flow/taskScheduler.test.js:896`
(`describe("autoResumeTask")`). Proposed additions (code stage):
`api/flow/scheduler/autoResumeLabel.test.js`

```js
import { describe, test, expect } from "vitest";
import { autoResumeTask } from "./autoResumeTask.js";
// mock store as in api/flow/taskScheduler.test.js:896

test("PIN current behaviour: a runner-path interrupt resumes under the 'server restart' label", () => {
  store.tasks["t-1"].status = "interrupted"; // set by executionLedger.interruptExecution (runner path)
  autoResumeTask(store, "p-1", "t-1", "/repo");
  const actions = store.tasks["t-1"].history.map((h) => h.action);
  expect(actions).toContain("Auto-resumed after server restart — prioritised in queue");
});

test("TDD red-test for the fix: runner-path resumes must NOT claim a server restart", () => {
  store.tasks["t-1"].status = "interrupted";
  store.tasks["t-1"].interruptedBy = "runner:local-alpha"; // set by interruptExecution
  autoResumeTask(store, "p-1", "t-1", "/repo");
  const actions = store.tasks["t-1"].history.map((h) => h.action);
  expect(actions.some((a) => a.includes("server restart"))).toBe(false); // FAILS today -> red
  expect(actions.some((a) => a.includes("Auto-resumed"))).toBe(true);
});
```

Run: `cd api && npx vitest run flow/scheduler/autoResumeLabel.test.js`

## 3. Safe local tests — Rule-0 instant pickup, no backoff (api, vitest)

Proposed `api/flow/scheduler/findResumedCandidate.priority.test.js`: with one
fresh `in_stage` task and one `interrupted` task (or one carrying
`resumedAfterInterruption`), assert `findResumedCandidate(store)` returns the
interrupted one with `priorityReason: "resumed_interrupted"`, and that
`scheduleTick` dispatches it in the same tick (see `scheduleTick.js:178-181`).
TDD red-test for a backoff fix: after N consecutive resumes of the same
task+stage, the resumed candidate should sort behind fresh work —
`expect(candidate.taskId).toBe("t-fresh")` fails today.

## 4. Safe local tests — "Tried N times" inflation (frontend, vitest)

`summarizeStageRuns` counts every grouped timeline row — `Advanced`, `Moved`,
`Failed`, and every `Resumed` row (each auto-resume writes one) — into
`tryCount`. Reproduce the screenshot's x6/x10/x11 badges. Proposed additions
to `frontend/src/components/tasks/taskFormatters.test.js`
(see its `describe('summarizeStageRuns')` at :1254):

```js
it('PIN: interrupt/resume cycles inflate tryCount (screenshot badges)', () => {
  const entries = [
    { stage: 'In Progress', status: 'Resumed', timestamp: 't5' },
    { stage: 'In Progress', status: 'Failed', timestamp: 't4', reason: 'x' },
    { stage: 'In Progress', status: 'Resumed', timestamp: 't3' },
    { stage: 'In Progress', status: 'Resumed', timestamp: 't2' },
    { stage: 'In Progress', status: 'Advanced', timestamp: 't1' },
  ];
  const [row] = summarizeStageRuns(entries, []);
  expect(row.tryCount).toBe(5);
  expect(formatTryCount(row)).toBe('Tried 5 times');
});

it('TDD red-test for the fix: Resumed rows are re-tries of infra, not stage attempts', () => {
  const entries = [ /* same as above */ ];
  const [row] = summarizeStageRuns(entries, []);
  expect(row.tryCount).toBe(2); // Advanced + Failed only — FAILS today (currently 5)
});
```

Run: `cd frontend && npx vitest run src/components/tasks/taskFormatters.test.js`

## 5. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (read-only API) — the
fleet-wide counts behind the amplifier (re-run after the 0.2.x runner rollout
as the before/after test):

```bash
curl -s 'http://192.168.1.206:3100/tasks?projectId=0fd41821' | jq -r '.[].id' | while read t; do
  curl -s "http://192.168.1.206:3100/tasks/$t?projectId=0fd41821" \
    | jq -r --arg t "$t" '[.history[]?.action] | {
        task: $t,
        runner_interrupts: map(select(test("interrupted execution"))) | length,
        with_reason: map(select(test("interrupted execution.*Reason:"))) | length,
        auto_resumed: map(select(test("Auto-resumed after server restart"))) | length,
        server_restart: map(select(test("interrupted by server restart"))) | length,
        escalated: map(select(test("Runner deaths escalated"))) | length
      } | @json';
done
```

## 6. Evidence to collect

- Per-task counts from §5 (before/after runner rollout).
- UI rows (`assets/image.png` pattern) mapped to the same task's history —
  showing Resumed rows counted into "Tried N times" and runner-path resumes
  labelled "after server restart".
