# ADR 0010 — D8 global budget authority (Phase 3)

**Status:** Accepted (MigrationPlan WP-3.3, 2026-10-26)
**Date:** 2026-10-26
**Task:** MigrationPlan WP-3.3 (R13 prevention, second half of D8)
**Context inputs:** MigrationPlan rev 2 (D8 row, R13), RiskAssessment R13,
ADR 0008 (D1 lease fencing, D3 backend-central routing).

## Context

Parallel Runners multiply the spend rate, and the design's own recovery
mechanisms become cost amplifiers: re-dispatch restarts stages, failback
loops re-burn a stage across several Runners, and an uncapped fleet lets
one project (or one long task) hold every Runner while the rest of the
queue waits. There is no token/cost meter in the backend (usage telemetry
is per-runner records, not an aggregated spend ledger), so a spend-denominated
cap cannot be enforced — any number written would be decoration. What the
backend CAN see exactly is its own lease ledger: every in-flight Runner
execution holds exactly one ClaimStore lease. Concurrency caps on that
ledger are therefore enforceable today, with zero new metering.

## Decision

- **D8 — Budget authority: backend-enforced concurrency caps at dispatch.**
  Two caps, both enforced in `POST /runners/dispatch` against live
  ClaimStore leases (lazy expiry, so a dead Runner's hold stops counting
  the moment its TTL lapses):
  per-project `KAINBAIN_RUNNER_MAX_CONCURRENT_PER_PROJECT` and fleet-wide
  `KAINBAIN_RUNNER_MAX_CONCURRENT_FLEET`. 0 (the default) disables that
  cap, preserving current single-Runner behaviour byte-for-byte; any
  positive value is a hard ceiling. A project at its cap is skipped for
  that poll (loud `PROJECT_BUSY` miss, other projects still dispatch); a
  fleet at its cap answers `429 PROJECT_CONCURRENCY_EXHAUSTED` / fleet
  equivalent so the daemon backs off instead of crashing the loop.
  Rejected: spend/token-denominated caps (no aggregated meter exists —
  writing caps against numbers nobody measures is decoration, and a fake
  meter is worse than an honest concurrency cap); per-Runner in-flight
  caps (the dispatch loop already holds at most one lease per Runner —
  capping it again adds configuration with no effect); scheduler-side
  caps on the embedded path (the embedded queue is single-lane by
  construction; capping it changes prod behaviour for no parallel-burn
  benefit).
- **Token/cost budgets stay open** until a real spend meter lands
  (aggregated usage ledger per task/project/fleet). This ADR deliberately
  does not invent one: D8's "who stops parallel burn" is answered — the
  backend, at dispatch — while "how much may it cost" waits for measured
  numbers.
- **Retry bounds ride the existing ladder.** Runner-driven model failures
  route through the same `routeStageError` auto-iteration budgets as the
  embedded path (stage `maxRetries` → project `maxAutoIterations` →
  global), so no second bound is invented for failures. The genuinely
  unbounded Runner cycle is interrupt-requeue (interrupts skip the
  auto-iteration budget by design): its bound belongs with the
  partition/zombie work in WP-4.1, not here.
- **Starvation-free ordering via wait boost.** The dispatch scan keeps
  scheduler order (closest-to-completion, then oldest) but tasks waiting
  past `KAINBAIN_DISPATCH_MAX_WAIT_MS` (default 30 min, 0 disables) jump
  ahead oldest-first. Same-queue-priority semantics hold for every task
  under the cap; the boost only bounds the worst-case wait provably
  instead of by assertion.

## Consequences

- Operators cap parallel burn with two environment variables; the
  dispatch miss histogram shows exactly which cap bit and how often.
- The daemon treats 429 as backpressure (sleep + re-poll), never a crash.
- Token budgets remain visibly open: no config key pretends to cap spend.
