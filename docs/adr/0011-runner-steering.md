# ADR 0011 — D5 session ownership: steering, acks, owner-offline (Phase 3)

**Status:** Accepted (MigrationPlan WP-3.4, 2026-10-26)
**Date:** 2026-10-26
**Task:** MigrationPlan WP-3.4 (D5 decision + first slice)
**Context inputs:** MigrationPlan rev 2 (D5, C2 rows), C2 impromptu-T0 note,
ADR 0009 (protocol steps 1–6 have no steering step), HarnessSession
optional `steer`/`followUp` surface (`api/agent/harnessContract.js`).

## Context

Once a Runner owns an execution, the operator needs to reach the running
session (nudge a stuck run, answer a question, stop a wrong direction)
without killing the lease. The protocol has no delivery step for that:
progress/logs/complete all flow Runner→backend. Steering is also where
the C2 impromptu-T0 channel lands — a follow-up prompt is an impromptu,
almost-always-read-only request, tier T0 by construction (it steers
within the running stage; it never opens a new stage or grant).

## Decision

- **D5 — Steering: backend-held pending queue, Runner pull, explicit ack.**
  `POST /tasks/:id/steer` (operator surface, same local-trust as
  approve/deny) queues `{ steerId, executionId, text }` per live lease.
  No live lease for that execution → `409 NO_LIVE_EXECUTION` (completed,
  released, or expired) — nothing is queued that no Runner can pull.
  A stale-but-lease-holding Runner still gets the steer queued: the
  lease (not the heartbeat) is the delivery contract, and the Runner
  pulls on its next heartbeat while the TTL holds. The Runner pulls
  pending steers on the heartbeat response, delivers each to the live
  session (`session.steer`, falling back to `session.followUp`), and
  acks each exactly once (`POST /tasks/:id/steer-ack`). A harness with
  neither method NACKs `UNSUPPORTED_HARNESS` — loud, never silently
  dropped. Receipts (`ok`, `detail`, timestamp) are readable back via
  `GET /tasks/:id/steers`, so the operator (and the multi-Runner UI)
  can see delivered vs pending vs unsupported.
  Rejected: backend→Runner push (no inbound channel to loopback daemons
  behind NAT; polling the existing heartbeat keeps one channel);
  queueing steers with no live lease (a steer nobody can pull is a lie —
  409 now beats a phantom queue); silent best-effort delivery (an
  unacked steer must stay visible as pending, and an unsupported
  harness must say so).
- **C2 impromptu T0 rides steer.** No second endpoint: a follow-up
  prompt IS the impromptu request, delivered only to the live session
  of a running execution. No session, no delivery (409, same rule).
- **Multi-Runner UI reads the monitor.** `GET /runners/monitor` gains
  `liveAssignments` (`runnerId`, `projectId`, `taskId`, `epoch` per live
  lease) so Settings › Harness › Runners shows who runs what; no new
  polling channel.

## Consequences

- Steering latency follows the heartbeat cadence (15 s default) —
  documented, not hidden. Faster steering waits for a Runner-side
  long-poll, explicitly out of scope here.
- Steer text is capped (4000 chars); over-long input is 400, never
  truncated silently.
