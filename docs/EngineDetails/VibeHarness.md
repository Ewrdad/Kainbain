# Mistral Vibe Harness

How KainBain runs agent stages on Mistral's Vibe CLI (`vibe --prompt`)
through a dedicated harness (`api/agent/harnesses/vibe/`, id `"vibe"`).

For zero-code use today, see the Tier 0 recipe in
[CustomHarness.md](./CustomHarness.md) (a `vibe --prompt … --output
streaming` command line via the custom-command harness). This document
covers the dedicated harness — **Tier 2** as of 2026-10-16: a long-lived
bidirectional ACP session by default, with the documented CLI exec path
kept as the tested rollback.

## Tier 2: the ACP session path (default)

Mistral Vibe ships a dedicated ACP entrypoint as part of the standard
install: the standalone **`vibe-acp` binary** (same install dir as `vibe` —
e.g. `~/.local/bin/vibe-acp`; the interactive `vibe` CLI has **no `acp`
subcommand**). It speaks Agent Client Protocol (JSON-RPC 2.0 over stdio,
schema v1.16.0, verified against `vibe-acp` 3.0.2 (ACP shape unchanged since 2.26.1) — captured ground truth
in `api/agent/harnesses/vibe/fixtures/acp-session-new.json`, refreshed
with `fixtures/probe-vibe-acp.mjs`). KainBain reuses the generic ACP core
(`api/agent/harnesses/acp/` — the same core the antigravity harness uses);
every vibe decision lives in the flavor adapter
`api/agent/harnesses/vibe/vibeAcpSupport.js`.

Wire surface (probe-verified 2026-10-16):

| Method | KainBain use |
| --- | --- |
| `initialize` | handshake (protocol version 1, permission interception) |
| `session/new` | session on the project cwd; the result's `modes` + `configOptions` feed the permission mode and the model catalogue |
| `session/set_mode` | the native replacement for the exec path's `--auto-approve` flag (`auto-approve` vs `ask`) |
| `session/set_config_option` | **the only model path**: `configId: "model"`, value = a model select option id (`session/new` and `session/prompt` ignore model kwargs) |
| `session/prompt` | one turn per `prompt()`; streams `session/update` rows until `stopReason` |
| `session/cancel` | graceful turn stop (backed by process-group SIGTERM→SIGKILL) |
| `session/steer` | **absent from vibe's method map** — steering is best-effort only (surfaced, never crashed) until upstream ships it |

What Tier 2 buys over the exec path:

- **Reliability** — one long-lived supervised session instead of a fresh
  exec per turn; typed startup failures (`VIBE_ACP_BIN_MISSING` /
  `VIBE_ACP_AUTH_REQUIRED` / `VIBE_ACP_TIMEOUT` /
  `VIBE_ACP_DISCOVERY_FAILED`, each with a fix hint); no dependence on the
  `VIBE_CLI` launcher rollout (the Python `vibe-acp` entrypoint has no
  python/rust launcher to pin).
- **Feedback** — granular streamed events, live `usage_update` telemetry
  (tokens/cost/steps/context — one `[VIBE ACP]` log line per row), and
  permission requests answered through the harness policy with a log line
  for every decision.
- **Model list** — `vibeModelCatalog.js` discovers the deployment's live
  model list from the `session/new` `configOptions` model select
  (handshake-only: no LLM call, no prompt, no cost), served through
  `GET /harnesses/vibe/models` and pinned per session via
  `session/set_config_option` (`vibe::mistral::<id>` keys).

Rollback: `KAINBAIN_VIBE_ACP=off` restores the exact pre-Tier-2 exec
behavior (the contract suite pins both transports).

### Workspace trust (known divergence from the exec path)

`session/new` reports `_meta.workspace_trust` (`trusted` | `session` |
`untrusted`). When the project cwd is **untrusted**, vibe ignores
project-local config (`AGENTS.md`, `.vibe/`, `.agents/`) for that session —
the directory stays writable, but its instructions are not loaded. The
exec path avoids this by passing `--trust` (`KAINBAIN_VIBE_TRUST=1`), which
is **invocation-only and never persisted**; the ACP `trust/decision` route,
by contrast, writes **persistently** to the user's `~/.vibe/` trust store
and offers no session-only decision. KainBain therefore does **not**
auto-answer `trust/decision`: silently mutating the operator's global trust
store would be a side effect the exec path deliberately avoids. Instead the
harness emits a non-destructive `[VIBE ACP] [WARN] … untrusted …` line
(naming `AGENTS.md` / `.vibe/` / `.agents/` and the fix) and keeps running.
Operator fix: trust the folder once in the interactive `vibe` CLI, or set
`KAINBAIN_VIBE_ACP=off` to keep the exec path's temporary `--trust`.

## Wire format (`vibe --prompt … --output streaming`)

Newline-delimited JSON message objects, one per line (seeds in
`api/agent/harnesses/vibe/fixtures/` — `help.python.txt`, `help.rust.txt`,
`help.txt`, `streaming.text-only.jsonl`, `streaming.tool-call.jsonl`,
`export.finished.json`):

```json
{ "id": "...", "sessionId": "...", "turnId": "...", "type": "message|effect|reasoning",
  "role": "user|assistant", "content": [{"type": "text", "text": "..."}],
  "source": "turn_start|harness", "generationStatus": "completed", ... }
```

Key rows (exec wire format unchanged since 2.26.1; re-verified against the 3.0.2 fixture set on 2026-10-24):

| row | Meaning |
| --- | --- |
| `message` / `role: "user"` | prompt echo (`source: "turn_start"`) — ignored by design |
| **`message` / `role: "assistant"`** | answer text in `content[]` (`source: "harness"`) → `assistant_delta` |
| **`effect`** | one executed tool call (`detail.toolName`, `detail.display`, `state.status` / `state.outputText`) → `tool_started` + `tool_finished` |
| `reasoning` | private chain-of-thought — never surfaced, ignored by design |

Two nuances a naive port gets wrong:

1. **No terminal record on stdout.** The process exit IS the terminal
   signal (0 finished, 1 usage/config error, 2 infrastructure failure,
   3 stopped by a limit), enriched by `--output-dir/export.json`
   (`outcome`, `stop_reason`, `usage`, `cost_usd`, `steps`).
2. **Tool order precedes the answer.** The wire streams user → effect →
   assistant, so `tool_started/tool_finished` arrive before the first
   `message_started` — the fingerprint tests pin this order.

Exit-code handling: exit 0 → `run_finished{completed}` with the
accumulated deltas as the response; exit 3 → `run_error` naming the
limit from the export (`price_limit`, `token_limit`, …) with partial
text preserved on the turn; any other non-zero exit → `run_error` from
exit code + stderr tail. An engine-initiated abort settles as
`run_finished{interrupted:true}` — never an agent error. A
missing/unreadable export degrades the settle log to `export=unknown`
and never fails the stage.

## CLI implementations: history of the `VIBE_CLI` pin

`KAINBAIN_VIBE_CLI` exists because Vibe 2.26 shipped **two CLI
implementations behind one `vibe` launcher**:

- the **classic Python CLI** — accepts `--output-dir`, `--time-limit`,
  `--prompt-file` and writes `export.json`;
- a **Rust TUI (`vibe-rs`)** — a `clap` program that **rejected** those three
  flags with `error: unexpected argument '--output-dir' found` (exit 2).

The launcher picked Rust/Python from `VIBE_CLI`, else a **cached GrowthBook
rollout** (`vibe_cli_rust_tui_rollout` in `~/.vibe/experiment_eval_cache.json`).
When that rollout flipped `python → rust` upstream, every harness run died
instantly because the harness always sends `--output-dir` — the cause of the
`Reliability 0%` in Settings. The harness therefore sets the launcher selector
on every spawn from its own `KAINBAIN_VIBE_CLI` setting (default `python`),
merged into the child env as `extra` so a parent-provided `VIBE_CLI=rust`
cannot silently override it.

**Vibe 3.0 changed this.** The unified Rust TUI now advertises all three
harness-owned flags (`--output-dir`, `--time-limit`, `--prompt-file`) —
`vibe 3.0.2 --help` (captured in `fixtures/help.rust.txt`). The launcher
entrypoint always runs `vibe-rs`, so `VIBE_CLI` is **no longer meaningful**
(probed: `VIBE_CLI=python/rust/auto/unset` all report `vibe 3.0.2` and the
same `--help`). Consequences for KainBain:

- `KAINBAIN_VIBE_CLI=python` (the config default) is now a **harmless
  no-op rather than a protection** on Vibe ≥ 3.0. Leaving it in place costs
  nothing and keeps Vibe 2.x installs working, so the setting and the
  `python|rust|auto` enum are deliberately **retained** rather than removed.
- `buildVibeChildEnv` still sets `VIBE_CLI` only when an explicit
  `python`/`rust` selection is requested; Vibe 3.0 simply ignores it.
- The "Rust rejects flags" behavior survives only as a **regression**
  fixture (`fixtures/help.rust-pre3.txt`, the pre-3.0 Rust TUI help) plus
  `VIBE_MOCK_STRICT=1 VIBE_MOCK_CLI=rust`, which still exercises the
  `clap`/`argparse` rejection. On a stock 3.0 binary the `VIBE_CLI_INCOMPATIBLE`
  path only fires for an actual legacy or incompatible wrapper, never for
  upstream.

Flag compatibility (probe-verified on this host, 2026-10-12, restated
for 3.0.2):

| Harness-owned flag | Vibe 3.0 Rust TUI (`--help`) | Vibe ≤ 2.26 Rust TUI | `VIBE_CLI=python` |
| --- | :--: | :--: | :--: |
| `--prompt` / `-p`, `--output streaming`, `--workdir`, `--trust`, `--agent`, `--enabled-tools`, `--disabled-tools`, `--auto-approve` | yes | yes | yes |
| **`--output-dir`** (always sent) | **yes** (3.0+) | **no** | yes |
| **`--time-limit`** (when configured) | **yes** (3.0+) | **no** | yes |
| **`--prompt-file`** (prompt > 64 KiB) | **yes** (3.0+) | **no** | yes |

The captured ground truth lives in `fixtures/help.python.txt` /
`fixtures/help.rust.txt` (3.0) and `fixtures/help.rust-pre3.txt` (pre-3.0
rejection), and the strict mock mode (`VIBE_MOCK_STRICT=1`,
`VIBE_MOCK_CLI=rust|python`) reproduces the `clap`/`argparse` rejection so
a regression test fails if the pin is removed.

### Preflight capability check (`VIBE_CLI_INCOMPATIBLE`)

`getModelDiscoveryStatus()` (and `probeHealth()`) runs the effective binary
with `--help` **under the same `VIBE_CLI` pin the harness spawns with** —
`--help` only, no inference, cached per process, never on the per-run hot
path. If the help text lacks `--output-dir`/`--time-limit`/`--prompt-file`,
the status is `{ ok: false, error: { code: "VIBE_CLI_INCOMPATIBLE", message,
hint } }`, surfaced through `/harnesses` and `/harnesses/:id/models` exactly
like `VIBE_BIN_MISSING`. A probe that cannot run (`--help` unavailable,
timeout, empty output) is **inconclusive, not a failure**, so a wrapper
binary is never mislabelled. As a self-diagnosing fallback, a non-zero exit
whose stderr contains `unexpected argument` / `unrecognized arguments` is
prefixed with the same guidance in the stage `run_error`.

## Permission policy (auto-approve by default — no approval UI exists yet)

```
vibe
  --prompt TEXT | --prompt-file <run tmpdir>/prompt.md  # file when prompt > 64 KiB
  --output streaming                  # always pinned (only scrapeable live format)
  --output-dir <run tmpdir>/output    # always pinned (export.json cost/usage record)
  --workdir <abs project.cwd>         # always pinned, never the cwd default
  --trust                             # DEFAULT on; omit via KAINBAIN_VIBE_TRUST=0
  --auto-approve                      # DEFAULT on; omit via KAINBAIN_VIBE_AUTO_APPROVE=0
  [--agent NAME]                      # only when KAINBAIN_VIBE_AGENT is set
  [--time-limit SECONDS]              # only when KAINBAIN_VIBE_TIME_LIMIT is set
  [--enabled-tools T]... / [--disabled-tools T]...  # only when the CSV settings are set
```

- `--auto-approve` approves every tool call without prompting. It is the
  default because KainBain has no interactions interface to answer
  approval prompts; when that UI lands, flip the default back. Either
  way the flag is constructed only from the resolved setting — the
  spawn-plan guard (`assertSafeVibeArgs`) throws if it appears from any
  other source, and throws if `--workdir` is ever absent.
- `--trust` stays on by default (headless runs cannot answer the trust
  prompt). The trust applies to the invocation only and is never
  persisted to `trusted_folders.toml`.
- The run tmpdir (`kainbain-vibe-run-*`, holding `prompt.md` when staged
  and the `output/` export dir) is deleted on settle — best-effort, never
  failing the run.
- Child env is an allowlist (`PATH`, `HOME`, `LANG`, `TZ`, `SHELL`,
  `TMPDIR`, proxies, `XDG_*`, `VIBE_*`) with `SECRET|TOKEN|PASSWORD|KEY|
  CREDENTIAL` names dropped. Vibe authenticates from its own `~/.vibe/`
  login cache; an env-provided `MISTRAL_API_KEY` passes explicitly as an
  optional override (the one path that survives redaction by design).

## Environment

| Key | Default | Meaning |
| --- | --- | --- |
| `KAINBAIN_VIBE_BIN` | `vibe` | Binary (PATH name or absolute path; `~/.local/bin` is probed; tests point at the mock). Production systemd units must use the absolute path (`~/.local/bin/vibe`) — the service `PATH` cannot see `~/.local/bin`, so a bare `vibe` fails with `spawn vibe ENOENT` (same lesson as `KAINBAIN_AGY_BIN`/`KAINBAIN_MUSE_BIN`) |
| `KAINBAIN_VIBE_CLI` | `python` | CLI implementation the harness pins via `VIBE_CLI`. `python` (recommended) forces the classic CLI whose flag contract the harness uses (`--output-dir`/`--time-limit`/`--prompt-file`, `export.json`); `rust` opts into the Rust TUI (only valid if it advertises the same flags); `auto` leaves `VIBE_CLI` unset and follows the upstream rollout. Rollback for this fix: set it to `auto` |
| `KAINBAIN_VIBE_AUTO_APPROVE` | `1` | Auto-approve by default (no approval UI yet); `0` restores per-agent approvals |
| `KAINBAIN_VIBE_AGENT` | empty | `--agent` profile (`ask`, `plan`, `accept-edits`, `smart-approve`, `auto-approve`, or custom from `~/.vibe/agents/`); empty follows the `default_agent` config |
| `KAINBAIN_VIBE_TIME_LIMIT` | unset | `--time-limit` per run in seconds (the engine watchdog still applies) |
| `KAINBAIN_VIBE_TRUST` | `1` | Adds `--trust` (invocation-only trust prompt skip) |
| `KAINBAIN_VIBE_ENABLED_TOOLS` / `KAINBAIN_VIBE_DISABLED_TOOLS` | empty | Comma-separated `--enabled-tools` / `--disabled-tools` filters (exact, `glob*`, `re:` regex) |
| `KAINBAIN_VIBE_TIMEOUT_MS` | agent-stage timeout | Engine-side watchdog (backstop; vibe honors SIGTERM like `--time-limit`) |
| `KAINBAIN_VIBE_ARGS` | empty | Extra validated argv (e.g. `--smart-approve`), never shell-interpreted |
| `KAINBAIN_VIBE_ACP` | `auto` | Session transport: `on` (two-way ACP session over `vibe-acp`), `off` (legacy per-turn exec rollback), `auto` (default — ACP when the `vibe-acp` entrypoint resolves: an explicit `KAINBAIN_VIBE_ACP_BIN`, or the `vibe-acp` sibling of the resolved vibe binary; a bare PATH name never auto-engages, so test/mock binaries stay hermetic) |
| `KAINBAIN_VIBE_ACP_BIN` | empty | Standalone ACP agent binary override (blank = `vibe-acp` sibling of `KAINBAIN_VIBE_BIN`, then bare `vibe-acp` on PATH) |
| `KAINBAIN_VIBE_ACP_START_TIMEOUT_MS` | `30000` | Handshake ceiling for the ACP session start (the per-turn watchdog stays engine-side) |

The ACP settings own only the ACP path — every exec setting above keeps
owning the exec path, exactly as before. The ACP child env is the same
allowlist projection minus `VIBE_CLI` (never propagated — the ACP
entrypoint has no launcher to select) plus the explicit `MISTRAL_API_KEY`
passthrough (same as exec); the `~/.vibe/` login cache reaches the child
via `VIBE_*` (e.g. a `VIBE_HOME` override).

## Observability

One `[VIBE]` system-log line per spawn and per settle via the event
bridge, carrying: run label (`stageId:taskId`), argv SHAPE (flags only —
the prompt is elided to its byte length, never logged), child pid, exit
code, duration ms, terminal kind, the export summary
(`outcome=... stop=... cost_usd=... tokens=in/out/total steps=N`), and
stderr-tail char count. No prompt text ever reaches the logs (asserted in
the contract test).

## Live verification (probe-verified 2026-10-12)

All runs below were exercised with the **classic Python CLI** selected
(`VIBE_CLI=python`, the harness pin) against the local logged-in CLI
(existing `~/.vibe/` session cache, no env key). The pre-fix failure mode on
the Rust rollout was an instant `exit 2` with
`error: unexpected argument '--output-dir' found` and no response.

1. Text-only (`--prompt "Reply with exactly: PROBE-OK" --max-turns 2`)
   → user + assistant rows, exit 0, `export.json`
   (`outcome: "finished"`, usage, `cost_usd`) — seed
   `streaming.text-only.jsonl`.
2. Tool-calling (list-directory prompt, `--max-turns 3`) → user +
   settled `effect` (`file_system.bash`, `state.status: "completed"`,
   full `outputText`) + assistant rows, exit 0 — seed
   `streaming.tool-call.jsonl`. The `effect` row carries the complete
   output in one row (no chunked tool streaming observed).
3. Limit stop (`--max-price 0.000001`) → assistant rows stream, then
   `Stopped: price_limit` on stderr, exit 3, `export.json`
   (`outcome: "price_limit"`, `exit_code: 3`).

A usage error (`--workdir /nonexistent`) prints
`Error: --workdir does not exist...` with exit 1 and no stdout rows.

## v2 (deferred — do not build in v1)

1. Multi-turn resume (`--resume` / `-c`), mapped onto the session TTL
   sweep. (ACP `session/load`/`session/resume` exist for reconnect — v1
   keeps ONE ACP session per KainBain session, disposed on settle.)
2. ~~`vibe-acp` protocol client — only if streaming proves insufficient
   (no session resume, missing events).~~ **DONE (2026-10-16):** the
   Tier-2 ACP session path landed (see above); the exec path remains the
   rollback via `KAINBAIN_VIBE_ACP=off`.
3. `readHistoryFromDisk` via the `--output-dir` session journal copy.
4. Third-party provider presets, multi-user/seat semantics.
