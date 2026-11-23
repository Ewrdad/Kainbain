// Domain: The Flow — boot reconcile PIN (S7): server-restart orphans stay at zero.
// Regression pin per GUIDE-06 §2: the one path that SHOULD write
// "Stage execution interrupted by server restart" is reconcileInterruptedRuns,
// run at boot by performStartupRecovery. Any "interrupted by server restart"
// row in prod re-opens Cause 6; any other writer of that string is a bug.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { reconcileInterruptedRuns } from "./reconcileInterruptedRuns.js";
import { ORPHANED_RUNNING_STATUSES } from "./orphanedRunningStatuses.js";

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
			expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", orphan);
			expect(orphan.history.at(-1)).toMatchObject({ action: RESTART_HISTORY_ROW });
		}
		// Exactly one history row per orphan — no extra or missing rows.
		expect(store._recordHistory).toHaveBeenCalledTimes(orphans.length);
		expect(reconciled).toEqual(
			orphans.map((orphan) => ({ projectId: "p-1", taskId: orphan.id })),
		);
		expect(control.status).toBe("in_stage");
		expect(control.wasInterrupted).toBeUndefined();
		expect(control.updatedAt).toBe(before.get(control.id));
		expect(control.history).toEqual([]);
		expect(store._saveTaskMarkdown).not.toHaveBeenCalledWith("/repo", control);
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
		expect(store._saveTaskMarkdown).not.toHaveBeenCalledWith("/repo", owner);
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
		const saveCallsAfterFirst = store._saveTaskMarkdown.mock.calls.length;
		expect(historyCallsAfterFirst).toBeGreaterThan(0);

		const second = reconcileInterruptedRuns(store);

		expect(second).toEqual([]);
		expect(store._recordHistory.mock.calls.length).toBe(historyCallsAfterFirst);
		expect(store._saveTaskMarkdown.mock.calls.length).toBe(saveCallsAfterFirst);
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

	test("ORPHANED_RUNNING_STATUSES covers every live running variant plus legacy running_deploy", () => {
		// GUIDE-06 §2 pin: the status set itself is the contract — a future
		// executor that leaves a new running_* label behind must be added
		// here or boot will stop reconciling it.
		for (const status of [
			"running_agent",
			"running_ci",
			"running_merge",
			"running_deploy", // legacy label from before the deploy-runtime removal
			"advancing",
		]) {
			expect(ORPHANED_RUNNING_STATUSES.has(status)).toBe(true);
		}
		// Terminal/queued labels must never be treated as orphans.
		for (const status of ["in_stage", "interrupted", "done", "failed", "queued"]) {
			expect(ORPHANED_RUNNING_STATUSES.has(status)).toBe(false);
		}
	});

	test("orphans in every project are reconciled and attributed to their own project", () => {
		const projects = [
			{ id: "p-1", name: "P1", cwd: "/repo-1" },
			{ id: "p-2", name: "P2", cwd: "/repo-2" },
		];
		const orphanA = bootTask({ id: "orphan-a", projectId: "p-1", status: "running_agent" });
		const orphanB = bootTask({ id: "orphan-b", projectId: "p-2", status: "advancing" });
		const tasksByProject = new Map([
			["p-1", [orphanA]],
			["p-2", [orphanB]],
		]);
		const store = makeBootStore({ projects, tasksByProject });

		const reconciled = reconcileInterruptedRuns(store);

		expect(reconciled).toEqual([
			{ projectId: "p-1", taskId: "orphan-a" },
			{ projectId: "p-2", taskId: "orphan-b" },
		]);
		expect(orphanA.status).toBe("interrupted");
		expect(orphanB.status).toBe("interrupted");
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo-1", orphanA);
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo-2", orphanB);
	});
});

describe("reconcileInterruptedRuns boot fail-safe (never blocks boot)", () => {
	test("a throwing or non-array project list reconciles nothing and never throws", () => {
		const orphan = bootTask({ id: "orphan", status: "running_agent" });
		const tasksByProject = new Map([["p-1", [orphan]]]);

		const throwingStore = makeBootStore({ projects: [], tasksByProject });
		throwingStore.projectStore.listProjects = () => {
			throw new Error("store unreadable");
		};
		expect(reconcileInterruptedRuns(throwingStore)).toEqual([]);
		expect(orphan.status).toBe("running_agent");

		const nonArrayStore = makeBootStore({ projects: null, tasksByProject });
		expect(reconcileInterruptedRuns(nonArrayStore)).toEqual([]);
		expect(orphan.status).toBe("running_agent");

		const noProjectStore = makeBootStore({ projects: [], tasksByProject });
		delete noProjectStore.projectStore;
		expect(reconcileInterruptedRuns(noProjectStore)).toEqual([]);
	});

	test("one broken project (throwing or non-array task list) never blocks the other projects", () => {
		const projects = [
			{ id: "p-bad-throw", name: "Bad", cwd: "/bad-throw" },
			{ id: "p-bad-list", name: "BadList", cwd: "/bad-list" },
			{ id: "p-good", name: "Good", cwd: "/good" },
		];
		const orphan = bootTask({ id: "orphan", projectId: "p-good", status: "running_agent" });
		const store = makeBootStore({ projects, tasksByProject: new Map() });
		store.listTasks = (projectId) => {
			if (projectId === "p-bad-throw") throw new Error("unreadable project dir");
			if (projectId === "p-bad-list") return undefined; // partial seam, not an array
			return [orphan];
		};

		let reconciled;
		expect(() => {
			reconciled = reconcileInterruptedRuns(store);
		}).not.toThrow();

		expect(reconciled).toEqual([{ projectId: "p-good", taskId: "orphan" }]);
		expect(orphan.status).toBe("interrupted");
		expect(store._recordHistory).toHaveBeenCalledWith(
			orphan,
			RESTART_HISTORY_ROW,
			expect.anything(),
		);
	});

	test("an id-less orphaned record still reconciles when no engine owner is set", () => {
		// Fail-safe direction: a record without an id can never be the
		// engine's active task, so it must flip rather than stay stuck.
		const idless = bootTask({ status: "running_agent" });
		delete idless.id;
		const store = seedBootStore([idless], { activeTaskId: null });

		const reconciled = reconcileInterruptedRuns(store);

		expect(idless.status).toBe("interrupted");
		expect(idless.wasInterrupted).toBe(true);
		expect(reconciled).toEqual([{ projectId: "p-1", taskId: undefined }]);
	});

	test("a store without history/markdown helpers still flips the status", () => {
		const orphan = bootTask({ id: "orphan", status: "running_ci" });
		const store = seedBootStore([orphan]);
		delete store._recordHistory;
		delete store._saveTaskMarkdown;

		const reconciled = reconcileInterruptedRuns(store);

		expect(reconciled).toEqual([{ projectId: "p-1", taskId: "orphan" }]);
		expect(orphan.status).toBe("interrupted");
		expect(orphan.wasInterrupted).toBe(true);
	});
});
