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
import app from "../index.js";

/**
 * MARK: Docs route tests
 * @description Verifies the agent-consumable docs endpoints over the real
 *   Fastify app: GET /docs index shape/ordering, GET /docs/:slug raw markdown,
 *   unknown-slug 404, and traversal rejection. Runs against the committed
 *   site-docs content, so it also proves the initial article set ships.
 * @example run `npm run test:api`
 */
describe("Docs routes", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("exposes GET /docs and GET /docs/:slug", () => {
		expect(app.hasRoute({ method: "GET", url: "/docs" })).toBe(true);
		expect(app.hasRoute({ method: "GET", url: "/docs/:slug" })).toBe(true);
	});

	it("GET /docs lists both avenues in order", async () => {
		const res = await app.inject({ method: "GET", url: "/docs" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.sections).toEqual(["how-it-works", "working-with"]);
		expect(Array.isArray(body.docs)).toBe(true);
		expect(body.docs.length).toBeGreaterThan(0);
		const sections = new Set(body.docs.map((d) => d.section));
		expect(sections.has("how-it-works")).toBe(true);
		expect(sections.has("working-with")).toBe(true);
		// Ordering: every how-it-works article precedes every working-with one.
		const lastHow = Math.max(
			...body.docs.map((d, i) => (d.section === "how-it-works" ? i : -1)),
		);
		const firstWorking = Math.min(
			...body.docs.map((d, i) => (d.section === "working-with" ? i : body.docs.length)),
		);
		expect(lastHow).toBeLessThan(firstWorking);
		for (const d of body.docs) {
			expect(typeof d.slug).toBe("string");
			expect(typeof d.title).toBe("string");
			expect(typeof d.order).toBe("number");
		}
	});

	it("GET /docs/:slug returns raw markdown, not a JSON envelope", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		const slug = index.docs[0].slug;
		const res = await app.inject({ method: "GET", url: `/docs/${slug}` });
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toContain("text/markdown");
		expect(res.payload).toContain("#");
		expect(() => JSON.parse(res.payload)).toThrow();
	});

	it("every indexed slug serves its raw markdown article", async () => {
		const index = JSON.parse((await app.inject({ method: "GET", url: "/docs" })).payload);
		expect(index.docs.length).toBeGreaterThan(0);
		for (const doc of index.docs) {
			const res = await app.inject({ method: "GET", url: `/docs/${doc.slug}` });
			expect(res.statusCode).toBe(200);
			expect(res.headers["content-type"]).toContain("text/markdown");
			expect(res.payload).toContain("#");
		}
	});

	it("GET /docs/:slug 404s unknown slugs and rejects traversal", async () => {
		const missing = await app.inject({ method: "GET", url: "/docs/no-such-article" });
		expect(missing.statusCode).toBe(404);
		expect(JSON.parse(missing.payload).error).toBe("Doc not found");

		const traversal = await app.inject({ method: "GET", url: "/docs/..%2F..%2Fpackage" });
		expect([400, 404]).toContain(traversal.statusCode);
	});
});
