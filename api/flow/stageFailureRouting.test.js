// Domain: The Flow — subject unit tests for failed-stage timeline reasons.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { config } from "../config.js";
import {
	beginAutoIteration,
	excerptLog,
	failureLogExcerptLimit,
	parkedAlertStructuredFields,
	PROJECT_BLOCKER_ALERT_MEMORY_LIMIT,
	resetAttemptBudgets,
	resetAutoIteration,
	resolveAutoIterationEnabled,
	resolveMaxAutoIterations,
	resolveMaxTransientRetries,
	shouldSuppressProjectBlockerAlert,
	trimLogExcerpt,
} from "./stageFailureRouting.js";
import {
	clearAlertSinks,
	registerAlertSink,
	validateAlertPayload,
} from "../observability/alerts.js";
import {
	isRetryingTask,
	retryProgressLabel,
} from "../work/taskRetryState.js";
import {
	markStallHandled,
	consumeStallHandled,
} from "./stageHeartbeat.js";

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

/**
 * MARK: stageFailureRouting timeline reason tests
 * @description Verifies a failed stage leaves a structured reason on its
 * timeline entry (reason plus stage identity and bounded log excerpts),
 * keeps the history action string unchanged, and survives a task.md
 * save and reload.
 */
const stages = [
	{ id: "design", name: "Design", type: "human" },
	{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "design" },
];

describe("The Flow: failed-stage timeline reason", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-failure-reason-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
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

	it("attaches the structured reason to the failed timeline entry", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		const error = new Error("Out of tokens / context window exceeded");
		error.stderr = "backend exploded";
		error.stdout = "partial output";

		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		const entry = task.timeline.at(-1);
		expect(entry).toMatchObject({
			status: "Failed",
			reason: "Out of tokens / context window exceeded",
			stageId: "impl",
			stageName: "Implementation",
			stderr: "backend exploded",
			stdout: "partial output",
		});
	});

	it("keeps the history action string byte-identical", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		const failureEvent = task.history.find((h) =>
			h.action.startsWith("Stage failed in"),
		);
		expect(failureEvent.action).toBe("Stage failed in 'Implementation': boom");
	});

	it("caps stored log excerpts and omits empty ones", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		const error = new Error("big logs");
		error.stderr = `head-line\n${"x".repeat(failureLogExcerptLimit + 5000)}`;
		error.stdout = "   ";

		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		const entry = task.timeline.at(-1);
		expect(entry.stderr.length).toBeLessThanOrEqual(failureLogExcerptLimit);
		expect(entry.stderr.endsWith("x".repeat(100))).toBe(true);
		expect(entry).not.toHaveProperty("stdout");
		expect(trimLogExcerpt("  padded  ")).toBe("padded");
		expect(trimLogExcerpt(null)).toBe("");
	});

	it("preserves the timeline reason through a task.md save and reload", () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({ eventBridge: quietBridge, projectStore });
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		const error = new Error("reload me");
		error.stderr = "disk trace";
		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		const fresh = new TaskStore({ eventBridge: quietBridge, projectStore });
		fresh.scanTasks("p1", tempCwd);
		const loaded = fresh.getTask("p1", task.id);
		const entry = loaded.timeline.at(-1);
		expect(entry).toMatchObject({
			status: "Failed",
			reason: "reload me",
			stageId: "impl",
			stageName: "Implementation",
			stderr: "disk trace",
		});
	});

	it("leaves entries without a reason exactly as before", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "design", projectCwd: tempCwd });
		store._recordTimeline(task, { stage: "Design", status: "Success", duration: "1m" });
		store._recordHistory(task, "Task created");

		expect(task.timeline.at(-1)).not.toHaveProperty("reason");
		expect(task.history.at(-1)).toEqual({
			timestamp: expect.any(String),
			action: "Task created",
		});
	});
});

describe("The Flow: rejection kind on the failed task", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-rejected-kind-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
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

	it("marks an agent-review rejection on lastError without failback", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure("p1", task.id, stages[1], new Error("needs tests"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
			failureKind: "rejected",
		});

		expect(task.failureReason).toBe("needs tests");
		expect(task.lastError).toMatchObject({
			message: "needs tests",
			stageId: "impl",
			stageName: "Implementation",
			failureKind: "rejected",
		});
	});

	it("keeps the rejection kind when the failure falls back", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("review found a gap"),
			{
				stages,
				projectCwd: tempCwd,
				failureKind: "rejected",
				project: { autoIterationEnabled: false },
			},
		);

		// Failed back to the earlier stage, still carrying the rejection.
		expect(task.currentStageId).toBe("design");
		expect(task.failureReason).toBe("review found a gap");
		expect(task.lastError).toMatchObject({
			message: "review found a gap",
			stageId: "impl",
			stageName: "Implementation",
			failureKind: "rejected",
		});
	});

	it("leaves lastError without a kind for ordinary failures", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		expect(task.failureReason).toBe("boom");
		expect(task.lastError).not.toHaveProperty("failureKind");
	});
});

describe("The Flow: retry budget resolution (stage > project > global)", () => {
	it("prefers a stage budget over the project budget over the global default", () => {
		const project = { maxAutoIterations: 3, maxTransientRetries: 2 };
		// Project layer wins over the global default.
		expect(resolveMaxAutoIterations(undefined, project)).toBe(3);
		expect(resolveMaxTransientRetries(undefined, project)).toBe(2);
		// Stage override still wins over the project layer.
		expect(resolveMaxAutoIterations({ maxRetries: 9 }, project)).toBe(9);
		expect(resolveMaxTransientRetries({ maxTransientRetries: 7 }, project)).toBe(7);
		// Unset project fields fall through to the global default.
		expect(resolveMaxAutoIterations(undefined, {})).toBe(config.maxAutoIterations);
		expect(resolveMaxTransientRetries(undefined, {})).toBe(config.maxTransientRetries);
		// Absent project behaves exactly as before.
		expect(resolveMaxAutoIterations(undefined)).toBe(config.maxAutoIterations);
		expect(resolveMaxTransientRetries(undefined)).toBe(config.maxTransientRetries);
	});

	it("treats a zero project budget as disabled and ignores invalid values", () => {
		expect(resolveMaxAutoIterations(undefined, { maxAutoIterations: 0 })).toBe(0);
		expect(resolveMaxTransientRetries(undefined, { maxTransientRetries: 0 })).toBe(0);
		expect(resolveMaxAutoIterations(undefined, { maxAutoIterations: 2.9 })).toBe(2);
		expect(
			resolveMaxAutoIterations(undefined, { maxAutoIterations: "many" }),
		).toBe(config.maxAutoIterations);
		// Negative counts clamp to 0 (disabled), mirroring stage semantics.
		expect(resolveMaxTransientRetries(undefined, { maxTransientRetries: -4 })).toBe(0);
	});

	it("lets a project disable auto-iteration without touching the global default", () => {
		const original = config.autoIterationEnabled;
		config.autoIterationEnabled = true;
		try {
			expect(resolveAutoIterationEnabled(undefined)).toBe(true);
			expect(resolveAutoIterationEnabled({})).toBe(true);
			expect(resolveAutoIterationEnabled({ autoIterationEnabled: false })).toBe(false);
			expect(resolveAutoIterationEnabled({ autoIterationEnabled: true })).toBe(true);
			// A non-boolean project value falls through to the global default.
			expect(resolveAutoIterationEnabled({ autoIterationEnabled: "no" })).toBe(true);
		} finally {
			config.autoIterationEnabled = original;
		}
	});

	it("spends the project budget in beginAutoIteration and honours a project opt-out", () => {
		const originalMax = config.maxAutoIterations;
		const originalEnabled = config.autoIterationEnabled;
		config.maxAutoIterations = 8;
		config.autoIterationEnabled = true;
		try {
			const task = { status: "in_stage", autoIterationCount: 0 };
			const budgeted = beginAutoIteration(task, undefined, "boom", {
				maxAutoIterations: 1,
			});
			expect(budgeted).toEqual({ maxAttempts: 1, scheduled: true });
			expect(task.autoIterationCount).toBe(1);
			// Second failure exceeds the project budget of 1.
			expect(beginAutoIteration(task, undefined, "boom", { maxAutoIterations: 1 })).toBeNull();

			const optedOut = { status: "in_stage", autoIterationCount: 0 };
			expect(
				beginAutoIteration(optedOut, undefined, "boom", { autoIterationEnabled: false }),
			).toBeNull();
			expect(optedOut.autoIterationCount).toBe(0);
		} finally {
			config.maxAutoIterations = originalMax;
			config.autoIterationEnabled = originalEnabled;
		}
	});
});

describe("The Flow: attempt-budget reset", () => {
	it("resetAttemptBudgets clears every loop counter and restarts the stage clock", () => {
		const stale = "2026-01-01T00:00:00.000Z";
		const task = {
			autoIterationCount: 8,
			autoRetrying: true,
			infraRetryCount: 5,
			enteredStageAt: stale,
			timeInStage: 1234,
			failureReason: "kept for prompt reinjection",
			failbackWarningsSent: [50, 75],
		};
		resetAttemptBudgets(task);
		expect(task.autoIterationCount).toBe(0);
		expect(task.autoRetrying).toBe(false);
		expect(task.infraRetryCount).toBe(0);
		expect(task.timeInStage).toBe(0);
		expect(Date.parse(task.enteredStageAt)).toBeGreaterThan(Date.parse(stale));
		// A fresh attempt must be able to warn again at 50%/75%.
		expect(task).not.toHaveProperty("failbackWarningsSent");
		// The failure context stays: executeStage snapshots it into the next prompt.
		expect(task.failureReason).toBe("kept for prompt reinjection");
	});

	it("resetAutoIteration stays a working reset entry point", () => {
		const task = {
			autoIterationCount: 4,
			autoRetrying: true,
			infraRetryCount: 2,
			enteredStageAt: "2026-01-01T00:00:00.000Z",
			timeInStage: 99,
		};
		resetAutoIteration(task);
		expect(task.autoIterationCount).toBe(0);
		expect(task.autoRetrying).toBe(false);
		expect(task.infraRetryCount).toBe(0);
		expect(task.timeInStage).toBe(0);
		expect(Date.parse(task.enteredStageAt)).toBeGreaterThan(Date.parse("2026-01-01T00:00:00.000Z"));
	});

	it("resetAttemptBudgets clears the persisted retry schedule, not just the flag", () => {
		const task = {
			status: "in_stage",
			autoIterationCount: 2,
			autoRetrying: true,
			retryState: "scheduled",
			nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
			retryAttempt: 2,
			retryMaxAttempts: 5,
			infraRetryCount: 2,
		};
		resetAttemptBudgets(task);
		expect(task.retryState).toBe("none");
		expect(task.nextRetryAt).toBeNull();
		expect(task.retryAttempt).toBe(0);
		expect(task.retryMaxAttempts).toBe(0);
		expect(isRetryingTask(task)).toBe(false);
	});
});

describe("The Flow: stuck-retry characterization", () => {
	it("a previously retrying task that exhausts its budget parks as failed, not RETRYING", () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stuck-retry-test-"));
		try {
			const quietBridge = {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({
				eventBridge: quietBridge,
				projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
			});
			const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
			// Budget of 1: the first transient failure arms a retry (scheduled),
			// the second exhausts the budget and must park.
			const failOpts = {
				stages,
				projectCwd: tempCwd,
				project: { maxTransientRetries: 1 },
			};
			const first = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), failOpts);
			expect(first.status).toBe("retrying");
			expect(isRetryingTask(task)).toBe(true);
			const parked = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), failOpts);
			expect(parked.status).toBe("failed");
			expect(task.status).toBe("failed");
			expect(task.retryState).toBe("exhausted");
			expect(isRetryingTask(task)).toBe(false);
			expect(retryProgressLabel(task)).toBe("");
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});

	it("an auto-iteration retry that exhausts on the next failure parks without a lingering flag", () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stuck-retry-test-"));
		const originalEnabled = config.autoIterationEnabled;
		config.autoIterationEnabled = true;
		try {
			const quietBridge = {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({
				eventBridge: quietBridge,
				projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
			});
			const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
			// Both stages automated: failback lands on an agent stage so the
			// auto-iteration budget (not a human checkpoint) decides.
			const agentStages = [
				{ id: "build", name: "Build", type: "agent" },
				{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "build" },
			];
			const failOpts = {
				stages: agentStages,
				projectCwd: tempCwd,
				project: { maxAutoIterations: 1 },
			};
			const first = store.handleStageFailure("p1", task.id, agentStages[1], new Error("boom"), failOpts);
			expect(first.status).toBe("retrying");
			expect(isRetryingTask(task)).toBe(true);
			const parked = store.handleStageFailure("p1", task.id, agentStages[1], new Error("boom"), failOpts);
			expect(parked.status).toBe("failed");
			expect(task.status).toBe("failed");
			expect(isRetryingTask(task)).toBe(false);
		} finally {
			config.autoIterationEnabled = originalEnabled;
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});
});

describe("The Flow: head+tail log excerpts (excerptLog)", () => {
	function stackTraceFixture() {
		const head = [
			"TypeError: Cannot read properties of undefined (reading 'id')",
			"    at buildTask (/app/src/tasks.js:42:15)",
			"    at runStage (/app/src/stages.js:10:3)",
		].join("\n");
		const middle = Array.from(
			{ length: 300 },
			(_, index) => `    at noisyFrame (/app/node_modules/dep/index.js:${1000 + index}:7)`,
		).join("\n");
		const tail = [
			"Caused by: connection reset by peer",
			"[ERROR] Stage failed after 3 attempts",
		].join("\n");
		return { text: `${head}\n${middle}\n${tail}`, head, tail };
	}

	it("passes short, blank, and non-string inputs through like before", () => {
		expect(excerptLog("a\nb", 10)).toBe("a\nb");
		expect(excerptLog("  padded  ")).toBe("padded");
		expect(excerptLog("   ")).toBe("");
		expect(excerptLog(null)).toBe("");
		expect(excerptLog(undefined)).toBe("");
	});

	it("keeps the stack-trace head and the diagnostic tail within budget", () => {
		const { text } = stackTraceFixture();
		expect(text.length).toBeGreaterThan(failureLogExcerptLimit);
		const excerpt = excerptLog(text);
		expect(excerpt.length).toBeLessThanOrEqual(failureLogExcerptLimit);
		expect(excerpt).toContain("TypeError: Cannot read properties of undefined");
		expect(excerpt).toContain("at buildTask (/app/src/tasks.js:42:15)");
		expect(excerpt).toContain("[ERROR] Stage failed after 3 attempts");
	});

	it("marks the elided middle with exactly one marker carrying counts", () => {
		const { text } = stackTraceFixture();
		const excerpt = excerptLog(text);
		const markers = excerpt.match(/… \[(\d+) chars \/ (\d+) lines omitted\] …/g) || [];
		expect(markers).toHaveLength(1);
		const [, chars, lines] = excerpt.match(/… \[(\d+) chars \/ (\d+) lines omitted\] …/);
		expect(Number(chars)).toBeGreaterThan(0);
		expect(Number(lines)).toBeGreaterThan(0);
	});

	it("stores head+tail excerpts on the failed timeline entry", () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-excerpt-test-"));
		try {
			const quietBridge = {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({
				eventBridge: quietBridge,
				projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
			});
			const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
			const { text } = stackTraceFixture();
			const error = new Error("stage blew up");
			error.stderr = text;
			store.handleStageFailure("p1", task.id, stages[1], error, {
				stages,
				projectCwd: tempCwd,
				skipFailback: true,
			});
			const entry = task.timeline.at(-1);
			expect(entry.stderr.length).toBeLessThanOrEqual(failureLogExcerptLimit);
			expect(entry.stderr).toContain("TypeError: Cannot read properties of undefined");
			expect(entry.stderr).toContain("[ERROR] Stage failed after 3 attempts");
			expect(entry.stderr).toMatch(/lines omitted/);
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});

});

describe("The Flow: parked-failure outbound alerts", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-park-alert-test-"));
		clearAlertSinks();
	});

	afterEach(() => {
		clearAlertSinks();
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function parkTask() {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		return { store, task };
	}

	async function flushAlerts() {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}

	it("parks identically with the sink down and alerts critical when a sink listens", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const { store, task } = parkTask();
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		expect(result.status).toBe("failed");
		expect(task.status).toBe("failed");
		expect(task.timeline.at(-1)).toMatchObject({ status: "Failed" });
		await flushAlerts();
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			event: "task.failed",
			severity: "critical",
			task: { projectId: "p1", id: task.id },
		});
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("keeps a failed deploy-command stage on the ordinary command-failure alert", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const { store, task } = parkTask();
		const error = new Error("Post-merge command `./deploy.sh --prod` failed with exit code 1");
		error.deployGate = "canary-e2e";
		error.deployFailedCommand = "npm run test:canary";
		error.deployAttemptId = "deploy-task-1-9";
		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		await flushAlerts();
		expect(seen).toHaveLength(1);
		// Generic failure payload: no deploy-specific fields even though the
		// error carries them (continuity-owned diagnostics, not alert schema).
		expect(seen[0]).not.toHaveProperty("deployGate");
		expect(seen[0]).not.toHaveProperty("deployFailedCommand");
		expect(seen[0]).not.toHaveProperty("deployAttemptId");
		expect(seen[0]).not.toHaveProperty("projectBlocker");
		expect(seen[0]).toMatchObject({ event: "task.failed" });
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("drops deploy-cause fields even when the error carries them", () => {
		expect(parkedAlertStructuredFields({}, new Error("boom"))).toEqual({});
		// Deploy diagnostics ride on the error for continuity use, but the
		// generic structured fields no longer copy them onto the alert.
		expect(
			parkedAlertStructuredFields(
				{},
				Object.assign(new Error("boom"), { deployGate: "canary-e2e" }),
			),
		).toEqual({});
		expect(parkedAlertStructuredFields(null, null)).toEqual({});
	});

	it("dedupes project-blocker alerts per gate@sha and bounds its memory", () => {
		const store = {};
		// First park per key alerts; repeats are suppressed.
		expect(shouldSuppressProjectBlockerAlert(store, "canary-e2e@abc", { taskId: "t1", projectId: "p" })).toBe(false);
		expect(shouldSuppressProjectBlockerAlert(store, "canary-e2e@abc", { taskId: "t2", projectId: "p" })).toBe(true);
		// A different SHA is a different blocker.
		expect(shouldSuppressProjectBlockerAlert(store, "canary-e2e@def", { taskId: "t3", projectId: "p" })).toBe(false);
		// Blank keys and missing stores never suppress (an alert is never lost).
		expect(shouldSuppressProjectBlockerAlert(store, "", {})).toBe(false);
		expect(shouldSuppressProjectBlockerAlert(null, "canary-e2e@abc", {})).toBe(false);
		// The map is capped: the oldest tokens are pruned, the newest kept.
		for (let i = 0; i < PROJECT_BLOCKER_ALERT_MEMORY_LIMIT + 5; i += 1) {
			shouldSuppressProjectBlockerAlert(store, `canary-e2e@sha-${i}`, { taskId: `t${i}`, projectId: "p" });
		}
		expect(Object.keys(store.sharedGateBlockerAlerts).length).toBeLessThanOrEqual(
			PROJECT_BLOCKER_ALERT_MEMORY_LIMIT,
		);
		expect(store.sharedGateBlockerAlerts["canary-e2e@sha-0"]).toBeUndefined();
		expect(
			store.sharedGateBlockerAlerts[`canary-e2e@sha-${PROJECT_BLOCKER_ALERT_MEMORY_LIMIT + 4}`],
		).toBeDefined();
	});

	it("alerts once per project-blocker key and never consumes retry budget (C3)", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const blocker = () =>
			Object.assign(new Error("Shared gate 'canary-e2e' is failing on main"), {
				deployGate: "canary-e2e",
				projectBlocker: {
					gate: "canary-e2e",
					mainBranch: "main",
					mainSha: "abc123",
					key: "canary-e2e@abc123",
					reason: "Shared gate 'canary-e2e' is failing on main",
				},
			});
		// A project-blocked park records the shared-gate reason and leaves
		// every retry budget untouched (the fix is to the suite, not the task).
		const first = parkTask();
		const r1 = first.store.handleStageFailure("p1", first.task.id, stages[1], blocker(), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		await flushAlerts();
		expect(r1.status).toBe("failed");
		expect(first.task.status).toBe("failed");
		expect(first.task.infraRetryCount || 0).toBe(0);
		expect(first.task.autoIterationCount || 0).toBe(0);
		expect(String(first.task.failureReason)).toContain("canary-e2e");
		expect(seen).toHaveLength(1);
		// Generic payload carries no shared-gate diagnostics; the keyed
		// suppression still fires (first park alerts).
		expect(seen[0]).not.toHaveProperty("projectBlocker");
		expect(seen[0]).not.toHaveProperty("deployGate");
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("dedupes repeat parks for one gate@sha on a single store (C3)", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const quietBridge = { emitProcessEvent: () => {}, emitSystemLog: () => {}, emitNotification: () => {} };
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		const blocker = () =>
			Object.assign(new Error("Shared gate 'canary-e2e' is failing on main"), {
				deployGate: "canary-e2e",
				projectBlocker: {
					gate: "canary-e2e",
					mainBranch: "main",
					mainSha: "abc123",
					key: "canary-e2e@abc123",
					reason: "Shared gate 'canary-e2e' is failing on main",
				},
			});
		const t1 = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		const t2 = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		store.handleStageFailure("p1", t1.id, stages[1], blocker(), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		store.handleStageFailure("p1", t2.id, stages[1], blocker(), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		await flushAlerts();
		expect(seen).toHaveLength(1);
		// Suppression is keyed on the error-carried blocker key; the payload
		// itself carries no shared-gate diagnostics.
		expect(seen[0]).not.toHaveProperty("deployGate");
		expect(seen[0]).not.toHaveProperty("projectBlocker");
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("settles the park with zero deliveries when no sink is configured", async () => {
		const { store, task } = parkTask();
		const result = store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		expect(result.status).toBe("failed");
		await flushAlerts();
	});

	it("alerts critical/transient when the transient budget exhausts", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const { store, task } = parkTask();
		const result = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), {
			projectCwd: tempCwd,
			project: { maxTransientRetries: 0 },
		});
		expect(result.status).toBe("failed");
		expect(task.status).toBe("failed");
		await flushAlerts();
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			event: "task.failed",
			severity: "critical",
			error: { kind: "transient" },
			attemptCounts: { attempt: 1, maxAttempts: 0 },
		});
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("carries the WP5 conflicted files on a merge-conflict park", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const { store, task } = parkTask();
		const conflict = new Error("merge conflict");
		conflict.conflictedFiles = ["src/app.js", "src/util.js"];
		store.handleStageFailure("p1", task.id, stages[1], conflict, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		await flushAlerts();
		expect(seen).toHaveLength(1);
		expect(seen[0].conflictedFiles).toEqual(["src/app.js", "src/util.js"]);
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("carries the review-baseline SHAs when the task has them", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const { store, task } = parkTask();
		task.reviewBaseline = {
			baseSha: "aaa111",
			headSha: "bbb222",
			mainSha: "ccc333",
			mergedAt: new Date().toISOString(),
		};
		store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		await flushAlerts();
		expect(seen).toHaveLength(1);
		expect(seen[0].shas).toEqual({
			baseSha: "aaa111",
			headSha: "bbb222",
			mainSha: "ccc333",
		});
		expect(seen[0]).not.toHaveProperty("conflictedFiles");
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});
});

describe("The Flow: excerptLog budget rigidity", () => {
	it("never exceeds the budget across adversarial sizes and limits", () => {
		const line = (n) => `line-${n} ` + "x".repeat(40);
		for (const total of [50, 500, 5000, 20000]) {
			const text = Array.from({ length: total }, (_, i) => line(i)).join("\n");
			for (const limit of [128, 200, 512, 1024, failureLogExcerptLimit]) {
				const excerpt = excerptLog(text, limit);
				expect(excerpt.length).toBeLessThanOrEqual(limit);
			}
		}
	});

	it("keeps the final diagnostic line intact even after marker recount trims", () => {
		const headLine = "Error: root cause at the very top of the trace";
		const middle = Array.from({ length: 400 }, (_, i) => `    at frame${i} (dep.js:${i}:1)`).join("\n");
		const finalLine = "[ERROR] final diagnostic at the very bottom";
		// Sweep limits: the recount path triggers at different budgets, and
		// the final line must survive every one of them.
		for (const limit of [128, 200, 300, 512, 1024, failureLogExcerptLimit]) {
			const excerpt = excerptLog(`${headLine}\n${middle}\n${finalLine}`, limit);
			expect(excerpt.length).toBeLessThanOrEqual(limit);
			expect(excerpt).toContain(finalLine);
			if (excerpt.length < headLine.length + middle.length + finalLine.length) {
				expect(excerpt).toMatch(/lines omitted/);
			}
		}
	});

	it("keeps a single over-long opening line instead of dropping it", () => {
		const longHead = `Error: ${"x".repeat(5000)}`;
		const excerpt = excerptLog(`${longHead}\nfinal diagnostic`, 512);
		expect(excerpt.length).toBeLessThanOrEqual(512);
		expect(excerpt).toContain("final diagnostic");
		expect(excerpt.startsWith("Error:")).toBe(true);
	});

	it("keeps a long final line whole when a naive tail slice would cut its prefix", () => {
		// Regression: two ~83-char lines at a 128-char budget. The old fixed
		// tail window landed mid-final-line and dropped 'L1-', so the
		// diagnostic message arrived as anonymous x's.
		const text = ["L0-" + "x".repeat(80), "L1-" + "x".repeat(80)].join("\n");
		const excerpt = excerptLog(text, 128);
		expect(excerpt.length).toBeLessThanOrEqual(128);
		expect(excerpt.endsWith("L1-" + "x".repeat(80))).toBe(true);
		expect(excerpt).toMatch(/chars \/ \d+ lines omitted/);
	});

	it("still marks the omission when the final line cannot fit whole", () => {
		// A final line longer than the room left after the marker cannot be
		// kept intact; the receiver must still SEE that content was elided.
		const text = ["Error: root cause", "y".repeat(300)].join("\n");
		for (const limit of [128, 200, 256]) {
			const excerpt = excerptLog(text, limit);
			expect(excerpt.length).toBeLessThanOrEqual(limit);
			expect(excerpt).toMatch(/lines omitted/);
			expect(excerpt.endsWith("y".repeat(20))).toBe(true);
		}
	});

	it("always emits exactly one marker for any truncated multi-line log", () => {
		const line = (n) => `L${n}-` + "z".repeat(30 + (n % 50));
		for (let total = 3; total <= 60; total += 7) {
			const text = Array.from({ length: total }, (_, i) => line(i)).join("\n");
			for (const limit of [128, 137, 200, 333, 512, 3072]) {
				const excerpt = excerptLog(text, limit);
				expect(excerpt.length).toBeLessThanOrEqual(limit);
				const markers = excerpt.match(/omitted/g) || [];
				expect(markers).toHaveLength(text.length > limit ? 1 : 0);
			}
		}
	});
});

/**
 * MARK: watchdog stall de-duplication tests
 * @description WP6: the stall watchdog terminates the in-flight run and routes
 *   the stall once. The terminated run settles with a non-zero exit and would
 *   otherwise fail back immediately after the transient retry; these tests
 *   prove the duplicate routing is suppressed exactly once.
 */
describe("The Flow: watchdog stall de-duplication", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stall-dedup-test-"));
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

	it("suppresses handleStageFailure after the watchdog already handled the stall", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		markStallHandled(store, task.id);
		const historyBefore = task.history.length;
		const result = store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("CI command failed with exit code 1"),
			{ stages, projectCwd: tempCwd },
		);
		expect(result.status).toBe("stalled");
		expect(task.status).toBe("in_stage");
		// No failback history, no timeline failure entry: routing was suppressed.
		expect(task.history.length).toBe(historyBefore);
		expect(
			(task.timeline || []).some((e) => e.status === "Failed"),
		).toBe(false);
		// Marker is single-use.
		expect(consumeStallHandled(store, task.id)).toBe(false);
	});

	it("suppresses handleTransientFailure after the watchdog already handled the stall", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		markStallHandled(store, task.id);
		const historyBefore = task.history.length;
		const result = store.handleTransientFailure(
			"p1",
			task.id,
			stages[1],
			new Error("socket hang up"),
			{ projectCwd: tempCwd },
		);
		expect(result.message).toContain("already handled by the watchdog");
		expect(task.history.length).toBe(historyBefore);
		expect(task.infraRetryCount ?? 0).toBe(0);
	});

	it("routes normally when no stall marker is present", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		const result = store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("boom"),
			{ stages, projectCwd: tempCwd, skipFailback: true },
		);
		expect(result.status).toBe("failed");
		expect(task.status).toBe("failed");
	});
});

describe("The Flow: failure-timeline run attribution", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-failure-attribution-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
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

	it("stamps the Failed row with the harness/model/alias from the routing opts", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
			harnessId: "antigravity",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
			targetIndex: 1,
		});

		const entry = task.timeline.at(-1);
		expect(entry.status).toBe("Failed");
		expect(entry).toMatchObject({
			harnessId: "antigravity",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
			targetIndex: 1,
		});
	});

	it("leaves the Failed row completely blank for unattributed failures (ci-style)", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleStageFailure("p1", task.id, stages[1], new Error("boom"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});

		const entry = task.timeline.at(-1);
		expect(entry.status).toBe("Failed");
		expect(entry.harnessId).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
		// Absent, never placeholder-worded.
		expect(JSON.stringify(entry)).not.toContain("no model");
		expect(JSON.stringify(entry)).not.toContain("automated");
	});

	it("stamps the transient Retrying row with the failed attempt's attribution", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleTransientFailure(
			"p1",
			task.id,
			stages[1],
			new Error("[Timeout Error] Stage execution timed out: boom"),
			{
				projectCwd: tempCwd,
				harnessId: "pi",
				failureKind: "infrastructure",
				aliasName: "worker",
				modelRef: "mistral::large",
				targetIndex: 0,
			},
		);

		const entry = task.timeline.at(-1);
		expect(entry.status).toBe("Retrying");
		expect(entry).toMatchObject({
			harnessId: "pi",
			aliasName: "worker",
			modelRef: "mistral::large",
			targetIndex: 0,
		});
	});

	it("stamps the parked Failed row after the transient budget is exhausted", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleTransientFailure(
			"p1",
			task.id,
			{ ...stages[1], maxTransientRetries: 0 },
			new Error("[Timeout Error] Stage execution timed out: boom"),
			{
				projectCwd: tempCwd,
				harnessId: "antigravity",
				failureKind: "infrastructure",
				aliasName: "worker",
				modelRef: "gemini-3.8-flash-low",
				targetIndex: 0,
			},
		);

		const entry = task.timeline.at(-1);
		expect(entry.status).toBe("Failed");
		expect(entry).toMatchObject({
			harnessId: "antigravity",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
			targetIndex: 0,
		});
	});

	it("keeps transient rows blank when the attempt carries no attribution", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });

		store.handleTransientFailure(
			"p1",
			task.id,
			stages[1],
			new Error("[Timeout Error] Stage execution timed out: boom"),
			{ projectCwd: tempCwd },
		);

		const entry = task.timeline.at(-1);
		expect(entry.harnessId).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
	});
});
