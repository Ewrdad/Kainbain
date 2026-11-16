# WP2 Implementation Plan — Add the missing production signals (AUDIT H-5)

## Goal

Add the missing multi-project production signals as additive instrumentation on the existing exposition, with zero behaviour change: dispatch-latency percentiles (p50/p99, plus p95), per-project claimed/completed throughput and wait time (fairness), claim success rate (excluding intentional skips), scope/fencing rejection breakdown (`PROJECT_SCOPE`, `STALE_EPOCH`, `CLAIM_CONFLICT`), plus the remaining FRAMEWORKS §3.8 minimums (queue depth, worktree evictions, skill size-cap omissions). Success means the WP5 SLO gate can pass or fail honestly on these signals, H-2 noisy-neighbour/fairness claims become measurable, and every signal is observable during a scripted synthetic burst.

## Success criteria

- Every FRAMEWORKS §3.8 minimum signal exists and is observable during a scripted synthetic burst; the AUDIT Q8 unmeasured list for these signals is empty.
- Dispatch-latency p50/p95/p99, per-project throughput/fairness counters, claim success rate, and the `PROJECT_SCOPE` / `STALE_EPOCH` / `CLAIM_CONFLICT` breakdown are all labelled per-project where applicable and queryable over a load window from the extended exposition.
- No second metrics system is added; dispatch decisions are unchanged.
- Contamination check is clean: no live-project writes (`~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*` untouched).

## Context and evidence

- Existing exposition seam: [observabilityMetrics.js](api/watch/observabilityMetrics.js) returns `stats.queueDepth`, `schedulerStats`, `gitContention`, `executionQueue`. WP2 extends `computeObservabilityMetrics`, never a parallel endpoint. Test double shape: [observabilityMetrics.test.js](api/watch/observabilityMetrics.test.js).
- Dispatch seam shared by both paths: [scanClaimableTasks.js](api/flow/dispatch/scanClaimableTasks.js) → [sortCentralQueue.js](api/flow/scheduler/sortCentralQueue.js) → [centralQueuePolicy.js](api/flow/scheduler/centralQueuePolicy.js) (`resolveCentralQueuePolicy` already takes a `now` override — the precedent for deterministic latency/wait-time tests).
- Counter hooks: fleet-cap `429 FLEET_CONCURRENCY_EXHAUSTED` and per-project `PROJECT_BUSY` skip plus the per-candidate `misses[verdict.reason]` histogram in [runnerRoutes.js](api/flow/runnerRoutes.js) (~lines 1186–1249); claim fence `claim()` / `describe()` / `liveHolds()` (`CLAIM_CONFLICT`) in the claim store; ledger `staleRejected` counters; `/runners/monitor` live-hold source.
- Counter-shape precedent: [freshSchedulerStats.js](api/flow/scheduler/freshSchedulerStats.js) (zeroed tick-outcome set on the store, surfaced through `computeObservabilityMetrics`).
- Fairness fixture precedent: two-project focused/other shape in `centralQueueFairness.test.js` — reuse for the burst test.
- Isolation contract (global constraint): all verification on ephemeral temp-dir fixtures (`proj-alpha` / `proj-beta`) behind [testSetup.isolation.js](api/testSetup.isolation.js) + [isolatedTestRoots.js](api/isolatedTestRoots.js); before/after contamination checks on `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*`. Live dummy projects are read-only evidence only. Path note: AUDIT cites `/home/server2/...` but relative paths (`api/...`, `runner/...`, `frontend/...`) are identical in this checkout.
- Referenced but absent from this checkout: `docs/tasks/5fdea223-…/AUDIT.md`, `DELIVERABLES.md`, FRAMEWORKS §3.8 text. The minimum set is taken from the task brief (§3.8: dispatch latency, queue depth, claim-fencing rejections, per-project throughput/fairness, worktree evictions, skill size-cap omissions); any AUDIT Q8 wording drift is reconciled in Step 0.1.
- Survey status: [SURVEY.md](docs/tasks/1f8959ca-265a-4f85-bb3a-c82eaa612e27/SURVEY.md) Round 1 has questions with no recorded answers. This plan adopts each question's marked Recommended option as a working assumption (see Key decisions) so implementation is unblocked; the implementer confirms or revises them at kickoff.

## Key decisions (survey factored in)

1. **Exposition (survey q1): extend the existing metrics output only, with SLO-ready names/labels.** Extend `computeObservabilityMetrics` and the `misses` / `schedulerStats` counters that feed it. No second metrics system, no parallel endpoint. `projectId` label names are frozen in this work so WP5 dashboards/alerts can bind to them later.
2. **Fairness proof (survey q2): counts plus wait time.** Per-project `claimed` / `completed` counters plus per-project wait time (entered-stage → claim). Full turn-taking/interleaving detail is out of scope unless WP5 asks for it.
3. **Claim success rate (survey q3): exclude intentional skips.** `non-conflict claims / attempts`, excluding operator pauses (`RUNNER_PAUSED`, circuit-tripped deferrals) and version refusals (below-minimum). Only real conflicts/rejections lower the rate; the exclusion is documented in the metric dictionary so WP5 never misreads a paused fleet as unhealthy.
4. **Metric dictionary (survey q4): on-call-helper depth.** One page: metric name, labels, definition, what it proves, and healthy-vs-investigate hints (threshold hints marked provisional where exact SLOs belong to WP5). Feeds the WP7 runbook; exact-value reference lives in code/tests.
5. **Burst test scope (survey q5): cover all bullets minimally.** Two fake projects + burst, busy-project-must-not-starve assertion, forced-conflict case, every new signal asserted to move — in the smallest fixture that does all four.

## Approach — make the change easy, then make the change

Big/research pieces land first; each step de-risks the next. Counters observe, never gate: no step may alter dispatch outcomes.

### Phase 0 — Recon and scaffolding (make it easy)

- **Step 0.1 — Pin the contract.** Reconcile the brief's signal list against FRAMEWORKS §3.8 and AUDIT Q8 if those docs become available; record any delta in this plan file before coding. Confirm WP5's expected metric names/labels if a WP5 stub exists; otherwise freeze the names proposed in Phase 1 and note them as WP5's input.
- **Step 0.2 — Map every hook point.** Walk the three `runnerRoutes.js` sites (fleet-cap 429, `PROJECT_BUSY` skip, `misses[verdict.reason]` loop, `claim()` `CLAIM_CONFLICT` catch), the embedded-scheduler tick (`scheduleTick` / `runScheduledTick` outcome recording), and the claim-store fence (`claim` / `describe` / `liveHolds`), and list the exact insertion lines. This is the highest-risk discovery: any path that bypasses the shared seam silently undercounts. Also locate the worktree-eviction and skill size-cap omission hook points (or record them as gaps in Step 1.5).
- **Step 0.3 — Choose the counter home.** Recommended: extend `freshSchedulerStats()` shape plus a small per-project rollup the store already owns, surfaced through `computeObservabilityMetrics`. Keeps one exposition path and matches existing test doubles. Rejected alternative: a separate metrics module — that would be the second metrics system the brief forbids.

### Phase 1 — Instrumentation (make the change)

- **Step 1.1 — Dispatch latency.** Time scan-to-decision on both dispatch paths (embedded tick + fleet poll) with the injectable `now` clock precedent from `resolveCentralQueuePolicy`; expose p50/p95/p99. Histogram buckets vs reservoir is an implementation choice; percentiles must be queryable over a load window.
- **Step 1.2 — Per-project throughput + wait time.** `claimed_total{projectId}`, `completed_total{projectId}`, and wait-time summary per project (`enteredStageAt` → claim). Every sample carries `projectId`; aggregate queries slice by load window. Feeds the fairness view (burst → counters diverge correctly).
- **Step 1.3 — Claim success rate.** `attempts` vs `non_conflict_claims` with operator pauses and version refusals explicitly excluded (decision 3). Document the exclusion in the dictionary.
- **Step 1.4 — Scope/fencing rejection breakdown.** Counters for `PROJECT_SCOPE`, `STALE_EPOCH`, `CLAIM_CONFLICT` (plus existing `PROJECT_BUSY`, fleet-cap, and `misses` reasons plumbed through, not replaced). Hook the three sites mapped in Step 0.2.
- **Step 1.5 — Remaining §3.8 minimums.** Queue depth already exists — verify label/window queryability, do not duplicate. Worktree evictions and skill size-cap omissions: hook up if hook points exist; if either has no hook point, record the explicit gap rather than faking a signal.

### Phase 2 — Prove it (tests, synthetic burst)

- **Step 2.1 — Unit tests per signal.** One focused test per counter/histogram on synthetic in-memory stores: each signal moves under its scripted cause and stays still otherwise (latency percentiles shift under slow scans; throughput counters increment per project; conflict test increments only the conflict counter).
- **Step 2.2 — Synthetic burst integration test.** Two temp-dir projects (`proj-alpha` / `proj-beta`): burst of tasks → fairness counters diverge correctly and the busy project does not starve the other; forced conflicting claim → conflict counter increments; every §3.8 signal observable during the same burst run. Model fixtures on `centralQueueFairness.test.js`.
- **Step 2.3 — Contamination checks.** Before/after assertions on `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*` (nothing written); suite runs under `testSetup.isolation.js` + `isolatedTestRoots.js` conventions.

### Phase 3 — Document (metric dictionary + WP5 handoff)

- **Step 3.1 — One-page metric dictionary.** Table: name, labels, definition, what it proves (which SLO/fairness claim each signal supports), healthy vs investigate hints. Feeds the WP7 runbook.
- **Step 3.2 — WP5 handoff note.** Frozen metric names/labels, window-query examples, provisional thresholds, and any §3.8 gap from Step 1.5 carried explicitly (not silently dropped).

## Test plan

| Level | What | Fixture | Pass criterion |
|---|---|---|---|
| Unit | Each new counter/histogram | Synthetic in-memory stores | Signal moves under scripted cause, static otherwise |
| Integration | Burst → fairness divergence | `proj-alpha` / `proj-beta` temp dirs | Per-project counters diverge correctly; no starvation |
| Integration | Forced conflict | Same fixtures | Conflict counter increments once per forced conflict |
| Integration | Burst observability sweep | Same burst run | Every §3.8 signal observable; AUDIT Q8 list for these empty |
| Guard | Contamination | Before/after fs checks | Zero writes outside temp roots |
| Regression | Existing suites | `npm run test:unit` | Green; dispatch decisions identical (no behaviour change) |

## Validation plan

1. `npm run test:unit` — full gate, must be green (primary gate per stage guidance).
2. New WP2 test files pass in isolation — each signal test green on its own.
3. Synthetic burst run observed end to end — all new series present with `projectId` labels over the load window.
4. Contamination check output attached to the WP2 report (before/after hashes or listings).
5. Metric dictionary reviewed against frozen names in code — names/labels match exactly.

## Documentation plan

- One-page metric dictionary (name, labels, definition, what-proves-what, healthy/investigate hints) written as part of Phase 3; feeds WP7 runbook.
- WP5 handoff note: frozen names, window-query examples, provisional thresholds, explicit gaps.
- This plan file updated at Step 0.1 if AUDIT/FRAMEWORKS reconciliation changes the signal list.

## Risks and open questions

- **AUDIT/DELIVERABLES/FRAMEWORKS docs absent from this checkout** — signal list taken from the brief; implementer reconciles if the docs appear. If Q8 names extra signals, they enter via Step 0.1, not scope creep mid-phase.
- **Hook-point bypass risk** — any dispatch path skipping `sortCentralQueue` / `runnerMatches` / `claim()` silently undercounts. Step 0.2 exists for this; tests assert reconciliation (`attempts = claims + misses + conflicts + excluded pauses`).
- **Latency clock in production vs tests** — use the existing `now`-override precedent so tests stay deterministic without touching wall-clock code.
- **Cardinality** — `projectId` labels only; no task-id or message labels. Note window-retention limits for WP5 if project count grows.
- **No behaviour change** — instrumentation must not alter dispatch outcomes; regression suite plus a dispatch-parity assertion (same candidates before/after) guards this.
- **Survey unanswered** — decisions above assume the Recommended options; if the operator answers differently at kickoff, update Key decisions 1–5 before Phase 1.
