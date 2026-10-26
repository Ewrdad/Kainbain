import { describe, it, expect, vi } from "vitest";
import { HealthChecker } from "./healthChecker.js";

describe("HealthChecker", () => {
	it("checks LiteLLM connection successfully", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
		});
		const checker = new HealthChecker({ fetchFn: mockFetch });
		const result = await checker.checkLiteLLM();

		expect(result.status).toBe("ok");
		expect(result.latencyMs).toBeTypeOf("number");
		expect(result.message).toContain("LiteLLM reachable");
	});

	it("reports LiteLLM disabled (never error) when no URL is configured and nothing answers", async () => {
		const savedUrl = process.env.LITELLM_URL;
		const savedHost = process.env.LITELLM_HOST;
		delete process.env.LITELLM_URL;
		delete process.env.LITELLM_HOST;
		try {
			const mockFetch = vi
				.fn()
				.mockRejectedValue(new Error("Connection refused"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			const result = await checker.checkLiteLLM();

			expect(result.status).toBe("disabled");
			expect(result.latencyMs).toBeNull();
			expect(result.message).toContain("LiteLLM not detected");
			expect(result.message).toContain("LITELLM_URL");
		} finally {
			if (savedUrl !== undefined) process.env.LITELLM_URL = savedUrl;
			if (savedHost !== undefined) process.env.LITELLM_HOST = savedHost;
		}
	});

	it("reports LiteLLM unconfigured with guidance when an explicit URL is unreachable", async () => {
		vi.stubEnv("LITELLM_URL", "http://127.0.0.1:9");
		try {
			const mockFetch = vi
				.fn()
				.mockRejectedValue(new Error("Connection refused"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			const result = await checker.checkLiteLLM();

			expect(result.status).toBe("unconfigured");
			expect(result.latencyMs).toBeNull();
			expect(result.endpoint).toBe("http://127.0.0.1:9");
			expect(result.message).toContain("LiteLLM unreachable");
			expect(result.message).toContain("optional");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("inspects host device metrics", () => {
		const checker = new HealthChecker();
		const result = checker.checkDevice();

		expect(["ok", "warning", "error"]).toContain(result.status);
		expect(result.memoryUsagePct).toBeTypeOf("number");
		expect(result.freeMemMb).toBeTypeOf("number");
		expect(result.totalMemMb).toBeGreaterThan(0);
		expect(Array.isArray(result.loadAvg)).toBe(true);
		expect(result.loadAvg).toHaveLength(3);
		expect(result.cpuCount).toBeGreaterThan(0);
		expect(result.uptimeSec).toBeTypeOf("number");
		expect(result.message).toBeTypeOf("string");

		// Characterization: verify expected keys in Linux result
		expect(Object.keys(result).sort()).toEqual([
			"cpuCount",
			"freeMemMb",
			"loadAvg",
			"memoryUsagePct",
			"message",
			"status",
			"totalMemMb",
			"uptimeSec",
		]);
	});

	it("reports load as unsupported on Windows without NaN or false alarms", () => {
		const checker = new HealthChecker();
		const result = checker.checkDevice({ platform: "win32" });

		expect(result.loadAvg).toBeNull();
		expect(result.loadStatus).toBe("unsupported");
		// Memory/uptime checks stay intact.
		expect(result.memoryUsagePct).toBeTypeOf("number");
		expect(Number.isNaN(result.memoryUsagePct)).toBe(false);
		expect(result.freeMemMb).toBeTypeOf("number");
		expect(result.totalMemMb).toBeGreaterThan(0);
		expect(result.cpuCount).toBeGreaterThan(0);
		expect(result.uptimeSec).toBeTypeOf("number");
		expect(result.message).toBeTypeOf("string");
		expect(result.message).not.toContain("NaN");
		// Load is excluded from the verdict: status derives from memory only.
		expect(["ok", "warning", "error"]).toContain(result.status);
		// The whole shape must survive JSON (the /status path) with no NaN.
		const roundTripped = JSON.parse(JSON.stringify(result));
		expect(roundTripped.loadAvg).toBeNull();
		expect(roundTripped.loadStatus).toBe("unsupported");
		expect(JSON.stringify(result)).not.toContain("NaN");
	});

	it("keeps load-based verdicts on macOS (loadavg is supported there)", () => {
		const checker = new HealthChecker();
		const result = checker.checkDevice({ platform: "darwin" });

		expect(Array.isArray(result.loadAvg)).toBe(true);
		expect(result.loadAvg).toHaveLength(3);
		expect(result.loadStatus).toBeUndefined();
	});

	it("checks Ollama Cloud connectivity successfully", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
		});
		const checker = new HealthChecker({ fetchFn: mockFetch });
		const result = await checker.checkOllamaCloud();

		expect(result.status).toBe("ok");
		expect(result.latencyMs).toBeTypeOf("number");
		expect(result.message).toContain("Ollama Cloud reachable");
	});

	it("reports Ollama Cloud disabled (never error) when no URL is configured and nothing answers", async () => {
		const savedUrl = process.env.OLLAMA_CLOUD_URL;
		delete process.env.OLLAMA_CLOUD_URL;
		try {
			const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			const result = await checker.checkOllamaCloud();

			expect(result.status).toBe("disabled");
			expect(result.message).toContain("Ollama Cloud not detected");
			expect(result.message).toContain("OLLAMA_CLOUD_URL");
		} finally {
			if (savedUrl !== undefined) process.env.OLLAMA_CLOUD_URL = savedUrl;
		}
	});

	it("reports Ollama Cloud unconfigured with guidance when an explicit URL is unreachable", async () => {
		vi.stubEnv("OLLAMA_CLOUD_URL", "http://127.0.0.1:9");
		try {
			const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			const result = await checker.checkOllamaCloud();

			expect(result.status).toBe("unconfigured");
			expect(result.endpoint).toBe("http://127.0.0.1:9");
			expect(result.message).toContain("Ollama Cloud unreachable");
			expect(result.message).toContain("optional");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("keeps the aggregate ok when only optional probes are unconfigured", async () => {
		const savedLitellm = process.env.LITELLM_URL;
		const savedOllama = process.env.OLLAMA_CLOUD_URL;
		delete process.env.LITELLM_URL;
		delete process.env.OLLAMA_CLOUD_URL;
		try {
			const mockFetch = vi
				.fn()
				.mockRejectedValue(new Error("nothing listening"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			vi.spyOn(checker, "checkDevice").mockReturnValue({
				status: "ok",
				memoryUsagePct: 40,
				freeMemMb: 8000,
				totalMemMb: 16000,
				loadAvg: [0.5, 0.5, 0.5],
				cpuCount: 8,
				uptimeSec: 3600,
				message: "Device healthy",
			});
			const result = await checker.checkAll({ refresh: true });
			expect(result.checks.litellm.status).toBe("disabled");
			expect(result.checks.ollamaCloud.status).toBe("disabled");
			expect(result.status).toBe("ok");
		} finally {
			if (savedLitellm !== undefined) process.env.LITELLM_URL = savedLitellm;
			if (savedOllama !== undefined)
				process.env.OLLAMA_CLOUD_URL = savedOllama;
		}
	});

	it("still degrades the aggregate when the device check errors (optional probes excluded, device counts)", async () => {
		const savedLitellm = process.env.LITELLM_URL;
		const savedOllama = process.env.OLLAMA_CLOUD_URL;
		delete process.env.LITELLM_URL;
		delete process.env.OLLAMA_CLOUD_URL;
		try {
			const mockFetch = vi
				.fn()
				.mockRejectedValue(new Error("nothing listening"));
			const checker = new HealthChecker({ fetchFn: mockFetch });
			vi.spyOn(checker, "checkDevice").mockReturnValue({
				status: "error",
				message: "Critical resource pressure",
			});
			const result = await checker.checkAll({ refresh: true });
			// Single driving error ⇒ degraded (the optional disabled probes
			// contribute nothing to the count).
			expect(result.status).toBe("degraded");
		} finally {
			if (savedLitellm !== undefined) process.env.LITELLM_URL = savedLitellm;
			if (savedOllama !== undefined)
				process.env.OLLAMA_CLOUD_URL = savedOllama;
		}
	});

	it("aggregates all checks in checkAll with caching", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
		});
		const checker = new HealthChecker({ fetchFn: mockFetch, cacheTtlMs: 5000 });
		vi.spyOn(checker, "checkDevice").mockReturnValue({
			status: "ok",
			memoryUsagePct: 40,
			freeMemMb: 8000,
			totalMemMb: 16000,
			loadAvg: [0.5, 0.5, 0.5],
			cpuCount: 8,
			uptimeSec: 3600,
			message: "Device healthy",
		});
		const result1 = await checker.checkAll();

		expect(result1.status).toBe("ok");
		expect(result1.checks.litellm.status).toBe("ok");
		expect(result1.checks.device.status).toBe("ok");
		expect(result1.checks.ollamaCloud.status).toBe("ok");

		// Second call uses cache
		const result2 = await checker.checkAll();
		expect(result2).toBe(result1);

		// Refresh forces new execution
		const result3 = await checker.checkAll({ refresh: true });
		expect(result3).not.toBe(result1);
	});

	it("coalesces concurrent checkAll calls into a single in-flight promise", async () => {
		let fetchCalls = 0;
		const mockFetch = vi.fn().mockImplementation(async () => {
			fetchCalls++;
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { ok: true, status: 200 };
		});
		const checker = new HealthChecker({ fetchFn: mockFetch });

		const [res1, res2, res3] = await Promise.all([
			checker.checkAll(),
			checker.checkAll(),
			checker.checkAll(),
		]);

		expect(res1).toBe(res2);
		expect(res2).toBe(res3);
		// 2 candidates for LiteLLM + 2 candidates for OllamaCloud = 4 fetch calls total
		// (instead of 12 fetch calls if 3 concurrent callers were not coalesced)
		expect(fetchCalls).toBe(4);
	});

	it("resolves checkLiteLLM with fast candidate in parallel without waiting for slow candidate", async () => {
		// Deterministic parallelism proof: the slow candidate is parked on an
		// unreleased gate, so it cannot have settled when the winner returns.
		// The old `duration < 150` wall-clock bound flaked under the overlapped
		// gate (a fast 10ms probe still stretches past 150ms on a loaded box).
		let releaseSlow;
		const slowGate = new Promise((resolve) => {
			releaseSlow = resolve;
		});
		let slowSettled = false;
		const mockFetch = vi.fn().mockImplementation(async (url) => {
			if (url.includes("litellm.home")) {
				await slowGate;
				slowSettled = true;
				return { ok: false, status: 504 };
			}
			if (url.includes("localhost:4000")) {
				return { ok: true, status: 200 };
			}
			return { ok: false, status: 404 };
		});

		const checker = new HealthChecker({ fetchFn: mockFetch });
		const result = await checker.checkLiteLLM({ timeoutMs: 500 });

		expect(result.status).toBe("ok");
		expect(result.endpoint).toContain("localhost:4000");
		expect(slowSettled).toBe(false);
		releaseSlow();
	});

	it("resolves checkOllamaCloud with fast candidate in parallel without waiting for slow candidate", async () => {
		// Same deterministic gate as the LiteLLM case above.
		let releaseSlow;
		const slowGate = new Promise((resolve) => {
			releaseSlow = resolve;
		});
		let slowSettled = false;
		const mockFetch = vi.fn().mockImplementation(async (url) => {
			if (url.includes("ollama.com")) {
				await slowGate;
				slowSettled = true;
				return { status: 500 };
			}
			if (url.includes("ollama.ai")) {
				return { status: 200 };
			}
			return { status: 500 };
		});

		const checker = new HealthChecker({ fetchFn: mockFetch });
		const result = await checker.checkOllamaCloud({ timeoutMs: 500 });

		expect(result.status).toBe("ok");
		expect(result.endpoint).toContain("ollama.ai");
		expect(slowSettled).toBe(false);
		releaseSlow();
	});

	it("provides getCachedHealth helper", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
		});
		const checker = new HealthChecker({ fetchFn: mockFetch });
		expect(checker.getCachedHealth()).toBeNull();

		const result = await checker.checkAll();
		expect(checker.getCachedHealth()).toBe(result);

		checker.clearCache();
		expect(checker.getCachedHealth()).toBeNull();
	});

	it("produces a byte-identical aggregate shape with zero probes registered", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		vi.spyOn(checker, "checkDevice").mockReturnValue({
			status: "ok",
			memoryUsagePct: 40,
			freeMemMb: 8000,
			totalMemMb: 16000,
			loadAvg: [0.5, 0.5, 0.5],
			cpuCount: 8,
			uptimeSec: 3600,
			message: "Device healthy",
		});

		const result = await checker.checkAll();

		// No `harnesses` key at all when no probes are registered — the response
		// shape is exactly the pre-probe aggregate.
		expect(Object.keys(result.checks).sort()).toEqual([
			"device",
			"litellm",
			"ollamaCloud",
		]);
		expect(result.status).toBe("ok");
	});

	it("reports registered probe results under checks.harnesses and folds them into the aggregate", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		vi.spyOn(checker, "checkDevice").mockReturnValue({
			status: "ok",
			memoryUsagePct: 40,
			freeMemMb: 8000,
			totalMemMb: 16000,
			loadAvg: [0.5, 0.5, 0.5],
			cpuCount: 8,
			uptimeSec: 3600,
			message: "Device healthy",
		});
		checker.registerProbe({
			name: "pi",
			probe: async () => ({
				name: "pi",
				status: "warning",
				latencyMs: 3,
				timestamp: "2026-01-01T00:00:00.000Z",
				message: "stale snapshot",
				checks: { models: { status: "warning", available: 0, total: 2 } },
			}),
		});

		const result = await checker.checkAll();

		expect(result.checks.harnesses.pi).toEqual(
			expect.objectContaining({ name: "pi", status: "warning" }),
		);
		// A warning probe degrades the aggregate but does not error it.
		expect(result.status).toBe("warning");
	});

	it("normalizes a rejected probe into an error check without failing the aggregate", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		vi.spyOn(checker, "checkDevice").mockReturnValue({
			status: "ok",
			memoryUsagePct: 40,
			freeMemMb: 8000,
			totalMemMb: 16000,
			loadAvg: [0.5, 0.5, 0.5],
			cpuCount: 8,
			uptimeSec: 3600,
			message: "Device healthy",
		});
		checker.registerProbe({
			name: "pi",
			probe: async () => {
				throw new Error("harness exploded");
			},
		});

		const result = await checker.checkAll();

		expect(result.checks.harnesses.pi).toEqual(
			expect.objectContaining({
				name: "pi",
				status: "error",
				message: expect.stringContaining("harness exploded"),
			}),
		);
		// Single error ⇒ degraded, not error (same rule as the built-in checks).
		expect(result.status).toBe("degraded");
	});

	it("normalizes a malformed probe result into an error check", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		checker.registerProbe({
			name: "pi",
			probe: async () => "not an object",
		});

		const result = await checker.checkAll();

		expect(result.checks.harnesses.pi.status).toBe("error");
		expect(result.checks.harnesses.pi.message).toContain("malformed");
	});

	it("times out a hanging probe within the configured budget", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		checker.registerProbe({
			name: "pi",
			probe: () => new Promise(() => {}), // never settles
		});

		const startedAt = Date.now();
		const result = await checker.runProbeWithTimeout("pi", checker.probes[0].probe, {
			timeoutMs: 50,
		});
		const duration = Date.now() - startedAt;

		expect(result.status).toBe("error");
		expect(result.message).toContain("timed out after 50ms");
		expect(duration).toBeLessThan(500);
	});

	it("passes checkAll options through to probes", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		const probeFn = vi.fn(async (opts) => ({
			name: "pi",
			status: "ok",
			received: opts,
		}));
		checker.registerProbe({ name: "pi", probe: probeFn });

		await checker.checkAll({ refresh: true });

		expect(probeFn).toHaveBeenCalledWith(expect.objectContaining({ refresh: true }));
	});

	it("invalidates the cache when a probe is registered so the next checkAll includes it", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		vi.spyOn(checker, "checkDevice").mockReturnValue({
			status: "ok",
			memoryUsagePct: 40,
			freeMemMb: 8000,
			totalMemMb: 16000,
			loadAvg: [0.5, 0.5, 0.5],
			cpuCount: 8,
			uptimeSec: 3600,
			message: "Device healthy",
		});

		const before = await checker.checkAll();
		expect(before.checks.harnesses).toBeUndefined();

		checker.registerProbe({
			name: "pi",
			probe: async () => ({ name: "pi", status: "ok" }),
		});

		const after = await checker.checkAll();
		expect(after.checks.harnesses.pi.status).toBe("ok");
	});

	it("replaces a probe registered under the same name", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const checker = new HealthChecker({ fetchFn: mockFetch });
		checker.registerProbe({
			name: "pi",
			probe: async () => ({ name: "pi", status: "ok" }),
		});
		checker.registerProbe({
			name: "pi",
			probe: async () => ({ name: "pi", status: "warning" }),
		});

		expect(checker.probes).toHaveLength(1);
		const result = await checker.runProbeWithTimeout("pi", checker.probes[0].probe, {});
		expect(result.status).toBe("warning");
	});

	it("rejects invalid probe names and non-function probes", () => {
		const checker = new HealthChecker({ fetchFn: vi.fn() });
		expect(() => checker.registerProbe({ name: "Bad Name", probe: async () => ({}) })).toThrow(
			/Invalid harness probe name/,
		);
		expect(() => checker.registerProbe({ name: "pi", probe: "nope" })).toThrow(
			/must be a function/,
		);
	});
});
