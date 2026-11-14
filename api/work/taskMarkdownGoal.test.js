import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerTaskWorkRoutes } from "./taskWorkRoutes.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
];

const RICH_GOAL = `# Fix the retry loop

## Context
Retries pile up when the worker stalls.

## Steps
1. Bound the attempts
2. Add backoff

\`\`\`js
const attempts = withRetry(fetchTask, { max: 3 });
\`\`\`

\`\`\`mermaid
graph TD
  A[fetch] --> B{ok?}
  B -->|yes| C[done]
  B -->|no| A
\`\`\`

![flow](assets/flow.png)
![remote](https://example.com/pic.png)
`;

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
		patch: (routePath, a, b) => routes.set(`PATCH ${routePath}`, b || a),
		delete: (routePath, a, b) => routes.set(`DELETE ${routePath}`, b || a),
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

describe("POST /tasks with a rich-markdown goal", () => {
	it("stores the goal byte-identical (headings, code, mermaid, images)", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: RICH_GOAL, stageId: "s-1" } },
			reply(),
		);
		expect(s.taskStore.createTask).toHaveBeenCalledWith(
			"p-1",
			expect.objectContaining({ goal: RICH_GOAL }),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.goal).toBe(RICH_GOAL);
	});

	it("derives the title from the goal's first line only, never a mid-line slice", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: RICH_GOAL, stageId: "s-1" } },
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.title).toBe("Fix the retry loop");
	});

	it("leaves a plain-paragraph goal untouched (legacy behavior)", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: "Just do the thing", stageId: "s-1" } },
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.goal).toBe("Just do the thing");
		expect(stored.title).toBe("Just do the thing");
	});

	it("stores adversarial markdown verbatim; neutralization stays the renderer's job", async () => {
		const adversarial = `# Title\n\n\`\`\`mermaid\nunclosed fence\n\n![xss](javascript:alert(1))`;
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: adversarial, stageId: "s-1" } },
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.goal).toBe(adversarial);
	});

	it("still rejects a blank goal with 400", async () => {
		const s = await register(setup());
		const res = reply();
		await s.routes.get("POST /tasks")({ body: { projectId: "p-1", goal: "  " } }, res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(s.taskStore.createTask).not.toHaveBeenCalled();
	});

	it("derives the title from the first line of a CRLF goal and stores the goal verbatim", async () => {
		const crlfGoal = "# CRLF Title\r\n\r\n## Context\r\nbody with windows endings\r\n";
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", goal: crlfGoal, stageId: "s-1" } },
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.goal).toBe(crlfGoal);
		expect(stored.title).toBe("CRLF Title");
	});

	it("lets an explicit title win over the goal-derived one, goal still verbatim", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{
				body: {
					projectId: "p-1",
					title: "# Explicit title",
					goal: RICH_GOAL,
					stageId: "s-1",
				},
			},
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.title).toBe("Explicit title");
		expect(stored.goal).toBe(RICH_GOAL);
	});

	it("falls back to the title as the goal when goal is absent (legacy behavior)", async () => {
		const s = await register(setup());
		await s.routes.get("POST /tasks")(
			{ body: { projectId: "p-1", title: "Title only task", stageId: "s-1" } },
			reply(),
		);
		const stored = s.taskStore.createTask.mock.calls[0][1];
		expect(stored.goal).toBe("Title only task");
		expect(stored.title).toBe("Title only task");
	});
});

describe("PATCH /tasks/:id with a rich-markdown goal", () => {
	it("persists the updated markdown goal (PATCH trims edge whitespace, as today)", async () => {
		const s = await register(setup());
		const result = await s.routes.get("PATCH /tasks/:id")(
			{
				params: { id: "t-1" },
				body: { projectId: "p-1", goal: RICH_GOAL },
			},
			reply(),
		);
		expect(s.taskStore.updateTask).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ goal: RICH_GOAL.trim(), body: RICH_GOAL.trim() }),
			"/repo",
		);
		expect(result.goal).toBe(RICH_GOAL.trim());
	});
});
