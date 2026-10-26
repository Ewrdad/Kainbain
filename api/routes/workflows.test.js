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
import { describe, it, expect } from "vitest";
import app from "../index.js";

// The happy-path test truly prompts the agent session (required-surface
// `prompt`), so it may only run against the mock seam — see the TEST ENV
// CONTRACT in api/sessionStore.js. Bare runs (NODE_ENV unset) skip it instead
// of invoking a live model runtime (mirrors the describe.skipIf precedent in
// agent/git.integration.test.js).
const isTestEnv = process.env.NODE_ENV === "test";

/**
 * MARK: Workflow API Integration
 * @description Verifies workflow execution endpoints. The session behind
 *   /workflows/start is the mock harness session (TEST ENV CONTRACT,
 *   api/sessionStore.js): `session.prompt` records the prompt and streams
 *   mock events — no real model runtime is ever reached, so the test asserts
 *   the route contract (run fields + registry listing) only.
 */
describe("Workflow API Integration", () => {
	it("POST /workflows/start requires a workflowId", async () => {
		await app.ready();

		const res = await app.inject({
			method: "POST",
			url: "/workflows/start",
			payload: {},
		});

		expect(res.statusCode).toBe(400);
	});

	it.skipIf(!isTestEnv)(
		"should start a workflow and track its progress",
		async () => {
			await app.ready();

			// Hermetic project: sample seeding is off by default, so the
			// board starts empty and the no-projectId fallback would 404.
			const created = await app.inject({
				method: "POST",
				url: "/projects",
				payload: { name: "Workflow Progress App" },
			});
			expect(created.statusCode).toBe(201);
			const projectId = JSON.parse(created.payload).id;

			const workflowId = "research-and-code";
			const res = await app.inject({
				method: "POST",
				url: "/workflows/start",
				payload: { workflowId, projectId },
			});

			expect(res.statusCode).toBe(200);
			const run = JSON.parse(res.payload);
			expect(run.workflowId).toBe(workflowId);
			expect(run.status).toBe("In Progress");

			// List workflows
			const listRes = await app.inject({ method: "GET", url: "/workflows" });
			expect(listRes.statusCode).toBe(200);
			const workflows = JSON.parse(listRes.payload);
			expect(workflows.some((w) => w.id === run.id)).toBe(true);
		},
	);

	it.skipIf(!isTestEnv)(
		"scopes GET /workflows by projectId (no cross-project leakage)",
		async () => {
			await app.ready();

			const makeProject = async (name) => {
				const res = await app.inject({
					method: "POST",
					url: "/projects",
					payload: { name },
				});
				expect(res.statusCode).toBe(201);
				return JSON.parse(res.payload);
			};
			const projectA = await makeProject("Workflow Scope A");
			const projectB = await makeProject("Workflow Scope B");

			const startRun = async (projectId) => {
				const res = await app.inject({
					method: "POST",
					url: "/workflows/start",
					payload: { workflowId: "wf-default", projectId },
				});
				expect(res.statusCode).toBe(200);
				return JSON.parse(res.payload);
			};
			const runA = await startRun(projectA.id);
			const runB = await startRun(projectB.id);
			expect(runA.projectId).toBe(projectA.id);
			expect(runB.projectId).toBe(projectB.id);

			const scopedA = await app.inject({
				method: "GET",
				url: `/workflows?projectId=${projectA.id}`,
			});
			expect(scopedA.statusCode).toBe(200);
			const runsA = JSON.parse(scopedA.payload);
			expect(runsA.some((run) => run.id === runA.id)).toBe(true);
			expect(runsA.some((run) => run.id === runB.id)).toBe(false);
			expect(runsA.every((run) => run.projectId === projectA.id)).toBe(true);
		},
	);
});
