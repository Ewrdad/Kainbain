// Domain: The Flow — boot reconcile PIN (S7): server-restart orphans stay at zero.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { reconcileInterruptedRuns } from "./reconcileInterruptedRuns.js";

const RESTART_HISTORY_ROW = "Stage execution interrupted by server restart";

function makeBootStore({ projects, tasksByProject, activeTaskId = null } = {}) {
	const store = {
		projectStore: {
			listProjects: () => projects,
		},
		engineState: { status: "idle", activeTaskId },
		listTasks: (projectId) => tasksByProject.get(projectId) ?? [],
		_recordHistory: vi.fn((task, action, timestamp) => {
			task.history = task.history || [];
			task.history.push({ timestamp, action });
		}),
		_saveTaskMarkdown: vi.fn(),
	};
	return store;
}

function bootTask(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "in_stage",
		updatedAt: "2026-09-24T10:00:00.000Z",
		history: [],
		...overrides,
	};
}

function seedBootStore(tasks, { activeTaskId = null } = {}) {
	const projects = [{ id: "p-1", name: "P", cwd: "/repo" }];
	const tasksByProject = new Map([[projects[0].id, tasks]]);
	return makeBootStore({ projects, tasksByProject, activeTaskId });
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("reconcileInterruptedRuns boot PIN (S7)", () => {
	test("orphaned running_* tasks flip to interrupted with a server-restart history row", () => {
		const orphanStatuses = ["running_agent", "running_ci", "running_merge", "advancing"];
		const orphans = orphanStatuses.map((status, index) =>
			bootTask({ id: `orphan-${index}`, status }),
		);
		const control = bootTask({ id: "control", status: "in_stage" });
		const tasks = [...orphans, control];
		const before = new Map(tasks.map((task) => [task.id, task.updatedAt]));
		const store = seedBootStore(tasks);

		const reconciled = reconcileInterruptedRuns(store);

		for (const orphan of orphans) {
			expect(orphan.status).toBe("interrupted");
			expect(orphan.wasInterrupted).toBe(true);
			expect(orphan.updatedAt).not.toBe(before.get(orphan.id));
			expect(store._recordHistory).toHaveBeenCalledWith(
				orphan,
				RESTART_HISTORY_ROW,
				orphan.updatedAt,
			);
			expect(orphan.history.at(-1)).toMatchObject({ action: RESTART_HISTORY_ROW });
		}
		expect(reconciled).toEqual(
			orphans.map((orphan) => ({ projectId: "p-1", taskId: orphan.id })),
		);
		expect(control.status).toBe("in_stage");
		expect(control.wasInterrupted).toBeUndefined();
		expect(control.updatedAt).toBe(before.get(control.id));
		expect(control.history).toEqual([]);
		expect(reconciled).not.toContainEqual({ projectId: "p-1", taskId: control.id });
	});

	test("the engine owner's live task is untouched", () => {
		const owner = bootTask({ id: "owner", status: "running_agent" });
		const orphan = bootTask({ id: "orphan", status: "running_ci" });
		const store = seedBootStore([owner, orphan], { activeTaskId: owner.id });

		const reconciled = reconcileInterruptedRuns(store);

		expect(owner.status).toBe("running_agent");
		expect(owner.wasInterrupted).toBeUndefined();
		expect(owner.history).toEqual([]);
		expect(store._recordHistory).not.toHaveBeenCalledWith(
			owner,
			expect.anything(),
			expect.anything(),
		);
		expect(reconciled).not.toContainEqual({ projectId: "p-1", taskId: owner.id });
		expect(orphan.status).toBe("interrupted");
		expect(reconciled).toEqual([{ projectId: "p-1", taskId: orphan.id }]);
	});

	test("a second pass reconciles nothing and writes no further history (idempotent)", () => {
		const orphan = bootTask({ id: "orphan", status: "running_merge" });
		const store = seedBootStore([orphan]);

		const first = reconcileInterruptedRuns(store);
		expect(first).toEqual([{ projectId: "p-1", taskId: orphan.id }]);
		const historyCallsAfterFirst = store._recordHistory.mock.calls.length;
		expect(historyCallsAfterFirst).toBeGreaterThan(0);

		const second = reconcileInterruptedRuns(store);

		expect(second).toEqual([]);
		expect(store._recordHistory.mock.calls.length).toBe(historyCallsAfterFirst);
		expect(orphan.status).toBe("interrupted");
	});

	test("legacy running_deploy records still reconcile", () => {
		const legacy = bootTask({ id: "legacy", status: "running_deploy" });
		const store = seedBootStore([legacy]);

		const reconciled = reconcileInterruptedRuns(store);

		expect(legacy.status).toBe("interrupted");
		expect(legacy.wasInterrupted).toBe(true);
		expect(store._recordHistory).toHaveBeenCalledWith(
			legacy,
			RESTART_HISTORY_ROW,
			legacy.updatedAt,
		);
		expect(reconciled).toEqual([{ projectId: "p-1", taskId: legacy.id }]);
	});
});
