import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";

const { default: app } = await import("../index.js");

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
 * MARK: Runner Routes Integration
 * @description Verifies the D4/R04 contract over HTTP: join-token gating,
 *   pending-by-default registration, operator approve/deny/revoke, the
 *   credential-scoped claim route (200 + lease or 409 + holder), and the
 *   R04 auth matrix — unauthenticated, wrong-scope, and revoked Runners
 *   rejected on every Runner endpoint.
 ***/
describe("Runner Routes Integration", () => {
	let project;
	let taskId;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Runner Claim Fixture",
				gitUrl: "https://git.example.com/team/fixture.git",
			},
		});
		expect(projRes.statusCode).toBe(201);
		project = JSON.parse(projRes.payload);
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Claimable fixture task" },
		});
		expect(taskRes.statusCode).toBe(200);
		taskId = JSON.parse(taskRes.payload).id;
	});

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

	it("rejects registration with a wrong join token", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "intruder", joinToken: "wrong", facts: FACTS },
		});
		expect(res.statusCode).toBe(403);
		expect(JSON.parse(res.payload).code).toBe("INVALID_JOIN_TOKEN");
	});

	it("lists pending Runners for the approval UI without credentials", async () => {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "awaiting-approval", joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const list = await app.inject({ method: "GET", url: "/runners" });
		const runners = JSON.parse(list.payload);
		const pending = runners.find((r) => r.runnerId === "awaiting-approval");
		expect(pending.status).toBe("pending");
		expect(pending.credential ?? null).toBeNull();
	});

	it("runs heartbeat then claim: 200 + lease, double claim 409 + holder", async () => {
		const credential = await onboard("claimer-1");
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "claimer-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(200);

		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(200);
		const lease = JSON.parse(claim.payload);
		expect(lease.epoch).toBe(1);
		expect(typeof lease.executionId).toBe("string");

		const credential2 = await onboard("claimer-2");
		const conflict = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential2 },
			payload: { projectId: project.id },
		});
		expect(conflict.statusCode).toBe(409);
		expect(JSON.parse(conflict.payload).holder).toMatchObject({
			runnerId: "claimer-1",
			epoch: 1,
		});
	});

	it("R04: rejects unauthenticated callers on every Runner endpoint", async () => {
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			payload: { runnerId: "claimer-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(401);

		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Unauthenticated claim target" },
		});
		const freshTask = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${freshTask}/claim`,
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(401);
		expect(JSON.parse(claim.payload).code).toBe("INVALID_CREDENTIAL");
	});

	it("R04: rejects a credential used for a different Runner id", async () => {
		const credential = await onboard("scoped-1");
		await onboard("scoped-2");
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id, runnerId: "scoped-2" },
		});
		expect(claim.statusCode).toBe(403);
		expect(JSON.parse(claim.payload).code).toBe("SCOPE_MISMATCH");
	});

	it("R04: rejects revoked Runners everywhere", async () => {
		const credential = await onboard("doomed-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Revoked claim target" },
		});
		const freshTask = JSON.parse(taskRes.payload).id;
		const revoke = await app.inject({
			method: "POST",
			url: "/runners/doomed-1/revoke",
		});
		expect(revoke.statusCode).toBe(200);
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "doomed-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(401);
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${freshTask}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(401);
	});

	it("claim on an unknown task is 404, approve on unknown Runner is 404", async () => {
		const credential = await onboard("notfound-1");
		const claim = await app.inject({
			method: "POST",
			url: "/tasks/does-not-exist/claim",
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(404);
		const approval = await app.inject({
			method: "POST",
			url: "/runners/ghost-runner/approve",
		});
		expect(approval.statusCode).toBe(404);
	});
});
