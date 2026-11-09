# ADR 0014 — Impromptu T0 channel: read-only runner jobs for retrospective chat

**Status:** Accepted (2026-11-06)
**Date:** 2026-11-06
**Task:** `712ce327-abc7-4518-89e1-961a50efb8e1` (fix retrospective chat on runners)
**Amends:** `docs/adr/0009-runner-protocol-sketch.md` (lands the deferred
impromptu read-only request), `docs/adr/0011-runner-steering.md` (steers stay
for live executions; impromptu is for idle runners)
**Resolves:** `docs/MuseCodeHackathon2026/Portability/GAPS.md` G9

## Context

`POST /retrospective/chat` still creates a harness session on the backend
(the pre-runner architecture), but agent work is runner-only now, so the chat
errors instead of replying. The MigrationPlan foresaw this: Phase 3 queues
"impromptu, almost-always-read-only requests (C2 … tier `T0` only … separately
authorised and logged)". ADR 0009 deferred impromptu read-only requests past
Phase 2, and GAPS G9 records that no standalone read-only request to an idle
Runner exists — steers (ADR 0011) only reach a Runner already holding a lease.
This ADR lands that deferred endpoint, scoped to the retrospective chat
("quiz tasks": ask about past tasks, their files/reports, cross-task trends).

## Decision

- **A second queue, not the task queue.** Impromptu jobs live in an in-memory
  backend store (`api/flow/impromptuStore.js`): no task record, no stage, no
  verdict, no git branch/worktree, no commit/push. Bounded (cap 50,
  `KAINBAIN_IMPROMPTU_QUEUE_MAX`) with a job TTL (10 min,
  `KAINBAIN_IMPROMPTU_JOB_TTL_MS`). Same durability story as `SteerStore`:
  a backend restart drops the queue and waiting turns fail loudly (502) —
  persistence is a later phase, explicitly out of scope.
- **Three runner-facing endpoints** (same `x-runner-credential` auth as the
  task routes, registered beside them):
  - `POST /runners/impromptu/poll` → `{ assigned: false, code:
    "NO_IMPROMPTU_WORK" }` or `{ assigned: true, job: { jobId, projectId,
    kind, prompt, harness, model, timeoutMs, turnId } }`. Oldest queued job
    the poller matches wins (deterministic). Freshness + paused +
    below-minimum gates mirror `/runners/dispatch`.
  - `POST /runners/impromptu/:jobId/progress` with `{ seq, delta }` →
    appended to the job tail and fanned out as the existing `CHAT_PROGRESS
    { turnId, tail }` WebSocket frames (throttled), so the chat working card
    keeps working unchanged. Out-of-order/duplicate seqs are ignored.
  - `POST /runners/impromptu/:jobId/complete` with `{ outcome, output?,
    error? }` → settles the waiting HTTP turn. Idempotent: a retried
    complete is a no-op.
- **Fencing: jobId + runnerId + claim TTL.** A poll assigns exactly one
  runner per job (claim); progress/complete must present the holding
  runner's credential. A stale claim (5 min, `KAINBAIN_IMPROMPTU_CLAIM_TTL_MS`,
  e.g. runner died mid-job) requeues the job for another idle runner; the
  waiter fails with 502 only when the job TTL lapses — a turn never hangs
  forever. Completing an unknown/superseded job 409s `STALE_IMPROMPTU`.
- **T0-only, read-only, three layers.** (a) Prompt-level: the compiled
  prompt states the turn is read-only — read files, query the API, never
  run tests/builds, never modify/create/delete anything. (b)
  Transport-level: the daemon runs the job with no claim, no worktree, no
  git; capability matching requires tier `T0`. (c) Harness-level where
  supported: the session meta carries `readOnly: true`. No harness
  enforces that flag today (surveyed 2026-11-06: `createSession`
  implementations destructure a fixed meta shape and ignore unknown keys;
  pi's strictly read-only `createDiagnosisSession` strips tools entirely,
  which would break the file/API lookups the chat needs) — so the flag is
  a forward seam, and prompt + transport carry the guarantee for now.
- **Runner selection: any capable runner, optional pin.** Matching reuses
  `runnerMatches` with `{ harness, model?, tier: "T0" }` plus project scope,
  and additionally enforces the operator `jobTypes.runsImpromptu` switch
  (previously a recorded preference with no channel to enforce it; the
  enforcement lives in the impromptu matcher, not `operatorConfigVerdict`,
  whose fail-open `impromptu` behaviour stays pinned for the live-steer
  concern). A runner holding a live task
  lease never gets impromptu work (enforced server-side; it only polls
  when idle anyway). The chat body may carry `runnerId` as the advanced
  override: the job is then delivered only to that runner, and a
  missing/stale pinned runner fails fast instead of queueing.
- **Task dispatch keeps priority.** The daemon polls impromptu only when a
  dispatch iteration yields no task assignment, and impromptu never
  preempts claimable task work. `KAINBAIN_RUNNER_IMPROMPTU=0` opts a
  runner out of the poll. Old runners that never poll simply never
  receive jobs (new backend + old runner degrades to the loud 503 below,
  never silent wrongness).
- **Error vocabulary** (chat route): `503 { code: "no_runner_available" }`
  when no capable runner exists at all; `503 { code: "runner_unavailable" }`
  for a missing/stale pinned override; `429 { code: "impromptu_queue_full" }`
  when the queue is at cap; `502 { code: "chat_prompt_failed" }` when the
  runner reports failure or the job TTL lapses; `504 { code:
  "chat_prompt_timeout" }` only under the existing opt-in ceiling
  (`KAINBAIN_CHAT_PROMPT_TIMEOUT_MS`). The old `501 unsupported_by_harness`
  path dies with the local-session code — a harness that cannot chat
  simply has no capable runner (503 with the miss reason). 400/404
  validation is unchanged, and the 200 shape is byte-compatible so the
  frontend barely changes (one new error mapping).

## Consequences

- Retrospective chat works again and answers from fresh, cited,
  read-only lookups the runner performs — including file reads and API
  queries the old backend session could not do from the runner host.
- Fleet operators gain one more reason to keep runners fresh: with zero
  runners the chat fails fast and loudly (503) instead of erroring
  obscurely. `GET /runners/monitor` gains an `impromptu` counter block
  (queued/claimed/served) so the channel is observable without task rows.
- Write-capable impromptu stays out of scope per the MigrationPlan.
- Mixed fleets are safe: impromptu-unaware runners never see the jobs.
