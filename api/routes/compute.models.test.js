import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const FALLBACK_IDS = new Set(FALLBACK_MODELS.map((m) => m.id));

/**
 * MARK: /compute/models harness-backed endpoint tests
 * @description Verifies that `GET /compute/models` resolves its model list
 *   through the DEFAULT harness's `listModels()` contract method (the same
 *   source of truth sessions resolve models against), projects every model
 *   onto the stable public shape (no SDK internals leak) with a
 *   HARNESS-SCOPED key (`harness::provider::id`, plus a `harness` field — the
 *   canonical identity since model keys became harness-scoped), keeps the
 *   curated fallback for empty/failing harnesses, preserves the TTL-cache +
 *   `refresh=true` semantics (network-free), and still resolves every legacy
 *   reference form (2-part `provider::id`, bare id/name) against the served
 *   snapshot. The route wiring is authentic — the real Fastify app from
 *   `index.js` with the real pi harness — and only the pi SDK (the agent
 *   layer) is mocked with a controllable ModelRuntime.
 */

const modelRuntimeMock = vi.hoisted(() => {
	const runtime = {
		snapshot: [],
		// Per-provider credential status read by the /compute/models enrichment
		// (withRunnableFlags/providerAuthSummary); keyed by provider id.
		authStatus: {},
		// Availability-refresh error surfaced by the enrichment auth summary.
		error: null,
		getAvailableSnapshot: () => [...runtime.snapshot],
		refresh: vi.fn(async () => ({ aborted: false, errors: new Map() })),
		getModels: vi.fn(() => []),
		getModel: vi.fn(() => null),
		getProviderAuthStatus: (provider) => {
			if (typeof provider !== "string") return undefined;
			/* eslint-disable-next-line security/detect-object-injection -- provider keys are test-controlled literals, never user input */
			return runtime.authStatus[provider];
		},
		getError: () => runtime.error,
	};
	return runtime;
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
	ModelRuntime: { create: vi.fn(async () => modelRuntimeMock) },
	SessionManager: {
		create: vi.fn(() => ({ entries: [], getEntries: () => [] })),
	},
	createAgentSession: vi.fn(async () => ({
		session: {
			messages: [],
			isStreaming: false,
			subscribe: () => () => {},
			dispose: () => {},
		},
	})),
}));

vi.mock("../eventBridge.js", () => ({
	eventBridge: { emitSystemLog: vi.fn(), clearSession: vi.fn() },
}));

import app from "../index.js";
import {
	clearModelsCache,
	harnessesView,
	listHarnessModelsWithTimeout,
} from "./compute.js";
import {
	FALLBACK_MODELS,
	toPublicModel,
	resolveModel,
	withRunnableFlags,
} from "../models.js";

const SDK_MODELS = [
	{
		id: "gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		provider: "google",
		baseUrl: "https://generativelanguage.googleapis.com",
		api: "google-generative-ai",
		input: ["text", "image"],
		cost: { input: 1.25, output: 10 },
		contextWindow: 1048576,
		maxTokens: 65536,
	},
	{
		id: "glm-5.3-flash:cloud",
		name: "GLM 5.3 Flash (Cloud)",
		provider: "ollama-cloud-direct",
		baseUrl: "http://litellm.home",
		input: ["text"],
		contextWindow: 200000,
	},
];

async function getModels(refresh = false) {
	const res = await app.inject({
		method: "GET",
		url: `/compute/models${refresh ? "?refresh=true" : ""}`,
	});
	expect(res.statusCode).toBe(200);
	return JSON.parse(res.payload).models;
}

describe("GET /compute/models (harness-backed)", () => {
	beforeAll(async () => {
		await app.ready();
	});

	beforeEach(() => {
		clearModelsCache();
		modelRuntimeMock.snapshot = [];
		modelRuntimeMock.authStatus = {};
		modelRuntimeMock.error = null;
		modelRuntimeMock.refresh = vi.fn(async () => ({
			aborted: false,
			errors: new Map(),
		}));
	});

	it("returns the harness snapshot models projected onto the stable public shape with harness-scoped keys (T1)", async () => {
		modelRuntimeMock.snapshot = SDK_MODELS;

		const models = await getModels(true);

		expect(models).toHaveLength(2);
		const [gemini, glm] = models;
		// Snapshot membership ⇒ runnable; with no auth status configured the
		// enrichment carries null auth details and still says "Ready" (the
		// snapshot only contains providers with VALID credentials).
		expect(gemini).toEqual({
			key: "pi::google::gemini-2.5-pro",
			harness: "pi",
			id: "gemini-2.5-pro",
			name: "Gemini 2.5 Pro",
			provider: "google",
			contextWindow: 1048576,
			input: ["text", "image"],
			runnable: true,
			authConfigured: null,
			authSource: null,
			authLabel: null,
			statusLabel: "Ready",
		});
		// Harness-scoped keys, even when ids repeat across providers, and ids
		// containing single colons stay intact after the key round-trip.
		expect(glm.key).toBe("pi::ollama-cloud-direct::glm-5.3-flash:cloud");
		expect(glm.harness).toBe("pi");
		// No SDK internals leak onto the public payload.
		for (const model of models) {
			expect(model.baseUrl).toBeUndefined();
			expect(model.api).toBeUndefined();
			expect(model.cost).toBeUndefined();
			expect(model.maxTokens).toBeUndefined();
		}
	});

	it("serves the harness as the source of truth, not the curated fallback (T2)", async () => {
		modelRuntimeMock.snapshot = SDK_MODELS;
		const models = await getModels(true);

		// The served catalogue is the harness listing plus the credential-aware
		// enrichment layer (withRunnableFlags over the shared runtime).
		expect(models).toEqual(
			withRunnableFlags(SDK_MODELS.map((m) => toPublicModel(m, "pi")), modelRuntimeMock),
		);
		// FALLBACK entries (none exist on the de-staled curated list) must not
		// appear when the harness serves real models.
		expect(models.some((m) => m.provider === "anthropic")).toBe(false);
	});

	it("falls back to the curated list when the harness yields nothing or throws (T3)", async () => {
		// Empty availability snapshot → curated fallback, still keyed, honestly
		// flagged (empty snapshot ⇒ not runnable; no auth status ⇒ "Unknown").
		modelRuntimeMock.snapshot = [];
		let models = await getModels(true);
		expect(models).toEqual(
			withRunnableFlags(FALLBACK_MODELS.map((m) => toPublicModel(m, "pi")), modelRuntimeMock),
		);
		expect(models.every((m) => m.runnable === false)).toBe(true);
		expect(models.every((m) => m.statusLabel === "Unknown")).toBe(true);
		expect(models.length).toBeGreaterThan(0);
		expect(models.every((m) => m.key && m.id && m.provider)).toBe(true);
		// Fallback keys are harness-scoped too (the harness owns the listing).
		expect(models.every((m) => m.harness === "pi")).toBe(true);

		// A failing snapshot read → same curated fallback (endpoint never 500s).
		modelRuntimeMock.getAvailableSnapshot = () => {
			throw new Error("snapshot exploded");
		};
		models = await getModels(true);
		expect(models).toEqual(
			withRunnableFlags(FALLBACK_MODELS.map((m) => toPublicModel(m, "pi")), modelRuntimeMock),
		);
		modelRuntimeMock.getAvailableSnapshot = () => [...modelRuntimeMock.snapshot];
	});

	it("caches within the TTL, and refresh=true bypasses the cache and refreshes network-free (T4)", async () => {
		modelRuntimeMock.snapshot = SDK_MODELS;
		const snapshotReader = vi.fn(() => [...modelRuntimeMock.snapshot]);
		modelRuntimeMock.getAvailableSnapshot = snapshotReader;

		// First call loads and caches (a fresh listing reads the snapshot for the
		// listing itself AND for the enrichment layer + auth summary); the
		// immediate second call is a cache hit — the LISTING is not re-read, only
		// the per-request enrichment re-reads, so the count grows sub-linearly.
		await getModels();
		const freshReads = snapshotReader.mock.calls.length;
		expect(freshReads).toBeGreaterThanOrEqual(1);
		await getModels();
		const cachedReads = snapshotReader.mock.calls.length;
		expect(cachedReads).toBeGreaterThan(freshReads);
		expect(cachedReads).toBeLessThan(freshReads * 2);

		// refresh=true bypasses the cache AND refreshes the snapshot from disk
		// (never over the network — request paths must not block on catalogs):
		// a full listing happens again.
		await getModels(true);
		expect(snapshotReader.mock.calls.length).toBeGreaterThanOrEqual(freshReads * 2);
		expect(modelRuntimeMock.refresh).toHaveBeenCalledWith({
			allowNetwork: false,
		});
	});

	// --- Harness-scoped key acceptance: every stored reference form still
	// resolves against the served (harness-scoped) snapshot.
	it("resolves every legacy reference form against the harness-scoped snapshot (T5)", async () => {
		modelRuntimeMock.snapshot = SDK_MODELS;
		const models = await getModels(true);
		const target = models[1]; // glm-5.3-flash:cloud — an id containing ':'

		// Canonical 3-part key…
		expect(resolveModel(models, target.key)).toBe(target);
		// …legacy 2-part key (as stored before this change)…
		expect(resolveModel(models, `${target.provider}::${target.id}`)).toBe(
			target,
		);
		// …and bare id (oldest form).
		expect(resolveModel(models, target.id)).toBe(target);

		// Keys are unique across models, so no conflation is possible.
		const keys = new Set(models.map((m) => m.key));
		expect(keys.size).toBe(models.length);
	});

	// --- Additive harness view: the same catalogue described per harness
	// (harness-first model selector). The schema must declare it — Fastify
	// strips undeclared response fields.
	it("additively serves the harness view of the catalogue (harness-first selector)", async () => {
		modelRuntimeMock.snapshot = SDK_MODELS;
		const res = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);

		expect(Array.isArray(body.harnesses)).toBe(true);
		expect(body.harnesses).toHaveLength(8);
		expect(body.harnesses[0].id).toBe("pi");
		expect(body.harnesses[0].label).toBe("pi coding agent");
		expect(typeof body.harnesses[0].description).toBe("string");
		expect(body.harnesses[0].description.length).toBeGreaterThan(0);
		// The default harness's entry reuses the flat catalogue: one listing,
		// two views (flat + per-harness) of the same payload.
		expect(body.harnesses[0].models).toEqual(body.models);
		expect(body.harnesses[0].modelSelection).toBe("list");
		expect(body.harnesses[0].isDefault).toBe(true);
		// The custom-command harness is discoverable but takes NO model
		// selection: it honestly serves [] (never the curated fallback) and
		// declares "none" so the UI hides the model control.
		expect(body.harnesses[1].id).toBe("custom");
		expect(body.harnesses[1].label).toBe("Custom command");
		expect(typeof body.harnesses[1].description).toBe("string");
		expect(body.harnesses[1].description.length).toBeGreaterThan(0);
		expect(body.harnesses[1].modelSelection).toBe("none");
		expect(body.harnesses[1].modelFlag).toBeNull();
		expect(body.harnesses[1].isDefault).toBe(false);
		expect(body.harnesses[1].models).toEqual([]);
		// Antigravity and OpenCode are discoverable in the same view — and
		// neither may serve the curated fallback (only the default harness
		// gets it): every served model must be that harness's own listing.
		// Muse is discoverable too, with no model selection (honest []).
		expect(body.harnesses[4].id).toBe("muse");
		expect(body.harnesses[4].modelSelection).toBe("none");
		expect(body.harnesses[4].isDefault).toBe(false);
		expect(body.harnesses[4].models).toEqual([]);
		// Vibe is discoverable too — Tier 2 ACP transport, modelSelection
		// "list" with its live vibe-acp catalogue. This suite pins the vibe
		// transport to exec via isolatedTestRoots (hermetic — never spawns the
		// host's real vibe-acp), so the honest catalogue here is [].
		expect(body.harnesses[5].id).toBe("vibe");
		expect(body.harnesses[5].modelSelection).toBe("list");
		expect(body.harnesses[5].isDefault).toBe(false);
		// Codex is discoverable too — Tier 2 theoretical shim, modelSelection
		// "list" over the honestly empty catalogue (never the curated
		// fallback).
		expect(body.harnesses[6].id).toBe("codex");
		expect(body.harnesses[6].modelSelection).toBe("list");
		expect(body.harnesses[6].isDefault).toBe(false);
		expect(body.harnesses[6].models).toEqual([]);
		for (const entry of [body.harnesses[2], body.harnesses[3], body.harnesses[5], body.harnesses[6]]) {
			expect(entry.modelSelection).toBe("list");
			expect(Array.isArray(entry.models)).toBe(true);
			for (const model of entry.models) {
				expect(model.harness).toBe(entry.id);
				expect(model.key.startsWith(`${entry.id}::`)).toBe(true);
				expect(FALLBACK_IDS.has(model.id)).toBe(false);
			}
		}
		// The mock harness is projected last with its honest synthetic
		// catalogue (harness-scoped keys, never the curated fallback).
		expect(body.harnesses[7].id).toBe("mock");
		expect(body.harnesses[7].label).toBe("Mock");
		expect(body.harnesses[7].modelSelection).toBe("list");
		expect(body.harnesses[7].isDefault).toBe(false);
		expect(body.harnesses[7].models).toEqual([
			expect.objectContaining({
				key: "mock::mock::echo-v1",
				harness: "mock",
				id: "echo-v1",
				provider: "mock",
			}),
		]);
		// Every entry carries the additive availability projection (same
		// discovery source as GET /harnesses) for picker badges + hints.
		for (const entry of body.harnesses) {
			expect([true, false, null]).toContain(entry.available);
			expect(typeof entry.detectionSource).toBe("string");
			if (entry.hint !== undefined) {
				expect(typeof entry.hint).toBe("string");
			}
		}
		expect(
			body.harnesses.find((e) => e.id === "mock"),
		).toMatchObject({ available: true, detectionSource: "builtin" });
	});
});
describe("listHarnessModelsWithTimeout (slow-harness tail latency)", () => {
	it("serves [] for a hanging harness instead of stalling the catalogue", async () => {
		clearModelsCache();
		const hanging = {
			id: "hanging-test-harness",
			listModels: () => new Promise(() => {}), // never settles
		};
		const started = Date.now();
		const models = await listHarnessModelsWithTimeout(hanging, {
			refresh: true,
			timeoutMs: 50,
		});
		expect(models).toEqual([]);
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it("harnessesView keeps the default catalogue while a slow harness times out", async () => {
		clearModelsCache();
		const defaultHarness = {
			id: "default-test-harness",
			listModels: async () => [],
		};
		const slow = {
			id: "slow-test-harness",
			listModels: () => new Promise(() => {}), // never settles
		};
		const registry = {
			list: () => [
				{ id: "default-test-harness", name: "Default", harness: defaultHarness },
				{ id: "slow-test-harness", name: "Slow", harness: slow },
			],
		};
		const flat = [{ key: "default-test-harness::p::m1" }];
		const started = Date.now();
		const view = await harnessesView({
			registry,
			defaultHarness,
			models: flat,
			refresh: true,
			timeoutMs: 50,
		});
		expect(Date.now() - started).toBeLessThan(2000);
		expect(view.find((e) => e.id === "default-test-harness").models).toEqual(flat);
		expect(view.find((e) => e.id === "slow-test-harness").models).toEqual([]);
	});

	it("harnessesView carries discoveryError for harnesses that report a discovery failure", async () => {
		clearModelsCache();
		const failure = {
			code: "AGY_BIN_MISSING",
			message: "The agy CLI was not found.",
			hint: "Install it.",
		};
		const defaultHarness = {
			id: "default-test-harness",
			listModels: async () => [],
		};
		const failing = {
			id: "failing-test-harness",
			listModels: async () => [],
			getModelDiscoveryStatus: () => ({ ok: false, error: failure }),
		};
		const healthy = {
			id: "healthy-test-harness",
			listModels: async () => [{ key: "healthy-test-harness::p::m1" }],
			getModelDiscoveryStatus: () => ({ ok: true }),
		};
		const legacy = {
			id: "legacy-test-harness",
			listModels: async () => [],
		};
		const registry = {
			list: () => [
				{ id: "default-test-harness", name: "Default", harness: defaultHarness },
				{ id: "failing-test-harness", name: "Failing", harness: failing },
				{ id: "healthy-test-harness", name: "Healthy", harness: healthy },
				{ id: "legacy-test-harness", name: "Legacy", harness: legacy },
			],
		};
		const view = await harnessesView({
			registry,
			defaultHarness,
			models: [],
			refresh: true,
			timeoutMs: 1000,
		});
		expect(view.find((e) => e.id === "failing-test-harness").discoveryError).toEqual(
			failure,
		);
		// Healthy, legacy (no contract method), and default entries serve
		// exactly the old shape — no discoveryError key at all.
		for (const id of [
			"default-test-harness",
			"healthy-test-harness",
			"legacy-test-harness",
		]) {
			expect(view.find((e) => e.id === id)).not.toHaveProperty("discoveryError");
		}
	});

	it("harnessesView flags which harnesses support the stuck-check diagnosis", async () => {
		clearModelsCache();
		const withDiagnosis = {
			id: "pi-test-harness",
			listModels: async () => [],
			createDiagnosisSession: async () => ({}),
		};
		const withoutDiagnosis = {
			id: "custom-test-harness",
			modelSelection: "none",
			listModels: async () => [],
		};
		const registry = {
			list: () => [
				{ id: "pi-test-harness", name: "Pi", harness: withDiagnosis },
				{ id: "custom-test-harness", name: "Custom", harness: withoutDiagnosis },
			],
		};
		const view = await harnessesView({
			registry,
			defaultHarness: withDiagnosis,
			models: [],
			refresh: true,
			timeoutMs: 50,
		});
		expect(view.find((e) => e.id === "pi-test-harness").supportsDiagnosis).toBe(true);
		expect(view.find((e) => e.id === "custom-test-harness").supportsDiagnosis).toBe(false);
	});
});
