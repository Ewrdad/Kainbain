import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerTaskWorkRoutes } from "./taskWorkRoutes.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
];

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		title: "Task one",
		goal: "Do thing",
		status: "in_stage",
		currentStageId: "s-1",
		history: [],
		timeline: [],
		...overrides,
	};
}

function setup({ guardProjectId = "p-1" } = {}) {
	const routes = new Map();
	const fakeApp = {
		get: (routePath, a, b) => routes.set(`GET ${routePath}`, b || a),
		post: (routePath, a, b) => routes.set(`POST ${routePath}`, b || a),
		patch: (routePath, handler) => routes.set(`PATCH ${routePath}`, handler),
		delete: (routePath, handler) => routes.set(`DELETE ${routePath}`, handler),
		log: { error: vi.fn() },
	};
	const project = { id: "p-1", name: "P", cwd: "/repo", stages: STAGES };
	const stored = task();
	const taskStore = {
		createTask: vi.fn(() => ({ ...stored })),
		listTasks: vi.fn(() => [{ ...stored }]),
		getTasks: vi.fn(() => [{ ...stored }]),
		getTask: vi.fn(() => ({ ...stored })),
		updateTask: vi.fn((pid, tid, updates) => ({ ...stored, ...updates })),
		deleteTask: vi.fn(() => true),
		moveToStage: vi.fn(),
		executeStage: vi.fn(async () => ({ ok: true })),
		getScheduledQueue: vi.fn(() => [{ ...stored, queueOrder: 1 }]),
		_recordHistory: vi.fn(),
	};
	const projectStore = { getProject: vi.fn(() => project) };
	const promptEngine = { curatePrompt: vi.fn(() => "curated prompt") };
	const deps = {
		resolveAndGuardProject: vi.fn(() => guardProjectId),
		getOrCreateSession: vi.fn(async () => null),
		projectStore,
		taskStore,
		promptEngine,
		isAgentRunning: vi.fn(() => false),
		agentRunner: vi.fn(),
	};
	return { routes, fakeApp, project, stored, taskStore, projectStore, promptEngine, deps };
}

async function register(setupResult) {
	await registerTaskWorkRoutes(setupResult.fakeApp, setupResult.deps);
	return setupResult;
}

function reply() {
	const send = vi.fn();
	return { status: vi.fn(() => ({ send })), send };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /tasks", () => {
	it("lists duration summaries for a project", async () => {
		const s = await register(setup());
		const handler = s.routes.get("GET /tasks");
		const result = await handler({ query: { projectId: "p-1" } }, reply());
		expect(s.taskStore.listTasks).toHaveBeenCalledWith("p-1", "/repo");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("t-1");
	});

	it("filters by workflow when workflowId is given", async () => {
		const s = await register(setup());
		const result = await s.routes.get("GET /tasks")(
			{ query: { projectId: "p-1", workflowId: "wf-1" } },
			reply(),
		);
		expect(s.taskStore.getTasks).toHaveBeenCalledWith("p-1", "wf-1", "/repo");
		expect(result).toHaveLength(1);
	});

	it("returns undefined when the project guard fails", async () => {
		const s = await register(setup({ guardProjectId: null }));
		await expect(
			s.routes.get("GET /tasks")({ query: {} }, reply()),
		).resolves.toBeUndefined();
	});
});

describe("GET /tasks/queue", () => {
	it("returns the scheduled queue", async () => {
		const s = await register(setup());
		const result = await s.routes.get("GET /tasks/queue")(
			{ query: { projectId: "p-1" } },
			reply(),
		);
		expect(s.taskStore.getScheduledQueue).toHaveBeenCalledWith("p-1");
		expect(result).toHaveLength(1);
	});

	it("returns undefined when the project guard fails", async () => {
		const s = await register(setup({ guardProjectId: null }));
		await expect(
			s.routes.get("GET /tasks/queue")({ query: {} }, reply()),
		).resolves.toBeUndefined();
	});
});

describe("POST /tasks/preview", () => {
	it("curates a prompt for a valid draft", async () => {
		const s = await register(setup());
		const result = await s.routes.get("POST /tasks/preview")(
			{ body: { projectId: "p-1", goal: "Ship it", stageId: "s-1" } },
			reply(),
		);
		expect(result).toEqual({ curatedPrompt: "curated prompt", stageId: "s-1" });
		expect(s.promptEngine.curatePrompt).toHaveBeenCalled();
	});

	it("rejects drafts without a goal or title", async () => {
		const s = await register(setup());
		const res = reply();
		await s.routes.get("POST /tasks/preview")({ body: { projectId: "p-1" } }, res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.send).toHaveBeenCalledWith({ error: "Goal or title is required" });
	});

	it("returns undefined when the project guard fails", async () => {
		const s = await register(setup({ guardProjectId: null }));
		await expect(
			s.routes.get("POST /tasks/preview")({ body: { goal: "x" } }, reply()),
		).resolves.toBeUndefined();
	});
});

describe("POST /tasks", () => {
	it("creates a task and curates its prompt", async () => {
		const s = await register(setup());
		const result = await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", title: "New", goal: "New goal" } },
			reply(),
		);
		expect(s.taskStore.createTask).toHaveBeenCalledWith(
			"p-1",
			expect.objectContaining({ title: "New", goal: "New goal" }),
		);
		expect(s.taskStore.updateTask).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			{ prompt: "curated prompt" },
			"/repo",
		);
		expect(result.curatedPrompt).toBe("curated prompt");
		expect(s.taskStore.executeStage).not.toHaveBeenCalled();
	});

	it("auto-executes when execute is set and logs failures", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: "Go", execute: true } },
			reply(),
		);
		expect(s.taskStore.executeStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ priority: "normal" }),
		);
		s.taskStore.executeStage.mock.results[0].value.catch(() => {});
	});

	it("logs auto-execution failures without failing the request", async () => {
		for (const body of [
			{ projectId: "p-1", goal: "Go", execute: true },
			{ projectId: "p-1", goal: "Go", followUp: true },
		]) {
			const s = setup();
			s.taskStore.executeStage = vi.fn(async () => {
				throw new Error("boom");
			});
			s.deps.getOrCreateSession = vi.fn(async () => ({}));
			s.deps.isAgentRunning = () => false;
			await register(s);
			const result = await s.routes.get("POST /tasks")({ body }, reply());
			expect(result.curatedPrompt).toBe("curated prompt");
			await new Promise((resolve) => setImmediate(resolve));
			expect(s.fakeApp.log.error).toHaveBeenCalled();
		}
	});

	it("follows up on a live session when followUp is set", async () => {
		const s = setup();
		const followUp = vi.fn(async () => {});
		s.deps.getOrCreateSession = vi.fn(async () => ({ followUp }));
		s.deps.isAgentRunning = () => true;
		await register(s);
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: "Go", followUp: true } },
			reply(),
		);
		expect(followUp).toHaveBeenCalledWith("curated prompt");
		expect(s.taskStore.executeStage).not.toHaveBeenCalled();
	});

	it("dispatches execution for followUp when the session is idle", async () => {
		const s = setup();
		s.deps.getOrCreateSession = vi.fn(async () => ({}));
		s.deps.isAgentRunning = () => false;
		await register(s);
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: "Go", followUp: true } },
			reply(),
		);
		expect(s.taskStore.executeStage).toHaveBeenCalled();
	});

	it("surfaces blockedBy validation errors as 400", async () => {
		const s = await register(setup());
		s.taskStore.createTask = vi.fn(() => {
			throw new Error("Unknown task ID in blockedBy: ghost");
		});
		await registerTaskWorkRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: "Go", blockedBy: ["ghost"] } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.send).toHaveBeenCalledWith({
			error: "Unknown task ID in blockedBy: ghost",
		});
	});

	it("rejects creation without a goal and without a project", async () => {
		const s = await register(setup());
		const res = reply();
		await s.routes.get("POST /tasks")({ body: { projectId: "p-1" } }, res);
		expect(res.status).toHaveBeenCalledWith(400);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("POST /tasks")({ body: { goal: "x" } }, reply()),
		).resolves.toBeUndefined();
	});
});

describe("GET /tasks/:id", () => {
	it("returns the task", async () => {
		const s = await register(setup());
		const result = await s.routes.get("GET /tasks/:id")(
			{ params: { id: "t-1" }, query: { projectId: "p-1" } },
			reply(),
		);
		expect(result.id).toBe("t-1");
	});

	it("returns 404 for unknown tasks and undefined without a project", async () => {
		const s = await register(setup());
		s.taskStore.getTask = vi.fn(() => undefined);
		await registerTaskWorkRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("GET /tasks/:id")(
			{ params: { id: "ghost" }, query: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("GET /tasks/:id")({ params: { id: "t-1" }, query: {} }, reply()),
		).resolves.toBeUndefined();
	});
});

describe("PATCH /tasks/:id", () => {
	it("edits title, goal, status, branch, and blockedBy", async () => {
		const s = await register(setup());
		const result = await s.routes.get("PATCH /tasks/:id")(
			{
				params: { id: "t-1" },
				body: {
					projectId: "p-1",
					title: "# Clean",
					goal: "New goal",
					status: "paused",
					branch: "kb/x",
					blockedBy: ["b-1"],
				},
			},
			reply(),
		);
		expect(s.taskStore.updateTask).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({
				title: "Clean",
				goal: "New goal",
				body: "New goal",
				status: "paused",
				branch: "kb/x",
				blockedBy: ["b-1"],
			}),
			"/repo",
		);
		expect(s.taskStore._recordHistory).toHaveBeenCalled();
		expect(result.title).toBe("Clean");
	});

	it("moves stages on stageId change only", async () => {
		const s = await register(setup());
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", stageId: "s-2" } },
			reply(),
		);
		expect(s.taskStore.moveToStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			"s-2",
			"Updated stage",
			undefined,
			"/repo",
			{ operatorMove: true },
		);
		s.taskStore.moveToStage.mockClear();
		s.taskStore.updateTask.mockClear();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", stageId: "s-1" } },
			reply(),
		);
		expect(s.taskStore.moveToStage).not.toHaveBeenCalled();
	});

	it("transfers pipelines: binds workflowId before moving stages", async () => {
		const s = await register(setup());
		s.project.workflows = [
			{ id: "wf-a", name: "A", stages: [{ id: "s-1", name: "Build", type: "agent" }] },
			{ id: "wf-b", name: "B", stages: [{ id: "s-b1", name: "Spec", type: "human" }] },
		];
		const live = task({ workflowId: "wf-a", currentStageId: "s-1" });
		s.taskStore.getTask = vi.fn(() => live);
		await s.routes.get("PATCH /tasks/:id")(
			{
				params: { id: "t-1" },
				body: { projectId: "p-1", workflowId: "wf-b", stageId: "s-b1" },
			},
			reply(),
		);
		expect(s.taskStore.updateTask).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ workflowId: "wf-b" }),
			"/repo",
		);
		expect(s.taskStore.moveToStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			"s-b1",
			"Updated stage",
			undefined,
			"/repo",
			{ operatorMove: true },
		);
		// Rebound before the move so stage labels/types resolve against B.
		expect(live.workflowId).toBe("wf-b");
		expect(s.taskStore._recordHistory).toHaveBeenCalled();
	});

	it("rejects transfers to unknown pipelines, stageless transfers, and off-pipeline stages", async () => {
		const s = await register(setup());
		s.project.workflows = [
			{ id: "wf-a", name: "A", stages: [{ id: "s-1", name: "Build", type: "agent" }] },
			{ id: "wf-b", name: "B", stages: [{ id: "s-b1", name: "Spec", type: "human" }] },
		];
		s.taskStore.getTask = vi.fn(() => task({ workflowId: "wf-a", currentStageId: "s-1" }));

		const unknown = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", workflowId: "wf-x", stageId: "s-b1" } },
			unknown,
		);
		expect(unknown.status).toHaveBeenCalledWith(404);

		const stageless = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", workflowId: "wf-b" } },
			stageless,
		);
		expect(stageless.status).toHaveBeenCalledWith(400);

		const offPipeline = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", workflowId: "wf-b", stageId: "s-1" } },
			offPipeline,
		);
		expect(offPipeline.status).toHaveBeenCalledWith(400);
		expect(s.taskStore.updateTask).not.toHaveBeenCalled();
	});

	it("rejects empty updates, unknown tasks, and bad blockers", async () => {
		const s = await register(setup());
		const empty = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1" } },
			empty,
		);
		expect(empty.status).toHaveBeenCalledWith(400);

		s.taskStore.getTask = vi.fn(() => undefined);
		await registerTaskWorkRoutes(s.fakeApp, s.deps);
		const missing = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "ghost" }, body: { projectId: "p-1", title: "x" } },
			missing,
		);
		expect(missing.status).toHaveBeenCalledWith(404);
	});

	it("surfaces update validation errors as 400", async () => {
		const s = await register(setup());
		s.taskStore.updateTask = vi.fn(() => {
			throw new Error("blockedBy would create a dependency cycle");
		});
		await registerTaskWorkRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("PATCH /tasks/:id")(
			{ params: { id: "t-1" }, body: { projectId: "p-1", blockedBy: ["t-1"] } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("returns undefined when the project guard fails", async () => {
		const s = await register(setup({ guardProjectId: null }));
		await expect(
			s.routes.get("PATCH /tasks/:id")(
				{ params: { id: "t-1" }, body: { title: "x" } },
				reply(),
			),
		).resolves.toBeUndefined();
	});
});

describe("DELETE /tasks/:id", () => {
	it("deletes and confirms", async () => {
		const s = await register(setup());
		const result = await s.routes.get("DELETE /tasks/:id")(
			{ params: { id: "t-1" }, query: { projectId: "p-1" } },
			reply(),
		);
		expect(s.taskStore.deleteTask).toHaveBeenCalledWith("p-1", "t-1", "/repo");
		expect(result).toEqual({ status: "deleted", id: "t-1" });
	});

	it("returns 404 when nothing was deleted and undefined without a project", async () => {
		const s = await register(setup());
		s.taskStore.deleteTask = vi.fn(() => false);
		await registerTaskWorkRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("DELETE /tasks/:id")(
			{ params: { id: "ghost" }, query: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("DELETE /tasks/:id")(
				{ params: { id: "t-1" }, query: {} },
				reply(),
			),
		).resolves.toBeUndefined();
	});
});
