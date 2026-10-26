// Domain: The Flow — human-intervention push classification tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { resolveStageErrorPushReason } from "./stageFailureRouting.js";

vi.mock("../git.js", () => ({
	isGitRepository: vi.fn(async () => true),
	hasCommits: vi.fn(async () => true),
	currentBranch: vi.fn(async () => "main"),
	defaultBranch: vi.fn(async () => "main"),
	branchExists: vi.fn(async () => true),
	ensureBranchCheckedOut: vi.fn(async () => ({ created: false, checkedOut: true, switched: false })),
	checkoutBranch: vi.fn(async () => ({ switched: true })),
	requireCleanWorkingTree: vi.fn(async () => {}),
	commitAllIfNeeded: vi.fn(async () => ({ committed: false, hash: null })),
	mergeBranch: vi.fn(async () => ({ stdout: "merged", stderr: "" })),
}));

const stages = [
	{ id: "build", name: "Build", type: "agent" },
	{ id: "verify", name: "Verify", type: "agent", fallbackStageId: "build" },
];

describe("stage failure push classification", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-routing-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	/***
	 * MARK: makeStore
	 * @description Real TaskStore on a throwaway cwd with a recording
	 *   notifyStagePush stub (invoked synchronously by the router, so the
	 *   recording is deterministic without awaiting floating promises).
	 ***/
	function makeStore() {
		const pushes = [];
		const notifications = [];
		const store = new TaskStore({
			eventBridge: {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: (projectId, notification) => {
					notifications.push({ projectId, ...notification });
				},
			},
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		store.notifyStagePush = (payload) => {
			pushes.push(payload);
			return Promise.resolve({ delivered: 1 });
		};
		return { store, pushes, notifications };
	}

	function makeTask(store) {
		return store.createTask("p1", {
			goal: "push classification",
			stageId: "verify",
			projectCwd: tempCwd,
		});
	}

	it("does NOT push on a normal CI failure that failbacks and auto-retries", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("tests failed: exit code 1"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("retrying");
		expect(pushes).toHaveLength(0);
	});

	it("does NOT toast while an auto-retry is in progress", () => {
		const { store, notifications } = makeStore();
		const task = makeTask(store);
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("tests failed: exit code 1"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("retrying");
		expect(notifications).toHaveLength(0);
	});

	it("toasts exactly once when the task parks unrecoverably", () => {
		const { store, notifications } = makeStore();
		const task = makeTask(store);
		const result = store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("[Authentication Error] 401 invalid api key"),
			{ stages, projectCwd: tempCwd },
		);
		expect(result.status).toBe("failed");
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			type: "error",
			taskId: task.id,
			stageId: "verify",
		});
		expect(notifications[0].title).toContain("Verify");
	});

	it("toasts when the auto-iteration budget is exhausted and the task parks", () => {
		const { store, notifications } = makeStore();
		const task = makeTask(store);
		task.autoIterationCount = 8; // == default max: this failure exhausts it
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("tests failed: exit code 1"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("failed");
		expect(notifications).toHaveLength(1);
	});

	it("does NOT toast for operator aborts", () => {
		const { store, notifications } = makeStore();
		const task = makeTask(store);
		store.handleStageFailure("p1", task.id, stages[1], new Error("This operation was aborted"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(notifications).toHaveLength(0);
	});

	it("does NOT push on an agent fail verdict (failureKind rejected)", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("agent verdict: FAIL — needs rework"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
			failureKind: "rejected",
		});
		expect(result.status).toBe("failed");
		expect(pushes).toHaveLength(0);
	});

	it("PUSHES on an unrecoverable auth error", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		const result = store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("[Authentication Error] 401 invalid api key"),
			{ stages, projectCwd: tempCwd },
		);
		expect(result.status).toBe("failed");
		expect(pushes).toHaveLength(1);
		expect(pushes[0]).toMatchObject({
			projectId: "p1",
			taskId: task.id,
			reason: "unrecoverable",
		});
	});

	it("PUSHES when the auto-iteration budget is exhausted", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		task.autoIterationCount = 8; // == default max: this failure exhausts it
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("tests failed: exit code 1"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("failed");
		expect(pushes).toHaveLength(1);
		expect(pushes[0].reason).toBe("auto_iteration_exhausted");
	});

	it("does NOT push for operator aborts", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		store.handleStageFailure("p1", task.id, stages[1], new Error("This operation was aborted"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(pushes).toHaveLength(0);
	});

	it("PUSHES when transient retries are exhausted and the task parks", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		task.infraRetryCount = 5; // == default max: this failure parks
		const result = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), {
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("failed");
		expect(pushes).toHaveLength(1);
		expect(pushes[0].reason).toBe("transient_retries_exhausted");
	});

	it("does NOT push while transient retries remain", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		const result = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), {
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("retrying");
		expect(pushes).toHaveLength(0);
	});

	it("survives a throwing push seam without breaking failure routing", () => {
		const { store, pushes } = makeStore();
		store.notifyStagePush = () => {
			throw new Error("push down");
		};
		const task = makeTask(store);
		const result = store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("401 unauthorized"),
			{ stages, projectCwd: tempCwd },
		);
		expect(result.status).toBe("failed");
		expect(pushes).toHaveLength(0);
	});

	it("resolveStageErrorPushReason: rejected and human checkpoints stay silent", () => {
		expect(
			resolveStageErrorPushReason({
				task: { autoIterationCount: 99 },
				parkedFrom: "in_stage",
				error: "401 unauthorized",
				failureKind: "rejected",
			}),
		).toBeNull();
		expect(
			resolveStageErrorPushReason({
				task: { autoIterationCount: 0 },
				parkedFrom: "waiting_human",
				error: "401 unauthorized",
			}),
		).toBeNull();
		expect(
			resolveStageErrorPushReason({
				task: { autoIterationCount: 0 },
				parkedFrom: "in_stage",
				error: "plain CI failure exit 1",
			}),
		).toBeNull();
		expect(
			resolveStageErrorPushReason({
				task: { autoIterationCount: 0 },
				parkedFrom: "in_stage",
				error: "rate limit 429 exceeded",
			}),
		).toBe("unrecoverable");
	});
});
