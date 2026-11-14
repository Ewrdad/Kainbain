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
# PATH plus the standard install dirs ~/.local/bin and ~/bin, each harness's
# own install dir, and pi additionally via its ~/.pi/agent models.json
# snapshot — so SDK-only pi installs that are not on the service PATH are
# still detected); pin with --manual --harness pi or
# --manual --harnesses pi,muse. mock has no CLI, so it is manual-only.
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

`KAINBAIN_RUNNER_MODELS` is the servable-model pin the backend matches
against (csv; singular `KAINBAIN_RUNNER_MODEL` seeds a 1-element pin;
empty matches model-less tasks only). Every pin must be a canonical
fleet id (`<harness>::<provider>::<model>[::<effort>]`) for a harness in
`KAINBAIN_RUNNER_HARNESSES` — anything else (a bare id, a 2-part
`provider::model` key, a harness that is not enabled) is dropped at load
with a boot warning and listed in `facts.errors`, never advertised.
(Auto-detect installs skip the harness-membership check — the set is
still unknown at load — but still enforce the fleet grammar.) The advertised list is the
**pin ∪ auto-discovered ids** (survey q2: a brand-new harness model —
e.g. a fresh Muse release — appears in the fleet catalogue automatically
on the next scan, no pin edit needed): discovery runs at boot, every
cadence tick, and on Re-detect EVEN WHEN PINNED, and the pin is never
dropped, so a broken scan cannot hide it. Set
`KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1` to opt in to
discovery-wins instead (a non-empty discovery result replaces the pin,
the pin only fills in while discovery yielded nothing). Each
assignment serves exactly the dispatch answer's required model — never
a substitution.

The daemon auto-discovers models with one leg per configured harness
(`runner/harnessModelDiscovery.js`), each reusing its backend
harness's own `listModels()` so "ready to use" means the same thing on
both sides (box-local login — keys never leave the host). Only models
ready right now are listed; ids advertise in the fleet grammar
`<harness>::<provider>::<model>`:

| Harness | Source | Notes |
|---|---|---|
| `pi` | pi SDK availability snapshot | Needs `~/.pi/agent` login; empty login reports `PI_MODELS_EMPTY` (login state in the message) |
| `muse` | `muse serve --provider <p> --no-session-log` stdio `model/list` | Same spawn shape as the backend MSP catalogue (provider defaults to `meta`); needs the `muse` CLI (resolved off-PATH too); missing CLI = `MUSE_MSP_BIN_MISSING`, zero-row answer = `MUSE_MSP_MODELS_EMPTY` |
| `antigravity` | `agy models` spawn + parse | Classified `{code,message,hint}` errors |
| `vibe` | ACP handshake model select | Exec-only hosts list nothing (honest empty + retained error) |
| `opencode` | `GET {OPENCODE_URL}/config/providers` | Needs `OPENCODE_URL` (+ `OPENCODE_SERVER_PASSWORD`); unset = honest empty + `OPENCODE_NOT_CONFIGURED` |
| `codex` | — (live transport unverified) | Always honest empty + `CODEX_DISCOVERY_UNAVAILABLE` |
| `custom` / `mock` | — | No legs by design (`mock` is test-only, `custom` manages its own model) |

Legs accept ids exactly like the shared grammar (`parseModelKey`): segments
must be non-empty and free of the `::` separator, while a single `:` inside
an id (e.g. `muse-spark-1.4:cloud`) is legal and advertised — a stricter
leg filter used to drop such rows silently, hiding brand-new models from
the fleet catalogue.

Every leg fails loud into its status slot: an empty or failed scan keeps the
previous ids for that harness and records a classified `{code,message,hint}`
(the ack detail carries the first code, Settings shows the warning), so a
bare `0` with `ok: true` never hides a broken login or an empty catalogue
again. When auto-detect sees harnesses the Runner is not configured to serve
(a harness installed after the env file was written), the round also warns
`harness auto-detect also sees: …` in the journal and on the re-detect ack —
re-detection scans configured harnesses only, so the operator must add the
harness (or use `auto`) and restart. Every configured harness always has an
entry — never `{}`: a harness with no scan yet reads
`{ ok: false, error: { code: 'NOT_YET_RUN' } }` (legless `mock`/`custom`
always read this way); a leg whose module never shipped reads
`LEG_MODULE_MISSING` (boot self-check for the harness module itself,
seed round for its npm deps — same code either way); a round that
throws above the legs records `ROUND_FAILED` on every harness it did not
touch (per-leg errors recorded microseconds earlier are kept).

Discovery runs once at boot and refreshes every
`KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS` (default 12h; `0`
disables all scanning). Failures keep the previous list per harness
and warn, never break heartbeats; the per-harness counts and first
error ride the heartbeat as `facts.discoveryStatus` and surface in
Settings › Runners next to the Re-detect button. Slices older than
`KAINBAIN_RUNNER_DISCOVERY_STALE_MS` (default 24h) keep their ids but
report `stale: true` — stale models stay listed and usable, the flag only
tells Settings the scan is overdue. Dropped pins and other config problems
ride every heartbeat as `facts.errors`. The heartbeat also
names the effective advertisement source (`facts.modelSource`:
`pinned` / `pinned+discovered` / `discovered` / `unpinned`, mirroring
`resolveAdvertisedModels` branch-for-branch) plus per-model provenance
(`facts.modelProvenance`: detecting leg + detected-at per id), so
Settings › Runners shows WHY a Runner's model list looks the way it
does — `(pinned on Runner)` / `(pinned on Runner + auto-detected)` vs
`(auto-detected from Runner)` with the last scan time — instead of
hiding pins and cadence gaps.

Harness auto-detect (`detectAvailableHarnesses` in `runner/daemon.js`,
default when `KAINBAIN_RUNNER_HARNESS`/`HARNESSES` is empty or `auto`)
probes the same locations as the backend's own `discoverHarnesses`
(`api/agent/harnessDiscovery.js`): PATH, then the standard install dirs
(`~/.local/bin`, `~/bin` on POSIX), then each harness's own install dir
(pi: `~/.pi/agent/bin`, `$PI_AGENT_DIR/bin`), plus `KAINBAIN_*_BIN` env
overrides (a set override replaces the default names — a typo'd override
reads as missing, never falls back); pi additionally counts as installed
when its agent dir holds a `models.json` snapshot (`~/.pi/agent/models.json`
or `$PI_AGENT_DIR/models.json`) — SDK-only pi installs are frequently not
on the service PATH (e.g. a systemd unit's minimal PATH), and PATH-only
probing used to miss them, so their models never reached the fleet
catalogue. Detection names only the binary each harness actually spawns
(antigravity: `agy`), so a detected harness can always run stages.
`startRunner.sh` probes the same set at install time to validate, then
records `auto` in the env file so every boot re-detects; `--manual` pins a
list (also how to deliberately exclude an installed harness).

Migration note: this release generalizes discovery from muse-only to
one leg per harness, and changes pinned-model semantics from pin-wins
to pin ∪ discovered — an install with `KAINBAIN_RUNNER_MODELS`/
`KAINBAIN_RUNNER_MODEL` set now scans (boot, cadence, Re-detect) and
advertises its pin PLUS every auto-detected id, so new harness models
appear without editing the pin; the pin itself is never lost to a
broken scan. Unpinned installs advertise auto-detected ids for every
configured harness (previously muse-only). To let auto-detect REPLACE
an explicit pin, set `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`.

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
- `node --test runner/ciBranchWorkdir.test.js runner/daemon.test.js runner/client.test.js runner/impromptu.test.js runner/config.test.js runner/gitOps.test.js runner/harness.test.js runner/logEvents.test.js runner/modelDiscovery.test.js runner/harnessModelDiscovery.test.js runner/project.test.js runner/updates-check.test.js runner/updates-daemon.test.js runner/updates-fixture.test.js runner/updates-manifest.test.js runner/updates-platform.test.js runner/updates-state.test.js runner/updates-verify.test.js runner/updates-wrapper.test.js`
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
pinned key in `runner/updates/verify.js`, and installs the newest release
that is strictly newer, not a pre-release, and compatible with the backend
it talks to (each manifest's `requires.backendApi` range must admit the
backend API version learned from heartbeats; unknown backend versions
stay ungated). It verifies the asset sha256, atomically flips `current`
to the new tree (keeping `previous` for rollback), and exits 0 so the
wrapper restarts it. When latest verifies but is incompatible, the GitHub
path walks one bounded releases-list page (30 entries, newest-first) for
the newest older release that qualifies. Direct
`node runner/main.js` is dev-only: it stages updates but cannot restart
itself. New knobs:

- `KAINBAIN_RUNNER_UPDATE_URL` — release pointer override for air-gapped
  mirrors (a base serving `manifest.json` + `.minisig` + assets plus an
  optional `releases.json` index for multi-release selection, or a full
  `manifest.json` URL as an explicit single-candidate pin). Default is
  the GitHub `releases/latest` API.
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
not supported in v1 (linux/darwin × x64/arm64). Operator procedures
(release cutting, rollback, wrapper migration, "says out of date"
triage) live in `docs/runner-update-runbook.md`.

## On-request commands (ADR 0013)

Settings › Runners can nudge this daemon through the heartbeat pull channel:
Re-detect models re-runs model discovery promptly for every configured
harness (bypassing the 12h gate once; acked as
`discovered N model(s) (pi:12, muse:3)` with the first leg error code
when a leg fails, cache kept; a Runner with no legged harness acks
`discovered 0 model(s) (no discovery legs configured)`; skipped with
a `models pinned` ack when the operator pinned models, unless
`KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1` opts in to discovery-wins)
and Update now queues an idle-only self-update. Both ride
`pendingCommands` on the heartbeat response and ack via `facts.commandAck`;
a queued command waits for the next heartbeat, and Update now never
interrupts live work — it applies at the next idle point. Older daemons
that predate `facts.commands` ignore the channel; Settings shows manual
guidance instead of a dead button.

## Build identity and stale-code detection

Every heartbeat reports `versions.build` (`{ sha, builtAt, dirty, source }`),
`versions.bootedAtMs`, and `versions.codeChangedSinceBoot`:

- Packaged Runners carry the release stamp (`source: "package"`): the
  commit, bundle time, and tree dirtiness recorded by
  `scripts/package-runner.mjs` at bundle time.
- Dev Runners booted from a git checkout compute it at boot instead
  (`source: "checkout"`): `git rev-parse HEAD` plus dirty from
  `git status --porcelain` scoped to `runner/`. No bundle time exists for
  a live checkout, so `builtAt` is null. Outside a checkout with no stamp
  every field is null ("unknown") — never a boot failure.
- At boot the daemon fingerprints its own `runner/` tree (file count,
  bytes, newest mtime); each heartbeat rescans cheaply and reports
  `codeChangedSinceBoot: true` once any file changes underneath the
  running process (edits, added/removed files). `.git` and
  `node_modules` are never scanned.

Settings › Runners shows the short sha next to the version badge and warns
(warn-only, never a block) when the code changed after boot or when the
build sha differs from the backend commit. Dev checkouts show their build
info but never warn. Old Runners without build identity show "unknown"
with no warning, and old backends ignore the new `versions` keys.
