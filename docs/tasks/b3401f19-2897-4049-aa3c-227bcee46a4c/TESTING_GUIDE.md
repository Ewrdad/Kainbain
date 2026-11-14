# TESTING_GUIDE — Runner catalogue bug (TDD examples)

Task: `b3401f19-2897-4049-aa3c-227bcee46a4c`  
Companion to `WIDE_NET_ANALYSIS.md` + `REPLICATION_GUIDE.md`. This guide gives concrete **test examples** you can copy into the repo to drive the structural fix test-first. All examples are **illustrative** — file paths and import names match the current codebase but may need minor adjustment when you wire them up.

> Safety note: every test below runs in-memory with fakes. **DO NOT** extend them to spawn the real `muse`/`pi`/`codex` CLIs, hit prod endpoints, or start real Runners/Agents without explicit user permission — see `REPLICATION_GUIDE.md` “flagged” table.

---

## How to run

```bash
npm test -- runner/harnessModelDiscovery.test.js
npm test -- runner/modelDiscovery.test.js
npm test -- api/flow/dispatch/fleetModelSnapshot.test.js
```

New tests can live alongside those files (e.g. `runner/harnessModelDiscovery.repro.test.js` for repro, then promote to permanent tests). Delete repro-only files once the fix lands.

---

## 1) Keep-old cache must expire (cause 1)

### Goal
Stale/dummy ids that are never reconfirmed should not live forever. A TTL + eviction replaces indefinite keep-old.

### Example — stale slice evicted after TTL

```js
// runner/harnessModelDiscovery.ttl.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { discoveryCache, clearDiscoveryCache, runDiscoveryLeg } from "./harnessModelDiscovery.js";

describe("discovery TTL eviction (structural fix)", () => {
  beforeEach(() => clearDiscoveryCache());

  it("evicts a stale slice that has not been reconfirmed within TTL", async () => {
    const TTL_MS = 24 * 3600 * 1000;
    // seed a dummy id as if a prior round returned it
    discoveryCache["pi"] = {
      ids: ["pi::test::dummy-model"],
      atMs: Date.now() - (TTL_MS + 1000), // stale
      error: null,
    };

    // next leg fails (timeout) — with the fix, stale slice is evicted, not kept
    const res = await runDiscoveryLeg("pi", {
      discoverFn: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); },
      ttlMs: TTL_MS,
    });

    expect(res.ids).toEqual([]); // evicted, not kept
    expect(res.error?.code).toBe("STALE_EVICTED");
  });

  it("keeps a fresh slice on transient failure within TTL", async () => {
    const TTL_MS = 24 * 3600 * 1000;
    discoveryCache["pi"] = {
      ids: ["pi::mistral::real-model"],
      atMs: Date.now() - 1000, // fresh
      error: null,
    };
    const res = await runDiscoveryLeg("pi", {
      discoverFn: async () => { throw new Error("transient"); },
      ttlMs: TTL_MS,
    });
    expect(res.ids).toEqual(["pi::mistral::real-model"]);
  });
});
```

### Example — new model appears after successful round

```js
it("replaces cache with new ids when a later round succeeds (muse-ember appears)", async () => {
  clearDiscoveryCache();
  discoveryCache["muse"] = { ids: ["muse::meta::old-model"], atMs: Date.now(), error: null };

  const res = await runDiscoveryLeg("muse", {
    discoverFn: async () => ["muse::meta::muse-ember", "muse::meta::old-model"],
  });
  expect(res.ids).toContain("muse::meta::muse-ember");
});
```

---

## 2) Allowlist must not silently shadow discovery (cause 2)

### Goal
`operatorConfig.availableModels` should not be the sole truth. Divergence must be observable.

### Example — quarantine diverges from allowlist

```js
// api/flow/dispatch/effectiveRunnerModels.divergence.test.js
import { describe, it, expect } from "vitest";
import { effectiveRunnerModels } from "./runnerMatches/effectiveRunnerModels.js";
import { runnerModelConfirmation } from "./runnerModelConfirmation.js";

describe("allowlist vs discovered divergence", () => {
  it("flags an allowlist id that no claimant discovered", () => {
    const runnerId = "r1";
    const discoveredByRunner = ["pi::mistral::real"]; // what the leg actually saw
    const allowlist = ["pi::deepseek::gemma4"];       // what operator asserted

    // effectiveRunnerModels currently returns allowlist alone when set — divergence hidden
    const advertised = effectiveRunnerModels({ operatorConfig: { availableModels: allowlist } }, discoveredByRunner);
    // desired after fix: advertised still serves allowlist, but confirmation marks it stale
    const verdict = runnerModelConfirmation({
      modelId: "pi::deepseek::gemma4",
      runnerId,
      discoveredByRunnerIds: discoveredByRunner,
      isOperatorAsserted: true,
    });
    // operator-asserted ids are currently "unknown" (trusted) — after fix, optionally warn
    expect(advertised).toContain("pi::deepseek::gemma4");
    // add assertion for new divergence signal, e.g. verdict.divergent === true
  });
});
```

> TDD note: the first assertion already passes today; the divergence signal (`verdict.divergent` or `staleAdvertReason`) is the new behaviour to add (Layer B).

---

## 3) Grammar gate — single `:` ok, `::` rejected, siblings not dropped (cause 3)

### Goal
One grammar gate at ingestion; no leg silently drops valid ids or throws away siblings.

### Example — muse leg with mixed ids

```js
// runner/modelDiscovery.colon.test.js
import { describe, it, expect } from "vitest";
import { discoverClaudeModels } from "./modelDiscovery.js";

describe("muse leg grammar", () => {
  it("keeps single-colon ids and skips double-colon ids without dropping siblings", async () => {
    const fakeStdout = [
      JSON.stringify({ jsonrpc:"2.0", id:2, result: { models: [
        { providerId: "meta", modelId: "muse-ember:cloud" },
        { providerId: "meta", modelId: "bad::model" },
        { providerId: "meta", modelId: "muse-ember" },
      ]}})
    ].join("\n");

    const ids = await discoverClaudeModels({
      spawnSyncFn: () => ({ stdout: fakeStdout, error: null, status: 0 }),
      strict: false,
    });

    expect(ids).toEqual([
      "muse::meta::muse-ember:cloud",
      "muse::meta::muse-ember",
    ]);
    expect(ids).not.toContain("muse::meta::bad::model");
  });
});
```

### Example — catalogue ingest quarantine (Layer C)

```js
// api/flow/dispatch/catalogIngest.quarantine.test.js
import { describe, it, expect } from "vitest";
import { createFleetModelSnapshotStore } from "./fleetModelSnapshot.js";

describe("fleet ingest quarantine", () => {
  it("quarantines a malformed advertised id with a reason instead of serving it", () => {
    const store = createFleetModelSnapshotStore({ filePath: null });
    store.update([
      { status: "active", runnerId: "r1",
        capabilities: { harnesses: [{id:"pi"}], models: ["not-a-model-key", "pi::mistral::ok"], tiers: [] } }
    ]);
    const snap = store.getSnapshot();
    expect(snap.models.map(m => m.id)).toContain("pi::mistral::ok");
    expect(snap.models.map(m => m.id)).not.toContain("not-a-model-key");
    expect(snap.quarantined.map(q => q.id)).toContain("not-a-model-key");
    expect(snap.quarantined.find(q => q.id === "not-a-model-key").reason).toMatch(/grammar|malformed/i);
  });
});
```

---

## 4) Runner count, not “unavailable” flag, is the UX truth (cause 4)

### Goal
Picker rows show `N runners` / `0 runners` rather than a blocking “Unavailable” badge.

### Example — snapshot retention then eviction (Layer C)

```js
// api/flow/dispatch/fleetModelSnapshot.retention.test.js
import { describe, it, expect } from "vitest";
import { createFleetModelSnapshotStore } from "./fleetModelSnapshot.js";

describe("fleet snapshot retention", () => {
  it("keeps a dropped model as 0 runners for the retention window, then evicts it", () => {
    const RETENTION_MS = 14 * 24 * 3600 * 1000;
    const store = createFleetModelSnapshotStore({ filePath: null, retentionMs: RETENTION_MS });

    // 1) runner serves two models
    store.update([
      { status: "active", runnerId: "r1",
        capabilities: { harnesses: [{id:"pi"}], models: ["pi::mistral::m1","pi::mistral::m2"], tiers: [] } }
    ]);
    expect(store.getSnapshot().models.find(m => m.id === "pi::mistral::m2").available).toBe(true);

    // 2) runner stops serving m2 — it becomes 0 runners but stays visible
    store.update([
      { status: "active", runnerId: "r1",
        capabilities: { harnesses: [{id:"pi"}], models: ["pi::mistral::m1"], tiers: [] } }
    ]);
    expect(store.getSnapshot().models.find(m => m.id === "pi::mistral::m2").runnerCount).toBe(0);
    // after fix: available derived from runnerCount, retention window not yet elapsed so entry still present
    expect(store.getSnapshot().models.find(m => m.id === "pi::mistral::m2")).toBeDefined();

    // 3) after retention elapsed, entry is evicted (simulate by advancing lastSeenAtMs)
    // (requires injecting clock or mutating snapshot test seam — adapt to actual API)
  });
});
```

### Example — frontend badge (no prod needed)

```js
// frontend/src/services/fleetModelOptions/fleetCountBadge.test.js
import { describe, it, expect } from "vitest";
import { fleetCountBadgeNode } from "../modelStatus.js";

describe("fleet count badge", () => {
  it("renders runner count, not unavailable, for a 0-runner entry", () => {
    const node = fleetCountBadgeNode({ runnerCount: 0 });
    expect(node.textContent).toMatch(/0 runners/i);
    expect(node.textContent).not.toMatch(/unavailable/i);
  });
  it("renders N runners for a served model", () => {
    const node = fleetCountBadgeNode({ runnerCount: 2 });
    expect(node.textContent).toMatch(/2 runners/i);
  });
});
```

---

## 5) End-to-end catalogue flow (safe, in-memory)

```js
// api/flow/dispatch/fleetModelCatalog.e2e.test.js
import { describe, it, expect } from "vitest";
import { createFleetModelSnapshotStore } from "./fleetModelSnapshot.js";
import { buildFleetModelCatalog } from "./fleetModelCatalog.js";

describe("end-to-end: discovery → heartbeat → catalogue → snapshot", () => {
  it("a newly discovered model flows to the central catalogue with a runner count", () => {
    const registryRunners = [
      { status: "active", runnerId: "r1",
        capabilities: { harnesses: [{id:"muse"}], models: ["muse::meta::muse-ember"], tiers: [] },
        operatorConfig: { availableModels: null } },
      { status: "active", runnerId: "r2",
        capabilities: { harnesses: [{id:"muse"}], models: ["muse::meta::muse-ember","muse::meta::older"], tiers: [] },
        operatorConfig: { availableModels: null } },
    ];

    const catalogue = buildFleetModelCatalog(registryRunners);
    expect(catalogue.map(c => c.id)).toContain("muse::meta::muse-ember");
    expect(catalogue.find(c => c.id === "muse::meta::muse-ember").runnerCount).toBe(2);

    const store = createFleetModelSnapshotStore({ filePath: null });
    store.update(registryRunners);
    expect(store.getSnapshot().models.find(m => m.id === "muse::meta::muse-ember").runnerCount).toBe(2);
  });
});
```

---

## What these tests do not cover (and why)

| Gap | Reason | What to do instead (with permission) |
|---|---|---|
| Real `muse serve` handshake timing / auth | Requires real binary + login + network | Keep the `spawnSyncFn` fake; test `describeMuseSpawnFailure` classifier separately with synthetic errors |
| Actual runner heartbeat over WebSocket | Needs a running API + Runner | Test `runnerRegistry.heartbeat` + `fleetModelSnapshot.update` in-process as above |
| Frontend picker rendering with live catalogue fetch | Needs `GET /runners/models/catalogue` + browser | Unit-test `fleetModelsForHarness` / `fleetCountBadgeNode` with a snapshot fixture |

All of the above run locally with `npm test` and do not touch prod.
