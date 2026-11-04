import { describe, it, expect } from "vitest";
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
	execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: backend, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "t"], { cwd: backend, stdio: "ignore" });
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

const stages = [
	{ id: "agent-1", name: "Implement", type: "agent", harness: "mock" },
	{ id: "merge-1", name: "Merge", type: "merge" },
];

const makeTasks = () => [
	{
		id: "tm",
		branch: "kb/tm",
		status: "in_stage",
		currentStageId: "merge-1",
		enteredStageAt: "2026-11-04T08:00:00.000Z",
		stages,
		reports: [],
	},
	{
		id: "ta",
		status: "in_stage",
		currentStageId: "agent-1",
		enteredStageAt: "2026-11-04T07:00:00.000Z",
		stages,
		reports: [],
	},
];

async function buildApp(backend) {
	const project = { id: "p1", cwd: backend, stages };
	const listed = makeTasks();
	const registry = new RunnerRegistry({ joinToken: "join-secret", stateFile: tmpFile("runners.json") });
	const claims = new ClaimStore({ stateFile: tmpFile("claims.json") });
	const queue = new IntegrationQueue();
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
	const app = Fastify();
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
	return { app, registry, claims, queue, project, listed, credentialFor, dispatchAs, backend };
}

/***
 * MARK: Merge Dispatch Answer Shape
 * @description The merge-dispatch answer must be a complete assignment: a
 *   free slot returns `assigned: true` with the claim fencing
 *   (`executionId`/`epoch`), `kind: "integrate"`, and the lease payload —
 *   anything less reads as "no work" to the Runner while the claim and
 *   lease it minted lapse unseen (fleet-wide idle merge churn). A busy
 *   slot instead falls through to the next candidate without stranding
 *   the merge request, and still answers `INTEGRATION_BUSY` when the busy
 *   merge is the only candidate. Minimal Fastify app over the real route,
 *   registry, claim store, and queue; tasks and projects are stubs, git is
 *   a throwaway origin.
 ***/
describe("Merge dispatch answer shape", () => {
	const dirs = [];
	const track = ({ origin, backend }) => dirs.push(origin, backend);

	it("assigns a free merge slot as a complete integrate job", async () => {
		const { origin, backend } = originWithMergeTask("kb/tm");
		track({ origin, backend });
		const { claims, queue, credentialFor, dispatchAs } = await buildApp(backend);
		const worker = credentialFor("merge-worker");
		const res = await dispatchAs(worker);
		expect(res.statusCode).toBe(200);
		const answer = JSON.parse(res.payload);
		expect(answer.assigned).toBe(true);
		expect(answer).toMatchObject({
			projectId: "p1",
			taskId: "tm",
			runnerId: "merge-worker",
			kind: "integrate",
			stageId: "merge-1",
		});
		expect(typeof answer.executionId).toBe("string");
		expect(typeof answer.epoch).toBe("number");
		expect(answer.integration).toMatchObject({
			taskBranch: "kb/tm",
			targetBranch: "main",
			expectedTaskSha: git(backend, ["rev-parse", "origin/kb/tm"]),
			expectedTargetSha: git(backend, ["rev-parse", "origin/main"]),
		});
		expect(typeof answer.integration.mergeAttemptId).toBe("string");
		expect(typeof answer.integration.integrationExecutionId).toBe("string");
		expect(typeof answer.integration.integrationEpoch).toBe("number");
		// Claim and lease fence the same execution the answer names.
		expect(claims.describe("tm")).toMatchObject({
			runnerId: "merge-worker",
			executionId: answer.executionId,
			epoch: answer.epoch,
		});
		const scope = queue.describe({ projectId: "p1", targetBranch: "main" });
		expect(scope.lease).toMatchObject({
			taskId: "tm",
			runnerId: "merge-worker",
			executionId: answer.integration.integrationExecutionId,
			epoch: answer.integration.integrationEpoch,
		});
		for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
	});

	it("assigns the next candidate instead of wedging on a busy merge", async () => {
		const { origin, backend } = originWithMergeTask("kb/tm");
		track({ origin, backend });
		const { claims, queue, credentialFor, dispatchAs } = await buildApp(backend);
		const holder = credentialFor("merge-holder");
		expect(holder).toBeTruthy();
		queue.enqueue({
			projectId: "p1",
			targetBranch: "main",
			taskId: "tm",
			taskBranch: "kb/tm",
			expectedTaskSha: "a".repeat(40),
			expectedTargetSha: "b".repeat(40),
			mergeAttemptId: "m-tm",
		});
		expect(queue.acquire({ projectId: "p1", targetBranch: "main", runnerId: "merge-holder" }).leased).toBe(true);
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
		for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
	});

	it("still answers INTEGRATION_BUSY when the busy merge is the only candidate", async () => {
		const { origin, backend } = originWithMergeTask("kb/tm");
		track({ origin, backend });
		const ctx = await buildApp(backend);
		ctx.listed.splice(0, ctx.listed.length, ctx.listed[0]);
		ctx.credentialFor("merge-holder-2");
		ctx.queue.enqueue({
			projectId: "p1",
			targetBranch: "main",
			taskId: "tm",
			taskBranch: "kb/tm",
			expectedTaskSha: "a".repeat(40),
			expectedTargetSha: "b".repeat(40),
			mergeAttemptId: "m-tm-2",
		});
		expect(ctx.queue.acquire({ projectId: "p1", targetBranch: "main", runnerId: "merge-holder-2" }).leased).toBe(true);
		const worker = ctx.credentialFor("merge-worker-2");
		const res = await ctx.dispatchAs(worker);
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toMatchObject({
			assigned: false,
			code: "INTEGRATION_BUSY",
		});
		for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
	});
});
