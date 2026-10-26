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

## Nothing is silently dropped

Events a mapper cannot interpret land in the `RAW` feed as a
`kind: "raw"` record with `evidence.reason = "unmapped"`, with the source
payload scrubbed and capped. Reasonable caps apply per lane.

## Limits and failure behavior

- Total entries per stage run are bounded by `logEntriesMaxCount`
  (default 500); overflow evicts oldest-first under one updating
  `[INFO] (N earlier log entries evicted)` marker.
- Telemetry keeps a reserved budget (`telemetryMaxCount`, default 100) and
  raw evidence its own (`rawMaxCount`, default 50, `rawMaxBytes`, default
  8192 per record).
- Malformed input degrades to defaults instead of throwing; unknown
  feed/kind values fall back to `main`/`system`. Legacy tasks without the
  new fields render exactly as before — storage is never rewritten.

## Related

- `#/docs/activity-stream`