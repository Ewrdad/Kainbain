# WP-C Review — canonical-id catalogue contract with verified counts

**Reviewer:** PR-review stage · **Date:** 2026-11-13 · **Branch:** `kb/94ee5786-309a-4063-85a2-a4062e836c47` (diff vs `main`)
**Scope reviewed:** `catalogIngest.js`, `fleetModelSnapshot.js`, `runnerModelConfirmation.js`, `runnerRoutes.js` (+ tests), ADR 0016 amendment, `ModelKeys.md`, api-reference/agentGuide updates.

## Verdict: suitable to integrate

Every clause of the task was found implemented and proven by execution (not by reading alone):

1. **Canonical-only ingest** — `ingestAdvertisedId` accepts only `harness`/`harnessReasoning`; bare/provider return the exact `not harness-qualified` reason; non-empty reporter list lacking `parsed.harness` returns the exact `harness not served by runner <id>` reason; empty list stays fail-open.
2. **Per-entry attribution** — `entry.harnesses = [parsed.harness]`; `ctx.harnesses` used only for the not-served check. Snapshot union also `[slot.harness]`; provenance `harnesses` likewise.
3. **Verified counts** — `update()` maps `confirmed → runnerIds + provenance`, `stale → claimedBy`, else `declaredBy`. `confirmed` requires provenance hit + `discoveryLegFresh` (ok + ≤ `DISCOVERY_LEG_MAX_AGE_MS`); stale leg with hit → `unknown`. `stale` semantics byte-identical, dispatch (branches only on `stale`) unaffected.
4. **Derived availability** — `available`/`verified`/`unavailableReason` derived in `read()` via `deriveUnavailableReason` (declared → stale → last-served → never-served) with `formatAge` s/m/h/d. Persisted entry keys contain no derived fields (verified against a temp-file round-trip).
5. **Lifecycle** — 0-runner entries kept indefinitely with carried `lastServed*`; `FLEET_SNAPSHOT_MAX_MODELS` gone (zero hits outside the plan doc); quarantine cap kept; `remove`/`removeQuarantined` + both admin DELETEs (204 empty / 404, quarantine route first).
6. **Fleet harness counts** — `summarizeFleetHarnesses` from claim-eligible runners; wired into both GET branches (snapshot + `buildFleetModelCatalog` fallback).
7. **Migration** — `normalizeSnapshotState` quarantines persisted bare/provider (union of claimant lists, timestamps kept), rewrites `harnesses`, drops stored derived fields; idempotent.

## Evidence (observed, not inferred)

- Targeted suites: **118 passed** (`catalogIngest`, `runnerModelConfirmation`, `fleetModelSnapshot`, `runnerRoutes`).
- WP-G-adjacent suites untouched and green: **40 passed** (`fleetModelCatalog`, `runnerMatches`, `fleetSectionMerge`).
- `npm run lint --prefix api`: **0 errors** (500 pre-existing-style warnings only).
- `npm run docs:check`: file-path check pass; `jsdoc-@example: PASS`.
- Direct probes: `['pi','muse']` runner advertising `ollama-cloud-direct::gemma4:31b-cloud` → quarantined, 0 models; pinned runner with `discoveryStatus:{}` advertising `muse::meta::x` → `runnerCount 0`, `declaredBy ['r1']`, `available false`, `declared by 1 runner, not verified by discovery`; provenance-hit + fresh ok leg → `runnerCount 1`, `harnesses ['muse']`, `verified/available true`.
- Out-of-scope files (`fleetModelCatalog`, `fleetSectionMerge`, `runnerMatches/*`, `harnessDiscovery`, `runnerRegistry`) have **zero diff** — WP-G/dispatch boundary respected.
- Docs: ADR 0016 WP-C amendment, `ModelKeys.md` canonical-only rule, api-reference + agentGuide endpoint rows (both DELETEs) all present.

## Minor notes (non-blocking)

- `runnerModelConfirmation` keeps operator-override ids at `unknown` (→ `declaredBy`), the intended q3/q4 behavior change; dispatch refusal unchanged. Flagged in the plan for WP-G/WP-D awareness.
- `DISCOVERY_LEG_MAX_AGE_MS` (1 day) is the local WP-C fallback until WP-B lands its predicate; replacement is isolated to the owned predicate/constant.
- N6 badge re-pointing stays WP-D/frontend work as scoped; WP-C correctly limits itself to making the catalogue the authoritative source.

## Files changed (by implementation stage, reviewed here)

- `api/flow/dispatch/catalogIngest.js` (+ test)
- `api/flow/dispatch/fleetModelSnapshot.js` (+ test)
- `api/flow/dispatch/runnerModelConfirmation.js` (+ test)
- `api/flow/runnerRoutes.js` (+ test)
- `api/routes/compute.fleet.test.js`, `docs/adr/0016-central-model-catalogue.md`, `docs/EngineDetails/ModelKeys.md`, `site-docs/api-reference.md`, `api/agentGuide.js`
