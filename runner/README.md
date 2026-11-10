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
scripts/install-local-runner.sh --id local-pi
# remote host: add --backend https://kainbain.home
# Harnesses auto-detect by default (pi, muse, antigravity, vibe probed on
# PATH); pin with --manual --harness pi or --manual --harnesses pi,muse.
# mock has no CLI, so it is manual-only.
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

When no models are pinned, the daemon auto-discovers them: for the
`muse` harness it asks the installed CLI over its own wire protocol
(`muse serve` stdio `model/list`, box-local login — keys never leave
the host) and advertises the returned ids (`muse::<provider>::<model>`).
Discovery runs once at boot and refreshes every
`KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS` (default 12h, `0`
disables); failures keep the previous list and warn, never break
heartbeats. A pinned list always wins over discovered ids. Other
harnesses have no discovery yet and stay manual-only.

Model reporting contract (`servingModelFor` / `formatPosture` in
`shared/` — one copy executed by both this Runner and the backend via
`api/flow/runnerPosture.js`): the `prompted` progress event and the
completion `posture` string carry the assignment's served model — the
dispatch requirement, falling back to the Runner default only for LLM
stages. CI / merge / integrate assignments serve no model and report
none (never the Runner default, never the literal `"default"` — the
engine-wide blank-pick sentinel counts as no model): the
progress body omits the field and the posture string omits the trailing
`:model` segment, so the UI hides the model pill. The backend ingest
applies the same rule, so pre-fix Runners degrade gracefully mid-rollout.

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

## Impromptu read-only jobs (ADR 0014)

Separate from the task queue, idle daemons also poll the backend's impromptu
T0 channel — today that is the retrospective chat ("quiz a task" turns).
Task dispatch keeps priority: the impromptu poll only runs on a dispatch
iteration that found no claimable task, so chat work never preempts a task,
and a Runner holding a live task lease is never assigned impromptu work
(enforced server-side too). Set `KAINBAIN_RUNNER_IMPROMPTU=0` to opt the
daemon out entirely; the operator-side `jobTypes.runsImpromptu` switch in
Settings › Runners is enforced as well (off = the backend never assigns).

The wire contract (all `x-runner-credential` authed, same gates as dispatch):

- `POST /runners/impromptu/poll` → `{ assigned: false, code: "NO_IMPROMPTU_WORK" }`
  or `{ assigned: true, job: { jobId, projectId, kind, prompt, harness, model, timeoutMs, turnId } }`.
  A job is claimed with a TTL; a dead Runner's stale claim requeues for
  another idle Runner.
- `POST /runners/impromptu/:jobId/progress` `{ seq, delta }` — streamed deltas;
  the backend fans them out as `CHAT_PROGRESS` WebSocket frames for the UI.
- `POST /runners/impromptu/:jobId/complete` `{ outcome: "completed" | "failed", output?, error? }`
  — settles the waiting HTTP chat turn (retried completes are idempotent).

Execution is strictly read-only: `runImpromptuJob` (`runner/impromptu.js`)
creates the harness session with `readOnly: true` and NO worktree, NO git
branch, NO claim — the project checkout is opened in place and the per-job
scratch dir is removed afterwards. The compiled prompt repeats the rule
(read files / query the API; never run tests, never modify files). The job
never appears in `GET /tasks`, never creates a report or verdict, and never
touches the main queue.

## What one assignment does

register → heartbeat → claim → load the project (remote-backed: clone the
origin into `workRoot/mirrors` and pull, then open a `kb-<taskId>` worktree
on `kb/<taskId>`; local-only: adopt the repo path, push skipped as
`no-remote`) → run the stage through the harness → stream sequenced logs →
commit and push → complete with the SHA. Any failure after the claim
interrupts the task so it re-queues as interrupted, never failed/complete.
Stage advancement stays engine-owned until the dispatch integration lands.

Agent-failure detection: when the agent calls the `fail_stage` tool or ends
with a well-formed `KAINBAIN_VERDICT: FAIL` block (reason AND fix guidance),
the daemon completes with `outcome: "failed"`, `failureKind: "rejected"`,
and the `[Agent Review Rejection] …` reason — the same shared verdict
decision (`shared/stageVerdict.js`) the embedded path makes — so the backend
fails the stage back instead of advancing it. A reasonless FAIL still passes
open with a warning, and CI/integration work never consults a verdict.
A latched `fail_stage` call also wins over a later harness exception,
exactly as the embedded path prefers it over a prompt failure.

Rollout across a mixed fleet is safe in both directions: a new Runner
reporting `failed`/`rejected` lands on the backend's long-standing failed
path (no new backend needed), and a new backend re-checks a `passed`
report's output for a well-formed FAIL block, so an old Runner that never
learned detection still cannot advance a rejected agent stage. The only
gap during rollout is a `fail_stage` tool call alone (no verdict block) on
an old Runner — its session events never leave the host, so the backend
cannot see them until that Runner self-updates.

## Safety rails

- Worktree cap ~5 per work root; over-cap runs refuse and name the orphans.
- Boot surfaces orphaned workdirs (unpushed work) in the log; nothing is
  ever deleted by cleanup.
- Log gaps are reported as data (`frames X–Y missing`), never papered over.
- `node --test runner/ciBranchWorkdir.test.js runner/daemon.test.js runner/client.test.js runner/impromptu.test.js runner/config.test.js runner/gitOps.test.js runner/harness.test.js runner/logEvents.test.js runner/modelDiscovery.test.js runner/project.test.js runner/updates-check.test.js runner/updates-daemon.test.js runner/updates-fixture.test.js runner/updates-manifest.test.js runner/updates-platform.test.js runner/updates-state.test.js runner/updates-verify.test.js runner/updates-wrapper.test.js`
  runs the daemon suite (no ports, real temp git repos, mock harness).
  Name each file: a bare `node --test runner/` directory arg mis-resolves
  on current Node, and this same explicit list is what the `Unit Tests
  (runner)` gate branch runs (`scripts/run-tests.mjs`, pinned by
  `tests/run-tests.test.mjs` so a new suite file fails loudly instead of
  silently never running).

## Self-update (Option A, ADR 0012)

External Runners update themselves from versioned GitHub Releases — the
backend never ships runner code. The supported entrypoint is the restart
wrapper:

```
KAINBAIN_RUNNER_INSTALL_ROOT=$HOME/.kainbain/runner-install \
  runner/bin/kainbain-runner
```

On idle (no active task) the dispatch loop checks the release pointer on a
jittered hourly interval, verifies the manifest signature against the
pinned key in `runner/updates/verify.js`, verifies the asset sha256,
atomically flips `current` to the new tree (keeping `previous` for
rollback), and exits 0 so the wrapper restarts it. Direct
`node runner/main.js` is dev-only: it stages updates but cannot restart
itself. New knobs:

- `KAINBAIN_RUNNER_UPDATE_URL` — release pointer override for air-gapped
  mirrors (a base serving `manifest.json` + `.minisig` + assets, or a full
  `manifest.json` URL). Default is the GitHub `releases/latest` API.
- `KAINBAIN_RUNNER_AUTO_UPDATE=0` — opt out of self-update checks.
- `KAINBAIN_RUNNER_UPDATE_CHECK_INTERVAL_MS` — poll base in ms (default
  3600000, min 300000; ±20% jitter).
- `KAINBAIN_RUNNER_INSTALL_ROOT` — install root holding
  `releases/`, `current`, `previous`, `update-state.json` (default:
  `runner-install` sibling of the work root).

A 409 `RUNNER_VERSION_BELOW_MINIMUM` from dispatch/claim means the backend
floor moved past this Runner: it self-updates immediately (when idle,
bypassing the check interval) and retries. Tampered assets/manifests abort
the update, keep the old version, and surface an "update failed" badge in
Settings › Runners via the next heartbeat. Any apply failure (network cut
mid-download, busy updater, missing `tar`) is contained the same way: the
loop backs off and keeps serving the old version, never crashing. Hung
mirrors time out (30s pointer/manifest, 5 min assets). Windows hosts are
not supported in v1 (linux/darwin × x64/arm64).

## On-request commands (ADR 0013)

Settings › Runners can nudge this daemon through the heartbeat pull channel:
Re-detect models re-runs model discovery promptly (bypassing the 12h gate
once; skipped with a "models pinned" ack when the operator pinned models)
and Update now queues an idle-only self-update. Both ride
`pendingCommands` on the heartbeat response and ack via `facts.commandAck`;
a queued command waits for the next heartbeat, and Update now never
interrupts live work — it applies at the next idle point. Older daemons
that predate `facts.commands` ignore the channel; Settings shows manual
guidance instead of a dead button, and the backend refuses the queue with
`409 COMMAND_UNSUPPORTED` for direct API callers. With
`KAINBAIN_RUNNER_AUTO_UPDATE=0`, Update now is honestly reported as failed
("auto-update is disabled on this Runner") — nothing was checked, so no
success is claimed.
