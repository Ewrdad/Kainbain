# WP2 stage review — production signals (PR review, 2026-11-17)

Scope: `git diff main...HEAD` for WP2 (new `api/watch/productionSignals.js`,
`computeObservabilityMetrics` extension, `record*` hooks in `api/flow/runnerRoutes.js`,
`api/flow/scheduler/scheduleTick.js`, `api/skills/skillInjection.js`,
`runner/daemon.js`, `runner/project.js`, `api/index.js`, `api/watch/index.js`;
tests `api/watch/productionSignals.test.js`, `api/watch/productionSignals.burst.test.js`,
plus cases in `api/flow/runnerRoutes.test.js`, `runner/daemon.test.js`;
dictionary `docs/production-signals-dictionary.md`).
Method: read every changed production file and both new test files, re-ran the
WP2 tests in isolation, checked live-tree contamination. Assumed broken until proven otherwise.

## Goal achievement — yes
All six FRAMEWORKS §3.8 minimums from the brief exist on the extended exposition
(`productionSignals` + `queueDepthByProject` + `ledgerStaleRejected`, no second system):
dispatch-latency p50/p95/p99, per-project claimed/completed + wait summaries,
exclusion-aware claim success rate, `PROJECT_SCOPE`/`STALE_EPOCH`/`CLAIM_CONFLICT`
fencing breakdown, worktree evictions (Runner→backend heartbeat bridge, monotone
per-Runner merge), skill size-cap omissions. Window slicing (`{ windowMs, now }`)
is implemented in `summarizeProductionSignals`/`computeObservabilityMetrics` and
exercised by the burst test (`windowMs: 3600_000`). Claim-rate exclusions
(`RUNNER_PAUSED`, `CIRCUIT_TRIPPED`, `BELOW_MINIMUM_VERSION`,
`FLEET_CONCURRENCY_EXHAUSTED`) match the plan's decision 3 and are documented so a
paused fleet never reads as unhealthy. Hooks cover both dispatch paths (fleet poll
in `runnerRoutes.js`, embedded tick in `scheduleTick.js`) plus progress/finish/
heartbeat stale-epoch sites, the 429 fleet-cap and `PROJECT_BUSY` skip paths.

## Plan compliance — yes
Every IMPLEMENTATION_PLAN phase traces: counter home on `store.productionSignals`
(+ storeless process totals merged at exposition, the only shape that works for
`runner/project.js` which has no store handle); latency/throughput/success-rate/
fencing/§3.8-remainder instrumentation; unit tests per signal; two-project
(`proj-alpha`/`proj-beta`) synthetic burst with busy-must-not-starve, forced
conflict, and full-observability sweep; contamination guard; one-page dictionary
with WP5 handoff (frozen names, window example, provisional thresholds, zero
carried gaps). The `claim()` STALE branch in the direct-claim catch is defensive
dead code (`ClaimStore.claim` only throws `CLAIM_CONFLICT`/arg errors), so the
dictionary's `attempts = successes + conflicts + errors` invariant holds at claim
sites; stale-epoch fencing is counted at the progress/finish/heartbeat sites where
no attempt is recorded — correct separation, not a bug.

## Code standards / modifiability / practices / debt — yes, no new debt
Spot-checked against `docs/KB Code Standards.md`: descriptive names and why-comments
at every hook, `MARK:` + `@example` on all new exports, plain functions with state
in one named place (`store.productionSignals`), implementation + tests co-located in
`api/watch/`, zero-import module so the runner→api bridge is cycle-free. Every
`record*` funnels through fail-safe `mutateSignals` (frozen/locked stores and
malformed args drop the sample, never break dispatch) — additive-only, no behaviour
change. Pure `percentile`/`claimSuccessRate` pinned by unit tests; ring buffers
capped at 2048 documented. Two small follow-ups are explicitly documented, not
hidden debt: (1) `taskStore.getObservabilityMetrics(filterProjectId)` does not
forward `opts`, so the served HTTP `/status` path always reports full history —
window slicing works via direct `computeObservabilityMetrics` calls (as the burst
test proves); WP5 should add the one-line forwarding + query param. (2)
`runner/version.json` not bumped, so existing fleets keep the old daemon (safe:
old runner → new backend 200s with zero evictions) until a release bump.

## Docs — yes
`docs/production-signals-dictionary.md` is the required one-pager (name, labels,
what-proves-what, healthy-vs-investigate, failure modes, WP5 handoff). No UI, so no
screenshots apply. `UPGRADE_SAFETY.md` and the code-standards review are accurate as
re-verified above.

## Proof it works (observed this session, isolated runners)
- `vitest run watch/productionSignals.burst.test.js` → 1 passed (every §3.8 signal
  asserted present with `projectId` labels; fencing 1/1/1; `projectBusy` = busySkips;
  evictions 1; omissions ≥1; `ledgerStaleRejected` 1; queue-depth sum invariant).
- `vitest run` broad api slice → 520 passed incl. `watch/productionSignals.test.js`
  30/30; `watch/observabilityMetrics.test.js` 14/14.
- `flow/runnerRoutes.test.js -t "worktree evictions"` (native api workdir) → 1 passed
  (heartbeat bridge: +2, repeat no-double-count, restart-safe, missing-signals 200).
  Root-workdir invocation of the full `runnerRoutes.test.js` file fails 1 test on the
  pre-existing accessibility-feedback isolation guard by design (unrelated to WP2;
  same as the code-standards review notes).
- Prior CI: fast gate PASSED every branch (api/frontend/runner unit, lint, build,
  security, proofs); canary 139 passed / 1 failed on `footer-overlay.spec.js`
  (`page.goto: Target page, context or browser has been closed`, resource exhaustion
  after a 15 min run) — a UI-infra flake with no code path through WP2's
  backend/runner instrumentation; recommend canary re-run, not a WP2 defect.
- Contamination: burst-test live snapshot guard passed; `~/projects` and
  `~/.kainbain/projects.json` absent (null, unchanged), `~/.kainbain/engine/`
  mtime still Nov 13 (untouched by today's runs).

## Follow-ups (non-blocking, for WP5/next release)
1. Forward `{ windowMs, now }` through `taskStore.getObservabilityMetrics` and the
   `/status` observability route so the served endpoint slices sampled series.
2. Bump `runner/version.json` so self-update ships eviction reporting to existing fleets.
3. Re-run canary to clear the unrelated footer-overlay flake.
