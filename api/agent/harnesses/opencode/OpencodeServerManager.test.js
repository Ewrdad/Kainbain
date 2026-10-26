import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

/**
 * MARK: OpencodeServerManager tests
 * @description Verifies the per-project OpenCode server manager: connect mode
 *   (OPENCODE_URL) never spawns and fails loudly when the server is down,
 *   spawn mode starts a server via the SDK seam and proves readiness, crashed
 *   children are replaced on the next ensureRunning, cleanup is idempotent,
 *   and the per-project manager registry reuses one manager per cwd.
 */

const MANAGER_PATH = "./OpencodeServerManager.js";

// The SDK is imported dynamically by the manager; mocking the module here
// covers the spawn path without an `opencode` binary on the machine.
vi.mock("@opencode-ai/sdk", () => ({
	createOpencodeServer: vi.fn(),
}));

// Hermetic module handles: the manager resolves OPENCODE_URL /
// OPENCODE_SERVER_PASSWORD through the validated config (an import-time
// snapshot of the environment), so the module is imported fresh with both
// vars deleted — ambient env can never leak connect-mode into spawn tests
// (or vice versa). The SDK mock is re-captured from the same fresh module
// registry so the no-seam spawn test asserts the mock the manager sees.
let OpencodeServerManager;
let opencodeServerForProject;
let disposeAllOpencodeServers;
let activeOpencodeServerUrl;
let mockCreateOpencodeServer;

beforeAll(async () => {
	vi.stubEnv("OPENCODE_URL", undefined);
	vi.stubEnv("OPENCODE_SERVER_PASSWORD", undefined);
	vi.resetModules();
	const managers = await import(MANAGER_PATH);
	OpencodeServerManager = managers.OpencodeServerManager;
	opencodeServerForProject = managers.opencodeServerForProject;
	disposeAllOpencodeServers = managers.disposeAllOpencodeServers;
	activeOpencodeServerUrl = managers.activeOpencodeServerUrl;
	mockCreateOpencodeServer = (await import("@opencode-ai/sdk")).createOpencodeServer;
});

afterAll(() => {
	vi.unstubAllEnvs();
});

function healthyFetch(http) {
	return async (url, init) => {
		http.requests.push({ url, headers: init?.headers });
		return { status: http.status };
	};
}

describe("OpencodeServerManager — connect mode (OPENCODE_URL)", () => {
	const CONNECT_URL = "http://127.0.0.1:4096";

	it("returns the configured URL when the readiness probe answers 200", async () => {
		const http = { status: 200, requests: [] };
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			baseUrl: CONNECT_URL,
			fetch: healthyFetch(http),
		});

		const url = await manager.ensureRunning();

		expect(url).toBe("http://127.0.0.1:4096");
		expect(manager.isReady()).toBe(true);
		expect(http.requests[0].url).toBe("http://127.0.0.1:4096/project/current");
	});

	it("fails with a descriptive error (and never spawns) when the server is down", async () => {
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			baseUrl: CONNECT_URL,
			spawnServer: vi.fn(),
		});
		// Fetch fails → probe unreachable.
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			throw new Error("ECONNREFUSED");
		};
		try {
			await expect(manager.ensureRunning()).rejects.toThrow(/not reachable.*OPENCODE_URL/);
		} finally {
			globalThis.fetch = originalFetch;
		}
		expect(manager.isReady()).toBe(false);
	});

	it("sends the bearer password from OPENCODE_SERVER_PASSWORD on probes", async () => {
		// Connect URL + password arrive via constructor options (config defaults).
		const http = { status: 200, requests: [] };
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			baseUrl: CONNECT_URL,
			password: "sekrit",
			fetch: healthyFetch(http),
		});

		await manager.ensureRunning();

		expect(http.requests[0].headers.authorization).toBe("Bearer sekrit");
	});

	it("reads the connect URL and password from the validated config by default", async () => {
		// Proves the env -> config -> manager wiring end to end: a fresh module
		// registry sees only the stubbed vars, exactly like process boot.
		vi.stubEnv("OPENCODE_URL", CONNECT_URL);
		vi.stubEnv("OPENCODE_SERVER_PASSWORD", "sekrit");
		try {
			vi.resetModules();
			const fresh = await import(MANAGER_PATH);
			const manager = new fresh.OpencodeServerManager({ cwd: "/repo-config" });
			expect(manager.configuredBaseUrl).toBe(CONNECT_URL);
			expect(manager.password).toBe("sekrit");
		} finally {
			vi.stubEnv("OPENCODE_URL", undefined);
			vi.stubEnv("OPENCODE_SERVER_PASSWORD", undefined);
		}
	});
});

describe("OpencodeServerManager — spawn mode", () => {
	// No env setup: the hermetic beforeAll import deleted OPENCODE_URL, so the
	// manager under test always starts in spawn mode here.
	beforeEach(() => {
		mockCreateOpencodeServer.mockReset();
	});

	it("spawns via the SDK, probes readiness, and reports the spawned URL", async () => {
		const closed = { count: 0 };
		const spawnServer = vi.fn(async () => ({
			url: "http://127.0.0.1:4123",
			close: () => {
				closed.count += 1;
			},
		}));
		const http = { status: 200, requests: [] };
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			spawnServer,
			fetch: healthyFetch(http),
		});

		const url = await manager.ensureRunning();

		expect(spawnServer).toHaveBeenCalledTimes(1);
		expect(url).toBe("http://127.0.0.1:4123");
		expect(manager.isReady()).toBe(true);
	});

	it("closes the spawned server when it never becomes ready", async () => {
		const close = vi.fn();
		const spawnServer = vi.fn(async () => ({
			url: "http://127.0.0.1:4124",
			close,
		}));
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			spawnServer,
			fetch: async () => {
				throw new Error("refused");
			},
		});

		await expect(manager.ensureRunning()).rejects.toThrow(/never became ready/);
		expect(close).toHaveBeenCalledTimes(1);
		expect(manager.isReady()).toBe(false);
	});

	it("respawns when the previous child died (crash recovery)", async () => {
		const closeSpy = vi.fn();
		const spawnServer = vi
			.fn()
			.mockResolvedValueOnce({
				url: "http://127.0.0.1:4125",
				close: closeSpy,
			})
			.mockResolvedValueOnce({
				url: "http://127.0.0.1:4126",
				close: vi.fn(),
			});
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			spawnServer,
			fetch: async (url, init) => {
				// First probe ok, second (crash check) dead, third (respawn probe) ok.
				manager.__probes = (manager.__probes || 0) + 1;
				return { status: manager.__probes === 2 ? 503 : 200 };
			},
		});

		await manager.ensureRunning();
		// Simulate the child dying: expire the probe TTL so the next
		// ensureRunning re-probes the old URL instead of trusting the flag.
		manager.lastProbeOkAt = 0;
		const url = await manager.ensureRunning();

		expect(spawnServer).toHaveBeenCalledTimes(2);
		expect(closeSpy).toHaveBeenCalledTimes(1);
		expect(url).toBe("http://127.0.0.1:4126");
	});

	it("skips the probe within the probe TTL (no redundant network chatter)", async () => {
		const spawnServer = vi.fn(async () => ({
			url: "http://127.0.0.1:4127",
			close: vi.fn(),
		}));
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			spawnServer,
			fetch: healthyFetch({ status: 200, requests: [] }),
		});

		await manager.ensureRunning();
		await manager.ensureRunning();

		expect(spawnServer).toHaveBeenCalledTimes(1);
	});

	it("uses the SDK's createOpencodeServer when no seam is provided", async () => {
		mockCreateOpencodeServer.mockResolvedValue({
			url: "http://127.0.0.1:4128",
			close: vi.fn(),
		});
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			fetch: healthyFetch({ status: 200, requests: [] }),
		});

		const url = await manager.ensureRunning();

		expect(mockCreateOpencodeServer).toHaveBeenCalledTimes(1);
		expect(mockCreateOpencodeServer.mock.calls[0][0]).toMatchObject({
			hostname: "127.0.0.1",
			port: 0,
		});
		expect(url).toBe("http://127.0.0.1:4128");

		manager.cleanup();
	});
});

describe("OpencodeServerManager — cleanup", () => {
	// No env setup needed (hermetic beforeAll import; see spawn mode above).

	it("closes the spawned server exactly once and is idempotent", async () => {
		const close = vi.fn();
		const manager = new OpencodeServerManager({
			cwd: "/repo",
			spawnServer: vi.fn(async () => ({ url: "http://127.0.0.1:4129", close })),
			fetch: healthyFetch({ status: 200, requests: [] }),
		});
		await manager.ensureRunning();

		manager.cleanup();
		manager.cleanup();
		manager.cleanup();

		expect(close).toHaveBeenCalledTimes(1);
		expect(manager.isReady()).toBe(false);
		expect(manager.spawnedServer).toBeNull();
	});

	it("never throws when the child is already gone", async () => {
		const manager = new OpencodeServerManager({ cwd: "/repo" });
		manager.spawnedServer = {
			url: "http://127.0.0.1:4130",
			close: () => {
				throw new Error("already dead");
			},
		};

		expect(() => manager.cleanup()).not.toThrow();
	});
});

describe("per-project server registry", () => {
	afterEach(() => {
		disposeAllOpencodeServers();
	});

	it("reuses one manager per project cwd", () => {
		const a = opencodeServerForProject({ cwd: "/repo-a" });
		const aAgain = opencodeServerForProject({ cwd: "/repo-a" });
		const b = opencodeServerForProject({ cwd: "/repo-b" });

		expect(a).toBe(aAgain);
		expect(a).not.toBe(b);
	});

	it("reports the active server URL without spawning anything", async () => {
		expect(activeOpencodeServerUrl({ cwd: "/repo-active" })).toBeNull();

		const manager = opencodeServerForProject({ cwd: "/repo-active" });
		manager.ready = true;
		manager.lastProbeUrl = "http://127.0.0.1:4131";

		expect(activeOpencodeServerUrl({ cwd: "/repo-active" })).toBe(
			"http://127.0.0.1:4131",
		);

		disposeAllOpencodeServers();
		expect(activeOpencodeServerUrl({ cwd: "/repo-active" })).toBeNull();
	});

	it("falls back to OPENCODE_URL when no local server is running", async () => {
		// The fallback reads the validated config (import-time snapshot), so
		// proving it needs a fresh module registry with the var stubbed.
		vi.stubEnv("OPENCODE_URL", "http://127.0.0.1:9999");
		try {
			vi.resetModules();
			const fresh = await import(MANAGER_PATH);
			expect(fresh.activeOpencodeServerUrl({ cwd: "/repo-none" })).toBe(
				"http://127.0.0.1:9999",
			);
		} finally {
			vi.stubEnv("OPENCODE_URL", undefined);
		}
	});
});