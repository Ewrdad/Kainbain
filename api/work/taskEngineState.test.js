// Domain: The Work — unit tests for engine-state derivations (Now Playing bar).
import { describe, it, expect } from "vitest";
import {
	resolveEngineOwnerSnapshot,
	countOpenTasksGlobal,
} from "./taskEngineState.js";

const COUNT_STAGES = [{ id: "1", name: "Work", type: "agent" }];

function countProjectStore(stages = COUNT_STAGES) {
	return {
		getProject: (id) => ({ id, name: `Project ${id}`, stages }),
	};
}

function makeStore({
	engineState = {},
	tasks = {},
	projectStore = null,
	blockedIds = [],
	claimedIds = [],
} = {}) {
	const tasksByProject = new Map();
	for (const [projectId, list] of Object.entries(tasks)) {
		tasksByProject.set(projectId, new Map(list.map((t) => [t.id, t])));
	}
	const blocked = new Set(blockedIds);
	const claimed = new Set(claimedIds);
	return {
		engineState: { status: "idle", ...engineState },
		tasksByProject,
		projectStore,
		isTaskBlocked: (projectId, taskId) => ({
			blocked: blocked.has(`${projectId}:${taskId}`),
			blockers: blocked.has(`${projectId}:${taskId}`) ? ["base"] : [],
			hasCycle: false,
		}),
		claimStore: {
			describe: (taskId) =>
				claimed.has(String(taskId)) ? { runnerId: "r-1" } : null,
		},
		getTask(projectId, taskId) {
			return tasksByProject.get(projectId)?.get(taskId) || null;
		},
		_getMap(projectId) {
			if (!tasksByProject.has(projectId)) tasksByProject.set(projectId, new Map());
			return tasksByProject.get(projectId);
		},
	};
}

describe("The Work: resolveEngineOwnerSnapshot", () => {
	it("returns null when the engine names no owner", () => {
		expect(resolveEngineOwnerSnapshot(makeStore())).toBeNull();
		expect(
			resolveEngineOwnerSnapshot(
				makeStore({ engineState: { activeTaskId: "t1" } }),
			),
		).toBeNull();
		expect(
			resolveEngineOwnerSnapshot(
				makeStore({ engineState: { activeProjectId: "p1" } }),
			),
		).toBeNull();
	});

	it("returns null when the store carries no engine state", () => {
		expect(resolveEngineOwnerSnapshot({})).toBeNull();
	});

	it("returns null when the owner record is gone", () => {
		const store = makeStore({
			engineState: { activeTaskId: "t1", activeProjectId: "p1" },
		});
		expect(resolveEngineOwnerSnapshot(store)).toBeNull();
	});

	it("resolves the owner from the owning project with engine-carried names", () => {
		const store = makeStore({
			engineState: {
				status: "running",
				activeTaskId: "t1",
				activeProjectId: "p1",
				activeProjectName: "Engine Project",
			},
			tasks: {
				p1: [
					{
						id: "t1",
						goal: "do work",
						title: "Work",
						status: "running_agent",
						workflowId: "w1",
						projectId: "p1",
						currentStageId: "3",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
			},
		});
		expect(resolveEngineOwnerSnapshot(store)).toEqual({
			id: "t1",
			goal: "do work",
			title: "Work",
			status: "running_agent",
			workflowId: "w1",
			workflowName: null,
			projectId: "p1",
			projectName: "Engine Project",
			currentStageId: "3",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
	});

	it("prefers the ProjectStore record for project and workflow names", () => {
		const store = makeStore({
			engineState: {
				activeTaskId: "t1",
				activeProjectId: "p1",
				activeProjectName: "Stale Name",
			},
			tasks: {
				p1: [{ id: "t1", status: "running_agent", workflowId: "w1" }],
			},
			projectStore: {
				getProject: () => ({ name: "Live Name" }),
				getWorkflow: () => ({ name: "Plan" }),
			},
		});
		const snapshot = resolveEngineOwnerSnapshot(store);
		expect(snapshot.projectName).toBe("Live Name");
		expect(snapshot.workflowName).toBe("Plan");
	});

	it("recovers from string/number id drift via the owner map scan", () => {
		const store = makeStore({
			engineState: { activeTaskId: 7, activeProjectId: "p1" },
			tasks: { p1: [{ id: "7", status: "in_stage", projectId: "p1" }] },
		});
		store.getTask = () => null;
		const snapshot = resolveEngineOwnerSnapshot(store);
		expect(snapshot?.id).toBe("7");
		expect(snapshot?.status).toBe("in_stage");
	});

	it("degrades to engine-carried names when the ProjectStore throws", () => {
		const store = makeStore({
			engineState: {
				activeTaskId: "t1",
				activeProjectId: "p1",
				activeProjectName: "Engine Name",
			},
			tasks: {
				p1: [{ id: "t1", status: "running_agent", workflowId: "w1" }],
			},
			projectStore: {
				getProject: () => {
					throw new Error("store down");
				},
				getWorkflow: () => {
					throw new Error("store down");
				},
			},
		});
		const snapshot = resolveEngineOwnerSnapshot(store);
		expect(snapshot?.projectName).toBe("Engine Name");
		expect(snapshot?.workflowName).toBeNull();
	});

	it("never throws on a hostile store", () => {
		const hostile = {
			get engineState() {
				throw new Error("nope");
			},
		};
		expect(resolveEngineOwnerSnapshot(hostile)).toBeNull();
		expect(resolveEngineOwnerSnapshot(null)).toBeNull();
		expect(resolveEngineOwnerSnapshot(undefined)).toBeNull();
		expect(
			resolveEngineOwnerSnapshot({
				engineState: { activeTaskId: "t1", activeProjectId: "p1" },
				getTask: () => {
					throw new Error("down");
				},
				_getMap: () => {
					throw new Error("down");
				},
				projectStore: {
					getProject: () => {
						throw new Error("down");
					},
				},
			}),
		).toBeNull();
	});

	it("projects missing task fields to null", () => {
		const store = makeStore({
			engineState: { activeTaskId: "t1", activeProjectId: "p1" },
			tasks: { p1: [{ id: "t1" }] },
		});
		expect(resolveEngineOwnerSnapshot(store)).toMatchObject({
			id: "t1",
			goal: null,
			title: null,
			status: null,
			workflowId: null,
			currentStageId: null,
			updatedAt: null,
		});
	});
});

describe("The Work: countOpenTasksGlobal", () => {
	it("counts only tasks waiting for pickup across projects", () => {
		const store = makeStore({
			projectStore: countProjectStore(),
			tasks: {
				p1: [
					{ id: "a", status: "in_stage", currentStageId: "1" },
					{ id: "b", status: "completed", currentStageId: "1" },
					{ id: "c", status: "done", currentStageId: "1" },
				],
				p2: [{ id: "d", status: "in_stage", currentStageId: "1" }],
			},
		});
		expect(countOpenTasksGlobal(store)).toBe(2);
	});

	it.each([
		"running_agent",
		"running_ci",
		"running_merge",
		"advancing",
		"paused",
		"checkpoint",
		"idle",
		"waiting_human",
		"failed",
		"cancelled",
	])("excludes non-waiting status %s from the depth", (status) => {
		const store = makeStore({
			projectStore: countProjectStore(),
			tasks: {
				p1: [
					{ id: "waiting", status: "in_stage", currentStageId: "1" },
					{ id: "other", status, currentStageId: "1" },
				],
			},
		});
		expect(countOpenTasksGlobal(store)).toBe(1);
	});

	it("excludes blocked, claimed, and human-stage tasks", () => {
		const store = makeStore({
			projectStore: countProjectStore([
				{ id: "1", name: "Work", type: "agent" },
				{ id: "2", name: "Gate", type: "human" },
			]),
			tasks: {
				p1: [
					{ id: "waiting", status: "in_stage", currentStageId: "1" },
					{ id: "blocked", status: "in_stage", currentStageId: "1" },
					{ id: "claimed", status: "in_stage", currentStageId: "1" },
					{ id: "human", status: "in_stage", currentStageId: "2" },
				],
			},
			blockedIds: ["p1:blocked"],
			claimedIds: ["claimed"],
		});
		expect(countOpenTasksGlobal(store)).toBe(1);
	});

	it("excludes non-resumable interruptions but counts resumable ones", () => {
		const store = makeStore({
			projectStore: countProjectStore([
				{ id: "1", name: "Work", type: "agent" },
				{ id: "2", name: "Gate", type: "human" },
			]),
			tasks: {
				p1: [
					{ id: "resumable", status: "interrupted", currentStageId: "1" },
					{ id: "parked", status: "interrupted", currentStageId: "2" },
				],
			},
		});
		expect(countOpenTasksGlobal(store)).toBe(1);
	});

	it("excludes the active engine owner while the engine runs it", () => {
		const store = makeStore({
			projectStore: countProjectStore(),
			engineState: { status: "running", activeTaskId: "a" },
			tasks: {
				p1: [
					{ id: "a", status: "in_stage", currentStageId: "1" },
					{ id: "b", status: "in_stage", currentStageId: "1" },
				],
			},
		});
		expect(countOpenTasksGlobal(store)).toBe(1);
	});

	it("returns 0 for missing or empty maps", () => {
		expect(countOpenTasksGlobal({})).toBe(0);
		expect(countOpenTasksGlobal({ tasksByProject: new Map() })).toBe(0);
	});

	it("ignores null or corrupt entries instead of inflating the depth", () => {
		const tasksByProject = new Map([
			["p1", new Map([["a", null], ["b", undefined], ["c", { id: "c", status: "in_stage", currentStageId: "1" }]])],
		]);
		expect(
			countOpenTasksGlobal({
				tasksByProject,
				projectStore: countProjectStore(),
			}),
		).toBe(1);
	});

	it("returns 0 rather than throwing when iteration fails", () => {
		expect(
			countOpenTasksGlobal({
				tasksByProject: {
					values: () => {
						throw new Error("down");
					},
				},
			}),
		).toBe(0);
	});

	it("keeps counts from readable maps when one project map is unreadable", () => {
		const tasksByProject = new Map([
			["p1", new Map([["a", { id: "a", status: "in_stage", currentStageId: "1" }]])],
			["p2", {
				values: () => {
					throw new Error("down");
				},
			}],
		]);
		expect(
			countOpenTasksGlobal({
				tasksByProject,
				projectStore: countProjectStore(),
			}),
		).toBe(1);
	});

	it("stays a read-only in-memory scan: no disk rescan, no cache mutation", () => {
		const store = makeStore({
			projectStore: countProjectStore(),
			tasks: {
				p1: [{ id: "a", status: "in_stage", currentStageId: "1" }],
			},
		});
		store.listTasks = () => {
			throw new Error("must never trigger a disk rescan");
		};
		const sizesBefore = Array.from(store.tasksByProject.entries()).map(
			([id, map]) => [id, map.size],
		);
		expect(countOpenTasksGlobal(store)).toBe(1);
		expect(
			Array.from(store.tasksByProject.entries()).map(([id, map]) => [
				id,
				map.size,
			]),
		).toEqual(sizesBefore);
	});
});
