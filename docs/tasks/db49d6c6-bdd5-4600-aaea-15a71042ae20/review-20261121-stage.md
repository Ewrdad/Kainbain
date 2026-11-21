# Stage Review — `--no-verify` recovery snapshots + per-task daemon containment

Reviewer: PR-review stage (docs-only). Reviewed the branch diff vs `main` and ran the
suites. Verdict: PASS (see final verdict block in the stage output).

## What changed (diff vs main)

- `runner/project.js` — new shared helper `commitRecoverySnapshot(workdir, message, { recoveryBranch, log })`
  owning the recovery-commit argv: repo-local identity + `commit --no-verify -m <message>`,
  a warn log naming the recovery branch and the bypass, and a fail-safe "nothing staged" skip.
  Both call sites now use it:
  - `preserveEvictedWorkdir` (eviction): `recovery: unpushed work parked before eviction (<dir>)`
  - `refreshWorktreeToRemote` (reuse): `recovery: unpushed work from reused worktree (<branch>)`
- `runner/daemon.js` — `runDispatchLoop` wraps `await executeAssignment(...)` in try/catch:
  `STALE_EPOCH` rethrows (fencing must propagate); any other error is logged
  (`logger.error`/`warn`/`console.error`, each guarded) and the loop continues to the
  reap + self-update + next poll. `executeAssignment` still rethrows, so
  `runSingleAssignment` keeps its non-zero-exit contract.
- `runner/project.test.js` — `installFailingHook` fixture (always-fail `pre-commit` via
  `core.hooksPath`, with a probe commit proving it fires) plus:
  - reuse path parks past a failing hook (`recoveredTo` matches `^kb-recovery/t1/`, file in
    `git ls-tree`, worktree clean, exact subject)
  - eviction path parks past a failing hook (same assertions + task-branch tip unchanged)
  - `commitRecoverySnapshot` unit tests: bypasses hooks + warn-logs branch; nothing-staged
    skip; blank-input rejection
- `runner/daemon.test.js` — loop-containment test: first assignment's project path has no
  repo (setup throws), task is interrupt-released, loop logs and serves the next assignment.
- `runner/gitOps.test.js` — scope pin: with a failing hook installed, `commitAndPush` on a
  task branch still rejects and commits nothing (hooks unchanged outside recovery).
- `runner/README.md` — documents the recovery-snapshot hook bypass + warn and the
  per-task loop containment.

## Verification performed this stage

| Check | Result |
|---|---|
| `node --test runner/project.test.js` | 41/41 pass |
| `node --test runner/daemon.test.js` | 158/158 pass |
| `node --test runner/gitOps.test.js` | 11/11 pass |
| Full runner suite (README gate command, 19 files) | 449/449 pass |
| Red→green, recovery tests: scratch copy with `--no-verify` removed | 3 new hook tests FAIL (38 pass / 3 fail) — tests are real regression tests |
| Red→green, daemon test: scratch copy with loop catch reverse-applied | new containment test FAILS (157/158) — catch is load-bearing |
| Scope: `grep -- "--no-verify" runner/` (non-test) | only `runner/project.js:454` inside the helper |
| `kb-recovery` commit creation sites | only the two paths in `project.js`, both via the helper |
| `executeAssignment` rethrow | intact (daemon.js:2373), `runSingleAssignment` contract preserved |
| Post-catch flow | reap + self-update still run after a contained failure (daemon.js:3028+) |

## Review questions

- **Achieves the goal?** Yes. Both `kb-recovery/*` snapshot commits (reuse ~line 840 and
  eviction ~line 518 in project.js) go through one helper that passes `--no-verify`;
  the dispatch loop contains per-task failures instead of exiting 1; regression tests
  cover both paths with a failing pre-commit hook.
- **Followed the plan?** Yes — helper extraction, warn log (survey q3), loop-level catch
  keeping `interrupt` routing (survey q2 = re-queue), `STALE_EPOCH` propagation preserved,
  `runSingleAssignment` untouched, docs updated. One deliberate deviation: SURVEY q1's
  selected answer was "skip checks for all automatic runner saves", but the task goal and
  the plan's non-goals scope the bypass to `kb-recovery/*` only; the new gitOps test pins
  that task-branch commits still run hooks. The task goal text is authoritative here, so
  the implementation is correct as scoped.
- **Code standards / tech debt?** The helper removes duplication rather than adding it;
  the "nothing staged" fail-safe is narrowly matched (`git-failed` + /nothing to commit/i)
  so real git errors still throw. No new dependencies, config, or wire changes. The catch
  block guards every logging sink so the barrier itself cannot throw.
- **Maintainability?** Single home for recovery-commit argv prevents drift between the
  reuse and eviction paths; warn log keeps the bypass discoverable.
- **Docs?** `runner/README.md` recovery/loop section updated; JSDoc on touched functions
  updated. No other docs reference the old behavior.

## Notes / residual risks (accepted, not blockers)

- A persistently failing task will interrupt/re-queue and be reclaimed repeatedly
  (runner survives; task flaps) — same shape as the existing `WORKTREE_CAP_REACHED`
  handling; backoff is out of scope per the plan.
- Bypassed snapshots can park corrupt binaries by design; the warn log names the branch.
