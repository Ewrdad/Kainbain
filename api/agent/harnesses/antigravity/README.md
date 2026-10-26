# Antigravity harness (Tier 2: ACP session + exec fallback)

The engine's second agent harness. It runs stages on Google's **Antigravity
agent** through a long-lived bidirectional **ACP session** (JSON-RPC 2.0 over
stdio): turns are steerable mid-flight, tool permission gates are intercepted
transparently, and swallowed model-transport failures (mid-turn 502 prose that
resolves cleanly) are trapped as typed errors. Everything generic about that
session — NDJSON framing, the JSON-RPC state machine, process-group
supervision, event mapping, the HarnessSession wrapper — lives in the reusable
core at `api/agent/harnesses/acp/` (zero vendor strings: the next ACP harness
imports it unchanged); Antigravity specifics (entrypoint, env sanitization,
502 filter, permission policy) live in `agyAcpSupport.js`.

When no ACP endpoint is configured the harness falls back to the legacy path:
one `prompt()` = one `agy -p <prompt>` process whose `--output-format
stream-json` NDJSON stream is parsed and mapped. Both paths serve the exact
same `HarnessSession` contract the pi harness implements
(`api/agent/harnessContract.js`).

```text
api/agent/harnesses/acp/
├── AcpStreamTransport.js   Generic NDJSON framing (encode + incremental parser)
├── AcpClientConnection.js  Generic JSON-RPC 2.0 client/server state machine
├── AcpSessionRuntime.js    Generic subprocess lifecycle (detached process group, handshake, watchdog)
├── AcpEventMapper.js       ACP session/update notifications → normalized agent events
├── AcpSessionWrapper.js    Generic HarnessSession contract wrapper (prompt/steer/abort/model control)
└── fixtures/
    └── mock-acp-agent.mjs  Deterministic mock ACP agent (tests; no install/network needed)
api/agent/harnesses/antigravity/
├── agyHarness.js           AgentHarness factory + exec HarnessSession + ACP session wiring
├── agyAcpSupport.js        Antigravity ACP flavor: entrypoint, env sanitization, 502 filter, permission policy
├── agyStreamParser.js      Pure incremental NDJSON parser for the exec path (no I/O)
├── agyEventMapper.js       Raw agy rows → normalized agent events (the only agy-vocabulary speaker)
├── agyModelCatalog.js      `agy models` discovery (TTL cache) + reference resolution
├── agyPermissions.js       Safe argv/env surface: bypass guard, redaction, allow-rule validation
└── fixtures/
    ├── mock-agy.mjs        Deterministic mock of the agy CLI (tests; no install/network needed)
    └── *.ndjson            Captured-shaped wire fixtures (re-capturable from a real run)
```

## Transports (ACP session vs exec fallback)

Transport selection (`selectAgyTransport` in `agyHarness.js`):

| Setting | Transport |
| --- | --- |
| `KAINBAIN_AGY_ACP=on` | ACP session (`agy acp` subcommand, or `KAINBAIN_AGY_ACP_BIN` when set) |
| `KAINBAIN_AGY_ACP_BIN=<path>` set (and mode not `off`) | ACP session via that standalone binary |
| otherwise (`auto` default, or `off`) | Legacy exec: one `agy -p` process per `prompt()` |

`auto` deliberately never probes: existing deployments keep zero behavior
change (no speculative spawn per stage). Enable ACP once the installed CLI
ships the `acp` subcommand; older CLIs stay on exec untouched. A failed ACP
start is classified (`AGY_BIN_MISSING` / `AGY_AUTH_REQUIRED` / `AGY_TIMEOUT` /
`AGY_DISCOVERY_FAILED`, each with a fix hint) on the `[AGY ACP]` log line, and
the turn reports `run_error` — never a silent success.

ACP session lifecycle: `initialize` (protocol version 1 + capability
exchange) → `session/new` (workspace-rooted, model-pinned) → `session/prompt`
(held open across streaming `session/update` notifications and
`requestPermission` pauses) → `run_finished` / `run_error`. Mid-turn
`session/steer` injects course corrections; `abort()` cancels at the protocol
level then kills the detached process group (SIGTERM → SIGKILL), so no orphan
subagents survive. Stdout stays purely JSON-RPC; stderr feeds a bounded ring
for post-mortems.

## Module map

| Module | Responsibility |
| --- | --- |
| `agyHarness.js` | Transport selection + both sessions. Exec path: one agy process per `prompt()` (fresh per stage), conversation continuity via `--conversation`, watchdog + abort escalation (SIGTERM → SIGKILL), stderr ring buffer. Decodes stdout/stderr with `StringDecoder` so multi-byte UTF-8 split across chunks stays intact, and guarantees exactly ONE `run_error` per failed run. ACP path: wires `AcpSessionRuntime` + `AcpSessionWrapper` with the flavor below. Both sessions expose `steer`/`followUp` (Tier-2 two-way surface). |
| `agyAcpSupport.js` | Antigravity ACP flavor (the ONLY vendor-specific ACP code): entrypoint resolution (`agy acp` vs standalone override), child-env sanitization (`CLAUDECODE` stripped, secrets redacted, `NODE_NO_WARNINGS=1`), swallowed-502 detection (`detectSwallowed502` → typed `AGY_TRANSPORT_502` run_error), permission policy (YOLO auto-allow vs deny-safe cancel), startup-failure classification, handshake/session params. |
| `agyStreamParser.js` | Line-oriented incremental NDJSON parser (O(chunk) per push — large tool-output lines never pin the event loop), tolerates CRLF/blank/noise lines, drops >1 MiB lines (cap trips incrementally on the partial line), tags each row with its payload (`init`/`step_update`/`result`). |
| `agyEventMapper.js` | Table-driven mapping to `run_started`, `message_started`, `assistant_delta`, `tool_started`, `tool_updated`, `tool_finished`, `run_finished`, `run_error` — never raw agy names (enforced by `api/agent/harnessBoundary.test.js`). |
| `agyModelCatalog.js` | Wraps `agy models` (bounded by a 15 s discovery watchdog — a hung CLI degrades to warn + empty list), parses slug/description lines, caches with a TTL, resolves bare slugs, `antigravity::<id>` keys, and `<slug>:<effort>` refs (e.g. `gemini-2.5-pro:high` → `--effort high`; when the stripped base slug is absent, the joined form `gemini-3.1-pro:high` → `gemini-3.1-pro-high` is tried). |
| `agyPermissions.js` | Builds argv (`-p`, `--output-format stream-json`, `--print-timeout`, `--sandbox`, `--model`, `--effort`, `--conversation`), guards the bypass flag, builds the redacted child env, validates allow rules, parses durations. |

## Wire format (agy `--output-format stream-json`)

Newline-delimited JSON, one object per line, discriminated by `event`:

| Event | Shape | Mapped to |
| --- | --- | --- |
| `init` (first line) | `{ event, conversation_id, init: { cwd, tools, permission_mode, model? } }` | `run_started` |
| `step_update` (many) | `{ event, conversation_id, step_index, state: "ACTIVE"\|"DONE", step_type, text_delta?, tool_info?: { name, parameters, output, error? } }` | `message_started`/`assistant_delta` (agent_response), `tool_started`/`tool_updated`/`tool_finished` (tool); other step types ignored |
| `result` (last line) | `{ event, conversation_id, status, response, error?, duration_seconds, num_turns, usage }` | `run_finished` (SUCCESS / INTERRUPTED / CANCELED) or `run_error` (everything else) |

The parser tolerates wire-shape drift: payload fields are read from the flat
line and from the event-named key (nested wins), unknown `step_type`s and
unknown `event`s are ignored by design. Fixtures under `fixtures/` mirror the
documented shapes (antigravity.google/docs/cli/headless); re-capture them from
a live `agy` run when one is available on a dev machine and diff as an extra
conformance check.

## Permission policy (operator-chosen YOLO)

- `--dangerously-skip-permissions` (auto-approve all tool calls, agy's headless
  YOLO equivalent) is passed by default; opt out per deployment with
  `KAINBAIN_AGY_SKIP_PERMISSIONS=0`. `buildAgyArgs` is the only construction
  site for the flag, and only from the explicit setting — never from prompt
  text. `assertSafeAgyArgs` still rejects the flag in every other argv.
- `--sandbox` is omitted by default; opt back in per deployment with
  `KAINBAIN_AGY_SANDBOX=1`.
- The effective model/sandbox/approval values are surfaced twice: a `[AGY]
  spawn …` server log and the `[AGY] run open: …` transcript line, so quiet
  privilege is impossible.
- `KAINBAIN_AGY_ALLOW` (comma-separated `action(target)` rules, e.g.
  `command(regex:npm run (build|lint|test))`) is **validated but NOT applied**
  until scoped agy settings support is verified: rules are checked (no
  wildcards on `command`/`write_file`/`read_file`, no `unsandboxed`, known
  actions only) and surfaced as a `[AGY]` system log on session creation.
  Nothing is ever auto-generated from prompt text.
- The child environment is an allowlist projection of `process.env`
  (`PATH`, `HOME`, locale, proxies, `AGY_*`/`GEMINI_*`/`ANTIGRAVITY_*`) with
  every secret-shaped name (`SECRET|TOKEN|PASSWORD|KEY|CREDENTIAL`, case
  insensitive) dropped, so child stderr/logs cannot leak host secrets. agy
  authenticates from its own cached credentials; API-key based setups can wrap
  the CLI behind `KAINBAIN_AGY_BIN`.
- Timeouts are doubled up: the CLI's own `--print-timeout` plus an
  engine-side watchdog (SIGTERM → SIGKILL after a 200 ms grace). Model
  discovery (`agy models`) has its own bounded watchdog (15 s default).
- Spawn failures report exactly one `run_error` ("Failed to start agy CLI…"):
  Node emits both `error` and `close` for a failed spawn; the settled run is
  never reported twice.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `KAINBAIN_DEFAULT_HARNESS` | `pi` | Default harness when a project does not select one; `antigravity` opts in engine-wide. Per-project selection: `project.harness = "antigravity"`. |
| `KAINBAIN_AGY_BIN` | `agy` | The CLI binary (name on PATH or absolute path). Tests point this at `fixtures/mock-agy.mjs`. |
| `KAINBAIN_AGY_ACP` | `auto` | Session transport: `on` (ACP), `off` (exec), `auto` (ACP only when `KAINBAIN_AGY_ACP_BIN` is set). |
| `KAINBAIN_AGY_ACP_BIN` | unset | Standalone ACP agent binary (engages the ACP path; tests point it at `acp/fixtures/mock-acp-agent.mjs`). |
| `KAINBAIN_AGY_PRINT_TIMEOUT` | `10m` | The CLI's `--print-timeout`; the engine watchdog derives from the same duration. Also caps retrospective chat turns on this harness — operators wanting 30-min antigravity chat raise this (e.g. `32m`), since the 30-min chat ceiling can't outrun the harness's own print ceiling. |
| `KAINBAIN_AGY_SANDBOX` | off (`0`) | Pass `--sandbox` (terminal sandboxing). |
| `KAINBAIN_AGY_SKIP_PERMISSIONS` | on (`1`) | Pass `--dangerously-skip-permissions` (auto-approve all tool calls). |
| `KAINBAIN_AGY_ALLOW` | unset | Validated-but-unapplied allow rules (see policy above). |
| `KAINBAIN_STRICT_MODEL_DISCOVERY` | off (`0`) | Engine-wide: stages that explicitly request a model fail fast (instead of warn-and-run on the session default) when the model cannot resolve and the active session reports a discovery failure. |

## Model-discovery failures (taxonomy + troubleshooting)

`agy models` discovery never throws into callers: `listAgyModels()` degrades
to `[]`, classifies the failure (`classifyAgyModelsFailure` in
`agyModelCatalog.js`), retains it (`lastDiscoveryError()`), and reports it
through the optional `getModelDiscoveryStatus()` harness/session contract
method. The model-list APIs (`GET /harnesses/:id/models`,
`GET /compute/models` harness entries) serve the retained failure as the
additive `discoveryError: { code, message, hint }` field — present only when
discovery actually failed — and the model picker + Settings › Harness render
the reason + fix. Every failure is also loud on the server console and the
project process log (the catalog log is wired to the event bridge).
Successful listings are cached for the model-cache TTL; failures are never
cached. `listModels({ refresh: true })` — the UI Refresh actions and
`?refresh=true` on the model routes — drops the TTL cache and re-runs
`agy models`, so a retry after a fix always re-checks the CLI.

| Code | Cause | Fix |
| --- | --- | --- |
| `AGY_BIN_MISSING` | The `agy` binary is not on the service PATH (spawn ENOENT). | Install the Antigravity CLI and ensure it is on PATH, or set `KAINBAIN_AGY_BIN` to its absolute path. |
| `AGY_MODELS_TIMEOUT` | `agy models` hung past the 15 s discovery watchdog. | Check the network/CLI install, then retry (Settings › Harness › Refresh). |
| `AGY_MODELS_AUTH` | The CLI reports missing credentials. | Run `agy auth login` in a terminal, then retry. |
| `AGY_MODELS_FAILED` | Any other non-zero `agy models` exit. | Run `agy models` in a terminal to see the full error, then retry. |
| `AGY_MODELS_UNPARSEABLE` | Exit 0 but zero recognizable model slugs (CLI output-shape drift). | Run `agy models` in a terminal and paste the output in a bug report. |

Symptom → cause → fix:

- **Antigravity picker shows no models + a specific reason.** Discovery
  failed — follow the hint shown (install CLI / `agy auth login` / retry).
- **Antigravity picker shows the generic "may be unreachable" line.**
  Discovery returned empty with no retained error (older backend, or a
  catalogue that loaded empty before this change) — hit Refresh.
- **Stage warns "is not available" and runs on the session default.**
  The requested ref did not resolve; when discovery failed, the warning
  names the failure code + fix. Enable `KAINBAIN_STRICT_MODEL_DISCOVERY=1`
  to fail such stages instead of spending quota on the wrong backend.
- **Stage warns "scoped to harness 'antigravity'" on another harness.**
  A stale harness-scoped key (`antigravity::…`) is stored on the stage or
  project default — change the stage model to a current-harness model, or
  the project harness to `antigravity`, in Settings.
- **Stage fails with a `[AGY_…]` code in the error.**
  The exec run itself failed outside the stream protocol — the code names
  the cause (see the run-failure taxonomy below), the message carries the
  detail, and the hint carries the fix. Auth-shaped crashes report
  `AGY_AUTH_REQUIRED`, never a bare crash.

## Run-failure taxonomy (exec transport)

Runs that fail OUTSIDE the stream protocol (the child never starts, the
engine watchdog fires, or the child dies without a `result` line) are
classified by `classifyAgySpawnError` / `classifyAgyRunTimeout` /
`classifyAgyCrashExit` in `agyRunErrors.js`. Every `run_error` from these
paths carries `{ code, message, hint }` (the `error` string stays the
human-readable line `"<message> [<code>] <hint>"`), and the same classified
line is logged to the project process log, so reliability buckets and the
log tail agree on the cause:

| Code | Cause | Fix |
| --- | --- | --- |
| `AGY_BIN_MISSING` | The `agy` binary is not on PATH (spawn ENOENT). | Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set `KAINBAIN_AGY_BIN` to its absolute path. |
| `AGY_SPAWN_FAILED` | The binary exists but could not be started (permissions, bad path). | Check execute permissions on `KAINBAIN_AGY_BIN` and that it points at an executable file. |
| `AGY_RUN_TIMEOUT` | The engine-side watchdog (`watchdogMs`, derived from `KAINBAIN_AGY_PRINT_TIMEOUT`) tripped before the CLI's own `--print-timeout` ceiling. The message names both ceilings. | Raise `KAINBAIN_AGY_PRINT_TIMEOUT` for long runs, or check the network when a fast prompt hangs. |
| `AGY_AUTH_REQUIRED` | The child died with an auth-shaped stderr tail (login hint, not logged in). | Run `agy auth login` in a terminal, then retry the stage. |
| `AGY_CRASHED` | The child died without a `result` line and the tail is not auth-shaped. | Re-run the stage; if it repeats, run the same prompt with the agy CLI by hand to see the crash. |

`run_started` runFacts for every exec run also carry the ceilings and
redacted prompt capture actually used: `timeout` (the `--print-timeout`
value), `promptChars` (instruction size), and `promptHash` (SHA-256 of the
prompt — correlation without storing prompt text or secrets).

Live-conformance gap (2026-09-27): no machine with the `agy` CLI installed
was available during this change, so the `agy models` output parser and the
`init`-echo model field handling are verified against the mock + documented
shapes only — not against live CLI output. Re-capture
`fixtures/noise-lines.ndjson` from a real `agy models` run when one is
available and diff it against `parseAgyModelsOutput` assumptions; likewise
confirm whether `gemini-3.8-flash-medium` (seen in one stored stage ref) is a
real slug. Unknown slugs are never silently mapped.

## Mock binary (tests)

`fixtures/mock-agy.mjs` is a deterministic node-script mock of the CLI. It
honors `-p/--prompt`, `--model` (echoed in `init`), `--conversation`,
`--output-format`, `--print-timeout`, `--sandbox`; supports the `models`
subcommand; and is controlled via environment variables
(`AGY_*` names pass the harness's child-env allowlist):

- `AGY_MOCK_MODE`: `success` (default) | `error` | `auth` | `crash` | `hang` | `utf8split` (a multi-byte UTF-8 line deliberately split mid-character across two stdout writes)
- `AGY_MOCK_MODELS_MODE`: `success` (default) | `hang` (the `models` subcommand never answers — exercises the discovery watchdog) | `auth` (exit 1, login hint) | `error` (exit 1, generic failure) | `unparseable` (exit 0, prose with zero slugs) | `empty` (exit 0, no output)
- `AGY_MOCK_FIXTURE`: replay a `.ndjson` fixture verbatim
- `AGY_MOCK_CHUNK_DELAY_MS`: per-line output delay (slow-stream/abort tests)
- `AGY_MOCK_ARGV_LOG`: append the received argv as a JSON line (argv assertions)

## Conversation continuity

One session = one agy conversation: the first run mints the conversation id
(from the `init` event) and later prompts pass `--conversation <id>`. Stage
executions start fresh sessions, so every stage begins a new conversation —
matching the engine's fresh-per-stage semantics. The harness reports an
intentionally empty `readHistoryFromDisk()` (the CLI owns history).
