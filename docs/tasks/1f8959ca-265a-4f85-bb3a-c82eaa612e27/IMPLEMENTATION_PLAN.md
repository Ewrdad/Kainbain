# WP2 Implementation Plan — Production signals (AUDIT H-5)

## Goal

Add the missing production signals (dispatch-latency percentiles, per-project throughput/fairness, claim-fencing rejection breakdown, plus the FRAMEWORKS §3.8 minimum set: queue depth, worktree evictions, skill size-cap omissions) as additive instrumentation on the existing exposition, with zero behaviour change, so the WP5 SLO gate can pass or fail honestly and H-2 noisy-neighbour/fairness claims become measurable.

## Context and evidence

- Existing exposition seam: [observabilityMetrics.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/watch/observabilityMetrics.js) already returns `stats.queueDepth`, `schedulerStats`, `gitContention`, `executionQueue`. WP2 extends this object; no second metrics system.
- Dispatch seam (both paths share it): [scanClaimableTasks.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/flow/dispatch/scanClaimableTasks.js) → [sortCentralQueue.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/flow/scheduler/sortCentralQueue.js) → [centralQueuePolicy.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/flow/scheduler/centralQueuePolicy.js). Latency and wait-time timers hook here.
- Counter hooks already located: fleet cap `429 FLEET_CONCURRENCY_EXHAUSTED` and per-project `PROJECT_BUSY` skip in `api/flow/runnerRoutes.js` (~lines 1189–1248); per-candidate `misses[verdict.reason]` histogram in the same loop is the natural rejection-breakdown source; claim fence is `claimStore.claim()` / `describe()` (`CLAIM_CONFLICT`), live holds via `claimStore.liveHolds()` / `countLiveHolds()`.
- Counter-shape precedent: [freshSchedulerStats.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/flow/scheduler/freshSchedulerStats.js) (zeroed tick-outcome set on the store); existing tests [observabilityMetrics.test.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/watch/observabilityMetrics.test.js) and [centralQueueFairness.test.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/flow/scheduler/centralQueueFairness.test.js) (two-project focused/other fixture — reuse this shape for burst tests).
- Isolation contract (global constraint): all verification on ephemeral temp-dir fixtures (`proj-alpha`/`proj-beta` style) behind [testSetup.isolation.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/testSetup.isolation.js) + [isolatedTestRoots.js](/home/server/.kainbain/runner-work/kb-1f8959ca-265a-4f85-bb3a-c82eaa612e27/api/isolatedTestRoots.js); before/after contamination checks on `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*`. Live dummy projects are read-only evidence only.
- Referenced but not present in this checkout: `docs/tasks/5fdea223-…/AUDIT.md`, `DELIVERABLES.md`, FRAMEWORKS §3.8 text. The minimum set is taken from the task brief itself (§3.8: dispatch latency, queue depth, claim-fencing rejections, per-project throughput/fairness, worktree evictions, skill size-cap omissions); any AUDIT Q8 wording drift is flagged as an open question for the WP2 implementer to reconcile.
- Survey status: `SURVEY.md` in this folder contains Round 1 questions with **no recorded answers** (`"answers": {}`). This plan adopts each question's marked Recommended option as a working assumption (listed under Key decisions) so implementation is unblocked; the implementer confirms or revises them at kickoff.

## Key decisions (survey factored in)

1. **Exposition (survey q1): expose in the existing metrics output only, with SLO-ready names/labels.** Extend `computeObservabilityMetrics` (and the `misses`/scheduler-stats counters that feed it). No second metrics system, no parallel endpoint. Names and `projectId` labels are frozen in this work so WP5 dashboards/alerts can bind to them later.
2. **Fairness proof (survey q2): counts plus wait time.** Per-project `claimed`/`completed` counters plus per-project wait-time (entered-stage → claim) summary. Turn-taking/interleaving detail is out of scope unless WP5 asks for it.
3. **Claim success rate (survey q3): exclude intentional skips.** `claim success = non-conflict claims / attempts`, excluding operator pauses (`RUNNER_PAUSED`, circuit-tripped deferrals) and version refusals (below-minimum). Only real conflicts/rejections lower the rate.
4. **Metric dictionary (survey q4): on-call helper depth.** One page: metric name, labels, meaning, and what healthy/unhealthy looks like (threshold hints where known, marked provisional). Feeds the WP7 runbook; detailed exact-value reference lives in code/tests, not the page.
5. **Burst test scope (survey q5): cover all four bullets minimally.** Two fake projects + burst, busy-project-must-not-starve assertion, forced-conflict case, and every new signal asserted to move — kept to the smallest fixture that does all four.

## Approach — make the change easy, then make the change

Sequenced so big/research pieces land first and each step de-risks the next. No behaviour change at any step: counters observe, never gate.

### Phase 0 — Recon and scaffolding (make it easy)

- **Step 0.1 — Pin the contract.** Reconcile the brief's signal list against FRAMEWORKS §3.8 and AUDIT Q8 if those docs become available; record any delta in the plan file before coding. Confirm WP5's expected metric names/labels if a WP5 stub exists; otherwise freeze the names proposed below and note them as WP5's input.
- **Step 0.2 — Map every hook point.** Walk the three `runnerRoutes.js` paths (fleet-cap 429, `PROJECT_BUSY` skip, `misses[verdict.reason]` loop, `claim()` `CLAIM_CONFLICT` catch), the embedded-scheduler tick (`scheduleTick`/`runScheduledTick` outcome recording), and the claim-store fence (`claim`/`describe`/`liveHolds`), and list the exact insertion lines. This is the highest-risk discovery: if any path bypasses the shared seam, the signal will undercount.
- **Step 0.3 — Choose the counter home.** Recommended: extend `freshSchedulerStats()` shape + a small per-project rollup the store already owns, surfaced through `computeObservabilityMetrics`. Keeps one exposition path and matches existing test doubles. Alternative (rejected): separate metrics module — would create the second metrics system the brief forbids.

### Phase 1 — Instrumentation (make the change)

- **Step 1.1 — Dispatch latency.** Record scan-to-decision latency on both dispatch paths (embedded tick + fleet poll) with injectable clock (`now` override, following `resolveCentralQueuePolicy` precedent); expose p50/p95/p99. Histogram buckets or reservoir decided at implementation; percentiles must be queryable over a load window.
- **Step 1.2 — Per-project throughput + wait time.** `claimed_total{projectId}`, `completed_total{projectId}`, and wait-time summary per project (`enteredStageAt` → claim). Label every sample with `projectId`; aggregate queries slice by load window.
- **Step 1.3 — Claim success rate.** `attempts` / `non_conflict_claims`, explicitly excluding operator pauses and version refusals per decision 3. Document the exclusion in the dictionary so WP5 does not misread a paused fleet as unhealthy.
- **Step 1.4 — Scope/fencing rejection breakdown.** Counters for `PROJECT_SCOPE`, `STALE_EPOCH`, `CLAIM_CONFLICT` (plus existing `PROJECT_BUSY`, fleet-cap, and `misses` reasons plumbed through, not replaced). Hook the three sites from Step 0.2.
- **Step 1.5 — Remaining §3.8 minimums.** Queue depth (already exists — verify label/window queryability, do not duplicate), worktree evictions, skill size-cap omissions. If either has no hook point, record the gap explicitly rather than faking a signal.

### Phase 2 — Prove it (tests, synthetic burst)

- **Step 2.1 — Unit tests per signal.** One focused test per counter on synthetic fixtures: each signal moves under its scripted cause and stays still otherwise.
- **Step 2.2 — Synthetic burst integration test.** Two temp-dir projects (`proj-alpha`/`proj-beta`): burst of tasks → fairness counters diverge correctly (busy project does not starve the other); forced conflicting claim → conflict counter increments; every new signal observed during the burst. Model on `centralQueueFairness.test.js` fixtures.
- **Step 2.3 — Contamination checks.** Before/after assertions on `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*` (nothing written); suite runs under `testSetup.isolation.js` + `isolatedTestRoots.js` conventions.

### Phase 3 — Document (metric dictionary + WP5 handoff)

- **Step 3.1 — One-page metric dictionary.** Table: name, labels, definition, what proves what (which SLO/fairness claim each signal supports), healthy vs investigate hints. Feeds WP7 runbook.
- **Step 3.2 — WP5 handoff note.** Frozen metric names/labels, window-query examples, known provisional thresholds, and any §3.8 gap from Step 1.5.

## Test plan

| Level | What | Fixture | Pass criterion |
|---|---|---|---|
| Unit | Each new counter/histogram | Synthetic in-memory stores | Signal moves under scripted cause, static otherwise |
| Integration | Burst → fairness divergence | `proj-alpha`/`proj-beta` temp dirs | Per-project counters diverge correctly; no starvation |
| Integration | Forced conflict | Same fixtures | Conflict counter increments once per forced conflict |
| Integration | Burst observability sweep | Same burst run | Every §3.8 signal observable during the burst; AUDIT Q8 list for these empty |
| Guard | Contamination | Before/after fs checks | Zero writes outside temp roots |
| Regression | Existing suites | `npm run test:unit` | Green; no behaviour change (dispatch decisions identical) |

## Validation plan

1. `npm run test:unit` — full gate, must be green (primary gate per stage guidance).
2. New WP2 test files run in isolation — each signal test passes individually.
3. Synthetic burst run observed end-to-end — all new series present with `projectId` labels over the load window.
4. Contamination check output attached to the WP2 report (before/after hashes or listings).
5. Metric dictionary reviewed against the frozen names in code — names/labels match exactly.

## Risks and open questions

- **AUDIT/DELIVERABLES/FRAMEWORKS docs absent from this checkout** — signal list taken from the brief; implementer reconciles if the docs appear. If Q8 names extra signals, they enter via Step 0.1, not scope creep mid-phase.
- **Hook-point bypass risk** — any dispatch path that skips `sortCentralQueue`/`runnerMatches`/`claim()` silently undercounts. Step 0.2 exists to catch this; tests assert totals reconcile (attempts = claims + misses + conflicts + excluded pauses).
- **Latency clock in production vs tests** — use the existing `now`-override precedent so tests are deterministic without touching wall-clock code.
- **Cardinality** — `projectId` labels only; no task-id or message labels. If project count grows large, note window-retention limits for WP5.
- **No behaviour change** — instrumentation must not alter dispatch outcomes; the regression suite plus a dispatch-parity assertion (same candidates before/after) guards this.
- **Survey unanswered** — decisions above assume the Recommended options; if the operator answers differently at kickoff, update Key decisions 1–5 before Phase 1.
