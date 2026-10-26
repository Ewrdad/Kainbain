---
title: Git Index-Lock Runbook
section: working-with
order: 65
slug: git-index-lock-runbook
---

# Git Index-Lock Runbook

**Symptom.** One or more stages fail with `Unable to create '.git/index.lock':
File exists` (often on `git checkout`), sometimes piling several tasks into
`failed` at once. A second symptom: a terminal-`failed` task whose Approve
button does nothing, and whose retry fails the same way.

**Why it happens.** Two engine operations touched the same checkout at the
same time (historically: creating/approving a task while a stage was
running), or a killed git left a stale `.git/index.lock` behind. The engine
now serializes every git mutation through one per-repo gate and auto-heals
stale locks (see below) — this page is for the rare case that still needs
hands.

**Forensics (read-only, run in the project directory).**

```bash
ls -la .git/*.lock
stat -c '%y %n' .git/index.lock
ps aux | grep -E '\bgit\b' | grep -v grep
```

Correlate the lock mtime with the task's `task.md` history timestamps and
the stage-report failure time: the op that died holding the lock is the one
whose start is just before the mtime with no matching completion.

**Manual recovery.** Delete the lock ONLY when no live git process exists
(the `ps` above is empty apart from your grep) — deleting another process's
lock corrupts the index:

```bash
rm .git/index.lock
```

Then retry the stage from the task card. Never delete the lock while a git
process is alive; never delete it "just in case" on a schedule.

**What the engine already does.** On a lock failure `git()` checks
fail-closed: lock exists, no live git process anywhere, lock older than 30s
— only then it removes the lock, journals an audit entry, and retries once.
Lock failures count as transient infrastructure (same-stage bounded retry,
never review feedback), and approving a terminal-`failed` task answers HTTP
409 "retry the stage instead". So in most cases the correct manual action is
just Retry Stage — see Review Gates (`#/docs/review-gates`).
