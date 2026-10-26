# ADR 0007 — Resume & stall recovery: heartbeats, watchdog, deploy/merge rehydration

**Status:** Accepted
**Date:** 2026-10-11
**Task:** `bece8476-b017-46ef-8e65-bdbe535d6080` (WP6)
**Audit trace:** AUDIT.md §3.7, §4 PFMEA F-20 (RPN 63) / F-12 (RPN 48) / F-09 (RPN 56), §8 Tier 1 gaps; HAZOP "PART OF incomplete execution".

## Context

Tier 1 (Resume task) was incomplete: crash recovery existed for automated
stages (`agent`, `ci`, `script`) under Rule 0, but (a) deploy/merge stages
parked permanently as `interrupted` when `last-result.json` was missing or
older than stage entry, (b) no in-flight stall detection existed — a hung
child that never exited and never printed sat until the wall-clock timeout,
and (c) auto-resume recorded nothing about what it discovered.

## Decision

### D1 — Heartbeat storage: in-memory per-task registry on the store
`store.stageHeartbeats: Map<taskId, {lastBeatAt, stageId, kind}>`, fed by one
`recordStageHeartbeat(store, taskId, {stageId, kind})` helper
(`api/flow/stageHeartbeat.js`). Agent stages heartbeat on streamed chunks and
stage entry; CI/script/deploy/merge command stages on every stdout/stderr
line and entry; the merge git half around each git await; detached deploys
via `deploy.log` mtime proxy. Rejected: a durable file per task (fs churn per
output line) and `processLog` mtime (log trimming makes it unreliable).
In-memory is correct — a heartbeat only matters while the process is alive;
after a crash the durable markers (D2) take over.

### D2 — Rehydration markers: durable task fields written BEFORE the risky step
Deploy entry already wrote `deployBuildAtEntry`; WP6 adds the frontmatter
round-trip plus `deployAttemptId` (deploy entry), `preMergeMainSha` +
`mergeAttemptId` (before `git merge`). Rejected: a sidecar JSON per attempt
(drifts from the task file reconciliation already reads) and post-success
writes (a mid-step crash loses them). Marker writes are best-effort
(`try/catch` at the emit sites, durable via `updateTask`); absence degrades
to today's explained park, never to a blind resume.

### D3 — Stall detection: watchdog scan inside the existing scheduler tick
`watchdogTick(store)` runs after the trip/resource gates and before the busy
gate in `scheduleTick` (a stalled task IS the busy owner, so it must run
before the busy early-return). Breach → history + process-log + `Stalled`
timeline entry, terminate the run, route through `handleTransientFailure`
with `{stall: true}` so the existing transient ladder (budget, backoff,
park-after-N) applies unchanged. Termination kills the registered child
(CI/script/deploy/merge command) and, for agent/review stages only, aborts
the stage session (command stages never touch the shared project session,
which an operator may be using interactively). Rejected: a new `stalled`
status (migrates every status switch) and a separate timer thread (the
scheduler already ticks). Only instrumented stages are watched — a missing
heartbeat record means "not instrumented", never "silent" (the wall clock
stays the backstop).

### D3a — Stall de-duplication: the watchdog handles the stall exactly once
Terminating the in-flight run makes it settle with a non-zero exit, which
would route the SAME failure a second time (a failback immediately after the
watchdog's transient retry). `watchdogTick` therefore stamps an in-memory,
single-use, TTL-bounded `stallHandled` marker (`markStallHandled` /
`consumeStallHandled`); both failure routers consume it and return a
`stalled`/suppressed result instead of failing back. The marker is stamped
AFTER the watchdog's own routing, so only the terminated run is suppressed,
and `executeStage`'s exit clears any unconsumed marker so a later genuine
failure is never hidden. Rejected: suppressing inside the run wrappers
(three call sites) and a task status field (would be durable state for an
ephemeral event).

### D4 — Silence thresholds per stage type (group `timeouts`, `0` disables)
Agent/review 10 min, CI/script 5 min, deploy 10 min, merge 15 min
(`KAINBAIN_*_STALL_TIMEOUT_MS`). Rejected: one global threshold (agent
thinking vs CI silence differ by an order of magnitude) and deriving from
the wall-clock timeout (the point of F-12/F-09 is catching hangs sooner).

### D5 — Rule 0 extension: deploy/merge only with rehydration markers
`isAutoResumableWithReason` returns `{resumable, reason}`; `isAutoResumable`
stays a boolean wrapper. Deploy/merge qualify only when
`hasRehydrationMarkers` holds; every exclusion (`waiting_human`, paused,
blocked, tripped, no-markers) names its reason and startup recovery records
it in history. Rejected: blanket deploy/merge auto-resume (a blind deploy
re-run is exactly what the old exclusion prevented).

### D6 — Reconcile decision table (no permanent `interrupted` for marked stages)
Fresh result → advance/park as before (plus rolled-back → failback, never
resume; a landed merge keeps `skipFailback` so merged work is never rewound);
missing/stale result + markers → resume under Rule 0 (deploy re-runs
flock-serialized idempotent `deploy.sh`; merge re-enters idempotently); no
markers → explained park with a recorded reason. `isDeployResultNewerThanEntry`
stays the sole freshness predicate, tightened with attempt-id matching (a
previous attempt's result can never advance this one). Because the reconcile
scan runs on every scheduler tick, the explained-park reason is recorded at
most once (in-process flag + persisted-history check) so a permanently parked
task cannot spam history or rewrite its task file.

### D7 — Tripped-engine exclusion with recorded reason
`autoResumeInterrupted` flips nothing while tripped and records the deferral
in history; the `findNextCandidateTask` trip gate stays the hard backstop.

### D8 — Auto-resume timeline reporting
Every resume appends a `Resumed` timeline entry carrying
`{markers, shas, lastResultAgeMs, verdict}` via the existing
`timelineMetadata` JSON — no markdown schema change.

### D9 — Attempt-id freshness is end-to-end, not just stored
`runCommandStage` exports the attempt id to a spawned deploy as
`KAINBAIN_DEPLOY_ATTEMPT_ID`; `deploy.sh` stamps it onto `last-result.json`
(and `state.json`) when present. A post-restart reconcile can then match the
result to THIS attempt by id, and a mismatched id is treated as stale even if
its timestamp looks newer. Absent the env (older script, custom command) the
predicate falls back to the timestamp/build check unchanged.

## Consequences

- `api/flow/taskScheduler.js`: `hasRehydrationMarkers`,
  `isAutoResumableWithReason`, `isRolledBackResult`, `collectResumeEvidence`,
  extended `reconcileInterruptedDeploys`, `watchdogTick` call in
  `scheduleTick`, evidence timeline in `autoResumeTask`.
- `api/flow/stageHeartbeat.js` (new): registry + `resolveStallThresholdMs` +
  `watchdogTick`.
- `api/flow/stageExecution.js`, `api/flow/commandStages.js`: heartbeat
  emission; `deployAttemptId` / `preMergeMainSha` / `mergeAttemptId` writes,
  consumed on stage pass so a later attempt at another stage cannot inherit
  them; `clearStallHandled` on stage exit.
- `api/flow/stageFailureRouting.js`: `consumeStallHandled` guard in both
  failure routers (watchdog de-duplication).
- `api/work/taskPersistence.js`: frontmatter round-trip for the four markers
  + `stallCount`. `api/config/schema.js` + `.env.example`: four stall rows.
- Tests: `stageHeartbeat.test.js`, `deployMarkers.test.js`,
  `startupRecovery.test.js`, `taskScheduler.test.js` additions,
  `stageFailureRouting.test.js` (stall de-duplication), new
  `stallRecovery.integration.test.js` (incl. an end-to-end in-flight stall
  that proves exactly one recovery and no failback).
- Interplay: respects WP1 tripped state; re-enters `executeStage` so WP5
  worktree resolution applies unchanged; emits the stall/resume events WP7
  will later ship.
