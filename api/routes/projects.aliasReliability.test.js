import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll } from "vitest";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the route module boots config, which
// snapshots `process.env` at first evaluation.
afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import Fastify from "fastify";
import projectsRoutes from "./projects.js";

/***
 * MARK: Project alias-reliability route tests
 * @description Pins the HTTP surface of `GET
 *   /projects/:id/aliases/reliability`: per-alias per-target buckets with
 *   rejected runs excluded, scoping to the requested project, 404 for
 *   unknown projects, and `{ aliases: [] }` (never a fake 0%) when nothing
 *   is attributed yet. Hermetic wiring (route module + canned store) so
 *   fixture reports give exact assertions without touching live project dirs.
 ***/

function hermeticApp({ projects }) {
	const app = Fastify();
	return app.register(projectsRoutes, {
		deps: {
			projectStore: {
				listProjects: () => projects,
				getProject: (id) => projects.find((p) => p.id === id) || null,
			},
			taskStore: {
				projectStore: { listProjects: () => projects },
				listTasks: (projectId) =>
					projects.find((p) => p.id === projectId)?.tasks || [],
			},
			skillsRegistry: {},
			eventBridge: {},
		},
	});
}

function report(overrides = {}) {
	return {
		status: "PASSED",
		createdAt: "2026-10-01T10:00:00.000Z",
		...overrides,
	};
}

describe("GET /projects/:id/aliases/reliability", () => {
	it("aggregates per-alias per-target buckets and excludes rejections", async () => {
		const app = hermeticApp({
			projects: [
				{
					id: "p1",
					cwd: null,
					tasks: [
						{
							id: "t1",
							reports: [
								report({ aliasName: "worker", harnessId: "pi", modelRef: "google::m", failureKind: "none", createdAt: "2026-10-01T10:00:00.000Z" }),
								report({ aliasName: "worker", harnessId: "pi", modelRef: "google::m", failureKind: "infrastructure", status: "FAILED", createdAt: "2026-10-01T11:00:00.000Z" }),
								report({ aliasName: "worker", harnessId: "pi", modelRef: "google::m", failureKind: "rejected", status: "FAILED", createdAt: "2026-10-01T12:00:00.000Z" }),
								report({ aliasName: "worker", harnessId: "antigravity", modelRef: "google::g", failureKind: "none", createdAt: "2026-10-01T13:00:00.000Z" }),
								// Unattributed fallback run: never credited to the alias.
								report({ harnessId: "pi", modelRef: "google::m", failureKind: "none" }),
							],
						},
					],
				},
			],
		});
		await app.ready();

		const res = await app.inject({ method: "GET", url: "/projects/p1/aliases/reliability" });

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.aliases).toHaveLength(1);
		expect(body.aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 3,
			successes: 2,
			infraFailures: 1,
			excludedRejected: 1,
			successRate: 66.7,
		});
		expect(body.aliases[0].targets).toHaveLength(2);
		await app.close();
	});

	it("counts sample-driven runs (run-driven, not report-driven)", async () => {
		const app = hermeticApp({
			projects: [
				{
					id: "p1",
					cwd: null,
					tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							{ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "none", at: 1 },
							{ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "none", at: 2 },
							{ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "none", at: 3 },
							{ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "none", at: 4 },
							{ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "infrastructure", at: 5 },
						],
						reports: [
							report({ aliasName: "worker", harnessId: "vibe", modelRef: "mistral::large", failureKind: "none" }),
						],
					},
					],
				},
			],
		});
		await app.ready();

		const res = await app.inject({ method: "GET", url: "/projects/p1/aliases/reliability" });

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.aliases).toHaveLength(1);
		expect(body.aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 5,
			successes: 4,
			infraFailures: 1,
			excludedRejected: 0,
			successRate: 80,
		});
		expect(body.aliases[0].targets).toHaveLength(1);
		expect(body.aliases[0].targets[0]).toMatchObject({
			harness: "vibe",
			model: "mistral::large",
			runs: 5,
			successRate: 80,
		});
		await app.close();
	});

	it("scopes stats to the requested project", async () => {
		const app = hermeticApp({
			projects: [
				{
					id: "p1",
					cwd: null,
					tasks: [
						{ id: "t1", reports: [report({ aliasName: "worker", harnessId: "pi", modelRef: "m", failureKind: "none" })] },
					],
				},
				{
					id: "p2",
					cwd: null,
					tasks: [
						{
							id: "t2",
							reports: [
								report({ aliasName: "worker", harnessId: "pi", modelRef: "m", failureKind: "infrastructure", status: "FAILED" }),
								report({ aliasName: "worker", harnessId: "pi", modelRef: "m", failureKind: "infrastructure", status: "FAILED" }),
								report({ aliasName: "other", harnessId: "pi", modelRef: "m", failureKind: "none" }),
							],
						},
					],
				},
			],
		});
		await app.ready();

		const res = await app.inject({ method: "GET", url: "/projects/p1/aliases/reliability" });

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body).toEqual({
			aliases: [
				expect.objectContaining({
					aliasName: "worker",
					runs: 1,
					successes: 1,
					infraFailures: 0,
					successRate: 100,
				}),
			],
		});
		await app.close();
	});

	it("answers 404 for an unknown project", async () => {
		const app = hermeticApp({ projects: [{ id: "p1", cwd: null, tasks: [] }] });
		await app.ready();

		const res = await app.inject({ method: "GET", url: "/projects/ghost/aliases/reliability" });

		expect(res.statusCode).toBe(404);
		await app.close();
	});

	it("answers an empty alias list when nothing is attributed yet", async () => {
		const app = hermeticApp({
			projects: [{ id: "p1", cwd: null, tasks: [{ id: "t1", reports: [report({})] }] }],
		});
		await app.ready();

		const res = await app.inject({ method: "GET", url: "/projects/p1/aliases/reliability" });

		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ aliases: [] });
		await app.close();
	});
});
