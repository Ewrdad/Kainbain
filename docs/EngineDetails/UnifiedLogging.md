# Unified Logging Platform

This document describes the unified log platform introduced for all harnesses
in the `kb/699d3c28-8f09-4fce-bd4b-c368406aa88b` task. The goal is that no
harness silently drops meaningful output, and that `task.logEntries` reads
like (or better than) running the harness CLI, with Pi as the gold standard.

## Canonical log record

Entries keep the legacy shape `{ id, ts, feed, feeds, kind, turn, text, meta }`
and gain optional typed fields at read/processor time:

- `seq`, `blockId`, `runId`, `harnessId`, `model`
- `fidelity`: `exact` | `normalized` | `synthesized`
- `evidence`: `{ wireType, sourceEvent, reason? }` (bounded raw lane)
- `tool`: `{ callId, name, args, result, exitCode, durationMs, partials }`
- `usage`: `{ inputTokens, outputTokens, cachedTokens, totalTokens, costUsd, contextUsed, contextWindow, steps, tokensPerSecond, model }`

New kinds: `assistant | thinking | tool | error | system | telemetry |
permission | plan | raw`. New feeds: `main | thinking | tools | telemetry |
raw`.

## Processing layer

- `api/agent/logStream/logRecord.js` — pure record factory and normalizer.
- `api/agent/logStream/logProcessor.js` — the only place normalized events
  become canonical records; `agentLogStreamer.js` is a thin state shell over
  it.

## Normalized event vocabulary (additive)

Added to `api/agent/sessionEvents.js` alongside the original 8 names:

- `usage_updated` `{ usage, model? }`
- `session_meta` `{ model?, effort?, sandbox?, permissions?, conversationId?, runFacts? }`
- `permission_requested` / `permission_resolved` `{ method?, target?, decision? }`
- `plan_updated` `{ steps[] }`
- `reasoning_delta` `{ delta }`
- `harness_log` `{ text, tag? }`

Original 8 names remain unchanged so old sessions stay valid.

## Limits (config)

- `logEntriesMaxCount` (default 500) total bound.
- `telemetryMaxCount` (default 100) reserved telemetry budget.
- `rawMaxCount` (default 50) raw lane bound.
- `rawMaxBytes` (default 8192) per-record raw source cap.
- `toolArgsMaxLength` 400 / `resultMaxLength` 600; full output in `tool.result`.

## Raw evidence lane

Unmapped or unknown wire events are emitted as `kind: "raw"` records with
`evidence.reason = "unmapped"`, scrubbed for obvious bearer/token patterns and
capped. Harnesses no longer silently drop them.

## Fidelity gate

`api/agent/logStream/harnessFidelity.test.js` asserts per harness that a
recorded fixture run produces records for every advertised capability (text,
thinking/reasoning, tool, telemetry, system/permission/plan) and that known
wire shapes never land in the raw lane as unmapped.

## Per-harness notes

- pi: usage/stop reason recovered from assistant message payloads.
- opencode: token telemetry + permission audit.
- vibe: reasoning rows → thinking; export telemetry structured.
- antigravity: user input/checkpoints surfaced, result usage telemetry.
- muse: reasoning + task/runtime lifecycle; task/terminal records as system.
- custom: stderr → error; exit codes; stdout via harness_log.
- mock: full-lane coverage for tests.

## Limits / design notes

Reasoning stays collapsed by default (`[THINKING] (N chars)`); telemetry
never leaks into narrative/copy except its own feed.

`normalizeRecord` (`api/agent/logStream/logRecord.js`) is exported and unit
tested as the read-time upgrade helper for legacy entries, but no serve path
calls it yet: today's readers (watch routes via `renderLogEntriesText`, the
frontend `logEntryModel`) already tolerate missing `feeds`/`fidelity`, so
wiring it in would change API response shapes for zero reader benefit. The
upcoming visual refactor is the consumer that should adopt it.

Code rule (kept here, not in `agent-docs/KB-Code-Standards.md`, because that
file is a byte-identical vendored copy whose header forbids in-repo edits):
extend `shared/toolLogFormat.js` for new render summaries, never fork a
parallel renderer; route unmapped data to the bounded raw lane, never a silent
`default:` drop.

## Failure modes (how this layer can fail, and what happens)

- **Unknown event type** → `kind: "raw"` record on the `raw` feed with
  `evidence.reason = "unmapped"` (scrubbed, capped at `rawMaxBytes`). Never a
  crash, never silent. Raw-lane overflow evicts oldest-first under one
  updating `[INFO] (N earlier raw entries evicted)` marker on the raw feed.
- **Malformed event (null, non-object, missing/non-string `type`)** → ignored,
  `handleEvent` returns `[]`. There is no wire type to attribute, so there is
  nothing honest to record.
- **Hostile `makeLogRecord` input (null, array, array `meta`, bad `turn`,
  unknown `fidelity`)** → degrades to defaults (system kind, main feed,
  turn 1, `{}` meta, kind-derived fidelity). Never throws.
- **Unserializable/circular wire payload** → `boundRawSource` falls back from
  `JSON.stringify` to `String()` to `"[unserializable wire event]"`. Never
  throws, never stores an empty source for a real payload.
- **Total overflow (`logEntriesMaxCount`)** → oldest entries evicted under one
  updating `[INFO] (N earlier log entries evicted)` marker that always stays
  first; the marker itself is exempt from eviction. Telemetry keeps a reserved
  budget (`telemetryMaxCount`) so a narrative flood cannot starve usage
  records; duplicate usage payloads are suppressed via payload dedupe.
- **Unknown feed/kind/fidelity strings** → fall back to `main`/`system`/
  kind-derived fidelity. Unknown `consumeFeed`/`GET /logs` feed → loud 400/
  throw (fail-loud at the API boundary, fail-safe inside the pipeline).
- **Secrets in wire payloads** → already redacted at the child-env seam
  (`harnessScaffold.buildChildEnv`); the raw lane additionally scrubs
  bearer/api-key shapes as defense in depth. Raw bytes stay in
  `evidence.sourceEvent`, never in display `text` (which is also ANSI
  stripped).

## Operations (transfer and continuation)

- **Config-first tuning:** lane budgets are config keys
  (`logEntriesMaxCount`, `telemetryMaxCount`, `rawMaxCount`, `rawMaxBytes`;
  see `api/config/schema.js`), so operators retune without code changes.
  Missing/invalid values fall back to compiled defaults in
  `createLogProcessor` — an unset key never unbounds a lane (`rawMaxBytes: 0`
  means the default cap, not uncapped).
- **Rolling upgrades:** records are additive — old tasks without the new
  fields render exactly as before, and new code reads old entries without
  migration (storage is never rewritten).
- **Two surfaces during transition:** harness-internal `harness.log` lines
  still reach project process logs while also becoming structured entries, so
  existing process-log tailing keeps working.
- **Rollback:** each harness mapper migration reverts independently — the
  processor tolerates the absence of new events, and unknown future wire
  shapes land in the raw lane instead of breaking the run.

Cross-reference: `#/docs/activity-stream`.

## Viewing the lanes

Structured kinds map to viewer lanes in [LogViewer.md](LogViewer.md):
`assistant`→Direct output, `tool`→Tool calls, `thinking`→Thinking traces
(markers stay narrative-visible; full blocks need the lane), `error`→Errors,
`telemetry`/`raw`→Telemetry/raw (opt-in), `permission`→Human/checkpoints,
`plan`→Stage movement, and `system` splits by tag/text into CI/Git/Human/
Stage/Debug/System. Until the telemetry/raw collection lands, those lanes
simply stay empty and disabled.
