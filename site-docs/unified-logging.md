---
title: Unified Logging
section: how-it-works
order: 75
slug: unified-logging
---

# Unified Logging

KainBain captures agent execution as **structured entries** (`task.logEntries`) through a single processing layer so that every harness — Pi, OpenCode, Mistral Vibe, Antigravity, Muse, Custom, and Mock — is observed on the same terms. The full design lives in `docs/EngineDetails/UnifiedLogging.md`.

## Feeds

The log viewers expose the feeds:

- `ALL` — the combined narrative view.
- `ASSISTANT`, `THINKING`, `TOOLS` — the historical feeds.
- `SYSTEM` — engine and harness status lines.
- `TELEMETRY` — usage, token and cost records (never part of copy).
- `RAW` — bounded unmapped-wire evidence for post-mortem.

## Console

The filter block (category chips, search, density, timestamps) is collapsed by default on every surface; logs render immediately and the user reveals filters with the `Show filters` toggle. When a non-default filter is active while the block is hidden, a `Filters on` badge appears next to the toggle.

The main page `ActivityConsole` and the monitor page `LiveConsoleWidget`
share the same dark terminal frame (background, header bar, auto-scroll
toggle) through the `CONSOLE_CHROME` constants in
`frontend/src/components/logs/consoleStyles.js`, so the two consoles stay
visually aligned. Tool cards render an empty body until output arrives —
there is no stuck "Waiting for output..." placeholder. The activity drawer
starts collapsed on first visit unless "Default Expanded" is checked in
Workspace settings; the collapse/expand choice persists across reloads.

## Kinds and fidelity

Entries carry `kind` (`assistant`, `thinking`, `tool`, `error`, `system`,
`telemetry`, `permission`, `plan`, `raw`) plus an optional `fidelity`
(`exact`, `normalized`, `synthesized`) and, for tools and telemetry, typed
`tool`/`usage` records. Legacy entries still read unchanged: new fields are
optional and additive, and the exported `normalizeRecord` helper
(`api/agent/logStream/logRecord.js`) can upgrade a legacy entry to the
canonical shape at read time without rewriting storage.

## Runner transport (agent log parity)

Out-of-process Runners ship the same normalized events the embedded path
processes in memory. The harness forwards every session event
(`tool_started/updated/finished` with args and full results, `reasoning_delta`,
`usage_updated`, `permission_*`, `plan_updated`, errors/retries with per-step
timings) to `POST /tasks/:id/log-events` as sequenced batches; the backend
runs each batch through the same log processor, appends the canonical
records to `task.logEntries`, and broadcasts them live over the socket
(`PROCESS_LOG_ENTRIES`). The Logs tab therefore shows the same records live
and as history — what you watch mid-run is what a reload shows, searchable
by text, tool name, and expandable detail.

- Text frames (`POST /tasks/:id/logs`) stay as the backward-compatible
  fallback: old Runners degrade to the coarse `[runner <id>]` view, and a new
  Runner facing an old backend flips to text after the first failed batch.
- Sequencing survives retries and disconnects: duplicate batches are
  recorded no-ops, gaps land as visible "frames missing" markers — never
  silently papered over.
- Secrets and PII are redacted before display, persistence, and any commit:
  every record passes the shared redactor (`shared/redactSecrets.js`) at
  creation — bearer/basic credentials, API keys, vendor tokens, connection
  strings, cloud credential JSON, private keys, emails, home directories,
  phone/card shapes, plus secret-shaped values by key name. The live socket
  is covered too: structured batches fan out from already-redacted stored
  records, and legacy text frames are redacted at the broadcast point in
  `POST /tasks/:id/logs` (older Runners ship raw text on the fallback path).
  If a value that looks secret to you ever appears in a log, treat it as a
  bug and report it: unknown shapes are the documented residual risk.

## Nothing is silently dropped

Events a mapper cannot interpret land in the `RAW` feed as a
`kind: "raw"` record with `evidence.reason = "unmapped"`, with the source
payload scrubbed and capped. Reasonable caps apply per lane.

## Limits and failure behavior

- Total entries per stage run are bounded by `logEntriesMaxCount`
  (default 500); overflow evicts oldest-first under one updating
  `[INFO] (N earlier log entries evicted)` marker. The in-memory window is
  intentionally bounded while full history is kept elsewhere: every run's
  records persist into the task's markdown (committed to the repository) and
  the stage reports, so "keep everything" holds at the history layer and the
  cap only bounds the live/loaded view. Client-side search runs over
  everything retained.
- Telemetry keeps a reserved budget (`telemetryMaxCount`, default 100) and
  raw evidence its own (`rawMaxCount`, default 50, `rawMaxBytes`, default
  8192 per record).
- Malformed input degrades to defaults instead of throwing; unknown
  feed/kind values fall back to `main`/`system`. Legacy tasks without the
  new fields render exactly as before — storage is never rewritten.

## Related

- `#/docs/activity-stream`