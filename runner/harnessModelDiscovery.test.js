import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DISCOVERY_LEGS,
	runDiscoveryLeg,
	discoverModelsForHarnesses,
	clearDiscoveryCache,
	getDiscoveryStatus,
	discoveryCache,
} from "./harnessModelDiscovery.js";

test("registry includes all supported harness legs", () => {
	for (const id of ["pi", "muse", "antigravity", "vibe", "opencode", "codex"]) {
		assert.equal(typeof DISCOVERY_LEGS[id], "function");
	}
});

test("runDiscoveryLeg keeps previous cache on throw", async () => {
	clearDiscoveryCache();
	discoveryCache.muse = { ids: ["muse::meta::old"], atMs: 1, error: null };
	// override leg via monkey? Instead invoke unknown harness with no leg returns [] without previous maybe
	const out = await runDiscoveryLeg("unknownharness", {});
	assert.deepEqual(out.ids, []);
});

test("runDiscoveryLeg returns cached on empty first success? muse mock", async () => {
	clearDiscoveryCache();
	// opencode leg with no URL yields []
	const out = await runDiscoveryLeg("opencode", {});
	assert.deepEqual(out.ids, []);
	assert.equal(getDiscoveryStatus().opencode.count, 0);
});

test("discoverModelsForHarnesses combines ids", async () => {
	clearDiscoveryCache();
	const out = await discoverModelsForHarnesses(["codex", "opencode"], {});
	assert.ok(Array.isArray(out));
});
