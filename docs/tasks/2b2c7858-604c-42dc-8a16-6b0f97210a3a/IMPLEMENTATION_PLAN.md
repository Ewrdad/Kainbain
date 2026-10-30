# Implementation Plan — Surface Agent Logs to the UI (Runner Parity with Muse Code)

## Goal

Restore the pre-runner (monolith) log experience now that agent execution has
moved to out-of-process runners. The UI should feel like watching Muse Code work
live, step by step, with full detail available as searchable history. This is a
log-fidelity and transport parity task, not a product change: no new AI
summaries, reuse existing structured log machinery.

## Success Criteria (from the survey)

- Live, step-by-step viewing of an agent running (Q1).
- Always visible, using only data that already exists (Q2 + note "don't use AI to generate summaries"):
  - short status updates,
  - actions taken (files read/changed, commands run),
  - full command/tool results,
  - errors and retries,
  - per-step timings.
- The same detail available live and as history (Q3), i.e. full transparency.
- Long-term retention, and the log must be searchable (Q4).
- Secrets and PII are removed automatically before display, persistence, and any commit (Q5), because logs may land in the repository.
- Existing gates stay green: `npm run test:unit`, `npm run lint`, focused log suites and headless screenshot checks.

## Survey Constraints (binding)

Taken from `SURVEY.md`:

- Q1: "Like watching it work live, step by step (Muse Code style)".
- Q2: all five detail classes; "Only use things that already exist, don't use AI to generate summaries".
- Q3: "Both live and history" ("Full transparency").
- Q4: "Keep everything and make it searchable".
- Q5: "Yes, hide secrets automatically" plus PII, so committed logs stay safe.

## Current-State Evidence (why fidelity was lost)

### A. The structured pipeline already exists in-process

- Normalized agent events are defined in `api/agent/sessionEvents.js` as
  `AGENT_EVENT_NAMES`:
  `run_started`, `assistant_delta`, `message_started`,
  `tool_started`, `tool_updated`, `tool_finished`,
  `run_finished`, `run_error`,
  plus unified-log events
  `usage_updated`, `session_meta`, `permission_requested`,
  `permission_resolved`, `plan_updated`, `reasoning_delta`,
  `harness_log`.
- `api/agent/logStream/logProcessor.js` turns those events into canonical,
  grouped records over feeds `main`, `thinking`, `tools`, `telemetry`, `raw`.
- `api/agent/logStream/agentLogStreamer.js` wraps the processor and exposes
  `handleEvent`, `system`, `consumeFeed`, `snapshot`, `renderText`,
  `renderFeed`; `agentRunner.js` uses it in the embedded path and passes
  entries through `onChunk`.
- `api/watch/processLogs.js` renders legacy tags from structured entries,
  synthesizes entries for system/GIT/CI/RUNNER lines, manages entry caps
  (`_appendProcessLog`, `_appendLogEntries`, `_replaceLogEntries`,
  `_capLogEntries`), and maps runner frames to kind `runner`.

### B. The embedded path already preserves this

In `api/flow/execution/executeStage.js` (embedded mode), `agentRunner(...)`
receives `onChunk`; each chunk (`entry.text`) is appended via
`_appendProcessLog` while running, and after the stage
`_replaceLogEntries(task, startIndex, result.logEntries)` upgrades the
synthesized entries to the streamer's structured entries. The candidate
UI then receives everything through `adaptTaskEntries` in
`frontend/src/components/tasks/LogsPanel.jsx` -> `LogViewer`.

### C. The runner boundary only carries text — this is the regression

- `runner/harness.js::runHarnessStage` subscribes to the session but forwards
  only:
  - `assistant_delta.delta` as `event.delta`
  - `harness_log.text` as `event.text`,
  and only those two. It drops `tool_started/updated/finished` (args, full
  results, timings), `reasoning_delta`, `usage_updated`, `permission_*`,
  `plan_updated`, and structured error/retry data. It returns only `output`.
- `runner/daemon.js` turns any `onLog(text)` call into newline-split chunks via
  `sendLogs`, each POSTed to `/tasks/:id/logs` with `bytes` only.
- `api/flow/executionLedger.js::ingestLogs` treats each frame as a text string
  and calls `_appendProcessLog(task, \`[runner ${runnerId}] ${bytes}\`, ...)`.
  That is why the UI only sees runner-prefixed text chunks instead of
  `[TOOL]`/`[RESULT]`/`[THINKING]`/telemetry records with args and timings.
- `api/flow/execution/applyRunnerReport.js` persists `outcome.output`
  (final assistant text) into the stage report and uses it as
  `streamedOutput`; it does not restore tool, thinking, usage, or timing
  entries. (Exit-code/output tail behavior is retained.)
- `api/flow/runnerRoutes.js::/tasks/:id/logs` additionally emits a
  `process:stdout` socket event limited to the runner-prefixed text chunk,
  so the live tail matches the coarse ingest.

### D. UI already has the viewer we need

- `frontend/src/components/logs/` contains `LogViewer.jsx`, `adapters.js`,
  `logCategories.js`, `logViewerState.js` with category chips, search, density,
  timestamps, grouped expandable rows, and follow-scroll. The task surface
  calls `useTaskLogs` -> `adaptTaskEntries`.
- `shared/toolLogFormat/` contains `summarizeToolStart`, `summarizeToolResult`,
  `summarizeUsage`, `summarizePermission`, `summarizePlan`, `stripAnsi`, plus
  normalization/truncation helpers. This is the canonical formatter; do not
  duplicate it.
- Redaction today is environment-variable-name based only:
  `api/agent/harnesses/shared/harnessScaffold.js` exports
  `SECRET_NAME_PATTERN`, used to drop secret-shaped env vars from child envs.
  There is no content/PII redactor for log text; one must be introduced.
- Caps: `config.logEntriesMaxCount` defaults to 500 (from schema/tests).
  Survey Q4 ("keep everything") conflicts with the current eviction policy and
  needs an explicit decision (pagination/archive, not silent truncation).

## Principle used throughout

Make change easy first (refactors, redaction choke point, structured transport
plumbing with no behavior change), then make the change (widen forwarding,
persist/stream everything, render everything). Research that decides the shape
of the work comes before coding changes.

## Phase 0 — Research first (big unknowns; no behavior change)

- R1 Runner->backend log path audit (done largely above; finalize exact
  client contract): confirm `runner/client.js::logs` payload constraints,
  batching, retry, and whether a structured-event upload is viable or requires
  a new endpoint/field. Output: event-coverage matrix with rows = 17
  normalized AGENT_EVENT_NAMES and runner columns `forward`,
  `preserve order`, `backend ingest`, `live socket`, `persisted`,
  `UI render`; mark current-state pass/drop, and the target state every row
  must reach.
- R2 Backend->UI/live path audit: map `api/routes/ws.js`, `api/eventBridge.js`,
  `api/routes/sessions.js`, task log endpoints, `useWebSocket`, `useTaskLogs`,
  `adaptTaskEntries`, `fullTextIndex`, and `normalizeEntries`. Confirm (a)
  whether WS delivers structured entries or only process lines, (b) what the
  logs tab refetches after run completion, and (c) how history is retained
  and capped. Output: second half of coverage matrix + retention limits.
- R3 Redaction inventory and chosen home:
  - reuse `SECRET_NAME_PATTERN` for env-var-name secrets;
  - add a content redactor for tokens, keys, passwords, bearer/basic
    headers, connection strings, cloud credential JSON, PII (emails, user
    paths, phone/card-like), with evidence on whether each category is
    already detected somewhere (no: only env-name patterns exist);
  - choose `logRecord.js`/`logProcessor.js` as the choke point so all sources
    (embedded agent, runner ingest, command stages, git/ci) share one
    redactor, and document allow-list assumptions.
- R4 Retention and search feasibility:
  - evaluate `logEntriesMaxCount`/lane budgets against "keep everything";
  - propose retention model: raised cap + bounded lane budgets, client-side
    full-text search retained, with optional paged history beyond cap via
    execution-archive only if volume demands;
  - keep the eviction marker contract intact.
- R5 (small) confirmation of runner UI category wiring: inspect whether the
  smoothness issue is caused only by coarse runner chunks, or additionally by
  monitor surfaces that exclude tool mirrors. Output: call sites and chips.
- Gate: append the finalized coverage matrix + decisions to this file before
  changing behavior. If R1-R4 contradict the plan below, revise first.

## Phase 1 — Make the change easy (refactors, no behavior change)

- E1 Freeze the parity contract.
  - Add/extend a contract test in `api/agent/logStream/harnessFidelity.test.js`
    (or sibling) that asserts every `AGENT_EVENT_NAMES` entry maps to a
    structured record + feed + rendered tag, and captures failing rows as the
    acceptance checklist. No producer change yet.
- E2 Single redaction choke point.
  - Introduce one redaction helper (new module under `shared/` or `api/watch/`
    per R3, no duplication), applied inside `logRecord.js`/`logProcessor.js`
    at record creation, and inside runner ingest and `applyRunnerReport` for
    any text passed through.
  - Wire into the embedded path; verify byte-identical behavior on clean
    inputs (all existing tests green) by covering redaction fixtures.
- E3 Runner plumbing for structured events without changing current behavior.
  - Refactor `runHarnessStage` subscription to an `onEvent(event)` structured
    callback, deriving `onLog(text)` for backwards compatibility. Add
    optional structured upload hooks, keeping existing text behavior as a
    fallback.
  - Unit-test that existing callers receive byte-identical text output.
- E4 Structured ingest in backend, optional and backward-compatible.
  - Extend `/tasks/:id/logs` or add `/tasks/:id/log-events` (R1 decision) so a
    runner can send structured event batches; `executionLedger` forwards them
    to `_appendLogEntries`/`_replaceLogEntries`-style handling, preserves seq
    ordering and gap/duplicate semantics, while still falling back to prefixed
    text for old runners.

## Phase 2 — Make the change (restore fidelity)

- C1 Runner forwards everything.
  - Change `runHarnessStage` and daemon sending to forward all normalized
    events with payload (tool args, tool result partials/finals, thinking
    deltas, usage, permissions, plan updates, session meta, errors/retries)
    and timing data derived from event processing.
  - Preserve runner-generated `seq` ordering across batches and retries.
  - Redact on the sending side too, in case a runner runs locally and reads
    local secret-bearing output.
- C2 Backend persists and streams everything.
  - Route runner events through `agentLogStreamer`/`logProcessor` (or the same
    structured ingest path as E4) into `task.logEntries`.
  - Raise/justify retention caps per R4; never silently drop events except
    under the existing eviction marker.
  - Push the same events to live WS channel with structured entry shape, not
    only the `[runner ...]` text line; keep that text line as one legacy view.
  - Ensure `applyRunnerReport` receives/stores structured `logEntries`
    (or preserves the ingested ones) and passes final output separately.
- C3 UI renders everything live and as history.
  - Ensure `adaptTaskEntry` and `adaptProcessLogLine` preserve tags/kind/tool
    fields, timing fields, and expandable detail.
  - Add/enable categories for tool arguments, tool results, thinking,
    errors/retries, permissions, plan updates, telemetry, raw evidence in
    `LogViewer`.
  - Live append must remain incremental with follow-scroll; follow-scroll
    restoration on tab return must still work.
  - History view must refetch complete retained log and keep client-side
    searching; confirm search finds tool names, command names, error text.
- C4 "Keep everything, searchable" + secret/PII safety.
  - Implement R4 retention (cap changes + lane budgets + pagination/virtual
    scroll if needed), keeping eviction markers for units beyond cap.
  - Add test proving a secret in a tool result never reaches `task.logEntries`,
    live WS payload, task docs committed, or report persisted output tail.
  - Cover PII shape fixtures from R3.

## Phase 3 — Assurance (testing + documentation)

- T1 Contract + unit tests (primary gate `npm run test:unit`):
  - parity contract from E1 fully green;
  - redaction tests for env-name secrets, Inline key/value, bearer/basic,
    connection strings, cloud credentials, PII (email/user path/phone/card)
    plus clean-input passthrough;
  - runner forwarding/ordering tests;
  - executionLedger structured ingest tests including seq gaps/duplicates;
  - adapter/category tests for every feed/kind.
- T2 Integration tests:
  - runner->backend->WS round-trip asserting a tool call with args/result,
    an error/retry, and a timing record arrive live and persist as history;
  - history fetch/search across completed runs;
  - applyRunnerReport keeps structured entries and report detail.
- T3 UI verification:
  - use existing `LogViewer` unit tests + fixture data for all categories,
    timestamps, density, search, expand/collapse, follow-scroll;
  - visual only via `npm run capture:screenshot` against existing
    fixtures/mocks if needed; no bespoke long-lived servers.
- T4 Gates before completion:
  - `npm run test:unit` (must pass),
  - `npm run lint` (must pass),
  - `npm run docs:check` if documentation content is changed.
  Record commands and results in the stage/final report.
- D1 Documentation:
  - short section describing what is logged, live/history behavior, retention
    and search, redaction guarantee, ordering/gap behavior, and residual
    unknown-secret risk (report-a-secret path);
  - keep it linked from existing task/activity docs rather than duplicating
    contract text.
- D2 Appendix:
  - final coverage matrix with all rows passing;
  - explicit non-goals (no AI summaries, no new transport, no new formatter,
    no server-side full-text search unless R4 proves client-side insufficient).

## Validation Plan

- Primary gate: `npm run test:unit`.
- Secondary: `npm run lint`, and `npm run docs:check` once D1 lands.
- Focused suites: `api/agent/logStream/*.test.js`, `api/flow/runnerRoutes.test.js`,
  runner tests, `frontend/src/components/logs/*`.
- Manual/headless: open a task using a mock log fixture and verify
  step-by-step live appends (assistant text, assistant reasoning, tool call
  with args, tool result, error/retry, usage, permission/plan), timings, then
  reload and confirm identical history, search for a tool name, and confirm a
  secret/PII is absent from store/WS/report via tests. Use
  `npm run capture:screenshot` only if a visual concern remains.

## Risks and Mitigations

- Volume vs. "keep everything": mitigate with pagination/virtual scroll and
  lane budgets, not narrative truncation.
- Ordering across runner->backend->WS and retries: pin a seq/timestamp
  contract in the new structured ingest and integration-test it.
- Unknown secret shapes: redactor starts from R3 inventory + common patterns;
  document residual risk and report-a-secret path.
- Secret-safe by position: redact before persistence and before commits;
  tests cover store, WS, and report paths.
- Backwards compatibility: text ingest (`/tasks/:id/logs`) remains usable,
  so older runners degrade only to the current coarse text view rather than
  failure.

## Appendix — Confirmed Event Coverage Gap (runner boundary)

| Event | Runner forwards | Backend persisted | Live UI category | Target |
| --- | --- | --- | --- | --- |
| run_started | no | partial | system | structured |
| assistant_delta | text only | text | assistant | structured |
| message_started | no | no | none | structured |
| tool_started | no | no | none (via prefixes) | tool |
| tool_updated | no | no | none | tool |
| tool_finished | no | no | none (via output) | tool/result |
| run_finished | no | no | none | structured |
| run_error | no | no | none | error |
| usage_updated | no | no | none | telemetry |
| session_meta | no | no | none | system/meta |
| permission_requested/resolved | no | no | none | system |
| plan_updated | no | no | none | system/plan |
| reasoning_delta | no | no | none | thinking |
| harness_log | yes | text only | runner | structured |

This appendix is the acceptance checklist: the stage is not done until every
row's `Live UI`/`Backend persisted` outcome matches embedded parity and the
survey-required details (args, results, errors/retries, timings) are visible.
