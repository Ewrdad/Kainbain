import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";
process.env.KAINBAIN_CLAIM_TTL_MS = "300000";

const { default: app } = await import("../index.js");
const { taskStore } = await import("../taskStore.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const FACTS = {
	harnesses: [{ id: "mock", version: "0.0.0" }],
	models: ["mock-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test" },
};

/***
 * MARK: Runner Tenant Fence (WP1 Q4 matrix)
 * @description Route-level regression suite for the cross-project tenant
 *   fence (AUDIT H-1 + H-4): every runner-mutating route demands an explicit
 *   `projectId` (missing/blank → 400 `MISSING_PROJECT_ID`, never the active
 *   project), and every lease-guarded mutation compares the request project
 *   against the lease's home project (mismatch → 409
 *   `PROJECT_FENCE_MISMATCH`, lease untouched). Synthetic fixtures only —
 *   two temp projects (`proj-alpha` / `proj-beta` style) plus one seeded
 *   same-id mirror task; no live project is touched.
 ***/
describe("Runner tenant fence (WP1 Q4 matrix)", () => {
	let alpha;
	let beta;
	let taskA;
	let taskB;
	let taskC;
	let taskD;
	let credR;
	let credR2;
	let leaseB;

	async function onboard(runnerId) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const approval = await app.inject({
			method: "POST",
			url: `/runners/${runnerId}/approve`,
		});
		expect(approval.statusCode).toBe(200);
		return JSON.parse(approval.payload).credential;
	}

	async function makeTask(projectId, goal) {
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, goal },
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload).id;
	}

	async function monitor() {
		const res = await app.inject({ method: "GET", url: "/runners/monitor" });
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload);
	}

	beforeAll(async () => {
		await app.ready();
		for (const name of ["proj-alpha", "proj-beta"]) {
			const res = await app.inject({
				method: "POST",
				url: "/projects",
				payload: {
					name,
					gitUrl: `https://git.example.com/team/${name}.git`,
				},
			});
			expect(res.statusCode).toBe(201);
			if (name === "proj-alpha") alpha = JSON.parse(res.payload);
			else beta = JSON.parse(res.payload);
		}
		// proj-alpha is created first, so it is the active project — the
		// view-route control below depends on that fallback.
		taskA = await makeTask(alpha.id, "Fence fixture A (shared id)");
		taskB = await makeTask(beta.id, "Fence fixture B (second claimer + legit complete)");
		taskC = await makeTask(beta.id, "Fence fixture C (stale epoch)");
		taskD = await makeTask(alpha.id, "Fence fixture D (omitted claim only)");
		// Same-id mirror: taskA's id also exists in proj-beta, so a replay
		// of alpha's lease material against beta's task id reaches the
		// ledger fence instead of 404ing at the task lookup. The lease is
		// keyed by task id alone, exactly like production.
		taskStore._getMap(beta.id).set(taskA, {
			id: taskA,
			status: "in_stage",
			currentStageId: "s1",
			goal: "Seeded same-id mirror of fence fixture A",
			title: "Seeded same-id mirror of fence fixture A",
			history: [],
		});
		credR = await onboard("fence-runner-r1");
		credR2 = await onboard("fence-runner-r2");
	});

	describe("omitted projectId → 400 on every mutating route", () => {
		const taskRoutes = [
			["claim-heartbeat", { executionId: "no-such-execution" }],
			["progress", { executionId: "no-such-execution", epoch: 1, stageId: "s1", event: "started" }],
			["logs", { executionId: "no-such-execution", epoch: 1, seq: 0, bytes: "hi" }],
			[
				"log-events",
				{ executionId: "no-such-execution", epoch: 1, seq: 0, events: [{ type: "text", text: "hi" }] },
			],
			["verify-sha", { executionId: "no-such-execution", epoch: 1, sha: "a".repeat(40) }],
			["complete-execution", { executionId: "no-such-execution", epoch: 1 }],
			["interrupt", { executionId: "no-such-execution" }],
			["steer-ack", { executionId: "no-such-execution", epoch: 1, steerId: "no-such-steer" }],
		];

		it.each(taskRoutes)("POST /tasks/:id/%s without projectId → 400 MISSING_PROJECT_ID", async (route, body) => {
			const res = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/${route}`,
				headers: { "x-runner-credential": credR },
				payload: { ...body },
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).code).toBe("MISSING_PROJECT_ID");
		});

		it("POST /tasks/:id/claim without projectId → 400 MISSING_PROJECT_ID (no lease minted)", async () => {
			const res = await app.inject({
				method: "POST",
				url: `/tasks/${taskD}/claim`,
				headers: { "x-runner-credential": credR },
				payload: {},
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).code).toBe("MISSING_PROJECT_ID");
			// taskD stays claimable: the rejected request minted no lease.
			const retry = await app.inject({
				method: "POST",
				url: `/tasks/${taskD}/claim`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: alpha.id },
			});
			expect(retry.statusCode).toBe(200);
		});

		it.each([
			["acquire", { targetBranch: "main" }],
			["heartbeat", { targetBranch: "main", executionId: "no-such-execution", epoch: 1 }],
			[
				"report",
				{ targetBranch: "main", executionId: "no-such-execution", epoch: 1, outcome: "landed" },
			],
		])("POST /runners/integration/%s without projectId → 400 MISSING_PROJECT_ID", async (route, body) => {
			const res = await app.inject({
				method: "POST",
				url: `/runners/integration/${route}`,
				headers: { "x-runner-credential": credR },
				payload: { ...body },
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).code).toBe("MISSING_PROJECT_ID");
		});

		it.each(["", "   "])("blank projectId (%p) on progress → 400 MISSING_PROJECT_ID", async (projectId) => {
			const res = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/progress`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId,
					executionId: "no-such-execution",
					epoch: 1,
					stageId: "s1",
					event: "started",
				},
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).code).toBe("MISSING_PROJECT_ID");
		});

		it("unknown-but-present integration scopes keep queue semantics (presence, not existence)", async () => {
			// The integration routes are scope-keyed: an unknown scope is
			// not a 404 — the queue answers leased:false / STALE, and its
			// exact-match scope key is already the tenant boundary.
			const empty = await app.inject({
				method: "POST",
				url: "/runners/integration/acquire",
				headers: { "x-runner-credential": credR },
				payload: { projectId: "ghost-scope", targetBranch: "main" },
			});
			expect(empty.statusCode).toBe(200);
			expect(JSON.parse(empty.payload)).toEqual({ leased: false });
			const stale = await app.inject({
				method: "POST",
				url: "/runners/integration/heartbeat",
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: "ghost-scope",
					targetBranch: "main",
					executionId: "no-such-execution",
					epoch: 1,
				},
			});
			expect(stale.statusCode).toBe(409);
			expect(JSON.parse(stale.payload).code).toBe("STALE_EPOCH");
		});

		it("query-string projectId still counts as naming the project", async () => {
			const claim = await app.inject({
				method: "POST",
				url: `/tasks/${taskB}/claim`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: beta.id },
			});
			expect(claim.statusCode).toBe(200);
			const { executionId, epoch } = JSON.parse(claim.payload);
			leaseB = { executionId, epoch };
			const res = await app.inject({
				method: "POST",
				url: `/tasks/${taskB}/progress?projectId=${beta.id}`,
				headers: { "x-runner-credential": credR },
				payload: { executionId, epoch, stageId: "s1", event: "started" },
			});
			expect(res.statusCode).toBe(200);
		});
	});

	describe("cross-project replay matrix", () => {
		let leaseA;

		it("claims fence fixture A in proj-alpha", async () => {
			const claim = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/claim`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: alpha.id },
			});
			expect(claim.statusCode).toBe(200);
			leaseA = JSON.parse(claim.payload);
			expect(leaseA.epoch).toBe(1);
		});

		it("replaying A's lease against B's task across all lease-guarded routes → PROJECT_FENCE_MISMATCH, B untouched", async () => {
			const before = await monitor();
			const betaBefore = JSON.stringify(taskStore.getTask(beta.id, taskA));
			const bodies = {
				progress: { executionId: leaseA.executionId, epoch: leaseA.epoch, stageId: "s1", event: "started" },
				logs: { executionId: leaseA.executionId, epoch: leaseA.epoch, seq: 0, bytes: "evil bytes" },
				"log-events": {
					executionId: leaseA.executionId,
					epoch: leaseA.epoch,
					seq: 0,
					events: [{ type: "text", text: "evil event" }],
				},
				"verify-sha": { executionId: leaseA.executionId, epoch: leaseA.epoch, sha: "b".repeat(40) },
				"complete-execution": { executionId: leaseA.executionId, epoch: leaseA.epoch },
				interrupt: { executionId: leaseA.executionId },
				"claim-heartbeat": { executionId: leaseA.executionId },
			};
			for (const [route, body] of Object.entries(bodies)) {
				const res = await app.inject({
					method: "POST",
					url: `/tasks/${taskA}/${route}`,
					headers: { "x-runner-credential": credR },
					payload: { projectId: beta.id, ...body },
				});
				expect([route, res.statusCode]).toEqual([route, 409]);
				expect(JSON.parse(res.payload).code).toBe("PROJECT_FENCE_MISMATCH");
			}
			// steer-ack needs a queued steer: queue one on the home task,
			// then replay the ack against the beta mirror.
			const steer = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/steer`,
				payload: { projectId: alpha.id, guidance: "fence fixture steer" },
			});
			expect(steer.statusCode).toBe(200);
			const { steerId } = JSON.parse(steer.payload);
			const ack = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/steer-ack`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: beta.id,
					executionId: leaseA.executionId,
					epoch: leaseA.epoch,
					steerId,
					ok: true,
				},
			});
			expect(ack.statusCode).toBe(409);
			expect(JSON.parse(ack.payload).code).toBe("PROJECT_FENCE_MISMATCH");
			// Security signal: eight fenced rejections counted; the warning
			// lands on the lease's HOME task; beta's mirror task is
			// byte-identical (the true anti-corruption assertion).
			const after = await monitor();
			expect(after.fencedRejected).toBe(before.fencedRejected + 8);
			expect(JSON.stringify(taskStore.getTask(beta.id, taskA))).toBe(betaBefore);
			const homeWarnings = taskStore
				.getTask(alpha.id, taskA)
				.history.filter((entry) => entry.code === "PROJECT_FENCE_MISMATCH");
			expect(homeWarnings.length).toBeGreaterThanOrEqual(8);
		});

		it("A's lease still works after the replay storm (original untouched)", async () => {
			const progress = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/progress`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: alpha.id,
					executionId: leaseA.executionId,
					epoch: leaseA.epoch,
					stageId: "s1",
					event: "started",
				},
			});
			expect(progress.statusCode).toBe(200);
			expect(JSON.parse(progress.payload)).toEqual({ recorded: true, duplicate: false });
			const heartbeat = await app.inject({
				method: "POST",
				url: `/tasks/${taskA}/claim-heartbeat`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: alpha.id, executionId: leaseA.executionId },
			});
			expect(heartbeat.statusCode).toBe(200);
		});
	});

	describe("lease conflict, staleness, not-found, and view control", () => {
		it("second claimer on a held task → CLAIM_CONFLICT", async () => {
			const res = await app.inject({
				method: "POST",
				url: `/tasks/${taskB}/claim`,
				headers: { "x-runner-credential": credR2 },
				payload: { projectId: beta.id },
			});
			expect(res.statusCode).toBe(409);
			expect(JSON.parse(res.payload).code).toBe("CLAIM_CONFLICT");
		});

		it("stale epoch after re-claim → STALE_EPOCH", async () => {
			const first = await app.inject({
				method: "POST",
				url: `/tasks/${taskC}/claim`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: beta.id },
			});
			expect(first.statusCode).toBe(200);
			const stale = JSON.parse(first.payload);
			const interrupt = await app.inject({
				method: "POST",
				url: `/tasks/${taskC}/interrupt`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: beta.id, executionId: stale.executionId },
			});
			expect(interrupt.statusCode).toBe(200);
			const second = await app.inject({
				method: "POST",
				url: `/tasks/${taskC}/claim`,
				headers: { "x-runner-credential": credR },
				payload: { projectId: beta.id },
			});
			expect(second.statusCode).toBe(200);
			const fresh = JSON.parse(second.payload);
			expect(fresh.epoch).toBeGreaterThan(stale.epoch);
			const replay = await app.inject({
				method: "POST",
				url: `/tasks/${taskC}/progress`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: beta.id,
					executionId: stale.executionId,
					epoch: stale.epoch,
					stageId: "s1",
					event: "started",
				},
			});
			expect(replay.statusCode).toBe(409);
			expect(JSON.parse(replay.payload).code).toBe("STALE_EPOCH");
			const current = await app.inject({
				method: "POST",
				url: `/tasks/${taskC}/progress`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: beta.id,
					executionId: fresh.executionId,
					epoch: fresh.epoch,
					stageId: "s1",
					event: "started",
				},
			});
			expect(current.statusCode).toBe(200);
		});

		it("unknown task id with a valid projectId → 404 (fence never masks not-found)", async () => {
			for (const [method, url, payload] of [
				[
					"POST",
					"/tasks/no-such-task/progress",
					{ projectId: alpha.id, executionId: "x", epoch: 1, stageId: "s1", event: "started" },
				],
				["POST", "/tasks/no-such-task/claim", { projectId: alpha.id }],
			]) {
				const res = await app.inject({
					method,
					url,
					headers: { "x-runner-credential": credR },
					payload,
				});
				expect([url, res.statusCode]).toEqual([url, 404]);
			}
		});

		it("matching project completes cleanly (fence is invisible to honest runners)", async () => {
			const done = await app.inject({
				method: "POST",
				url: `/tasks/${taskB}/complete-execution`,
				headers: { "x-runner-credential": credR },
				payload: {
					projectId: beta.id,
					executionId: leaseB.executionId,
					epoch: leaseB.epoch,
				},
			});
			expect(done.statusCode).toBe(200);
			expect(JSON.parse(done.payload)).toMatchObject({ accepted: true, duplicate: false });
		});

		it("view route without projectId still resolves via fallback (q2 split control)", async () => {
			const live = (await monitor()).liveAssignments.find((row) => row.taskId === taskA);
			expect(live).toBeDefined();
			const res = await app.inject({
				method: "GET",
				url: `/tasks/${taskA}/steers?executionId=${live.executionId}`,
			});
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload)).toMatchObject({ taskId: taskA, executionId: live.executionId });
		});
	});
});
