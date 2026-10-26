import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so no fixture in this file
// can ever touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projects.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-appstatus-api-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-appstatus-api-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: App Status API Integration
 * @description Verifies the script-friendly "Go to App" endpoints:
 *   PATCH /projects/:id/app-status (set/merge/clear the link) and
 *   GET /projects/:id/app-status/health (backend proxy probe with SSRF guard).
 ***/
describe("App Status API Integration", () => {
	beforeAll(async () => {
		await app.ready();
	});

	async function createProject(name) {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(res.statusCode).toBe(201);
		return JSON.parse(res.payload);
	}

	it("sets the app link via PATCH and reads it back on the project", async () => {
		const project = await createProject("App Link Set");
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: {
				url: "http://localhost:5173",
				networkHost: "home.home",
				healthEndpoint: "/health",
				status: "running",
			},
		});
		expect(res.statusCode).toBe(200);
		const updated = JSON.parse(res.payload);
		expect(updated.appStatus).toMatchObject({
			url: "http://localhost:5173",
			networkHost: "home.home",
			resolvedUrl: "http://home.home:5173/",
			healthEndpoint: "/health",
			status: "running",
		});
		expect(updated.appStatus.lastUpdated).toBeTruthy();
		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(JSON.parse(fetched.payload).appStatus.url).toBe(
			"http://localhost:5173",
		);
	});

	it("merges partial updates without dropping the URL", async () => {
		const project = await createProject("App Link Merge");
		await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: { url: "http://localhost:3000" },
		});
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: { status: "starting" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).appStatus).toMatchObject({
			url: "http://localhost:3000",
			status: "starting",
		});
	});

	it("clears the link on url null", async () => {
		const project = await createProject("App Link Clear");
		await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: { url: "http://localhost:3000" },
		});
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: { url: null },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).appStatus).toBeUndefined();
	});

	it("refuses javascript: URLs, unknown statuses, and bad overrides with 400", async () => {
		const project = await createProject("App Link Strict");
		for (const payload of [
			{ url: "javascript:alert(1)" },
			{ url: "http://localhost:3000", status: "exploding" },
			{ url: "http://localhost:3000", networkHost: "not a host" },
		]) {
			const res = await app.inject({
				method: "PATCH",
				url: `/projects/${project.id}/app-status`,
				payload,
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).error).toBeTruthy();
		}
	});

	it("404s app-status writes for an unknown project", async () => {
		const res = await app.inject({
			method: "PATCH",
			url: "/projects/does-not-exist/app-status",
			payload: { url: "http://localhost:3000" },
		});
		expect(res.statusCode).toBe(404);
	});

	it("404s the health probe when no link is configured", async () => {
		const project = await createProject("App Link No Probe");
		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/app-status/health`,
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload).error).toMatch(/No app link/);
	});

	it("probes a live app as healthy and records it on the link", async () => {
		const server = http.createServer((req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const port = server.address().port;
			const project = await createProject("App Link Healthy");
			const res = await app.inject({
				method: "PATCH",
				url: `/projects/${project.id}/app-status`,
				payload: {
					url: `http://127.0.0.1:${port}`,
					healthEndpoint: "/health",
				},
			});
			expect(res.statusCode).toBe(200);
			// The health proxy probes with a 3s budget. Under the full api
			// suite (241 isolated workers sharing 4 cores) the loopback fetch
			// can miss that budget on scheduling alone, so retry a couple of
			// times before declaring the live app unreachable — a genuinely
			// dead app still fails every attempt.
			let outcome = null;
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const probe = await app.inject({
					method: "GET",
					url: `/projects/${project.id}/app-status/health`,
				});
				expect(probe.statusCode).toBe(200);
				outcome = JSON.parse(probe.payload);
				if (outcome.healthy) break;
			}
			expect(outcome.healthy).toBe(true);
			expect(outcome.statusCode).toBe(200);
			expect(outcome.url).toBe(`http://127.0.0.1:${port}/health`);
			expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
			const fetched = await app.inject({
				method: "GET",
				url: `/projects/${project.id}`,
			});
			const link = JSON.parse(fetched.payload).appStatus;
			expect(link.isHealthy).toBe(true);
			expect(link.lastHealthCheck).toBe(outcome.checkedAt);
		} finally {
			server.close();
		}
	});

	it("probes a dead app as unhealthy without throwing", async () => {
		const server = http.createServer(() => {});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const port = server.address().port;
		await new Promise((resolve) => server.close(resolve));
		const project = await createProject("App Link Dead");
		await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}/app-status`,
			payload: { url: `http://127.0.0.1:${port}` },
		});
		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/app-status/health`,
		});
		expect(res.statusCode).toBe(200);
		const outcome = JSON.parse(res.payload);
		expect(outcome.healthy).toBe(false);
		expect(outcome.statusCode).toBe(0);
		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(JSON.parse(fetched.payload).appStatus.isHealthy).toBe(false);
	});
});
