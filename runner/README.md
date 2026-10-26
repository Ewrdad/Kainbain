# Loopback Runner daemon (`runner/`)

Out-of-process task executor for MigrationPlan Phase 2 (loopback only).
Implements ADR 0009 steps 1–6 over the HTTP wire protocol — no engine,
session, or store access. Capability-aware dispatch (which task to run) is
Phase 3; the assignment is explicit config.

## Onboard (human approval required, D4)

1. Set the join secret on the backend (`KAINBAIN_RUNNER_JOIN_TOKEN`) and
   approve the Runner in Settings › Harness › Runners (or
   `POST /runners/:id/approve`).
2. Start the daemon with the one-time credential shown once in the UI:

```sh
KAINBAIN_RUNNER_BACKEND=http://localhost:3100 \
KAINBAIN_RUNNER_JOIN_TOKEN=<operator secret> \
KAINBAIN_RUNNER_CREDENTIAL=<one-time credential from Settings> \
KAINBAIN_RUNNER_ID=host-1 \
KAINBAIN_RUNNER_HARNESS=mock \
KAINBAIN_RUNNER_PROJECT_ID=<projectId> \
KAINBAIN_RUNNER_TASK_ID=<taskId> \
KAINBAIN_RUNNER_WORK_ROOT=/var/lib/kainbain/runner-work \
node runner/main.js
```

Without `KAINBAIN_RUNNER_CREDENTIAL` the daemon registers, polls until the
join is approved, then exits telling you to paste the credential. It never
fetches the credential back over the wire.

## What one assignment does

register → heartbeat → claim → load the project (remote-backed: clone the
origin into `workRoot/mirrors` and pull, then open a `kb-<taskId>` worktree
on `kb/<taskId>`; local-only: adopt the repo path, push skipped as
`no-remote`) → run the stage through the harness → stream sequenced logs →
commit and push → complete with the SHA. Any failure after the claim
interrupts the task so it re-queues as interrupted, never failed/complete.
Stage advancement stays engine-owned until the dispatch integration lands.

## Safety rails

- Worktree cap ~5 per work root; over-cap runs refuse and name the orphans.
- Boot surfaces orphaned workdirs (unpushed work) in the log; nothing is
  ever deleted by cleanup.
- Log gaps are reported as data (`frames X–Y missing`), never papered over.
- `node --test runner/` runs the daemon suite (no ports, real temp git
  repos, mock harness).
