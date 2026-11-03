import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token-policy";

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
 * MARK: Stage RunnerPolicy Dispatch Integration
 * @description Verifies the per-stage Runner allow/block list over HTTP:
 *   dispatch assigns restricted stages only to eligible Runners (ineligible
 *   Runners get NO_CAPABLE_MATCH with the loud policy reason), and direct
 *   single-assignment claims refuse ineligible Runners with 409 — across
 *   agent and ci stages.
 ***/
describe("Stage RunnerPolicy Dispatch Integration", () => {
	beforeAll(async () => {
		await app.ready();
	});

	async function onboard(runnerId) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token-policy", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const approval = await app.inject({
			method: "POST",
			url: `/runners/${runnerId}/approve`,
		});
		expect(approval.statusCode).toBe(200);
		return JSON.parse(approval.payload).credential;
	}

	async function heartbeatAs(credential, runnerId) {
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId, facts: FACTS },
		});
		expect(beat.statusCode).toBe(200);
	}

	async function policyProject(name, stage) {
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name,
				gitUrl: "https://git.example.com/team/fixture.git",
				harness: "mock",
				defaultModel: "mock-model",
				stages: [stage],
			},
		});
		expect(projRes.statusCode).toBe(201);
		const proj = JSON.parse(projRes.payload);
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: proj.id, goal: `${name} fixture task` },
		});
		expect(taskRes.statusCode).toBe(200);
		return { projectId: proj.id, taskId: JSON.parse(taskRes.payload).id };
	}

	async function dispatchAs(credential, projectId) {
		return app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: { projectIds: [projectId] },
		});
	}

	it("allow-mode: only the listed Runner is dispatched the agent task", async () => {
		const { projectId, taskId } = await policyProject("Policy Allow Agent", {
			id: "build",
			name: "Build",
			type: "agent",
			runnerPolicy: { mode: "allow", runners: ["policy-allowed"] },
		});
		const outsider = await onboard("policy-outsider");
		await heartbeatAs(outsider, "policy-outsider");
		const refused = JSON.parse((await dispatchAs(outsider, projectId)).payload);
		expect(refused).toMatchObject({
			assigned: false,
			code: "NO_CAPABLE_MATCH",
			misses: { RUNNER_NOT_ALLOWED: 1 },
		});
		const insider = await onboard("policy-allowed");
		await heartbeatAs(insider, "policy-allowed");
		const assigned = JSON.parse((await dispatchAs(insider, projectId)).payload);
		expect(assigned.assigned).toBe(true);
		expect(assigned.taskId).toBe(taskId);
	});

	it("block-mode: the listed Runner never takes the ci task, others do", async () => {
		const { projectId, taskId } = await policyProject("Policy Block CI", {
			id: "publish",
			name: "Publish",
			type: "ci",
			command: "echo hello-policy",
			runnerPolicy: { mode: "block", runners: ["policy-blocked"] },
		});
		const blocked = await onboard("policy-blocked");
		await heartbeatAs(blocked, "policy-blocked");
		const refused = JSON.parse((await dispatchAs(blocked, projectId)).payload);
		expect(refused).toMatchObject({
			assigned: false,
			code: "NO_CAPABLE_MATCH",
			misses: { RUNNER_BLOCKED: 1 },
		});
		const other = await onboard("policy-other");
		await heartbeatAs(other, "policy-other");
		const assigned = JSON.parse((await dispatchAs(other, projectId)).payload);
		expect(assigned.assigned).toBe(true);
		expect(assigned.taskId).toBe(taskId);
		expect(assigned.kind).toBe("ci");
	});

	it("direct claim refuses Runners the stage does not allow (409, no bypass)", async () => {
		const { projectId, taskId } = await policyProject("Policy Claim", {
			id: "build",
			name: "Build",
			type: "agent",
			runnerPolicy: { mode: "allow", runners: ["policy-claimer"] },
		});
		const outsider = await onboard("policy-claim-outsider");
		const refused = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": outsider },
			payload: { projectId },
		});
		expect(refused.statusCode).toBe(409);
		expect(JSON.parse(refused.payload).code).toBe("RUNNER_NOT_ALLOWED");
		const insider = await onboard("policy-claimer");
		const claimed = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": insider },
			payload: { projectId },
		});
		expect(claimed.statusCode).toBe(200);
		expect(JSON.parse(claimed.payload).taskId).toBe(taskId);
	});
});
