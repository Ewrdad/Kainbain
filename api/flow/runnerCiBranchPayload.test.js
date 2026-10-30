import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// The stage "Run on branch" toggle (runOnBranch/customBranch) must reach the
// Runner on every assignment channel: the dispatch answer AND the
// single-assignment claim route. A payload that drops these fields makes the
// Runner silently run CI in the task worktree (kb/*), which is how publish
// stages broke (deploy.sh refuses to run from a task worktree, exit 78).
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";
process.env.KAINBAIN_CLAIM_TTL_MS = "60000";

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

async function heartbeat(credential, runnerId) {
	await app.inject({
		method: "POST",
		url: "/runners/heartbeat",
		headers: { "x-runner-credential": credential },
		payload: { runnerId, facts: FACTS },
	});
}

describe("CI branch payload on runner assignment channels", () => {
	let project;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "CI Branch Payload Fixture",
				gitUrl: "https://git.example.com/team/cibranch.git",
				harness: "mock",
				defaultModel: "mock-model",
			},
		});
		expect(projRes.statusCode).toBe(201);
		project = JSON.parse(projRes.payload);
	});

	async function setStage(stage) {
		const wf = await app.inject({
			method: "PUT",
			url: `/projects/${project.id}/workflow`,
			payload: { stages: [stage] },
		});
		expect(wf.statusCode).toBe(200);
	}

	async function newTask(goal) {
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal },
		});
		expect(taskRes.statusCode).toBe(200);
		return JSON.parse(taskRes.payload).id;
	}

	async function dispatchAs(credential) {
		const res = await app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: {},
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload);
	}

	it("dispatch answer carries runOnBranch 'primary' for a primary-mode ci stage", async () => {
		await setStage({ id: "s-pub", name: "Publish", type: "ci", command: "./deploy.sh --prod", runOnBranch: "primary" });
		await newTask("primary mode task");
		const credential = await onboard("ci-primary");
		await heartbeat(credential, "ci-primary");
		const out = await dispatchAs(credential);
		expect(out.assigned).toBe(true);
		expect(out.kind).toBe("ci");
		expect(out.runOnBranch).toBe("primary");
		expect(out.customBranch).toBeUndefined();
	});

	it("dispatch answer carries runOnBranch 'custom' plus customBranch", async () => {
		await setStage({ id: "s-pub", name: "Publish", type: "ci", command: "echo hi", runOnBranch: "custom", customBranch: "release/next" });
		await newTask("custom mode task");
		const credential = await onboard("ci-custom");
		await heartbeat(credential, "ci-custom");
		const out = await dispatchAs(credential);
		expect(out.assigned).toBe(true);
		expect(out.kind).toBe("ci");
		expect(out.runOnBranch).toBe("custom");
		expect(out.customBranch).toBe("release/next");
	});

	it("dispatch answer defaults runOnBranch to 'task' when the stage has no mode", async () => {
		await setStage({ id: "s-pub", name: "Tests", type: "ci", command: "npm test" });
		await newTask("task mode task");
		const credential = await onboard("ci-task");
		await heartbeat(credential, "ci-task");
		const out = await dispatchAs(credential);
		expect(out.assigned).toBe(true);
		expect(out.runOnBranch).toBe("task");
	});

	it("claim route returns the full ci payload including runOnBranch/customBranch", async () => {
		await setStage({ id: "s-pub", name: "Publish", type: "ci", command: "./deploy.sh --prod", runOnBranch: "custom", customBranch: "release/next" });
		const taskId = await newTask("claim payload task");
		const credential = await onboard("ci-claim");
		await heartbeat(credential, "ci-claim");
		const res = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(200);
		const out = JSON.parse(res.payload);
		expect(out.kind).toBe("ci");
		expect(out.command).toBe("./deploy.sh --prod");
		expect(out.runOnBranch).toBe("custom");
		expect(out.customBranch).toBe("release/next");
	});
});
