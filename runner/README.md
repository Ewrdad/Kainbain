# Runner daemon (`runner/`)

Out-of-process task executor — the ONLY way agent stages run (runner-only).
Implements ADR 0009 steps 1–6 over the HTTP wire protocol — no engine,
session, or store access. The assignment is explicit config by default;
`KAINBAIN_RUNNER_DISPATCH=1` switches to the capability-aware dispatch
loop (WP-3.1), where the backend picks each task.

Local and remote Runners run the identical binary and protocol. The only
difference is environment: a local Runner points at
`KAINBAIN_RUNNER_BACKEND=http://localhost:3100`, a remote Runner at the
backend URL (e.g. `https://kainbain.home`). Every host ships one local
Runner by default — install it with:

```sh
scripts/install-local-runner.sh --id local-pi --harness pi
# remote host: add --backend https://kainbain.home
```

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

## Dispatch loop (WP-3.1)

```sh
KAINBAIN_RUNNER_BACKEND=http://localhost:3100 \
KAINBAIN_RUNNER_JOIN_TOKEN=<operator secret> \
KAINBAIN_RUNNER_CREDENTIAL=<one-time credential from Settings> \
KAINBAIN_RUNNER_ID=host-1 \
KAINBAIN_RUNNER_HARNESS=mock \
KAINBAIN_RUNNER_MODELS=<csv this host can serve, optional> \
KAINBAIN_RUNNER_DISPATCH=1 \
KAINBAIN_RUNNER_PROJECTS=<projectId,optional allowlist> \
KAINBAIN_RUNNER_DISPATCH_POLL_MS=5000 \
KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=3 \
node runner/main.js
```

`KAINBAIN_RUNNER_MODELS` is the servable-model advertisement the backend
matches against (csv; singular `KAINBAIN_RUNNER_MODEL` seeds a 1-element
list; empty matches model-less tasks only). Each assignment serves
exactly the dispatch answer's required model — never a substitution.

Model reporting contract (`servingModelFor` / `formatPosture` in
`runner/servingModel.js`, mirrored in `api/flow/`): the `prompted`
progress event and the completion `posture` string carry the assignment's
served model — the dispatch requirement, falling back to the Runner
default only for LLM stages. CI / merge / integrate assignments serve
no model and report none (never the Runner default, never the literal
`"default"`): the progress body omits the field and the posture string
omits the trailing `:model` segment, so the UI hides the model pill.

In dispatch mode no `PROJECT_ID`/`TASK_ID` is needed. After the same
join + heartbeat prologue the daemon polls `POST /runners/dispatch`:
the backend scans claimable tasks, matches them against this Runner's
capabilities (harnesses, models, tiers, disk), and claim-fences the
winner. The loop runs each assignment exactly like an explicit one,
then polls again until `DISPATCH_IDLE_LIMIT` consecutive polls come
back empty (`NO_CLAIMABLE_TASKS` / `NO_CLAIMABLE_MATCH` with a miss
histogram), at which point it exits 0. Set
`KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=0` for a persistent service loop
that never idles out (the cutover local-Runner mode). A `STALE_RUNNER`
answer triggers one fresh heartbeat and a single retry. Alias
(`harness: alias`) stages resolve server-side through the shared
backend-central rotation before matching, so the daemon needs no alias
configuration.

## Steering (D5)

The daemon pulls operator steers on every heartbeat and delivers each
to the live session (`session.steer`, falling back to `session.followUp`),
acking exactly once. A session with neither method NACKs
`UNSUPPORTED_HARNESS` — loud, never silently dropped. Steers queued
while no execution is live for this Runner are ignored (never ours).

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
