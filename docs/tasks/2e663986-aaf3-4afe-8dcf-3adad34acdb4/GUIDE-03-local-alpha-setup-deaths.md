# GUIDE 03 — local-alpha setup-phase deaths (bare interrupt ~5 s after `started`, no `prompted`)

Cause 3 in `WIDE_NET_ANALYSIS.md` — the volume-dominant signature: 96/118
interrupts are local-alpha; 99/118 fleet-wide land <=15 s after `started`
(median 4.7 s) with no `prompted` event, i.e. the run dies inside worktree
preparation. This is the reporter's "local-alpha restart loop" incident.

- **Verdict: PARTIAL locally.** The *backend side* of the loop (bare
  interrupt -> instant Rule-0 re-queue -> escalation park) is unit-testable
  with mocks, and `prepareWorkdir` failure shapes are reproducible in temp
  dirs. The **root fault on the local-alpha host is PROD-READ-ONLY** — the
  deployed 0.1.0 build attaches no reason on the generic path, so only the
  local-alpha daemon journal names it. A full end-to-end repro needs a real
  runner claiming a real task — PROD-ACTION unless run against a fully local
  scratch stack.
- **Code seams:** `runner/daemon.js:1975` (`started` progress) ->
  `:1984` (`prepareWorkdir`, the only uncaught fallible step) ->
  `:2061` (`prompted`); generic catch `runner/daemon.js:2441-2452`
  (0.2.0 attaches `interruptReason`, still rethrows -> `exit(1)` -> systemd
  restart; deployed 0.1.0 predates `046a6391` so it is bare); backend:
  `api/flow/executionLedger.js` `interruptExecution`,
  `api/flow/scheduler/autoResumeTask.js`,
  `api/flow/scheduler/findResumedCandidate.js` (Rule-0 pickup).

## 1. Signature (recognise it)

- Task history: **bare** interrupt (`…lease dropped, re-queues as
  interrupted` with NO `Reason:`) <=15 s after the runner's `started` event,
  no `prompted` in between; then `Auto-resumed after server restart —
  prioritised in queue`; repeat every ~18–60 s until `Runner deaths
  escalated` at 5 on the same stage.
- Exhibits: `c5c465c4` (28 bare local-alpha interrupts, 11-19 12:15–12:37,
  ~18 s apart); `7f6220c3` In-Progress loop 11-20 15:38–15:43 (x5), Quick
  review 18:39–18:41 (x4), single-shots 11-21 10:16 and 13:34.
- Runner journal (prod): either `Runner failed: <message>` + `restart
  counter` increments (true crash loop) or tight claim->interrupt->re-claim
  with no restart (in-process loop) — backend history cannot distinguish
  these two; only the journal can.

## 2. Safe local replication — backend side of the loop (api, vitest)

Simulate a runner that keeps dying in setup: repeated interrupts with
`reason: null` (what 0.1.0 sent), assert the bare history row, the Rule-0
resume label, and the park at the bound. Proposed file (code stage):
`api/flow/scheduler/bareInterruptStorm.test.js`

```js
import { describe, test, expect } from "vitest";
import { ExecutionLedger, MAX_RUNNER_INTERRUPTS } from "../executionLedger.js";
import { autoResumeTask } from "./autoResumeTask.js";
import { isAutoResumableWithReason } from "./isAutoResumableWithReason.js";
// mock store/claimStore as in api/flow/executionLedger.test.js

test("bare setup-phase interrupts: reasonless history, instant auto-resume, park at the bound", () => {
  const ledger = new ExecutionLedger();
  let task = ctx.taskStore.getTask();
  for (let i = 1; i <= MAX_RUNNER_INTERRUPTS; i++) {
    const { executionId } = claimed(ctx);
    ledger.interruptExecution({ claimStore: ctx.claimStore, taskStore: ctx.taskStore,
      projectId: "p1", taskId: "t1", runnerId: "local-alpha", executionId, reason: null });
    const h = task.history.at(-1).action;
    if (i < MAX_RUNNER_INTERRUPTS) expect(h).toMatch(/lease dropped, re-queues as interrupted$/); // bare: no Reason
    autoResumeTask(ctx.store, "p1", "t1"); // scheduleTick pickup
    expect(task.status).toBe("in_stage");
    expect(task.history.at(-1).action).toBe("Auto-resumed after server restart — prioritised in queue");
  }
  const verdict = isAutoResumableWithReason(task, { type: "agent" });
  expect(verdict).toEqual({ resumable: false, reason: "runner-death-loop" });
});
```

TDD angle: after the 0.2.x rollout lands on runners, bare interrupts should
vanish. Red-test the desired end state now: `interruptExecution(..., reason: null)`
from an old-version runner should still record *something* useful — e.g. assert
the history row contains the runner version, watch it fail, then implement.

Run: `cd api && npx vitest run flow/scheduler/bareInterruptStorm.test.js`

## 3. Safe local replication — `prepareWorkdir` failure shapes (runner, `node:test`)

Reproduce "dies seconds after `started`, before `prompted`" by forcing each
fallible setup input to fail in a temp work root:

Proposed file (code stage): `runner/project.setupFaults.test.js`

```js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { prepareWorkdir } from "./project.js";

let workRoot, src;
beforeEach(() => {
  workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-setup-"));
  src = fs.mkdtempSync(path.join(os.tmpdir(), "kb-setup-src-"));
  fs.writeFileSync(path.join(src, "f.txt"), "x");
});
afterEach(() => { fs.rmSync(workRoot, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); });

it("unwritable work root -> generic throw inside the started->prompted window", async () => {
  fs.chmodSync(workRoot, 0o500); // read-only
  await assert.rejects(prepareWorkdir({ localPath: src, workRoot, taskId: "t1" }));
  fs.chmodSync(workRoot, 0o700);
});

it("git-level fault (src is not a repo and no remote) -> throws before any harness work", async () => {
  await assert.rejects(prepareWorkdir({ localPath: src, workRoot, taskId: "t1" }));
});
```

(Use `localRepo()` from `runner/project.test.js` for the success control.)
These pin that any setup fault surfaces as a fast, pre-`prompted` failure —
matching the observed signature. On 0.2.0 the daemon attaches the message as
the interrupt reason (`runner/daemon.js:2441`); on deployed 0.1.0 it was bare.

Run: `node --test runner/project.setupFaults.test.js`

## 4. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (all read-only, but
on prod hosts/API; the local-alpha host is the backend box 192.168.1.206):

```bash
# E1 — the deciding evidence: local-alpha daemon journal for the exhibit windows
# (run on 192.168.1.206 as user server; find the unit first):
systemctl --user list-units --type=service | grep -i runner
journalctl --user -u kainbain-runner-local-alpha --since '2026-11-19 12:00' --until '2026-11-19 12:45' \
  | grep -E 'Runner failed|restart counter|Main process exited' | tail -40
journalctl --user -u kainbain-runner-local-alpha --since '2026-11-20 15:30' --until '2026-11-20 15:50' | tail -60
journalctl --user -u kainbain-runner-local-alpha --since '2026-11-21 10:00' --until '2026-11-21 13:45' | tail -40

# E6 — fleet versions (read-only API) and the before/after recount after 0.2.x rollout:
curl -s http://192.168.1.206:3100/runners | jq '.[] | {id, version, buildCommit}'
curl -s 'http://192.168.1.206:3100/tasks?projectId=0fd41821' | jq '[.[] | .id]'   # then per-task:
curl -s 'http://192.168.1.206:3100/tasks/c5c465c4?projectId=0fd41821' \
  | jq '[.history[] | .action] | group_by(.) | map({action: .[0], n: length}) | sort_by(-.n)'
```

`PROD-ACTION — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION`: a full e2e repro
would mean letting a real runner claim a real task against the live backend
(e.g. manually resuming a parked task like `7f6220c3`, or filling local-alpha's
work root). If a human wants this, the safe-ish variant is a **fully local
scratch stack**: `docker compose up` a dev backend on localhost, register a
local runner against it, create a scratch project, fill the runner work root
with 5 fresh `kb-*` dirs, and watch the task history — no prod involved, but
it still invokes a real agent, so treat it as opt-in.

## 5. Evidence to collect when reproduced

- local-alpha journal `Runner failed: <exact message>` lines for the window —
  this is the only place the root fault is named on 0.1.0.
- Restart-counter deltas (crash loop vs in-process re-claim loop).
- Backend: per-task `started` -> interrupt deltas (median ~4.7 s fleet-wide)
  and the absence of `prompted`.
- Runner build provenance (`GET /runners`) before/after the 0.2.x rollout, and
  the recount of bare interrupts (should drop to ~0 once reasons ship).
