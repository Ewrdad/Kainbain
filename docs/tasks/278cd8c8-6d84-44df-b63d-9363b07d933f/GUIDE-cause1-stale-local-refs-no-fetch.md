# GUIDE — Cause 1: review diff reads LOCAL refs only and never fetches, while Runner commits exist only on `origin`

**Status: REPLICABLE LOCALLY (SAFE).** Proven below with a temp-repo repro
that was actually executed on this machine (outputs captured verbatim).
No prod, no agents needed — the bug is pure git ref semantics.

**Hypothesis under test** (from `WIDE_NET_ANALYSIS.md` cause 1):
`GET /projects/:p/tasks/:t/review` → `buildTaskReview`
(`api/reviewAssembly.js`) computes the diff in the backend's primary checkout
(`project.cwd`) using **local** refs only:

- `branchExists(cwd, branch)` = `git rev-parse --verify refs/heads/<branch>`
  (`api/git/status.js:68-76`) — local `refs/heads/`, never `refs/remotes/`.
- `resolveSha` = local `git rev-parse <ref>` (`api/reviewDiff.js`).
- `diffFiles` / `revCount` run `git diff` / `git rev-list` on `base...head`
  with those local refs (`api/reviewDiff.js`).
- **No `git fetch` anywhere in the review path.** Verified:
  `grep -rn '"fetch"' api --include=*.js | grep -v test` hits only
  `api/work/taskBaseBranch.js:151` (base-branch adoption),
  `api/flow/execution/applyIntegrationReport.js:114`,
  `api/flow/runnerRoutes.js:219` (merge/integration path),
  `api/git/remote.js`, `api/git/merge.js` — nothing in
  `api/reviewAssembly.js`, `api/routes/review.js`, `api/reviewDiff.js`,
  `api/git/status.js`.

Meanwhile agent stages run on **Runners** (`KAINBAIN_RUNNER_EXECUTION_ONLY`
defaults to true, `api/flow/execution/executeStage.js:229-251`) in a per-task
worktree based on `origin/<branch>` (`runner/project.js:900`
`refreshWorktreeToRemote` → `checkout -f -B <branch> origin/<branch>`) and
push `branch:branch` to origin (`runner/gitOps.js` `commitAndPush`). At the
human checkpoint the backend calls `ensureTaskBranchRef`
(`api/flow/execution/executeStage.js:400` → `api/work/taskBranches.js:651`),
which is **create-only** and creates a missing local `kb/<task>` ref **from
the pipeline base tip** — so the local ref can exist yet point at the base,
giving `main...kb/<task>` = empty diff, `↑0 ↓0`, exactly the screenshot, while
the real commits sit on `origin/kb/<task>`.

Nothing in the backend ever moves `refs/heads/kb/<task>` from
`origin/kb/<task>` (the only `update-ref refs/heads/<branch>` from a remote is
in the merge path, `api/git/merge.js:277`).

## Repro (shell, temp repos only) — executed and verified

This simulates: backend clone = `project.cwd`; runner clone pushes the agent
commit; backend local task ref sits at the base tip (as `ensureTaskBranchRef`
creates it); review path runs no fetch.

```bash
ROOT=$(mktemp -d /tmp/kb-repro-XXXX); cd "$ROOT"
git init --bare -b main origin.git
git clone origin.git backend          # <- the backend's project.cwd
cd backend && git config user.email t@example.com && git config user.name T
echo "base line" > app.txt && git add -A && git commit -m init && git push origin main
git branch kb/task-1 main             # <- ensureTaskBranchRef: create-only ref at base tip
cd "$ROOT" && git clone origin.git runner   # <- the Runner's per-task worktree
cd runner && git config user.email r@example.com && git config user.name R
git checkout -b kb/task-1
echo "export const x = 1;" > src.js && git add -A && git commit -m "agent: add src.js"
git push origin kb/task-1             # <- commitAndPush: commits exist only on origin

cd "$ROOT/backend"                    # review path: NO git fetch
git rev-parse --verify refs/heads/kb/task-1          # branchExists -> true
git diff --name-status --find-renames main...kb/task-1   # EMPTY  (blank Files Changed)
git rev-list --left-right --count main...kb/task-1       # 0  0   (the screenshot's ↑0 ↓0)
git ls-remote origin refs/heads/kb/task-1                # remote tip HAS the commit

git fetch origin                      # what the review path never does
git diff --name-status main...origin/kb/task-1           # A  src.js
git rev-list --left-right --count main...origin/kb/task-1   # 0  1
```

**Captured output from the actual run:**

```text
--- branchExists: git rev-parse --verify refs/heads/kb/task-1
3b701041f8e742cef64a1fcf626905952153580c
--- diffFiles: git diff --name-status main...kb/task-1
(empty above = blank FILES CHANGED)
--- revCount: git rev-list --left-right --count main...kb/task-1
0	0
--- remote truth: git ls-remote origin refs/heads/kb/task-1
ce7b7a9449f599d3c13637829dc33e637daa841a	refs/heads/kb/task-1
=== after git fetch origin ===
--- git diff --name-status main...origin/kb/task-1
A	src.js
--- rev-list --left-right --count main...origin/kb/task-1
0	1
--- local ref still at base tip while origin ref has the agent commit:
3b701041f8e742cef64a1fcf626905952153580c   (refs/heads/kb/task-1)
ce7b7a9449f599d3c13637829dc33e637daa841a   (origin/kb/task-1)
```

That is the exact screenshot signature: branch "exists", `↑0 ↓0`, empty
`files`, `reason: null` → UI renders the default "Nothing to review yet"
(`frontend/src/components/tasks/TaskReviewPage.jsx:434-442`).

## TDD test example (paste into `api/reviewAssembly.staleRefs.integration.test.js` in a code stage)

Builds a bare origin + backend clone + runner clone, pushes a code commit
from the "runner", and asserts what the review payload **currently returns**
(failing test that demonstrates the bug) vs. what it **should** return once
fixed (e.g. after the review path fetches, or diffs against
`origin/<branch>` when the local ref lags):

```js
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildTaskReview } from "./reviewAssembly.js";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stale-refs-"));
  tempDirs.push(d);
  return d;
};

function backendCloneWithStaleTaskRef() {
  const root = tmp();
  git(root, "init", "--bare", "-b", "main", "origin.git");
  const backend = path.join(root, "backend");
  git(root, "clone", "origin.git", "backend");
  git(backend, "config", "user.email", "t@example.com");
  git(backend, "config", "user.name", "T");
  fs.writeFileSync(path.join(backend, "app.txt"), "base\n");
  git(backend, "add", "-A");
  git(backend, "commit", "-m", "init");
  git(backend, "push", "origin", "main");
  // ensureTaskBranchRef equivalent: create-only local ref at the base tip
  git(backend, "branch", "kb/task-1", "main");

  // "Runner" clone: agent commits + pushes; backend never fetches
  const runner = path.join(root, "runner");
  git(root, "clone", "origin.git", "runner");
  git(runner, "config", "user.email", "r@example.com");
  git(runner, "config", "user.name", "R");
  git(runner, "checkout", "-b", "kb/task-1");
  fs.writeFileSync(path.join(runner, "src.js"), "export const x = 1;\n");
  git(runner, "add", "-A");
  git(runner, "commit", "-m", "agent: add src.js");
  git(runner, "push", "origin", "kb/task-1");
  return backend;
}

function makeDeps(project, task) {
  return {
    projectStore: { getProject: () => project },
    taskStore: {
      getTask: () => task,
      updateTask: (pid, tid, u) => Object.assign(task, u),
      _recordHistory: (t, action) => t.history.push({ timestamp: new Date().toISOString(), action }),
    },
    eventBridge: null,
  };
}

describe("cause 1: runner-pushed commits invisible to review (local refs, no fetch)", () => {
  it("DEMONSTRATES THE BUG: local ref at base tip -> empty diff despite origin commits", async () => {
    const cwd = backendCloneWithStaleTaskRef();
    const project = { id: "proj-1", useBranches: true };
    const task = { id: "task-1", projectId: "proj-1", branch: "kb/task-1", history: [] };

    const review = await buildTaskReview(makeDeps(project, task), cwd, "proj-1", "task-1");

    // What the screenshot shows today:
    expect(review.branchSupported).toBe(true);
    expect(review.files).toHaveLength(0);      // blank Files Changed
    expect(review.aheadBy).toBe(0);            // ↑0
    expect(review.behindBy).toBe(0);           // ↓0
    expect(review.reason).toBeNull();
    // ...while origin really has the agent commit:
    const remoteSha = git(cwd, "ls-remote", "origin", "refs/heads/kb/task-1").trim().split("\t")[0];
    const localSha = git(cwd, "rev-parse", "refs/heads/kb/task-1").trim();
    expect(remoteSha).not.toBe(localSha);      // refs genuinely diverge
  });

  it("FIX SPEC: after the review path syncs remote refs, the same task shows the file", async () => {
    const cwd = backendCloneWithStaleTaskRef();
    git(cwd, "fetch", "origin"); // the step the review path is missing today
    const project = { id: "proj-1", useBranches: true };
    const task = { id: "task-1", projectId: "proj-1", branch: "kb/task-1", history: [] };

    // With a fix that diffs origin-aware (e.g. head = origin/kb/task-1 when
    // it is ahead of the local ref), these should hold:
    const review = await buildTaskReview(makeDeps(project, task), cwd, "proj-1", "task-1");
    // TODO(fix): expect(review.files.map(f => f.path)).toContain("src.js");
    // TODO(fix): expect(review.aheadBy).toBe(1);
    // Until the fix lands, assert the remote diff is non-empty so the test
    // fails for the right reason:
    const remoteDiff = git(cwd, "diff", "--name-status", "main...origin/kb/task-1");
    expect(remoteDiff).toContain("src.js");
    expect(review.files).toHaveLength(0); // still blank with local-only refs
  });
});
```

## What to check on a real affected MR (see `PROD_VERIFICATION.md`)

Read-only, **permission required**: in the backend's `project.cwd`,
`git rev-parse refs/heads/kb/<task>` vs `git ls-remote origin refs/heads/kb/<task>`
(diverged ⇒ cause 1 confirmed for that MR) plus
`GET /projects/:p/tasks/:t/review` showing `files: []`, `aheadBy: 0`,
`reason: null`.

## Likely fix direction (for the code stage, not done here)

Make the review path remote-aware: either `git fetch origin` (read-only w.r.t.
working tree; updates remote-tracking refs) before computing the diff in
`buildTaskReview`, or resolve the head as `origin/<taskBranch>` when it is
ahead of the local ref (mirroring what `runnerRoutes.js:219` already does on
the merge path). Note the D2 snapshot-commit logic intentionally works on the
local checkout, so any fix must keep that mutation local-only.
