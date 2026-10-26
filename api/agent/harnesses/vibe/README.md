# Mistral Vibe Harness

How KainBain runs agent stages on Mistral's Vibe CLI through the dedicated
harness (`api/agent/harnesses/vibe/`, id `"vibe"`). **Tier 2** — see
[docs/EngineDetails/VibeHarness.md](../../EngineDetails/VibeHarness.md)
for the full wire-protocol write-up and the exec-path details.

## Architecture

```
createVibeHarness
  ├── selectVibeTransport(settings)         # auto (default) | on | off
  ├── ACP transport (Tier 2):
  │     AcpSessionWrapper (generic core, api/agent/harnesses/acp/)
  │       ├── AcpSessionRuntime      # vibe-acp child, JSON-RPC over stdio,
  │       │                          #   process-group SIGTERM→SIGKILL
  │       ├── vibeAcpSupport.js      # THE FLAVOR: endpoint resolution
  │       │                          #   (vibe-acp sibling/override/PATH),
  │       │                          #   env sanitization (no VIBE_CLI pin),
  │       │                          #   handshake/session params, mode
  │       │                          #   mapping, model application
  │       │                          #   (session/set_config_option),
  │       │                          #   permission policy, swallowed-502
  │       │                          #   filter, startup classification
  │       └── vibeModelCatalog.js     # live model list from session/new
  │                                  #   configOptions (handshake-only)
  └── exec transport (rollback): one `vibe --prompt` process per turn
        vibePermissions.js (argv/env guards) → vibeStreamParser.js
        → vibeEventMapper.js → normalized events
```

The ACP core is vendor-neutral (zero vibe strings — it is the same core
the antigravity harness uses); every vibe-specific decision lives in
`vibeAcpSupport.js`, so the next ACP harness copies the core + writes one
flavor module.

## Auth (cached login primary, key optional)

Headless runs authenticate from the existing local login — the `~/.vibe/`
login cache provisioned by the interactive browser sign-in
(`whoami_cache.json`; override the home with `VIBE_HOME`, which passes the
ACP child env's `VIBE_` prefix allowlist). Discovery reports this as
`authConfigured` (existence only, never read).

An env-provided `MISTRAL_API_KEY` is an optional override, never a
requirement: when set on the server environment, the harness passes it to
the child explicitly (the one path that survives child-env secret
redaction by design) — on both transports. One account, one key — never
shared.

## Settings (`KAINBAIN_VIBE_*`)

Exec transport settings (unchanged): `KAINBAIN_VIBE_BIN`, `KAINBAIN_VIBE_CLI`,
`KAINBAIN_VIBE_AUTO_APPROVE`, `KAINBAIN_VIBE_AGENT`,
`KAINBAIN_VIBE_TIME_LIMIT`, `KAINBAIN_VIBE_TRUST`,
`KAINBAIN_VIBE_ENABLED_TOOLS` / `KAINBAIN_VIBE_DISABLED_TOOLS`,
`KAINBAIN_VIBE_TIMEOUT_MS`, `KAINBAIN_VIBE_ARGS`.

ACP transport settings:

| setting | default | meaning |
| --- | --- | --- |
| `KAINBAIN_VIBE_ACP` | `auto` | `on` = two-way ACP session, `off` = legacy exec (rollback), `auto` = ACP when the `vibe-acp` entrypoint resolves |
| `KAINBAIN_VIBE_ACP_BIN` | empty | Standalone ACP agent binary override (blank = `vibe-acp` sibling of the resolved `KAINBAIN_VIBE_BIN`, then bare `vibe-acp` on PATH) |
| `KAINBAIN_VIBE_ACP_START_TIMEOUT_MS` | `30000` | Handshake ceiling for the ACP session start |

`auto` engages ACP when an explicit ACP bin is set OR the `vibe-acp`
sibling of the resolved vibe binary exists (they ship in the same install
dir, so Tier 2 is the default on healthy installs). A bare PATH spelling
alone never auto-engages — test/mock vibe binaries stay hermetic; force it
with `KAINBAIN_VIBE_ACP=on`.

`KAINBAIN_VIBE_AUTO_APPROVE` drives both transports: exec passes
`--auto-approve`; ACP sets the native session mode (`auto-approve` vs
`ask`) and answers `requestPermission` gates with `allow_once` (never a
standing grant) / cancel respectively.

## Troubleshooting (ACP startup codes)

| code | cause | fix |
| --- | --- | --- |
| `VIBE_ACP_BIN_MISSING` | `vibe-acp` not runnable (ENOENT) | reinstall Mistral Vibe, or set `KAINBAIN_VIBE_ACP_BIN` to the absolute path (systemd units cannot see `~/.local/bin`), or `KAINBAIN_VIBE_ACP=off` |
| `VIBE_ACP_AUTH_REQUIRED` | the agent reports missing credentials | run `vibe --setup` (or a fresh interactive `vibe` browser login), then retry |
| `VIBE_ACP_TIMEOUT` | handshake hung past `KAINBAIN_VIBE_ACP_START_TIMEOUT_MS` | check network/install, then retry; persistent hangs can roll back with `KAINBAIN_VIBE_ACP=off` |
| `VIBE_ACP_DISCOVERY_FAILED` | anything else (early exit, no sessionId) | run `vibe-acp` by hand to see the full error |
| `VIBE_TRANSPORT_502` | "model unreachable / Error 502" prose smuggled inside an assistant delta | retry the turn; if it persists check the Mistral service status and re-authenticate |
| `VIBE_MODELS_UNPARSEABLE` | handshake ok but no model select in `configOptions` (shape drift) | run `fixtures/probe-vibe-acp.mjs` and compare with `fixtures/acp-session-new.json` |

Known limitation: vibe's ACP method map has **no `session/steer`** —
`steer()`/`followUp()` are best-effort (the guidance is recorded and the
limitation logged, never crashed on) until upstream ships steering.

Workspace trust: `session/new` reports `_meta.workspace_trust`; an
`untrusted` cwd makes vibe ignore project-local config (`AGENTS.md`,
`.vibe/`, `.agents/`) for the session. The harness emits a non-destructive
`[WARN] … untrusted …` line and keeps running — it never calls
`trust/decision`, because that route persists to the user's global trust
store (the exec path's `--trust` is invocation-only). Trust the folder once
in the interactive `vibe` CLI, or roll back with `KAINBAIN_VIBE_ACP=off`.

## Testing (mock agent, no install, no network)

- `vibeHarness.acp.test.js` drives the full ACP path end to end against
  the generic mock agent (`../acp/fixtures/mock-acp-agent.mjs`), including
  the shared session conformance suite (`runSessionContractTests`), and
  `vibeHarness.contract.test.js` keeps the exec path pinned to the same
  gate — the rollback can never rot.
- The mock's env knobs are injected through the harness factory's
  `acpEnv` test seam (`createVibeHarness({ acpEnv: { ACP_MOCK_MODE: … } })`),
  because the sanitized child env keeps only `VIBE_`/`XDG_` prefixes —
  the mock names would never pass it from `process.env`.
- `fixtures/probe-vibe-acp.mjs` is a DOCUMENTED DIAGNOSTIC (never run by
  the tests): it probes the real `vibe-acp` handshake by hand — no LLM
  call, no cost — so wire-shape drift is visible at upgrade time. The
  captured ground truth is `fixtures/acp-session-new.json`.
- Model discovery: `vibeModelCatalog.test.js` runs the real catalog
  against the mock agent plus pure-parsing and failure-classification
  cases.
