// Domain: The Work — unit tests for engine-state derivations (Now Playing bar).
import { describe, it, expect } from "vitest";
import {
	resolveEngineOwnerSnapshot,
	countOpenTasksGlobal,
} from "./taskEngineState.js";

function makeStore({ engineState = {}, tasks = {}, projectStore = null } = {}) {
	const tasksByProject = new Map();
	for (const [projectId, list] of Object.entries(tasks)) {
		tasksByProject.set(projectId, new Map(list.map((t) => [t.id, t])));
	}
	return {
		engineState: { status: "idle", ...engineState },
		tasksByProject,
		projectStore,
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
	it("counts open tasks across projects, excluding completed and done", () => {
		const store = makeStore({
			tasks: {
				p1: [
					{ id: "a", status: "in_stage" },
					{ id: "b", status: "completed" },
					{ id: "c", status: "done" },
				],
				p2: [{ id: "d", status: "running_agent" }],
			},
		});
		expect(countOpenTasksGlobal(store)).toBe(2);
	});

	it("returns 0 for missing or empty maps", () => {
		expect(countOpenTasksGlobal({})).toBe(0);
		expect(countOpenTasksGlobal({ tasksByProject: new Map() })).toBe(0);
	});

	it("ignores null or corrupt entries instead of inflating the depth", () => {
		const tasksByProject = new Map([
			["p1", new Map([["a", null], ["b", undefined], ["c", { id: "c", status: "in_stage" }]])],
		]);
		expect(countOpenTasksGlobal({ tasksByProject })).toBe(1);
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
});
