import { describe, it, expect, vi } from "vitest";
import {
	mapProvidersPayloadToModels,
	OpencodeModelDiscovery,
} from "./OpencodeModelDiscovery.js";
import { modelKey } from "../../../models.js";

/**
 * MARK: OpencodeModelDiscovery tests
 * @description Verifies the OpenCode harness's model discovery: the pure
 *   providers-payload mapping, cached listModels, graceful degradation when
 *   the server is unreachable, and stored-reference resolution
 *   (`provider::id` composite keys and bare ids).
 */

const stubPayload = {
	providers: [
		{
			id: "anthropic",
			name: "Anthropic",
			source: "config",
			env: [],
			options: {},
			models: {
				"claude-3-7-sonnet": {
					id: "claude-3-7-sonnet",
					providerID: "anthropic",
					name: "Claude 3.7 Sonnet",
					capabilities: {
						input: { text: true, image: true, audio: false, video: false, pdf: false },
					},
					limit: { context: 200000, output: 8192 },
				},
				"claude-haiku": {
					id: "claude-haiku",
					providerID: "anthropic",
					name: "Claude Haiku",
					capabilities: {
						input: { text: true, image: false, audio: false, video: false, pdf: false },
					},
					limit: { context: 100000 },
				},
			},
		},
		{
			id: "openai",
			name: "OpenAI",
			source: "env",
			env: [],
			options: {},
			models: {
				"gpt-5": {
					id: "gpt-5",
					providerID: "openai",
					name: "GPT-5",
					capabilities: {
						input: { text: true, image: false, audio: false, video: false, pdf: false },
					},
				},
			},
		},
	],
	default: { anthropic: "claude-3-7-sonnet" },
};

describe("mapProvidersPayloadToModels", () => {
	it("flattens providers into the engine's model shape", () => {
		const models = mapProvidersPayloadToModels(stubPayload);
		expect(models).toHaveLength(3);

		const sonnet = models.find((m) => m.id === "claude-3-7-sonnet");
		expect(sonnet).toMatchObject({
			provider: "anthropic",
			id: "claude-3-7-sonnet",
			name: "Claude 3.7 Sonnet",
			contextWindow: 200000,
			providerID: "anthropic",
			modelID: "claude-3-7-sonnet",
		});
		// Engine's input-modality array (pi shape): only enabled modalities.
		expect(sonnet.input).toEqual(["text", "image"]);
	});

	it("falls back to ['text'] when no input modality is enabled", () => {
		const models = mapProvidersPayloadToModels({
			providers: [
				{
					id: "p",
					models: {
						m1: { id: "m1", capabilities: { input: { text: false } } },
					},
				},
			],
		});
		expect(models[0].input).toEqual(["text"]);
	});

	it("orders each provider's default model first", () => {
		const models = mapProvidersPayloadToModels(stubPayload);
		const anthropicModels = models.filter((m) => m.provider === "anthropic");
		expect(anthropicModels[0].id).toBe("claude-3-7-sonnet");
	});

	it("tolerates empty and malformed payloads", () => {
		expect(mapProvidersPayloadToModels(null)).toEqual([]);
		expect(mapProvidersPayloadToModels({})).toEqual([]);
		expect(mapProvidersPayloadToModels({ providers: "nope" })).toEqual([]);
		expect(mapProvidersPayloadToModels({ providers: [null, {}] })).toEqual([]);
	});
});

/**
 * MARK: makeDiscovery
 * @description Builds a discovery instance over a stubbed fetch with a long
 *   cache TTL, returning both so tests can assert fetch counts.
 ***/
function makeDiscovery(overrides = {}) {
	const fetchModels = vi.fn(async () => stubPayload);
	const discovery = new OpencodeModelDiscovery({
		fetchModels,
		cacheTtlMs: 60000,
		...overrides,
	});
	return { discovery, fetchModels };
}

describe("OpencodeModelDiscovery.listModels", () => {
	it("maps and keys the discovered models", async () => {
		const { discovery, fetchModels } = makeDiscovery();

		const models = await discovery.listModels();

		expect(fetchModels).toHaveBeenCalledTimes(1);
		const sonnet = models.find((m) => m.id === "claude-3-7-sonnet");
		expect(sonnet.key).toBe(modelKey("anthropic", "claude-3-7-sonnet"));
	});

	it("serves repeat calls from cache without refetching", async () => {
		const { discovery, fetchModels } = makeDiscovery();

		await discovery.listModels();
		await discovery.listModels();
		await discovery.listModels();

		expect(fetchModels).toHaveBeenCalledTimes(1);
	});

	it("refresh=true bypasses the cache", async () => {
		const { discovery, fetchModels } = makeDiscovery();

		await discovery.listModels();
		await discovery.listModels({ refresh: true });

		expect(fetchModels).toHaveBeenCalledTimes(2);
	});

	it("returns an empty list (never throws) when the server is unreachable", async () => {
		const discovery = new OpencodeModelDiscovery({
			fetchModels: async () => {
				throw new Error("ECONNREFUSED");
			},
		});

		await expect(discovery.listModels()).resolves.toEqual([]);
	});

	it("keeps a previously-good cache when a later fetch fails", async () => {
		const fetchModels = vi
			.fn()
			.mockResolvedValueOnce(stubPayload)
			.mockRejectedValueOnce(new Error("boom"));
		const discovery = new OpencodeModelDiscovery({ fetchModels, cacheTtlMs: 0 });

		const first = await discovery.listModels();
		const second = await discovery.listModels({ refresh: true });

		expect(first).toHaveLength(3);
		expect(second).toHaveLength(3);
	});
});

describe("OpencodeModelDiscovery.resolveModelRef", () => {
	it("resolves a provider::id composite key exactly", async () => {
		const { discovery } = makeDiscovery();

		const resolved = await discovery.resolveModelRef(
			modelKey("openai", "gpt-5"),
		);

		expect(resolved).toMatchObject({ provider: "openai", id: "gpt-5" });
	});

	it("does not cross-match the same id under a different provider", async () => {
		const { discovery } = makeDiscovery();

		const resolved = await discovery.resolveModelRef(
			modelKey("openai", "claude-3-7-sonnet"),
		);

		expect(resolved).toBeNull();
	});

	it("falls back to a bare-id first match for stored legacy references", async () => {
		const { discovery } = makeDiscovery();

		const resolved = await discovery.resolveModelRef("gpt-5");

		expect(resolved).toMatchObject({ provider: "openai", id: "gpt-5" });
	});

	it("accepts { provider, id } object references", async () => {
		const { discovery } = makeDiscovery();

		const resolved = await discovery.resolveModelRef({
			provider: "anthropic",
			id: "claude-haiku",
		});

		expect(resolved?.name).toBe("Claude Haiku");
	});

	it("returns null for unknown references", async () => {
		const { discovery } = makeDiscovery();

		expect(await discovery.resolveModelRef("nope::missing")).toBeNull();
		expect(await discovery.resolveModelRef(null)).toBeNull();
	});
});

describe("OpencodeModelDiscovery — live fetch seam", () => {
	it("fetches /config/providers with the bearer password when configured", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => stubPayload,
		}));
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock;
		try {
			const discovery = new OpencodeModelDiscovery({
				baseUrl: "http://127.0.0.1:4099",
				password: "sekrit",
			});
			const models = await discovery.listModels();

			expect(models).toHaveLength(3);
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe("http://127.0.0.1:4099/config/providers");
			expect(init.headers.authorization).toBe("Bearer sekrit");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});