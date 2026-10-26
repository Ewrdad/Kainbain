import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildHarnessRoster } from "./harnessRoster.js";
import * as barrel from "./index.js";

/***
 * MARK: harnessRoster sibling tests
 * @description Covers the crew-picker roster seam with a stubbed sessionStore
 *   and a mocked harness registry: every harness projects entries carrying
 *   { id, name, description, capabilities, modelSelection, modelFlag }, with
 *   fallback defaults when a harness omits modelSelection/modelFlag. Also pins
 *   the crew barrel re-exports.
 ***/

const harnessFakes = vi.hoisted(() => ({ current: {}, tiers: [] }));

vi.mock("../agent/harnessRegistry.js", () => ({
	createHarnessRegistry: () => {
		const entries = [];
		return {
			register: (entry) => entries.push(entry),
			get: (id) => entries.find((entry) => entry.id === id),
			list: () => [...entries],
		};
	},
	// eslint-disable-next-line security/detect-object-injection -- test double keyed by the harness name argument
	getHarnessByName: (name) => harnessFakes.current[name] ?? { id: name },
	listHarnesses: () => harnessFakes.tiers,
}));

function sessionStoreWith(harness) {
	return { getHarness: () => harness };
}

describe("buildHarnessRoster", () => {
	beforeEach(() => {
		harnessFakes.tiers = [];
	});

	it("projects one entry per harness with the discovery-view shape", () => {
		harnessFakes.current = {};
		const registry = buildHarnessRoster(
			sessionStoreWith({ id: "pi", modelSelection: "list", modelFlag: "--model" }),
		);
		const entries = registry.list();
		expect(entries.map((entry) => entry.id).sort()).toEqual(
			["antigravity", "codex", "custom", "mock", "muse", "opencode", "pi", "vibe"].sort(),
		);
		for (const entry of entries) {
			expect(typeof entry.name).toBe("string");
			expect(typeof entry.description).toBe("string");
			expect(typeof entry.capabilities).toBe("object");
			expect(typeof entry.modelSelection).toBe("string");
			expect("modelFlag" in entry).toBe(true);
		}
	});

	it("uses the sessionStore harness for the pi entry", () => {
		harnessFakes.current = {};
		const harness = { id: "pi", modelSelection: "list", modelFlag: "--model" };
		const registry = buildHarnessRoster(sessionStoreWith(harness));
		const pi = registry.get("pi");
		expect(pi.capabilities).toEqual({
			createSession: true,
			listModels: true,
			resolveModelRef: true,
			readHistoryFromDisk: true,
		});
		expect(pi.modelSelection).toBe("list");
		expect(pi.modelFlag).toBe("--model");
	});

	it("falls back to list/null when a harness omits modelSelection/modelFlag", () => {
		harnessFakes.current = {
			custom: { id: "custom" },
			antigravity: { id: "antigravity" },
			opencode: { id: "opencode" },
			muse: { id: "muse" },
		};
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		for (const id of ["custom", "antigravity", "opencode", "muse"]) {
			const entry = registry.get(id);
			expect(entry.modelSelection).toBe("list");
			expect(entry.modelFlag).toBeNull();
		}
	});

	it("carries declared none-selection through for catalogue-less harnesses", () => {
		harnessFakes.current = {
			custom: { id: "custom", modelSelection: "none", modelFlag: null },
			antigravity: { id: "antigravity" },
			opencode: { id: "opencode" },
			muse: { id: "muse", modelSelection: "none" },
		};
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		expect(registry.get("custom").modelSelection).toBe("none");
		expect(registry.get("muse").modelSelection).toBe("none");
	});

	it("marks the catalogue-less harnesses as session-capable without model catalogues", () => {
		harnessFakes.current = {};
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		expect(registry.get("custom").capabilities.listModels).toBe(false);
		// muse now serves a live catalogue on its MSP transport (`muse serve`).
		expect(registry.get("muse").capabilities.listModels).toBe(true);
		expect(registry.get("antigravity").capabilities.listModels).toBe(true);
	});

	it("projects the codex shim with honest empty-catalogue capabilities", () => {
		harnessFakes.current = {};
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		expect(registry.get("codex")).toMatchObject({
			name: "Codex",
			modelSelection: "list",
			modelFlag: null,
			capabilities: {
				createSession: true,
				listModels: true,
				resolveModelRef: true,
				readHistoryFromDisk: true,
			},
		});
	});

	it("projects the mock harness last with full session + catalog capabilities", () => {
		harnessFakes.current = {};
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		const entries = registry.list();
		expect(entries.at(-1).id).toBe("mock");
		expect(registry.get("mock")).toMatchObject({
			name: "Mock",
			modelSelection: "list",
			modelFlag: null,
			capabilities: {
				createSession: true,
				listModels: true,
				resolveModelRef: true,
				readHistoryFromDisk: true,
			},
		});
	});

	it("copies the support-tier projection from the construction registry onto every view entry", () => {
		harnessFakes.current = {};
		harnessFakes.tiers = [
			{
				name: "pi",
				supportTier: "1",
				supportTierLabel: "Tier 1",
				supportTierSummary: "Direct integration in KainBain",
				testOnly: false,
			},
			{
				name: "mock",
				supportTier: "1",
				supportTierLabel: "Tier 1",
				supportTierSummary: "Direct integration in KainBain",
				testOnly: true,
			},
		];
		const registry = buildHarnessRoster(sessionStoreWith({ id: "pi" }));
		expect(registry.get("pi")).toMatchObject({
			supportTier: "1",
			supportTierLabel: "Tier 1",
			supportTierSummary: "Direct integration in KainBain",
			testOnly: false,
		});
		// The test-only flag rides through so the UI can mark the mock harness.
		expect(registry.get("mock")).toMatchObject({ testOnly: true });
		// A harness with no construction-registry tier degrades to an honest
		// unlabelled view rather than a fabricated tier.
		expect(registry.get("muse").supportTier).toBeUndefined();
	});
});

describe("crew barrel", () => {
	it("re-exports the crew surface", () => {
		for (const key of [
			"hasSessionCapability",
			"guardSessionCapability",
			"buildHarnessRoster",
			"clearModelsCache",
			"getAvailableModels",
			"harnessesView",
			"listHarnessModelsWithTimeout",
		]) {
			// eslint-disable-next-line security/detect-object-injection -- test keys are literals from the export list above
			expect(typeof barrel[key]).toBe("function");
		}
	});
});
