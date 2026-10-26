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
import { describe, it, expect, vi } from "vitest";
import fastify from "fastify";
import app from "../index.js";
import statusRoutes from "./status.js";

/**
 * MARK: API Integration Tests
 * @description These tests verify the end-to-end behavior of the API endpoints.
 * @example run `npm run test:api`
 *
 */
describe("Status API Integration", () => {
	it("should return 200 OK and valid status payload including global engine state and health checks", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/status" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload).toEqual(
			expect.objectContaining({
				status: "ok",
				engine: expect.objectContaining({ status: expect.any(String) }),
				health: expect.objectContaining({
					status: expect.any(String),
					checks: expect.objectContaining({
						litellm: expect.any(Object),
						device: expect.any(Object),
						ollamaCloud: expect.any(Object),
					}),
				}),
			}),
		);
	});

	it("should return health checks from /status/health", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/status/health" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload).toEqual(
			expect.objectContaining({
				status: expect.any(String),
				checks: expect.objectContaining({
					litellm: expect.objectContaining({ status: expect.any(String) }),
					device: expect.objectContaining({ status: expect.any(String) }),
					ollamaCloud: expect.objectContaining({ status: expect.any(String) }),
				}),
			}),
		);
	});

	it("should return observability data from /status/observability", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/status/observability" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload).toEqual(
			expect.objectContaining({
				status: "ok",
				engine: expect.objectContaining({ status: expect.any(String) }),
			}),
		);
	});

	it("browser cache bypass reads async task metrics while an explicit health refresh is deferred", async () => {
		const { api: client, clearStatusCache } = await import("../../frontend/src/services/api.js");
		clearStatusCache();
		let releaseHealth;
		let healthStarted;
		let healthFinished = false;
		const started = new Promise((resolve) => { healthStarted = resolve; });
		const health = { status: "ok", checks: {} };
		const checkAll = vi.fn(() => {
			healthStarted();
			return new Promise((resolve) => {
				releaseHealth = () => {
					healthFinished = true;
					resolve(health);
				};
			});
		});
		let prompt = "Initial curated prompt";
		const getObservabilityMetrics = vi.fn(async () => ({ activeTask: { prompt } }));
		const customApp = fastify();
		await customApp.register(statusRoutes, { deps: {
			healthChecker: { checkAll, getCachedHealth: () => health },
			taskStore: { getObservabilityMetrics },
		} });
		const requests = [];
		vi.stubGlobal("fetch", async (url) => {
			const path = new URL(url, "http://fixture");
			requests.push(path.search);
			const response = await customApp.inject({ method: "GET", url: path.pathname + path.search });
			return { ok: response.statusCode === 200, json: async () => response.json() };
		});
		const explicitRefresh = customApp.inject({ method: "GET", url: "/status/observability?refresh=true" }).then((res) => res);
		try {
			await started;
			expect((await client.observabilityStatus("project")).health).toEqual(health);
			for (let i = 0; i < 3; i++) {
				prompt = `Fresh dispatched prompt ${i}\n# Git Context`;
				const responses = await Promise.all([
					client.observabilityStatus("project", true),
					client.observabilityStatus("project", true),
				]);
				for (const response of responses) expect(response.observability.activeTask.prompt).toBe(prompt);
			}
			expect(healthFinished).toBe(false);
			expect(getObservabilityMetrics).toHaveBeenCalledTimes(4);
			expect(checkAll).toHaveBeenCalledTimes(1);
			expect(checkAll).toHaveBeenCalledWith({ refresh: true });
			expect(requests).toEqual(Array(4).fill("?projectId=project"));
		} finally {
			releaseHealth?.();
			await explicitRefresh;
			vi.unstubAllGlobals();
			clearStatusCache();
			await customApp.close();
		}
	});

	it("observability endpoint returns cached health without blocking on checkAll when refresh is not requested", async () => {
		const mockCheckAll = vi.fn();
		const cachedHealthObj = {
			status: "ok",
			timestamp: "2026-08-29T12:00:00.000Z",
			checks: {
				litellm: { status: "ok" },
				device: { status: "ok" },
				ollamaCloud: { status: "ok" },
			},
		};
		const customApp = fastify();
		await customApp.register(statusRoutes, {
			deps: {
				healthChecker: {
					checkAll: mockCheckAll,
					getCachedHealth: () => cachedHealthObj,
					cachedHealth: cachedHealthObj,
				},
				taskStore: {
					getEngineState: () => ({ status: "idle" }),
					getObservabilityMetrics: () => ({ activeTasks: 0 }),
				},
			},
		});
		await customApp.ready();

		const res = await customApp.inject({
			method: "GET",
			url: "/status/observability",
		});
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.health).toEqual(cachedHealthObj);
		expect(mockCheckAll).not.toHaveBeenCalled();

		// When refresh=true is passed, checkAll is invoked with refresh: true
		await customApp.inject({
			method: "GET",
			url: "/status/observability?refresh=true",
		});
		expect(mockCheckAll).toHaveBeenCalledWith({ refresh: true });
		await customApp.close();
	});
});


