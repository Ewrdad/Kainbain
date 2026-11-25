---
title: Git HEAD-Contention Runbook
section: reference
order: 67
slug: git-head-contention-runbook
---

# Git HEAD-Contention Runbook

**Symptom.** A task history entry reading `Error: failed-stage report for
'<stage>' could NOT be committed — … No commit was made on any branch.` (with
`[ERROR]` in the process log). The failed stage's report file exists in the
project but is not committed on the task branch.

**Why it happens.** KainBain's default workspace mode shares one checkout
between tasks. A concurrent task can move `HEAD` to its own branch while
another task's stage is running. When the failed stage then tries to
auto-commit its report, the branch-affinity guard correctly refuses to commit
on the wrong branch. The engine now re-establishes the owning branch and
retries the commit once automatically; this runbook covers the case where
that recovery is refused because the tree is not provably the failed task's
own (e.g. a sibling task has uncommitted work in the shared checkout).

**What the engine already does.** On a branch mismatch the failed-stage
auto-commit re-checks out the task's own branch (never creating, never
stashing, never committing anything onto the sibling branch) and retries the
commit exactly once. A successful retry records a `Note: HEAD had moved to …`
entry. If recovery is unsafe — the owning branch was deleted, `HEAD` is
flapping, or the tree holds uncommitted work outside the task's own
`docs/tasks/<id>/` report paths — the engine records the actionable error
above and commits nothing.

**Manual recovery.** In the project directory on the shared checkout:

```bash
git status                 # see what is uncommitted and on which branch you are
git branch --show-current  # the sibling branch that moved HEAD
```

Commit or set aside the foreign (sibling) changes — never mix them into the
failed task's branch — then commit the report onto the owning branch:

```bash
git checkout kb/<failed-task-id>
git add docs/tasks/<failed-task-id>/
git commit -m "KainBain (task <id>): failed-stage report for '<stage>'"
```

or simply re-run the failed stage, which re-establishes its own branch.

**Never** force-push or hand-edit another task's branch to "fix" the drift,
and never commit one task's files while the checkout is on a different task's
branch — the guard exists because cross-task commits once produced spurious
merge conflicts.
