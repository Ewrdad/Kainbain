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
import {
	AGENT_GUIDE,
	renderMarkdownGuide,
	API_BASE,
} from "../agentGuide.js";

/**
 * MARK: Agent Integration Entry Point Tests
 * @description Verifies the /agent endpoints that let a non-KainBain agent
 *   discover and drive the live service (create/view/manage tasks).
 * @example run `npm run test:api`
 */
describe("Agent Integration Guide", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("exposes GET /agent", () => {
		expect(app.hasRoute({ method: "GET", url: "/agent" })).toBe(true);
	});

	it("GET /agent returns the structured guide with endpoints and workflow", async () => {
		const res = await app.inject({ method: "GET", url: "/agent" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);

		expect(body.name).toBe("KainBain");
		expect(typeof body.apiBase).toBe("string");
		expect(Array.isArray(body.endpoints)).toBe(true);
		expect(Array.isArray(body.recommendedWorkflow)).toBe(true);

		// The endpoint catalog covers create/view/manage + execution.
		const paths = body.endpoints.map((e) => `${e.method} ${e.path}`);
		expect(paths).toContain("POST /tasks");
		expect(paths).toContain("GET /tasks");
		expect(paths).toContain("GET /tasks/:id");
		expect(paths).toContain("POST /tasks/:id/execute");
		expect(paths).toContain("POST /tasks/:id/advance");
		expect(paths).toContain("POST /tasks/:id/reject");
		expect(paths).toContain("POST /tasks/:id/complete");
		expect(paths).toContain("GET /projects");

		// A sample create-task body is provided for agents.
		expect(body.sampleCreateTask.method).toBe("POST");
		expect(body.sampleCreateTask.body).toHaveProperty("execute", true);

		// Intro should tell the agent how to discover + act.
		expect(body.introduction.some((s) => /projectId/i.test(s))).toBe(true);

		// The knowledge-base docs endpoints are discoverable from /agent.
		expect(paths).toContain("GET /docs");
		expect(paths).toContain("GET /docs/:slug");
	});

	it("GET /agent/schema returns the compact machine manifest", async () => {
		const res = await app.inject({ method: "GET", url: "/agent/schema" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(typeof body.version).toBe("string");
		expect(Array.isArray(body.endpoints)).toBe(true);
		expect(typeof body.taskStatuses).toBe("object");
		expect(typeof body.stageTypes).toBe("object");
		expect(body.websocket).toHaveProperty("eventTypes");
	});

	it("GET /agent/guide returns a markdown document", async () => {
		const res = await app.inject({ method: "GET", url: "/agent/guide" });
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toContain("text/markdown");
		const md = res.payload;
		expect(md).toContain("# KainBain Agent Integration Guide");
		expect(md).toContain("## Endpoints");
		expect(md).toContain("POST /tasks");
		expect(md).toContain("GET /docs");
		expect(md).toContain("Recommended workflow for an integrating agent");
	});

	it("the shared guide is internally consistent with the API", () => {
		// projectId is optional and falls back to the active project.
		expect(AGENT_GUIDE.concepts.projectId).toMatch(/active project/);
		// The guide advertises the documented API base.
		expect(API_BASE).toContain("http");
	});
});
