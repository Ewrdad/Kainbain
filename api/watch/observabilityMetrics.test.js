import { describe, it, expect } from "vitest";

import { computeObservabilityMetrics } from "./observabilityMetrics.js";

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		title: "Task one",
		goal: "Do thing",
		status: "in_stage",
		currentStageId: "s-1",
		blockedBy: [],
		updatedAt: "2026-09-24T10:00:00.000Z",
		timeInStage: 5,
		reports: [],
		...overrides,
	};
}

function project(overrides = {}) {
	return { id: "p-1", name: "Proj", cwd: "/repo", ...overrides };
}

function makeStore({ projects = [project()], tasksByProject = {}, engine = null } = {}) {
	const tasks = { "p-1": [task()], ...tasksByProject };
	return {
		projectStore: { listProjects: () => projects },
		getEngineState: () =>
			engine || { status: "idle", activeTaskId: null, activeProjectId: null },
		listTasks: (projectId) => tasks[projectId] || [],
		isTaskBlocked: (projectId, taskId) => {
			const found = (tasks[projectId] || []).find((t) => t.id === taskId);
			const blockers = (found?.blockedBy || []).filter((b) =>
				(tasks[projectId] || []).some((t) => t.id === b && t.status !== "completed"),
			);
			return { blocked: blockers.length > 0, blockers, hasCycle: false };
		},
		getTaskReports: () => [],
		_resolveStagesForTask: () => [{ id: "s-1", name: "Build", type: "agent" }],
		getScheduledQueue: () => [],
		executionQueue: { isRunning: false, size: 0, highQueue: [], normalQueue: [] },
		schedulerRunning: false,
		schedulerStats: { ticks: 3 },
	};
}

describe("computeObservabilityMetrics empty store", () => {
	it("returns zeroed stats with 100% success rate when there are no projects", async () => {
		const metrics = await computeObservabilityMetrics(
			makeStore({ projects: [] }),
		);
		expect(metrics.stats).toMatchObject({
			total: 0,
			completed: 0,
			failed: 0,
			running: 0,
			waitingHuman: 0,
			paused: 0,
			inStage: 0,
			blocked: 0,
			queueDepth: 0,
			successRate: 100,
			failureRate: 0,
		});
		expect(metrics.activeTask).toBeNull();
		expect(metrics.recentCompleted).toEqual([]);
		expect(metrics.recentFailed).toEqual([]);
	});

	it("works without a projectStore", async () => {
		const store = makeStore();
		delete store.projectStore;
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.stats.total).toBe(0);
	});
});

describe("computeObservabilityMetrics status aggregation", () => {
	it("counts completed, failed, waiting_human, paused, and in-stage tasks", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [
					task({ id: "done", status: "completed" }),
					task({ id: "bad", status: "failed", failureReason: "boom" }),
					task({ id: "wait", status: "waiting_human" }),
					task({ id: "pa", status: "paused" }),
					task({ id: "run", status: "in_stage" }),
				],
			},
		});
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.stats).toMatchObject({
			total: 5,
			completed: 1,
			failed: 1,
			running: 0,
			waitingHuman: 1,
			paused: 1,
			inStage: 1,
			blocked: 0,
		});
		expect(metrics.stats.successRate).toBe(50);
		expect(metrics.stats.failureRate).toBe(50);
	});

	it("counts only the engine owner as running, never stale running_* labels", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [
					task({ id: "stale", status: "running_agent" }),
					task({ id: "owner", status: "running_agent" }),
				],
			},
			engine: { status: "running", activeTaskId: "owner", activeProjectId: "p-1" },
		});
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.stats.running).toBe(1);
		expect(metrics.stats.inStage).toBe(1);
	});

	it("counts blocked tasks", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [
					task({ id: "base", status: "in_stage" }),
					task({ id: "dep", status: "in_stage", blockedBy: ["base"] }),
				],
			},
		});
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.stats).toMatchObject({ total: 2, inStage: 2, blocked: 1 });
	});

	it("filters to one project when filterProjectId is given", async () => {
		const store = makeStore({
			projects: [project(), project({ id: "p-2", name: "Other" })],
			tasksByProject: {
				"p-1": [task({ id: "a", projectId: "p-1", status: "completed" })],
				"p-2": [task({ id: "b", projectId: "p-2", status: "failed" })],
			},
		});
		const metrics = await computeObservabilityMetrics(store, "p-2");
		expect(metrics.stats).toMatchObject({ total: 1, failed: 1, completed: 0 });
	});
});

describe("computeObservabilityMetrics recent lists", () => {
	it("sorts recent completed/failed newest-first and caps at 10", async () => {
		const tasks = Array.from({ length: 12 }, (_, i) =>
			task({
				id: `done-${i}`,
				status: "completed",
				updatedAt: `2026-09-24T10:${String(i).padStart(2, "0")}:00.000Z`,
			}),
		);
		const store = makeStore({ tasksByProject: { "p-1": tasks } });
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.recentCompleted).toHaveLength(10);
		expect(metrics.recentCompleted[0].id).toBe("done-11");
		expect(metrics.recentCompleted[0]).toMatchObject({
			projectId: "p-1",
			projectName: "Proj",
			reportsCount: 0,
		});
	});

	it("falls back through failureReason, lastError, and default text", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [
					task({ id: "e1", status: "failed", lastError: { message: "deep cause" } }),
					task({ id: "e2", status: "failed" }),
				],
			},
		});
		const metrics = await computeObservabilityMetrics(store);
		const byId = Object.fromEntries(metrics.recentFailed.map((r) => [r.id, r]));
		expect(byId.e1.failureReason).toBe("deep cause");
		expect(byId.e1.lastError).toEqual({ message: "deep cause" });
		expect(byId.e2.failureReason).toBe("Execution error");
		expect(byId.e2.lastError).toBeNull();
	});
});

describe("computeObservabilityMetrics active task", () => {
	it("promotes the engine owner with reports and curated prompt", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "owner", projectId: "p-1", status: "running_agent" })],
			},
			engine: {
				status: "running",
				activeTaskId: "owner",
				activeProjectId: "p-1",
				activeStageId: "s-1",
			},
		});
		store.getTaskReports = () => [{ filename: "r.md" }];
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.activeTask.id).toBe("owner");
		expect(metrics.activeTask.reports).toEqual([{ filename: "r.md" }]);
		expect(metrics.activeTask.promptSource).toBe("curated");
		expect(metrics.activeTask.promptPending).toBe(true);
	});

	it("falls back to the last executed task when no engine owner matches", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "done", projectId: "p-1", status: "completed" })],
			},
			engine: { status: "idle", activeTaskId: "missing", activeProjectId: null },
		});
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.activeTask.id).toBe("done");
		expect(metrics.activeTask.isLastExecuted).toBe(true);
	});

	it("reads the dispatched prompt from a live session", async () => {
		const session = {
			getActiveModel: async () => "test-model",
			getMessages: async () => [{ role: "user", content: "live prompt" }],
		};
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "owner", projectId: "p-1", status: "running_agent" })],
			},
			engine: {
				status: "running",
				activeTaskId: "owner",
				activeProjectId: "p-1",
				activeStageId: "s-1",
			},
		});
		store.sessionStore = {
			sessions: new Map([
				["p-1:owner", { taskId: "owner", stageId: "s-1", session }],
			]),
		};
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.activeTask.dispatchedPrompt).toBe("live prompt");
		expect(metrics.activeTask.promptSource).toBe("session");
		expect(metrics.activeTask.promptPending).toBe(false);
	});

	it("joins array message parts into the dispatched prompt", async () => {
		const session = {
			getMessages: async () => [
				{ role: "user", content: [{ type: "text", text: "part-a" }, { type: "image", text: "skip" }, { type: "text", text: "part-b" }] },
			],
		};
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "owner", projectId: "p-1", status: "running_agent" })],
			},
			engine: {
				status: "running",
				activeTaskId: "owner",
				activeProjectId: "p-1",
				activeStageId: "s-1",
			},
		});
		store.sessionStore = {
			sessions: new Map([
				["p-1:owner", { taskId: "owner", stageId: "s-1", session }],
			]),
		};
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.activeTask.dispatchedPrompt).toBe("part-a\npart-b");
	});

	it("reports explicit null alias fields without a session store (legacy doubles)", async () => {
		// Without a sessionStore there is no display seam: the raw stage
		// values pass through untouched, with explicit null alias fields.
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "owner", projectId: "p-1", status: "running_agent" })],
			},
			engine: {
				status: "running",
				activeTaskId: "owner",
				activeProjectId: "p-1",
				activeStageId: "s-1",
			},
		});
		store._resolveStagesForTask = () => [
			{ id: "s-1", name: "Build", type: "agent", harness: "alias", model: "small" },
		];
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.activeTask.harness).toBe("alias");
		expect(metrics.activeTask.model).toBe("small");
		expect(metrics.activeTask.alias).toBeNull();
		expect(metrics.activeTask.aliasMissing).toBeNull();
	});

	it("exposes queue, execution queue, and scheduler state", async () => {
		const store = makeStore();
		store.getScheduledQueue = () => [{ id: "a" }, { id: "b" }];
		store.executionQueue = { isRunning: true, size: 2, highQueue: [1], normalQueue: [1] };
		store.schedulerRunning = true;
		const metrics = await computeObservabilityMetrics(store);
		expect(metrics.stats.queueDepth).toBe(2);
		expect(metrics.queue).toHaveLength(2);
		expect(metrics.executionQueue).toMatchObject({
			isRunning: true,
			size: 2,
			highQueueSize: 1,
			normalQueueSize: 1,
		});
		expect(metrics.schedulerRunning).toBe(true);
		expect(metrics.schedulerStats).toEqual({ ticks: 3 });
		expect(metrics.gitContention).toMatchObject({
			acquisitions: expect.any(Number),
			waits: expect.any(Number),
		});
		expect(metrics.engineState.status).toBe("idle");
	});
});
