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
 * MARK: complete-execution body limit (413 bug pin — RED phase)
 * @description RED-phase pin for the 413 completion-payload loop (task
 *   d164fb3f, RESPONSE.md S2): a fully successful run's
 *   `complete-execution` POST exceeds Fastify's default 1 MiB JSON body
 *   limit, is rejected with 413, and the handler never runs — while a
 *   body just under 1 MiB is accepted. Passes TODAY (pins the bug).
 *   After the backend fix this file FLIPS: >1 MiB is accepted, and only
 *   bodies over the new 10 MiB limit 413 (with a structured log line).
 ***/
describe("complete-execution body limit (413 bug pin)", () => {
	let project;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "413 BodyLimit Fixture",
				gitUrl: "https://git.example.com/team/413-fixture.git",
			},
		});
		expect(projRes.statusCode).toBe(201);
		project = JSON.parse(projRes.payload);
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

	async function claimFresh(credential, goal) {
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal },
		});
		expect(taskRes.statusCode).toBe(200);
		const target = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(200);
		const { executionId, epoch } = JSON.parse(claim.payload);
		return { target, executionId, epoch };
	}

	async function completionsRecorded() {
		const monitor = await app.inject({ method: "GET", url: "/runners/monitor" });
		return JSON.parse(monitor.payload).completions;
	}

	it("accepts a complete-execution body just under 1 MiB (control)", async () => {
		const credential = await onboard("bodylimit-control-1");
		const { target, executionId, epoch } = await claimFresh(credential, "Control fixture");
		const before = await completionsRecorded();
		const done = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId,
				epoch,
				outcome: "passed",
				output: "x".repeat(1024 * 1024 - 20480),
			},
		});
		expect(done.statusCode).toBe(200);
		expect(JSON.parse(done.payload)).toMatchObject({ accepted: true });
		expect(await completionsRecorded()).toBe(before + 1);
	});

	it("rejects a >1 MiB complete-execution body with 413 and records nothing", async () => {
		const credential = await onboard("bodylimit-pin-1");
		const { target, executionId, epoch } = await claimFresh(credential, "Oversize fixture");
		const before = await completionsRecorded();
		const done = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId,
				epoch,
				outcome: "passed",
				output: "y".repeat(1024 * 1024 + 1024),
			},
		});
		expect(done.statusCode).toBe(413);
		expect(JSON.parse(done.payload).code).toBe("FST_ERR_CTP_BODY_TOO_LARGE");
		// The handler never ran: no completion recorded.
		expect(await completionsRecorded()).toBe(before);
	});
});
