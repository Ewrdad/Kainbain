import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DISCOVERY_LEGS,
	runDiscoveryLeg,
	discoverModelsForHarnesses,
	discoverPiModels,
	discoverAntigravityModels,
	discoverVibeModels,
	discoverMuseModels,
	discoverOpencodeModels,
	discoverCodexModels,
	clearDiscoveryCache,
	getDiscoveryStatus,
	discoveryCache,
} from "./harnessModelDiscovery.js";

function withLegStub(id, fn) {
	const prev = DISCOVERY_LEGS[id];
	DISCOVERY_LEGS[id] = fn;
	return () => {
		DISCOVERY_LEGS[id] = prev;
	};
}

test("registry includes all supported harness legs", () => {
	for (const id of ["pi", "muse", "antigravity", "vibe", "opencode", "codex"]) {
		assert.equal(typeof DISCOVERY_LEGS[id], "function");
	}
	for (const id of ["custom", "mock"]) {
		assert.equal(DISCOVERY_LEGS[id], undefined);
	}
});

test("runDiscoveryLeg times out a hanging leg to [] with a classified error", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("pi", () => new Promise(() => {}));
	try {
		const out = await runDiscoveryLeg("pi", { timeoutMs: 20 });
		assert.deepEqual(out.ids, []);
		assert.match(out.error.code, /PI_DISCOVERY_FAILED/);
		assert.match(out.error.message, /timed out/);
		const status = getDiscoveryStatus();
		assert.equal(status.pi.ok, false);
		assert.equal(status.pi.count, 0);
		assert.equal(status.pi.error.code, out.error.code);
	} finally {
		restore();
	}
});

test("runDiscoveryLeg maps a throw to [] and preserves classified codes", async () => {
	clearDiscoveryCache();
	const classified = new Error("agy CLI missing");
	classified.code = "AGY_BIN_MISSING";
	classified.hint = "install agy";
	const restore = withLegStub("antigravity", async () => { throw classified; });
	try {
		const out = await runDiscoveryLeg("antigravity", {});
		assert.deepEqual(out.ids, []);
		assert.equal(out.error.code, "AGY_BIN_MISSING");
		assert.equal(out.error.hint, "install agy");
	} finally {
		restore();
	}
	const restore2 = withLegStub("vibe", async () => { throw new Error("boom"); });
	try {
		const out = await runDiscoveryLeg("vibe", {});
		assert.deepEqual(out.ids, []);
		assert.equal(out.error.code, "VIBE_DISCOVERY_FAILED");
	} finally {
		restore2();
	}
});

test("runDiscoveryLeg dedupes, validates grammar, and rejects other-harness ids", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("pi", async () => [
		"pi::mistral::x",
		"pi::mistral::x",
		"  pi::mistral::y  ",
		"muse::meta::zzz",
		"not-a-key",
		"pi::only-two",
		"",
		42,
	]);
	try {
		const out = await runDiscoveryLeg("pi", {});
		assert.deepEqual(out.ids, ["pi::mistral::x", "pi::mistral::y"]);
		assert.equal(out.error, null);
	} finally {
		restore();
	}
});

test("runDiscoveryLeg keeps the previous slice when a later round fails or empties", async () => {
	clearDiscoveryCache();
	discoveryCache.muse = { ids: ["muse::meta::old"], atMs: 1, error: null };
	const restore = withLegStub("muse", async () => { throw new Error("serve down"); });
	try {
		const out = await runDiscoveryLeg("muse", {});
		assert.deepEqual(out.ids, ["muse::meta::old"]);
		assert.equal(out.error.code, "MUSE_DISCOVERY_FAILED");
	} finally {
		restore();
	}
	const restore2 = withLegStub("muse", async () => []);
	try {
		const out = await runDiscoveryLeg("muse", {});
		assert.deepEqual(out.ids, ["muse::meta::old"]);
	} finally {
		restore2();
	}
});

test("runDiscoveryLeg reports NO_DISCOVERY_LEG for unknown harnesses", async () => {
	clearDiscoveryCache();
	const out = await runDiscoveryLeg("unknownharness", {});
	assert.deepEqual(out.ids, []);
	assert.equal(out.error.code, "NO_DISCOVERY_LEG");
});

test("runDiscoveryLeg flags an all-malformed round as unparseable", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("pi", async () => ["garbage", "also-bad"]);
	try {
		const out = await runDiscoveryLeg("pi", {});
		assert.deepEqual(out.ids, []);
		assert.equal(out.error.code, "PI_MODELS_UNPARSEABLE");
	} finally {
		restore();
	}
});

test("discoverModelsForHarnesses combines per-leg ids with status attached", async () => {
	clearDiscoveryCache();
	const restorePi = withLegStub("pi", async () => ["pi::mistral::x"]);
	const restoreMuse = withLegStub("muse", async () => ["muse::meta::m", "muse::meta::m"]);
	try {
		const out = await discoverModelsForHarnesses(["pi", "muse"], {});
		assert.deepEqual([...out], ["pi::mistral::x", "muse::meta::m"]);
		assert.deepEqual(Object.keys(out.byHarness).sort(), ["muse", "pi"]);
		assert.equal(out.status.pi.count, 1);
		assert.equal(out.status.muse.count, 1);
	} finally {
		restorePi();
		restoreMuse();
	}
});

test("discoverModelsForHarnesses tolerates blanks and unknown ids", async () => {
	clearDiscoveryCache();
	const out = await discoverModelsForHarnesses(["codex", "", null, "nope"], {});
	assert.ok(Array.isArray(out));
	assert.deepEqual([...out], []);
});

test("pi leg maps harness keys and honors empty login", async () => {
	const ids = await discoverPiModels({
		createHarness: async () => ({
			listModels: async () => [{ key: "pi::mistral::x" }, "pi::google::y"],
		}),
	});
	assert.deepEqual(ids, ["pi::mistral::x", "pi::google::y"]);
	const empty = await discoverPiModels({
		createHarness: async () => ({ listModels: async () => [] }),
	});
	assert.deepEqual(empty, []);
});

test("antigravity leg maps keys and surfaces the retained classified error on empty", async () => {
	const ids = await discoverAntigravityModels({
		createCatalog: () => ({
			clearCache: () => {},
			listAgyModels: async () => [{ key: "antigravity::google::gemini-3-pro" }],
		}),
	});
	assert.deepEqual(ids, ["antigravity::google::gemini-3-pro"]);
	await assert.rejects(
		discoverAntigravityModels({
			createCatalog: () => ({
				clearCache: () => {},
				listAgyModels: async () => [],
				lastDiscoveryError: () => ({ code: "AGY_BIN_MISSING", message: "no agy", hint: "install" }),
			}),
		}),
		/no agy/,
	);
	// Silent empty (no retained failure) stays silent.
	const silent = await discoverAntigravityModels({
		createCatalog: () => ({
			clearCache: () => {},
			listAgyModels: async () => [],
			lastDiscoveryError: () => null,
		}),
	});
	assert.deepEqual(silent, []);
});

test("antigravity classified error survives the registry wrapper with its code", async () => {
	clearDiscoveryCache();
	const out = await runDiscoveryLeg("antigravity", {
		createCatalog: () => ({
			clearCache: () => {},
			listAgyModels: async () => [],
			lastDiscoveryError: () => ({ code: "AGY_AUTH_MISSING", message: "login first", hint: "agy login" }),
		}),
	});
	assert.deepEqual(out.ids, []);
	assert.equal(out.error.code, "AGY_AUTH_MISSING");
	assert.equal(out.error.hint, "agy login");
});

test("vibe leg maps keys and surfaces the retained classified error on empty", async () => {
	const ids = await discoverVibeModels({
		createCatalog: () => ({
			clearCache: () => {},
			listModels: async () => [{ key: "vibe::mistral::large" }],
		}),
	});
	assert.deepEqual(ids, ["vibe::mistral::large"]);
	await assert.rejects(
		discoverVibeModels({
			createCatalog: () => ({
				clearCache: () => {},
				listModels: async () => [],
				lastDiscoveryError: () => ({ code: "VIBE_ACP_BIN_MISSING", message: "no acp", hint: "reinstall" }),
			}),
		}),
		/no acp/,
	);
});

test("muse leg honors the discoverFn seam and the spawn seam", async () => {
	const viaFn = await discoverMuseModels({ discoverFn: async () => ["muse::meta::a", "muse::meta::a"] });
	assert.deepEqual(viaFn, ["muse::meta::a"]);
	const transcript = [
		JSON.stringify({ jsonrpc: "2.0", id: 2, result: { models: [{ modelId: "m1", providerId: "meta" }] } }),
	].join("\n");
	const viaSpawn = await discoverMuseModels({ spawnSyncFn: () => ({ stdout: transcript }) });
	assert.deepEqual(viaSpawn, ["muse::meta::m1"]);
});

test("opencode leg maps server rows to harness-scoped keys and skips malformed rows", async () => {
	const ids = await discoverOpencodeModels({
		baseUrl: "http://127.0.0.1:9",
		fetchModels: async () => ({
			providers: [
				{ id: "anthropic", models: { "claude-x": { name: "Claude X" } } },
				{ id: "bad provider", models: { "m::weird": {} } },
			],
		}),
	});
	assert.deepEqual(ids, ["opencode::anthropic::claude-x"]);
});

test("opencode leg reports honest-empty with a reason when no server is configured", async () => {
	clearDiscoveryCache();
	const savedUrl = process.env.OPENCODE_URL;
	const savedServerUrl = process.env.OPENCODE_SERVER_URL;
	delete process.env.OPENCODE_URL;
	delete process.env.OPENCODE_SERVER_URL;
	try {
		const out = await runDiscoveryLeg("opencode", {});
		assert.deepEqual(out.ids, []);
		assert.equal(out.error.code, "OPENCODE_NOT_CONFIGURED");
		assert.match(out.error.hint, /OPENCODE_URL/);
	} finally {
		if (savedUrl !== undefined) process.env.OPENCODE_URL = savedUrl;
		if (savedServerUrl !== undefined) process.env.OPENCODE_SERVER_URL = savedServerUrl;
	}
});

test("codex leg is honest-empty with a stable reason", async () => {
	clearDiscoveryCache();
	await assert.rejects(discoverCodexModels({}), /not available/);
	const out = await runDiscoveryLeg("codex", {});
	assert.deepEqual(out.ids, []);
	assert.equal(out.error.code, "CODEX_DISCOVERY_UNAVAILABLE");
});

test("clearDiscoveryCache resets slices and status", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("pi", async () => ["pi::mistral::x"]);
	try {
		await runDiscoveryLeg("pi", {});
	} finally {
		restore();
	}
	assert.equal(getDiscoveryStatus().pi.count, 1);
	clearDiscoveryCache();
	assert.deepEqual(getDiscoveryStatus(), {});
});
