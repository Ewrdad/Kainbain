import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — the config loader snapshots process.env at first
// evaluation, so no fixture in this file can ever touch the live projects
// root or the live SilverBullet notes space.

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/**
 * MARK: Task blocking API integration
 * @description Verifies the HTTP surface of task dependencies: create/PATCH
 * validation maps to 400 (self-block, unknown ids, cycles) while
 * executing a blocked task stays 409, and clearing blockedBy re-enables it.
 */
describe("Task blocking API", () => {
	let testProject;

	beforeAll(async () => {
		await app.ready();
		// Dedicated fixture project under the throwaway roots (see top of
		// file): task writes stay inside the temp notes space.
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Task Blocking Test Project" },
		});
		expect(res.statusCode).toBe(201);
		testProject = JSON.parse(res.payload);
	});

	async function activeProject() {
		return testProject;
	}

	async function createTask(projectId, payload) {
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, ...payload },
		});
		return { statusCode: res.statusCode, body: JSON.parse(res.payload) };
	}

	it("creates a chained task and rejects execution while blocked with 409", async () => {
		const project = await activeProject();
		const { body: blocker } = await createTask(project.id, {
			goal: "Blocking prerequisite",
		});
		const created = await createTask(project.id, {
			goal: "Blocked dependent",
			blockedBy: [blocker.id],
		});
		expect(created.statusCode).toBe(200);
		expect(created.body.blockedBy).toEqual([blocker.id]);

		const execRes = await app.inject({
			method: "POST",
			url: `/tasks/${created.body.id}/execute`,
			payload: { projectId: project.id },
		});
		expect(execRes.statusCode).toBe(409);
		expect(JSON.parse(execRes.payload).blockedBy).toEqual([blocker.id]);
	});

	it("rejects create with an unknown blocker id with 400", async () => {
		const project = await activeProject();
		const created = await createTask(project.id, {
			goal: "Typo dependent",
			blockedBy: ["task-that-does-not-exist"],
		});
		expect(created.statusCode).toBe(400);
		expect(created.body.error).toMatch("Unknown task ID");
	});

	it("rejects self-block and cycles on PATCH with 400", async () => {
		const project = await activeProject();
		const { body: taskA } = await createTask(project.id, {
			goal: "Chain A",
		});
		const { body: taskB } = await createTask(project.id, {
			goal: "Chain B",
			blockedBy: [taskA.id],
		});

		const selfRes = await app.inject({
			method: "PATCH",
			url: `/tasks/${taskB.id}`,
			payload: { projectId: project.id, blockedBy: [taskB.id] },
		});
		expect(selfRes.statusCode).toBe(400);
		expect(JSON.parse(selfRes.payload).error).toMatch("itself");

		const cycleRes = await app.inject({
			method: "PATCH",
			url: `/tasks/${taskA.id}`,
			payload: { projectId: project.id, blockedBy: [taskB.id] },
		});
		expect(cycleRes.statusCode).toBe(400);
		expect(JSON.parse(cycleRes.payload).error).toMatch("cycle");
	});

	it("rejects PATCH with an unknown blocker id with 400", async () => {
		const project = await activeProject();
		const { body: task } = await createTask(project.id, {
			goal: "Patch typo check",
		});
		const res = await app.inject({
			method: "PATCH",
			url: `/tasks/${task.id}`,
			payload: { projectId: project.id, blockedBy: ["no-such-task"] },
		});
		expect(res.statusCode).toBe(400);
	});

	it("unblocks execution after the blocker completes and blockedBy clears", async () => {
		const project = await activeProject();
		const { body: blocker } = await createTask(project.id, {
			goal: "Release prerequisite",
		});
		const { body: blocked } = await createTask(project.id, {
			goal: "Released dependent",
			blockedBy: [blocker.id],
		});

		await app.inject({
			method: "POST",
			url: `/tasks/${blocker.id}/complete`,
			payload: { projectId: project.id },
		});

		const queueRes = await app.inject({
			method: "GET",
			url: `/tasks/queue?projectId=${project.id}`,
		});
		const entry = JSON.parse(queueRes.payload).find(
			(q) => q.id === blocked.id,
		);
		expect(entry.isBlocked).toBe(false);
	});
});
