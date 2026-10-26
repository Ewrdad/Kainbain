# Harness support levels — current tier & theoretical maximum

Companion to **HarnessSupportTeirs.md** (`docs/EngineDetails/HarnessSupportTeirs.md`).
It records the support tier every registered harness actually offers on the
**infrastructure as built today** (not what the upstream tool might someday
make possible), plus the highest tier that harness could reach if its upstream
or our integration changed.

*Snapshot date: 2026-10-16. Re-check the "theoretical max" column when an
upstream harness ships an ACP/MCP/SDK surface — those claims go stale fastest.*

Tier definitions (from **HarnessSupportTeirs.md**):

| Tier | Meaning |
| --- | --- |
| 1 | Direct in-KainBain integration (KainBain owns the code / low-level operations, even when the package is external) |
| 2 | ACP or separate programmatic invocation — a dedicated two-way interface (KainBain can intervene/steer a running session) |
| 3 | Exec / `-p` functionality — KainBain issues `harness -p "prompt"` and parses stdout; largely one-way |
| 4 | Separate invocation needed — KainBain only prepares prompts/branches; a user or poller runs the harness |
| — | Not supported — no integration path |

## Current vs. theoretical maximum

| Harness | Current tier | Why (mechanic + evidence) | Theoretical max | What would have to change |
| --- | --- | --- | --- | --- |
| `pi` | **Tier 1** | In-process `@earendil-works/pi-coding-agent` SDK sessions; the engine holds the live session and can steer/abort/switch models directly (`api/agent/harnesses/pi/piHarness.js`). | **Tier 1** (already maximal) | Nothing to gain — already in-process. |
| `opencode` | **Tier 2** | KainBain is an SDK client of `opencode serve` (spawned per project or `OPENCODE_URL`): SSE event stream, per-message model selection, plus two-way `prompt_async` steer and `abort` (`OpencodeHarness.js`, `OpencodeServerManager.js`, `OpencodeSessionWrapper.js`, `opencode/FACTS.md`). The OpenCode core is a **separate server process**, so this is programmatic invocation, not direct integration. | **Tier 2** | Tier 1 only if OpenCode exposes an in-process embeddable API/runtime that KainBain could import and own; today the SDK is an HTTP client to an external server. |
| `antigravity` | **Tier 2** | Long-lived bidirectional ACP session (JSON-RPC 2.0 over stdio via the reusable `api/agent/harnesses/acp/` core + `agyAcpSupport.js` flavor): steerable turns, `requestPermission` interception, swallowed-502 filter, process-group supervision. Engaged via `KAINBAIN_AGY_ACP=on` or `KAINBAIN_AGY_ACP_BIN`; without an ACP endpoint it falls back to one `agy -p <prompt>` process per turn (`--output-format stream-json` parsed, `--conversation <id>` continuity) (`api/agent/harnesses/antigravity/agyHarness.js`). | **Tier 2** (already maximal) | Nothing to gain while the session stays programmatic; Tier 1 only if Antigravity exposes an in-process embeddable runtime KainBain could own. |
| `muse` | **Tier 2** | Long-lived bidirectional MSP (Muse Session Protocol) session over `muse serve` (NDJSON JSON-RPC 2.0, purpose-built `api/agent/harnesses/muse/msp/` client, UUIDv7 idempotency commandIds): steerable turns (`turn/steer` with `expectedTurnId`), interrupt-based abort (`turn/interrupt`), per-request permission interception (`approval/request` → policy → `approval/decide`, closed approval enum, default-deny on unknown shapes), live model catalogue (`model/list`) + per-session `session/setModel`, live usage telemetry, and `session/resume` reconnect after a supervised host restart. One `muse serve` host per project workspace (idle TTL), one MSP session per KainBain session. Engaged by default (`KAINBAIN_MUSE_MSP=auto`: MSP when the resolved `muse` binary advertises `serve`); `KAINBAIN_MUSE_MSP=off` rolls back to one `muse exec` process per turn (JSONL parsed, `--model` passthrough, `--session-id` continuity). Schema fingerprint pinned (`sha256:5d3b…1d914c`) so upstream drift fails the fixture tests loudly. (`docs/EngineDetails/MuseHarness.md`) | **Tier 2** (already maximal) | Nothing to gain while the session stays programmatic; Tier 1 only if Muse exposes an in-process embeddable runtime KainBain could own. |
| `vibe` | **Tier 2** | Long-lived bidirectional ACP session over the standalone `vibe-acp` agent (reusable `api/agent/harnesses/acp/` core + `vibeAcpSupport.js` flavor): permission interception, live `usage_update` telemetry, per-session model pinning via `session/set_config_option`, and a live model catalogue read from the `session/new` configOptions (`vibeModelCatalog.js`). Engaged by default (`KAINBAIN_VIBE_ACP=auto`: ACP when the `vibe-acp` entrypoint resolves); `KAINBAIN_VIBE_ACP=off` rolls back to one `vibe --prompt` process per turn (`--output streaming` rows parsed, auto-approve flag). Caveat: vibe's ACP method map has **no `session/steer`** — mid-turn steering is best-effort only (surfaced, never crashed) until upstream ships it. (`api/agent/harnesses/vibe/vibeHarness.js`, `docs/EngineDetails/VibeHarness.md`) | **Tier 2** (already maximal) | Nothing to gain while the session stays programmatic; Tier 1 only if Mistral exposes an in-process embeddable runtime KainBain could own. |
| `codex` | **Tier 2** (theoretical shim on this device) | Scaffold-only on this device: `codex` is not installed, so the harness detects absence (PATH + `KAINBAIN_CODEX_BIN`), marks itself unavailable, never spawns, and returns an honest "not installed" hint. When a binary is present it would engage the exec/programmatic transport; auth is Codex-native (`OPENAI_API_KEY` / Codex login) and never stored by KainBain. (`api/agent/harnesses/codex/codexHarness.js`, `docs/EngineDetails/CodexHarness.md`) | **Tier 2** | Underlying Codex CLI flags/RPC contract is UNVERIFIED on this device; full session+exec integration is future work. |
| `custom` | **Tier 3** | Generic project-configured command line with the curated prompt appended; KainBain spawns it and reads stdout. It is the documented workaround for CLIs with no dedicated integration (`api/agent/harnesses/custom/customHarness.js`, `docs/EngineDetails/CustomHarness.md`). | **Tier 3** | By design it is a generic exec wrapper; going higher means writing a per-CLI integration, at which point it is no longer the "custom" harness. |
| `mock` | **Tier 1** (test-only) | Pure in-process synthetic harness — no child process, no AI. Mechanically identical to a Tier 1 integration, but it produces fake output and must never be mistaken for real support (`api/agent/harnesses/mock/mockHarness.js`). | **Tier 1** (test-only) | Not applicable: it is a test/demo fixture, not a real agent harness. |

## Round-down calls made

- **`opencode` → Tier 2, not Tier 1.** It is a first-class SDK integration and
  feels deeper than a CLI, but Tier 1 is reserved for KainBain owning the
  low-level code. OpenCode's core runs in a separate server process, so the
  honest label is the two-way programmatic tier.
- **CLI harnesses → Tier 3, not Tier 2.** `custom` streams structured
  output, but it keeps no persistent two-way channel the engine can steer.
  Streaming output alone does not make Tier 2. (`muse` left this group when
  its MSP `serve` session path landed: `antigravity`, `vibe`, and `muse` all
  now hold a persistent two-way channel with real steering/interception,
  which is exactly what Tier 2 requires.)
- **`mock` → Tier 1 with a `test-only` tag.** Rounding it down to Tier 3 would
  misrepresent how it is wired (it is in-process); hiding it would misrepresent
  what it is. The label states the mechanic and the tag states the caveat.

## How the label reaches the UI

The tier is **derived server-side** and projected through `GET /harnesses`
(`supportTier`, `supportTierLabel`, `supportTierSummary`, `testOnly`), so the
System Settings › Harness tab renders whatever the registry declares and never
keeps a per-harness tier map of its own. A harness registers its tier once, at
`registerHarness(name, factory, { supportTier })` in
`api/agent/harnessRegistry.js`; the canonical vocabulary lives in
`api/agent/harnessSupportTiers.js`.

The labels describe **integration depth, not model quality** — a Tier 3
harness is not "worse", it simply exposes only a one-way exec surface today.
