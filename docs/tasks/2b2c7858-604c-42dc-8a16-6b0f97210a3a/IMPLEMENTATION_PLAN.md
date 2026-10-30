# Implementation Plan — Surface Agent Logs to the UI (Runner Parity with Muse Code)

## Goal

Restore the pre-runner monolith log experience so watching a task in the UI feels like watching Muse Code work live: every step visible as it happens, with full detail retained as searchable history. Close the fidelity gap introduced when execution moved to runners.

## Success Criteria

- UI shows live, step-by-step agent activity (assistant text, thinking/reasoning, tool calls with args, tool results, errors/retries, permission requests, plan updates, usage/telemetry, timings) with no token-fragment flicker.
- Same detail is available after the run as history; history is retained (keep everything) and searchable.
- Only data that already exists is shown — no AI-generated summaries (per survey constraint).
- Secrets and PII are redacted automatically before display, persistence, or repo commit.
- Existing gates stay green: `npm run test:unit`, `npm run lint`, relevant headless/screenshot checks.

## Survey Constraints (from SURVEY.md — binding)

- Q1: experience must be "like watching it work live, step by step (Muse Code style)".
- Q2: all five detail classes required — short status updates, actions taken (files read/changed, commands run), full command/tool results, errors and retries, per-step timings. Note: "Only use things that already exist, don't use AI to generate summaries".
- Q3: both live AND history ("Full transparency").
- Q4: "Keep everything and make it searchable".
- Q5: "Yes, hide secrets automatically" + PII; motivation is that logs may be committed to the repo, so redaction must happen before persistence/commit, not just at render.

## Current-State Evidence (what the plan is grounded in)

- Normalized event vocabulary already exists: `api/agent/sessionEvents.js` defines 8 core events (`run_started`, `assistant_delta`, `message_started`, `tool_started`, `tool_updated`, `tool_finished`, `run_finished`, `run_error`) plus additive unified-log events (`usage_updated`, `session_meta`, `permission_requested/resolved`, `plan_updated`, `reasoning_delta`, `harness_log`).
- Grouped structured pipeline already exists: `api/agent/logStream/logProcessor.js` + `api/agent/logStream/agentLogStreamer.js` produce one entry per semantic block over feeds (`main`, `thinking`, `tools`, `telemetry`, `raw`), with rendered legacy tag grammar (`[AGENT]`, `[TOOL]`, `[RESULT]`, `[ERROR]`, `[THINKING]`, `[INFO]`).
- The runner is the suspected degradation point: `runner/harness.js` (`runHarnessStage`) subscribes to the session but forwards ONLY `assistant_delta.delta` and `harness_log.text` strings via `onLog` — it drops `tool_started/updated/finished` (args, results, timings), `reasoning_delta`, `usage_updated`, `permission_*`, `plan_updated`, and error/retry structure. `runner/client.js` is a thin fetch wrapper; check what log/event upload calls it offers (likely text-only) — this is Research R1.
- UI shell already exists: `frontend/src/components/logs/` (`LogViewer.jsx`, `adapters.js`, `logCategories.js`, `logViewerState.js`) with category chips, search, density, timestamps, grouped expandable rows. Check which categories/feeds the task-detail surface actually subscribes to — likely main-only (Research R2).
- Shared formatting exists: `shared/toolLogFormat/` (truncate, summarize, stripAnsi, pickPrimaryArg). Reuse; do not invent a parallel formatter.
- Transport candidates: `api/routes/ws.js`, `api/eventBridge.js`, `api/routes/sessions.js`, `api/routes/tasks.js`. Map which path carries live logs vs history today (Research R2).

## Approach

Make the change easy first (contract + redaction + plumbing refactors with no behavior change), then make the change (widen what the runner forwards, persist everything, render everything). Research/big pieces come first because they decide the shape of every later step. No new AI summarization anywhere.

## Steps

### Phase 0 — Research first (big unknowns up front; no behavior change)

- R1. Runner→backend log path audit. Read `runner/daemon.js`, `runner/main.js`, `runner/client.js`, `runner/harness.js` fully; list every log/event upload call, payload shape, batching, retry, and ordering guarantee. Record exactly which normalized events survive the runner boundary today and which are dropped or flattened to text. Output: event-coverage matrix (rows = normalized events in `sessionEvents.js`, columns = runner forward / backend persist / WS live / UI render; mark pass/drop).
- R2. Backend→UI path audit. Read `api/routes/ws.js`, `api/eventBridge.js`, `api/agent/logStream/logRecord.js`, `api/routes/sessions.js` (+ task log endpoints), and the task-detail UI surface that owns `LogViewer` (find caller of `adapters.js`); record live transport (WS/SSE/poll), history fetch, retention/cap config (`maxEntries`, lane budgets in `DEFAULT_STREAMER_OPTIONS`), and which feeds the UI subscribes to. Output: second half of the coverage matrix + retention limits.
- R3. Redaction/PII inventory. Find existing secret-hiding utilities (search `redact`, `secret`, `mask`, `stripAnsi` consumers); list secret shapes already handled (tokens, keys, passwords) and gaps (PII: emails, paths with usernames). Decide reuse vs new single redaction module. Output: gap list + chosen home for the redactor.
- R4. Retention/search feasibility. Check session/task store (`api/sessionStore.js`, `api/projectStore.js`, task docs dir) for where full logs could persist, size risks ("keep everything" vs `maxEntries: 500` eviction), and what "searchable" means with current `LogViewer` search (client-side filter vs server search endpoint). Output: retention + search approach decision (persist full structured entries; client search first, server search only if volume demands).
- Gate: write the coverage matrix + decisions into the plan file as an appendix before any code change. If R1–R4 contradict the approach below, revise the plan first.

### Phase 1 — Make the change easy (refactors, no behavior change)

- E1. Freeze the parity contract. Add/extend a contract test (sibling of `api/agent/logStream/harnessFidelity.test.js`) asserting every normalized event in `AGENT_EVENT_NAMES` maps to a structured record + feed + rendered tag. No producer changes yet — failing rows document the gap and become the acceptance checklist.
- E2. Single redaction choke point. Introduce one redaction helper (reuse existing if R3 finds it) applied at the log-record creation boundary (`logProcessor.js`/`logRecord.js`), covered by unit tests with secret + PII fixtures. Wire it in but keep behavior identical for clean inputs (all existing tests green).
- E3. Runner plumbing ready for structured events. Refactor `runHarnessStage`'s `onLog(string)` subscription so a structured-event callback can ride alongside without changing current behavior (e.g. add optional `onEvent`, default delegates to existing `onLog`). Unit-test that existing callers see byte-identical text output.

### Phase 2 — Make the change (restore fidelity)

- C1. Runner forwards everything. Change `runner/harness.js` (+ `daemon.js` upload path from R1) to forward full normalized events (tool calls with args, tool results, reasoning deltas, usage, permissions, plan updates, errors/retries with timing metadata), not just text deltas. Preserve ordering; batch sensibly.
- C2. Backend persists + streams everything. Ensure the runner-received events flow through `agentLogStreamer`/`logProcessor` into persisted structured entries (respecting raised/justified retention from R4) and onto the live channel (`eventBridge.js`/`ws.js`) with the same redaction applied pre-persist.
- C3. UI renders everything live + history. Extend the task surface's `adapters.js` mapping so all feeds (`main`, `thinking`, `tools`, `telemetry`, `raw`) reach `LogViewer` with correct categories; verify chips, timestamps, timings, error/retry styling, and expandable full tool args/results. Live must append incrementally (follow-scroll preserved); history view must load the persisted full log with working search.
- C4. "Keep everything, searchable" + secret-safe. Implement the R4 retention decision (raise/paginate caps, eviction marker preserved) and confirm `LogViewer` search covers all retained records; confirm redaction runs before persistence AND before any repo-committed artifact (survey Q5 motivation). Add a test that a secret in a tool result never reaches the store or the wire.

### Phase 3 — Assurance (testing + documentation)

- T1. Contract + unit tests (primary gate `npm run test:unit`): parity contract test from E1 fully green; redaction unit tests (secrets, PII, clean-input passthrough); runner forward-ordering tests; adapter mapping tests for every feed/category.
- T2. Integration tests: runner→backend→WS round-trip test asserting a tool call with args/result, an error/retry, and a timing record all arrive live and persist to history; history-fetch test asserting search finds retained content across runs.
- T3. UI verification without long-lived servers: `LogViewer` tests with fixtures covering all categories + search + density + follow-scroll; headless check via `npm run capture:screenshot` on a mock-fixture log surface only if visual regression is suspected (per testing guidance — no bespoke servers).
- T4. Full gates before done: `npm run test:unit`, `npm run lint`; record results in the final report.
- D1. Docs: short section in user-facing docs (task/activity view) describing what is logged, retention/search behavior, and the secrets-redaction guarantee (including the repo-commit safety note). Keep to the existing docs convention; link, don't duplicate the contract.
- D2. Appendix the final coverage matrix (all rows passing) and note any intentional non-goals (e.g. server-side full-text search deferred if client search suffices).

## Validation Plan

- `npm run test:unit` (primary gate — must pass).
- `npm run lint` (must pass).
- Focused suites: `api/agent/logStream/` tests, `runner/` tests, `frontend/src/components/logs/` tests.
- Manual/headless: open a task with a mock log fixture, confirm live-append feel (step-by-step, timings visible, errors/retries distinct), reload and confirm identical history, search for a tool name and a secret (secret MUST return nothing), all via existing fixtures or `npm run capture:screenshot` — no long-lived servers.

## Risks / Open Questions

- Volume vs "keep everything": full tool results for long runs can be large; mitigation is pagination + existing lane budgets, not truncation of narrative (per `DEFAULT_STREAMER_OPTIONS` note). R4 decides exact caps.
- Ordering across runner→backend→WS under retry: C1 must keep a sequence/timestamp so live view never reorders steps; integration test T2 pins this.
- Secret shapes we haven't seen: redactor starts from R3 inventory + common token/key/password/email patterns; unknown shapes remain a residual risk, noted in docs (report-a-secret path).
- No AI summaries: any proposal to compress logs with generation is out of scope by survey constraint — use truncation/expand/collapse UI only.
- Non-goals: no new transports (reuse WS/bridge), no new formatter (reuse `shared/toolLogFormat`), no server-side search unless R4 proves client search insufficient.
