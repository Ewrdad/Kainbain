# ACP core (reusable Agent Client Protocol subsystem)

Generic JSON-RPC 2.0-over-stdio session machinery for ACP-compliant agent
harnesses. **Zero vendor strings live here** — no binary names, no model
slugs, no log tags, no vendor error text — so the next ACP harness (Cursor,
Grok, Claude ACP, …) reuses these files unchanged and adds only a flavor
adapter like `antigravity/agyAcpSupport.js`:

| New file | Contains ONLY vendor specifics |
| --- | --- |
| `<harness>/<name>AcpSupport.js` | Entrypoint resolution, child-env sanitization, swallowed-error filters, permission policy, startup classification, handshake/session params |

Live flavors (proof of reuse — both are thin adapters over this core):

| Flavor | Notes |
| --- | --- |
| `antigravity/agyAcpSupport.js` | `agy acp` subcommand or standalone override; YOLO permission policy; swallowed-502 filter. |
| `vibe/vibeAcpSupport.js` | Standalone `vibe-acp` sibling binary; session-mode mapping (`session/set_mode`); per-session model pinning (`session/set_config_option` — the wrapper's `applySessionModel` hook); live model catalogue from the `session/new` configOptions. |

## Module map

| Module | Responsibility |
| --- | --- |
| `AcpStreamTransport.js` | NDJSON framing: `encodeAcpFrame` + the incremental `createAcpFrameParser` (CRLF/blank/noise tolerance, incremental oversized-line cap, `flush()` tail). Feed it StringDecoder output, never raw Buffers. |
| `AcpClientConnection.js` | JSON-RPC 2.0 state machine over injected `sendLine`: id-matched `request()` with per-request timeouts, `notify()`, incoming agent requests answered via `onRequest` (permission gates), notifications via `onNotification`, `close()` rejecting every pending call. |
| `AcpSessionRuntime.js` | Subprocess supervision: detached process-group spawn, `initialize` + `session/new` handshake (protocol-version checked), `prompt`/`steer`/`cancel`, stderr ring, SIGTERM→SIGKILL escalation, startup timeouts. A dead child closes the connection so pending turns reject instead of hanging. |
| `AcpEventMapper.js` | `session/update` notifications → normalized agent events (`assistant_delta`, `tool_started/updated/finished`, `message_started`); `session/prompt` stop reasons → terminal `run_finished` / `run_error`; `usage_update` rows → the vendor-neutral telemetry record the wrapper logs + hands to its `onUsage` hook. Unknown updates ignored by design. |
| `AcpSessionWrapper.js` | The `HarnessSession` contract over a runtime: lazy single start, per-turn text accumulation, `steer`/`followUp`, model pinning via an injected catalog (prompt-param by default, or the optional `applySessionModel` hook for agents that pin via a session config method), usage telemetry, abort/dispose. Vendor behavior arrives as `permissionPolicy` + `inspectAssistantText` callbacks. |

## Wiring a new flavor (checklist)

1. Resolve the spawn endpoint (`command` + `args`, e.g. `<bin> acp`).
2. Sanitize the child env (keep-list + secret redaction, strip session traps, keep stdout purely protocol).
3. Build the handshake (`protocolVersion: 1` + capabilities) and `session/new` params (`cwd`, model).
4. Map project settings to `requestPermission` answers (deny-safe default: cancel).
5. Trap vendor-smuggled transport failures in `inspectAssistantText` → typed `run_error`.
6. Classify startup failures (bin-missing / auth / timeout / discovery-failed) with fix hints.

## Tests

`fixtures/mock-acp-agent.mjs` is the deterministic counterparty (no install,
no network): handshake, stable session id, `modes` + `configOptions` in
`session/new`, `session/set_mode` + `session/set_config_option` handlers
(validating mock option ids), chunk + tool-call + `usage_update` streaming,
one mid-turn `requestPermission`, and failure modes via `ACP_MOCK_MODE`
(canonical spelling; the legacy `AGY_ACP_MOCK_MODE` alias still works —
no antigravity test churn). Modes: `no_permission` | `502_error` | `hang`
(hung turn) | `hang_handshake` | `crash` | `bad_handshake`. Assertion
hooks: `ACP_MOCK_PROMPT_LOG` (each session/prompt params) and
`ACP_MOCK_CONFIG_LOG` (each set_mode/set_config_option params), plus
`ACP_MOCK_WORKSPACE_TRUST` (echoes a `_meta.workspace_trust` status so a
flavor's trust diagnostic has an end-to-end fixture).
Drive it through `AcpSessionRuntime` (core lifecycle) or a flavor harness
(end-to-end + `runSessionContractTests` conformance).
