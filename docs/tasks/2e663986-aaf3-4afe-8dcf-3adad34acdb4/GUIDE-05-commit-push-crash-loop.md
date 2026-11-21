# GUIDE 05 — Stage-end commit/push failure crash loop (pre-commit hooks, git faults)

Cause 5 in `WIDE_NET_ANALYSIS.md`. On the deployed 0.1.0 build a stage-end
`commitAndPush` failure takes the generic catch: bare interrupt + rethrow ->
`exit(1)` -> systemd `Restart=always` -> re-claim -> agent re-runs -> same
commit failure -> loop, until the death bound parks the task. Documented
precedent: task `1cae113f` — "the runner restarted over 10,000 times in a
crash loop after the commit failed" (corrupt PNGs vs the pre-commit binary
guard). Fix `046a6391` (deterministic git failure -> FAILED completion, never a
crash) merged 11-21 09:38 in `7ac148ce` — after every observed interruption —
and still needs runner rollout. Ruled out on the one forensically examined
case (`7f6220c3` Merge resolver: commit+push succeeded, killer was the 413 —
see GUIDE 02).

- **Verdict: REPLICABLE-LOCALLY** for the mechanism (temp git repo + failing
  pre-commit hook; no agent needed — call `commitAndPush` directly). A full
  e2e with a real agent stage is PROD-ACTION (flagged in §4).
- **Code seams:** `runner/gitOps.js:114` `commitAndPush(...)` attaches
  `err.gitFailure = buildGitFailureDetails(...)` on hook/commit failure;
  `shared/gitFailure.js` -> `isDeterministicGitFailure` (true for
  `HOOK_REJECTED` / `COMMIT_FAILED` / `MERGE_CONFLICT`,
  `shared/gitFailure/isDeterministicGitFailure.js:17-24`);
  `runner/daemon.js:2316-2380` — deterministic git failure ->
  `client.complete({ outcome: "failed", failureKind: "commit-failed",
  gitFailure, committed: false })` and **return** (never rethrow);
  `runner/daemon.js:2441-2452` — everything else rethrows (fatal on
  `Restart=always`).

## 1. Signature (recognise it)

- Task history: bare (on 0.1.0) interrupt **after `finished`** (post-harness,
  in the commit/push/complete phase), preceded by a multi-minute run; worktree
  `kb-<taskId>` on the runner host has **no** stage-output commit (contrast
  with GUIDE 02, where the commit IS present).
- Runner journal: `Runner failed: <git/hook error>` + `commit failed (...)`
  on 0.2.0, plus `restart counter` increments each lap.
- Loop ends only via the `runner-death-loop` park at 5 consecutive interrupts.

## 2. Safe local replication — failing hook classifies as deterministic (runner, `node:test`)

Proposed file (code stage): `runner/gitOps.hookCrashLoop.test.js`

```js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { commitAndPush } from "./gitOps.js";
import { isDeterministicGitFailure } from "../shared/gitFailure.js";

function git(dir, args) { execFileSync("git", args, { cwd: dir, stdio: "ignore" }); }

function repoWithFailingHook() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-hook-"));
  git(dir, ["init", "-q"]); git(dir, ["config", "user.email", "t@t.t"]); git(dir, ["config", "user.name", "t"]);
  // pre-commit hook that always rejects (stands in for the binary guard refusing a corrupt PNG)
  fs.mkdirSync(path.join(dir, ".git", "hooks"));
  fs.writeFileSync(path.join(dir, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho 'binary guard: corrupt image' >&2\nexit 1\n");
  fs.chmodSync(path.join(dir, ".git", "hooks", "pre-commit"), 0o755);
  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  git(dir, ["add", "."]);
  return dir;
}

describe("commit/push crash loop (Cause 5)", () => {
  let dir;
  beforeEach(() => { dir = repoWithFailingHook(); git(dir, ["checkout", "-qb", "kb-t1"]); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("hook rejection -> RunnerGitError with gitFailure.kind HOOK_REJECTED, deterministic", async () => {
    fs.writeFileSync(path.join(dir, "g.txt"), "y");
    await assert.rejects(
      commitAndPush({ workdir: dir, branch: "kb-t1", message: "stage output" }),
      (err) => {
        assert.ok(err.gitFailure, "structured gitFailure attached");
        assert.equal(isDeterministicGitFailure(err.gitFailure), true);
        assert.match(err.gitFailure.summary || err.message, /hook|pre-commit|binary guard/i);
        return true;
      },
    );
  });

  it("TDD red-test for the pre-0.2.0 behaviour: daemon must NOT rethrow deterministic git failures", async () => {
    // On >= 0.2.0 the daemon branch at runner/daemon.js:2316 reports
    // outcome:'failed' and returns; assert the classification that gates it:
    const err = await commitAndPush({ workdir: dir, branch: "kb-t1", message: "m" }).catch((e) => e);
    assert.equal(isDeterministicGitFailure(err.gitFailure), true); // => daemon returns failed completion, no crash
  });
});
```

Run: `node --test runner/gitOps.hookCrashLoop.test.js`

## 3. Safe local replication — the loop composition (api, vitest)

Pin the backend reaction to repeated bare interrupts after `finished` (same
shape as GUIDE 01 §3 but with `reason: null`, post-`finished`): proposed
`api/flow/executionLedger.commitLoop.test.js` asserts five bare interrupts on
one stage escalate and park (`runner-death-loop`), and that a 0.2.0 runner
would instead have sent `complete({ outcome: "failed", failureKind:
"commit-failed" })` — assert `ledger.snapshot().completions` increments and
NO interrupt is recorded. (Reuse the `claimed(ctx)` mock harness from
`api/flow/executionLedger.test.js`.)

Run: `cd api && npx vitest run flow/executionLedger.commitLoop.test.js`

## 4. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION`:

```bash
# E5 — per post-`finished` interrupt, does kb-<taskId> contain a stage-output commit?
# (read-only on the runner host; do NOT reap worktrees)
for t in 158394ab db49d6c6 1cae113f 7f6220c3; do
  echo "== $t"; git -C ~/.kainbain/kb-$t log --oneline -3 2>/dev/null || echo "(no worktree)";
done
# journal sweep for commit/hook failures, both hosts:
journalctl --user -u kainbain-runner-server2-alpha --since '2026-11-19' | grep -iE 'commit failed|hook|pre-commit' | tail -30
# PROD-ACTION variant: re-running any parked task to watch the loop live would
# invoke a real agent on the live backend — only with explicit permission.
```

## 5. Evidence to collect when reproduced

- Hook stderr text and the `gitFailure` payload (`kind`, `phase`, `summary`).
- Daemon journal: on 0.2.0 a single `commit failed (...)` + FAILED completion;
  on 0.1.0 the repeating `Runner failed:` + `restart counter` increments.
- Worktree state: no stage-output commit present (distinguishes Cause 5 from
  Cause 2).
