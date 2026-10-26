# Feature Documentation: Git Branch Support

## Overview

KainBain now supports optional per-task git branches to enable better parallelization of work and safer integration.

## Project Configuration

In **Project Settings**, you can toggle `useBranches`.

- **Off (Default):** All work is performed on the project's default branch.
- **On:** Every task is automatically assigned a unique git branch named `kb/<taskId>`.

Two further settings control workspace isolation and dirty-tree recovery
(API fields `workspaceIsolation`, `dirtyTreeRecovery`):

- `workspaceIsolation: "quarantine"` (default) — stages share the primary
  checkout; stray-file tolerance comes from the quarantine paths below plus
  the recovery ladder.
- `workspaceIsolation: "worktree"` (opt-in) — each task gets an isolated
  `git worktree` (see below).
- `workspaceIsolation: "off"` — legacy strict behavior: any dirty tree
  blocks immediately.
- `dirtyTreeRecovery: "ladder"` (default) — run the sweep → stash → report
  ladder before parking; `"off"` restores the immediate refusal.

## Workspace Isolation

### Quarantine mode (default)

Task-scoped scratch artifacts belong under `.kainbain/quarantine/` (and temp
work under `.kainbain/tmp/`). These live under `.kainbain/`, which the
cleanliness guard always ignores — so files staged there never enter the
dirty set and stray sibling artifacts cannot block other tasks' branch
switches. Anything outside the ignored paths still goes through the
recovery ladder (tracked modifications are stashed, engine debris is swept)
or fails loudly with exact paths when it is genuinely user work.

### Worktree mode (opt-in)

With `workspaceIsolation: "worktree"`, work-stage pickup provisions an
isolated worktree at `<project>/.kainbain/worktrees/<taskId>` for branch
`kb/<taskId>` (created from the default tip when missing). Agent and
CI/script commands execute with `cwd` set to the worktree dir; the primary
checkout is never switched by work stages, so no two tasks share a tree and
stray files cannot cross between tasks. The agent prompt names the worktree
directory and tells the agent to stay inside it.

- The merge stage and post-merge/deploy commands always run from the
  primary checkout.
- Finalisation commits and pushes from the worktree, then returns the
  primary checkout to the default branch.
- All worktree git ops serialize under the primary repository's mutex
  (`normalizeRepoKey` resolves linked worktrees to the main repo path).
- Cleanup: deleting a task removes its worktree; every project scan reaps
  worktrees whose task is deleted or terminal (`completed`/`done`/
  `cancelled`). `failed` tasks keep their trees for inspection, and resume
  re-provisions a missing worktree (falling back to the primary checkout).
  Removal failures are warnings, never stage failures.

## Task Lifecycle with Branches

Every work stage follows the same deterministic lifecycle (human stages are create-only — see below):

1. **Move to the default branch** (`master`/`main`, resolved automatically).
2. **Switch to the task branch** (`kb/<taskId>`, created when missing).
3. **Do the work** (agent, CI/script command, or human review).
4. **Commit all changes** on the task branch.
5. **Push the task branch, but only when a remote exists** (pure-local repos skip this silently; a failed push is a warning, never a stage failure).
6. **Switch back to the default branch**, so no stage ever ends stranded on a task branch.

Because every work-stage pickup returns to the default branch first, you can pause mid-pipeline and hand-edit the default branch at any time (for example when KainBain itself is broken): the next work stage passes through the default branch again and picks up cleanly.

Stage differences:

- **Agent and CI/script stages** follow the full lifecycle above.
- **Human stages** never touch the working tree: entering the checkpoint and approving it only ensure the task-branch ref exists (created from the default tip when missing) — no checkout, commit, push, or return. Reviewer edits made while the checkpoint is open stay uncommitted until the operator commits them (agent/CI stages sweep them up; the merge stage refuses a dirty tree).
- **Merge stages** integrate instead of doing task work (see below) and additionally push the default branch when a remote exists.
- **Deploy stages** run their command only and perform no branch operations at all.

If the working tree is dirty (excluding engine artifacts in `docs/tasks/` and `.kainbain/`) where a switch is required, the engine runs the ordered dirty-tree recovery ladder before failing. The ladder runs on **work-stage pickup**; the merge-stage switch/checkout and the finalisation return-to-default stay strict and refuse loudly. Set `dirtyTreeRecovery: "off"` (or `workspaceIsolation: "off"`) to make work-stage pickup strict too:

1. **Ignored-artifact sweep** — untracked engine debris (`*.tmp`, `*.bak`, `*.orig`, `*.rej`, `*~`, `.DS_Store`, anything under `.kainbain/tmp/` or `.kainbain/quarantine/`) is deleted. User files never match: they survive to step 3.
2. **Stash with task marker** — tracked modifications are preserved via `git stash push -m "kainbain-task-<taskId>"`. The stash ref is recorded in task history and process logs so Tier 1 resume can restore it with `git stash pop`. (The finalisation return-to-default stays strict: dirt after the commit step means the commit failed, and that refuses loudly instead of stashing work the merge would never restore.)
3. **Detailed failure report** — if untracked user files still block the switch, the stage fails with `GitDirtyTreeError` carrying every blocking path plus the full `recoveryAttempts` trail (sweep result, stash result/ref) into the Tier 3 failback prompt.

Every ladder action is journaled into task history like stale-lock recoveries. A branch with zero unique commits and no landed evidence never reaches the merge at all: it short-circuits to failback with a ghost-task diagnostic naming the empty branch, the integration branch, the landed-evidence state, and the last work-stage outcome. (An untouched branch sitting exactly at the main tip already satisfies ancestry, which counts as landed evidence — so that shape takes the landed re-entry below instead of the ghost refusal. This distinction is intentional: only the frozen review-baseline marker or real ancestry proves a merge happened, and an empty branch is git-identical to an already-merged one.)

## The Merge Stage

The `merge` stage performs the following sequence:

1. **Switch to the task branch** (it is picked up default-first like any other stage) and **auto-commit** any uncommitted changes there.
2. **Switch to the default branch.**
3. **Merge:** The task branch is merged into the project's default branch (e.g., `master` or `main`).
4. **Post-Merge Command:** An optional bash command (e.g., `./deploy.sh --prod`) is executed after a successful merge.
5. **Auto-commit** the post-merge output, then **push the default branch** when a remote exists (push failure stays a warning).

### Merge Conflicts

If a merge conflict occurs:

- The system automatically runs `git merge --abort` to restore the working tree to a clean state.
- The stage fails with a clear error message listing the conflicted files **plus a structured diagnostics block**: source branch + SHA (task branch at merge attempt), target branch + SHA (main at merge attempt), merge-base SHA, the strategy used (`merge --no-edit`, auto-abort on conflict), and the conflicting file list.
- The same payload travels machine-readable as `lastError.gitDiagnostics` (`{ kind: "merge-conflict", taskBranch, mainBranch, sourceSha, targetSha, baseSha, strategy, conflictedFiles }`) so failback agents can resolve each listed file and retry the merge stage autonomously.
- Standard failback options (Previous, Start, Abort, or specific stage) are provided to the operator.

### Once the merge has landed

The merge stage has two failure domains. Failures *before* the git merge lands
(conflict, missing branch, dirty tree, empty branch) fail back exactly like any
other stage failure. But once the task branch has been merged into the default
branch, that merge is never rewound: a failing post-merge command parks the
task as `failed` on the merge stage instead of sending it back to an earlier
stage. Retrying (including resume after a restart) skips the already-landed
merge and re-runs only the post-merge command.

Two more landed-state edge cases are handled the same way (parked `failed` on
the merge stage — never rewound, never silently skipped):

- **Pruned task branch.** If the task branch was deleted after its merge
  landed (manual `git branch -d` housekeeping), a retry does not fail with
  “branch does not exist” and does not recreate an empty branch — the merge
  is known to have landed, so the stage continues straight to the post-merge
  command on the main branch.
- **Broken commit-count check.** If the unique-commit read fails while a
  landed-merge marker exists, the state is ambiguous: the stage parks
  `failed` with an explicit “already landed … unique-commit check failed”
  reason and a retry re-measures with a healthy git. The failure is loud on
  purpose — a quiet skip here could complete the task with unmerged work.

### Timeout Guidance

Post-merge commands (like production deployments) can be long-running. The default merge timeout is 1800s (30 minutes). If your deployment exceeds this, set a custom **Timeout** override on the merge stage in the Workflow Canvas.

## Safety Invariants

- **No Shell Strings:** All git operations use `spawn` with argument arrays to prevent injection.
- **Dirty Tree Guard:** Branches are never switched if the working tree is dirty.
- **No Half-Merges:** All conflicts trigger an immediate abort.
- **No Self-Integration:** Agents are strictly forbidden from performing their own merges via prompt-level guards.

## Serialization Gate (single-gate rule)

Every engine git process — reads and writes — runs inside `git()` in
`api/git.js`, which holds the per-repository mutex `withRepoGitLock`
(`api/work/gitLock.js`, keyed by the repo's real path). No engine code path
may run a mutating git branch operation outside this gate: task creation
defers branch provisioning to the first work-stage pickup (creating a task
performs zero git work), approvals only ensure the branch ref exists, and the
review snapshot commits under the same gate. The existing execution queue
serializes stages; the mutex additionally serializes everything outside the
queue, so concurrent branch operations can never overlap on
`.git/index.lock`. Composed helpers (`ensureTaskBranch`,
`finalizeTaskBranch`, the merge stage) rely on the `git()`-level gate and
must NOT re-take the mutex (it is not reentrant). Contention is observable
via `gitContention` in the observability snapshot (next to
`schedulerStats`): `waits > 0` proves the gate is serializing demand.

## Stale Lock Recovery

A crashed or SIGKILLed git can orphan `.git/index.lock`, which then fails
every later index-writing op. On a lock failure `git()` assesses the lock
fail-closed and recovers only when all three hold: the lock file exists, no
live `git` process exists anywhere, and the lock is older than 30s
(`STALE_GIT_LOCK_AGE_MS`). Recovery removes the lock, journals an audit
entry (drained into task history by the branch flows), and retries the op
once. Anything else — fresh lock, live holder, inconclusive scan — fails
loudly with the check outcome appended, and the lock is left in place.

Hardening notes (WP5):

- The lock path resolves worktree-aware: a linked worktree carries a `.git`
  FILE pointing at its own gitdir, and the worktree's `index.lock` is
  assessed there (previously misreported as "no git dir").
- Every assessment records a `verificationBasis` (holder-scan outcome +
  lock age vs threshold); recoveries journal it, and the history line reads
  `Recovered stale git lock '…' (age Ns, …) … [verification: …]`.
- The holder scan is machine-wide (`/proc` cmdline scan, `ps -eo args`
  fallback): a live `git` in ANY checkout blocks recovery. Holders are
  never killed and locks never stolen.
- Two servers on one checkout remain unsupported (no cross-process mutex).

Lock failures classify as transient infrastructure: the same stage retries
in place with the transient budget and the lock text never becomes review
feedback. A task parked as terminal `failed` cannot be approved (HTTP 409
— retry the stage instead); retry re-dispatches and recovers once the repo
is healthy. See `docs/git-index-lock-runbook.md` for forensics and manual
recovery.
