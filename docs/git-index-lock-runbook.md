# Runbook: `.git/index.lock` Pile-ups

Symptoms: one or more tasks park as `failed` with
`fatal: Unable to create '<repo>/.git/index.lock': File exists` (exit 128),
often on `git checkout <default>` at a human gate, with APPROVE buttons that
do nothing and retries that re-park as `failed`.

Since the serialization-gate fix, the engine auto-recovers provably stale
locks (no live git process, lock older than 30s) and retries the op once,
with an audit line in task history ("Recovered stale git lock …"). Use this
runbook when tasks still pile up — i.e. the fail-closed refusals fired.

Verification signals and thresholds (what "provably stale" means):

- **Holder scan (ownership):** machine-wide `/proc` cmdline scan, `ps -eo
  args` fallback. ANY live `git` process — in any checkout — blocks
  recovery (`live-holder`). When neither source works the scan is
  `inconclusive` (`unknown-holder`) and the lock is left in place. The
  engine never kills a holder and never steals its lock.
- **Process age:** lock `mtime` older than `STALE_GIT_LOCK_AGE_MS` (30s). A
  younger lock (`fresh-lock`) may belong to a just-spawned process the scan
  cannot see yet, so it is left in place.
- **Worktree-aware path:** the assessed lock is `<gitdir>/index.lock` where
  gitdir resolves through a worktree `.git` FILE pointer — linked-worktree
  locks are found at their own gitdir.
- **Journal:** every recovery records `{ lockPath, ageMs,
  verificationBasis, recoveredAt }`; task flows drain it into history and
  the process log as `Recovered stale git lock '<path>' (age <N>s, no live
  git process held it) and retried the operation [verification: <basis>]`.
  Every refusal names its reason (`live-holder`, `fresh-lock`,
  `unknown-holder`, `no-lock-file`) the same way, so the surfaced error
  tells you exactly what to check.

## 1. Forensics (read-only)

On the affected checkout (NOT inside a stage run):

```bash
ls -la .git/*.lock          # lock present? note the mtime
ps aux | grep -E " git( |$)" | grep -v grep   # any live git process?
git status --short | head   # read-only ops still work (they skip the lock)
```

Correlate the lock mtime with task `task.md` history timestamps and stage
report FAILED times to find which op died holding the lock.

Rule out a second engine sharing this checkout (the in-process gate cannot
hold across processes):

```bash
ps aux | grep -E "node .*index\.js|kainbain" | grep -v grep
docker ps --format '{{.Names}} {{.Image}} {{.Mounts}}'
```

More than one KainBain server (host + container, dev + prod) serving the
same project cwd defeats the in-process queue: stop the duplicate instead of
changing code. There is no pidfile/singleton enforcement — this is a known
follow-up, not a supported topology.

## 2. Manual recovery (only when no git process is alive)

If `ps` shows NO live git process and the lock is older than a minute, the
engine's next gated op recovers automatically — just retry the stage. If you
must clear it by hand (engine stopped, or you need the tree now):

```bash
# Prove no live holder first. Never kill the holder to take its lock:
# wait for it, or stop it through its own normal mechanism.
ps aux | grep -E " git( |$)" | grep -v grep
rm .git/index.lock
```

Never delete the lock while a git process is alive, and never in response to
index corruption — a corrupt index needs `git fsck` / re-clone diagnosis,
not deletion plus a commit.

## 3. Recovering the parked tasks

Do NOT approve terminal-`failed` tasks: approve answers HTTP 409 ("retry
the stage instead of approving") and the UI hides APPROVE on failed tasks.
The recovery path is **Retry Stage** (prominent on the failure banner),
which re-dispatches and now passes once the lock is gone.

## 4. If pile-ups recur after this fix

- Check `gitContention` in the observability snapshot: `waits` climbing
  with piling stages points at git demand outside the gate (e.g. a new
  caller spawning git directly instead of through `git()` in `api/git.js`
  — fix the caller, not the gate).
- Agent-spawned git writes (an agent running `git commit` mid-stage) are
  outside the gate by design; agents are instructed not to switch branches.
- Two servers on one checkout: unsupported (see section 1).
