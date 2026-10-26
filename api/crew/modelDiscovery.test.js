import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	clearModelsCache,
	getAvailableModels,
	harnessesView,
	listHarnessModelsWithTimeout,
} from "./modelDiscovery.js";

/***
 * MARK: modelDiscovery sibling tests
 * @description Covers the crew model-discovery seam: curated fallback
 *   semantics, honest-empty listings, TTL-cache bypass/refresh isolation, the
 *   per-harness timeout race, and the harnessesView projection. Every test
 *   starts from an empty shared `modelListCache` (D3) and uses distinct
 *   harness ids so slots never collide.
 ***/

function listingHarness(id, models, { calls } = {}) {
	return {
		id,
		listModels: vi.fn(async () => {
			if (calls) calls.count++;
			return structuredClone(models);
		}),
	};
}

const SAMPLE = [
	{ id: "m1", name: "M One", provider: "google" },
	{ id: "m2", name: "M Two", provider: "ollama" },
];

beforeEach(() => {
	clearModelsCache();
});

describe("getAvailableModels", () => {
	it("projects the harness listing with harness-scoped keys", async () => {
		const harness = listingHarness("md-keys", SAMPLE);
		const models = await getAvailableModels({ harness });
		expect(models).toHaveLength(2);
		expect(models[0]).toMatchObject({ id: "m1", harness: "md-keys" });
		expect(models[0].key).toContain("md-keys::");
	});

	it("serves the curated fallback when the harness yields nothing", async () => {
		const models = await getAvailableModels({
			harness: listingHarness("md-empty", []),
		});
		expect(models.length).toBeGreaterThan(0);
	});

	it("serves the fallback when the harness has no listModels", async () => {
		const models = await getAvailableModels({ harness: { id: "md-nolist" } });
		expect(models.length).toBeGreaterThan(0);
	});

	it("serves the fallback when listModels throws", async () => {
		const harness = {
			id: "md-throws",
			listModels: async () => {
				throw new Error("harness down");
			},
		};
		const models = await getAvailableModels({ harness });
		expect(models.length).toBeGreaterThan(0);
	});

	it("returns an honest empty list with fallbackWhenEmpty:false", async () => {
		const models = await getAvailableModels({
			harness: listingHarness("md-honest", []),
			fallbackWhenEmpty: false,
		});
		expect(models).toEqual([]);
	});

	it("caches the listing within the TTL (loader runs once)", async () => {
		const calls = { count: 0 };
		const harness = listingHarness("md-cache", SAMPLE, { calls });
		await getAvailableModels({ harness });
		await getAvailableModels({ harness });
		expect(harness.listModels).toHaveBeenCalledTimes(1);
		expect(calls.count).toBe(1);
	});

	it("refresh:true bypasses the cache and repopulates it", async () => {
		const harness = listingHarness("md-refresh", SAMPLE);
		await getAvailableModels({ harness });
		await getAvailableModels({ harness, refresh: true });
		expect(harness.listModels).toHaveBeenCalledTimes(2);
		// The refreshed listing is cached again.
		await getAvailableModels({ harness });
		expect(harness.listModels).toHaveBeenCalledTimes(2);
	});

	it("clearModelsCache forces the next call to reload", async () => {
		const harness = listingHarness("md-clear", SAMPLE);
		await getAvailableModels({ harness });
		clearModelsCache();
		await getAvailableModels({ harness });
		expect(harness.listModels).toHaveBeenCalledTimes(2);
	});
});

describe("listHarnessModelsWithTimeout", () => {
	it("returns the listing when the harness answers in time", async () => {
		const models = await listHarnessModelsWithTimeout(
			listingHarness("md-fast", SAMPLE),
			{ timeoutMs: 1000 },
		);
		expect(models).toHaveLength(2);
	});

	it("serves an honest [] when the harness hangs past the budget", async () => {
		const hanging = {
			id: "md-hang",
			listModels: () => new Promise(() => {}),
		};
		const models = await listHarnessModelsWithTimeout(hanging, {
			timeoutMs: 20,
		});
		expect(models).toEqual([]);
	});
});

describe("harnessesView", () => {
	const defaultHarness = { id: "md-default", listModels: async () => SAMPLE };

	function registryWith(entries) {
		return { list: () => entries };
	}

	it("returns [] without a registry", async () => {
		await expect(harnessesView({})).resolves.toEqual([]);
		await expect(harnessesView({ registry: {} })).resolves.toEqual([]);
	});

	it("reuses the flat list array for the default harness entry", async () => {
		const models = [{ id: "m1", harness: "md-default" }];
		const registry = registryWith([
			{
				id: "md-default",
				name: "Default",
				description: "d",
				modelSelection: "list",
				modelFlag: "--model",
				harness: defaultHarness,
			},
		]);
		const view = await harnessesView({ registry, defaultHarness, models });
		expect(view).toHaveLength(1);
		expect(view[0]).toMatchObject({
			id: "md-default",
			label: "Default",
			description: "d",
			modelSelection: "list",
			modelFlag: "--model",
			isDefault: true,
		});
		expect(view[0].models).toBe(models);
	});

	it("lists non-default harnesses honestly (empty, never fallback)", async () => {
		const other = listingHarness("md-other", []);
		const registry = registryWith([
			{
				id: "md-default",
				name: "Default",
				harness: defaultHarness,
			},
			{ id: "md-other", name: "Other", harness: other },
		]);
		const view = await harnessesView({
			registry,
			defaultHarness,
			models: [{ id: "m1" }],
		});
		const otherEntry = view.find((e) => e.id === "md-other");
		expect(otherEntry.models).toEqual([]);
		expect(otherEntry.isDefault).toBe(false);
	});

	it("flags supportsDiagnosis only for harnesses with a diagnosis factory", async () => {
		const withDiag = {
			id: "md-diag",
			listModels: async () => [],
			createDiagnosisSession: () => ({}),
		};
		const registry = registryWith([
			{ id: "md-diag", name: "Diag", harness: withDiag },
		]);
		const view = await harnessesView({ registry, defaultHarness, models: [] });
		expect(view[0].supportsDiagnosis).toBe(true);

		const plain = registryWith([{ id: "md-plain", name: "P", harness: null }]);
		const view2 = await harnessesView({
			registry: plain,
			defaultHarness,
			models: [],
		});
		expect(view2[0].supportsDiagnosis).toBe(false);
	});
});
