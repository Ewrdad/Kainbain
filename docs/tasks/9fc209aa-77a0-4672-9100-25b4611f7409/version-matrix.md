# Version matrix — antigravity CLI conformance (Phase 0.1)

Probed 2026-11-26 on server2 (this host). Installed CLI == latest stable.

| Item | Installed (host) | Latest stable (upstream) | Delta |
| --- | --- | --- | --- |
| `agy --version` | 1.5.18 | 1.5.18 ([releases](https://github.com/google-antigravity/antigravity-cli/releases)) | none — host is current |
| `agy changelog` head | 1.5.18 | 1.5.18 | none |
| Docs reference | — | `antigravity.google/docs/cli`, `.../headless` | re-verified live below |

Minimum supported version: no hard gate needed. All argv flags the harness
constructs exist on 1.5.18, and the wire fixes in this task (nested payload
tolerance) parse both the old flat shape (fixtures) and the live nested shape,
so older CLIs keep working. If a future CLI removes a flag, add a gate then.

## Flag matrix (Phase 0.2) — `agy --help` @ 1.5.18 vs `buildAgyArgs`

| argv element we build | Present @ 1.5.18 | Notes |
| --- | --- | --- |
| `-p` / `--print` / `--prompt` | yes | `-p` short alias for `--print`; `--prompt` alias |
| `--output-format stream-json` | yes | `text, json, stream-json`; default `text` — we must keep pinning `stream-json` |
| `--print-timeout <dur>` | yes | Go-style durations; `0` waits forever (default `0s`); our `10m` default valid |
| `--sandbox` | yes | terminal restrictions |
| `--dangerously-skip-permissions` | yes | auto-approve all tool permission requests |
| `--model <slug>` | yes | session model |
| `--effort low\|medium\|high\|xhigh\|max` | yes, wider set | **drift**: CLI accepts `xhigh` + `max` too; harness `reasoningLevels` / `EFFORT_LEVELS` only know `low\|medium\|high` |
| `--conversation <id>` | yes | plus new `-r` / `--resume` aliases (1.5.16); we keep `--conversation` |
| `models` subcommand | yes | stdout = clean TSV `slug<TAB>name`; `Fetching…` banner on stderr |
| `acp` subcommand | yes | stdio JSON-RPC server |

## Wire matrix (Phase 0.3) — live `stream-json` @ 1.5.18 vs parser/mapper

| Assumption in code | Live truth | Verdict |
| --- | --- | --- |
| `step_update`/`result` fields flat at top level | **nested** under the event-named key (`step_update:{…}`, `result:{…}`); only `init` keeps top-level `conversation_id` | **BROKEN — fix parser framing to read nested first, flat as fallback** |
| `step_type`/`state`/`step_index` top-level | nested (see above) | same fix; effects today: no `assistant_delta`/`message_started`, no `tool_*` events on real runs (final text still arrives via `result.response`) |
| `init` payload has `model` | no `model` key observed (has `cwd`, `tools`, `permission_mode`) | tolerate null (already nullable) |
| `tool_info` shape `{name, parameters, output?, error?}` | confirmed, plus sibling `tool_name` field | ignore `tool_name` (tolerate-and-ignore) |
| `result` statuses SUCCESS/INTERRUPTED/CANCELED/ERROR | confirmed; partial run = `status: ERROR` + `finished_reason: print_timeout` + empty `response`, exit code 3, `AGY_ERROR:` JSON on stderr | mapper already yields `run_error` for ERROR; add defensive `finished_reason: print_timeout` → timeout mapping |
| `--output-format json` (non-stream) exit-0 partial | not our transport (we pin `stream-json`) | no change; defensive mapper rule covers a future SUCCESS+`finished_reason` row anyway |

## ACP matrix (Phase 0.4) — live `agy acp` @ 1.5.18 vs `agyAcpSupport.js`

| Assumption in code | Live truth | Verdict |
| --- | --- | --- |
| `agy acp` subcommand exists (stdio JSON-RPC) | yes | no change |
| `initialize` protocolVersion 1 accepted | yes — server answers `protocolVersion: 1` | no change |
| `session/new {cwd, mcpServers[]}` valid | yes — returns `sessionId`; full prompt round-trip returns `stopReason: end_turn` with `agent_message_chunk` text | no change |
| `requestPermission` shape | not re-probed live (YOLO auto-approves); resolver unchanged | no change |

## Auth/env (Phase 0.5)

Headless runs work with cached credentials under a minimal allowlisted env
(`PATH`/`HOME`/`LANG` only — `agy models` exit 0). The harness child-env
allowlist (`PATH/HOME/locale/proxies` + `AGY_*`/`GEMINI_*`/`ANTIGRAVITY_*`,
secrets dropped) suffices; no new env var needed.
