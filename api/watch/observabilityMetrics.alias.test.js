import { describe, it, expect, vi } from "vitest";
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
		isTaskBlocked: () => ({ blocked: false, blockers: [], hasCycle: false }),
		getTaskReports: () => [],
		_resolveStagesForTask: () => [{ id: "s-1", name: "Build", type: "agent", harness: "alias", model: "worker" }],
		getScheduledQueue: () => [],
		executionQueue: { isRunning: false, size: 0, highQueue: [], normalQueue: [] },
		schedulerRunning: false,
		schedulerStats: { ticks: 0 },
	};
}

describe("H1 reproduction: live muse session with peek landing on antigravity/gemini", () => {
	it("should display live muse harness and null model (harness-managed), NOT the peeked gemini model", async () => {
		const liveSession = {
			harnessId: "muse",
			getActiveModel: async () => null,
			getMessages: async () => [{ role: "user", content: "hello" }],
		};

		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "t-1", status: "running_agent" })],
			},
			engine: {
				status: "running",
				activeTaskId: "t-1",
				activeProjectId: "p-1",
				activeStageId: "s-1",
			},
		});

		// Live session exists for this running task on muse
		store.sessionStore = {
			sessions: new Map([
				["p-1:t-1", { taskId: "t-1", stageId: "s-1", session: liveSession }],
			]),
			// resolveDisplayTarget peeks and returns the OTHER target (antigravity + gemini)
			resolveDisplayTarget: vi.fn().mockReturnValue({
				harnessName: "antigravity",
				harness: { id: "antigravity", modelSelection: "list" },
				modelRef: "antigravity::google::gemini-2.5-flash",
				projectModelRef: undefined,
				aliasName: "worker",
				aliasMissing: null,
				targetIndex: 1,
			}),
		};

		const metrics = await computeObservabilityMetrics(store);

		// With live session running on muse:
		// Harness must be muse
		expect(metrics.activeTask.harness).toBe("muse");
		// Model selection for muse must be "none"
		expect(metrics.activeTask.modelSelection).toBe("none");
		// Model must be null (not gemini!)
		expect(metrics.activeTask.model).toBeNull();
		// Model details source should be "harness-managed"
		expect(metrics.activeTask.modelDetails.source).toBe("harness-managed");
		// Alias identity is worker
		expect(metrics.activeTask.alias?.name).toBe("worker");
		// Since peeked harness (antigravity) disagrees with live harness (muse),
		// targetIndex should be omitted/null (plan step 5.1: "if the peeked harness disagrees with the live harness, OMIT targetIndex")
		expect(metrics.activeTask.alias?.targetIndex).toBeUndefined();
	});

	it("shows one full peeked triple when idle (no live session)", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "t-1", status: "completed" })],
			},
			engine: { status: "idle", activeTaskId: null, activeProjectId: null },
		});
		store.sessionStore = {
			sessions: new Map(),
			resolveDisplayTarget: vi.fn().mockReturnValue({
				harnessName: "antigravity",
				harness: { id: "antigravity", modelSelection: "list" },
				modelRef: "antigravity::google::gemini-2.5-flash",
				projectModelRef: undefined,
				aliasName: "worker",
				aliasMissing: null,
				targetIndex: 1,
			}),
		};

		const metrics = await computeObservabilityMetrics(store);

		// No live session: the whole peeked preview shows, halves consistent.
		expect(metrics.activeTask.harness).toBe("antigravity");
		expect(metrics.activeTask.modelSelection).toBe("list");
		expect(metrics.activeTask.model).toBe(
			"antigravity::google::gemini-2.5-flash",
		);
		expect(metrics.activeTask.modelDetails.source).toBe("alias");
		expect(metrics.activeTask.alias).toEqual({ name: "worker", targetIndex: 1 });
		expect(metrics.activeTask.aliasMissing).toBeNull();
	});

	it("reports no model identity at all for scripted stages (even alias refs)", async () => {
		const store = makeStore({
			tasksByProject: {
				"p-1": [task({ id: "t-1", status: "completed" })],
			},
			engine: { status: "idle", activeTaskId: null, activeProjectId: null },
		});
		store._resolveStagesForTask = () => [
			{ id: "s-1", name: "Deploy", type: "deploy", harness: "alias", model: "worker" },
		];
		store.sessionStore = {
			sessions: new Map(),
			resolveDisplayTarget: vi.fn().mockReturnValue({
				harnessName: "antigravity",
				harness: { id: "antigravity", modelSelection: "list" },
				modelRef: "antigravity::google::gemini-2.5-flash",
				projectModelRef: undefined,
				aliasName: "worker",
				aliasMissing: null,
				targetIndex: 1,
			}),
		};

		const metrics = await computeObservabilityMetrics(store);

		expect(metrics.activeTask.isAutomatedStage).toBe(true);
		expect(metrics.activeTask.model).toBeNull();
		expect(metrics.activeTask.harness).toBeNull();
		expect(metrics.activeTask.modelDetails.source).toBe("scripted");
		expect(metrics.activeTask.alias).toBeNull();
		expect(metrics.activeTask.aliasMissing).toBeNull();
	});
});
