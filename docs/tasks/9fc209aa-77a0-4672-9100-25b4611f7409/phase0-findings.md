# Phase 0 findings — antigravity conformance decision log

Date: 2026-11-26. Host: server2. CLI: 1.5.18 == latest stable (see
`version-matrix.md`). Raw captures: `/tmp/agy-probe/run{1,2,3}-stdout.ndjson`
(scratch; fixtures re-captured into the repo in Phase 3).

## F1 — stream-json rows nest framing fields (CRITICAL, class b+c)

Live `step_update`/`result` rows put `conversation_id`, `step_index`,
`state`, `step_type`, `status`, `response`, … INSIDE the event-named object;
`classifyAgyLine` reads them from the top level, so on a real CLI every
step_update arrives with `stepType/state/stepIndex/conversationId === null`.
Effect: no `message_started`/`assistant_delta` events, no `tool_*` events —
the transcript shows one `[AGY] …` harness_log line per step instead of real
work. Final text still lands via `result.response`, so trivial Q&A "works"
while anything tool-shaped looks spawned-but-idle.
Fix: parser reads framing fields nested-first with flat fallback (keeps old
fixtures + mock valid); mapper unchanged. New fixtures: live-nested success +
tool-call rows (Phase 3.2).

## F2 — `--effort` value set grew (class c, minor)

CLI accepts `low|medium|high|xhigh|max`; harness `reasoningLevels` and
`EFFORT_LEVELS` (effort-suffix split) only know `low|medium|high`. A stored
ref like `slug:xhigh` or a model switch to an `xhigh` level silently drops
the effort. Fix: add `xhigh` (+`max`) to both sets; `--effort` argv unchanged.

## F3 — `finished_reason: print_timeout` defensive mapping (class d)

Live partial run: exit 3, `result.status: ERROR`, `finished_reason:
print_timeout`, empty response — already maps to `run_error` via ERROR. The
plan's exit-0/SUCCESS-partial was not observed on 1.5.18 stream-json, but a
SUCCESS row carrying a `finished_reason` naming a timeout/ceiling must never
read as success. Fix: `finished_reason` in (`print_timeout`, `timeout`,
`deadline_exceeded`, `max_turns`, …) on a SUCCESS result → `run_error`
`AGY_RUN_TIMEOUT` (parser tolerates/ignores the new field).

## F4 — Runner silently passes harness `run_error` (class d, the reported bug)

`runner/daemon.js onEvent` latches only `fail_stage`; `session.prompt()`
never rejects, so `runHarnessStage` returns `{ output: "" }` and the verdict
passes open. Embedded path (`api/agentRunner.js`) already fails honestly.
Fix per plan Phase 2.1: latch `run_error` → `sessionError` →
`decideAgentStageVerdict` → `failed/infrastructure`.

## F5 — empty SUCCESS passes (class d)

`result.status: SUCCESS` with empty `response`, no deltas, no tool events
resolves `""` and passes. Fix: `AGY_EMPTY_RUN` run_error (plan Phase 2.3),
exec + ACP paths, stage runs only; `INTERRUPTED`/`CANCELED`/abort stay graceful.

## F6 — no change needed

Flags `-p/--output-format/--print-timeout/--sandbox/--skip-permissions/--model/
--conversation`, `models` TSV parsing, ACP handshake v1 + session params,
child-env allowlist, `assertSafeAgyArgs` guard — all verified live, no drift.
Transport decision (plan Q3): stay exec-default; ACP verified working for
operators who set `KAINBAIN_AGY_ACP=on`.

## Classification summary

| Finding | Class | Phase |
| --- | --- | --- |
| F1 nested wire shape | (b) parser tolerance + fixtures | 1.4 seam / 2.2 fix / 3.2 fixtures |
| F2 effort `xhigh`/`max` | (c) argv-adjacent fix | 2.2 |
| F3 `finished_reason` mapping | (d) new failure classification | 1.4 seam / 2.2 fix |
| F4 Runner run_error latch | (d) new failure classification | 1.1+1.2 seams / 2.1 flip |
| F5 AGY_EMPTY_RUN | (d) new failure classification | 1.3 seam / 2.3 flip |
| F6 rest | (a) no change | — |
| Version gate | (e) not needed — nested-tolerant parser works on old + new CLIs | — |
