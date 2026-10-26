# ADR 0006 — Git workspace isolation and lock contention recovery ladder

**Status:** Accepted
**Date:** 2026-10-09
**Task:** `43416ad3-3582-4ecd-bebe-81f8cdc2b3c5`

## Context

In operational audits (AUDIT.md §3.4, §6.2 OCTAVE Vulnerability 2, PFMEA F-03, F-04, F-13, F-14, F-15, Bowtie Scenario 3), git working tree issues are identified as the most frequent operational source of unscheduled human intervention:
1. **Single working tree contention:** All tasks execute inside the repository's single primary working tree (`project.cwd`). If an agent, build step, or operator leaves any untracked, unignored file in the repository, subsequent tasks fail immediately with `GitDirtyTreeError`.
2. **Stale lock stalls:** Stale `.git/index.lock` files left by crashed processes or concurrent operations block subsequent git operations without sufficient process ownership verification.
3. **Merge conflict diagnostics:** Merge conflicts produce unstructured errors lacking source/target commit SHAs, merge bases, and strategy details necessary for autonomous Tier 3 failback resolution.
4. **Zero-unique-commit branches:** Branches with no changes produced by prior stages attempt doomed merges rather than short-circuiting to failback with structured ghost-task diagnostics.

## Decision

We establish git workspace isolation, an ordered dirty-tree recovery ladder, hardened lock reaping, actionable merge conflict diagnostics, and a zero-commit fast path.

### D1 — Isolation mechanism: Scoped quarantine first, opt-in worktrees second
- **Scoped artifact quarantine (default):** Engine artifacts and task-specific scratch files are quarantined under `.kainbain/quarantine/`, `.kainbain/worktrees/`, and `.kainbain/tmp/`. These paths are included in `DEFAULT_IGNORED_PATHS`, ensuring that task artifacts do not contaminate the primary tree's cleanliness check.
- **`git worktree`-per-task (opt-in per project via `workspaceIsolation: 'worktree'`):** Work-stage executions provision an isolated worktree under `<project>/.kainbain/worktrees/<taskId>` for branch `kb/<taskId>`. Work-stage commands execute with `cwd = worktreeDir`.
- **Primary checkout ownership:** Integration operations (the `merge` stage and default-branch maintenance) always execute from the primary checkout (`project.cwd`).
- **Mutex keying:** `normalizeRepoKey` detects linked worktrees via `.git` file pointers and normalizes them to the primary repository path, ensuring that all worktree operations serialize under the primary repository's `withRepoGitLock`.

### D2 — Ordered dirty-tree auto-recovery ladder
Before parking a task or surfacing `GitDirtyTreeError`, the engine executes an ordered recovery sequence:
1. **Ignored-artifact sweep:** Check whether uncommitted files match sweepable temporary or engine artifact patterns; remove them and re-evaluate cleanliness.
2. **Stash with task marker:** If tracked modifications remain, create a marked stash (`git stash push -m "kainbain-task-<taskId>"`). The stash ref is recorded in task history and process logs so resume can restore it.
3. **Detailed failure report:** If untracked user files still block the switch, throw `GitDirtyTreeError` carrying `dirtyPaths` and `recoveryAttempts`, formatting a structured failure report with exact paths and recovery attempt details for the Tier 3 prompt.

**Scope (narrow by design):** the ladder runs only on work-stage pickup
(`ensureTaskBranch`). The merge-stage pre-switch guard, the merge-stage
main-branch checkout, and the finalize return-to-default step stay strict
(`recovery: 'off'`): at those points a dirty tree may be the operator's
uncommitted review work, and stashing it would silently drop it from the
integration they asked for. Strict guards fail the stage loudly instead, so
the work stays visible and recoverable.

**Opt-outs:** `dirtyTreeRecovery: 'off'` or `workspaceIsolation: 'off'`
(project settings) make the work-stage pickup guard strict too, restoring the
pre-ladder immediate refusal for operators who want it.

### D3 — Hardened lock reaping with process age and ownership verification
- Keep in-process serialization (`withRepoGitLock`) as the single gate owner in `git()`.
- Extend `maybeRecoverStaleLock`:
  - Verify `.git` file vs. directory for worktree compatibility, locating the appropriate `index.lock`.
  - Machine-wide holder scan via `/proc` and `ps` to verify that no active `git` process is executing.
  - Process age verification: ensure the lock's `mtimeMs` is strictly older than `STALE_GIT_LOCK_AGE_MS` (30s) and that no live process was spawned around or after lock creation.
  - Fail closed on `live-holder`, `fresh-lock`, or `unknown-holder` (inconclusive).
  - Record the audit journal entry with `verificationBasis` and age.

### D4 — Actionable merge conflict diagnostics
- Extend `GitMergeConflictError` to capture `{ conflictedFiles, sourceSha, targetSha, baseSha, strategy }`.
- In `mergeTaskBranchIntoMain`, build a structured conflict block detailing branch names, commit SHAs, strategy, and conflicted file paths.
- Forward this structured block into the Tier 3 failback prompt (`failureDetails`) to enable autonomous resolution by agents.

### D5 — Zero unique commits fast path (ghost-task detection)
- In `mergeTaskBranchIntoMain`, when `uniqueCommits === 0 && !landed`:
  - Detect empty task branches before attempting any checkout of the default branch or merge.
  - Route immediately to `handleStageFailure` with a structured ghost-task diagnostic.
  - Prevent doomed `git merge` execution and guide the agent back to work stages.

## Consequences

- Sibling task artifacts and stray build files under quarantine paths no longer block task execution.
- Worktrees provide full filesystem isolation for parallel task runs when opted in.
- Stale locks are safely auto-recovered with verified ownership heuristics, preventing pipeline stalls.
- Tier 3 failback prompts receive machine-actionable conflict diagnostics and ghost-task explanations.
