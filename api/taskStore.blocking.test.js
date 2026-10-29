/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "./taskStore.js";

// The git layer is fully mocked: no test ever runs real git.
vi.mock("./git.js", () => {
	class GitError extends Error {}
	class GitDirtyTreeError extends Error {
		constructor(message, opts = {}) {
			super(message);
			this.name = "GitDirtyTreeError";
			this.dirtyPaths = opts.dirtyPaths || [];
		}
	}
	class GitMergeConflictError extends Error {
		constructor(message, opts = {}) {
			super(message);
			this.name = "GitMergeConflictError";
			this.conflictedFiles = opts.conflictedFiles || [];
		}
	}
	return {
		GitError,
		GitDirtyTreeError,
		GitMergeConflictError,
		isGitRepository: vi.fn(async () => true),
		hasCommits: vi.fn(async () => true),
		currentBranch: vi.fn(async () => "main"),
		defaultBranch: vi.fn(async () => "main"),
		branchExists: vi.fn(async () => true),
		ensureBranchCheckedOut: vi.fn(async () => ({
			created: false,
			checkedOut: true,
			switched: false,
		})),
		checkoutBranch: vi.fn(async () => ({ switched: true })),
		requireCleanWorkingTree: vi.fn(async () => {}),
		commitAllIfNeeded: vi.fn(async () => ({ committed: false, hash: null })),
		mergeBranch: vi.fn(async () => ({ stdout: "merged", stderr: "" })),
		syncBranchWithUpstream: vi.fn(async () => ({ synced: false, skipped: "no-remote" })),
		hasRemote: vi.fn(async () => false),
		pushBranchIfRemote: vi.fn(async () => ({ pushed: false, skipped: "no-remote" })),
		returnToDefaultBranch: vi.fn(async () => ({ switched: false, branch: "main" })),
		resolveSha: vi.fn(async () => "a".repeat(40)),
		diffRangeNumstat: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
	};
});

/**
 * MARK: Task blocking (blockedBy) unit + integration tests
 * @description Pins the task-dependency contract: blockedBy parsing and
 * frontmatter round-trip, isTaskBlocked evaluation, scheduler skip,
 * execute-stage guard, queue ranking, write-time validation (self-block,
 * unknown ids, cycles), and the end-to-end A->B->C chain release order.
 */
const stages = [
	{ id: "1", name: "Idea", type: "agent", failback: "start" },
	{ id: "2", name: "Plan", type: "agent", failback: "previous" },
	{ id: "3", name: "Review", type: "human", failback: "any" },
	{ id: "4", name: "Ship", type: "agent", failback: "abort" },
];

describe("Task blocking (blockedBy)", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-blocking-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	function makeStore() {
		const mockProjectStore = {
			listProjects: () => [{ id: "p1", cwd: tempCwd, stages }],
			getProject: () => ({ id: "p1", cwd: tempCwd, stages }),
		};
		return new TaskStore({ projectStore: mockProjectStore });
	}

	it("creates a task with an array blockedBy", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		expect(blocked.blockedBy).toEqual([blocker.id]);
		expect(store.isTaskBlocked("p1", blocked.id).blocked).toBe(true);
	});

	it("accepts JSON-string and comma-separated blockedBy inputs", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const fromJson = store.createTask("p1", {
			title: "From JSON",
			goal: "json",
			stageId: "1",
			blockedBy: JSON.stringify([blocker.id]),
			projectCwd: tempCwd,
		});
		expect(fromJson.blockedBy).toEqual([blocker.id]);
		const fromCsv = store.createTask("p1", {
			title: "From CSV",
			goal: "csv",
			stageId: "1",
			blockedBy: ` ${blocker.id} `,
			projectCwd: tempCwd,
		});
		expect(fromCsv.blockedBy).toEqual([blocker.id]);
	});

	it("collapses duplicate blocker ids", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const task = store.createTask("p1", {
			title: "Dupes",
			goal: "dupes",
			stageId: "1",
			blockedBy: [blocker.id, blocker.id],
			projectCwd: tempCwd,
		});
		expect(task.blockedBy).toEqual([blocker.id]);
	});

	it("round-trips blockedBy through task.md frontmatter", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		const fresh = makeStore();
		fresh.scanTasks("p1", tempCwd);
		expect(fresh.getTask("p1", blocked.id).blockedBy).toEqual([blocker.id]);
		expect(fresh.isTaskBlocked("p1", blocked.id).blocked).toBe(true);
	});

	it("unblocks a dependent once its blocker completes", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		expect(store.isTaskBlocked("p1", blocked.id).blockers).toEqual([
			blocker.id,
		]);
		store.completeTask("p1", blocker.id, tempCwd);
		expect(store.isTaskBlocked("p1", blocked.id).blocked).toBe(false);
	});

	it("stays blocked when the blocker failed or was cancelled (fail-closed)", () => {
		const store = makeStore();
		const failedBlocker = store.createTask("p1", {
			title: "Failed blocker",
			goal: "fails",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const cancelledBlocker = store.createTask("p1", {
			title: "Cancelled blocker",
			goal: "cancelled",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const depA = store.createTask("p1", {
			title: "Dep A",
			goal: "a",
			stageId: "1",
			blockedBy: [failedBlocker.id],
			projectCwd: tempCwd,
		});
		const depB = store.createTask("p1", {
			title: "Dep B",
			goal: "b",
			stageId: "1",
			blockedBy: [cancelledBlocker.id],
			projectCwd: tempCwd,
		});
		store.updateTask("p1", failedBlocker.id, { status: "failed" }, tempCwd);
		store.updateTask(
			"p1",
			cancelledBlocker.id,
			{ status: "cancelled" },
			tempCwd,
		);
		expect(store.isTaskBlocked("p1", depA.id).blocked).toBe(true);
		expect(store.isTaskBlocked("p1", depB.id).blocked).toBe(true);
	});

	it("never dispatches a blocked task: scheduler skips it and executeStage returns blocked", async () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		// Older timestamp so the blocked task would win on age alone.
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		store.updateTask(
			"p1",
			blocked.id,
			{ enteredStageAt: new Date(Date.now() - 600000).toISOString() },
			tempCwd,
		);

		const candidate = store.findNextCandidateTask();
		expect(candidate?.taskId).toBe(blocker.id);

		const result = await store.executeStage("p1", blocked.id, { stages });
		expect(result.status).toBe("blocked");
		expect(result.blockers).toEqual([blocker.id]);
		// A blocked result must not leak into engine active state.
		expect(store.getEngineState().activeTaskId).not.toBe(blocked.id);
		expect(store.getEngineState().status).not.toBe("running");
	});

	it("ranks blocked tasks at the bottom of the queue with a reason", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		const queue = store.getScheduledQueue("p1");
		const entry = queue.find((q) => q.id === blocked.id);
		expect(entry.isBlocked).toBe(true);
		expect(entry.blockers).toEqual([blocker.id]);
		expect(entry.priorityRank).toBe(5);
		expect(entry.priorityReason).toContain(blocker.id);
		const blockerEntry = queue.find((q) => q.id === blocker.id);
		expect(blockerEntry.priorityRank).toBeLessThan(5);
	});

	it("rejects a self-block on update", () => {
		const store = makeStore();
		const task = store.createTask("p1", {
			title: "Solo",
			goal: "solo",
			stageId: "1",
			projectCwd: tempCwd,
		});
		expect(() =>
			store.updateTask("p1", task.id, { blockedBy: [task.id] }, tempCwd),
		).toThrow("Task cannot block itself");
	});

	it("rejects unknown blocker ids on create and update", () => {
		const store = makeStore();
		expect(() =>
			store.createTask("p1", {
				title: "Bad ref",
				goal: "bad",
				stageId: "1",
				blockedBy: ["task-that-does-not-exist"],
				projectCwd: tempCwd,
			}),
		).toThrow("Unknown task ID in blockedBy");
		const task = store.createTask("p1", {
			title: "Solo",
			goal: "solo",
			stageId: "1",
			projectCwd: tempCwd,
		});
		expect(() =>
			store.updateTask(
				"p1",
				task.id,
				{ blockedBy: ["task-that-does-not-exist"] },
				tempCwd,
			),
		).toThrow("Unknown task ID in blockedBy");
	});

	it("rejects direct and transitive dependency cycles", () => {
		const store = makeStore();
		const taskA = store.createTask("p1", {
			title: "A",
			goal: "a",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const taskB = store.createTask("p1", {
			title: "B",
			goal: "b",
			stageId: "1",
			blockedBy: [taskA.id],
			projectCwd: tempCwd,
		});
		// A -> B -> A must fail.
		expect(() =>
			store.updateTask("p1", taskA.id, { blockedBy: [taskB.id] }, tempCwd),
		).toThrow("dependency cycle");

		const taskC = store.createTask("p1", {
			title: "C",
			goal: "c",
			stageId: "1",
			blockedBy: [taskB.id],
			projectCwd: tempCwd,
		});
		// A -> C -> B -> A must fail.
		expect(() =>
			store.updateTask("p1", taskA.id, { blockedBy: [taskC.id] }, tempCwd),
		).toThrow("dependency cycle");
		// The rejected edits left the graph untouched.
		expect(store.getTask("p1", taskA.id).blockedBy).toEqual([]);
	});

	it("clearing blockedBy unblocks the task", () => {
		const store = makeStore();
		const blocker = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const blocked = store.createTask("p1", {
			title: "Blocked",
			goal: "Build second",
			stageId: "1",
			blockedBy: [blocker.id],
			projectCwd: tempCwd,
		});
		store.updateTask("p1", blocked.id, { blockedBy: [] }, tempCwd);
		expect(store.isTaskBlocked("p1", blocked.id).blocked).toBe(false);
	});

	it("releases a C-blocked-by-B-blocked-by-A chain in order with no manual step", () => {
		const store = makeStore();
		const taskA = store.createTask("p1", {
			title: "A",
			goal: "a",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const taskB = store.createTask("p1", {
			title: "B",
			goal: "b",
			stageId: "1",
			blockedBy: [taskA.id],
			projectCwd: tempCwd,
		});
		const taskC = store.createTask("p1", {
			title: "C",
			goal: "c",
			stageId: "1",
			blockedBy: [taskB.id],
			projectCwd: tempCwd,
		});

		// While A runs, B and C are skipped and sit at the bottom of the queue.
		expect(store.findNextCandidateTask()?.taskId).toBe(taskA.id);
		const queuedIds = store.getScheduledQueue("p1").map((q) => q.id);
		expect(queuedIds[queuedIds.length - 2]).toBe(taskB.id);
		expect(queuedIds[queuedIds.length - 1]).toBe(taskC.id);

		// Completing A frees B with no manual intervention; C stays blocked.
		store.completeTask("p1", taskA.id, tempCwd);
		expect(store.isTaskBlocked("p1", taskB.id).blocked).toBe(false);
		expect(store.isTaskBlocked("p1", taskC.id).blocked).toBe(true);
		expect(store.findNextCandidateTask()?.taskId).toBe(taskB.id);

		// Completing B frees C.
		store.completeTask("p1", taskB.id, tempCwd);
		expect(store.isTaskBlocked("p1", taskC.id).blocked).toBe(false);
		expect(store.findNextCandidateTask()?.taskId).toBe(taskC.id);
		expect(
			store.getScheduledQueue("p1").some((q) => q.isBlocked),
		).toBe(false);
	});

	it("broadcasts TASK_UPDATED when a blocker completes so badges clear live", () => {
		const events = [];
		const mockProjectStore = {
			listProjects: () => [{ id: "p1", cwd: tempCwd, stages }],
			getProject: () => ({ id: "p1", cwd: tempCwd, stages }),
		};
		const store = new TaskStore({ projectStore: mockProjectStore });
		store.eventBridge = { broadcastGlobal: (t, p) => events.push([t, p]) };
		const task = store.createTask("p1", {
			title: "Blocker",
			goal: "Build first",
			stageId: "1",
			projectCwd: tempCwd,
		});
		events.length = 0;
		store.completeTask("p1", task.id, tempCwd);
		expect(events.some(([type]) => type === "TASK_UPDATED")).toBe(true);
	});
});
