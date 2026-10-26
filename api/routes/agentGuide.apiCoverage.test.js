import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll, describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds.
afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

import app from "../index.js";
import { ENDPOINTS } from "../agentGuide.js";
import {
	listRegisteredRoutePaths,
	isExcludedInfraPath,
} from "./routeCoverageHelpers.js";

/***
 * MARK: agentGuide API coverage tests
 * @description Guards api/agentGuide.js ENDPOINTS against drift: every REST route
 *   registered on the real Fastify app (minus explicitly excluded infra/ws paths)
 *   must be declared in ENDPOINTS with method, path, and purpose, and every
 *   declared endpoint must actually exist on the server.
 * @example run `npm run test --prefix api -- agentGuide.apiCoverage`
 ***/

/***
 * MARK: EXCLUDED_ROUTES
 * @description Documented exceptions not expected in the HTTP REST catalog:
 *   - `GET /ws`: WebSocket endpoint (documented in AGENT_GUIDE.websocket).
 *   - `*`, `/*`, `/documentation*`: Static assets, SPA fallback, Swagger UI.
 ***/
const EXCLUDED_ROUTES = new Set([
	"GET /ws",
]);

/***
 * MARK: normalizePath
 * @description Normalizes route parameter segments (:id, :projectId, :taskId)
 *   so route-definition alternatives match guide entries consistently.
 ***/
export function normalizePath(routePath) {
	return routePath
		.split("/")
		.map((seg) => seg.split("|")[0])
		.map((seg) => (seg.startsWith(":") ? ":param" : seg))
		.join("/");
}

describe("agentGuide endpoint coverage", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("declares every registered REST route in ENDPOINTS", () => {
		const registered = [];
		for (const r of listRegisteredRoutePaths(app)) {
			const cleanPath = r.path.split("/").map((seg) => seg.split("|")[0]).join("/");
			if (isExcludedInfraPath(cleanPath)) continue;
			for (const method of r.methods) {
				const key = `${method} ${cleanPath}`;
				if (EXCLUDED_ROUTES.has(key)) continue;
				registered.push({
					key: `${method} ${normalizePath(cleanPath)}`,
					display: `${method} ${cleanPath}`,
				});
			}
		}

		const guideKeys = new Set(
			ENDPOINTS.map((e) => `${e.method} ${normalizePath(e.path)}`),
		);

		const missing = registered
			.filter((r) => !guideKeys.has(r.key))
			.map((r) => r.display);

		expect(missing).toEqual([]);
	});

	it("does not list non-existent routes in ENDPOINTS", () => {
		const registeredKeys = new Set();
		for (const r of listRegisteredRoutePaths(app)) {
			const cleanPath = r.path.split("/").map((seg) => seg.split("|")[0]).join("/");
			for (const method of r.methods) {
				registeredKeys.add(`${method} ${normalizePath(cleanPath)}`);
			}
		}

		const stale = ENDPOINTS
			.map((e) => ({
				key: `${e.method} ${normalizePath(e.path)}`,
				display: `${e.method} ${e.path}`,
			}))
			.filter((e) => !registeredKeys.has(e.key))
			.map((e) => e.display);

		expect(stale).toEqual([]);
	});
});
