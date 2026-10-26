import { describe, it, expect, vi } from "vitest";

/**
 * MARK: piHarness probeHealth tests
 * @description Verifies the optional AgentHarness.probeHealth member on the pi
 *   harness against a duck-typed fake ModelRuntime (no SDK import, no
 *   network): offline-by-default behavior (no getAvailable call without
 *   refresh:true), ok/warning/error classification, per-provider auth
 *   aggregation, and the never-throw error path.
 */
import { createPiHarness } from "./piHarness.js";

/***
 * MARK: makeFakeRuntime
 * @description Builds a duck-typed ModelRuntime fake with sensible defaults
 *   (one configured provider, snapshot populated) that individual tests
 *   override. Every probe-relevant call is a vi.fn so tests can assert
 *   exactly which runtime methods the probe touched.
 ***/
function makeFakeRuntime(overrides = {}) {
	const snapshot = overrides.snapshot ?? [
		{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
	];
	const registry = overrides.registry ?? snapshot;
	const authStatuses = overrides.authStatuses ?? null;
	const defaultAuthStatus = { configured: true, source: "models_json_key", label: "models.json" };
	const lookupAuth = (providerId) => {
		if (authStatuses) {
			if (providerId === "ollama-cloud") return authStatuses.ollamaCloud;
			if (providerId === "google") return authStatuses.google;
			return undefined;
		}
		return providerId === "ollama-cloud" ? defaultAuthStatus : undefined;
	};
	return {
		getAvailableSnapshot: vi.fn(() => snapshot),
		getModels: vi.fn(() => registry),
		getProviderAuthStatus: vi.fn((providerId) => lookupAuth(providerId)),
		getError: vi.fn(() => overrides.error ?? undefined),
		getAvailable: vi.fn(async () => overrides.available ?? snapshot),
		refresh: vi.fn(async () => ({})),
		...overrides.extra,
	};
}

function makeHarness(runtime) {
	const harness = createPiHarness({});
	// Bypass the lazily-created real runtime with the fake.
	harness.modelRuntime = vi.fn(async () => runtime);
	return harness;
}

describe("piHarness.probeHealth", () => {
	it("reports ok when a configured provider is present in the snapshot (offline default)", async () => {
		const runtime = makeFakeRuntime();
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.name).toBe("pi");
		expect(result.status).toBe("ok");
		expect(result.latencyMs).toBeTypeOf("number");
		expect(result.timestamp).toBeTypeOf("string");
		expect(result.message).toContain("1 provider(s) configured");
		expect(result.checks.runtime.status).toBe("ok");
		expect(result.checks.models).toEqual(
			expect.objectContaining({ status: "ok", available: 1, total: 1 }),
		);
		expect(result.checks.auth.status).toBe("ok");
		expect(result.checks.auth.providers).toEqual([
			{
				provider: "ollama-cloud",
				configured: true,
				source: "models_json_key",
				label: "models.json",
			},
		]);
	});

	it("does not call getAvailable (no network) without refresh:true", async () => {
		const runtime = makeFakeRuntime();
		const harness = makeHarness(runtime);

		await harness.probeHealth();
		await harness.probeHealth({ refresh: false });

		expect(runtime.getAvailable).not.toHaveBeenCalled();
	});

	it("calls getAvailable exactly once with refresh:true", async () => {
		const runtime = makeFakeRuntime();
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth({ refresh: true });

		expect(runtime.getAvailable).toHaveBeenCalledTimes(1);
		expect(result.status).toBe("ok");
	});

	it("classifies warning when a configured provider is missing from the snapshot", async () => {
		const runtime = makeFakeRuntime({
			registry: [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				{ provider: "google", id: "gemini-2.5-pro" },
			],
			authStatuses: {
				ollamaCloud: { configured: true, source: "stored", label: "auth.json" },
				google: { configured: true, source: "environment", label: "GEMINI_API_KEY" },
			},
			// Snapshot only covers ollama-cloud: the google provider flaked.
			snapshot: [{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" }],
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("warning");
		expect(result.checks.auth.status).toBe("warning");
		expect(result.message).toContain("google");
	});

	it("classifies error when the runtime reports an availability error", async () => {
		const runtime = makeFakeRuntime({
			error: "availability refresh failed: boom",
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.checks.auth.status).toBe("error");
		expect(result.checks.auth.error).toBe("availability refresh failed: boom");
		expect(result.message).toContain("boom");
	});

	it("classifies error when no provider has configured credentials", async () => {
		const runtime = makeFakeRuntime({
			authStatuses: { ollamaCloud: { configured: false } },
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.message).toContain("No model providers have configured credentials");
	});

	it("classifies error when no providers exist at all", async () => {
		const runtime = makeFakeRuntime({
			snapshot: [],
			registry: [],
			authStatuses: {},
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.message).toContain("No model providers configured");
	});

	it("keeps the auth error verdict when a refresh also fails", async () => {
		const runtime = makeFakeRuntime({
			error: "stale availability error",
			extra: {
				getAvailable: vi.fn(async () => {
					throw new Error("network down");
				}),
			},
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth({ refresh: true });

		expect(result.status).toBe("error");
		expect(result.checks.auth.error).toBe("stale availability error");
	});

	it("reports the refresh failure through auth.error when the runtime had no stored error", async () => {
		const runtime = makeFakeRuntime({
			extra: {
				getAvailable: vi.fn(async () => {
					throw new Error("network down");
				}),
			},
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth({ refresh: true });

		expect(result.status).toBe("error");
		expect(result.checks.auth.error).toBe("network down");
	});

	it("never throws when the runtime cannot be created", async () => {
		const harness = createPiHarness({});
		harness.modelRuntime = vi.fn(async () => {
			throw new Error("runtime init failed");
		});

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.message).toContain("runtime init failed");
		expect(result.checks.runtime.status).toBe("error");
	});

	it("never throws when runtime reads fail mid-probe", async () => {
		const runtime = makeFakeRuntime({
			extra: {
				getAvailableSnapshot: vi.fn(() => {
					throw new Error("snapshot exploded");
				}),
			},
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.message).toContain("Harness probe failed");
	});

	it("treats a throwing getProviderAuthStatus as unconfigured without failing the probe", async () => {
		const runtime = makeFakeRuntime({
			extra: {
				getProviderAuthStatus: vi.fn(() => {
					throw new Error("auth store locked");
				}),
			},
		});
		const harness = makeHarness(runtime);

		const result = await harness.probeHealth();

		expect(result.status).toBe("error");
		expect(result.checks.auth.providers[0].configured).toBe(false);
	});
});

describe("piHarness.modelAuthStatus", () => {
	it("returns the offline per-provider auth summary", async () => {
		const runtime = makeFakeRuntime({
			registry: [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				{ provider: "google", id: "gemini-2.5-pro" },
			],
			authStatuses: {
				ollamaCloud: { configured: true, source: "models_json_key", label: "models.json" },
				google: { configured: false },
			},
		});
		const harness = makeHarness(runtime);

		const status = await harness.modelAuthStatus();

		expect(status.error).toBeNull();
		expect(status.providers).toEqual([
			{ provider: "ollama-cloud", configured: true, source: "models_json_key", label: "models.json" },
			// source/label are omitted when the SDK reports no auth status details.
			{ provider: "google", configured: false },
		]);
		expect(status.snapshotProviders).toEqual(["ollama-cloud"]);
		expect(status.snapshotSize).toBe(1);
		expect(status.registrySize).toBe(2);
	});

	it("exposes getError() as the auth error", async () => {
		const runtime = makeFakeRuntime({ error: "boom" });
		const harness = makeHarness(runtime);

		expect((await harness.modelAuthStatus()).error).toBe("boom");
	});
});