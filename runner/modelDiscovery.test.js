import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverClaudeModels, resolveAdvertisedModels, resolveAdvertisedModelSource } from "./modelDiscovery.js";

const TRANSCRIPT = [
	JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "muse" } } }),
	JSON.stringify({
		jsonrpc: "2.0",
		id: 2,
		result: {
			models: [
				{ modelId: "muse-spark-1.3", providerId: "meta" },
				{ modelId: "muse-wonder-1.0", providerId: "meta" },
				{ modelId: "muse-spark-1.3", providerId: "meta" },
				{ modelId: "", providerId: "meta" },
				{ modelId: "odd:model", providerId: "meta" },
				{ modelId: "muse-spark-1.3" },
				"not-an-object",
			],
		},
	}),
	"not json",
].join("\n");

const fakeSpawn = (stdout) => () => ({ stdout });

test("maps model/list rows to composite fleet ids, deduped, malformed skipped", async () => {
	const ids = await discoverClaudeModels({ spawnSyncFn: fakeSpawn(TRANSCRIPT) });
	assert.deepEqual(ids, ["muse::meta::muse-spark-1.3", "muse::meta::muse-wonder-1.0", "muse::meta::odd:model"]);
});

test("serves single-colon ids exactly like the shared grammar (new-model chain)", async () => {
	// The shared grammar allows single `:` in ids (glm-5.3-flash:cloud);
	// the leg must align with parseModelKey instead of its own stricter
	// rule, or new `muse serve` rows never reach the fleet catalogue.
	const transcript = JSON.stringify({
		jsonrpc: "2.0",
		id: 2,
		result: {
			models: [
				{ modelId: "muse-spark-1.4", providerId: "meta" },
				{ modelId: "muse-spark-1.4:cloud", providerId: "meta" },
			],
		},
	});
	const ids = await discoverClaudeModels({ spawnSyncFn: fakeSpawn(transcript) });
	assert.deepEqual(ids, ["muse::meta::muse-spark-1.4", "muse::meta::muse-spark-1.4:cloud"]);
});

test("still skips rows whose segments contain the :: separator", async () => {
	const transcript = JSON.stringify({
		jsonrpc: "2.0",
		id: 2,
		result: {
			models: [
				{ modelId: "fine", providerId: "meta" },
				{ modelId: "bad::id", providerId: "meta" },
				{ modelId: "fine-too", providerId: "bad::provider" },
			],
		},
	});
	const ids = await discoverClaudeModels({ spawnSyncFn: fakeSpawn(transcript) });
	assert.deepEqual(ids, ["muse::meta::fine"]);
});

test("sends initialize, initialized, then model/list over serve stdio", async () => {
	let argv = null;
	let input = "";
	const capture = (bin, args, opts) => {
		argv = [bin, ...args];
		input = opts.input;
		return { stdout: JSON.stringify({ jsonrpc: "2.0", id: 2, result: { models: [] } }) };
	};
	await discoverClaudeModels({ spawnSyncFn: capture });
	assert.deepEqual(argv, ["muse", "serve", "--no-session-log"]);
	const lines = input.trim().split("\n").map((l) => JSON.parse(l));
	assert.equal(lines[0].method, "initialize");
	assert.equal(lines[1].method, "initialized");
	assert.equal(lines[2].method, "model/list");
});

test("spawn failure, timeout error, and unparsable output resolve to []", async () => {
	assert.deepEqual(await discoverClaudeModels({ spawnSyncFn: () => { throw new Error("no bin"); } }), []);
	assert.deepEqual(await discoverClaudeModels({ spawnSyncFn: () => ({ error: new Error("timeout") }) }), []);
	assert.deepEqual(await discoverClaudeModels({ spawnSyncFn: () => ({ stdout: "garbage\n" }) }), []);
});

test("strict mode throws MUSE_MSP_BIN_MISSING for a missing CLI", async () => {
	const enoent = Object.assign(new Error("spawn muse ENOENT"), { code: "ENOENT" });
	for (const spawnSyncFn of [
		() => { throw enoent; },
		() => ({ error: enoent }),
	]) {
		try {
			await discoverClaudeModels({ strict: true, spawnSyncFn });
			assert.fail("must throw");
		} catch (err) {
			assert.equal(err.code, "MUSE_MSP_BIN_MISSING");
			assert.match(err.message, /not found/);
			assert.match(err.hint, /KAINBAIN_MUSE_BIN/);
		}
	}
});

test("strict mode throws MUSE_MSP_TIMEOUT for a killed/timed-out child", async () => {
	const timedOut = Object.assign(new Error("spawnSync timed out"), { code: "ETIMEDOUT" });
	try {
		await discoverClaudeModels({ strict: true, spawnSyncFn: () => ({ error: timedOut, status: null, signal: "SIGTERM" }) });
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "MUSE_MSP_TIMEOUT");
		assert.match(err.message, /timed out/);
	}
});

test("strict mode throws MUSE_MSP_DISCOVERY_FAILED when model/list is never answered", async () => {
	try {
		await discoverClaudeModels({ strict: true, spawnSyncFn: () => ({ stdout: "garbage\n" }) });
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "MUSE_MSP_DISCOVERY_FAILED");
		assert.match(err.message, /did not answer model\/list/);
	}
	// A JSON-RPC error frame from the host is surfaced in the message.
	const errorFrame = JSON.stringify({ jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found" } });
	try {
		await discoverClaudeModels({ strict: true, spawnSyncFn: () => ({ stdout: `${errorFrame}\n` }) });
		assert.fail("must throw");
	} catch (err) {
		assert.equal(err.code, "MUSE_MSP_DISCOVERY_FAILED");
		assert.match(err.message, /Method not found/);
	}
});

test("strict mode still resolves [] when the CLI answers with zero rows (the leg reports MODELS_EMPTY)", async () => {
	const emptyAnswer = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { models: [] } });
	assert.deepEqual(
		await discoverClaudeModels({ strict: true, spawnSyncFn: () => ({ stdout: `${emptyAnswer}\n` }) }),
		[],
	);
});

test("pin wins by default: a pinned list is still advertised when discovery is non-empty", () => {
	assert.deepEqual(resolveAdvertisedModels({ models: ["pinned-a"] }, ["discovered-b"]), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "pinned-a" }, ["discovered-b"]), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ models: ["pinned-a"] }, []), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "pinned-a" }, []), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ models: [] }, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({}, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({ models: [] }, []), []);
	assert.deepEqual(resolveAdvertisedModels({}, undefined), []);
});

test("discovery wins only with the explicit opt-in (modelDiscoveryWins, survey q4)", () => {
	const optIn = { models: ["pinned-a"], modelDiscoveryWins: true };
	assert.deepEqual(resolveAdvertisedModels(optIn, ["discovered-b"]), ["discovered-b"]);
	assert.deepEqual(resolveAdvertisedModels(optIn, []), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "pinned-a", modelDiscoveryWins: true }, ["discovered-b"]), ["discovered-b"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "pinned-a", modelDiscoveryWins: true }, []), ["pinned-a"]);
	assert.deepEqual(resolveAdvertisedModels({ models: [], modelDiscoveryWins: true }, ["b"]), ["b"]);
});

test("resolveAdvertisedModelSource names the winning list branch-for-branch", () => {
	assert.equal(resolveAdvertisedModelSource({ models: ["a"] }, ["b"]), "pinned");
	assert.equal(resolveAdvertisedModelSource({ model: "a" }, ["b"]), "pinned");
	assert.equal(resolveAdvertisedModelSource({ models: ["a"], modelDiscoveryWins: true }, ["b"]), "discovered");
	assert.equal(resolveAdvertisedModelSource({ models: ["a"], modelDiscoveryWins: true }, []), "pinned");
	assert.equal(resolveAdvertisedModelSource({ models: [] }, ["b"]), "discovered");
	assert.equal(resolveAdvertisedModelSource({}, ["b"]), "discovered");
	assert.equal(resolveAdvertisedModelSource({ models: [] }, []), "unpinned");
	assert.equal(resolveAdvertisedModelSource({}, undefined), "unpinned");
	assert.equal(resolveAdvertisedModelSource({ model: "  " }, []), "unpinned");
});
