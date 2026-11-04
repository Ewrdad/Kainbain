# Phase 6 repro evidence — Runner agent-stage failure detection

Date: 2026-11-04. No live-operator repro run was started (per the
do-not-interfere constraint); the proof is the in-process wire suite
`api/flow/daemonParity.test.js`, which drives the REAL Runner daemon
(`runSingleAssignment` + `executeAssignment`) against the REAL backend
routes/stores over the wire protocol (fetch shim over `app.inject` — the
same suite that guards wire parity).

## E2E-a: FAIL block over the wire (repro of wf-test-730569)

Test: `fails back over the wire when the agent verdicts FAIL with reason
and fix`. Task goal `Please fail this task`; the agent's final output is
`Parity review found a blocker.` + a well-formed `KAINBAIN_VERDICT: FAIL`
+ `KAINBAIN_REASON: canary test red` + `KAINBAIN_FIX: …` block.

Observed (2026-11-04, `npm run test --prefix api -- daemonParity`):

- The `complete-execution` body ON THE WIRE is
  `{ outcome: "failed", failureKind: "rejected", failureReason:
  "[Agent Review Rejection] canary test red Fix guidance: …" }` —
  detected by the daemon itself, not just the backend double-check.
- The task does NOT advance (`currentStageId` unchanged), history has no
  `Agent stage completed` entry, and a `Stage failed …` entry is recorded
  (failback routing via `routeStageError`).

Pre-fix behavior for the same run: `outcome: "passed"`,
`failureKind: "none"`, task advances (the reported bug).

## E2E-b: `fail_stage` tool call alone (no verdict block)

Test: `fails back over the wire on a fail_stage tool call alone (no
verdict block)`. The session emits one `tool_started` event
(`toolName: "fail_stage"`, `args.reason: "parity fail_stage probe"`) and
a plain final reply with no `KAINBAIN_VERDICT` text.

Observed: wire completion is `{ outcome: "failed", failureKind:
"rejected", failureReason: "[Agent Review Rejection] parity fail_stage
probe" }`; the task fails back instead of advancing.

## Regression note (mock-echo interaction)

The pre-existing parity test (`completes a task over the wire with a mock
harness`) initially failed after the fix: the mock harness echoes the
prompt as its reply, and every curated agent prompt carries `# Stage
Failure Guidance` showing the verdict block UNFENCED (the contract
requires plain text) — so the raw echo parses as FAIL+reason+fix and the
shared decision correctly fails it, on either path. The test now wraps
the mock session to report an agent-like `KAINBAIN_VERDICT: PASS` reply
while still driving the full mock protocol; all of its original
assertions (wire completion, SHA, advance, push) are unchanged.
