# Implementation notes — failed-stage report commit recovery under HEAD contention

Task `7f347a7a-0bfd-4a37-9500-a34eb5ee3219`. Implements IMPLEMENTATION_PLAN.md
Phases 1–2 (research, refactor, retry-once recovery, actionable error entry).
Phase 3 (sequence-level HEAD lock) is deliberately left as a stretch goal with
its own exit criteria — see the decision record below.

## What changed

| File | Change |
|---|---|
| `api/git/commit.js` | New exported `assertBranchAffinity(projectCwd, expectedBranch)` — the single branch-affinity guard, byte-identical message, now called from both `commitAllIfNeeded` and `commitEngineSnapshots` (Step 4). |
| `api/git.js` | Re-exports `assertBranchAffinity`. |
| `api/git/branch.js` | `checkoutBranch` gains `opts.snapshotCommit` (default `true`). `false` skips the commit-then-switch snapshot backstop — used by the recovery so no snapshot commit can land on the sibling branch that currently holds HEAD. |
| `api/git/errors.js` | `GitBranchMismatchError` MARK doc updated: documents the failed-stage recovery contract; the guard itself is unchanged and never weakened. |
| `api/work/taskFinalize.js` | `commitFailedStageWork` catch block: on `GitBranchMismatchError` only, runs `_recoverFailedStageCommitAfterHeadMove` (re-establish owning branch via strict `checkoutBranch({ recovery: "off", snapshotCommit: false })`, fail closed on deleted branch / flapping HEAD / foreign dirt, retry `commitAllIfNeeded` exactly once). Success records the usual entry plus the q8 note; unrecoverable records an `Error:`-severity history entry + `[ERROR]` process log naming both branches, the uncommitted report paths, and the remediation, and states that no commit was made on any branch. Non-mismatch errors keep the historical warn-and-null path. Success-path auto-commit (`finalizeTaskBranch`) untouched (survey q3). |
| `site-docs/git-head-contention-runbook.md` | Operator runbook for the new error entry. |
| Tests | `api/work/taskFinalize.test.js` (T1, T2, T3, T6, T7 + T8 sibling-tip assertions, Step-5 contention harness), `api/work/taskFinalize.headContention.unit.test.js` (T4 exactly-once retry, T4b retry success, T5 non-mismatch warn path, flapping HEAD, deleted branch, refused checkout, foreign dirt), `api/git/commit.test.js` (T9 `assertBranchAffinity`: match / mismatch byte-identical message / unreadable HEAD fails closed; permissive-when-unset is covered by the existing `commitAllIfNeeded` test). |

## Step 2 — HEAD movers on the shared checkout (contention surface)

`withRepoGitLock` (`api/work/gitLock.js`) is taken inside `git()`
(`api/git/exec.js`) per single git process. It serializes individual
commands, NOT multi-step checkout→work→commit sequences — confirmed: no
higher-level sequence lock exists. Shared-checkout HEAD movers found:

| Mover | Caller | Worktree-isolated? | Can interleave with a stage's checkout→commit window? |
|---|---|---|---|
| `ensureBranchCheckedOut` (task pickup, base hop) | `api/work/taskBranches.js` (`ensureTaskBranch`) | primary only | yes — this is the case-study mover |
| `checkoutBranch` (CI branch, merge/return paths) | `api/flow/commandStages.js`, `api/git/branch.js` | primary only | yes |
| `returnToDefaultBranch` (post-stage return) | `api/work/taskFinalize.js` (`finalizeTaskBranch`) | primary only | yes |
| `withCheckedOutBranch` (command stages on a CI branch) | `api/flow/commandStages.js` | primary only | yes |
| merge stage / `syncMainToRemoteBestEffort` | `api/git/merge.js`, `api/work/taskBranches.js` | primary only | yes |
| task worktree provisioning | `api/work/taskWorkspace.js` | worktree (`workspaceIsolation: 'worktree'` bypasses this bug — T6) | n/a |

## Step 3 — decision record: retry-once first, sequence lock as Phase 3

Default adopted (survey q1 recommended option): implement the
checkout-and-retry-once recovery (Phase 2) and keep a per-checkout sequence
lock as a stretch goal (Phase 3). Rationale from the Step 2 table: every
mover goes through `api/git/branch.js`, so a future `withRepoHeadLock` held
across checkout→commit sequences would cover the whole surface, but
`withRepoGitLock` is explicitly non-reentrant, so the new gate must be a
separate mutex layer (never a nested take) with bounded waits (q4), contention
counters in the style of `getGitLockStats`, its own load test, and a rollback
switch. The retry window itself is not too racy for a single retry: the
recovery re-reads state before AND after the switch and fails closed on any
surprise (flapping HEAD, new foreign dirt, second mismatch), so a lost race
becomes an actionable error entry, never a wrong-branch commit. Phase 3 exit
criteria remain as in IMPLEMENTATION_PLAN.md §4.

## Verification (observed in this session)

- Repro spike (`/tmp/repro-head-contention.mjs`, throwaway): before the fix
  printed the exact case-study warning and dropped the report; after the fix
  the recoverable path commits on the owning branch and the unrecoverable
  path records the Step 7 error entry.
- `npx vitest run` on `git/commit.test.js`, `git/branch.test.js`,
  `git/branchWorktree.test.js`, `work/taskFinalize.test.js`,
  `work/taskFinalize.headContention.unit.test.js`: all green (114 tests).
- Full `npm run test:api`: see the stage output (run in this session).
- `npx eslint` on all touched files: 0 errors (2 pre-existing warnings).
- `node scripts/check-one-function-per-file.mjs`: PASS.
- `node scripts/check-jsdoc-example.mjs`: PASS.

## Invariants kept

1. No commit ever lands on a sibling task's branch: the `expectedBranch`
   guard is fail-closed and never bypassed; the recovery uses
   `snapshotCommit: false` precisely so no snapshot commit can land on the
   sibling that holds HEAD; T8 asserts the sibling tip SHA is unchanged in
   every contention test.
2. `commitFailedStageWork` still never throws and never blocks failure
   routing (`routeStageError.js`, `commandStages.js` unchanged).
3. Success-path auto-commit behaviour unchanged (T7).
