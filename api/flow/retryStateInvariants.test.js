// Domain: The Flow — retry-state writer invariants (task 8815d13d).
//
// Regression net for "every task stuck on RETRYING": every writer exit path
// is driven through the real TaskStore with a stale retry flag pre-seeded,
// and each settled exit must leave isRetryingTask(task) === false. Only the
// paths that explicitly schedule a retry may read as retrying.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { config } from "../config.js";
import {
	isRetryingTask,
	retryProgressLabel,
} from "../work/taskRetryState.js";
import { handleStageFailure } from "./routing/orchestrators/handleStageFailure.js";
import { handleTransientFailure } from "./routing/orchestrators/handleTransientFailure.js";
import { settleOperatorAbort } from "./routing/orchestrators/settleOperatorAbort.js";
import {
	completeTask,
	moveToStage,
	pauseTask,
	retryStage,
} from "./stageTransitions.js";
import { abortTask } from "./taskControl.js";
import { tripEngine } from "./circuitBreaker.js";

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
	syncBranchWithUpstream: vi.fn(async () => ({ synced: false, skipped: "no-remote" })),
	resolveSha: vi.fn(async () => "a".repeat(40)),
	diffRangeNumstat: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
}));

const stages = [
	{ id: "design", name: "Design", type: "human" },
	{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "design" },
];

describe("The Flow: retry-state writer invariants", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-retry-invariants-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function makeStore() {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		return new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
	}

	// A task left over from a previous attempt carries a stale schedule.
	function seedStaleRetry(task) {
		task.autoRetrying = true;
		task.retryState = "scheduled";
		task.nextRetryAt = new Date(Date.now() + 60_000).toISOString();
		return task;
	}

	it("parked stage failure clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		const result = handleStageFailure(store, "p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		expect(result.status).toBe("failed");
		expect(task.retryState).toBe("exhausted");
		expect(task.nextRetryAt).toBeNull();
		expect(isRetryingTask(task)).toBe(false);
		expect(retryProgressLabel(task)).toBe("");
	});

	it("exhausted transient budget clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		task.infraRetryCount = 9999;
		const result = handleTransientFailure(store, "p1", task.id, stages[1], new Error("socket hang up"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("failed");
		expect(task.retryState).toBe("exhausted");
		expect(isRetryingTask(task)).toBe(false);
	});

	it("operator abort settles quietly with no retry showing", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		const result = settleOperatorAbort(store, "p1", task.id, stages[1], new Error("aborted"), {
			projectCwd: tempCwd,
		});
		expect(result).not.toBeNull();
		expect(isRetryingTask(task)).toBe(false);
		expect(task.nextRetryAt).toBeNull();
	});

	it("manual abort clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		abortTask(store, "p1", task.id, tempCwd);
		expect(task.status).toBe("in_stage");
		expect(isRetryingTask(task)).toBe(false);
		expect(task.nextRetryAt).toBeNull();
	});

	it("pause clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		pauseTask(store, "p1", task.id, tempCwd);
		expect(task.status).toBe("paused");
		expect(isRetryingTask(task)).toBe(false);
	});

	it("completion clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		completeTask(store, "p1", task.id, tempCwd);
		expect(task.status).toBe("completed");
		expect(isRetryingTask(task)).toBe(false);
	});

	it("operator move clears a stale retry flag", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		moveToStage(store, "p1", task.id, "design", "Moved", store.eventBridge, tempCwd);
		expect(task.currentStageId).toBe("design");
		expect(isRetryingTask(task)).toBe(false);
	});

	it("circuit-trip deferral leaves no retry showing", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		seedStaleRetry(task);
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		const result = handleStageFailure(store, "p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result.deferred).toBe("tripped");
		expect(isRetryingTask(task)).toBe(false);
	});

	it("manual retry is the scheduled exception: RETRYING (manual) while pending", async () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		task.status = "failed";
		task.retryState = "exhausted";
		const retried = await retryStage(store, "p1", task.id, {
			stages,
			projectCwd: tempCwd,
		});
		expect(retried.status).toBe("in_stage");
		expect(isRetryingTask(retried)).toBe(true);
		expect(retryProgressLabel(retried)).toBe("RETRYING (manual)");
	});

	it("auto-iteration retry is the scheduled exception: retrying while armed", () => {
		const originalEnabled = config.autoIterationEnabled;
		config.autoIterationEnabled = true;
		try {
			const store = makeStore();
			const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
			const agentStages = [
				{ id: "build", name: "Build", type: "agent" },
				{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "build" },
			];
			const result = handleStageFailure(store, "p1", task.id, agentStages[1], new Error("boom"), {
				stages: agentStages,
				projectCwd: tempCwd,
				project: { maxAutoIterations: 1 },
			});
			expect(result.status).toBe("retrying");
			expect(isRetryingTask(task)).toBe(true);
			expect(task.nextRetryAt).not.toBeNull();
		} finally {
			config.autoIterationEnabled = originalEnabled;
		}
	});
});
