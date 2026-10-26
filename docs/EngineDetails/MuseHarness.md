# Muse Code Harness

How KainBain runs agent stages on the Muse Code CLI (`muse exec`) through a
dedicated harness (`api/agent/harnesses/muse/`, id `"muse"`).

For zero-code use today, see the Tier 0 recipe in
[CustomHarness.md](./CustomHarness.md) (`muse exec --yolo --workspace .` via
the custom-command harness). This document covers the **Tier 2** dedicated
harness: a two-way MSP session over `muse serve` by default, with the
per-turn `muse exec` path as the rollback.

## Transports (Tier 2 default, Tier 3 rollback)

`KAINBAIN_MUSE_MSP` selects the session transport:

- **`auto` (default)** — the MSP transport when the resolved `muse` binary
  advertises the `serve` subcommand (or an explicit `KAINBAIN_MUSE_MSP_BIN`
  is set); otherwise the `exec` transport. Old `muse` installs and offline
  test mocks keep working unchanged.
- **`on`** — force the MSP transport (fails loudly if the host cannot start).
- **`off`** — force the legacy per-turn `exec` transport (the documented
  rollback; every MSP error hint names it).

### MSP transport (`muse serve`)

One supervised `muse serve` **host per project workspace** (reference-counted
with an idle TTL, `KAINBAIN_MUSE_MSP_HOST_IDLE_TTL_MS`), one MSP **session**
per KainBain session. The host speaks NDJSON JSON-RPC 2.0 (stdout is
protocol-only; stderr is diagnostics) and the client lives in
`api/agent/harnesses/muse/msp/`:

- `MspClientConnection.js` — framing, pending-request map, inbound
  `approval/request` / `userInput/request` hooks, UUIDv7 `commandId` handles.
- `MspSessionRuntime.js` — detached process group, SIGTERM→SIGKILL
  escalation, stderr ring, 30 s handshake ceiling (ACP parity).
- `museMspEventMapper.js` — `item/*` → the normalized event vocabulary,
  `turn/completed{terminal}` → settle, `session/tokenUsage` /
  `session/contextUsage` → live usage telemetry; `reminderChild` / prompt
  echo noise ignored.
- `museMspSession.js` — the HarnessSession surface: `prompt` →
  `turn/start`, `steer` → `turn/steer` (with `expectedTurnId`, so input can
  never leak into another turn), `abort` → `turn/interrupt`,
  `listModels`/`switchModel` → `model/list` + `session/setModel`,
  `getContextUsage`, and `session/resume` reconnect after a host restart.
- `museServeHostPool.js` / `museMspModelCatalog.js` / `museMspSupport.js`.

Handshake: `initialize` → the MANDATORY `initialized` notification
(GOTCHA-1) → `model/list` → `session/start` (workspace pinned as
`workspaceRoot`, never the daemon cwd). The `initialize` result's
schema fingerprint and sandbox posture are logged; drift is recorded loudly.

**Reliability.** Startup failures are classified (bin-missing / timeout /
auth / discovery) and fail over to the exec transport with a loud
`KAINBAIN_MUSE_MSP=off` hint. A host that dies mid-turn settles the turn as a
`run_error` (never a silent hang); the next turn reconnects a fresh host and
resumes the session (up to 5 attempts).

**Permission policy (per-request interception).** `serve` fixes sandbox
posture for the host's lifetime, so the operator-chosen YOLO default becomes
the per-session approval mode `allowAll` (select-never-create from the CLOSED
enum `allowAll | promptUnmatched | onRequest | denyUnmatched`);
`KAINBAIN_MUSE_YOLO=0` selects `onRequest`. Every `approval/request` is
answered from policy with a per-decision log line (`[MUSE MSP] approval
<tool>: …`), and an unrecognised option shape DEFAULT-DENIES — the decision
travels as `approval/decide`, guarded by the requirement id. `userInput/*`
answers `cancel` by policy in v1 (no interactive answer UI yet).

## Failure modes (how this harness can fail — all loud, none silent)

Every failure path below either fails the stage loudly (a `run_error` event
AND/OR a `prompt()` rejection, which the engine classifies as an
infrastructure failure and retries) or degrades to an honest, logged
fallback. Nothing fails silently.

| Failure | Behaviour |
|---|---|
| Transport selection | `auto` engages MSP only when the binary advertises `serve` (or `KAINBAIN_MUSE_MSP_BIN` is set); a false negative keeps the safe exec path. `KAINBAIN_MUSE_MSP=off` is the documented rollback and is named in every MSP error hint. |
| Host cannot start | Classified (`MUSE_MSP_BIN_MISSING` / `MUSE_MSP_TIMEOUT` / `MUSE_MSP_AUTH_REQUIRED` / `MUSE_MSP_HANDSHAKE_FAILED` / `MUSE_MSP_DISCOVERY_FAILED`), logged with the rollback hint, and the session FAILS OVER to the exec transport — never a silent no-op. A dispatch-resolved model is still pinned (`--model`) on the fallback. |
| Host dies mid-turn | The pending turn settles as `run_error` and rejects ("muse serve host exited mid-turn"); the next turn reconnects a fresh host and resumes via `session/resume` (up to 5 attempts, then the turn fails loudly). |
| Turn wedged (watchdog) | At `KAINBAIN_MUSE_TIMEOUT_MS` the watchdog sends `turn/interrupt`; if the turn still has not settled within `KAINBAIN_MUSE_MSP_TURN_SETTLE_GRACE_MS` (default 30 s), the turn force-settles as `run_error` + rejection and the host is EVICTED from the pool (`invalidate` — the next turn gets a fresh host). |
| Approval/userInput with an unusable shape | Answered with a JSON-RPC error (default-deny) — never a guessed choice id. `userInput/request` is declined by policy (`userInput/cancel`). |
| Server→client request for a sibling session | The session's listener ABSTAINS (`undefined`) so the owning session answers. Nobody claiming → method-not-found (-32601); a claiming listener's failure is the answer. |
| Shared host carries several sessions | Listeners are REGISTERED on the runtime, never assigned (assignment would clobber a sibling); every frame is filtered by its own MSP sessionId, so two sessions never consume each other's turns. |
| No `session/close` on the wire | The MSP schema (69 methods) has none — the client never sends it. Disposing releases the lease; the host stays warm for the project until `KAINBAIN_MUSE_MSP_HOST_IDLE_TTL_MS` elapses (an evicted-but-alive host is never killed under its holders; the idle TTL reaps it). |
| Exec run exits without a terminal record | `run_error` with exit code + stderr tail; the engine-side watchdog SIGTERM→SIGKILL backs every run; an aborted run settles as `run_finished` interrupted, never `run_error`. |
| `muse export` fails or is unreadable | The history read degrades to the honest empty history (`{ messages: [], tree: [] }`) with a `console.error` — a history read never breaks a page. |
| Model-catalogue probe fails | The stale snapshot keeps serving (a failed refresh never blanks a previously good catalogue); the classified failure surfaces via `getModelDiscoveryStatus()`. |
| Host omits `windowTokens` | `getContextUsage()` normalizes to `{ current, limit }` NUMBERS with `limit: 0` = honest unknown (never invented). |

## Wire format (`muse exec --json`)

Newline-delimited JSON envelopes, one per line:

```json
{ "schema_version": 1, "stream": {"kind": "session", "id": "…"},
  "sequence": N, "record_type": "reconciliation|event|status",
  "durability": "durable|ephemeral",
  "payload_type": "…", "payload": { … } }
```

Key rows (probe-verified):

| payload_type | record_type | Meaning |
| --- | --- | --- |
| `runtime.command.accepted` | reconciliation | command accepted (ignored) |
| `session.run.linked` | event | run stream bound (ignored) |
| `turn.input.user` | **status** | prompt echo (ignored) |
| `run.lifecycle.started` | event | run began → `run_started` |
| `task.lifecycle.*` (proposed/accepted/scheduled/started/completed/failed/…) | event | **task-level noise — many per run, ignored by design** |
| **`run.output.delta`** | **status** | assistant text delta (`payload.text`) → `assistant_delta` |
| `task.lifecycle.side_effect_intent` (`operation: "tool:<name>"`) | event | tool start → `tool_started` (other operations ignored) |
| `task.lifecycle.output` (`event.chunk`) | event | tool output chunk → `tool_updated` |
| `tool.result` (`payload.text`) | event | tool finish → `tool_finished` |
| `task.lifecycle.completed` | event | per-task end — **not** the run end (ignored) |
| **`run.terminal.completed`** | event | **authoritative run end** (`payload.text` = final output) → `run_finished` |
| **`run.terminal.failed`** | event | run failure (`payload.reason`) → `run_error` |

Two nuances a naive port gets wrong (findings F-01/F-02):

1. **Terminal records, not task lifecycles.** `task.lifecycle.completed`
   fires once per task (several per run), and `task.lifecycle.failed` fires
   even in *successful* runs. Only `run.terminal.completed` /
   `run.terminal.failed` mark the run's end.
2. **`run.output.delta` is `record_type: "status"`.** The parser and mapper
   key on `payload_type`, never on `record_type === "event"`.

Exit-code handling: exit 0 **with** `run.terminal.completed` → success;
exit ≠ 0 (or exit 0 without a terminal record, e.g. bad `--workspace`
which emits zero stdout events) → synthesize `run_error` from exit code +
stderr tail. An engine-initiated abort settles as
`run_finished{interrupted:true}` — never an agent error.

## Permission policy (YOLO by default — no approval UI exists yet)

```
muse exec
  --workspace <abs project.cwd>   # always pinned, never the cwd default
  --approval-mode never           # always passed (matters when yolo is off)
  --json                          # event stream
  --yolo                          # DEFAULT on; omit via KAINBAIN_MUSE_YOLO=0
  [--no-session-log]              # only when KAINBAIN_MUSE_NO_SESSION_LOG=1
  [--trust-workspace]             # only when KAINBAIN_MUSE_TRUST_WORKSPACE=1
  [--model <id>]                  # only when a model is resolved (v2 passthrough)
  [--prompt-file <tmpfile>]       # when prompt > 64 KiB, else final argv element
```

- `--yolo` disables approval **and** sandbox in one flag. It is the default
  because KainBain has no interactions interface to answer approval prompts;
  when that UI lands, flip the default back. Until then, `KAINBAIN_MUSE_YOLO=0`
  restores sandbox-on (`--approval-mode never` with the sandbox intact).
  Either way the flag is constructed only from the resolved setting — the
  spawn-plan guard (`assertSafeMuseArgs`) throws if it appears from any
  other source, and throws if `--workspace` is ever absent.
- `--trust-workspace` stays off by default (it loads the project's own
  skills/rules into the agent context, competing with KainBain's curated
  prompt skills).
- Prompts larger than 64 KiB are staged to a `--prompt-file` in a fresh
  mkdtemp tmpdir (deleted on settle) — review stages carry diffs up to
  256 KB, past the 128 KB single-argv limit.
- Child env is an allowlist (`PATH`, `HOME`, `LANG`, `TZ`, `SHELL`,
  `TMPDIR`, proxies, `XDG_*`, `MUSE_*`) with `SECRET|TOKEN|PASSWORD|KEY|
  CREDENTIAL` names dropped. Muse authenticates from its own
  `~/.config/muse` cache.

## Environment

| Key | Default | Meaning |
| --- | --- | --- |
| `KAINBAIN_MUSE_BIN` | `muse` | Binary (PATH name or absolute path; tests point at the mock). Production systemd units must use the absolute path (`~/.local/bin/muse`) — the service `PATH` cannot see `~/.local/bin`, so a bare `muse` fails with `spawn muse ENOENT` (same lesson as `KAINBAIN_AGY_BIN`). On the MSP transport the bare name resolves the same way; the probe also needs the `serve` subcommand |
| `KAINBAIN_MUSE_APPROVAL_MODE` | `never` | `--approval-mode` value |
| `KAINBAIN_MUSE_YOLO` | `1` | YOLO by default (no approval UI yet); `0` restores sandbox-on |
| `KAINBAIN_MUSE_TRUST_WORKSPACE` | `0` | Adds `--trust-workspace` (loads project skills/rules) |
| `KAINBAIN_MUSE_NO_SESSION_LOG` | `0` | Adds `--no-session-log` (privacy vs. resume/trace trade-off) |
| `KAINBAIN_MUSE_TIMEOUT_MS` | agent-stage timeout | Engine-side watchdog (backstop) |
| `KAINBAIN_MUSE_ARGS` | `""` | Extra validated argv (e.g. `--max-model-steps 200`), never shell-interpreted |
| `KAINBAIN_MUSE_MSP` | `auto` | Session transport: `auto` (MSP when `serve` resolves), `on` (force MSP), `off` (force exec — the rollback) |
| `KAINBAIN_MUSE_MSP_BIN` | `""` | Standalone `muse serve` binary override (setting it engages MSP) |
| `KAINBAIN_MUSE_MSP_START_TIMEOUT_MS` | `30000` | MSP handshake ceiling |
| `KAINBAIN_MUSE_MSP_HOST_IDLE_TTL_MS` | `300000` | Idle TTL before a pooled per-project host is disposed |
| `KAINBAIN_MUSE_MSP_ARGS` | `""` | Extra validated argv for the serve host (e.g. `--contributor-mode off`) |

## Supply-chain + privacy (R-05)

- The `muse` binary is a **self-updating launcher** (hourly channel poll,
  `MUSE_CHANNEL_URL`, versioned binaries like `muse-bin-1.3.0-R3057.1`).
  Pin `KAINBAIN_MUSE_BIN` at a versioned binary to opt out of the
  launcher's auto-update; `MUSE_UPDATE_INTERVAL_SECONDS` /
  `MUSE_CHANNEL_URL` are the operator's pinning levers. The harness
  `probeHealth` reports the resolved binary path + `muse --version` so
  drift is visible, and the captured fixtures
  (`api/agent/harnesses/muse/fixtures/`) pin the wire shape so drift fails
  tests loudly.
- Stage prompts persist in `~/.local/share/muse` session logs by default
  (local-only). Default `KAINBAIN_MUSE_NO_SESSION_LOG=0` keeps logs (and
  keeps `muse resume`/`muse trace` working); opt in to `=1` for
  data-minimization deployments — v2 multi-turn resume would require the
  flag off.

## Observability (R-06)

One `[MUSE]` system-log line per spawn and per settle via the event
bridge, carrying: run label (`stageId:taskId`), argv SHAPE (flags only —
the prompt is elided to its byte length, never logged), child pid, exit
code, duration ms, terminal record kind, and stderr-tail char count.
No prompt text ever reaches the logs (asserted in the contract test).

## Live verification (R-07 — tool shapes now observed)

A real tool-using run (`muse exec --workspace <tmp> --yolo --json
--max-model-steps 5`, hermetic tmp workspace) confirmed the tool vocabulary,
captured in `api/agent/harnesses/muse/fixtures/tool-call.real.jsonl`
— the mapper now emits `tool_started/tool_updated/tool_finished`, so tool
activity reaches the task logs like any other harness. Still open before
flipping the default back (`KAINBAIN_MUSE_YOLO=0` deployment-wide): proving
the same run succeeds under sandbox-on with `--approval-mode never`.
If the sandbox blocks workspace writes there, record the escalation decision
here — never silently.

## v2 (deferred — do not build in v1)

1. Multi-turn resume on the exec transport is now wired via `--session-id`
   chaining; the MSP transport resumes durably through `session/resume`.
2. Model passthrough (`--model`) is now plumbed on the exec transport, and the
   MSP transport serves a live `model/list` catalogue with per-session
   `session/setModel`; `--reasoning-effort` remains deferred.
3. `readHistoryFromDisk` is now implemented via
   `muse export --session <id> --redacted`.
4. MSP `serve` is now the Tier 2 transport — see the section above.
5. Still deferred: vision (`media/upload` + turn image parts), per-stage model
   switching probes on the meta provider (O-4), and the approval UI that would
   let `onRequest` become interactive rather than policy-answered.
