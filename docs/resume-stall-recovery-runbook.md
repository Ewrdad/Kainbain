# Resume & Stall Recovery Runbook (Tier 1 — "Resume task")

**Owner:** engine on-call · **Code:** `api/flow/stageHeartbeat.js`,
`api/flow/taskScheduler.js` (`reconcileInterruptedDeploys`, `autoResumeTask`),
`api/flow/startupRecovery.js`, `api/flow/deployMarkers.js`
**Audit trace:** F-20 (RPN 63), F-12 (RPN 48), F-09 (RPN 56); ADR 0007.

## 1. Reading a `Stalled` timeline entry

A `Stalled` entry means the watchdog saw no heartbeat past the per-type
silence threshold (agent 10 min, CI/script 5 min, deploy 10 min, merge
15 min; `KAINBAIN_*_STALL_TIMEOUT_MS`, `0` disables one type). The engine
terminated the run (child process killed; for agent/review stages the stage
session is aborted — command stages never abort the shared project session)
and routed it through the normal transient ladder exactly once (`stallCount`
on the task, `stallRecoveries` in scheduler stats): a wedged stage retries
with backoff, it never loops forever, and you will see the transient-retry
history line WITHOUT a following failback. Tune a noisy threshold in `.env`
before disabling: a legitimately silent agent (long model thinking) wants a
larger `KAINBAIN_AGENT_STALL_TIMEOUT_MS`, not `0`.

Since the CI false-stall incident (task `cafbf7b8`) the watchdog is a
**secondary** guard for CI/script stages: while a command stage's child runs,
a keep-alive ticker refreshes its heartbeat every
`KAINBAIN_CI_HEARTBEAT_INTERVAL_MS` (default 30s) — the same design as
`deploy.sh`'s heartbeat — so a legitimately quiet command (a long test gate,
an install, a docker build) is never killed by output silence alone. The
coherence rule is checked at config load and warns when the interval is not
strictly below `KAINBAIN_CI_STALL_TIMEOUT_MS`, or when the keep-alive is
disabled while the watchdog is armed.

### 1.1 Telling a FALSE stall from a REAL wedge

The watchdog only fires for a CI/script stage when BOTH the child's output
and the keep-alive went quiet — so after October 2026, a `Stalled` CI entry
means the stage was genuinely dead, not merely slow. When in doubt, read the
stage report: a watchdog kill carries an explicit banner ("Killed by the
stall watchdog: no output for `<silenceMs>`ms …"), names the last gate
progress line (`⏳ still running: …`) when the gate emitted one, and labels
the exit code as synthetic. A report with no banner and a real exit code is a
genuine command failure — route it to the test/flake owners, not to the
watchdog.

Emergency operator levers (unchanged): `KAINBAIN_CI_STALL_TIMEOUT_MS=0`
disables the silence watchdog for CI/script stages;
`KAINBAIN_CI_HEARTBEAT_INTERVAL_MS=0` disables the keep-alive (warned); a
stage may set `heartbeatIntervalMs: 0` to opt itself out. None of these are
fixes for a noisy stage — they are containment for a live incident.

## 2. What auto-resume evidence looks like

Every auto-resume appends a `Resumed` timeline entry carrying what was
discovered: `markers` (e.g. `deployAttemptId`, `preMergeMainSha`,
`reviewBaseline.mergedAt`), `shas`, `lastResultAgeMs`, and the `verdict`
(`startup-recovery (…)`, `reconcile-resume (…)`, `auto-resumed`). History
holds the human-readable line ("Auto-resumed after server restart …" /
"Deploy reconcile: no fresh last-result.json — resuming from …").

Deploy freshness has two proofs: a result whose `deployAttemptId` matches the
task's marker (the engine exports it to `deploy.sh` as
`KAINBAIN_DEPLOY_ATTEMPT_ID`, which stamps it onto `last-result.json`), or a
result newer than stage entry by timestamp/build. A mismatched attempt id is
always treated as stale, even when its timestamp looks newer.

## 3. When `interrupted` is EXPECTED (do not "fix" it)

- `Auto-resume skipped (no-rehydration-markers)` — pre-WP6 task file or
  unknown attempt: resume it manually from the UI once you know the stage state.
- `Deploy reconcile parked: …` — same as no-markers above, for deploy-like
  stages. Recorded at most once per task (the reconcile scan runs every tick),
  so a single entry is expected, not a growing list.
- `Auto-resume skipped (human-stage / waiting-human / stage-paused / blocked)`
  — needs the operator by design.
- `Auto-resume deferred: engine circuit breaker tripped` — clears itself
  when the breaker closes; see the [circuit breaker runbook](circuit-breaker-runbook.md).

## 4. Trip-gate interplay

Resume never fights containment: while tripped, startup recovery flips
nothing (reasons recorded), the watchdog skips its scan, and dispatch stays
gated. After the breaker closes, the next scheduler tick picks up parked
work under normal Rule 0 priority — no manual kick needed.
