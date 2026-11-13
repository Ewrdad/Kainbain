# REPLICATION_GUIDE — Runner catalogue bug

Task: `b3401f19-2897-4049-aa3c-227bcee46a4c`  
Companion to `WIDE_NET_ANALYSIS.md`. Each section is a self-contained quick guide to reproduce one visible symptom. All steps run locally with mocks/fakes — no prod touch, no real agent invocation. Where a step would need prod or a real external CLI, it is flagged **DO NOT RUN WITHOUT EXPLICIT USER PERMISSION** and a safe alternative is given.

> Prereqs: repo checkout, `npm install`. Tests use the existing `runner/daemon.js`, `runner/harnessModelDiscovery.js`, `api/flow/dispatch/fleetModelSnapshot.js` seams.

---

## 1) New model (e.g. `muse-ember`) never appears — stale cache hides it

### What you should see
A new harness model released today does not appear in the catalogue picker, even after backend/runner restarts.

### Likely involved causes
WIDE_NET cause 1 (keep-old cache) + cause 2 (allowlist) + cause 3 (grammar filter).

### Minimal local repro (no prod, no real CLI)

1. Seed a runner discovery cache with an old list:
   ```js
   // in a test file or node repl with the runner harnessModelDiscovery harness
   import { discoveryCache, clearDiscoveryCache, runDiscoveryLeg } from "./runner/harnessModelDiscovery.js";
   clearDiscoveryCache();
   discoveryCache["muse"] = { ids: ["muse::meta::old-model"], atMs: Date.now(), error: null };
   discoveryCache["pi"]    = { ids: ["pi::mistral::old-model"], atMs: Date.now(), error: null };
   ```

2. Make the next discovery round fail (timeout / missing binary / empty catalogue). Use the harness fake:
   ```js
   await runDiscoveryLeg("muse", {
     discoverFn: async () => { throw Object.assign(new Error("spawn muse ENOENT"), { code: "ENOENT" }); }
   });
   // discoveryCache.muse should still be ["muse::meta::old-model"]
   ```

3. Simulate the newly released model that *should* have been discovered:
   ```js
   const newModelId = "muse::meta::muse-ember"; // or "muse::meta::muse-ember:cloud"
   // It is NOT in discoveryCache.muse because the leg kept the old slice.
   ```

4. Call `refreshDiscoveredModels` with an empty combined round — it keeps the old global cache:
   ```js
   import { refreshDiscoveredModels } from "./runner/daemon.js";
   // after a round where every leg returned [] / kept previous, combinedIds stays old
   ```

5. Heartbeat the old `facts.models` to the backend, then read `GET /api/runners/models/catalogue` — `muse-ember` is absent.

### What proves the fix
After adding TTL+eviction (WIDE_NET Layer A), repeat with a stale `atMs` (e.g. `Date.now() - 25*3600*1000`). The old slice should be evicted to `[]` and the next successful round should replace it with the new model.

### Flag: needs real CLI?
To truly discover `muse-ember` you would need the real `muse serve` binary answering `model/list` with that row. **DO NOT invoke the real CLI against prod credentials without explicit permission.** Use the fake above — it exercises the same keep-old path.

---

## 2) Dummy/test models appear in prod catalogue, and wrong-harness models leak (e.g. `gemma4`, `deepseek`)

### What you should see
Picker shows ids that no harness actually serves, or that belong to a different harness.

### Likely involved causes
Cause 1 (sticky dummy id) + cause 2 (allowlist shadow) + cause 3 (grammar drift).

### Minimal local repro A — sticky dummy via keep-old

1. Inject a dummy id as if a prior discovery once returned it:
   ```js
   discoveryCache["pi"] = { ids: ["pi::test::dummy-model", "pi::mistral::real"], atMs: Date.now(), error: null };
   ```

2. Run a failing leg; observe the dummy survives (keep-old).

3. Heartbeat and check `fleetModelSnapshot` — dummy is live-derived and persisted as `available: true`.

### Minimal local repro B — allowlist shadow (no discovery needed)

1. Register a runner without discovery, but set an operator allowlist:
   ```js
   // via backend API or directly in runnerRegistry test harness
   registry.updateOperatorConfig(runnerId, { availableModels: [
     "muse::meta::dummy-test-model",
     "pi::deepseek::gemma4",       // wrong harness / fake provider
     "muse::deepseek::deepseek-r1" // wrong harness
   ]});
   ```

2. Heartbeat with `facts.models: []` — `effectiveRunnerModels` still advertises the allowlist ids (trusted, `unknown` in `confirmRunnerModel`).

3. `fleetModelSnapshot.update()` ingests them as available entries with `runnerCount: 1`.

4. Frontend `fleetSectionMerge` / `fleetModelsForHarness` shows them in the wrong sections.

### What proves the fix
- TTL eviction clears stale dummy ids that are never reconfirmed (Layer A).
- Allowlist ids carry provenance `source: "allowlist"` and are warned when not in `discoveredModels` (Layer B).
- Malformed ids go to `quarantined` not `models` (Layer C quarantine).

---

## 3) Grammar mismatch drops `:` models or leaks `::` ids

### What you should see
A new model id containing `:` (e.g. `muse-ember:cloud`, `glm-4:cloud`) appears in backend MSP but not in runner catalogue, or an id with `::` breaks one leg’s parse and drops valid siblings.

### Likely involved cause
Cause 3.

### Minimal local repro — single `:` should pass, `::` should be rejected

1. Fake a `muse serve` stdout that includes both:
   ```js
   const fakeStdout = [
     JSON.stringify({ jsonrpc:"2.0", id:2, result: { models: [
       { providerId: "meta", modelId: "muse-ember:cloud" },  // legal single `:`
       { providerId: "meta", modelId: "bad::model" },         // illegal `::` — should be skipped
       { providerId: "meta", modelId: "muse-ember" }          // plain — should pass
     ]}})
   ].join("\n");

   import { discoverClaudeModels } from "./runner/modelDiscovery.js";
   const ids = await discoverClaudeModels({
     spawnSyncFn: () => ({ stdout: fakeStdout, error: null, status: 0 }),
     strict: false
   });
   // Expect: ["muse::meta::muse-ember:cloud", "muse::meta::muse-ember"] — no :: entry
   ```

2. Verify the old bug would have dropped the `:cloud` variant (historical `:` filter). Confirm current code only rejects `::`.

3. Also test `shared/modelKeys.js` throw on `::` — wrap `withModelKey("pi::deepseek::bad::model")` in try/catch and assert the whole agy/vibe parse does not abort sibling rows (quarantine vs throw).

### Flag
No real CLI needed — the fake `spawnSyncFn` is the recommended path. **DO NOT** run the real `muse` CLI with manipulated provider names against prod without permission.

---

## 4) Old “unavailable” flag instead of runner count

### What you should see
Picker badges say “Unavailable” (grey/red) instead of “2 runners” / “0 runners”.

### Likely involved cause
Cause 4 (dual presentation contract) + cause 1 snapshot keep-unavailable.

### Minimal local repro — snapshot persistence

1. Create a snapshot with two models:
   ```js
   import { createFleetModelSnapshotStore } from "./api/flow/dispatch/fleetModelSnapshot.js";
   const store = createFleetModelSnapshotStore({ filePath: null });
   store.update([
     { status: "active", runnerId: "r1", capabilities: { harnesses: [{id:"pi"}], models: ["pi::mistral::m1","pi::mistral::m2"], tiers: [] } }
   ]);
   // Both available, runnerCount 1
   ```

2. Make `m2` disappear (runner stops serving it):
   ```js
   store.update([
     { status: "active", runnerId: "r1", capabilities: { harnesses: [{id:"pi"}], models: ["pi::mistral::m1"], tiers: [] } }
   ]);
   // m2 is now { available: false, unavailableReason: "No claim-eligible runner...", runnerCount: 0 }
   ```

3. Assert frontend `fleetSnapshotBadgeNode(snapshotEntry)` renders "Unavailable" while `fleetCountBadgeNode({runnerCount:0})` would correctly render "0 runners".

### What proves the fix
Frontend uses `fleetCountBadgeNode` everywhere in pickers; snapshot `available` is derived from `runnerCount > 0` at read, not stored as independent truth (Layer D).

---

## Running the existing repo tests for these areas

```bash
# Runner discovery + daemon
npm test -- runner/harnessModelDiscovery.test.js
npm test -- runner/daemon.test.js

# Muse leg colon handling
npm test -- runner/modelDiscovery.test.js

# Fleet snapshot / catalogue / confirmation
npm test -- api/flow/dispatch/fleetModelSnapshot.test.js
npm test -- api/flow/dispatch/fleetModelCatalog.test.js
npm test -- api/flow/dispatch/runnerModelConfirmation.test.js
npm test -- api/flow/dispatch/catalogIngest.test.js

# Frontend
npm test -- frontend/src/services/fleetModelOptions
npm test -- frontend/src/services/modelStatus.test.js
```

All of the above are safe to run locally without prod or real agent execution.

---

## What cannot be replicated without real invocation / prod (flagged)

| Scenario | Why not mockable | Safe alternative |
|---|---|---|
| Actual `muse serve` answering with `muse-ember` | Requires installed CLI + login + provider auth | Use `spawnSyncFn` fake as in §3 |
| Runner on a real host with missing CLI / login | Host-specific error classification (`MUSE_MSP_BIN_MISSING`, `PI_MODELS_EMPTY`) | Unit-test the classifier with fake `spawnError` objects |
| Multi-runner fleet aggregation with real heartbeats | Needs live runners + backend + `/runners/models/catalogue` polling | Use `createFleetModelSnapshotStore({filePath:null})` in a test with synthetic runner records |
| Persisted `fleet-catalog.json` surviving a backend restart | Requires filesystem + restart cycle | Test `normalizeSnapshotState` + file round-trip with a temp file; delete after |

**DO NOT** attempt any of the right-hand “real” variants on a prod host, with prod credentials, or by invoking live agents/Runners against prod, without explicit user permission. The mocked paths above exercise the same code branches.
