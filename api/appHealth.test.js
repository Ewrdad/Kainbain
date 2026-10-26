import { describe, it, expect } from "vitest";
import http from "node:http";
import {
	DEFAULT_PROBE_TIMEOUT_MS,
	extraProbeHosts,
	isProbeTargetAllowed,
	probeAppHealth,
} from "./appHealth.js";

/***
 * MARK: appHealth tests
 * @description Verifies the health-probe SSRF guard (loopback + stored hosts
 *   + allowlist only) and the probe itself (2xx/3xx healthy, unreachable and
 *   timeouts report healthy:false) against a real local HTTP server.
 ***/

/***
 * MARK: startProbeServer
 * @description Starts a throwaway 127.0.0.1 server for probe tests; routes:
 *   /health -> 200, /moved -> 302 (must NOT be followed), /slow -> never
 *   answers (timeout path), anything else -> 500.
 ***/
function startProbeServer() {
	const server = http.createServer((req, res) => {
		if (req.url === "/health") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
		} else if (req.url === "/moved") {
			res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" });
			res.end();
		} else if (req.url === "/slow") {
			// Never answers: the client timeout must win.
		} else {
			res.writeHead(500, { "content-type": "text/plain" });
			res.end("broken");
		}
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve(server));
	});
}

describe("isProbeTargetAllowed", () => {
	it("allows loopback targets", () => {
		expect(isProbeTargetAllowed("http://localhost:3000/health", [])).toBe(true);
		expect(isProbeTargetAllowed("http://127.0.0.1:3000/", [])).toBe(true);
	});

	it("allows the project's own stored app hosts", () => {
		expect(
			isProbeTargetAllowed("http://home.home:3000/health", ["home.home"]),
		).toBe(true);
	});

	it("allows hosts from KAINBAIN_APP_HEALTH_HOSTS", () => {
		const prev = process.env.KAINBAIN_APP_HEALTH_HOSTS;
		process.env.KAINBAIN_APP_HEALTH_HOSTS = "home.home, kainbain.home";
		try {
			expect(extraProbeHosts()).toEqual(["home.home", "kainbain.home"]);
			expect(isProbeTargetAllowed("http://kainbain.home:3000/", [])).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.KAINBAIN_APP_HEALTH_HOSTS;
			else process.env.KAINBAIN_APP_HEALTH_HOSTS = prev;
		}
	});

	it("refuses cloud metadata, credentials, and non-http(s) URLs", () => {
		expect(isProbeTargetAllowed("http://169.254.169.254/", [])).toBe(false);
		expect(isProbeTargetAllowed("http://evil.example.com/", [])).toBe(false);
		expect(isProbeTargetAllowed("http://user:pass@localhost:3000/", [])).toBe(
			false,
		);
		expect(isProbeTargetAllowed("javascript:alert(1)", [])).toBe(false);
		expect(isProbeTargetAllowed("not a url", [])).toBe(false);
	});
});

describe("probeAppHealth", () => {
	it("defaults to a 3s budget", () => {
		expect(DEFAULT_PROBE_TIMEOUT_MS).toBe(3000);
	});

	it("reports healthy on 2xx and unhealthy on 5xx", async () => {
		const server = await startProbeServer();
		try {
			const port = server.address().port;
			const ok = await probeAppHealth(`http://127.0.0.1:${port}/health`);
			expect(ok.healthy).toBe(true);
			expect(ok.statusCode).toBe(200);
			expect(ok.latencyMs).toBeGreaterThanOrEqual(0);
			expect(ok.checkedAt).toBeTruthy();
			const broken = await probeAppHealth(`http://127.0.0.1:${port}/nope`);
			expect(broken.healthy).toBe(false);
			expect(broken.statusCode).toBe(500);
		} finally {
			server.close();
		}
	});

	it("treats a redirect as up without following it", async () => {
		const server = await startProbeServer();
		try {
			const port = server.address().port;
			const moved = await probeAppHealth(`http://127.0.0.1:${port}/moved`);
			expect(moved.statusCode).toBe(302);
			expect(moved.healthy).toBe(true);
		} finally {
			server.close();
		}
	});

	it("reports unreachable instead of throwing on a closed port", async () => {
		const server = await startProbeServer();
		const port = server.address().port;
		await new Promise((resolve) => server.close(resolve));
		const down = await probeAppHealth(`http://127.0.0.1:${port}/health`, {
			timeoutMs: 1000,
		});
		expect(down.healthy).toBe(false);
		expect(down.statusCode).toBe(0);
		expect(down.error).toBe("app unreachable");
	});

	it("reports a timeout when the app never answers", async () => {
		const server = await startProbeServer();
		try {
			const port = server.address().port;
			const slow = await probeAppHealth(`http://127.0.0.1:${port}/slow`, {
				timeoutMs: 150,
			});
			expect(slow.healthy).toBe(false);
			expect(slow.statusCode).toBe(0);
			expect(slow.error).toBe("probe timed out");
		} finally {
			server.close();
		}
	}, 10000);
});
