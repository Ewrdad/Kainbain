import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { RunnerRegistry } from "./runnerRegistry.js";
import { IntegrationQueue } from "./integrationQueue.js";
import { registerRunnerRoutes } from "./runnerRoutes.js";

const tmpRunnerState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-test-")), "runners.json");

const FACTS = {
	harnesses: [{ id: "mock", version: "0.0.0" }],
	models: ["mock-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 4096,
	versions: { protocol: "v1", runner: "test" },
};

const queueEntry = (over = {}) => ({
	projectId: "p1",
	targetBranch: "main",
	taskId: "t1",
	taskBranch: "kb/t1",
	expectedTaskSha: "a".repeat(40),
	expectedTargetSha: "b".repeat(40),
	mergeAttemptId: "m1",
	...over,
});

/***
 * MARK: Stage RunnerPolicy Acquire Integration
 * @description Verifies the per-stage Runner allow/block list on the direct
 *   merge-lease route (`POST /runners/integration/acquire`): the route peeks
 *   the head queued entry, resolves its task's stage, and refuses Runners
 *   the stage does not allow with 409 — without leasing. A minimal Fastify
 *   app hosts the real route with a real registry and queue (enqueue is
 *   backend-internal, so the full app cannot seed it over HTTP).
 ***/
describe("Stage RunnerPolicy Acquire Integration", () => {
	let app;
	let registry;
	let queue;
	let tasks;
	let projects;

	const credentialFor = (runnerId) => {
		registry.register({ runnerId, joinToken: "join-secret", facts: FACTS });
		return registry.approve(runnerId).credential;
	};

	const acquireAs = (credential, payload) =>
		app.inject({
			method: "POST",
			url: "/runners/integration/acquire",
			headers: { "x-runner-credential": credential },
			payload,
		});

	beforeAll(async () => {
		registry = new RunnerRegistry({ joinToken: "join-secret", stateFile: tmpRunnerState() });
		queue = new IntegrationQueue();
		tasks = new Map();
		projects = new Map();
		app = Fastify();
		await app.register(registerRunnerRoutes, {
			deps: {
				runnerRegistry: registry,
				integrationQueue: queue,
				taskStore: { getTask: (projectId, taskId) => tasks.get(`${projectId}:${taskId}`) || null },
				projectStore: { getProject: (projectId) => projects.get(projectId) || null },
				claimStore: {},
				steerStore: {},
				executionLedger: {},
				eventBridge: null,
				resolveAndGuardProject: (id) => id,
			},
		});
		await app.ready();
	});

	it("allow-mode: the head task's stage refuses unlisted Runners without leasing", async () => {
		projects.set("p1", {
			id: "p1",
			stages: [{ id: "merge-1", name: "Merge", type: "merge", runnerPolicy: { mode: "allow", runners: ["merge-allowed"] } }],
		});
		tasks.set("p1:t1", { id: "t1", currentStageId: "merge-1" });
		queue.enqueue(queueEntry());
		const outsider = credentialFor("merge-outsider");
		const refused = await acquireAs(outsider, { projectId: "p1", targetBranch: "main" });
		expect(refused.statusCode).toBe(409);
		expect(JSON.parse(refused.payload).code).toBe("RUNNER_NOT_ALLOWED");
		// Refused: the entry is still queued for an eligible Runner.
		expect(queue.describe({ projectId: "p1", targetBranch: "main" }).depth).toBe(1);
		const insider = credentialFor("merge-allowed");
		const leased = await acquireAs(insider, { projectId: "p1", targetBranch: "main" });
		expect(leased.statusCode).toBe(200);
		expect(JSON.parse(leased.payload)).toMatchObject({ leased: true });
	});

	it("block-mode: the listed Runner is refused, others lease", async () => {
		projects.set("p2", {
			id: "p2",
			stages: [{ id: "merge-1", name: "Merge", type: "merge", runnerPolicy: { mode: "block", runners: ["merge-blocked"] } }],
		});
		tasks.set("p2:t9", { id: "t9", currentStageId: "merge-1" });
		queue.enqueue(queueEntry({ projectId: "p2", taskId: "t9", taskBranch: "kb/t9", mergeAttemptId: "m9" }));
		const blocked = credentialFor("merge-blocked");
		const refused = await acquireAs(blocked, { projectId: "p2", targetBranch: "main" });
		expect(refused.statusCode).toBe(409);
		expect(JSON.parse(refused.payload).code).toBe("RUNNER_BLOCKED");
		const other = credentialFor("merge-other");
		const leased = await acquireAs(other, { projectId: "p2", targetBranch: "main" });
		expect(JSON.parse(leased.payload)).toMatchObject({ leased: true });
	});

	it("fails open when the head task or stage cannot be resolved", async () => {
		// No task or project seeded for p3: the lease proceeds as before.
		queue.enqueue(queueEntry({ projectId: "p3", taskId: "ghost", taskBranch: "kb/ghost", mergeAttemptId: "mg" }));
		const runner = credentialFor("merge-failopen");
		const leased = await acquireAs(runner, { projectId: "p3", targetBranch: "main" });
		expect(leased.statusCode).toBe(200);
		expect(JSON.parse(leased.payload)).toMatchObject({ leased: true });
		// Empty queue still reports leased:false (legacy behavior).
		const empty = await acquireAs(runner, { projectId: "p4", targetBranch: "main" });
		expect(JSON.parse(empty.payload)).toEqual({ leased: false });
	});
});
