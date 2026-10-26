# Long quiet steps must emit progress (gate author rule)

> Rule of thumb: **any step that can be silent for more than ~60 seconds must
> emit progress or a heartbeat.** Silence is not liveness — to the engine, to
> the operator, and to the stall watchdog.

The engine's CI/script stall watchdog is a *silence* guard with a
last-resort role (`KAINBAIN_CI_STALL_TIMEOUT_MS`, default 5 min): a running
command stage heartbeats on the
`KAINBAIN_CI_HEARTBEAT_INTERVAL_MS` keep-alive (default 30s) while its child
is alive, so a quiet-but-healthy stage survives by design. That means a
**wedged** stage is now bounded by the stage `timeout` and the gate's own
branch budgets — not by the watchdog. If you author or modify a gate,
repeat-runner, or long command, keep the following contract so the next
quiet step never recreates the October 2026 false-stall incident
(task `cafbf7b8`, root cause + plan in
`docs/tasks/cafbf7b8-c3c4-489e-909c-20d2698bfe65/IMPLEMENTATION_PLAN.md`).

## Contract for gate authors

1. **Stream progress, not just results.** `scripts/lib/run-parallel.mjs`
   already emits `▸ started <name>` per branch and a
   `⏳ still running: <name> (<elapsed>)` tick every
   `KAINBAIN_GATE_PROGRESS_INTERVAL_MS` (default 30s). Do not buffer output
   for the whole run of a minutes-long step — print a cheap heartbeat line
   instead. Keep the `Running <name>... PASS/FAIL (<s>s)` completion lines
   byte-identical; parsers and the UI depend on them.
2. **Give every minutes-long branch a `timeoutMs`.** A hung branch must die
   on its own budget (SIGKILL, exit 124, `timedOut: true`), not on an
   accidental silence window. The canary branch carries 15 min; follow that
   pattern.
3. **Never rely on the silence watchdog to bound your step.** It fires only
   when output AND keep-alive are quiet; a healthy quiet step must never see
   it. The stage `timeout` (per-stage `timeout` override or
   `KAINBAIN_*_TIMEOUT_MS`) is the wall-clock ceiling — set it honestly.
4. **One-line output per condition, not a firehose.** Progress lines are for
   humans and heartbeats; full output still belongs with the result
   (failures show details in full, passes stay quiet).

Related: the site-docs article `stage-liveness-and-stalls` (served at
`GET /docs/stage-liveness-and-stalls`) and the runbook
`docs/resume-stall-recovery-runbook.md` §1.
