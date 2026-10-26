---
title: Stage Liveness, Silence & Stalls
section: how-it-works
order: 25
slug: stage-liveness-and-stalls
---

# Stage Liveness, Silence & Stalls

A running stage can be legitimately quiet for minutes (a full test gate, a
docker build, a long model think). The engine never equates silence with
death: each long-running stage type has a **liveness** signal, a
**silence watchdog** as the last-resort containment, and a hard
**wall-clock ceiling**. This page is the division of labour — read it
before tuning any `KAINBAIN_*_STALL_TIMEOUT_MS` knob (see
`#/docs/pipeline-stages` for what stages are).

## The four budgets

| Budget | Who owns it | What it guarantees |
| ------ | ----------- | ------------------ |
| Keep-alive heartbeat | The engine, while the stage's child runs | A quiet-but-healthy stage is provably alive; the watchdog can never fire for it. |
| Silence watchdog (`KAINBAIN_*_STALL_TIMEOUT_MS`) | The engine, last resort | A stage whose child AND heartbeat are truly dead is killed, retried with backoff, never left wedged. |
| Stage `timeout` (`KAINBAIN_*_TIMEOUT_MS`, per-stage override) | The engine | No stage runs forever, no matter how alive it looks. |
| Gate branch `timeoutMs` | The test gate | A single hung check (e.g. the canary suite) is killed at its own budget with exit 124, not by accident. |

## How each stage type stays provably alive

- **CI / script stages** — a keep-alive ticker refreshes the stage heartbeat
  every `KAINBAIN_CI_HEARTBEAT_INTERVAL_MS` (default 30s) while the command's
  child process runs, independent of output. A coherence check at config load
  warns when the interval is not strictly below
  `KAINBAIN_CI_STALL_TIMEOUT_MS` (default 5 min), or when the keep-alive is
  disabled while the watchdog is armed.
- **Deploy stages** (a ci stage whose command runs `deploy.sh`) — the script
  runs its own heartbeat ticker and writes progress to its log; the engine
  additionally probes the deploy attempt checkpoint (pid liveness + freshness)
  before believing any silence.
- **Agent / review stages** — the harness session emits stream events;
  silence beyond `KAINBAIN_AGENT_STALL_TIMEOUT_MS` (default 10 min) covers a
  wedged model call, and the session is aborted on a stall.

## Why CI needed the keep-alive (the October 2026 incident)

The full verification gate buffers each check branch's output and prints it
only when that branch finishes. Its slowest branch (the serial canary
Playwright suite) is quiet for about five minutes — and the CI silence
threshold was five minutes. A healthy gate run was therefore killed as
"stalled" roughly every other run, re-ran the whole multi-minute gate up to
five times, and produced a `FAILED` report indistinguishable from a real test
failure. The fix was architectural, not a threshold bump:

1. The gate now emits progress while branches run — a `▸ started <name>`
   line at spawn and a `⏳ still running: …` tick every 30s
   (`KAINBAIN_GATE_PROGRESS_INTERVAL_MS`), so long branches are visible in
   the Logs tab instead of a blackout.
2. CI/script stages heartbeat while their child runs (above), so output
   silence can never masquerade as death again.
3. A watchdog kill is now self-explaining: the stage report carries a
   "Killed by the stall watchdog" banner with the silence, the threshold and
   the stage timeout, labels the exit code as synthetic, and the history
   line names the stage.

## Reading a stall

If a CI/script stage stalls today, both the output AND the keep-alive were
quiet past the threshold — a genuinely dead stage. The report tells you
which: a watchdog kill carries the banner; a real failure has a genuine exit
code and output. The resume/stall recovery runbook
(`docs/resume-stall-recovery-runbook.md` in the repo) covers the retry
ladder and the emergency levers (`KAINBAIN_CI_STALL_TIMEOUT_MS=0` disables
the watchdog; `KAINBAIN_CI_HEARTBEAT_INTERVAL_MS=0` disables the keep-alive —
both warn at boot, neither is a substitute for fixing a noisy stage).
