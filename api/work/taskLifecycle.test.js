import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	blockedByCreatesCycle,
	cancelProjectExecutions,
	clearProject,
	createTask,
	deleteTask,
	getTask,
	getTaskLogFeed,
	getTasks,
	isTaskBlocked,
	listTasks,
	parseBlockedByValue,
	removeTask,
	scanTasks,
	updateTask,
	validateBlockedBy,
} from "./taskLifecycle.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-h", name: "Review", type: "human" },
];

function makeStore({ project = { id: "p-1", stages: STAGES } } = {}) {
	const maps = new Map();
	const store = {
		tasksByProject: maps,
		scannedProjects: new Set(),
		dedupeMap: new Map(),
		engineState: {
			status: "idle",
			activeTaskId: null,
			activeProjectId: null,
			activeProjectName: null,
			activeStageId: null,
			activeStageName: null,
			activeStageType: null,
		},
		executionQueue: { clear: vi.fn() },
		eventBridge: { broadcastGlobal: vi.fn() },
		projectStore: { getProject: vi.fn(() => project) },
		_getMap: (pid) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			return maps.get(pid);
		},
		_resolveProjectCwd: (pid, cwd) => cwd || null,
		_saveTaskMarkdown: vi.fn(),
		_parseTaskMarkdown: vi.fn((content, taskId, projectId) => ({
			id: taskId,
			projectId,
			title: "parsed",
		})),
		_isBranchModeEnabled: () => false,
		_syncTaskReports: vi.fn(),
		_resolveStagesForTask: (proj) => proj?.stages || [],
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		setEngineState: vi.fn((patch) => Object.assign(store.engineState, patch)),
		killTaskProcess: vi.fn(),
		ensureTaskBranch: vi.fn(async () => {}),
	};
	return store;
}

function seedTask(store, projectId = "p-1", overrides = {}) {
	const map = store._getMap(projectId);
	const t = {
		id: `t-${map.size + 1}`,
		projectId,
		status: "in_stage",
		blockedBy: [],
		history: [],
		logEntries: [],
		...overrides,
	};
	map.set(t.id, t);
	return t;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("parseBlockedByValue", () => {
	it("normalizes arrays with dedupe", () => {
		expect(parseBlockedByValue(["b", "a", "b", ""])).toEqual(["b", "a"]);
	});

	it("parses JSON array strings", () => {
		expect(parseBlockedByValue('["a", "b"]')).toEqual(["a", "b"]);
		expect(parseBlockedByValue("[broken")).toEqual(["[broken"]);
	});

	it("parses comma-separated strings", () => {
		expect(parseBlockedByValue("a, b ,,c")).toEqual(["a", "b", "c"]);
	});

	it("returns [] for empty, blank, or other types", () => {
		expect(parseBlockedByValue([])).toEqual([]);
		expect(parseBlockedByValue("")).toEqual([]);
		expect(parseBlockedByValue("   ")).toEqual([]);
		expect(parseBlockedByValue(null)).toEqual([]);
		expect(parseBlockedByValue(undefined)).toEqual([]);
		expect(parseBlockedByValue(42)).toEqual([]);
	});
});

describe("blockedByCreatesCycle / validateBlockedBy", () => {
	it("detects direct, transitive, and self cycles", () => {
		const map = new Map([
			["a", { blockedBy: ["b"] }],
			["b", { blockedBy: ["c"] }],
			["c", { blockedBy: [] }],
		]);
		expect(blockedByCreatesCycle(map, "c", ["a"])).toBe(true);
		expect(blockedByCreatesCycle(map, "a", ["a"])).toBe(true);
		expect(blockedByCreatesCycle(map, "c", ["b"])).toBe(true);
		expect(blockedByCreatesCycle(map, "a", ["c"])).toBe(false);
		expect(blockedByCreatesCycle(map, "c", [])).toBe(false);
	});

	it("treats unknown blockers as leaves", () => {
		expect(blockedByCreatesCycle(new Map(), "a", ["ghost"])).toBe(false);
	});

	it("validateBlockedBy rejects self, unknown, and cyclic edits", () => {
		const map = new Map([
			["a", { blockedBy: [] }],
			["b", { blockedBy: ["a"] }],
		]);
		expect(() => validateBlockedBy(map, "a", ["a"])).toThrow("cannot block itself");
		expect(() => validateBlockedBy(map, "a", ["ghost"])).toThrow("Unknown task ID");
		expect(() => validateBlockedBy(map, "a", ["b"])).toThrow("dependency cycle");
		expect(validateBlockedBy(map, "b", ["a"])).toBeUndefined();
		expect(validateBlockedBy(map, "b", undefined)).toBeUndefined();
	});
});

describe("createTask", () => {
	it("creates a task with defaults and persists it", () => {
		const store = makeStore();
		const t = createTask(store, "p-1", { title: "Do it", goal: "Do it well" });
		expect(t.id).toBeTypeOf("string");
		expect(t).toMatchObject({
			projectId: "p-1",
			workflowId: "wf-default",
			title: "Do it",
			status: "in_stage",
			blockedBy: [],
		});
		expect(store._getMap("p-1").get(t.id)).toBe(t);
		expect(store._saveTaskMarkdown).toHaveBeenCalled();
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", t);
	});

	it("lands human stages in waiting_human", () => {
		const store = makeStore();
		const t = createTask(store, "p-1", { title: "R", goal: "R", stageId: "s-h" });
		expect(t.status).toBe("waiting_human");
	});

	it("lands legacy review stages in waiting_human (normalized to human)", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [{ id: "s-r", name: "Legacy Review", type: "review" }],
			},
		});
		const t = createTask(store, "p-1", { title: "R", goal: "R", stageId: "s-r" });
		expect(t.status).toBe("waiting_human");
	});

	it("uses the project activeWorkflowId and explicit workflowId", () => {
		const store = makeStore({ project: { id: "p-1", stages: STAGES, activeWorkflowId: "wf-x" } });
		expect(createTask(store, "p-1", { title: "A" }).workflowId).toBe("wf-x");
		expect(
			createTask(store, "p-1", { title: "B", goal: "B", workflowId: "wf-y" }).workflowId,
		).toBe("wf-y");
	});

	it("dedupes rapid repeats and idempotency keys", () => {
		const store = makeStore();
		const first = createTask(store, "p-1", { title: "Same", goal: "Same" });
		const second = createTask(store, "p-1", { title: "Same", goal: "Same" });
		expect(second).toBe(first);
		const keyed = createTask(store, "p-1", {
			title: "Keyed",
			goal: "Keyed",
			idempotencyKey: "k-1",
		});
		expect(createTask(store, "p-1", { title: "Other", idempotencyKey: "k-1" })).toBe(keyed);
	});

	it("expires the dedupe window and prunes stale entries", () => {
		const store = makeStore();
		const first = createTask(store, "p-1", { title: "S", goal: "S" });
		for (const entry of store.dedupeMap.values()) entry.timestamp -= 60_000;
		const second = createTask(store, "p-1", { title: "S", goal: "S" });
		expect(second).not.toBe(first);
		expect(second.id).not.toBe(first.id);
	});

	it("parses blockedBy and rejects invalid blockers", () => {
		const store = makeStore();
		const base = createTask(store, "p-1", { title: "Base", goal: "Base" });
		const other = createTask(store, "p-1", { title: "Other", goal: "Other" });
		const dep = createTask(store, "p-1", {
			title: "Dep",
			goal: "Dep",
			blockedBy: `${other.id}, ${base.id}`,
		});
		expect(dep.blockedBy).toEqual([other.id, base.id]);
		expect(() => createTask(store, "p-1", { title: "X", blockedBy: ["ghost"] })).toThrow(
			"Unknown task ID",
		);
	});

	it("assigns a branch name and kicks off provisioning when branch mode is on", async () => {
		const store = makeStore();
		store._isBranchModeEnabled = () => true;
		store._resolveProjectCwd = () => "/tmp/proj";
		const t = createTask(store, "p-1", { title: "B", goal: "B" });
		expect(t.branch).toContain(t.id);
		// Provisioning is issued during createTask (unawaited, so POST
		// /tasks stays instant); its git ops serialize with a running
		// stage's branch ops via the per-repo mutex inside api/git.js —
		// see gitConcurrency.integration.test.js.
		expect(store.ensureTaskBranch).toHaveBeenCalled();
		expect(store.ensureTaskBranch).toHaveBeenCalledWith(t, "/tmp/proj");
		await store.ensureTaskBranch.mock.results[0].value;
		expect(t.branchProvisionError).toBeUndefined();
	});

	it("falls back to Untitled task without title or goal", () => {
		const store = makeStore({ project: null });
		const t = createTask(store, "p-1", {});
		expect(t.title).toBe("Untitled task");
		expect(t.workflowId).toBe("wf-default");
	});
});

describe("listTasks / getTasks / getTask", () => {
	it("lists tasks and filters by workflow", () => {
		const store = makeStore();
		store.scannedProjects.add("p-1");
		seedTask(store, "p-1", { id: "a", workflowId: "wf-1" });
		seedTask(store, "p-1", { id: "b", workflowId: "wf-2" });
		expect(listTasks(store, "p-1").map((t) => t.id).sort()).toEqual(["a", "b"]);
		expect(listTasks(store, "p-1", null, "wf-1").map((t) => t.id)).toEqual(["a"]);
		expect(getTasks(store, "p-1", "wf-2").map((t) => t.id)).toEqual(["b"]);
		expect(getTasks(store, "p-1").map((t) => t.id).sort()).toEqual(["a", "b"]);
		expect(getTask(store, "p-1", "a").id).toBe("a");
		expect(getTask(store, "p-1", "missing")).toBeUndefined();
	});

	it("scans from disk on first listed access when a cwd is given", () => {
		const store = makeStore();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-scan-"));
		try {
			fs.mkdirSync(path.join(dir, "docs", "tasks", "disk-1"), { recursive: true });
			fs.writeFileSync(path.join(dir, "docs", "tasks", "disk-1", "task.md"), "# T");
			const tasks = listTasks(store, "p-1", dir);
			expect(tasks.map((t) => t.id)).toContain("disk-1");
			expect(store._parseTaskMarkdown).toHaveBeenCalled();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("scanTasks", () => {
	it("returns cached tasks when there is no base dir", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "cached" });
		expect(scanTasks(store, "p-1", null).map((t) => t.id)).toContain("cached");
	});

	it("returns cached tasks when the tasks dir is missing", () => {
		const store = makeStore();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-noscan-"));
		try {
			seedTask(store, "p-1", { id: "cached" });
			expect(scanTasks(store, "p-1", dir).map((t) => t.id)).toContain("cached");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("merges parsed markdown into existing tasks and skips files", () => {
		const store = makeStore();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-merge-"));
		try {
			const folder = path.join(dir, "docs", "tasks", "t-1");
			fs.mkdirSync(folder, { recursive: true });
			fs.writeFileSync(path.join(folder, "task.md"), "# T");
			fs.writeFileSync(path.join(dir, "docs", "tasks", "stray.txt"), "x");
			const existing = seedTask(store, "p-1", { id: "t-1", keep: true });
			scanTasks(store, "p-1", dir);
			expect(existing.title).toBe("parsed");
			expect(existing.keep).toBe(true);
			expect(store._syncTaskReports).toHaveBeenCalled();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("assigns branches and re-saves interrupted tasks", () => {
		const store = makeStore();
		store._isBranchModeEnabled = () => true;
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-branch-"));
		try {
			const folder = path.join(dir, "docs", "tasks", "t-9");
			fs.mkdirSync(folder, { recursive: true });
			fs.writeFileSync(path.join(folder, "task.md"), "# T");
			seedTask(store, "p-1", { id: "t-9", wasInterrupted: true, status: "interrupted" });
			scanTasks(store, "p-1", dir);
			const t = getTask(store, "p-1", "t-9");
			expect(t.branch).toContain("t-9");
			expect(store._saveTaskMarkdown).toHaveBeenCalled();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("getTaskLogFeed", () => {
	it("returns entries and text views for a feed", () => {
		const store = makeStore();
		seedTask(store, "p-1", {
			id: "t-1",
			logEntries: [
				{ id: "1", feed: "main", feeds: ["main"], text: "[AGENT] m" },
				{ id: "2", feed: "tools", feeds: ["tools"], text: "[TOOL] x" },
			],
		});
		const entries = getTaskLogFeed(store, "p-1", "t-1", { feed: "tools" });
		expect(entries).toMatchObject({ taskId: "t-1", feed: "tools", format: "entries" });
		expect(entries.entries.map((e) => e.id)).toEqual(["2"]);
		const text = getTaskLogFeed(store, "p-1", "t-1", { feed: "main", format: "text" });
		expect(text.text).toBe("[AGENT] m");
	});

	it("returns null for unknown tasks", () => {
		expect(getTaskLogFeed(makeStore(), "p-1", "ghost")).toBeNull();
	});
});

describe("isTaskBlocked", () => {
	it("reports unblocked when there are no blockers", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "a" });
		expect(isTaskBlocked(store, "p-1", "a")).toEqual({
			blocked: false,
			blockers: [],
			hasCycle: false,
		});
		expect(isTaskBlocked(store, "p-1", "ghost")).toEqual({
			blocked: false,
			blockers: [],
			hasCycle: false,
		});
	});

	it("reports blockers that are not completed", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "base", status: "in_stage" });
		seedTask(store, "p-1", { id: "done-base", status: "completed" });
		seedTask(store, "p-1", { id: "dep", blockedBy: ["base", "done-base", "ghost"] });
		const result = isTaskBlocked(store, "p-1", "dep");
		expect(result.blocked).toBe(true);
		expect(result.blockers).toEqual(["base"]);
	});

	it("handles diamond dependencies without false cycles", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "a", blockedBy: ["b", "c"] });
		seedTask(store, "p-1", { id: "b", blockedBy: ["d"] });
		seedTask(store, "p-1", { id: "c", blockedBy: ["d"] });
		seedTask(store, "p-1", { id: "d" });
		const result = isTaskBlocked(store, "p-1", "a");
		expect(result.hasCycle).toBe(false);
		expect(result.blocked).toBe(true);
		expect(result.blockers).toEqual(["b", "c"]);
	});

	it("flags dependency cycles", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "a", blockedBy: ["b"] });
		seedTask(store, "p-1", { id: "b", blockedBy: ["a"] });
		const result = isTaskBlocked(store, "p-1", "a");
		expect(result.hasCycle).toBe(true);
		expect(result.blocked).toBe(true);
	});
});

describe("updateTask", () => {
	it("updates fields, sanitizes titles, and touches updatedAt", () => {
		const store = makeStore();
		const t = seedTask(store, "p-1", { id: "t-1", title: "Old" });
		const updated = updateTask(store, "p-1", "t-1", { title: "# New", status: "paused" });
		expect(updated.title).toBe("New");
		expect(updated.status).toBe("paused");
		expect(updated.updatedAt).toBeTypeOf("string");
		expect(t).toBe(updated);
	});

	it("parses and validates blockedBy edits", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "base" });
		seedTask(store, "p-1", { id: "dep" });
		expect(updateTask(store, "p-1", "dep", { blockedBy: ["base"] }).blockedBy).toEqual(["base"]);
		expect(() => updateTask(store, "p-1", "dep", { blockedBy: ["ghost"] })).toThrow(
			"Unknown task ID",
		);
	});

	it("returns null for unknown tasks", () => {
		expect(updateTask(makeStore(), "p-1", "ghost", { title: "x" })).toBeNull();
	});
});

describe("deleteTask / removeTask", () => {
	it("removes the task, its folder, and broadcasts deletion", () => {
		const store = makeStore();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-del-"));
		try {
			const folder = path.join(dir, "docs", "tasks", "t-1");
			fs.mkdirSync(folder, { recursive: true });
			seedTask(store, "p-1", { id: "t-1" });
			expect(deleteTask(store, "p-1", "t-1", dir)).toBe(true);
			expect(getTask(store, "p-1", "t-1")).toBeUndefined();
			expect(fs.existsSync(folder)).toBe(false);
			expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_DELETED", {
				projectId: "p-1",
				taskId: "t-1",
			});
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("removeTask aliases deleteTask and missing tasks return false", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "t-1" });
		expect(removeTask(store, "p-1", "t-1", null)).toBe(true);
		expect(deleteTask(store, "p-1", "t-1", null)).toBe(false);
	});
});

describe("cancelProjectExecutions / clearProject", () => {
	it("parks live runs as interrupted and resets owned engine state", () => {
		const store = makeStore();
		seedTask(store, "p-1", { id: "live", status: "running_agent" });
		seedTask(store, "p-1", { id: "idle", status: "in_stage" });
		store.engineState.activeProjectId = "p-1";
		store.engineState.activeTaskId = "live";
		cancelProjectExecutions(store, "p-1");
		expect(store.executionQueue.clear).toHaveBeenCalledWith("p-1");
		expect(getTask(store, "p-1", "live").status).toBe("interrupted");
		expect(getTask(store, "p-1", "live").wasInterrupted).toBe(true);
		expect(getTask(store, "p-1", "idle").status).toBe("in_stage");
		expect(store.killTaskProcess).toHaveBeenCalledWith("live");
		expect(store.setEngineState).toHaveBeenCalledWith(
			expect.objectContaining({ status: "idle", activeTaskId: null }),
		);
	});

	it("leaves engine state alone for other projects", () => {
		const store = makeStore();
		store.engineState.activeProjectId = "p-2";
		cancelProjectExecutions(store, "p-1");
		expect(store.setEngineState).not.toHaveBeenCalled();
	});

	it("never throws on hostile store doubles", () => {
		const store = makeStore();
		store._getMap = () => {
			throw new Error("boom");
		};
		expect(() => cancelProjectExecutions(store, "p-1")).not.toThrow();
	});

	it("clearProject drops memory state and the tasks folder", () => {
		const store = makeStore();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-clear-"));
		try {
			const tasksDir = path.join(dir, "docs", "tasks");
			fs.mkdirSync(tasksDir, { recursive: true });
			seedTask(store, "p-1", { id: "t-1" });
			store.dedupeMap.set("k", { task: {}, timestamp: Date.now() });
			clearProject(store, "p-1", dir);
			expect(store._getMap("p-1").size).toBe(0);
			expect(store.dedupeMap.size).toBe(0);
			expect(store.scannedProjects.has("p-1")).toBe(true);
			expect(fs.existsSync(tasksDir)).toBe(false);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
