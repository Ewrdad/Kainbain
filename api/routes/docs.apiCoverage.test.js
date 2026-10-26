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
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import app from "../index.js";

/**
 * MARK: API reference coverage tests
 * @description Guards the hand-authored `site-docs/api-reference.md` against
 *   silent drift: every route registered on the real Fastify app (minus
 *   explicitly excluded infra paths) must be mentioned in the article, and the
 *   article must be reachable via GET /docs and GET /docs/:slug. Re-checked
 *   wording in the markdown never breaks this suite — only a documented path
 *   going missing (or a new route shipping without docs) turns it red.
 * @example run `npm run test --prefix api -- docs.apiCoverage`
 */

import {
	listRegisteredRoutePaths,
	isExcludedInfraPath,
	routePathPattern,
} from "./routeCoverageHelpers.js";

export { listRegisteredRoutePaths, isExcludedInfraPath, routePathPattern };

const ARTICLE_PATH = path.join(import.meta.dirname, "..", "..", "site-docs", "api-reference.md");

describe("API reference coverage", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("documents every registered route", () => {
		const markdown = fs.readFileSync(ARTICLE_PATH, "utf8");
		const missing = listRegisteredRoutePaths(app)
			.map((r) => ({ ...r, path: r.path.split("/").map((seg) => seg.split("|")[0]).join("/") }))
			.filter((r) => !isExcludedInfraPath(r.path))
			.filter((r) => !routePathPattern(r.path).test(markdown))
			.map((r) => `${r.methods.join(",")} ${r.path}`);
		expect(missing).toEqual([]);
	});

	it("is reachable via GET /docs and GET /docs/:slug", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		const entry = index.docs.find((d) => d.slug === "api-reference");
		expect(entry).toMatchObject({
			title: "API reference",
			section: "working-with",
		});
		const res = await app.inject({ method: "GET", url: "/docs/api-reference" });
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toContain("text/markdown");
		expect(res.payload).toContain("/status");
	});
});
