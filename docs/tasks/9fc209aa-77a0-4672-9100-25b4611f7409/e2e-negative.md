# E2E negative — honest failures through the Runner entry point (Phase 4.3)

Date: 2026-11-26. Host: server2.
Probe: `/tmp/agy-e2e-negative.mjs` — drives `runHarnessStage` +
`decideAgentStageVerdict` exactly as `runner/daemon.js` does.

Command:

```sh
node /tmp/agy-e2e-negative.mjs
```

## Variant A — missing binary (real spawn failure)

Harness pointed at `/nonexistent/agy-missing-binary`:

- output: `""`, events: `run_error` only
- sessionError: `{ code: "AGY_BIN_MISSING", error: "Failed to start agy
  CLI … ENOENT [AGY_BIN_MISSING] Install the Antigravity CLI …", hint: … }`
- daemon-equivalent outcome: **failed**, failureKind **infrastructure**,
  reason `[Harness Run Error] Failed to start agy CLI …
  [AGY_BIN_MISSING] Install the Antigravity CLI …`

Before this task the same run passed open with empty output.

## Variant B — SUCCESS-but-empty run (spawned but idle)

Mock replay of `fixtures/empty-success.ndjson` (exit 0, `status:
SUCCESS`, empty response, no deltas, no tool calls):

- output: `""`, events: run_started, harness_log, `run_error` (no
  run_finished)
- sessionError: `{ code: "AGY_EMPTY_RUN", error: "agy exited SUCCESS with
  an empty response and no tool calls — the run did no work
  [AGY_EMPTY_RUN] Check auth/model/quota …", hint: … }`
- daemon-equivalent outcome: **failed**, failureKind **infrastructure**

Result: `E2E-NEGATIVE: PASS`

Conclusion (survey q2): spawn-but-does-nothing now fails loudly as
infrastructure with the `[AGY_*]` code and fix hint — on both the exec
path (this probe) and the ACP path (`empty_turn` mock mode, covered by
`agyHarness.acp.test.js`), and the daemon applies the same decision
(`runner/daemon.test.js` R9–R12).
