import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fastify from "fastify";
import statusRoutes from "./status.js";

/***
 * MARK: status versions endpoint tests
 * @description Integration coverage for `GET /status/versions` (the Settings
 *   About page source): happy path with an update available, the honest
 *   unknown state when nothing is known, and the real-disk wiring (backend
 *   version from `api/package.json`, API contract from `api/version.json`).
 *   Registers `statusRoutes` on a throwaway Fastify instance with stubbed
 *   `deps.versions` so no test touches the global config or the live stack.
 * @example run `npm run test --prefix api -- status.versions`
 ***/

const buildServer = (versions) => {
	const app = fastify();
	app.register(statusRoutes, {
		deps: {
			taskStore: null,
			deployManager: null,
			healthChecker: null,
			versions,
		},
	});
	return app;
};

describe("GET /status/versions", () => {
	let updateApp;
	let unknownApp;
	let realApp;

	beforeAll(async () => {
		updateApp = buildServer({
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
			latest: { ui: "1.2.0", backend: "1.0.0", api: "1.0.0" },
			security: {
				status: "pass",
				checkedAt: "2026-11-01T00:00:00.000Z",
				summary: "Clean.",
				reportUrl: "https://sec.example/build/1",
			},
		});
		unknownApp = buildServer({});
		realApp = buildServer(undefined);
		await updateApp.ready();
		await unknownApp.ready();
		await realApp.ready();
	});

	afterAll(async () => {
		await updateApp.close();
		await unknownApp.close();
		await realApp.close();
	});

	it("reports installed versions, an update warning, and the security summary", async () => {
		const res = await updateApp.inject({
			method: "GET",
			url: "/status/versions?uiVersion=1.0.0",
		});
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.ui).toMatchObject({
			installed: "1.0.0",
			latest: "1.2.0",
			status: "update-available",
			updateUrl: "#/docs/update-ui",
		});
		expect(payload.backend.status).toBe("up-to-date");
		expect(payload.apis).toHaveLength(1);
		expect(payload.apis[0]).toMatchObject({
			name: "screen-to-server",
			installed: "1.0.0",
			updateUrl: "#/docs/update-api",
		});
		expect(payload.security).toMatchObject({ status: "pass" });
		expect(payload.warnings).toEqual(["UI update available: 1.0.0 → 1.2.0"]);
		expect(typeof payload.checkedAt).toBe("string");
	});

	it("stays honest when the UI version is missing and nothing is known", async () => {
		const res = await unknownApp.inject({ method: "GET", url: "/status/versions" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.ui).toMatchObject({ installed: null, latest: null, status: "unknown" });
		expect(payload.security.status).toBe("unknown");
		expect(payload.warnings).toEqual([]);
	});

	it("reads the real backend and API-contract versions from disk", async () => {
		const res = await realApp.inject({
			method: "GET",
			url: "/status/versions?uiVersion=bogus",
		});
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.backend.installed).toBe("1.0.0");
		expect(payload.apis[0].installed).toBe("1.0.0");
		expect(payload.apis[0].accepts).toMatchObject({ frontend: expect.any(String) });
		expect(payload.ui).toMatchObject({ installed: null, status: "unknown" });
	});
});
