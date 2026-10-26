import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
	createVibeModelCatalog,
	parseVibeConfigModels,
	unparseableVibeModelsError,
} from "./vibeModelCatalog.js";

/**
 * MARK: vibeModelCatalog tests
 * @description The accurate live model list over the ACP transport, driven
 *   against the generic mock ACP agent (no real vibe install, no network,
 *   no LLM call): discovery parses the `configOptions` model select, the
 *   catalog contract holds (listModels, resolveModelRef across all three
 *   reference forms, cache/TTL, clearCache, discovery status), and
 *   failures classify with the vibe ACP vocabulary.
 */

const MOCK_ACP_AGENT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"acp",
	"fixtures",
	"mock-acp-agent.mjs",
);

const REALISTIC_CONFIG_OPTIONS = [
	{
		id: "mode",
		name: "Session Mode",
		category: "mode",
		type: "select",
		currentValue: "accept-edits",
		options: [{ value: "auto-approve", name: "Auto Approve" }],
	},
	{
		id: "model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue: "glm-5-3",
		options: [
			{ value: "mistral-medium-3.5", name: "Mistral Medium 3.5", description: "mistral-vibe-cli-latest" },
			{ value: "glm-5-3", name: "GLM-5.3 (Mistral Hosted)", description: "zai-glm-5-3" },
		],
	},
];

describe("parseVibeConfigModels (pure parsing)", () => {
	it("maps the model select's options to provider-tagged models", () => {
		const models = parseVibeConfigModels(REALISTIC_CONFIG_OPTIONS);
		expect(models).toHaveLength(2);
		expect(models[0]).toMatchObject({
			provider: "mistral",
			id: "mistral-medium-3.5",
			name: "Mistral Medium 3.5",
			key: "vibe::mistral::mistral-medium-3.5",
			harness: "vibe",
		});
		expect(models[1]).toMatchObject({ id: "glm-5-3", name: "GLM-5.3 (Mistral Hosted)" });
	});

	it("skips non-model selects, malformed entries, and missing arrays", () => {
		expect(parseVibeConfigModels(undefined)).toEqual([]);
		expect(parseVibeConfigModels([{ id: "mode", options: [{ value: "auto-approve" }] }])).toEqual([]);
		expect(
			parseVibeConfigModels([{ category: "model", options: [{ name: "no value" }] }]),
		).toEqual([]);
	});

	it("falls back to the option value as the name when the agent omits it", () => {
		const [model] = parseVibeConfigModels([
			{ category: "model", options: [{ value: "bare-model" }] },
		]);
		expect(model).toMatchObject({ id: "bare-model", name: "bare-model" });
	});
});

describe("createVibeModelCatalog (contract over the mock ACP agent)", () => {
	function makeMockCatalog(overrides = {}) {
		return createVibeModelCatalog({
			endpoint: { command: MOCK_ACP_AGENT, args: [], mode: "override" },
			startTimeoutMs: 10000,
			ttlMs: 60000,
			...overrides,
		});
	}

	it("discovers the mock's model select and resolves all three reference forms", async () => {
		const catalog = makeMockCatalog();
		const models = await catalog.listModels();
		expect(models.map((m) => m.id).sort()).toEqual(["mock-model-a", "mock-model-b"]);
		expect(models[0]).toMatchObject({ provider: "mistral", harness: "vibe" });
		// Canonical, legacy, and bare refs all resolve to the same model.
		expect(await catalog.resolveModelRef("vibe::mistral::mock-model-b")).toMatchObject({
			id: "mock-model-b",
		});
		expect(await catalog.resolveModelRef("mistral::mock-model-b")).toMatchObject({
			id: "mock-model-b",
		});
		expect(await catalog.resolveModelRef("mock-model-b")).toMatchObject({
			id: "mock-model-b",
		});
		expect(await catalog.resolveModelRef("no-such-model")).toBeNull();
	});

	it("caches for the TTL (one spawn), and clearCache forces a re-probe", async () => {
		let probes = 0;
		const catalog = createVibeModelCatalog({
			ttlMs: 60000,
			discoverModels: async () => {
				probes += 1;
				return parseVibeConfigModels(REALISTIC_CONFIG_OPTIONS);
			},
		});
		await catalog.listModels();
		await catalog.listModels();
		expect(probes).toBe(1);
		expect(catalog.cachedModels()).toHaveLength(2);
		catalog.clearCache();
		expect(catalog.cachedModels()).toBeNull();
		await catalog.listModels();
		expect(probes).toBe(2);
	});

	it("expires the cache after the TTL (wall-clock via injected discovery counts)", async () => {
		let probes = 0;
		const catalog = createVibeModelCatalog({
			ttlMs: 0,
			discoverModels: async () => {
				probes += 1;
				return parseVibeConfigModels(REALISTIC_CONFIG_OPTIONS);
			},
		});
		await catalog.listModels();
		await catalog.listModels();
		expect(probes).toBe(2);
	});

	it("is concurrency-safe (one in-flight probe for parallel callers)", async () => {
		let probes = 0;
		const catalog = createVibeModelCatalog({
			ttlMs: 60000,
			discoverModels: async () => {
				probes += 1;
				return parseVibeConfigModels(REALISTIC_CONFIG_OPTIONS);
			},
		});
		await Promise.all([catalog.listModels(), catalog.listModels(), catalog.listModels()]);
		expect(probes).toBe(1);
	});

	it("classifies a missing ACP binary with the vibe ACP vocabulary", async () => {
		const catalog = createVibeModelCatalog({
			endpoint: { command: "/nonexistent/vibe-acp-xyz", args: [], mode: "override" },
			startTimeoutMs: 2000,
		});
		expect(await catalog.listModels()).toEqual([]);
		const status = catalog.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("VIBE_ACP_BIN_MISSING");
		expect(status.error.hint).toContain("KAINBAIN_VIBE_ACP=off");
	});

	it("reports the unparseable error when the agent ships no model select", async () => {
		const catalog = createVibeModelCatalog({
			ttlMs: 60000,
			discoverModels: async () => parseVibeConfigModels([]),
		});
		expect(await catalog.listModels()).toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "VIBE_MODELS_UNPARSEABLE",
		});
	});

	it("clears the retained error after a successful re-probe", async () => {
		let fail = true;
		const catalog = createVibeModelCatalog({
			ttlMs: 60000,
			discoverModels: async () => {
				if (fail) throw new Error("spawn vibe-acp ENOENT");
				return parseVibeConfigModels(REALISTIC_CONFIG_OPTIONS);
			},
		});
		await catalog.listModels();
		expect(catalog.getModelDiscoveryStatus().ok).toBe(false);
		fail = false;
		catalog.clearCache();
		await catalog.listModels();
		expect(catalog.getModelDiscoveryStatus()).toEqual({ ok: true });
		expect(catalog.lastDiscoveryError()).toBeNull();
	});

	it("spawns the agent on a THROWAWAY cwd and disposes it (no project state touched)", async () => {
		/* eslint-disable security/detect-non-literal-fs-filename -- the scanned dir is a private test temp root, not user input */
		const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-catalog-test-"));
		try {
			const catalog = makeMockCatalog({ tempDir: privateRoot });
			await catalog.listModels();
			// Discovery cleans the throwaway workspace before settling, but the ACP
			// child may take a tick to release its cwd; poll briefly so OS timing
			// cannot turn cleanup into a false-positive leftover. Scanning only the
			// test's own private root guarantees parallel workers cannot produce
			// false leftovers.
			let remaining = [];
			const deadline = Date.now() + 1000;
			while (Date.now() < deadline) {
				remaining = fs.readdirSync(privateRoot);
				if (remaining.length === 0) break;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(remaining).toEqual([]);
		} finally {
			fs.rmSync(privateRoot, { recursive: true, force: true });
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	});

	it("cleans the throwaway cwd even when spawn setup fails", async () => {
		/* eslint-disable security/detect-non-literal-fs-filename -- the scanned dir is a private test temp root, not user input */
		const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-catalog-test-"));
		try {
			const catalog = createVibeModelCatalog({
				endpoint: { command: "/nonexistent/vibe-acp-xyz", args: [], mode: "override" },
				startTimeoutMs: 2000,
				tempDir: privateRoot,
			});
			expect(await catalog.listModels()).toEqual([]);
			const status = catalog.getModelDiscoveryStatus();
			expect(status.ok).toBe(false);
			expect(status.error.code).toBe("VIBE_ACP_BIN_MISSING");

			let remaining = [];
			const deadline = Date.now() + 1000;
			while (Date.now() < deadline) {
				remaining = fs.readdirSync(privateRoot);
				if (remaining.length === 0) break;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(remaining).toEqual([]);
		} finally {
			fs.rmSync(privateRoot, { recursive: true, force: true });
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	});
});
