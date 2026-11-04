import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Fastify from "fastify";
import { RunnerRegistry } from "./runnerRegistry.js";
import { ClaimStore } from "./claimStore.js";
import { IntegrationQueue } from "./integrationQueue.js";
import { registerRunnerRoutes } from "./runnerRoutes.js";

const tmpFile = (name) =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-intbusy-")), name);

const FACTS = {
	// 'pi' covers merge dispatch (merge stages resolve the default harness
	// for matching); 'mock' serves the agent candidate below.
	harnesses: [{ id: "mock", version: "0.0.0" }, { id: "pi", version: "0.0.0" }],
	models: ["mock-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 4096,
	versions: { protocol: "v1", runner: "0.1.0", api: "1.0.0" },
};

function git(cwd, args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function originWithMergeTask(taskBranch) {
	const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intbusy-origin-"));
	execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
	const backend = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intbusy-backend-"));
	execFileSync("git", ["clone", "-q", origin, backend], { stdio: "ignore" });
	for (const dir of [backend]) {
		execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
	}
	fs.writeFileSync(path.join(backend, "base.txt"), "base");
	execFileSync("git", ["add", "."], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "init"], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["branch", "-M", "main"], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["push", "-q", "origin", "main"], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["checkout", "-qb", taskBranch], { cwd: backend, stdio: "ignore" });
	fs.writeFileSync(path.join(backend, "task.txt"), "work");
	execFileSync("git", ["add", "."], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "work"], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["push", "-q", "origin", taskBranch], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["checkout", "-q", "main"], { cwd: backend, stdio: "ignore" });
	return { origin, backend };
}

/***
 * MARK: Busy Merge Falls Through Dispatch
 * @description A merge candidate whose integration slot is leased must not
 *   starve the fleet: `POST /runners/dispatch` skips the busy merge (its
 *   request stays queued) and assigns the next matchable candidate. When
 *   the busy merge is the only candidate, the route still answers
 *   `INTEGRATION_BUSY` so Runners back off without burning idle budget.
 *   Minimal Fastify app over the real route, registry, claim store, and
 *   queue; tasks and projects are stubs, git is a throwaway origin.
 ***/
describe("Busy merge falls through dispatch", () => {
	let app;
	let registry;
	let claims;
	let queue;
	let project;
	let listed;
	const dirs = [];

	const credentialFor = (runnerId) => {
		registry.register({ runnerId, joinToken: "join-secret", facts: FACTS });
		const { credential } = registry.approve(runnerId);
		registry.heartbeat({ runnerId, credential, facts: FACTS });
		return credential;
	};

	const dispatchAs = (credential) =>
		app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: {},
		});

	const stages = [
		{ id: "agent-1", name: "Implement", type: "agent", harness: "mock" },
		{ id: "merge-1", name: "Merge", type: "merge" },
	];
	const taskMerge = {
		id: "tm",
		branch: "kb/tm",
		status: "in_stage",
		currentStageId: "merge-1",
		enteredStageAt: "2026-11-04T08:00:00.000Z",
		stages,
		reports: [],
	};
	const taskAgent = {
		id: "ta",
		status: "in_stage",
		currentStageId: "agent-1",
		enteredStageAt: "2026-11-04T07:00:00.000Z",
		stages,
		reports: [],
	};

	beforeAll(async () => {
		const { origin, backend } = originWithMergeTask("kb/tm");
		dirs.push(origin, backend);
		project = { id: "p1", cwd: backend, stages };
		listed = [taskMerge, taskAgent];
		registry = new RunnerRegistry({ joinToken: "join-secret", stateFile: tmpFile("runners.json") });
		claims = new ClaimStore({ stateFile: tmpFile("claims.json") });
		queue = new IntegrationQueue();
		const taskStore = {
			listTasks: () => listed,
			getTask: (projectId, taskId) => listed.find((t) => t.id === taskId) || null,
			isTaskBlocked: () => ({ blocked: false }),
			resolveTaskBranch: (t) => t.branch || `kb/${t.id}`,
			updateTask: (projectId, taskId, updates) => {
				Object.assign(listed.find((t) => t.id === taskId) || {}, updates);
			},
		};
		const projectStore = {
			listProjects: () => [project],
			getProject: () => project,
		};
		app = Fastify();
		await app.register(registerRunnerRoutes, {
			deps: {
				runnerRegistry: registry,
				integrationQueue: queue,
				taskStore,
				projectStore,
				claimStore: claims,
				steerStore: {},
				executionLedger: {},
				eventBridge: null,
				resolveAndGuardProject: (id) => id,
			},
		});
		await app.ready();
		// The merge slot is leased to another Runner: every merge dispatch
		// from here on meets a busy slot.
		const holder = credentialFor("merge-holder");
		queue.enqueue({
			projectId: "p1",
			targetBranch: "main",
			taskId: "tm",
			taskBranch: "kb/tm",
			expectedTaskSha: git(backend, ["rev-parse", "origin/kb/tm"]),
			expectedTargetSha: git(backend, ["rev-parse", "origin/main"]),
			mergeAttemptId: "m-tm",
		});
		const leased = queue.acquire({ projectId: "p1", targetBranch: "main", runnerId: "merge-holder" });
		expect(leased.leased).toBe(true);
		expect(holder).toBeTruthy();
	});

	afterAll(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	it("assigns the next candidate instead of wedging on a busy merge", async () => {
		const worker = credentialFor("merge-worker");
		const res = await dispatchAs(worker);
		expect(res.statusCode).toBe(200);
		const answer = JSON.parse(res.payload);
		expect(answer.assigned).toBe(true);
		expect(answer.taskId).toBe("ta");
		// The busy merge request stays queued for its holder, and no stale
		// claim is left behind on the merge task.
		expect(queue.describe({ projectId: "p1", targetBranch: "main" }).depth).toBe(1);
		expect(claims.describe("tm")).toBeNull();
		expect(claims.describe("ta")).toMatchObject({ runnerId: "merge-worker" });
	});

	it("still answers INTEGRATION_BUSY when the busy merge is the only candidate", async () => {
		listed.splice(0, listed.length, taskMerge);
		try {
			const worker = credentialFor("merge-worker-2");
			const res = await dispatchAs(worker);
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload)).toMatchObject({
				assigned: false,
				code: "INTEGRATION_BUSY",
			});
		} finally {
			listed.splice(0, listed.length, taskMerge, taskAgent);
		}
	});
});
