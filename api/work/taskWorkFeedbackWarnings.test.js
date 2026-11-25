/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { registerTaskWorkRoutes } = await import("./taskWorkRoutes.js");

const STAGES = [{ id: "build", name: "Build", type: "agent" }];

function setup() {
	const routes = new Map();
	const capture = (method) => (routePath, ...rest) => {
		routes.set(`${method} ${routePath}`, rest[rest.length - 1]);
	};
	const fakeApp = {
		get: capture("GET"),
		post: capture("POST"),
		patch: capture("PATCH"),
		delete: capture("DELETE"),
		log: { error: vi.fn() },
	};
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-work-warnings-"));
	const project = { id: "proj-1", cwd: root, stages: STAGES };
	const stored = {
		id: "task-1",
		projectId: "proj-1",
		title: "T",
		goal: "G",
		currentStageId: "build",
		status: "in_stage",
		history: [],
	};
	const taskStore = {
		createTask: vi.fn((projectId, input) => ({
			...stored,
			title: input.title,
			goal: input.goal,
		})),
		updateTask: vi.fn((projectId, taskId, updates) => ({
			...stored,
			...updates,
		})),
		getTask: vi.fn(() => stored),
		_recordHistory: vi.fn(),
	};
	const projectStore = { getProject: vi.fn(() => project) };
	const promptEngine = { curatePrompt: vi.fn(() => "curated") };
	return {
		routes,
		fakeApp,
		root,
		stored,
		taskStore,
		projectStore,
		promptEngine,
	};
}

async function register(s) {
	await registerTaskWorkRoutes(s.fakeApp, {
		resolveAndGuardProject: (id) => id || "proj-1",
		getOrCreateSession: async () => null,
		projectStore: s.projectStore,
		taskStore: s.taskStore,
		promptEngine: s.promptEngine,
		isAgentRunning: () => false,
		agentRunner: null,
		claimStore: null,
	});
}

function makeReply() {
	const send = vi.fn();
	const status = vi.fn(() => ({ send }));
	return { status, send };
}

describe("task goal warn-only feedback warnings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("create: attaches feedbackWarnings instead of refusing a dangling goal", async () => {
		const s = setup();
		try {
			await register(s);
			const handler = s.routes.get("POST /tasks");
			const reply = makeReply();
			const result = await handler(
				{
					body: {
						projectId: "proj-1",
						title: "T",
						goal: "See ![gone](assets/gone.png) please take a look",
					},
					actor: {},
				},
				reply,
			);
			expect(reply.status).not.toHaveBeenCalled();
			expect(result).toMatchObject({ id: "task-1" });
			expect(result.feedbackWarnings).toEqual({
				missing: [
					expect.objectContaining({
						ref: "assets/gone.png",
						expectedPath: "docs/tasks/task-1/assets/gone.png",
					}),
				],
				imageOnly: false,
			});
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("create: healthy goals stay byte-identical (no warnings key)", async () => {
		const s = setup();
		try {
			await register(s);
			const handler = s.routes.get("POST /tasks");
			const reply = makeReply();
			const result = await handler(
				{ body: { projectId: "proj-1", title: "T", goal: "Plain goal" }, actor: {} },
				reply,
			);
			expect(reply.status).not.toHaveBeenCalled();
			expect(result).not.toHaveProperty("feedbackWarnings");
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("patch: warns on dangling goal edits without refusing the save", async () => {
		const s = setup();
		try {
			await register(s);
			const handler = s.routes.get("PATCH /tasks/:id");
			const reply = makeReply();
			const result = await handler(
				{
					body: {
						projectId: "proj-1",
						goal: "See ![gone](assets/gone.png) please take a look",
					},
					params: { id: "task-1" },
					actor: {},
				},
				reply,
			);
			expect(reply.status).not.toHaveBeenCalled();
			expect(s.taskStore.updateTask).toHaveBeenCalled();
			expect(result.feedbackWarnings).toEqual({
				missing: [expect.objectContaining({ ref: "assets/gone.png" })],
				imageOnly: false,
			});
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("patch: non-goal edits and healthy goals carry no warnings", async () => {
		const s = setup();
		try {
			await register(s);
			const handler = s.routes.get("PATCH /tasks/:id");
			const titleOnly = await handler(
				{
					body: { projectId: "proj-1", title: "New title" },
					params: { id: "task-1" },
					actor: {},
				},
				makeReply(),
			);
			expect(titleOnly).not.toHaveProperty("feedbackWarnings");
			const healthyGoal = await handler(
				{
					body: { projectId: "proj-1", goal: "Plain edited goal" },
					params: { id: "task-1" },
					actor: {},
				},
				makeReply(),
			);
			expect(healthyGoal).not.toHaveProperty("feedbackWarnings");
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});
});
