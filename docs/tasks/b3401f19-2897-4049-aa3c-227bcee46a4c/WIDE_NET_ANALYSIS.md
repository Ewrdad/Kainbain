# WIDE_NET_ANALYSIS — Runner catalogue creation bug

Task: `b3401f19-2897-4049-aa3c-227bcee46a4c`  
Stage: investigation (docs-only)  
Inputs: bug report (`assets/image.png`), `SURVEY.md`, task spec, plus repo history and prior tickets (notably `9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7`).

## Scope

This report is investigatory only. It proposes possible *causes* of the runner catalogue defect; it does not propose fixes. The reported symptoms are:

- newly released harness models (e.g. `muse-ember`) never appear;
- dummy/test models appear in production catalogue views;
- broken harness models from other harnesses appear in places they should not (e.g. `gemma4`, `deepseek`);
- models that are available are still shown with the old “unavailable” flag instead of “how many runners serve it”;
- repeated backend/runner restarts and prior tickets did not durably correct it.

The intended flow is:

```
runner harness scan → discoveredModelsCache → heartbeat facts.models
  → runnerRegistry capabilities → fleet snapshot (/runners/models/catalogue)
  → frontend withFleetModels / fleetCountBadgeNode
```

## Evidence base

- `runner/harnessModelDiscovery.js` (discovery legs, cache slicing, validation)
- `runner/modelDiscovery.js` (`discoverClaudeModels`, `resolveAdvertisedModels`)
- `runner/daemon.js` (`refreshDiscoveredModels`, `factsFor`, keep-old behaviour)
- `api/flow/runnerRegistry.js` (`heartbeat`, persisted `_persist`, capabilities)
- `api/flow/dispatch/normalizeCapabilities.js`
- `api/flow/dispatch/fleetModelSnapshot.js` / `fleetModelCatalog.js`
- `api/flow/dispatch/runnerModelConfirmation.js`
- `frontend/src/services/fleetModelOptions/*`, `frontend/src/services/modelStatus.js`
- Prior ticket root cause: `docs/tasks/9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/ROOT_CAUSE.md`

---

## Candidate cause 1 — “keep previous slice” cache semantics create sticky stale/dummy ids and hide brand-new models

### Summary

Discovery on each leg is deliberately non-destructive: `runDiscoveryLeg` keeps the *previous* per-harness slice on failure, empty result, unparseable output, or grammar-invalid incoming ids. `refreshDiscoveredModels` then keeps the global `discoveredModelsCache` when the combined round is empty. Persisted backend `/api/flow/dispatch/fleetModelSnapshot.js` additionally keeps stale entries as *unavailable* rather than deleting them.

### Why this could be the bug

- Pros:
  - A transient scan failure can never erase a known-good menu, so operators reasonably see old models “forever” after a bad scan.
  - A scan that once returned a dummy id (mock/test model, stale manual pin) is retained unless a later round replaces it; the UI therefore still shows it in catalogue views.
  - New models (e.g. `muse-ember`) only appear when the *next successful* round both succeeds and validates them; empty/failed rounds leave the previous cache, so release cadence alone cannot clear the gap.
  - Backend side: `fleetModelSnapshot.update` only flips previously available-but-now-unserved entries to unavailable; it never deletes them, so old ids remain in `/runners/models/catalogue` as `Unavailable` instead of being replaced by live `runnerCount` entries. This matches the observed “old unavailable flag”.
- Cons / counter-evidence:
  - The design intentionally keeps history (survey round 1 answer notes users *want* dropped models to remain visible with `0 runners`), so “keep but mark unavailable” is partly desired behaviour, not purely a defect.
  - The cache is replaceable when a round succeeds (`combinedIds.length > 0`), so a healthy runner *should* eventually refresh it; sticky staleness requires a continuous scan failure or cache desync.
- References:
  - `runner/harnessModelDiscovery.js` — `runDiscoveryLeg` (keep previous on empty/invalid/failure), `runDiscoveryRound`
  - `runner/daemon.js` — `refreshDiscoveredModels` (`if (combinedIds.length > 0) { discoveredModelsCache = combinedIds; }`)
  - `api/flow/dispatch/fleetModelSnapshot.js` — `update()` marks non-live entries `available: false` instead of deleting
  - `docs/tasks/9d2b.../ROOT_CAUSE.md` — suspect (d) pin-wins + TTL cadence; suspect corridor “empty round keeps cache”

---

## Candidate cause 2 — Operator allowlist (`availableModels`) replaces the advertised list and is trusted as servable

### Summary

`effectiveRunnerModels` uses `operatorConfig.availableModels` instead of `runner-reported` models whenever set. `confirmRunnerModel` always marks operator-asserted ids as `unknown` (trusted) so they become available even when no discovery slice listed them. The backend persisted runner records (and local state file) also retain the allowlist independently of heartbeats.

### Why this could be the bug

- Pros:
  - A stale or hand-entered allowlist can expose ids that no harness currently serves (including dummy/test, `gemma4`, `deepseek`) because `effectiveRunnerModels` no longer consults the scanned menu.
  - Operator assertions are never contradicted by the runner’s own discovery, so they ride through fleet snapshot ingestion and appear in the catalogue as valid entries with non-zero runner counts.
  - Conversely, a stale allowlist can hide newly discovered models when it does not include them (or when discovery is disabled with `modelDiscoveryIntervalMs: 0`), so new releases are omitted.
  - Persisted `runners.json` / `lastSeenAt = null` after backend restart means old capability lists or allowlists can survive in a degraded form, and the fleet snapshot can continue carrying entries until heartbeats overwrite it.
- Cons / counter-evidence:
  - This behaviour is by design: it exists to let operators serve models an under-reporting runner cannot discover.
  - The allowlist is operator-provided, not runner-generated; if the reported dummy models are truly “test models”, some other mechanism must seed them.
- References:
  - `api/flow/dispatch/runnerMatches/effectiveRunnerModels.js`
  - `api/flow/dispatch/runnerModelConfirmation.js` — operator-asserted ids trust rule
  - `api/flow/runnerRegistry.js` — `normalizeOperatorConfig`, `availableModels`, persisted state (`_loadState`/`_persist`)
  - `docs/tasks/9d2b.../ROOT_CAUSE.md` — suspect (g) operator allowlist shadow

---

## Candidate cause 3 — Grammar/filtering mismatches across legs drop valid new models and leak invalid ones

### Summary

Different parts of the chain apply different validity rules to model ids:

- runner muse leg (`runner/modelDiscovery.js`) rejects any provider/model containing `:`;
- backend MSP parser (`api/agent/harnesses/muse/msp/...`) does not;
- shared grammar allows single `:` in ids;
- several backend transforms (`shared/modelKeys.js:withModelKey`) throw on `::`, which can discard a whole agy/vibe result set;
- frontend `fleetModelsForHarness` creates synthesized entries from snapshot ids without re-validating against the backend harness section.

### Why this could be the bug

- Pros:
  - A newly released model whose provider/model id contains `:` (common for cloud-tagged models) is dropped by the runner leg while other backend/probe paths might retain it, so the runner never pushes it to the catalogue. The reverse mismatch can make a model present in one view but absent elsewhere.
  - The muse-vs-rest asymmetry explains why “muse-ember” (or similar new muse row) and models like `gemma4`/`deepseek` drift between harness sections: IDs can survive in some transforms and be dropped in others, creating inconsistent catalogue subsets.
  - The strict section gate in `fleetModelsForHarness` drops ids when serving harnesses do not include the rendered harness, so a runner that advertises an id for the wrong harness causes silent disappearance from that section.
  - Dummy/test models can remain if they are grammatically valid but no longer real (keep-old behaviour compounds this), with no authority to reconcile against live harness menus.
- Cons / counter-evidence:
  - The filter bug alone does not explain stale *persistence* after the list should update, or the disappearance of the `runnerCount` display focus.
  - Backend MSP has no colon filter and therefore already handles `:` correctly, so a pure colon filter only explains runner leg omission, not leakages from backend models.
- References:
  - `runner/modelDiscovery.js` (`discoverClaudeModels` colon filter)
  - `shared/modelKeys.js` (parse rules, `withModelKey`, throws on `::`)
  - `frontend/src/services/fleetModelOptions/fleetModelsForHarness.js` (serving harness gate)
  - `docs/tasks/9d2b.../ROOT_CAUSE.md` — suspect (c), section 3 “other-leg audit”

---

## Candidate cause 4 — Catalogue representation still mixes two presentation contracts (old `unavailable` vs runner-count)

### Summary

The UI now treats fleet availability as runner count (`fleetCountBadgeNode`) while persisted snapshot entries retain and expose an explicit `available: false` + `unavailableReason`. Components consult `fleetSnapshotBadgeNode` first, so older/cached snapshot rows can badge “Unavailable” even when the count/runner data has changed.

### Why this could be the bug

- Pros:
  - Inconsistent rendering means a model can still display the old unavailable badge in a picker even though its snapshot/counts should now say `N runners`.
  - Because the snapshot marks non-live entries unavailable and never removes them, the “old unavailable flag” directly persists as `available: false`, while the count (`runnerCount`) is reset to 0, making a valid current model look unavailable if snapshot refresh is delayed or uses stale runner input.
  - This is consistent with the user’s stated requirement: replace “unavailable” with “how many runners have that harness/model available”.
- Cons / counter-evidence:
  - This is primarily a frontend presentation/reporting issue. It explains display, not necessarily why new models are missing from the underlying catalogue.
  - The count badge still renders `0 runners`, so counts are technically shown even when unavailable.
- References:
  - `frontend/src/services/modelStatus.js` (`fleetSnapshotBadge`, `fleetSnapshotBadgeNode`, `fleetCountBadgeNode`)
  - `frontend/src/hooks/useFleetModelCatalog/fleetCountsById.js`
  - `api/flow/dispatch/fleetModelSnapshot.js` (`available`, `unavailableReason`, `runnerCount`)
  - `SURVEY.md` q3 notes

---

## Cross-cutting observations

- Multiple historical tickets (see `docs/tasks/9d2b.../ROOT_CAUSE.md`) repeatedly fixed piecewise symptoms (colon filter, stale pins, unavailable badges) but preserved the architectural invariants above. Any one of them failing can reproduce the entire visible defect, which explains why small fixes did not durably resolve it.
- The backend and runner use different cadences/caches; structural reconciliation would need a clear invalidation/replacement contract across discovery slices, runner facts, registry capabilities, and persisted fleet snapshots.

## Bottom line

At least four interacting mechanisms are plausible root causes, and the defect likely involves more than one:

1. keep-old cache behaviour retaining stale/dummy models;
2. operator allowlists bypassing and contradicting discovery;
3. grammar/filter mismatches between discovery, heartbeat, and fleet ingestion;
4. mixed `available` vs runner-count presentation with persisted snapshot staleness.

These should be examined together in the structural fix.
