import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFleetModelCatalog } from "../api/flow/dispatch/fleetModelCatalog.js";
import { NEW_MODEL_COLON_ID, NEW_MODEL_ID, fleetRunnerRecord } from "../api/flow/dispatch/fleetModelFixtures.mjs";
import {
	DISCOVERY_LEGS,
	runDiscoveryLeg,
	runDiscoveryRound,
	getDiscoveryStatus,
	summarizeDiscoverySlices,
	discoverPiModels,
	discoverAntigravityModels,
	discoverVibeModels,
	discoverMuseModels,
	discoverOpencodeModels,
	discoverCodexModels,
	clearDiscoveryCache,
	discoveryCache,
	provenanceForIds,
} from "./harnessModelDiscovery.js";

function withLegStub(id, fn) {
	const prev = DISCOVERY_LEGS[id];
	DISCOVERY_LEGS[id] = fn;
	return () => {
		DISCOVERY_LEGS[id] = prev;
	};
}

test("provenanceForIds attributes advertised ids to their detecting leg + time", async () => {
	clearDiscoveryCache();
	const restorePi = withLegStub("pi", async () => ["pi::p::a"]);
	const restoreMuse = withLegStub("muse", async () => ["muse::meta::m"]);
	try {
		await runDiscoveryLeg("pi", {});
		await runDiscoveryLeg("muse", {});
		const provenance = provenanceForIds(["muse::meta::m", "pi::p::a", "pinned-elsewhere"]);
		assert.equal(provenance["pi::p::a"].harness, "pi");
		assert.equal(typeof provenance["pi::p::a"].atMs, "number");
		assert.equal(provenance["muse::meta::m"].harness, "muse");
		assert.equal(provenance["pinned-elsewhere"], undefined);
		assert.deepEqual(provenanceForIds(null), {});
	} finally {
		restorePi();
		restoreMuse();
		clearDiscoveryCache();
	}
});

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

test("runDiscoveryLeg treats a missing or non-positive timeout as the default budget", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("pi", async () => {
		await new Promise((r) => setTimeout(r, 30));
		return ["pi::mistral::x"];
	});
	try {
		// A zero budget must not time out a healthy leg on arrival.
		const out = await runDiscoveryLeg("pi", { timeoutMs: 0 });
		assert.deepEqual(out.ids, ["pi::mistral::x"]);
		assert.equal(out.error, null);
		const negative = await runDiscoveryLeg("pi", { timeoutMs: -5 });
		assert.deepEqual(negative.ids, ["pi::mistral::x"]);
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

test("runDiscoveryLeg maps a synchronous leg throw to [] without throwing", async () => {
	clearDiscoveryCache();
	const restore = withLegStub("muse", () => { throw new Error("sync boom"); });
	try {
		const out = await runDiscoveryLeg("muse", {});
		assert.deepEqual(out.ids, []);
		assert.equal(out.error.code, "MUSE_DISCOVERY_FAILED");
	} finally {
		restore();
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

test("runDiscoveryLeg flags a non-list leg result as unparseable and keeps the old slice", async () => {
	clearDiscoveryCache();
	discoveryCache.pi = { ids: ["pi::mistral::old"], atMs: 1, error: null };
	const restore = withLegStub("pi", async () => "not-a-list");
	try {
		const out = await runDiscoveryLeg("pi", {});
		assert.deepEqual(out.ids, ["pi::mistral::old"]);
		assert.equal(out.error.code, "PI_MODELS_UNPARSEABLE");
	} finally {
		restore();
	}
});

test("runDiscoveryRound combines per-leg ids and reports per-harness outcomes", async () => {
	clearDiscoveryCache();
	const restorePi = withLegStub("pi", async () => ["pi::mistral::x"]);
	const restoreMuse = withLegStub("muse", async () => ["muse::meta::m", "muse::meta::m"]);
	try {
		const out = await runDiscoveryRound({ harnessIds: ["pi", "muse"] });
		assert.deepEqual(out.combinedIds, ["pi::mistral::x", "muse::meta::m"]);
		assert.deepEqual(Object.keys(out.resultsByHarness).sort(), ["muse", "pi"]);
		assert.equal(out.resultsByHarness.pi.error, null);
		assert.equal(getDiscoveryStatus().pi.count, 1);
		assert.equal(getDiscoveryStatus().muse.count, 1);
	} finally {
		restorePi();
		restoreMuse();
	}
});

test("runDiscoveryRound skips blanks and harness ids without a leg", async () => {
	clearDiscoveryCache();
	const out = await runDiscoveryRound({ harnessIds: ["", null, "nope", "mock", "  "] });
	assert.deepEqual(out.combinedIds, []);
	assert.deepEqual(out.resultsByHarness, {});
	assert.deepEqual(getDiscoveryStatus(), {});
});

test("runDiscoveryRound hands every leg a fresh copy of the shared seams", async () => {
	clearDiscoveryCache();
	const seen = [];
	const restorePi = withLegStub("pi", async (ctx) => { seen.push(ctx); return []; });
	const restoreMuse = withLegStub("muse", async (ctx) => { seen.push(ctx); ctx.mutated = true; return []; });
	try {
		await runDiscoveryRound({ harnessIds: ["pi", "muse"], timeoutMs: 999, legOptions: { marker: "shared" } });
		assert.equal(seen.length, 2);
		assert.equal(seen[0].marker, "shared");
		assert.equal(seen[1].marker, "shared");
		assert.equal(seen[0].timeoutMs, 999);
		// The muse leg's mutation must not leak into the pi leg's copy.
		assert.equal(seen[0].mutated, undefined);
	} finally {
		restorePi();
		restoreMuse();
	}
});

test("getDiscoveryStatus filters to the requested harness ids", async () => {
	clearDiscoveryCache();
	const restorePi = withLegStub("pi", async () => ["pi::mistral::x"]);
	const restoreMuse = withLegStub("muse", async () => ["muse::meta::m"]);
	try {
		await runDiscoveryRound({ harnessIds: ["pi", "muse"] });
		// A stale slice from a harness no longer configured stays out.
		discoveryCache.vibe = { ids: ["vibe::mistral::stale"], atMs: 1, error: null };
		assert.deepEqual(Object.keys(getDiscoveryStatus(["pi", "muse"])).sort(), ["muse", "pi"]);
		assert.deepEqual(Object.keys(getDiscoveryStatus()).sort(), ["muse", "pi", "vibe"]);
	} finally {
		restorePi();
		restoreMuse();
	}
});

test("summarizeDiscoverySlices renders counts and the first leg error in order", async () => {
	clearDiscoveryCache();
	const restorePi = withLegStub("pi", async () => ["pi::mistral::x"]);
	const restoreAgy = withLegStub("antigravity", async () => { throw Object.assign(new Error("no agy"), { code: "AGY_BIN_MISSING" }); });
	try {
		await runDiscoveryRound({ harnessIds: ["pi", "antigravity"] });
		const summary = summarizeDiscoverySlices(["pi", "antigravity", "mock"]);
		assert.equal(summary.countsText, "pi:1, antigravity:0");
		assert.equal(summary.firstError.code, "AGY_BIN_MISSING");
		// Harness ids without a leg never appear; an all-skipped list is empty, not misleading.
		assert.deepEqual(summarizeDiscoverySlices(["mock", "nope"]), { countsText: "", firstError: null });
		// A legged harness that never scanned reads as 0.
		clearDiscoveryCache();
		assert.deepEqual(
			summarizeDiscoverySlices(["vibe"]),
			{ countsText: "vibe:0", firstError: null },
		);
	} finally {
		restorePi();
		restoreAgy();
	}
});

test("pi leg serves single-colon ids verbatim (no stricter filter)", async () => {
	const ids = await discoverPiModels({
		createHarness: async () => ({
			listModels: async () => [{ key: "pi::ollama-cloud::glm-5.3-flash:cloud" }],
		}),
	});
	assert.deepEqual(ids, ["pi::ollama-cloud::glm-5.3-flash:cloud"]);
});

test("pi leg maps harness keys and reports an empty catalogue as PI_MODELS_EMPTY", async () => {
	const ids = await discoverPiModels({
		createHarness: async () => ({
			listModels: async () => [{ key: "pi::mistral::x" }, "pi::google::y"],
		}),
	});
	assert.deepEqual(ids, ["pi::mistral::x", "pi::google::y"]);
	// No provider login: the status slot must name the cause, not a bare zero.
	await assert.rejects(
		discoverPiModels({
			createHarness: async () => ({
				listModels: async () => [],
				modelAuthStatus: async () => ({ error: null, providers: [] }),
			}),
		}),
		/no provider login/,
	);
	// A harness double without modelAuthStatus still throws the same code.
	await assert.rejects(
		discoverPiModels({
			createHarness: async () => ({ listModels: async () => [] }),
		}),
		/PI_MODELS_EMPTY|no models ready/,
	);
	try {
		await discoverPiModels({
			createHarness: async () => ({ listModels: async () => [] }),
		});
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "PI_MODELS_EMPTY");
		assert.match(err.hint, /re-detection/);
	}
	// Logged-in providers that yield nothing are distinguished in the message.
	try {
		await discoverPiModels({
			createHarness: async () => ({
				listModels: async () => [],
				modelAuthStatus: async () => ({
					error: null,
					providers: [{ provider: "mistral", configured: true }, { provider: "openai", configured: false }],
				}),
			}),
		});
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "PI_MODELS_EMPTY");
		assert.match(err.message, /1 provider\(s\) logged in/);
	}
});

test("pi empty catalogue keeps the old slice with its code through the registry", async () => {
	clearDiscoveryCache();
	discoveryCache.pi = { ids: ["pi::mistral::old"], atMs: 1, error: null };
	const out = await runDiscoveryLeg("pi", {
		createHarness: async () => ({
			listModels: async () => [],
			modelAuthStatus: async () => ({ error: null, providers: [] }),
		}),
	});
	assert.deepEqual(out.ids, ["pi::mistral::old"]);
	assert.equal(out.error.code, "PI_MODELS_EMPTY");
	assert.match(out.error.message, /no provider login/);
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

test("antigravity leg parses real catalogue output on the default loader path", async () => {
	const ids = await discoverAntigravityModels({
		spawnAgyModels: async () => "Available models:\n\ngemini-3-pro-high  Most capable\n",
	});
	assert.deepEqual(ids, ["antigravity::antigravity::gemini-3-pro-high"]);
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

test("vibe leg serves injected loader rows on the default catalogue path", async () => {
	const ids = await discoverVibeModels({
		discoverModels: async () => [{ key: "vibe::mistral::large" }],
	});
	assert.deepEqual(ids, ["vibe::mistral::large"]);
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

test("muse leg throws MUSE_MSP_MODELS_EMPTY when the CLI answers with zero rows", async () => {
	const emptyAnswer = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { models: [] } });
	try {
		await discoverMuseModels({ spawnSyncFn: () => ({ stdout: `${emptyAnswer}\n` }) });
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "MUSE_MSP_MODELS_EMPTY");
		assert.match(err.message, /reported no models/);
		assert.match(err.hint, /serve --provider/);
	}
});

test("muse leg surfaces strict probe failures (unparsable output, missing CLI)", async () => {
	// Unparsable output with a stubbed spawn: strict classification, no host touch.
	await assert.rejects(
		discoverMuseModels({ spawnSyncFn: () => ({ stdout: "garbage\n" }) }),
		/did not answer model\/list/,
	);
	// Missing CLI on a controlled env: the binary pre-check names the install fix.
	try {
		await discoverMuseModels({ env: { PATH: "/definitely/not/real", HOME: "/definitely/not/real" }, platform: "linux" });
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "MUSE_MSP_BIN_MISSING");
		assert.match(err.hint, /KAINBAIN_MUSE_BIN/);
	}
});

test("new-model fixture rows flow from the muse leg into the fleet catalogue (chain gate)", async () => {
	// End-to-end seam proof: the committed `muse serve` transcript
	// fixture drives the REAL leg parser (no hand-written rows), and the
	// resulting ids land in the fleet catalogue byte-identical.
	clearDiscoveryCache();
	const fixture = JSON.parse(
		fs.readFileSync(
			new URL("../api/agent/harnesses/muse/fixtures/msp-model-list.new-model.json", import.meta.url),
			"utf8",
		),
	);
	const stdout = [
		JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "muse" } } }),
		JSON.stringify({ jsonrpc: "2.0", id: 2, result: fixture }),
	].join("\n");
	const out = await runDiscoveryLeg("muse", { spawnSyncFn: () => ({ stdout }) });
	assert.equal(out.error, null);
	assert.ok(out.ids.includes(NEW_MODEL_ID));
	assert.ok(out.ids.includes(NEW_MODEL_COLON_ID));
	const catalogue = buildFleetModelCatalog([
		fleetRunnerRecord({ runnerId: "box-a", capabilities: { models: out.ids } }),
	]);
	const entry = catalogue.models.find((m) => m.id === NEW_MODEL_ID);
	assert.deepEqual(entry, {
		id: NEW_MODEL_ID,
		harnesses: ["muse"],
		tiers: ["T0", "T1"],
		runnerCount: 1,
		runnerIds: ["box-a"],
	});
	clearDiscoveryCache();
});

test("muse leg keeps the old slice with MUSE_MSP_MODELS_EMPTY through the registry", async () => {
	clearDiscoveryCache();
	discoveryCache.muse = { ids: ["muse::meta::old"], atMs: 1, error: null };
	const emptyAnswer = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { models: [] } });
	const out = await runDiscoveryLeg("muse", { spawnSyncFn: () => ({ stdout: `${emptyAnswer}\n` }) });
	assert.deepEqual(out.ids, ["muse::meta::old"]);
	assert.equal(out.error.code, "MUSE_MSP_MODELS_EMPTY");
});

test("opencode leg maps server rows to harness-scoped keys and skips malformed rows", async () => {
	const ids = await discoverOpencodeModels({
		baseUrl: "http://127.0.0.1:9",
		fetchModels: async () => ({
			providers: [
				{ id: "anthropic", models: { "claude-x": { name: "Claude X" }, "claude-x:1m": {} } },
				{ id: "bad provider", models: { "m::weird": {} } },
			],
		}),
	});
	assert.deepEqual(ids, ["opencode::anthropic::claude-x", "opencode::anthropic::claude-x:1m"]);
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
		// A blank URL reads as unconfigured, never as a fetch target.
		const blank = await runDiscoveryLeg("opencode", { baseUrl: "   " });
		assert.equal(blank.error.code, "OPENCODE_NOT_CONFIGURED");
	} finally {
		if (savedUrl !== undefined) process.env.OPENCODE_URL = savedUrl;
		if (savedServerUrl !== undefined) process.env.OPENCODE_SERVER_URL = savedServerUrl;
	}
});

test("codex leg is honest-empty with a stable reason", async () => {
	clearDiscoveryCache();
	await assert.rejects(discoverCodexModels(), /not available/);
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
