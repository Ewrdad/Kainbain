# GUIDE 01 — Worktree-cap exhaustion loop (`WORKTREE_CAP_REACHED`)

Cause 1 in `WIDE_NET_ANALYSIS.md`. All 49 reasoned interrupts fleet-wide carry
`Reason: Runner workdir unavailable: Worktree cap reached (~5); ...` — this is
the only cause with direct textual proof in task histories.

- **Verdict: REPLICABLE-LOCALLY.** The cap logic is pure filesystem code
  (`runner/project.js`), and the backend reaction is unit-testable with mock
  stores. No prod, no agents.
- **Code seams:** `runner/project.js:33` (`WORKTREE_CAP = 5`),
  `runner/project.js:34` (`WORKTREE_EVICT_STALE_MS = 30 min`),
  `prepareWorkdir` refusal at `runner/project.js:1185-1199`,
  `listOrphanWorkdirs` at `runner/project.js:424`,
  daemon catch at `runner/daemon.js:2299-2314` (interrupt WITH reason, no
  rethrow, keeps polling), backend counter at
  `api/flow/executionLedger.js` (`interruptExecution`,
  `MAX_RUNNER_INTERRUPTS = 5` at `:17`), park rule at
  `api/flow/scheduler/isAutoResumableWithReason.js` (`runner-death-loop`).

## 1. Signature (recognise it)

- Task history rows: `Runner <id> interrupted execution <exec> — lease dropped,
  re-queues as interrupted. Reason: Runner workdir unavailable: Worktree cap
  reached (~5); ...` — always with a `Reason:` suffix naming the cap.
- Timing: interrupt lands seconds after the runner's `started` progress event,
  never after `prompted` (refusal happens inside `prepareWorkdir`).
- Loop shape: interrupt -> `Auto-resumed after server restart — prioritised
  in queue` -> same runner re-claims within ~150 ms -> cap refusal again. On
  the 5th consecutive refusal on the same stage the task parks as
  `runner-death-loop` (see GUIDE 07 for why a *capacity* problem is counted as
  *runner deaths*).
- Runner host: work root (e.g. `/home/server/.kainbain` on local-alpha,
  `/home/server2/.kainbain` on server2-alpha) holds >= 5 live `kb-*`
  workdirs, none older than 30 min.

## 2. Safe local replication (runner side, `node:test`)

Reproduce the refusal with a temp work root holding 5 *fresh* orphan workdirs,
then show the stale-eviction escape hatch. Pattern follows
`runner/project.test.js` (`localRepo()` helper creates a temp git repo).

Proposed test file (code stage): `runner/project.worktreeCap.test.js`

```js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareWorkdir, WORKTREE_CAP, WORKTREE_EVICT_STALE_MS } from "./project.js";

function localRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cap-src-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git(["init", "-q"]); git(["config", "user.email", "t@t.t"]); git(["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  git(["add", "."]); git(["commit", "-qm", "init"]);
  return dir;
}

describe("WORKTREE_CAP_REACHED (Cause 1)", () => {
  let workRoot, src;
  beforeEach(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cap-root-"));
    src = localRepo();
    // Fill the cap with FRESH orphans (mtime now -> nothing stale to evict)
    for (let i = 0; i < WORKTREE_CAP; i++) {
      fs.mkdirSync(path.join(workRoot, `kb-orphan${i}`), { recursive: true });
    }
  });
  afterEach(() => { fs.rmSync(workRoot, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); });

  it("refuses with WORKTREE_CAP_REACHED when all orphans are fresh", async () => {
    await assert.rejects(
      prepareWorkdir({ localPath: src, workRoot, taskId: "newtask" }),
      (err) => {
        assert.equal(err.code, "WORKTREE_CAP_REACHED");
        assert.match(err.message, /Worktree cap reached \(~5\)/);
        assert.match(err.message, /nothing stale to evict/);
        return true;
      },
    );
  });

  it("evicts the stalest orphan instead of refusing once one is old", async () => {
    const staleDir = path.join(workRoot, "kb-orphan0");
    const old = new Date(Date.now() - WORKTREE_EVICT_STALE_MS - 60_000);
    fs.utimesSync(staleDir, old, old);
    const out = await prepareWorkdir({ localPath: src, workRoot, taskId: "newtask" });
    assert.equal(out.evicted, "kb-orphan0");
    assert.ok(out.workdir.endsWith("kb-newtask"));
  });
});
```

Run: `node --test runner/project.worktreeCap.test.js` (after registering the
file in `scripts/run-tests.mjs` `buildBranches` — required by the gate).

Expected: both tests pass against current code, which *pins* the behaviour.
The loop itself is the composition: refusal -> `client.interrupt` with reason
-> Rule-0 re-queue -> same runner re-claims -> refusal again.

## 3. Safe local replication (backend side, vitest)

Pin the counter/park behaviour with mocks, following
`api/flow/executionLedger.test.js` (`claimed(ctx)` helper). Proposed file
(code stage): `api/flow/executionLedger.capInterruptLoop.test.js`

```js
import { describe, test, expect } from "vitest";
import { ExecutionLedger, MAX_RUNNER_INTERRUPTS } from "./executionLedger.js";
import { isAutoResumableWithReason } from "./scheduler/isAutoResumableWithReason.js";
// ... mock claimStore/taskStore exactly like executionLedger.test.js ...

test("five cap refusals on one stage escalate and then park as runner-death-loop", () => {
  const ledger = new ExecutionLedger();
  const CAP_REASON =
    "Runner workdir unavailable: Worktree cap reached (~5); refusing to add kb-t1 (every orphan was used recently, nothing stale to evict).";
  let out;
  for (let i = 0; i < MAX_RUNNER_INTERRUPTS; i++) {
    const { executionId } = claimed(ctx); // re-claim after each dropped lease
    out = ledger.interruptExecution({ claimStore: ctx.claimStore, taskStore: ctx.taskStore,
      projectId: "p1", taskId: "t1", runnerId: "r1", executionId, reason: CAP_REASON });
  }
  expect(out).toEqual({ interrupted: true, interruptCount: MAX_RUNNER_INTERRUPTS, escalated: true });
  const task = ctx.taskStore.getTask();
  expect(task.status).toBe("interrupted");
  expect(task.history.at(-1).action).toMatch(/Runner deaths escalated/);
  // Amplifier pinned: a *capacity* refusal is counted as a runner *death*
  expect(isAutoResumableWithReason(
    { ...task, status: "interrupted" }, { type: "agent" },
  )).toEqual({ resumable: false, reason: "runner-death-loop" });
});
```

TDD angle: if the fix is "cap refusals must not increment the death counter",
write the red test first — `interruptExecution(..., { reason: CAP_REASON })`
should leave `runnerInterruptCount` unchanged — watch it fail, then change
`executionLedger.js` to skip counting when the reason starts with
`Runner workdir unavailable:`.

Run: `cd api && npx vitest run flow/executionLedger.capInterruptLoop.test.js`

## 4. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (read-only, but prod):

```bash
# Work-root occupancy on each runner host (backend host 192.168.1.206 as
# user server = local-alpha; this machine = server2-alpha):
ls -lt ~/.kainbain/kb-* 2>/dev/null | head -20
find ~/.kainbain -maxdepth 1 -name 'kb-*' -newermt '30 minutes ago' | wc -l

# Daemon-side eviction decisions in the runner journal:
journalctl --user -u kainbain-runner-local-alpha --since '2026-11-09' | grep -i 'cap\|evict' | tail -50
```

## 5. Evidence to collect when reproduced

- The exact `Reason:` string from task history (confirms Cause 1 vs bare).
- `ls` + mtimes of the work root at refusal time (cap full of fresh orphans).
- Backend: `GET /tasks/<id>` history showing interrupt -> auto-resume ->
  re-claim cadence, and the escalation row at count 5.
