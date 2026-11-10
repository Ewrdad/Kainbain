import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverClaudeModels, resolveAdvertisedModels } from "./modelDiscovery.js";

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
	assert.deepEqual(ids, ["muse::meta::muse-spark-1.3", "muse::meta::muse-wonder-1.0"]);
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

test("auto-detect wins over the pin; the pin only fills in when discovery is empty (survey q4)", () => {
	assert.deepEqual(resolveAdvertisedModels({ models: ["a"] }, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({ models: [] }, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "a" }, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({}, ["b"]), ["b"]);
	assert.deepEqual(resolveAdvertisedModels({ models: ["a"] }, []), ["a"]);
	assert.deepEqual(resolveAdvertisedModels({ model: "a" }, []), ["a"]);
	assert.deepEqual(resolveAdvertisedModels({ models: [] }, []), []);
	assert.deepEqual(resolveAdvertisedModels({}, undefined), []);
});
