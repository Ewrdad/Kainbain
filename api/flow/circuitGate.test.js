// Domain: The Flow — Tier-5 dispatch gate and budget-protection tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	findNextCandidateTask,
	freshSchedulerStats,
	getScheduledQueue,
	scheduleTick,
} from "./taskScheduler.js";
import {
	circuitSnapshot,
	isTripped,
	markCanary,
	resetEngine,
	tripEngine,
} from "./circuitBreaker.js";
import { handleStageFailure, handleTransientFailure } from "./stageFailureRouting.js";
import { TaskStore } from "../taskStore.js";

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

const STAGES = [{ id: "s-1", name: "Build", type: "agent" }];

function makeStore({ projects = [{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES }] } = {}) {
	const maps = new Map();
	const store = {
		projects,
		projectStore: {
			listProjects: () => projects,
			getProject: (pid) => projects.find((p) => p.id === pid),
		},
		engineState: { status: "idle", activeTaskId: null },
		executionQueue: { isRunning: false },
		schedulerStats: null,
		schedulerRunning: false,
		schedulerTimer: null,
		_kickTimer: null,
		_onIdleTimer: null,
		lastCompletedTask: null,
		deployManager: null,
		sessionStore: null,
		defaultAgentRunner: null,
		defaultPromptEngine: null,
		defaultSchedulerInterval: 3000,
		blockedIds: new Set(),
		events: [],
		eventBridge: {
			broadcastGlobal: (type, payload) => store.events.push({ type, payload }),
			emitNotification: () => {},
			emitSystemLog: () => {},
		},
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		listTasks: (pid) => Array.from(maps.get(pid)?.values() || []),
		isTaskBlocked: () => ({ blocked: false, blockers: [], hasCycle: false }),
		getEngineState: () => store.engineState,
		_resetAutoIteration: vi.fn(),
		executeStage: vi.fn(async () => ({ ok: true, status: "passed" })),
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		_resolveProjectCwd: (pid, cwd) => cwd || "/repo",
		_saveTaskMarkdown: vi.fn(),
		saveStageReport: vi.fn(),
		handleStageFailure: vi.fn(),
		advanceStage: vi.fn(),
		setEngineState: vi.fn(),
	};
	return store;
}

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "in_stage",
		currentStageId: "s-1",
		enteredStageAt: "2026-09-24T10:00:00.000Z",
		updatedAt: "2026-09-24T10:00:00.000Z",
		history: [],
		...overrides,
	};
}

let tempCwd;

beforeEach(() => {
	vi.clearAllMocks();
	tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-circuit-gate-test-"));
});

afterEach(() => {
	vi.useRealTimers();
	try {
		fs.rmSync(tempCwd, { recursive: true, force: true });
	} catch {
		// ignore
	}
});

describe("findNextCandidateTask gate", () => {
	it("returns no candidate while tripped and records the deferral", () => {
		const store = makeStore();
		store.seed("p-1", task());
		tripEngine(store, { reason: "gateway outage", source: "auto:infra" });
		expect(findNextCandidateTask(store)).toBeNull();
		expect(store.lastTripDeferral.reason).toBe("gateway outage");
	});

	it("admits a candidate when the caller opts into the canary path", () => {
		const store = makeStore();
		store.seed("p-1", task());
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		const candidate = findNextCandidateTask(store, { ignoreTrip: true });
		expect(candidate?.taskId).toBe("t-1");
	});
});

describe("scheduleTick gate", () => {
	it("defers every dispatch while tripped and never calls executeStage", async () => {
		const store = makeStore();
		store.seed("p-1", task());
		tripEngine(store, { reason: "disk full", source: "auto:disk" });
		store.schedulerStats = freshSchedulerStats();
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.executeStage).not.toHaveBeenCalled();
		expect(store.schedulerStats.deferredTripped).toBe(1);
		expect(store.schedulerStats.lastOutcome).toBe("deferred-tripped");
	});

	it("admits exactly one canary after the cooldown and lifts on success", async () => {
		const store = makeStore();
		store.seed("p-1", task());
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		store.schedulerStats = freshSchedulerStats();
		// Inside the cooldown: no dispatch.
		await scheduleTick(store);
		expect(store.executeStage).not.toHaveBeenCalled();
		// Cooldown elapsed: one canary is admitted.
		store.circuitState.probeCooldownUntil = Date.now() - 1;
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(store.schedulerStats.canaryDispatched).toBe(1);
		// A passing canary lifted containment.
		expect(isTripped(store)).toBe(false);
		expect(store.circuitState.resetReason).toContain("canary");
	});

	it("re-trips with backoff when the canary fails instead of passing", async () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.executeStage.mockResolvedValue({ ok: false, status: "failed" });
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		store.schedulerStats = freshSchedulerStats();
		store.circuitState.probeCooldownUntil = Date.now() - 1;
		// markCanary would normally be done by the tick; the mock result path
		// exercises the post-dispatch release of an inconclusive canary.
		await scheduleTick(store);
		expect(isTripped(store)).toBe(true);
		expect(store.circuitState.probeBackoffMs).toBeGreaterThan(0);
		expect(store.circuitState.canaryTaskId).toBeNull();
	});

	it("never dispatches a second task while tripped after a canary outcome", async () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "t-1" }));
		store.seed("p-1", task({ id: "t-2" }));
		resetEngine(store, { reason: "test setup" });
		store.circuitState = {
			...store.circuitState,
			tripped: true,
			reason: "outage",
			source: "auto:infra",
			canaryTaskId: null,
			probeCooldownUntil: Date.now() - 1,
		};
		store.schedulerStats = freshSchedulerStats();
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(isTripped(store)).toBe(false);
		// Now healthy, ordinary dispatch resumes.
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(2);
	});
});

describe("getScheduledQueue banner annotation", () => {
	it("annotates queued items while tripped", () => {
		const store = makeStore();
		store.seed("p-1", task());
		tripEngine(store, { reason: "disk full", source: "auto:disk" });
		const queue = getScheduledQueue(store);
		expect(queue).toHaveLength(1);
		expect(queue[0].engineTripped).toBe(true);
		expect(queue[0].deferredByTrip).toBe(true);
		expect(queue[0].priorityReason).toContain("Engine tripped");
	});

	it("leaves the reason untouched while healthy", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const queue = getScheduledQueue(store);
		expect(queue[0].engineTripped).toBeFalsy();
		expect(queue[0].priorityReason).not.toContain("Engine tripped");
	});
});

describe("budget protection while tripped", () => {
	function makeTaskStore() {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		return new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages: STAGES, cwd: tempCwd }) },
		});
	}

	it("handleTransientFailure defers without incrementing infraRetryCount", () => {
		const store = makeTaskStore();
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd });
		t.infraRetryCount = 2;
		t.autoIterationCount = 3;
		tripEngine(store, { reason: "gateway outage", source: "auto:infra" });

		const result = store.handleTransientFailure(
			"p1",
			t.id,
			STAGES[0],
			new Error("ECONNREFUSED 127.0.0.1:4000"),
			{ stages: STAGES, projectCwd: tempCwd, failureKind: "infrastructure" },
		);

		expect(result.deferred).toBe("tripped");
		expect(t.infraRetryCount).toBe(2);
		expect(t.autoIterationCount).toBe(3);
		expect(t.status).toBe("in_stage");
		expect(t.failureReason).toBeFalsy();
		expect(t.lastError).toBeFalsy();
		expect(t.history.some((h) => h.action.includes("deferred by engine circuit trip"))).toBe(
			true,
		);
	});

	it("handleStageFailure (auth) defers without burning auto-iteration budget", () => {
		const store = makeTaskStore();
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd });
		t.autoIterationCount = 4;
		t.infraRetryCount = 2;
		tripEngine(store, { reason: "auth outage", source: "auto:auth" });

		const result = store.handleStageFailure(
			"p1",
			t.id,
			STAGES[0],
			new Error("[Authentication Error] invalid api key"),
			{ stages: STAGES, projectCwd: tempCwd, skipFailback: true },
		);

		expect(result.deferred).toBe("tripped");
		expect(t.autoIterationCount).toBe(4);
		expect(t.infraRetryCount).toBe(2);
		expect(t.status).toBe("in_stage");
		expect(t.failureReason).toBeFalsy();
	});

	it("the failure that trips the engine is the first one deferred", () => {
		const store = makeTaskStore();
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd, title: "third" });
		t.infraRetryCount = 0;
		// Threshold is 3 distinct tasks; seed two prior distinct-task failures
		// through the public entry point so the third trips.
		const t2 = store.createTask("p1", {
			stageId: "s-1",
			projectCwd: tempCwd,
			title: "first",
		});
		const t3 = store.createTask("p1", {
			stageId: "s-1",
			projectCwd: tempCwd,
			title: "second",
		});
		store.handleTransientFailure("p1", t2.id, STAGES[0], new Error("ECONNREFUSED"), {
			stages: STAGES,
			projectCwd: tempCwd,
		});
		store.handleTransientFailure("p1", t3.id, STAGES[0], new Error("ECONNREFUSED"), {
			stages: STAGES,
			projectCwd: tempCwd,
		});
		expect(isTripped(store)).toBe(false);
		const result = store.handleTransientFailure(
			"p1",
			t.id,
			STAGES[0],
			new Error("ECONNREFUSED"),
			{ stages: STAGES, projectCwd: tempCwd },
		);
		expect(isTripped(store)).toBe(true);
		expect(result.deferred).toBe("tripped");
		expect(t.infraRetryCount).toBe(0);
	});

	it("untripped transient failures still consume budget (regression guard)", () => {
		const store = makeTaskStore();
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd });
		const result = store.handleTransientFailure(
			"p1",
			t.id,
			STAGES[0],
			new Error("ECONNREFUSED"),
			{ stages: STAGES, projectCwd: tempCwd },
		);
		expect(result.retrySameStage).toBe(true);
		expect(t.infraRetryCount).toBe(1);
		expect(result.failureReason).toContain("ECONNREFUSED");
	});
});

describe("executeStage dispatch-boundary gate", () => {
	it("returns deferred (not a run) while tripped and not the canary", async () => {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages: STAGES, cwd: tempCwd }) },
		});
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd });
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		const result = await store.executeStage("p1", t.id, {
			stages: STAGES,
			projectCwd: tempCwd,
		});
		expect(result.status).toBe("deferred");
		expect(result.deferred).toBe("tripped");
		expect(store.engineState.status).toBe("idle");
	});

	it("canary-marked task is not blocked by the boundary gate", async () => {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages: STAGES, cwd: tempCwd }) },
		});
		const t = store.createTask("p1", { stageId: "s-1", projectCwd: tempCwd });
		tripEngine(store, { reason: "outage", source: "auto:infra" });
		markCanary(store, { projectId: "p1", taskId: t.id });
		const result = await store.executeStage("p1", t.id, {
			stages: STAGES,
			projectCwd: tempCwd,
		});
		// It got past the gate (no agent runner -> in_stage fallback), proving
		// the canary is admitted rather than deferred.
		expect(result.status).not.toBe("deferred");
		expect(circuitSnapshot(store).canaryTaskId).toBe(t.id);
	});
});
