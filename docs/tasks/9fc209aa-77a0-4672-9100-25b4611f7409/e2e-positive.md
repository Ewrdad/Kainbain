# E2E positive — real agy CLI through the Runner entry point (Phase 4.2)

Date: 2026-11-26. Host: server2. CLI: agy 1.5.18 (latest stable).
Probe: `/tmp/agy-e2e-positive.mjs` — drives `runHarnessStage` (the exact
function `runner/daemon.js` calls) with the real antigravity harness
(`agyBin: "agy"`), then applies `decideAgentStageVerdict` exactly as the
daemon does.

Command:

```sh
node /tmp/agy-e2e-positive.mjs
```

Prompt: "Create a file named agy-e2e.txt in the current directory with
exactly this content: ANTIGRAVITY E2E OK. Then reply with the line
KAINBAIN_VERDICT: PASS." (scratch workdir `/tmp/agy-e2e-pos-*/`, no repo,
no backend, no commit — the daemon's commit step is covered by existing
daemon tests and is unrelated to the harness run.)

Result: `E2E-POSITIVE: PASS`

Observed transcript (abridged):

- output: `Created agy-e2e.txt… KAINBAIN_VERDICT: PASS`
- sessionError: null
- events: run_started, harness_log (user_input), message_started,
  tool_started, tool_finished, assistant_delta, run_finished — no run_error
- spawn log: `[AGY] spawn s-write-file:e2e-pos: model=agy default
  sandbox=off approvals=auto (YOLO)`
- file `agy-e2e.txt` exists with exactly `ANTIGRAVITY E2E OK`
- verdict: `{ failed: false, failureReason: null, failOpenWarning: null }`

Conclusion (survey q1): the helper starts AND does real work — it read the
prompt, called tools, wrote the file, and streamed the full normalized event
lifecycle through the fixed nested-shape parser.
