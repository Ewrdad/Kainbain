import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	modelKey,
	withModelKey,
	resolveModel,
	resolveModelFromRegistry,
	harnessModelKey,
	parseModelKey,
	validateModelRefShape,
	classifiesForeignHarness,
	normalizeModelRef,
	stripReasoning,
	splitReasoning,
	appendReasoning,
	checkReasoningLevelText,
	MODEL_KEY_SEP,
	HARNESS_ID_PATTERN,
	FALLBACK_MODELS,
	toPublicModel,
	createModelListCache,
	modelListCache,
	listPublicModels,
	withRunnableFlags,
	isModelRunnable,
	describeProviderAuthStatus,
	providerAuthSummary,
	getHarnessDiscoveryStatus,
	aggregateModelCatalog,
} from "./models.js";
import { clearDiscoveryCache } from "./agent/harnessDiscovery.js";

/**
 * MARK: models helper tests
 * @description Verifies provider-scoped model keys so that the same model id
 *   from different providers is not conflated by the UI switcher or backend
 *   resolver.
 */
describe("models helpers", () => {
	it("modelKey combines provider and id into a unique key", () => {
		expect(modelKey("ollama-cloud", "deepseek-v4-flash:0731-cloud")).toBe(
			"ollama-cloud::deepseek-v4-flash:0731-cloud",
		);
		expect(modelKey("ollama-cloud-direct", "deepseek-v4-flash:0731-cloud")).toBe(
			"ollama-cloud-direct::deepseek-v4-flash:0731-cloud",
		);
	});

	it("withModelKey attaches a unique key while preserving the model", () => {
		const m = withModelKey({ id: "gemma4:31b-cloud", provider: "ollama-cloud", input: ["text"] });
		expect(m.key).toBe("ollama-cloud::gemma4:31b-cloud");
		expect(m.id).toBe("gemma4:31b-cloud");
		expect(m.provider).toBe("ollama-cloud");
	});

	it("distinguishes the same id across providers", () => {
		const available = [
			withModelKey({ id: "deepseek-v4-flash:0731-cloud", provider: "ollama-cloud" }),
			withModelKey({ id: "deepseek-v4-flash:0731-cloud", provider: "ollama-cloud-direct" }),
		];
		expect(available[0].key).not.toBe(available[1].key);

		const direct = resolveModel(available, "ollama-cloud-direct::deepseek-v4-flash:0731-cloud");
		expect(direct.provider).toBe("ollama-cloud-direct");

		const cloud = resolveModel(available, "ollama-cloud::deepseek-v4-flash:0731-cloud");
		expect(cloud.provider).toBe("ollama-cloud");
	});

	it("resolveModel falls back to bare id/name for backward compatibility", () => {
		const available = [
			withModelKey({ id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", provider: "anthropic" }),
		];
		expect(resolveModel(available, "claude-3-7-sonnet")?.provider).toBe("anthropic");
		expect(resolveModel(available, "Claude 3.7 Sonnet")?.id).toBe("claude-3-7-sonnet");
		expect(resolveModel([], "claude-3-7-sonnet")).toBeNull();
		expect(resolveModel(available, "")).toBeNull();
	});

	it("exposes a printable separator distinct from model-id colons", () => {
		expect(MODEL_KEY_SEP).toBe("::");
	});

	// --- Characterization tests (harness-scoped key task): these pin TODAY's
	// behavior before any source change so the grammar refactor (parseModelKey)
	// cannot silently alter resolution order or the `::` splitting rule.
	describe("characterization: registry key splitting", () => {
		it("splits a composite key on the FIRST :: so ids containing single colons stay intact", () => {
			const runtime = {
				getModel: (provider, id) => ({ provider, id }),
			};
			// An id that itself contains a single `:` (common in pi model ids).
			const found = resolveModelFromRegistry(
				runtime,
				"ollama-cloud-direct::glm-5.3-flash:cloud",
			);
			expect(found).toEqual({
				provider: "ollama-cloud-direct",
				id: "glm-5.3-flash:cloud",
			});
		});

		it("falls back to a bare id/name scan when the registry has no such provider", () => {
			const runtime = {
				getModel: () => null,
				getModels: () => [
					{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				],
			};
			expect(
				resolveModelFromRegistry(runtime, "deepseek-v4-flash:0731-cloud"),
			).toEqual({ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" });
			expect(resolveModelFromRegistry(runtime, "no-such-model")).toBeNull();
		});
	});

	describe("characterization: resolution order", () => {
		it("prefers the exact composite key match over the first bare id/name match", () => {
			const available = [
				// Would win a bare-id scan (earlier in the list, id === full key).
				{ provider: "google", id: "ollama-cloud::x" },
				// Exact composite-key match.
				{ provider: "ollama-cloud", id: "x" },
			];
			const found = resolveModel(available, "ollama-cloud::x");
			expect(found.provider).toBe("ollama-cloud");
			expect(found.id).toBe("x");
		});

		it("falls back to the first bare id OR name match in list order", () => {
			const available = [
				{ provider: "a", id: "shared-id", name: "Shared Name" },
				{ provider: "b", id: "shared-id", name: "Shared Name" },
			];
			expect(resolveModel(available, "shared-id")?.provider).toBe("a");
			expect(resolveModel(available, "Shared Name")?.provider).toBe("a");
		});
	});

	// --- Harness-scoped key grammar (harness::provider::id) ---
	describe("parseModelKey", () => {
		it("parses the canonical 3-part form, keeping single colons inside the id", () => {
			expect(parseModelKey("pi::ollama-cloud::glm-5.3-flash:cloud")).toEqual({
				form: "harness",
				harness: "pi",
				provider: "ollama-cloud",
				id: "glm-5.3-flash:cloud",
			});
		});

		it("parses the legacy 2-part composite form", () => {
			expect(parseModelKey("ollama-cloud::deepseek-v4-flash:0731-cloud")).toEqual({
				form: "provider",
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			});
		});

		it("parses bare ids and names", () => {
			expect(parseModelKey("glm-5.3-flash:cloud")).toEqual({
				form: "bare",
				id: "glm-5.3-flash:cloud",
			});
			expect(parseModelKey("default")).toEqual({ form: "bare", id: "default" });
		});

		it("parses the canonical 4-part form with a reasoning level, keeping single colons inside the id", () => {
			expect(
				parseModelKey("pi::ollama-cloud::glm-5.3-flash:cloud::high"),
			).toEqual({
				form: "harnessReasoning",
				harness: "pi",
				provider: "ollama-cloud",
				id: "glm-5.3-flash:cloud",
				reasoning: "high",
			});
		});

		it("returns null for structurally malformed keys instead of splitting wrongly", () => {
			// Five-plus segments are malformed (the reasoning segment would
			// contain '::'); exactly four segments are the valid reasoning form.
			expect(parseModelKey("p::i::extra::more::evenmore")).toBeNull();
			// Empty segments are never valid.
			expect(parseModelKey("::id")).toBeNull();
			expect(parseModelKey("h::::id")).toBeNull();
			expect(parseModelKey("h::p::")).toBeNull();
			expect(parseModelKey("h::p::m::")).toBeNull();
			// Non-string input is not a key.
			expect(parseModelKey(undefined)).toBeNull();
			expect(parseModelKey(null)).toBeNull();
			expect(parseModelKey("")).toBeNull();
		});
	});

	describe("harnessModelKey", () => {
		it("builds harness-scoped keys with id colons preserved", () => {
			expect(harnessModelKey("pi", "ollama-cloud", "glm-5.3-flash:cloud")).toBe(
				"pi::ollama-cloud::glm-5.3-flash:cloud",
			);
		});

		it("rejects invalid harness ids and segments containing the separator", () => {
			expect(() => harnessModelKey("Bad Harness", "p", "i")).toThrow(/harness id/i);
			expect(() => harnessModelKey("", "p", "i")).toThrow(/harness id/i);
			expect(() => harnessModelKey("pi", "p::x", "i")).toThrow(/provider/i);
			expect(() => harnessModelKey("pi", "p", "i::x")).toThrow(/model id/i);
			expect(() => harnessModelKey("pi", "", "i")).toThrow(/provider/i);
		});

		it("accepts the documented lowercase harness id alphabet", () => {
			expect(HARNESS_ID_PATTERN.test("pi")).toBe(true);
			expect(HARNESS_ID_PATTERN.test("pi-local2")).toBe(true);
			expect(HARNESS_ID_PATTERN.test("Pi")).toBe(false);
			expect(HARNESS_ID_PATTERN.test("-pi")).toBe(false);
		});
	});

	describe("normalizeModelRef", () => {
		it("injects the default harness into legacy 2-part references", () => {
			expect(
				normalizeModelRef("ollama-cloud-direct::glm-5.3-flash:cloud", "pi"),
			).toBe("pi::ollama-cloud-direct::glm-5.3-flash:cloud");
		});

		it("keeps already-canonical 3-part references untouched", () => {
			expect(normalizeModelRef("pi::p::i", "pi")).toBe("pi::p::i");
			expect(normalizeModelRef("other::p::i", "pi")).toBe("other::p::i");
		});

		it("passes bare ids and sentinels through untouched", () => {
			expect(normalizeModelRef("default", "pi")).toBe("default");
			expect(normalizeModelRef("glm-5.3-flash:cloud", "pi")).toBe(
				"glm-5.3-flash:cloud",
			);
			expect(normalizeModelRef("", "pi")).toBe("");
			expect(normalizeModelRef(undefined, "pi")).toBeUndefined();
		});

		it("returns legacy references untouched when no harness is supplied", () => {
			expect(normalizeModelRef("p::i", undefined)).toBe("p::i");
		});
	});

	describe("validateModelRefShape", () => {
		it("classifies the accepted forms without a catalog", () => {
			expect(validateModelRefShape("pi::google::m")).toBe("harness");
			expect(validateModelRefShape("pi::google::m::high")).toBe(
				"harnessReasoning",
			);
			expect(validateModelRefShape("google::m")).toBe("provider");
			expect(validateModelRefShape("m")).toBe("bare");
			expect(validateModelRefShape("default")).toBe("bare");
		});

		it("rejects malformed and blank refs with null", () => {
			expect(validateModelRefShape("a::b::c::d::e")).toBeNull();
			expect(validateModelRefShape("a::b::c::")).toBeNull();
			expect(validateModelRefShape("google::")).toBeNull();
			expect(validateModelRefShape("::m")).toBeNull();
			expect(validateModelRefShape("")).toBeNull();
			expect(validateModelRefShape(undefined)).toBeNull();
		});
	});

	describe("reasoning level helpers", () => {
		it("splits and strips the 4th segment, leaving other refs untouched", () => {
			expect(splitReasoning("pi::google::m::high")).toEqual({
				baseRef: "pi::google::m",
				reasoning: "high",
			});
			expect(splitReasoning({ modelRef: "pi::google::m::high" })).toEqual({
				baseRef: "pi::google::m",
				reasoning: "high",
			});
			expect(splitReasoning({ ref: "pi::google::m::high" })).toEqual({
				baseRef: "pi::google::m",
				reasoning: "high",
			});
			expect(splitReasoning("pi::google::m")).toEqual({
				baseRef: "pi::google::m",
				reasoning: null,
			});
			expect(splitReasoning({})).toEqual({
				baseRef: "",
				reasoning: null,
			});
			expect(stripReasoning("pi::google::m::high")).toBe("pi::google::m");
			expect(stripReasoning({ modelRef: "pi::google::m::high" })).toBe(
				"pi::google::m",
			);
			expect(stripReasoning({ ref: "pi::google::m::high" })).toBe(
				"pi::google::m",
			);
			expect(stripReasoning("pi::google::m")).toBe("pi::google::m");
			expect(stripReasoning("google::m")).toBe("google::m");
		});

		it("appends or replaces the level on harness refs, refusing the rest", () => {
			expect(appendReasoning("pi::google::m", "high")).toBe(
				"pi::google::m::high",
			);
			expect(appendReasoning({ ref: "pi::google::m", level: "high" })).toBe(
				"pi::google::m::high",
			);
			expect(
				appendReasoning({ modelRef: "pi::google::m", level: "high" }),
			).toBe("pi::google::m::high");
			expect(appendReasoning("pi::google::m::low", "high")).toBe(
				"pi::google::m::high",
			);
			expect(
				appendReasoning({ ref: "pi::google::m::low", level: "high" }),
			).toBe("pi::google::m::high");
			expect(() => appendReasoning("google::m", "high")).toThrow();
			expect(() => appendReasoning("pi::google::m", " high")).toThrow();
			expect(() => appendReasoning("pi::google::m", "")).toThrow();
		});

		it("names the exact rule a level value breaks", () => {
			expect(checkReasoningLevelText({ level: "high" })).toBeNull();
			expect(checkReasoningLevelText({ level: " high" })).toContain(
				"whitespace",
			);
			expect(checkReasoningLevelText({ level: "a::b" })).toContain("::");
			expect(checkReasoningLevelText({ level: 123 })).not.toBeNull();
			expect(checkReasoningLevelText({ level: "" })).not.toBeNull();
			expect(checkReasoningLevelText({})).not.toBeNull();
			expect(checkReasoningLevelText()).not.toBeNull();
		});
	});

	describe("classifiesForeignHarness", () => {
		it("flags canonical keys naming another harness only", () => {
			expect(classifiesForeignHarness("pi::google::m", "antigravity")).toBe(true);
			expect(classifiesForeignHarness("pi::google::m::high", "antigravity")).toBe(
				true,
			);
			expect(classifiesForeignHarness("pi::google::m", "pi")).toBe(false);
			expect(classifiesForeignHarness("pi::google::m::high", "pi")).toBe(false);
			expect(classifiesForeignHarness("google::m", "antigravity")).toBe(false);
			expect(classifiesForeignHarness("m", "antigravity")).toBe(false);
			expect(classifiesForeignHarness("a::b::c::d::e", "antigravity")).toBe(false);
			expect(classifiesForeignHarness("", "antigravity")).toBe(false);
			expect(classifiesForeignHarness("pi::google::m", "")).toBe(false);
		});
	});

	describe("withModelKey harness scoping", () => {
		it("stamps the harness-scoped key and harness field when a harness is supplied", () => {
			const m = withModelKey(
				{ id: "gemma4:31b-cloud", provider: "ollama-cloud" },
				"pi",
			);
			expect(m.key).toBe("pi::ollama-cloud::gemma4:31b-cloud");
			expect(m.harness).toBe("pi");
			expect(m.id).toBe("gemma4:31b-cloud");
		});

		it("keeps the legacy 1-arg behavior (existing key respected, 2-part key)", () => {
			const m = withModelKey({ id: "m", provider: "p", key: "p::m" });
			expect(m.key).toBe("p::m");
			expect(m.harness).toBeUndefined();
			// A bare `.map(withModelKey)` callback leaking the array index in as
			// the second argument must NOT be treated as a harness id.
			const mapped = [{ id: "m", provider: "p" }].map(withModelKey);
			expect(mapped[0].key).toBe("p::m");
			expect(mapped[0].harness).toBeUndefined();
		});

		it("is non-destructive and idempotent for an already-scoped model", () => {
			const m = { id: "m", provider: "p", key: "pi::p::m", harness: "pi" };
			expect(withModelKey(m, "pi")).toBe(m);
		});
	});

	describe("resolver 3-part (harness-scoped) acceptance", () => {
		const snapshot = [
			withModelKey(
				{ id: "glm-5.3-flash:cloud", provider: "ollama-cloud-direct" },
				"pi",
			),
			withModelKey(
				{ id: "glm-5.3-flash:cloud", provider: "ollama-cloud" },
				"pi",
			),
		];

		it("resolves a canonical 3-part key by its stored key", () => {
			expect(resolveModel(snapshot, "pi::ollama-cloud-direct::glm-5.3-flash:cloud").provider).toBe(
				"ollama-cloud-direct",
			);
		});

		it("still resolves a mismatched-harness 3-part key by provider::id", () => {
			const found = resolveModel(snapshot, "future-harness::ollama-cloud::glm-5.3-flash:cloud");
			expect(found.provider).toBe("ollama-cloud");
		});

		it("still resolves legacy 2-part and bare references against harness-scoped snapshots", () => {
			expect(resolveModel(snapshot, "ollama-cloud::glm-5.3-flash:cloud").provider).toBe("ollama-cloud");
			expect(resolveModel(snapshot, "glm-5.3-flash:cloud").provider).toBe("ollama-cloud-direct");
			expect(resolveModel(snapshot, "no-such-model")).toBeNull();
		});

		it("prefers the harness-matching model when both exist", () => {
			const mixed = [
				{ id: "m", provider: "p", key: "other::p::m", harness: "other" },
				{ id: "m", provider: "p", key: "pi::p::m", harness: "pi" },
			];
			expect(resolveModel(mixed, "pi::p::m").key).toBe("pi::p::m");
			expect(resolveModel(mixed, "other::p::m").key).toBe("other::p::m");
		});

		it("resolves 3-part keys through the full registry via getModel(provider, id)", () => {
			const runtime = {
				getModel: (provider, id) => ({ provider, id, fromRegistry: true }),
			};
			expect(resolveModelFromRegistry(runtime, "pi::p::i")).toEqual({
				provider: "p",
				id: "i",
				fromRegistry: true,
			});
			// A foreign harness segment still reaches the same provider::id model.
			expect(resolveModelFromRegistry(runtime, "other::p::i")).toEqual({
				provider: "p",
				id: "i",
				fromRegistry: true,
			});
			// And a bare id still scans id/name.
			const scanning = {
				getModel: () => null,
				getModels: () => [{ provider: "p", id: "i", name: "Eye" }],
			};
			expect(resolveModelFromRegistry(scanning, "pi::p::i")).toEqual({
				provider: "p",
				id: "i",
				name: "Eye",
			});
			expect(resolveModelFromRegistry(scanning, "Eye")).toEqual({
				provider: "p",
				id: "i",
				name: "Eye",
			});
			expect(resolveModelFromRegistry(scanning, "gone")).toBeNull();
		});
	});

	// --- Public model projection, TTL cache and harness-backed listing
	// (harness-backed /compute/models + /harnesses/:id/models infrastructure).
	it("toPublicModel projects an SDK model onto the public shape and drops internals", () => {
		const sdkModel = {
			id: "gemini-2.5-pro",
			name: "Gemini 2.5 Pro",
			provider: "google",
			baseUrl: "https://generativelanguage.googleapis.com",
			api: "google-generative-ai",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 1.25, output: 10 },
			contextWindow: 1048576,
			maxTokens: 65536,
			compat: {},
		};
		const projected = toPublicModel(sdkModel);

		expect(projected).toEqual({
			key: "google::gemini-2.5-pro",
			id: "gemini-2.5-pro",
			name: "Gemini 2.5 Pro",
			provider: "google",
			contextWindow: 1048576,
			input: ["text", "image"],
		});
		// No internals leak onto the public payload.
		expect(projected.baseUrl).toBeUndefined();
		expect(projected.api).toBeUndefined();
		expect(projected.cost).toBeUndefined();
		expect(projected.maxTokens).toBeUndefined();
	});

	it("toPublicModel tolerates file-style models and falls back to id as name", () => {
		const projected = toPublicModel({ id: "gemma4:12b", provider: "ollama-cloud" });
		expect(projected.name).toBe("gemma4:12b");
		expect(projected.key).toBe("ollama-cloud::gemma4:12b");
		expect(projected).toEqual({
			id: "gemma4:12b",
			name: "gemma4:12b",
			provider: "ollama-cloud",
			contextWindow: undefined,
			input: undefined,
			key: "ollama-cloud::gemma4:12b",
		});
	});

	it("toPublicModel passes non-objects through untouched", () => {
		expect(toPublicModel(null)).toBeNull();
		expect(toPublicModel(undefined)).toBeUndefined();
		expect(toPublicModel("model")).toBe("model");
	});

	it("FALLBACK_MODELS are provider+id complete and key cleanly", () => {
		expect(FALLBACK_MODELS.length).toBeGreaterThan(0);
		for (const model of FALLBACK_MODELS) {
			expect(model.id).toBeTruthy();
			expect(model.provider).toBeTruthy();
			expect(toPublicModel(model).key).toBe(modelKey(model.provider, model.id));
		}
	});

	it("FALLBACK_MODELS are de-staled: only providers with a live registry presence", () => {
		// Task 970c0045 fallback decision: the curated fallback may only list
		// models that CAN actually run. The former google (gemini-2.5-*) and
		// anthropic (claude-3-7-sonnet) entries were removed — no configured
		// registry exposes them and no credentials exist for those providers.
		const providers = new Set(FALLBACK_MODELS.map((m) => m.provider));
		expect(providers.has("google")).toBe(false);
		expect(providers.has("anthropic")).toBe(false);
		expect(providers).toEqual(new Set(["ollama-cloud"]));
	});

	it("createModelListCache serves fresh listings within the TTL and reloads after expiry", async () => {
		let loads = 0;
		const load = vi.fn(async () => {
			loads += 1;
			return [{ id: `m${loads}`, provider: "p" }];
		});
		const cache = createModelListCache({ ttlMs: 1000 });

		const first = await cache.getOrLoad("slot", load);
		const cached = await cache.getOrLoad("slot", load);
		expect(cached).toBe(first);
		expect(loads).toBe(1);

		// A different slot caches independently.
		await cache.getOrLoad("other-slot", load);
		expect(loads).toBe(2);

		// Once evicted (expired or cleared), the next read reloads the slot.
		cache.clear("slot");
		const reloaded = await cache.getOrLoad("slot", load);
		expect(loads).toBe(3);
		expect(reloaded).not.toBe(first);
		expect(reloaded[0].id).toBe("m3");
	});

	it("createModelListCache refresh bypasses the TTL read but repopulates", async () => {
		let loads = 0;
		const load = vi.fn(async () => {
			loads += 1;
			return [{ id: `m${loads}`, provider: "p" }];
		});
		const cache = createModelListCache({ ttlMs: 60000 });

		await cache.getOrLoad("slot", load);
		const refreshed = await cache.getOrLoad("slot", load, { refresh: true });
		expect(loads).toBe(2);
		expect(refreshed[0].id).toBe("m2");

		// The refreshed listing is now the cached one.
		const again = await cache.getOrLoad("slot", load);
		expect(loads).toBe(2);
		expect(again[0].id).toBe("m2");

		// clear() with a key evicts only that slot; clear() evicts everything.
		cache.clear("slot");
		await cache.getOrLoad("slot", load);
		expect(loads).toBe(3);
		cache.clear();
		await cache.getOrLoad("other", load);
		expect(loads).toBe(4);
	});

	it("modelListCache is a process-wide shared instance with the configured TTL", () => {
		expect(typeof modelListCache.getOrLoad).toBe("function");
		expect(typeof modelListCache.clear).toBe("function");
	});

	it("listPublicModels projects harness models and keys them", async () => {
		const harness = {
			listModels: vi.fn(async () => [
				{
					id: "gemini-2.5-pro",
					name: "Gemini 2.5 Pro",
					provider: "google",
					baseUrl: "https://example.invalid",
					contextWindow: 1048576,
					input: ["text", "image"],
				},
			]),
		};

		const models = await listPublicModels({ harness });

		expect(harness.listModels).toHaveBeenCalledWith({ refresh: false });
		expect(models).toHaveLength(1);
		expect(models[0]).toEqual({
			key: "google::gemini-2.5-pro",
			id: "gemini-2.5-pro",
			name: "Gemini 2.5 Pro",
			provider: "google",
			contextWindow: 1048576,
			input: ["text", "image"],
		});
		expect(models[0].baseUrl).toBeUndefined();
	});

	it("listPublicModels falls back to the curated list when the harness yields nothing", async () => {
		const empty = await listPublicModels({ harness: { listModels: async () => [] } });
		expect(empty.length).toBeGreaterThan(0);
		expect(empty).toEqual(FALLBACK_MODELS.map(toPublicModel));

		const failing = await listPublicModels({
			harness: {
				listModels: vi.fn(async () => {
					throw new Error("harness exploded");
				}),
			},
		});
		expect(failing.length).toBeGreaterThan(0);
		expect(failing[0].key).toBeTruthy();
	});

	it("listPublicModels falls back when the harness has no listModels at all", async () => {
		const models = await listPublicModels({ harness: {} });
		expect(models.length).toBeGreaterThan(0);
		expect(models[0].key).toBeTruthy();

		const noHarness = await listPublicModels({});
		expect(noHarness.length).toBeGreaterThan(0);
	});

	it("listPublicModels forwards the refresh flag to the harness", async () => {
		const harness = { listModels: vi.fn(async () => [{ id: "m", provider: "p" }]) };
		await listPublicModels({ harness, refresh: true });
		expect(harness.listModels).toHaveBeenCalledWith({ refresh: true });
	});
});

describe("withRunnableFlags (credential-aware availability)", () => {
	const authFor = (provider) => {
		if (provider === "ollama-cloud") {
			return { configured: true, source: "models_json_key", label: "models.json" };
		}
		if (provider === "google") return { configured: false };
		if (provider === "anthropic") {
			return { configured: true, source: "stored", label: "auth.json" };
		}
		return undefined;
	};
	const runtime = {
		getAvailableSnapshot: () => [
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			{ provider: "ollama-cloud", id: "gemma4:12b" },
		],
		getProviderAuthStatus: (provider) => authFor(provider),
		getError: () => undefined,
	};

	it("marks models present in the snapshot runnable with auth details", () => {
		const models = withRunnableFlags(
			[
				withModelKey({
					id: "deepseek-v4-flash:0731-cloud",
					name: "DeepSeek",
					provider: "ollama-cloud",
					input: ["text"],
				}),
			],
			runtime,
		);
		expect(models[0]).toEqual(
			expect.objectContaining({
				runnable: true,
				authConfigured: true,
				authSource: "models_json_key",
				authLabel: "models.json",
				statusLabel: "Ready",
			}),
		);
	});

	it("matches harness-scoped public keys against the raw snapshot (both grammars)", () => {
		// The exact integration shape: listPublicModels emits harness-scoped keys
		// (pi::provider::id) while the raw availability snapshot only knows
		// provider::id. Either form matching must keep the model runnable.
		const models = withRunnableFlags(
			[
				withModelKey(
					{ id: "deepseek-v4-flash:0731-cloud", name: "DeepSeek", provider: "ollama-cloud" },
					"pi",
				),
			],
			runtime,
		);
		expect(models[0]).toEqual(
			expect.objectContaining({
				runnable: true,
				statusLabel: "Ready",
			}),
		);
		// A harness-scoped key from a DIFFERENT harness still matches by provider::id
		// (one shared pi ModelRuntime backs the snapshot).
		const otherScope = withRunnableFlags(
			[
				withModelKey(
					{ id: "gemma4:12b", provider: "ollama-cloud" },
					"future-harness",
				),
			],
			runtime,
		);
		expect(otherScope[0].runnable).toBe(true);
	});

	it("matches snapshot entries that already carry harness-scoped keys", () => {
		// harness.listModels() tags snapshot rows with harness-scoped keys; the
		// legacy provider::id form of the public model must still match them.
		const taggingRuntime = {
			...runtime,
			getAvailableSnapshot: () => [
				withModelKey(
					{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
					"pi",
				),
			],
		};
		const models = withRunnableFlags(
			[{ id: "deepseek-v4-flash:0731-cloud", provider: "ollama-cloud" }],
			taggingRuntime,
		);
		expect(models[0].runnable).toBe(true);
	});

	it("marks models with uncredentialed providers as not runnable (No credentials)", () => {
		const models = withRunnableFlags(
			[withModelKey({ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" })],
			runtime,
		);
		expect(models[0]).toEqual(
			expect.objectContaining({
				runnable: false,
				authConfigured: false,
				statusLabel: "No credentials",
			}),
		);
	});

	it("marks configured-but-unavailable providers as Unavailable", () => {
		const models = withRunnableFlags(
			[withModelKey({ id: "claude-3-7-sonnet", name: "Claude", provider: "anthropic" })],
			runtime,
		);
		expect(models[0]).toEqual(
			expect.objectContaining({
				runnable: false,
				authConfigured: true,
				authSource: "stored",
				statusLabel: "Unavailable",
			}),
		);
	});

	it("returns the input unchanged when no runtime is supplied", () => {
		const models = [{ id: "m", provider: "p" }];
		expect(withRunnableFlags(models, null)).toBe(models);
		expect(withRunnableFlags(models, undefined)).toBe(models);
	});

	it("does not mutate the input models", () => {
		const original = withModelKey({
			id: "deepseek-v4-flash:0731-cloud",
			provider: "ollama-cloud",
		});
		const snapshot = { ...original };
		const [enriched] = withRunnableFlags([original], runtime);
		expect(enriched).not.toBe(original);
		expect(original).toEqual(snapshot);
		expect(original).not.toHaveProperty("runnable");
	});

	it("tolerates runtime methods that throw or are missing", () => {
		const throwingRuntime = {
			getAvailableSnapshot: () => {
				throw new Error("boom");
			},
			getProviderAuthStatus: () => {
				throw new Error("boom");
			},
		};
		const models = withRunnableFlags(
			[withModelKey({ id: "x", provider: "p" })],
			throwingRuntime,
		);
		// Snapshot unreadable => conservative: not runnable, no auth info.
		expect(models[0].runnable).toBe(false);
		expect(models[0].authConfigured).toBeNull();
		expect(models[0].statusLabel).toBe("Unknown");

		const minimal = withRunnableFlags(
			[withModelKey({ id: "x", provider: "p" })],
			{},
		);
		expect(minimal[0].runnable).toBe(false);
		expect(minimal[0].authConfigured).toBeNull();
	});
});

describe("isModelRunnable (dispatch guard)", () => {
	const available = [
		{
			key: "ollama-cloud::deepseek-v4-flash:0731-cloud",
			provider: "ollama-cloud",
			id: "deepseek-v4-flash:0731-cloud",
		},
	];

	it("is true for a model present in the snapshot", () => {
		expect(
			isModelRunnable(available, {
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
		).toBe(true);
	});

	it("matches harness-scoped public keys against raw snapshot rows", () => {
		// harness.listModels() keys are harness-scoped; a resolved target model
		// carrying the same identity (either grammar) must be recognized.
		const harnessScoped = [
			withModelKey(
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				"pi",
			),
		];
		expect(
			isModelRunnable(harnessScoped, {
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
		).toBe(true);
		expect(
			isModelRunnable(available, {
				key: "pi::ollama-cloud::deepseek-v4-flash:0731-cloud",
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
		).toBe(true);
		expect(
			isModelRunnable(harnessScoped, {
				key: "pi::ollama-cloud::deepseek-v4-flash:0731-cloud",
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
		).toBe(true);
	});

	it("is false for a model from an uncredentialed provider", () => {
		expect(
			isModelRunnable(available, { provider: "google", id: "gemini-2.5-pro" }),
		).toBe(false);
	});

	it("is false for empty/absent snapshots or models", () => {
		expect(isModelRunnable([], { provider: "ollama-cloud", id: "x" })).toBe(false);
		expect(isModelRunnable(available, null)).toBe(false);
		expect(isModelRunnable(undefined, { provider: "p", id: "x" })).toBe(false);
	});

	it("falls back to a bare-id match for legacy models without a provider", () => {
		expect(isModelRunnable(available, { id: "deepseek-v4-flash:0731-cloud" })).toBe(true);
		expect(isModelRunnable(available, { id: "unknown" })).toBe(false);
	});
});

describe("describeProviderAuthStatus", () => {
	it("describes configured providers with their auth source", () => {
		const runtime = {
			getProviderAuthStatus: () => ({ configured: true, source: "environment", label: "KEY" }),
		};
		expect(describeProviderAuthStatus(runtime, "google")).toContain("environment");
	});

	it("reports unconfigured providers", () => {
		const runtime = { getProviderAuthStatus: () => ({ configured: false }) };
		expect(describeProviderAuthStatus(runtime, "google")).toContain("auth not configured");
	});

	it("returns an empty string when nothing is known", () => {
		expect(describeProviderAuthStatus(null, "google")).toBe("");
		expect(describeProviderAuthStatus({}, "google")).toBe("");
		expect(describeProviderAuthStatus({}, undefined)).toBe("");
	});
});

describe("providerAuthSummary", () => {
	it("aggregates per-provider auth from registry and snapshot", () => {
		const runtime = {
			getAvailableSnapshot: () => [{ provider: "ollama-cloud", id: "m1" }],
			getModels: () => [
				{ provider: "ollama-cloud", id: "m1" },
				{ provider: "google", id: "m2" },
			],
			getProviderAuthStatus: (provider) =>
				provider === "ollama-cloud"
					? { configured: true, source: "models_json_key", label: "models.json" }
					: { configured: false },
			getError: () => undefined,
		};
		const summary = providerAuthSummary(runtime);
		expect(summary.error).toBeNull();
		expect(summary.providers).toHaveLength(2);
		expect(summary.snapshotProviders).toEqual(["ollama-cloud"]);
		expect(summary.snapshotSize).toBe(1);
		expect(summary.registrySize).toBe(2);
	});

	it("exposes the availability-refresh error", () => {
		const runtime = {
			getAvailableSnapshot: () => [],
			getModels: () => [],
			getError: () => "refresh failed",
		};
		expect(providerAuthSummary(runtime).error).toBe("refresh failed");
	});

	it("returns null without a runtime", () => {
		expect(providerAuthSummary(null)).toBeNull();
		expect(providerAuthSummary(undefined)).toBeNull();
	});
});

describe("getHarnessDiscoveryStatus (optional discovery-health probe)", () => {
	const FAILURE = { code: "AGY_BIN_MISSING", message: "m", hint: "h" };

	it("returns the reported error when the harness reports a failure", async () => {
		const harness = { getModelDiscoveryStatus: () => ({ ok: false, error: FAILURE }) };
		expect(await getHarnessDiscoveryStatus(harness)).toEqual(FAILURE);
	});

	it("awaits async reporters", async () => {
		const harness = {
			getModelDiscoveryStatus: async () => ({ ok: false, error: FAILURE }),
		};
		expect(await getHarnessDiscoveryStatus(harness)).toEqual(FAILURE);
	});

	it("returns null when discovery is healthy", async () => {
		const harness = { getModelDiscoveryStatus: () => ({ ok: true }) };
		expect(await getHarnessDiscoveryStatus(harness)).toBeNull();
	});

	it("returns null for harnesses without the contract method (old shape unchanged)", async () => {
		expect(await getHarnessDiscoveryStatus({})).toBeNull();
		expect(await getHarnessDiscoveryStatus(null)).toBeNull();
		expect(await getHarnessDiscoveryStatus(undefined)).toBeNull();
	});

	it("never throws: malformed statuses and reporting failures read as healthy", async () => {
		expect(
			await getHarnessDiscoveryStatus({
				getModelDiscoveryStatus: () => ({ ok: false }),
			}),
		).toBeNull();
		expect(
			await getHarnessDiscoveryStatus({
				getModelDiscoveryStatus: () => ({ ok: false, error: { code: 42 } }),
			}),
		).toBeNull();
		expect(
			await getHarnessDiscoveryStatus({
				getModelDiscoveryStatus: () => {
					throw new Error("probe exploded");
				},
			}),
		).toBeNull();
	});
});

describe("aggregateModelCatalog", () => {
	const SAMPLE = [
		{ id: "m1", name: "M One", provider: "p1" },
		{ id: "m2", name: "M Two", provider: "p1" },
	];

	function listingHarness(id, models) {
		return {
			id,
			modelSelection: "list",
			listModels: vi.fn(async () => structuredClone(models)),
		};
	}

	function registryWith(entries) {
		return { list: () => entries };
	}

	const tmpRoots = [];
	beforeEach(() => {
		modelListCache.clear();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		clearDiscoveryCache();
		while (tmpRoots.length > 0) {
			fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
		}
	});

	it("aggregates every healthy harness (flat + per-harness view)", async () => {
		const def = listingHarness("agg-default", SAMPLE);
		const other = listingHarness("agg-other", [
			{ id: "o1", name: "O One", provider: "p2" },
		]);
		const registry = registryWith([
			{ id: "agg-default", name: "Default", harness: def },
			{ id: "agg-other", name: "Other", harness: other },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(catalog.models).toHaveLength(2);
		expect(catalog.models[0]).toMatchObject({
			harness: "agg-default",
			key: "agg-default::p1::m1",
		});
		expect(catalog.harnesses).toHaveLength(2);
		const otherEntry = catalog.harnesses.find((e) => e.id === "agg-other");
		expect(otherEntry.models).toHaveLength(1);
		expect(otherEntry.models[0].key).toBe("agg-other::p2::o1");
		expect(otherEntry.isDefault).toBe(false);
		expect(otherEntry).not.toHaveProperty("discoveryError");
	});

	it("reuses the flat list array for the default harness entry", async () => {
		const def = listingHarness("agg-reuse", SAMPLE);
		const registry = registryWith([
			{ id: "agg-reuse", name: "Default", harness: def },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(catalog.harnesses[0].models).toBe(catalog.models);
	});

	it("serves others honestly when one harness throws (never fatal)", async () => {
		const def = listingHarness("agg-t-default", SAMPLE);
		const throwing = {
			id: "agg-t-throws",
			listModels: vi.fn(async () => {
				throw new Error("harness down");
			}),
		};
		const healthy = listingHarness("agg-t-healthy", SAMPLE);
		const registry = registryWith([
			{ id: "agg-t-default", name: "Default", harness: def },
			{ id: "agg-t-throws", name: "Throws", harness: throwing },
			{ id: "agg-t-healthy", name: "Healthy", harness: healthy },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(catalog.models).toHaveLength(2);
		expect(
			catalog.harnesses.find((e) => e.id === "agg-t-throws").models,
		).toEqual([]);
		expect(
			catalog.harnesses.find((e) => e.id === "agg-t-healthy").models,
		).toHaveLength(2);
	});

	it("serves the curated fallback for an empty default, [] for the others", async () => {
		const def = listingHarness("agg-f-default", []);
		const other = listingHarness("agg-f-other", []);
		const registry = registryWith([
			{ id: "agg-f-default", name: "Default", harness: def },
			{ id: "agg-f-other", name: "Other", harness: other },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(catalog.models.length).toBe(FALLBACK_MODELS.length);
		expect(
			catalog.harnesses.find((e) => e.id === "agg-f-other").models,
		).toEqual([]);
		// The default entry reuses the fallback flat array.
		expect(
			catalog.harnesses.find((e) => e.id === "agg-f-default").models,
		).toBe(catalog.models);
	});

	it("serves [] for a catalogue-less (modelSelection none) default", async () => {
		const def = {
			id: "agg-n-default",
			modelSelection: "none",
			listModels: async () => [],
		};
		const catalog = await aggregateModelCatalog({
			registry: registryWith([
				{ id: "agg-n-default", name: "Default", harness: def },
			]),
			defaultHarness: def,
		});
		expect(catalog.models).toEqual([]);
	});

	it("treats a hanging harness as unavailable, not fatal", async () => {
		const def = listingHarness("agg-h-default", SAMPLE);
		const hanging = {
			id: "agg-h-hang",
			listModels: () => new Promise(() => {}),
		};
		const registry = registryWith([
			{ id: "agg-h-default", name: "Default", harness: def },
			{ id: "agg-h-hang", name: "Hang", harness: hanging },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
			timeoutMs: 20,
		});
		expect(
			catalog.harnesses.find((e) => e.id === "agg-h-hang").models,
		).toEqual([]);
		expect(catalog.models).toHaveLength(2);
	});

	it("skips listModels for harnesses discovery reports unavailable with a named failure", async () => {
		// Fake an empty box: no binaries anywhere, so discovery reports the
		// real 'muse' harness id unavailable.
		const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "agg-skip-"));
		tmpRoots.push(fakeHome);
		vi.stubEnv("HOME", fakeHome);
		vi.stubEnv("PATH", "");
		vi.stubEnv("OPENCODE_URL", "");
		vi.stubEnv("KAINBAIN_MUSE_BIN", "");
		clearDiscoveryCache();

		const def = listingHarness("agg-s-default", SAMPLE);
		const listModels = vi.fn(async () => SAMPLE);
		const missing = {
			id: "muse",
			listModels,
			getModelDiscoveryStatus: () => ({
				ok: false,
				error: {
					code: "MUSE_BIN_MISSING",
					message: "The muse CLI was not found.",
					hint: "Install it.",
				},
			}),
		};
		const registry = registryWith([
			{ id: "agg-s-default", name: "Default", harness: def },
			{ id: "muse", name: "Muse", harness: missing },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		const entry = catalog.harnesses.find((e) => e.id === "muse");
		expect(listModels).not.toHaveBeenCalled();
		expect(entry.models).toEqual([]);
		expect(entry.discoveryError).toMatchObject({ code: "MUSE_BIN_MISSING" });
	});

	it("still lists harnesses whose failure needs a load (specific error preserved)", async () => {
		// A cold antigravity-like catalog reports healthy (nothing loaded
		// yet) even though the binary is missing: the aggregator must run
		// the live listing so the SPECIFIC error surfaces.
		const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "agg-cold-"));
		tmpRoots.push(fakeHome);
		vi.stubEnv("HOME", fakeHome);
		vi.stubEnv("PATH", "");
		vi.stubEnv("OPENCODE_URL", "");
		vi.stubEnv("KAINBAIN_AGY_BIN", "");
		clearDiscoveryCache();

		const def = listingHarness("agg-c-default", SAMPLE);
		const listModels = vi.fn(async () => {
			throw new Error("spawn agy ENOENT");
		});
		const cold = {
			id: "antigravity",
			listModels,
			getModelDiscoveryStatus: () => ({ ok: true }),
		};
		const registry = registryWith([
			{ id: "agg-c-default", name: "Default", harness: def },
			{ id: "antigravity", name: "Agy", harness: cold },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(listModels).toHaveBeenCalled();
		expect(
			catalog.harnesses.find((e) => e.id === "antigravity").models,
		).toEqual([]);
	});

	it("degrades to an empty view without a registry", async () => {
		const def = listingHarness("agg-r-default", SAMPLE);
		const catalog = await aggregateModelCatalog({ defaultHarness: def });
		expect(catalog.harnesses).toEqual([]);
		expect(catalog.models).toHaveLength(2);
	});

	it("projects discovery availability onto each view entry (badges + hints)", async () => {
		// Fake an empty box: the real 'muse' id reports unavailable with a
		// hint; unknown fake ids report the unknown shape.
		const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "agg-avail-"));
		tmpRoots.push(fakeHome);
		vi.stubEnv("HOME", fakeHome);
		vi.stubEnv("PATH", "");
		vi.stubEnv("OPENCODE_URL", "");
		vi.stubEnv("KAINBAIN_MUSE_BIN", "");
		clearDiscoveryCache();

		const def = listingHarness("agg-v-default", SAMPLE);
		const missing = {
			id: "muse",
			listModels: async () => [],
			getModelDiscoveryStatus: () => ({ ok: true }),
		};
		const registry = registryWith([
			{ id: "agg-v-default", name: "Default", harness: def },
			{ id: "muse", name: "Muse", harness: missing },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		const museEntry = catalog.harnesses.find((e) => e.id === "muse");
		expect(museEntry.available).toBe(false);
		expect(museEntry.detectionSource).toBe("not-found");
		expect(museEntry.hint).toMatch(/KAINBAIN_MUSE_BIN/);
		const unknownEntry = catalog.harnesses.find(
			(e) => e.id === "agg-v-default",
		);
		expect(unknownEntry.available).toBeNull();
		expect(unknownEntry.detectionSource).toBe("unknown");
		expect(unknownEntry.hint).toBeUndefined();
	});

	it("carries discoveryError alongside a failing harness catalogue", async () => {
		const def = listingHarness("agg-e-default", SAMPLE);
		const failing = {
			id: "agg-e-fail",
			listModels: async () => [],
			getModelDiscoveryStatus: () => ({
				ok: false,
				error: { code: "X_DOWN", message: "m", hint: "h" },
			}),
		};
		const registry = registryWith([
			{ id: "agg-e-default", name: "Default", harness: def },
			{ id: "agg-e-fail", name: "Fail", harness: failing },
		]);
		const catalog = await aggregateModelCatalog({
			registry,
			defaultHarness: def,
		});
		expect(
			catalog.harnesses.find((e) => e.id === "agg-e-fail").discoveryError,
		).toEqual({ code: "X_DOWN", message: "m", hint: "h" });
	});
});
