# GUIDE 06 — Backend server restarts orphaning `running_*` tasks

Cause 6 in `WIDE_NET_ANALYSIS.md` — the reporter's alternate hypothesis and
what the UI label "Auto-resumed after server restart" literally claims.
**Analysis verdict: ruled out as the current driver** — zero
`Stage execution interrupted by server restart` / `Execution recovered after
server restart` entries across all 61 retained tasks in project `0fd41821`;
all 118 observed interrupts were runner-initiated lease drops. The five most
recent deploys (11-19 -> 11-21, spanning the spike) were all `--publish-only`
(`deploy.sh:1699-1712` exits before `restart_service`), and the one observed
real restart (11-20 20:40, build 637) orphaned nothing. Keep as monitor-only.

- **Verdict: REPLICABLE-LOCALLY** (mock-store unit test of the boot reconcile).
  The fleet-wide confirmation is PROD-READ-ONLY (flagged in §4).
- **Code seams:** `api/flow/scheduler/reconcileInterruptedRuns.js` (the flip +
  `Stage execution interrupted by server restart` history);
  `api/flow/scheduler/orphanedRunningStatuses.js`
  (`ORPHANED_RUNNING_STATUSES` = running_agent/ci/merge + legacy
  running_deploy + advancing); `api/flow/startupRecovery.js:143+`
  (`performStartupRecovery` order: reconcile -> plugins -> auto-resume ->
  scheduler kick, pickup ~150 ms); `deploy.sh` `restart_service`.

## 1. Signature (recognise it — if it ever happens)

- Task history row: `Stage execution interrupted by server restart` — **none
  exist in retained history today**, so any future occurrence re-opens this
  cause immediately.
- Coincides with a real backend restart (journal `kainbain.service` restart,
  or `build.json` `deployedAt` vs `engine.updatedAt` divergence).
- Contrast with runner-path interrupts: those say `Runner <id> interrupted
  execution … — lease dropped`.

## 2. Safe local replication (api, vitest)

Proposed file (code stage): `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`

```js
import { describe, test, expect } from "vitest";
import { reconcileInterruptedRuns } from "./reconcileInterruptedRuns.js";
import { ORPHANED_RUNNING_STATUSES } from "./orphanedRunningStatuses.js";

function mockStore(tasks) {
  const history = [];
  const store = {
    projectStore: { listProjects: () => [{ id: "p1", cwd: "/tmp/p1" }] },
    listTasks: () => tasks,
    engineState: { activeTaskId: "t-live" }, // the engine's own task is never reconciled
    _recordHistory: (task, action) => history.push({ task: task.id, action }),
    _saveTaskMarkdown: () => {},
  };
  return { store, history };
}

test("orphaned running_* tasks flip to interrupted with the server-restart history row", () => {
  const tasks = [
    { id: "t-orphan", status: "running_agent", history: [] },
    { id: "t-live", status: "running_agent", history: [] },   // engine-owned: untouched
    { id: "t-adv", status: "advancing", history: [] },
    { id: "t-ok", status: "in_stage", history: [] },
  ];
  const { store, history } = mockStore(tasks);
  const out = reconcileInterruptedRuns(store);
  expect(out).toEqual([{ projectId: "p1", taskId: "t-orphan" }, { projectId: "p1", taskId: "t-adv" }]);
  expect(tasks[0].status).toBe("interrupted");
  expect(tasks[0].wasInterrupted).toBe(true);
  expect(tasks[1].status).toBe("running_agent");
  expect(history.map((h) => h.action)).toEqual([
    "Stage execution interrupted by server restart",
    "Stage execution interrupted by server restart",
  ]);
});

test("idempotent: a second pass reconciles nothing", () => {
  const tasks = [{ id: "t-orphan", status: "running_ci", history: [] }];
  const { store } = mockStore(tasks);
  expect(reconcileInterruptedRuns(store)).toHaveLength(1);
  expect(reconcileInterruptedRuns(store)).toEqual([]);
});

test("legacy running_deploy label is covered by ORPHANED_RUNNING_STATUSES", () => {
  expect(ORPHANED_RUNNING_STATUSES.has("running_deploy")).toBe(true);
});
```

Run: `cd api && npx vitest run flow/scheduler/reconcileInterruptedRuns.boot.test.js`

An integration-level pin: `performStartupRecovery` (`api/flow/startupRecovery.js`)
runs reconcile -> auto-resume -> scheduler; a test with the same mock store
asserts a reconciled task then gets `Auto-resumed after server restart —
prioritised in queue` via `autoResumeTask` — which is exactly why runner-path
interrupts display under the same "server restart" label (see GUIDE 07).

## 3. TDD note

The mechanism works as designed; nothing to fix here. The test above is a
**regression pin** so any future change to the boot order or the orphaned
status set is caught.

## 4. Prod-only verification (keep the rule-out current)

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (read-only API):

```bash
# Any 'interrupted by server restart' row re-opens Cause 6 (currently zero):
for t in $(curl -s 'http://192.168.1.206:3100/tasks?projectId=0fd41821' | jq -r '.[].id'); do
  curl -s "http://192.168.1.206:3100/tasks/$t?projectId=0fd41821" \
    | jq -r '.history[]?.action | select(test("interrupted by server restart|recovered after server restart"))' \
    | sed "s/^/$t: /";
done
# Restart detector: build vs engine timestamps
curl -s http://192.168.1.206:3100/deploy/status | jq '{buildNumber, deployedAt}'
curl -s http://192.168.1.206:3100/status/observability | jq '.engine.updatedAt'
```

## 5. Evidence to collect

- If a server-restart interrupt ever appears: the backend journal restart
  lines around that timestamp + `build.json` `deployedAt` + the affected
  task ids.
- Otherwise: the zero-count recount above, re-run after each deploy.
