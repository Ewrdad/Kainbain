# Codex CLI Harness

How KainBain exposes the Codex CLI (`codex`) as a **Tier 2** harness
(`api/agent/harnesses/codex/`, id `"codex"`).

This device does **not** have the Codex CLI installed, so this integration is
currently a **theoretical shim**: it registers the harness, exposes honest
"not installed" messaging, detects absence through binary resolution, and
never spawns a process. No curated fallback models are served to Codex
(`modelSelection: "list"` with an honestly empty catalogue).

## Engine path (the only live path)

The engine drives every harness through `createSession(project, meta)` +
`prompt(text)` (`api/agentRunner.js`). The Codex session:

- requires a project with a `cwd` (fail-fast, muse parity);
- records the user turn and replies with `CODEX_NOT_INSTALLED_HINT`
  (never a silent success);
- streams normalized events (`run_started` → `assistant_delta` →
  `run_finished`) so the contract gate
  (`api/agent/sessionContract.test.js`) passes unchanged;
- rejects non-string prompts and prompts after dispose; concurrent prompts
  are refused so turns cannot interleave;
- `switchModel()` always resolves `null` with a warning (the empty catalogue
  never claims a switch); `getActiveModel()` is `null`.

There is deliberately **no `runSession` member**: a second entry point would
be dead surface that drifts from the contract.

## Discovery

- `KAINBAIN_CODEX_BIN` overrides the binary path (validated schema key
  `codexBin`, default `"codex"`); otherwise `codex` is resolved from `PATH`
  and the standard install dirs (`api/agent/harnessDiscovery.js`).
- `GET /harnesses` projects the harness via `api/crew/harnessRoster.js` as
  `available: false` with a setup hint naming `KAINBAIN_CODEX_BIN` until a
  binary is detected (survey q10).
- `getModelDiscoveryStatus()` resolves per call (never frozen at factory
  time) so a late-set override flips the badge without rebuilding the
  harness. Missing binary: `{ ok: false, error: { code:
  "CODEX_BIN_MISSING", … } }`.
- Auth is Codex-native only (`OPENAI_API_KEY` or Codex login); KainBain
  neither stores nor injects credentials
  (`api/agent/harnesses/codex/codexHarness.js`).

## Child environment (future spawn)

`buildCodexChildEnv()` projects the parent env onto a minimal allowlist
(`PATH`, `HOME`, locale/proxy vars, `CODEX_*`) with every secret-shaped name
dropped — then restores **only** the operator's own `OPENAI_API_KEY`
(explicit, documented passthrough: the projection strips it as
secret-shaped, and API-key auth would otherwise break silently). `HOME` is
kept so the Codex login cache (`~/.codex/auth.json`) resolves. Run-context
vars (`PROJECT_CWD`, `TASK_ID`) pin only when known — never `undefined`.

## Event mapping (fixture-only)

`codexEventMapper.js` maps theoretical wire rows to the engine's normalized
vocabulary (`api/agent/sessionEvents.js`) via `normalizedAgentEvent()`, as
`{ map(row), stats() }` (muse parity): arrays of events per row, unknown
input degrades to no events (counted), mapping never throws. Permission
rows map to an audited `permission_requested` + `permission_resolved`
(`decision: "allow"`, YOLO default) pair; token telemetry maps to
`usage_updated`, other telemetry to `harness_log`; session/resume rows map to
`session_meta` with the conversation id. Permission ids default to a
deterministic per-mapper counter (`codex-perm-N`).

## Unverified (scaffold gates on these)

The following Codex CLI surface is NOT verified on this device and must not
be assumed live; any future enablement requires primary-source confirmation:

- exact `exec` / programmatic invocation commands and flags (argv shape);
- app-server / JSON-RPC start, session create, prompt, steer, cancel,
  resume by conversation id;
- model listing command and output format;
- approval modes / permission interception protocol;
- streaming (NDJSON/JSONL) event shapes;
- telemetry and usage reporting;
- session resume / reconnect semantics.

## Rollback / configuration

- `KAINBAIN_CODEX_BIN` — Codex CLI binary (`codexBin`, default `"codex"`).
- `KAINBAIN_CODEX_YOLO` — auto-approve by default (`codexYolo`, default
  `true`); `0` restores per-action approvals once the live transport lands.
  The flag is constructed only from resolved settings, never prompt text.
- There is no transport knob: the programmatic-vs-exec choice is unverified,
  so the shim pins the documented exec-shaped plan
  (`buildCodexSpawnPlan`) until primary sources confirm the surface.

## Setup

Install the Codex CLI and ensure it is on `PATH` or in `~/.local/bin`, or set
`KAINBAIN_CODEX_BIN` to its absolute path. No authentication step is
performed by KainBain; use `OPENAI_API_KEY` or Codex's own login flow.
