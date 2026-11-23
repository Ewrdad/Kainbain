import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fastify from "fastify";
import statusRoutes from "./status.js";

/***
 * MARK: status versions endpoint tests
 * @description Integration coverage for `GET /status/versions` (the Settings
 *   About page source): happy path with an update available, the frontend
 *   API contract tie-in (compatible and incompatible verdicts from the
 *   query-reported contract), the honest unknown state when nothing is
 *   known, malformed latest knobs collapsing to unknown instead of a 500,
 *   the 400 on absurd version query params, and the real-disk wiring
 *   (backend version from `api/package.json`, API contract from
 *   `api/version.json`). Registers `statusRoutes` on a throwaway Fastify
 *   instance with stubbed `deps.versions` so no test touches the global
 *   config or the live stack.
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

	it("ties the query-reported frontend contract to the backend contract", async () => {
		const compatApp = buildServer({
			backendVersion: "1.2.0",
			apiContract: { apiVersion: "1.2.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
			latest: {},
		});
		await compatApp.ready();
		try {
			const res = await compatApp.inject({
				method: "GET",
				url:
					"/status/versions?uiVersion=1.0.0&frontendApiVersion=1.0.0" +
					`&requiresBackendApi=${encodeURIComponent(">=1.0.0 <2.0.0")}`,
			});
			expect(res.statusCode).toBe(200);
			const payload = JSON.parse(res.payload);
			// Asymmetric pair (UI 1.0.0, backend 1.2.0) on the same API
			// major: compatible, with Up to date rows (nothing advertised).
			expect(payload.ui).toMatchObject({ installed: "1.0.0", status: "up-to-date" });
			expect(payload.backend).toMatchObject({
				installed: "1.2.0",
				status: "up-to-date",
			});
			expect(payload.apis[0]).toMatchObject({
				name: "screen-to-server",
				installed: "1.2.0",
				frontendApiVersion: "1.0.0",
				requiresBackendApi: ">=1.0.0 <2.0.0",
				compatibility: { status: "compatible", detail: expect.any(String) },
			});
			expect(payload.apis[0].compatibility.detail).toContain("major 1");
			expect(payload.warnings).toEqual([]);
		} finally {
			await compatApp.close();
		}
	});

	it("reports incompatible when the query-reported contract diverges", async () => {
		const splitApp = buildServer({
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
			latest: {},
		});
		await splitApp.ready();
		try {
			const res = await splitApp.inject({
				method: "GET",
				url:
					"/status/versions?uiVersion=2.0.0&frontendApiVersion=2.0.0" +
					`&requiresBackendApi=${encodeURIComponent(">=2.0.0 <3.0.0")}`,
			});
			expect(res.statusCode).toBe(200);
			const payload = JSON.parse(res.payload);
			expect(payload.apis[0].frontendApiVersion).toBe("2.0.0");
			expect(payload.apis[0].compatibility.status).toBe("incompatible");
			expect(payload.apis[0].compatibility.detail).toContain("2.0.0");
			expect(payload.apis[0].compatibility.detail).toContain("1.0.0");
		} finally {
			await splitApp.close();
		}
	});

	it("collapses malformed latest knobs to unknown instead of failing", async () => {
		const malformedApp = buildServer({
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
			latest: { ui: "bogus", backend: "bogus", api: "bogus" },
			security: { status: "fail", checkedAt: null, summary: "2 critical", reportUrl: null },
		});
		await malformedApp.ready();
		try {
			const res = await malformedApp.inject({
				method: "GET",
				url: "/status/versions?uiVersion=1.0.0",
			});
			expect(res.statusCode).toBe(200);
			const payload = JSON.parse(res.payload);
			expect(payload.ui.status).toBe("unknown");
			expect(payload.backend.status).toBe("unknown");
			expect(payload.apis[0].status).toBe("unknown");
			expect(payload.security).toMatchObject({ status: "fail", summary: "2 critical" });
			expect(payload.warnings).toEqual([]);
		} finally {
			await malformedApp.close();
		}
	});

	it("rejects absurd version query params with a 400", async () => {
		for (const url of [
			`/status/versions?uiVersion=${"1".repeat(200)}`,
			`/status/versions?frontendApiVersion=${"1".repeat(200)}`,
			`/status/versions?requiresBackendApi=${encodeURIComponent(">".repeat(300))}`,
		]) {
			const res = await unknownApp.inject({ method: "GET", url });
			expect(res.statusCode).toBe(400);
		}
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
		// No frontend contract sent: the tie-in fields stay null and the
		// verdict is unknown rather than a guess.
		expect(payload.apis[0].frontendApiVersion).toBeNull();
		expect(payload.apis[0].requiresBackendApi).toBeNull();
		expect(payload.apis[0].compatibility).toMatchObject({ status: "unknown" });
	});
});
