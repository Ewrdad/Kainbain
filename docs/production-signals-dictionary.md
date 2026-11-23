# WP2 production signals — metric dictionary (feeds WP7 runbook)

Source: `GET` observability exposition (`computeObservabilityMetrics` in
`api/watch/observabilityMetrics.js`), field `productionSignals` plus the
sibling fields `queueDepthByProject` and `ledgerStaleRejected`. One system
only: no second metrics endpoint was added. Counters are cumulative since
`productionSignals.since` (rates over a window are deltas of successive
snapshots); sampled series honour `{ windowMs, now }`.

| Metric | Labels | What it proves |
|---|---|---|
| `productionSignals.dispatchLatency.p50Ms / p95Ms / p99Ms` | none (`count` = samples in window) | Scan-to-decision cost on both dispatch paths. A climbing p99 with a flat p50 means a slow project scan or lock contention, not a fleet problem. |
| `productionSignals.perProject.<pid>.claimed` | `projectId` | Per-project dispatch throughput. Burst test: counters diverge with the burst and the quiet project still advances (no starvation). |
| `productionSignals.perProject.<pid>.completed` | `projectId` | Per-project completions, state-derived (embedded + fleet + manual). Fairness claim H-2 is measurable only with claimed beside completed. |
| `productionSignals.perProject.<pid>.wait.{count,avgMs,p50Ms,p95Ms}` | `projectId` | Entered-stage → claim wait. Proves/denies noisy-neighbour: one project's p95 climbing while others stay flat is the fingerprint. |
| `productionSignals.claim.rate` | none | Non-conflict claims / decided attempts. Excludes `excluded` below, so only real conflicts and errors lower it. |
| `productionSignals.claim.excluded.{RUNNER_PAUSED,CIRCUIT_TRIPPED,BELOW_MINIMUM_VERSION,FLEET_CONCURRENCY_EXHAUSTED}` | reason | Intentional skips. A paused fleet reads here, never as an unhealthy rate. |
| `productionSignals.fencing.{PROJECT_SCOPE,STALE_EPOCH,CLAIM_CONFLICT}` | reason | Claim-fencing rejection breakdown. `PROJECT_SCOPE` = operator scope refusals; `STALE_EPOCH` = route-observed stale-epoch rejections; `CLAIM_CONFLICT` = lost claim races (kept equal to `claim.conflicts` by construction). |
| `productionSignals.missTotals.<reason>` | reason | Cumulative per-candidate dispatch misses (the per-poll `misses` object, aggregated). |
| `productionSignals.projectBusy.<pid>` | `projectId` | Per-project `PROJECT_BUSY` (per-project cap) skips. Fairness evidence: busy skips for A while B's `claimed` still climbs. |
| `productionSignals.fleetCapExhausted` | none | `429 FLEET_CONCURRENCY_EXHAUSTED` backoffs. Also counted in `claim.excluded`. |
| `productionSignals.fleetCompletedExecutions` | none | Fleet-finished executions (event-counted). Reconciles against state-derived `perProject.<pid>.completed`. |
| `productionSignals.worktreeEvictions` | none (fleet total) | Worktree LRU evictions. Evictions happen in the Runner process, so each Runner reports its cumulative total as `facts.signals.worktreeEvictions` on every heartbeat and the backend merges per-Runner deltas monotonically (`recordRunnerSignalReport` in `api/watch/productionSignals.js`): a repeated report never double-counts, and a lower report (Runner restart reset the counter) counts the whole new value as delta, so the fleet total never goes backwards. Same-process recordings (embedded/tests) merge from the process total at exposition. Climbing with dispatch latency points at workdir churn. |
| `productionSignals.skillSizeCapOmissions` | none | Skills omitted by the injection size cap. Prompts are built in the backend process (`api/skills/skillInjection.js`), so this is a same-process total merged at exposition. Climbing with agent failures points at prompt budget, not the model. |
| `queueDepthByProject.<pid>` | `projectId` | Waiting (claimable, unblocked, unclaimed) tasks per project; sums to `stats.queueDepth`. |
| `ledgerStaleRejected` | none | Cumulative stale-epoch rejections from the execution ledger (all paths). Tracks `fencing.STALE_EPOCH` (route-observed subset). |

Healthy vs investigate (thresholds provisional — WP5 owns the SLO gate):
healthy = `claim.rate` ≥ 99 with `excluded` explaining the remainder;
`fencing.CLAIM_CONFLICT` occasional and self-limiting; wait p95 flat across
projects. Investigate = rate < 99 with no matching `excluded` rise;
`STALE_EPOCH` climbing (zombie/partition or TTL misconfiguration);
one project's wait p95 diverging (noisy neighbour); `PROJECT_SCOPE`
climbing after a settings change (scope too narrow, work stranded).

## Failure modes and limits (how this can fail, and how it fails safe)

- Recording never gates dispatch: every `record*` in
  `api/watch/productionSignals.js` swallows its own faults (frozen store,
  malformed args), so a broken counter drops a sample instead of breaking a
  dispatch. A dropped sample reads as "no signal", never as a wrong signal.
- Sampled series (dispatch latency, per-project wait) are ring buffers capped
  at 2048 samples each; under extreme load old samples age out first.
  Counters are unbounded and cumulative since `productionSignals.since`.
- Window queries (`{ windowMs, now }`) slice only the sampled series; rates
  over a window are deltas of successive snapshots (Prometheus-style), so a
  backend restart resets counters to zero and window rates must be read as
  deltas, not absolutes, across a restart.
- Cardinality is `projectId` (and fixed reason strings) only — never task or
  message ids — so label count tracks project count, not workload.
- Claim success rate excludes `claim.excluded.*` by design: a paused fleet
  reads there, never as an unhealthy rate. If `excluded` climbs without a
  matching operator action, that itself is the investigate signal.
- Reconciliation invariant: `claim.attempts` equals `claim.successes` +
  `claim.conflicts` + `claim.errors` exactly (attempts are recorded only at
  the `claim()` call; intentional skips land in `claim.excluded.*` and never
  enter the denominator); `fencing.CLAIM_CONFLICT` always equals
  `claim.conflicts` (set together by construction).

## WP5 handoff

Frozen names/labels: exactly the field paths above; `projectId` values are
project ids (never task or message ids). Window example:
`computeObservabilityMetrics(store, undefined, { windowMs: 15*60*1000, now: Date.now() })`.
Provisional SLO inputs: dispatch-latency p99 < 5s; `claim.rate` ≥ 99%;
per-project wait p95 ratio (max/min across active projects) < 3 during a
burst. Explicit gaps carried, not dropped: none — every FRAMEWORKS §3.8
minimum in the brief (dispatch latency, queue depth, claim-fencing
rejections, per-project throughput/fairness, worktree evictions, skill
size-cap omissions) is recorded and was observed in the synthetic burst run
(`api/watch/productionSignals.burst.test.js`).
