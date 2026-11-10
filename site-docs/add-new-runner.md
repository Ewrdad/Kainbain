---
title: Adding a New Runner
section: working-with
order: 12
slug: add-new-runner
---

# Adding a New Runner

A **runner** is a background worker process that executes agent stages —
it is the ONLY way agent stages run. Without at least one approved
runner, tasks wait; with more runners (local or remote), more work runs
in parallel.

Local and remote runners run the identical binary and protocol. The
only difference is environment: a local runner points at
`KAINBAIN_RUNNER_BACKEND=http://localhost:3100`, a remote runner at
your backend URL. Every host ships one local runner by default.

## Before you start

- A running backend (Install & Run (`#/docs/install-run`)).
- The backend's join secret: `KAINBAIN_RUNNER_JOIN_TOKEN` must be set on the backend. The runner presents it when registering.
- Node.js on the runner host (same requirement as the backend).
- At least one harness the runner can offer (see Which harnesses below) — or pin `mock` for a zero-credential trial.

## Install the runner

From the repo root (or the runner checkout on a remote host):

```bash
scripts/install-local-runner.sh --id local-pi
# remote host: add --backend https://kainbain.home
# Harnesses auto-detect by default (pi, muse, antigravity, vibe probed on
# PATH); pin with --manual --harness pi or --manual --harnesses pi,muse.
# mock has no CLI, so it is manual-only.
```

The script is idempotent (safe to re-run; it never overwrites an
existing env file or credential) and writes two user-level files:

| File | Purpose |
| --- | --- |
| `~/.kainbain/runner-local-<short>.env` | Runner environment (backend, token, id, harnesses, dispatch). Created with mode `600` |
| `~/.config/systemd/user/kainbain-runner-local-<short>.service` | User systemd unit running `node main.js` |

`<short>` is your id minus the `local-` prefix. The unit is enabled
with `systemctl --user`; on hosts without systemd the files are still
written and you start the daemon by hand (see Run it manually below).

Useful flags: `--id` (required for a second runner; default
`local-alpha`), `--backend` (default `http://localhost:3100`), `--manual`
with `--harness`/`--harnesses` to pin instead of auto-detecting,
`--ensure` (deploy.sh mode: never restarts), `--dry-run` (print paths
only).

## Approve the runner (human approval required)

1. Make sure the backend has `KAINBAIN_RUNNER_JOIN_TOKEN` set (same value as in the runner env file).
2. Start the runner once. Without a credential it registers, shows up as pending, polls until approved, then exits telling you what to paste — that first exit is normal.
3. Open **System Settings › Runners**, find your runner id, and click **Approve**.
4. Copy the **one-time credential** shown once in the UI. It is never shown again.
5. Paste it into the runner env file as `KAINBAIN_RUNNER_CREDENTIAL` and restart the unit: `systemctl --user restart kainbain-runner-local-<short>.service`.

API equivalent: `POST /runners/:id/approve`. Lifecycle controls
(deny, pause, resume, revoke, skip) live on the same screen and under
`POST /runners/:id/<action>`.

## Run it manually

For a trial run without systemd:

```bash
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

Without `KAINBAIN_RUNNER_CREDENTIAL` the daemon registers, polls until
the join is approved, then exits telling you to paste the credential.
It never fetches the credential back over the wire. Direct
`node runner/main.js` is dev-only for long-lived runners: production
runners should use the restart wrapper `runner/bin/kainbain-runner`
so self-updates can restart the daemon (see Self-update below).

## Dispatch mode (start here for services)

Set `KAINBAIN_RUNNER_DISPATCH=1` (the installer already does) and the
daemon runs the capability-aware dispatch loop instead of one explicit
assignment: after the same join + heartbeat prologue it polls
`POST /runners/dispatch`, the backend matches claimable tasks against
this runner's capabilities (harnesses, models, tiers, disk), and the
loop runs each assignment, then polls again.

```bash
KAINBAIN_RUNNER_DISPATCH=1 \
KAINBAIN_RUNNER_PROJECTS=<projectId allowlist, optional> \
KAINBAIN_RUNNER_DISPATCH_POLL_MS=5000 \
KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=3 \
node runner/main.js
```

- No `PROJECT_ID`/`TASK_ID` is needed in dispatch mode.
- After 3 (default) consecutive empty polls the daemon exits 0. Set `KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=0` for a persistent service loop that never idles out (the installer's default).

> **Beginners:** leave dispatch on with the installer defaults. You do
> not need to understand the matching to run one local runner.

## What the runner advertises

**Harnesses.** `KAINBAIN_RUNNER_HARNESSES` (csv) wins when set; otherwise
`KAINBAIN_RUNNER_HARNESS` seeds a one-element list; empty or `auto`
probes PATH on boot and fails fast when nothing is found. The first
entry stays the primary harness. Details per harness: Link Runner to Pi
(`#/docs/link-runner-pi`), Link Runner to Muse
(`#/docs/link-runner-muse`), Link Runner to OpenCode
(`#/docs/link-runner-opencode`).

**Models.** `KAINBAIN_RUNNER_MODELS` (csv) wins when set; otherwise the
singular `KAINBAIN_RUNNER_MODEL` seeds one entry; when both are empty,
muse model auto-discovery fills in (see Link Runner to Muse
(`#/docs/link-runner-muse`)). Empty everywhere means unpinned: the
runner matches model-less tasks only. Each assignment serves exactly
the dispatch answer's required model — never a substitution. Verify
with `GET /runners/models/catalogue`.

**Tiers.** `KAINBAIN_RUNNER_TIERS` (default `T0,T1`) scopes which task
tiers this runner accepts.

**Timing.** Heartbeat every `KAINBAIN_RUNNER_HEARTBEAT_MS` (default
15s); approval polling every `KAINBAIN_RUNNER_APPROVAL_POLL_MS`
(default 5s) up to `KAINBAIN_RUNNER_APPROVAL_TIMEOUT_MS` (default 5
minutes).

## Which harnesses exist

The engine's registered harnesses (`api/agent/harnesses/README.md`),
with the integration tier shown in `GET /harnesses`:

| Harness | What it is | Tier | Link guide |
| --- | --- | --- | --- |
| `pi` | In-process Pi coding-agent SDK (engine default) | 1 (maximal) | Link Runner to Pi (`#/docs/link-runner-pi`) |
| `muse` | Headless Muse CLI (`muse serve` session, `muse exec` fallback) | 2 | Link Runner to Muse (`#/docs/link-runner-muse`) |
| `opencode` | OpenCode server client (spawned per project, or `OPENCODE_URL`) | 2 | Link Runner to OpenCode (`#/docs/link-runner-opencode`) |
| `antigravity` | Headless `agy` CLI (two-way ACP session when available) | 2 | Overview only (below) |
| `vibe` | Headless `vibe` CLI (ACP session when available) | 2 | Overview only (below) |
| `codex` | Codex CLI — theoretical shim: refuses with a setup hint until `codex` is installed | 2 (shim) | Overview only (below) |
| `custom` | Your own command line with the curated prompt appended | 3 | Set the command per project; no runner link needed |
| `mock` | Synthetic in-process replies for evaluation/CI — never real AI | 1 (test-only) | Manual-only: `--manual --harness mock` |

Tier meanings: 1 = in-process integration, 2 = two-way programmatic
interface (steerable), 3 = one-way exec, `test-only` = fixture, not a
real harness. Engineer depth lives in
`docs/EngineDetails/HarnessSupportLevels.md`.

**antigravity** needs the `agy` binary on PATH (or `KAINBAIN_AGY_BIN`).
**vibe** needs the `vibe` binary (or `KAINBAIN_VIBE_BIN`) and pins
`KAINBAIN_VIBE_CLI=python` because the harness targets the classic CLI.
**codex** needs the `codex` binary (or `KAINBAIN_CODEX_BIN`) plus
Codex-native auth; until then it reports itself honestly unavailable.
All three are probed by installer auto-detect (antigravity, vibe) or
pinned with `--manual --harness <name>`.

## Health and steering

- **System Settings › Runners** shows every runner: status, heartbeat age, harnesses, models, and lifecycle buttons. A runner that stops checking in goes stale there.
- **On-request commands** ride the heartbeat: Re-detect models re-runs model discovery promptly for every configured harness (acked with per-harness counts; failures keep the previous list; skipped with a "models pinned" ack when you pinned models), and Update now queues an idle-only self-update. Older daemons that predate the channel show manual guidance instead of a dead button.
- **Steering** queued while no execution is live for the runner is ignored (never its work); live sessions receive steers on the next heartbeat.

## Self-update

External runners update themselves from versioned releases — the
backend never ships runner code. The supported entrypoint is the
restart wrapper (`runner/bin/kainbain-runner` with
`KAINBAIN_RUNNER_INSTALL_ROOT`, default a `runner-install` sibling of
the work root): on idle it checks hourly (jittered), verifies the
manifest signature plus asset hash, atomically flips `current` to the
new tree (keeping `previous` for rollback), and exits 0 so the wrapper
restarts it. Opt out with `KAINBAIN_RUNNER_AUTO_UPDATE=0`; air-gapped
mirrors use `KAINBAIN_RUNNER_UPDATE_URL`. A `409
RUNNER_VERSION_BELOW_MINIMUM` answer means the backend floor moved past
the runner: it self-updates immediately when idle and retries.

Rollout across a mixed fleet is safe in both directions: new runners
and new backends degrade gracefully against old counterparts, so you
can update runners one host at a time.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Runner exits telling you to paste a credential | Normal before approval: approve in System Settings › Runners (or `POST /runners/:id/approve`), paste the one-time credential as `KAINBAIN_RUNNER_CREDENTIAL`, restart |
| Runner stays pending | Backend unreachable (`curl http://localhost:3100/status`), wrong join token, or wrong backend URL in the env file |
| Approved but goes stale | Runner process died or network dropped; check `systemctl --user status kainbain-runner-local-<short>.service` and the heartbeat age in Settings |
| Expected models missing from the catalogue | Pinned list wins over discovery; unpin to let muse discovery fill in, or check that harness's link guide. Other harnesses are manual-only |
| `update failed` badge in Settings | Self-update failed contained (bad network, tampered asset, missing tar): the runner keeps serving the old version — retry Update now when idle |
| Work root filling up | Worktree cap is ~5 per work root; over-cap runs refuse naming the orphans. Cleanup never deletes unpushed work |

## See also

- First-Time Setup (`#/docs/first-time-setup`) — the ordered path.
- Ports & Environment (`#/docs/ports-env`) — backend knobs.
- Link Runner to Pi (`#/docs/link-runner-pi`), Link Runner to Muse (`#/docs/link-runner-muse`), Link Runner to OpenCode (`#/docs/link-runner-opencode`).
