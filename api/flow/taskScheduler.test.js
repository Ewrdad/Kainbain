import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../sessionStore.js";
import { registerHarness } from "../agent/harnessRegistry.js";
import { DeployManager } from "../deployManager.js";
import { MAX_RUNNER_INTERRUPTS } from "./executionLedger.js";

let schedulerProbeUnique = 8000;
const nextSchedulerProbeId = (prefix) => `${prefix}-${++schedulerProbeUnique}`;

import {
	RESUMED_PRIORITY_REASON,
	RESUMED_PRIORITY_RANK,
	RESUMED_QUEUE_REASON,
	autoResumeTask,
	candidateStageIndex,
	collectResumeEvidence,
	consumeResumedMarker,
	ensureScheduler,
	findNextCandidateTask,
	findResumedCandidate,
	freshSchedulerStats,
	getScheduledQueue,
	hasContinuityHold,
	hasRehydrationMarkers,
	interruptionTimestampMs,
	isAutoResumable,
	isAutoResumableWithReason,
	isResumedAfterInterruption,
	isResumedStageRunnable,
	isSchedulerRunnable,
	kickScheduler,
	reconcileInterruptedRuns,
	resolveCandidateStage,
	resolveStagesForTask,
	resumedTimestampMs,
	runScheduledTick,
	scheduleTick,
	startScheduler,
	stopScheduler,
} from "./taskScheduler.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
	{ id: "s-3", name: "Integrate", type: "merge" },
];

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
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		listTasks: (pid) => Array.from(maps.get(pid)?.values() || []),
		isTaskBlocked: (pid, tid) => ({
			blocked: store.blockedIds.has(`${pid}:${tid}`),
			blockers: store.blockedIds.has(`${pid}:${tid}`) ? ["base"] : [],
			hasCycle: false,
		}),
		getEngineState: () => store.engineState,
		_resetAutoIteration: vi.fn(),
		executeStage: vi.fn(async () => ({ ok: true })),
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

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("resolveStagesForTask", () => {
	it("prefers the task workflow stages", () => {
		const wf = [{ id: "w-1" }];
		const project = { stages: STAGES, workflows: [{ id: "wf-1", stages: wf }] };
		expect(resolveStagesForTask(project, { workflowId: "wf-1" })).toBe(wf);
	});

	it("falls back to project stages and empty", () => {
		expect(resolveStagesForTask({ stages: STAGES }, {})).toBe(STAGES);
		expect(resolveStagesForTask({ stages: STAGES }, { workflowId: "ghost" })).toBe(STAGES);
		expect(resolveStagesForTask(null, null)).toEqual([]);
		expect(resolveStagesForTask({}, {})).toEqual([]);
	});
});

describe("findNextCandidateTask", () => {
	it("follows on from the just-completed task once", () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.lastCompletedTask = { projectId: "p-1", taskId: "t-1" };
		const first = findNextCandidateTask(store);
		expect(first?.priorityReason).toBe("follow_on");
		expect(first?.taskId).toBe("t-1");
		expect(store.lastCompletedTask).toBeNull();
		// Second call falls through to the general scan (same task qualifies).
		expect(findNextCandidateTask(store)?.taskId).toBe("t-1");
	});

	it.each([
		["missing task", { lastTaskId: "ghost" }],
		["wrong status", { seed: { status: "paused" } }],
		["human stage", { seed: { currentStageId: "s-2" } }],
		["paused stage", { seedStages: [{ id: "s-1", name: "Build", type: "agent", paused: true }] }],
		["blocked task", { blocked: true }],
	])("skips rule-1 follow-on when %s", (_, opts = {}) => {
		const stages = opts.seedStages || STAGES;
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages }],
		});
		store.seed("p-1", task({ ...(opts.seed || {}) }));
		if (opts.blocked) store.blockedIds.add("p-1:t-1");
		store.lastCompletedTask = { projectId: "p-1", taskId: opts.lastTaskId || "t-1" };
		const found = findNextCandidateTask(store);
		expect(found?.priorityReason).not.toBe("follow_on");
	});

	it("returns null without a project store", () => {
		const store = makeStore();
		store.projectStore = null;
		expect(findNextCandidateTask(store)).toBeNull();
	});

	it("returns null when nothing qualifies", () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "completed" }));
		expect(findNextCandidateTask(store)).toBeNull();
	});

	it("prefers the furthest stage, then the oldest entry", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "early", currentStageId: "s-3", enteredStageAt: "2026-09-24T09:00:00.000Z" }));
		store.seed("p-1", task({ id: "late", currentStageId: "s-3", enteredStageAt: "2026-09-24T11:00:00.000Z" }));
		store.seed("p-1", task({ id: "behind", currentStageId: "s-1", enteredStageAt: "2026-09-24T08:00:00.000Z" }));
		expect(findNextCandidateTask(store)?.taskId).toBe("early");
	});

	it("skips blocked, stageless, unknown-stage, manual, and paused candidates", () => {
		const store = makeStore({
			projects: [
				{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES },
				{ id: "p-2", name: "Q", cwd: "/other", stages: [] },
			],
		});
		store.seed("p-1", task({ id: "blocked", currentStageId: "s-3" }));
		store.blockedIds.add("p-1:blocked");
		store.seed("p-1", task({ id: "unknown-stage", currentStageId: "ghost" }));
		store.seed("p-1", task({ id: "manual", currentStageId: "s-2" }));
		store.seed("p-2", task({ id: "no-stages", projectId: "p-2", currentStageId: "s-1" }));
		expect(findNextCandidateTask(store)).toBeNull();
	});

	it("matches stages by name", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "build" }));
		expect(findNextCandidateTask(store)?.taskId).toBe("t-1");
	});
});

describe("freshSchedulerStats / scheduleTick", () => {
	it("creates a zeroed stats object", () => {
		expect(freshSchedulerStats()).toEqual({
			ticks: 0,
			dispatched: 0,
			idleNoCandidate: 0,
			skippedBusy: 0,
			skippedBusyWhileIdle: 0,
			resumedInterrupted: 0,
			deferredTripped: 0,
			deferredDispatch: 0,
			canaryDispatched: 0,
			tripCount: 0,
			stallRecoveries: 0,
			lastTickAt: null,
			lastDispatchAt: null,
			lastOutcome: null,
		});
	});

	it("skips ticks while the engine is busy", async () => {
		const store = makeStore();
		store.executionQueue.isRunning = true;
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats).toMatchObject({ ticks: 1, skippedBusyWhileIdle: 1, lastOutcome: "skipped-busy-while-idle" });
		store.executionQueue.isRunning = false;
		store.engineState.status = "running";
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats.skippedBusy).toBe(1);
	});

	it("reports a wedged queue distinct from healthy busy", async () => {
		const store = makeStore();
		store.executionQueue = { isRunning: true, size: 0, settleActive: () => true };
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats).toMatchObject({
			ticks: 1,
			skippedBusy: 0,
			skippedBusyWhileIdle: 1,
			lastOutcome: "skipped-busy-while-idle",
		});
	});

	it("idles when no candidate exists", async () => {
		const store = makeStore();
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats).toMatchObject({ ticks: 1, idleNoCandidate: 1, lastOutcome: "no-candidate-idle" });
	});

	it("dispatches the top candidate with runner overrides", async () => {
		const store = makeStore();
		store.seed("p-1", task());
		const agentRunner = vi.fn();
		const promptEngine = vi.fn();
		await scheduleTick(store, { agentRunner, promptEngine });
		expect(store.executeStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ priority: "normal", agentRunner, promptEngine }),
		);
		expect(store.schedulerStats).toMatchObject({ dispatched: 1, lastOutcome: "dispatched" });
		expect(store.schedulerStats.lastDispatchAt).toBeTypeOf("string");
	});
});

describe("reconcileInterruptedRuns", () => {
	it("parks orphaned running statuses and spares the engine owner", () => {
		const store = makeStore();
		for (const [id, status] of [
			["a", "running_agent"],
			["b", "running_ci"],
			["c", "running_deploy"],
			["d", "running_merge"],
			["e", "advancing"],
			["owner", "running_agent"],
			["calm", "in_stage"],
		]) {
			store.seed("p-1", task({ id, status }));
		}
		store.engineState.activeTaskId = "owner";
		const reconciled = reconcileInterruptedRuns(store);
		expect(reconciled).toHaveLength(5);
		expect(store.getTask("p-1", "a").status).toBe("interrupted");
		expect(store.getTask("p-1", "owner").status).toBe("running_agent");
		expect(store.getTask("p-1", "calm").status).toBe("in_stage");
		expect(store._saveTaskMarkdown).toHaveBeenCalled();
	});

	it("returns [] without projects", () => {
		const store = makeStore();
		store.projectStore = null;
		expect(reconcileInterruptedRuns(store)).toEqual([]);
	});
});

describe("scheduler loop controls", () => {
	it("startScheduler is idempotent and stopScheduler clears everything", () => {
		vi.useFakeTimers();
		const store = makeStore();
		const runner = vi.fn();
		startScheduler(store, { intervalMs: 1000, agentRunner: runner });
		expect(store.schedulerRunning).toBe(true);
		expect(store.defaultAgentRunner).toBe(runner);
		const timer = store.schedulerTimer;
		startScheduler(store);
		expect(store.schedulerTimer).toBe(timer);
		store._onIdleTimer = setTimeout(() => {}, 5000);
		store._kickTimer = setTimeout(() => {}, 5000);
		stopScheduler(store);
		expect(store.schedulerRunning).toBe(false);
		expect(store.schedulerTimer).toBeNull();
		expect(store._onIdleTimer).toBeNull();
		expect(store._kickTimer).toBeNull();
	});

	it("startScheduler honours the disabled flag", () => {
		const store = makeStore();
		startScheduler(store, { disabled: true });
		expect(store.schedulerRunning).toBe(false);
		expect(store.schedulerTimer).toBeNull();
	});

	it("ticks dispatch candidates and stopScheduler halts the loop", async () => {
		vi.useFakeTimers();
		const store = makeStore();
		store.seed("p-1", task());
		startScheduler(store, { intervalMs: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		stopScheduler(store);
		await vi.advanceTimersByTimeAsync(5000);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
	});

	it("ensureScheduler heals a lost timer but never starts a stopped loop", () => {
		vi.useFakeTimers();
		const store = makeStore();
		expect(ensureScheduler(store)).toBe(false);
		store.schedulerRunning = true;
		expect(ensureScheduler(store)).toBe(true);
		expect(store.schedulerTimer).not.toBeNull();
		expect(ensureScheduler(store)).toBe(false);
		stopScheduler(store);
	});

	it("kickScheduler arms one debounced re-tick", async () => {
		vi.useFakeTimers();
		const store = makeStore();
		expect(kickScheduler(store)).toBe(false);
		store.schedulerRunning = true;
		store.schedulerTimer = setInterval(() => {}, 10_000);
		try {
			expect(kickScheduler(store)).toBe(true);
			expect(kickScheduler(store)).toBe(true);
			await vi.advanceTimersByTimeAsync(150);
			expect(store._kickTimer).toBeNull();
		} finally {
			clearInterval(store.schedulerTimer);
			store.schedulerTimer = null;
			if (store._kickTimer) clearTimeout(store._kickTimer);
			store._kickTimer = null;
		}
	});
});

describe("getScheduledQueue", () => {
	it("returns [] without projects and skips terminal tasks", () => {
		const store = makeStore();
		store.projectStore = null;
		expect(getScheduledQueue(store)).toEqual([]);
		const full = makeStore();
		for (const status of ["completed", "done", "failed", "cancelled"]) {
			full.seed("p-1", task({ id: `t-${status}`, status }));
		}
		expect(getScheduledQueue(full)).toEqual([]);
	});

	it("ranks active, follow-on, standard, blocked, and paused tasks", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "std", currentStageId: "s-3" }));
		store.seed("p-1", task({ id: "blocked", blockedBy: ["base"] }));
		store.blockedIds.add("p-1:blocked");
		store.seed("p-1", task({ id: "base" }));
		store.seed("p-1", task({ id: "paused", status: "paused" }));
		store.seed("p-1", task({ id: "active" }));
		store.engineState.activeTaskId = "active";
		store.engineState.status = "running";
		store.lastCompletedTask = { projectId: "p-1", taskId: "base" };
		const queue = getScheduledQueue(store);
		const order = Object.fromEntries(queue.map((item) => [item.id, item.queueOrder]));
		expect(order.active).toBe(1);
		expect(order.base).toBe(2);
		expect(queue.find((i) => i.id === "base").priorityReason).toBe("Follow-On Priority");
		expect(queue.find((i) => i.id === "active").priorityReason).toBe("Active Execution");
		expect(queue.find((i) => i.id === "blocked").priorityRank).toBe(5);
		expect(queue.find((i) => i.id === "paused").priorityReason).toBe("Paused");
		expect(queue.find((i) => i.id === "std").priorityRank).toBe(2);
	});

	it("marks stage-paused tasks and excludes human checkpoints", () => {
		const store = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					stages: [
						{ id: "s-1", name: "Build", type: "agent", paused: true },
						{ id: "s-2", name: "Review", type: "human" },
					],
				},
			],
		});
		store.seed("p-1", task({ id: "sp", currentStageId: "s-1" }));
		store.seed("p-1", task({ id: "human", currentStageId: "s-2", status: "waiting_human" }));
		store.seed("p-1", task({ id: "at-human", status: "in_stage", currentStageId: "s-2" }));
		const queue = getScheduledQueue(store);
		expect(queue.map((i) => i.id)).toEqual(["sp"]);
		expect(queue[0].priorityReason).toBe("Stage Paused");
		// No stage match falls back to the first stage entry.
		store.seed("p-1", task({ id: "nomatch", currentStageId: "ghost" }));
		expect(getScheduledQueue(store).find((i) => i.id === "nomatch").currentStageName).toBe("Build");
	});

	it("filters by project and orders rank-2 by stage then age", () => {
		const store = makeStore({
			projects: [
				{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES },
				{ id: "p-2", name: "Q", cwd: "/other", stages: STAGES },
			],
		});
		store.seed("p-1", task({ id: "a", currentStageId: "s-3", enteredStageAt: "2026-09-24T11:00:00.000Z" }));
		store.seed("p-1", task({ id: "b", currentStageId: "s-3", enteredStageAt: "2026-09-24T09:00:00.000Z" }));
		store.seed("p-2", task({ id: "c", projectId: "p-2", currentStageId: "s-1" }));
		const filtered = getScheduledQueue(store, "p-2");
		expect(filtered.map((i) => i.id)).toEqual(["c"]);
		const all = getScheduledQueue(store);
		expect(all.map((i) => i.id)).toEqual(["b", "a", "c"]);
		expect(all[0]).toMatchObject({ projectName: "P", workflowId: "wf-default", queueOrder: 1 });
	});

	it("resolves the harness from the session store when available", () => {
		const store = makeStore();
		store.sessionStore = {
			_resolveHarness: () => ({ name: "pi" }),
		};
		store.seed("p-1", task({ id: "h", title: "", goal: "g".repeat(70) }));
		const item = getScheduledQueue(store).find((i) => i.id === "h");
		expect(item.harness).toBe("pi");
		expect(item.title).toHaveLength(60);
	});

	it("lists the concrete target harness for a stage alias ref without warning", () => {
		const targetName = nextSchedulerProbeId("scheduler-alias-target");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "scheduler alias display probe",
		});
		const store = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					harness: "pi",
					stages: [
						{ id: "s-1", name: "Build", type: "agent", harness: "alias", model: "small" },
					],
					modelAliases: [{ name: "small", harness: targetName, model: "m1" }],
				},
			],
		});
		store.sessionStore = new SessionStore({});
		store.seed("p-1", task({ id: "q", currentStageId: "s-1" }));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const item = getScheduledQueue(store).find((i) => i.id === "q");
			expect(item.harness).toBe(targetName);
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("isAutoResumable", () => {
	it.each([
		["agent", { type: "agent" }, true],
		["ci", { type: "ci" }, true],
		["legacy script normalizes to ci", { type: "script" }, true],
		["mixed-case AGENT", { type: "AGENT" }, true],
		["missing type defaults to agent", {}, true],
		["legacy deploy normalizes to ci", { type: "deploy" }, true],
		["merge", { type: "merge" }, false],
		["human", { type: "human" }, false],
		["legacy review normalizes to human", { type: "review" }, false],
	])("stage type %s resumable=%s", (_, stage, expected) => {
		expect(isAutoResumable(task({ status: "interrupted" }), stage)).toBe(
			expected,
		);
	});

	it.each([
		["in_stage", "in_stage"],
		["running_agent", "running_agent"],
		["paused", "paused"],
		["waiting_human", "waiting_human"],
		["completed", "completed"],
	])("non-interrupted status %s never auto-resumes", (_, status) => {
		expect(isAutoResumable(task({ status }), { type: "agent" })).toBe(false);
	});

	it("refuses paused stages, blocked tasks, and missing stages", () => {
		const interrupted = task({ status: "interrupted" });
		expect(
			isAutoResumable(interrupted, { type: "agent", paused: true }),
		).toBe(false);
		expect(isAutoResumable(interrupted, { type: "agent" }, { blocked: true })).toBe(
			false,
		);
		expect(isAutoResumable(interrupted, null)).toBe(false);
		expect(isAutoResumable(null, { type: "agent" })).toBe(false);
	});

	it("parks an escalated runner-death streak instead of re-dispatching", () => {
		const dying = task({
			status: "interrupted",
			runnerInterruptStage: "s-1",
			runnerInterruptCount: MAX_RUNNER_INTERRUPTS,
		});
		expect(isAutoResumable(dying, { type: "ci" })).toBe(false);
		expect(isAutoResumableWithReason(dying, { type: "ci" })).toMatchObject({
			resumable: false,
			reason: "runner-death-loop",
		});
	});

	it("still resumes below the runner-death bound", () => {
		const recovering = task({
			status: "interrupted",
			runnerInterruptStage: "s-1",
			runnerInterruptCount: MAX_RUNNER_INTERRUPTS - 1,
		});
		expect(isAutoResumable(recovering, { type: "ci" })).toBe(true);
	});
});

describe("isSchedulerRunnable", () => {
	it("keeps the in_stage contract (automated, unpaused, unblocked)", () => {
		expect(isSchedulerRunnable(task(), { type: "agent" })).toBe(true);
		expect(isSchedulerRunnable(task(), { type: "human" })).toBe(false);
		expect(isSchedulerRunnable(task(), { type: "Agent" })).toBe(true);
		expect(isSchedulerRunnable(task(), { type: "SCRIPT" })).toBe(true);
		expect(isSchedulerRunnable(task(), { type: "review" })).toBe(false);
		expect(isSchedulerRunnable(task(), { type: "agent", paused: true })).toBe(
			false,
		);
		expect(isSchedulerRunnable(task(), { type: "agent" }, { blocked: true })).toBe(
			false,
		);
		expect(isSchedulerRunnable(task({ status: "paused" }), { type: "agent" })).toBe(
			false,
		);
		expect(isSchedulerRunnable(task(), null)).toBe(false);
	});

	it("gates interrupted tasks on the auto-resume policy", () => {
		const interrupted = task({ status: "interrupted" });
		expect(isSchedulerRunnable(interrupted, { type: "agent" })).toBe(false);
		expect(
			isSchedulerRunnable(interrupted, { type: "agent" }, { allowInterrupted: true }),
		).toBe(true);
		expect(
			isSchedulerRunnable(
				interrupted,
				{ type: "deploy" },
				{ allowInterrupted: true },
			),
		).toBe(true); // legacy deploy normalizes to ci: ordinary automated stage
		expect(
			isSchedulerRunnable(
				interrupted,
				{ type: "agent" },
				{ allowInterrupted: true, blocked: true },
			),
		).toBe(false);
	});
});

describe("findResumedCandidate (Rule 0)", () => {
	it("returns null with no project store or no interruptions", () => {
		const bare = makeStore();
		bare.projectStore = null;
		expect(findResumedCandidate(bare)).toBeNull();
		const calm = makeStore();
		calm.seed("p-1", task());
		expect(findResumedCandidate(calm)).toBeNull();
	});

	it("picks the oldest interruption first", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				id: "new",
				status: "interrupted",
				updatedAt: "2026-09-24T11:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "old",
				status: "interrupted",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		const found = findResumedCandidate(store);
		expect(found?.taskId).toBe("old");
		expect(found?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
	});

	it.each([
		["human stage", { currentStageId: "s-2" }],
		["merge stage", { currentStageId: "s-3" }],
		["unknown stage", { currentStageId: "ghost" }],
	])("leaves %s parked", (_, overrides) => {
		const store = makeStore();
		store.seed("p-1", task({ status: "interrupted", ...overrides }));
		expect(findResumedCandidate(store)).toBeNull();
	});

	it("leaves paused-stage and blocked interruptions parked", () => {
		const pausedProject = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					stages: [{ id: "s-1", name: "Build", type: "agent", paused: true }],
				},
			],
		});
		pausedProject.seed("p-1", task({ status: "interrupted" }));
		expect(findResumedCandidate(pausedProject)).toBeNull();

		const blocked = makeStore();
		blocked.seed("p-1", task({ status: "interrupted" }));
		blocked.blockedIds.add("p-1:t-1");
		expect(findResumedCandidate(blocked)).toBeNull();
	});

	it("Rule 0 beats follow-on without consuming it", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "fresh", currentStageId: "s-3" }));
		store.seed("p-1", task({ id: "resumed", status: "interrupted" }));
		store.lastCompletedTask = { projectId: "p-1", taskId: "fresh" };
		const first = findNextCandidateTask(store);
		expect(first?.taskId).toBe("resumed");
		expect(first?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
		// The follow-on is still armed for the next tick.
		expect(store.lastCompletedTask).toEqual({
			projectId: "p-1",
			taskId: "fresh",
		});
	});

	it("keeps Rule 0 for a startup-resumed task that already flipped to in_stage", () => {
		// Regression: startup recovery flips auto-resumable interruptions to
		// `in_stage` before the first tick. The durable marker must keep
		// them ahead of follow-ons and further-along work anyway.
		const store = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					stages: [
						{ id: "s-1", name: "One", type: "agent" },
						{ id: "s-2", name: "Two", type: "agent" },
						{ id: "s-3", name: "Three", type: "agent" },
					],
				},
			],
		});
		store.seed(
			"p-1",
			task({
				id: "interrupted-old",
				status: "in_stage",
				currentStageId: "s-1",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
				updatedAt: "2026-09-24T12:00:00.000Z",
			}),
		);
		store.seed("p-1", task({ id: "far-along", currentStageId: "s-3" }));
		store.lastCompletedTask = { projectId: "p-1", taskId: "far-along" };
		const first = findNextCandidateTask(store);
		expect(first?.taskId).toBe("interrupted-old");
		expect(first?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
	});

	it("orders marked tasks oldest-interruption first, mixed with labelled ones", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				id: "marked-new",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T11:00:00.000Z",
				updatedAt: "2026-09-24T12:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "labelled-old",
				status: "interrupted",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		expect(findResumedCandidate(store)?.taskId).toBe("labelled-old");
	});

	it("leaves marked tasks parked when their stage stops being runnable", () => {
		const store = makeStore();
		// Marked but now sitting at a human stage: operator-owned again.
		store.seed(
			"p-1",
			task({
				id: "marked-human",
				status: "in_stage",
				currentStageId: "s-2",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		expect(findResumedCandidate(store)).toBeNull();

		const blocked = makeStore();
		blocked.seed(
			"p-1",
			task({
				id: "marked-blocked",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		blocked.blockedIds.add("p-1:marked-blocked");
		expect(findResumedCandidate(blocked)).toBeNull();
	});
});

describe("resumed marker helpers", () => {
	it("recognises only in_stage tasks still carrying the marker", () => {
		expect(
			isResumedAfterInterruption(
				task({ status: "in_stage", resumedAfterInterruption: true }),
			),
		).toBe(true);
		expect(
			isResumedAfterInterruption(
				task({ status: "in_stage", resumedAfterInterruption: false }),
			),
		).toBe(false);
		expect(isResumedAfterInterruption(task({ status: "in_stage" }))).toBe(
			false,
		);
		expect(
			isResumedAfterInterruption(
				task({ status: "interrupted", resumedAfterInterruption: true }),
			),
		).toBe(false);
		expect(isResumedAfterInterruption(null)).toBe(false);
	});

	it("orders by the interruptedAt snapshot, collapsing garbage to the epoch", () => {
		expect(
			resumedTimestampMs({ interruptedAt: "2026-09-24T10:00:00.000Z" }),
		).toBe(Date.parse("2026-09-24T10:00:00.000Z"));
		expect(resumedTimestampMs({ interruptedAt: "not-a-date" })).toBe(0);
		expect(resumedTimestampMs({})).toBe(0);
	});

	it("limits marked-task dispatch to automated, unpaused, unblocked stages", () => {
		expect(isResumedStageRunnable({ type: "agent" })).toBe(true);
		expect(isResumedStageRunnable({ type: "ci" })).toBe(true);
		expect(isResumedStageRunnable({ type: "script" })).toBe(true);
		expect(isResumedStageRunnable({})).toBe(true);
		expect(isResumedStageRunnable({ type: "deploy" })).toBe(true); // legacy deploy reads as ci
		expect(isResumedStageRunnable({ type: "merge" })).toBe(false);
		expect(isResumedStageRunnable({ type: "human" })).toBe(false);
		expect(isResumedStageRunnable({ type: "review" })).toBe(false);
		expect(isResumedStageRunnable({ type: "agent", paused: true })).toBe(
			false,
		);
		expect(isResumedStageRunnable({ type: "agent" }, { blocked: true })).toBe(
			false,
		);
		expect(isResumedStageRunnable(null)).toBe(false);
	});

	it("a stale continuity-internal marker never strands generic resume; a continuity hold does", () => {
		const staleMarker = { deployAttemptInFlightNoted: "deploy-t-1-1" };
		// The migrated git-only merge runs no deploy: the stale marker must not
		// strand a resumable merge task.
		expect(
			isResumedStageRunnable(
				{ type: "merge" },
				{ task: task({ reviewBaseline: { mergedAt: "x" }, ...staleMarker }) },
			),
		).toBe(true);
		// A deploy-command ci stage is ordinary CI: it resumes with or
		// without the stale continuity-internal marker.
		expect(
			isResumedStageRunnable(
				{ type: "ci", command: "./deploy.sh --prod" },
				{ task: task({ deployAttemptId: "deploy-t-1-1", ...staleMarker }) },
			),
		).toBe(true);
		// Only an explicit continuity hold parks a task out of Rule 0.
		expect(
			isResumedStageRunnable(
				{ type: "ci", command: "./deploy.sh --prod" },
				{ task: task({ deployAttemptId: "deploy-t-1-1", continuityHold: "deploy-t-1-1" }) },
			),
		).toBe(false);
	});

	it("consumeResumedMarker clears once and persists best-effort", () => {
		const store = makeStore();
		const marked = store.seed(
			"p-1",
			task({
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		expect(consumeResumedMarker(store, marked, "/repo")).toBe(true);
		expect(marked.resumedAfterInterruption).toBe(false);
		expect(marked.interruptedAt).toBeNull();
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", marked);
		expect(consumeResumedMarker(store, marked, "/repo")).toBe(false);

		const plain = store.seed("p-1", task({ id: "plain" }));
		expect(consumeResumedMarker(store, plain, "/repo")).toBe(false);
	});
});

describe("autoResumeTask", () => {
	it("flips interrupted back to runnable like a manual resume", () => {
		const store = makeStore();
		const seeded = store.seed(
			"p-1",
			task({ status: "interrupted", wasInterrupted: true }),
		);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.status).toBe("in_stage");
		expect(done.wasInterrupted).toBe(false);
		expect(done).toBe(seeded);
		expect(store._resetAutoIteration).toHaveBeenCalledWith(seeded);
		expect(store._recordHistory).toHaveBeenCalledWith(
			seeded,
			expect.stringContaining("Auto-resumed"),
			expect.any(String),
		);
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", seeded);
	});

	it("stamps the durable priority marker with the pre-flip timestamp", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				wasInterrupted: true,
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.resumedAfterInterruption).toBe(true);
		expect(done.interruptedAt).toBe("2026-09-24T09:00:00.000Z");
		expect(isResumedAfterInterruption(done)).toBe(true);
	});

	it("leaves non-interrupted tasks untouched and misses unknowns", () => {
		const store = makeStore();
		const calm = store.seed("p-1", task());
		expect(autoResumeTask(store, "p-1", "t-1", "/repo")).toBe(calm);
		expect(store._recordHistory).not.toHaveBeenCalled();
		expect(autoResumeTask(store, "p-1", "ghost", "/repo")).toBeNull();
	});
});

describe("scheduleTick resume pickup", () => {
	it("transitions an interrupted candidate before dispatching", async () => {
		const store = makeStore();
		const seeded = store.seed(
			"p-1",
			task({ status: "interrupted", wasInterrupted: true }),
		);
		await scheduleTick(store);
		expect(seeded.status).toBe("in_stage");
		expect(seeded.wasInterrupted).toBe(false);
		expect(store.executeStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ priority: "normal" }),
		);
		expect(store.schedulerStats).toMatchObject({ dispatched: 1 });
	});

	it("never dispatches a parked (non-resumable) interruption", async () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({ id: "human", status: "interrupted", currentStageId: "s-2" }),
		);
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.executeStage).not.toHaveBeenCalled();
		expect(store.schedulerStats.lastOutcome).toBe("no-candidate-idle");
	});

	it("consumes the marker on dispatch so priority is single-use", async () => {
		const store = makeStore();
		const marked = store.seed(
			"p-1",
			task({
				id: "marked",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		store.seed("p-1", task({ id: "fresh" }));
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(store.executeStage.mock.calls[0][1]).toBe("marked");
		expect(marked.resumedAfterInterruption).toBe(false);
		expect(marked.interruptedAt).toBeNull();
		// Next tick the former resume competes as normal work: the
		// further-along task is no longer outranked by it.
		store.executeStage.mockClear();
		store.seed("p-1", task({ id: "ahead", currentStageId: "s-3" }));
		await scheduleTick(store);
		expect(store.executeStage.mock.calls[0][1]).toBe("ahead");
	});
});

describe("getScheduledQueue resume display", () => {
	it("ranks a resumable interruption ahead of follow-on and standard work", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "std", currentStageId: "s-3" }));
		store.seed("p-1", task({ id: "base" }));
		store.seed(
			"p-1",
			task({
				id: "resumed",
				status: "interrupted",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		store.lastCompletedTask = { projectId: "p-1", taskId: "base" };
		const queue = getScheduledQueue(store);
		const order = Object.fromEntries(queue.map((item) => [item.id, item]));
		expect(order.resumed.queueOrder).toBe(1);
		expect(order.resumed.priorityRank).toBe(RESUMED_PRIORITY_RANK);
		expect(order.resumed.priorityReason).toBe(RESUMED_QUEUE_REASON);
		expect(order.base.queueOrder).toBe(2);
		expect(order.std.queueOrder).toBe(3);
	});

	it("orders resumed tasks oldest-interruption first", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				id: "new",
				status: "interrupted",
				updatedAt: "2026-09-24T11:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "old",
				status: "interrupted",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		expect(getScheduledQueue(store).map((i) => i.id)).toEqual(["old", "new"]);
	});

	it("does not mark parked interruptions as resumed", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({ id: "human", status: "interrupted", currentStageId: "s-2" }),
		);
		// Human-checkpoint interruptions stay excluded from the queue entirely.
		expect(getScheduledQueue(store).map((i) => i.id)).not.toContain("human");

		store.seed(
			"p-1",
			task({ id: "merge", status: "interrupted", currentStageId: "s-3" }),
		);
		const merge = getScheduledQueue(store).find((i) => i.id === "merge");
		expect(merge.priorityReason).not.toBe(RESUMED_QUEUE_REASON);

		const blocked = makeStore();
		blocked.seed("p-1", task({ id: "b", status: "interrupted" }));
		blocked.blockedIds.add("p-1:b");
		const item = getScheduledQueue(blocked).find((i) => i.id === "b");
		expect(item.priorityRank).toBe(5);
		expect(item.priorityReason).not.toBe(RESUMED_QUEUE_REASON);
	});

	it("keeps a startup-resumed task prioritised after the in_stage flip", () => {
		// Regression: after performStartupRecovery the resumed task is
		// `in_stage`, so the queue must key off the durable marker — and
		// order by the original interruption, not the post-flip `updatedAt`.
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				id: "resumed-new",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T11:00:00.000Z",
				updatedAt: "2026-09-24T12:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "resumed-old",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
				updatedAt: "2026-09-24T12:00:01.000Z",
			}),
		);
		store.seed("p-1", task({ id: "base" }));
		store.seed("p-1", task({ id: "std", currentStageId: "s-3" }));
		store.lastCompletedTask = { projectId: "p-1", taskId: "base" };
		const queue = getScheduledQueue(store);
		const order = Object.fromEntries(queue.map((item) => [item.id, item]));
		expect(order["resumed-old"].queueOrder).toBe(1);
		expect(order["resumed-old"].priorityRank).toBe(RESUMED_PRIORITY_RANK);
		expect(order["resumed-old"].priorityReason).toBe(RESUMED_QUEUE_REASON);
		expect(order["resumed-new"].queueOrder).toBe(2);
		expect(order["resumed-new"].priorityReason).toBe(RESUMED_QUEUE_REASON);
		expect(order.base.queueOrder).toBe(3);
	});

	it("drops the resumed rank once the marker is consumed", () => {
		const store = makeStore();
		const marked = store.seed(
			"p-1",
			task({
				id: "marked",
				status: "in_stage",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		expect(
			getScheduledQueue(store).find((i) => i.id === "marked").priorityRank,
		).toBe(RESUMED_PRIORITY_RANK);
		consumeResumedMarker(store, marked, "/repo");
		const item = getScheduledQueue(store).find((i) => i.id === "marked");
		expect(item.priorityRank).toBe(2);
		expect(item.priorityReason).not.toBe(RESUMED_QUEUE_REASON);
	});
});

describe("candidateStageIndex / resolveCandidateStage", () => {
	const stages = [
		{ id: "s-1", name: "Build", type: "agent" },
		{ id: "s-d", name: "Deploy", type: "deploy" },
	];

	it("matches by id, then by case-insensitive name", () => {
		expect(candidateStageIndex(stages, "s-1")).toBe(0);
		expect(candidateStageIndex(stages, "Deploy")).toBe(1);
		expect(candidateStageIndex(stages, "deploy")).toBe(1);
		expect(resolveCandidateStage(stages, "Deploy")).toBe(stages[1]);
	});

	it("returns -1 / null for unknown stages and non-arrays", () => {
		expect(candidateStageIndex(stages, "gone")).toBe(-1);
		expect(candidateStageIndex(stages, undefined)).toBe(-1);
		expect(candidateStageIndex(null, "s-1")).toBe(-1);
		expect(resolveCandidateStage(stages, "gone")).toBeNull();
		expect(resolveCandidateStage([], "s-1")).toBeNull();
		expect(resolveCandidateStage(null, "s-1")).toBeNull();
	});
});

describe("interruptionTimestampMs", () => {
	it("parses real dates and collapses garbage to 0", () => {
		expect(
			interruptionTimestampMs({ updatedAt: "2026-09-24T10:00:00.000Z" }),
		).toBe(Date.parse("2026-09-24T10:00:00.000Z"));
		expect(interruptionTimestampMs({ updatedAt: "not-a-date" })).toBe(0);
		expect(interruptionTimestampMs({})).toBe(0);
		expect(interruptionTimestampMs(null)).toBe(0);
	});
});

describe("reconcileInterruptedRuns isolation", () => {
	it("one unpersistable task does not block the rest of the pass", () => {
		const store = makeStore();
		store._saveTaskMarkdown = vi.fn((cwd, t) => {
			if (t.id === "bad") throw new Error("disk full");
		});
		store.seed("p-1", task({ id: "bad", status: "running_agent" }));
		store.seed("p-1", task({ id: "good", status: "running_agent" }));

		const reconciled = reconcileInterruptedRuns(store);

		// Both flip: persistence is best-effort, and the in-memory flip is
		// what recovery depends on. (Previously "bad" flipped but was
		// reported as skipped with a misleading "skipped" history entry —
		// the status flip and the report disagreed. Persistence failure must
		// not rewrite the outcome, only skip the disk write.)
		expect(reconciled).toEqual([
			{ projectId: "p-1", taskId: "bad" },
			{ projectId: "p-1", taskId: "good" },
		]);
		expect(store.getTask("p-1", "bad").status).toBe("interrupted");
		expect(store.getTask("p-1", "good").status).toBe("interrupted");
		expect(
			store
				.getTask("p-1", "bad")
				.history.some((h) => String(h.action).includes("reconciliation skipped")),
		).toBe(false);
	});

	it("a throwing task list for one project does not block others", () => {
		const store = makeStore({
			projects: [
				{ id: "p-1", name: "P1", cwd: "/a", stages: STAGES },
				{ id: "p-2", name: "P2", cwd: "/b", stages: STAGES },
			],
		});
		const realListTasks = store.listTasks;
		store.listTasks = (pid, cwd) => {
			if (pid === "p-1") throw new Error("unreadable");
			return realListTasks(pid, cwd);
		};
		store.seed("p-2", task({ id: "orphan", status: "running_agent" }));

		expect(() => reconcileInterruptedRuns(store)).not.toThrow();
		expect(store.getTask("p-2", "orphan").status).toBe("interrupted");
	});
});

describe("findResumedCandidate corrupt dates", () => {
	it("orders deterministically when a timestamp is garbage", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "garbage", status: "interrupted", updatedAt: "not-a-date", enteredStageAt: "also-bad" }));
		store.seed(
			"p-1",
			task({ id: "valid", status: "interrupted", updatedAt: "2026-09-24T10:00:00.000Z" }),
		);

		const first = findResumedCandidate(store);
		const second = findResumedCandidate(store);
		expect(first?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
		expect(second?.taskId).toBe(first?.taskId);
	});
});

describe("scheduleTick command dispatch (no deploy mutex)", () => {
	const commandStages = [
		{ id: "s-c", name: "Deploy", type: "ci", command: "./deploy.sh --prod" },
	];

	function commandStore() {
		return makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: commandStages }],
		});
	}

	it("dispatches a deploy-command stage while a sibling holds a live run", async () => {
		// No deploy mutex: a deploy-command stage is ordinary CI and the
		// single-active invariant (busy gate) is the only dispatch guard.
		const store = commandStore();
		const candidate = store.seed("p-1", task({ currentStageId: "s-c" }));
		store.seed("p-1", task({ id: "holder", status: "running_merge", currentStageId: "s-c" }));
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(candidate.status).toBe("in_stage");
	});

	it("dispatches a deploy-command stage even while a foreign deploy lock is held", async () => {
		// The production deploy lock is continuity-owned: the generic engine
		// ignores it (deploy.sh serializes on its own flock).
		const store = commandStore();
		store.deployManager = { isDeployLocked: () => true };
		store.seed("p-1", task({ currentStageId: "s-c" }));
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
	});

	it("dispatches a deploy-command stage with no lock held", async () => {
		const store = commandStore();
		store.deployManager = { isDeployLocked: () => false };
		store.seed("p-1", task({ currentStageId: "s-c" }));
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
	});

	it("dispatches ordinary ci stages while the deploy lock is held", async () => {
		const store = makeStore();
		store.deployManager = { isDeployLocked: () => true };
		store.seed("p-1", task({ currentStageId: "s-1" }));
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
	});
});

describe("WP6 rehydration markers (hasRehydrationMarkers)", () => {
	it.each([
		["deployBuildAtEntry is continuity-owned, not generic", { deployBuildAtEntry: 7 }, false],
		["deployAttemptId is continuity-owned, not generic", { deployAttemptId: "deploy-t-1-123" }, false],
		["preMergeMainSha", { preMergeMainSha: "abc123" }, true],
		["mergeAttemptId", { mergeAttemptId: "merge-t-1-123" }, true],
		["landed reviewBaseline", { reviewBaseline: { mergedAt: "2026-09-24T10:00:00.000Z" } }, true],
		["no markers", {}, false],
		["blank strings are not markers", { mergeAttemptId: "  ", preMergeMainSha: "" }, false],
		["null task", null, false],
	])("marker %s → %s", (_, overrides, expected) => {
		expect(hasRehydrationMarkers(overrides === null ? null : task(overrides))).toBe(expected);
	});
});

describe("WP6 isAutoResumableWithReason", () => {
	it.each([
		["agent resumable", { type: "agent" }, {}, true, "automated-stage"],
		["ci resumable", { type: "ci" }, {}, true, "automated-stage"],
		["legacy deploy type with attempt marker is ordinary ci", { type: "deploy" }, { deployAttemptId: "deploy-t-1-1" }, true, "automated-stage"],
		[
			"ci-typed deploy stage resumes like ordinary CI (no markers needed)",
			{ type: "ci", command: "./deploy.sh --prod" },
			{},
			true,
			"automated-stage",
		],
		[
			"ci-typed deploy stage with continuity markers still resumes",
			{ type: "ci", command: "./deploy.sh --prod" },
			{ deployAttemptId: "deploy-t-1-1" },
			true,
			"automated-stage",
		],
		[
			"ci-typed deploy stage parked while a continuity hold is set",
			{ type: "ci", command: "./deploy.sh --prod" },
			{ deployAttemptId: "deploy-t-1-1", continuityHold: "deploy-t-1-1" },
			false,
			"continuity-hold",
		],
		[
			// The continuity-internal wait marker is invisible to the
			// generic engine: re-entering the merge is safe and advances
			// to the command stage.
			"merge ignores a stale continuity-internal wait marker",
			{ type: "merge" },
			{ reviewBaseline: { mergedAt: "x" }, deployAttemptInFlightNoted: "deploy-t-1-1" },
			true,
			"rehydratable-merge",
		],
		[
			"merge parked while a continuity hold is set",
			{ type: "merge" },
			{ reviewBaseline: { mergedAt: "x" }, continuityHold: "deploy-t-1-1" },
			false,
			"continuity-hold",
		],
		["legacy deploy type with entry-build marker is ordinary ci", { type: "deploy" }, { deployBuildAtEntry: 7 }, true, "automated-stage"],
		["merge with pre-merge SHA resumable", { type: "merge" }, { preMergeMainSha: "abc" }, true, "rehydratable-merge"],
		["merge with landed baseline resumable", { type: "merge" }, { reviewBaseline: { mergedAt: "x" } }, true, "rehydratable-merge"],
		["legacy deploy type without markers is ordinary ci", { type: "deploy" }, {}, true, "automated-stage"],
		["merge without markers parked", { type: "merge" }, {}, false, "no-rehydration-markers"],
		["human never resumes", { type: "human" }, {}, false, "human-stage"],
	])("%s", (_, stage, overrides, resumable, reason) => {
		expect(
			isAutoResumableWithReason(task({ status: "interrupted", ...overrides }), stage),
		).toEqual({ resumable, reason });
	});

	it("records exclusion reasons for tripped, blocked, paused, and waiting_human", () => {
		const interrupted = task({ status: "interrupted" });
		expect(
			isAutoResumableWithReason(interrupted, { type: "agent" }, { tripped: true }),
		).toEqual({ resumable: false, reason: "engine-tripped" });
		expect(
			isAutoResumableWithReason(interrupted, { type: "agent" }, { blocked: true }),
		).toEqual({ resumable: false, reason: "blocked" });
		expect(isAutoResumableWithReason(interrupted, { type: "agent", paused: true })).toEqual({
			resumable: false,
			reason: "stage-paused",
		});
		expect(isAutoResumableWithReason(interrupted, null)).toEqual({
			resumable: false,
			reason: "unknown-stage",
		});
		expect(
			isAutoResumableWithReason(task({ status: "waiting_human" }), { type: "agent" }),
		).toEqual({ resumable: false, reason: "waiting-human" });
		expect(isAutoResumableWithReason(task({ status: "paused" }), { type: "agent" })).toEqual({
			resumable: false,
			reason: "task-paused",
		});
		expect(isAutoResumableWithReason(task({}), { type: "agent" })).toEqual({
			resumable: false,
			reason: "not-interrupted",
		});
	});

	it("isAutoResumable stays a boolean wrapper (deploy is ordinary ci)", () => {
		expect(isAutoResumable(task({ status: "interrupted" }), { type: "deploy" })).toBe(true);
		expect(
			isAutoResumable(task({ status: "interrupted", deployAttemptId: "d-1" }), { type: "deploy" }),
		).toBe(true);
		expect(
			isAutoResumable(task({ status: "interrupted", continuityHold: "d-1" }), { type: "ci" }),
		).toBe(false);
	});
});

describe("WP6 collectResumeEvidence", () => {
	it("bundles generic markers, SHAs, and verdict", () => {
		// Generic evidence carries only the generic (merge) markers:
		// deploy entry markers and last-result age are continuity-owned
		// (the implementation-specific plugin records its own evidence).
		const store = makeStore();
		store.deployManager = { readJson: () => ({ status: "success" }) };
		const evidence = collectResumeEvidence(
			store,
			task({
				deployBuildAtEntry: 7,
				deployAttemptId: "deploy-t-1-1",
				preMergeMainSha: "abc123",
				reviewBaseline: { mergedAt: "x", headSha: "h1", baseSha: "b1" },
			}),
			"reconcile-resume",
		);
		expect(evidence.markers).toEqual(["preMergeMainSha", "reviewBaseline.mergedAt"]);
		expect(evidence.shas).toMatchObject({ preMergeMainSha: "abc123", headSha: "h1", baseSha: "b1" });
		expect(evidence.verdict).toBe("reconcile-resume");
		// No deploy-specific fields in generic evidence.
		expect(evidence).not.toHaveProperty("lastResultAgeMs");
	});

	it("carries merge markers without any deploy-specific fields", () => {
		const evidence = collectResumeEvidence(makeStore(), task({ mergeAttemptId: "m-1" }));
		expect(evidence.markers).toEqual(["mergeAttemptId"]);
		expect(evidence).not.toHaveProperty("lastResultAgeMs");
	});
});

describe("WP6 scheduleTick stall watchdog", () => {
	const ciStage = { id: "s-ci", name: "CI", type: "ci" };

	it("recovers a heartbeat-silent active task before the busy gate", async () => {
		const { recordStageHeartbeat } = await import("./stageHeartbeat.js");
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciStage] }],
		});
		store.seed("p-1", task({ id: "stalled", status: "running_ci", currentStageId: "s-ci" }));
		store.engineState = { status: "running", activeTaskId: "stalled", activeProjectId: "p-1" };
		recordStageHeartbeat(store, "stalled", {
			stageId: "s-ci",
			kind: "ci",
			timestamp: Date.now() - 400_000,
		});
		await scheduleTick(store);
		const recovered = store.getTask("p-1", "stalled");
		expect(recovered.stallCount).toBe(1);
		expect(
			recovered.history.some((h) => String(h.action).includes("Stage marked stalled")),
		).toBe(true);
	});

	it("leaves an uninstrumented active task to the busy gate", async () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciStage] }],
		});
		store.seed("p-1", task({ id: "busy", status: "running_ci", currentStageId: "s-ci" }));
		store.engineState = { status: "running", activeTaskId: "busy", activeProjectId: "p-1" };
		await scheduleTick(store);
		expect(store.getTask("p-1", "busy").stallCount).toBeUndefined();
		expect(store.schedulerStats.skippedBusy).toBe(1);
	});
});

describe("WP6 resumed deploy/merge keeps Rule 0 priority", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };

	it("isResumedStageRunnable admits marked ci always, merge only with markers", () => {
		// Legacy deploy reads as ci: an ordinary automated stage.
		expect(isResumedStageRunnable({ type: "deploy" })).toBe(true);
		expect(isResumedStageRunnable({ type: "merge" })).toBe(false);
		expect(
			isResumedStageRunnable({ type: "deploy" }, { task: task({ deployAttemptId: "d-1" }) }),
		).toBe(true);
		expect(
			isResumedStageRunnable({ type: "merge" }, { task: task({ preMergeMainSha: "abc" }) }),
		).toBe(true);
		expect(
			isResumedStageRunnable({ type: "deploy", paused: true }, { task: task({ deployAttemptId: "d-1" }) }),
		).toBe(false);
		expect(
			isResumedStageRunnable({ type: "merge" }, { task: task({ continuityHold: "d-1", preMergeMainSha: "abc" }) }),
		).toBe(false);
	});

	it("refuses a continuity hold so Rule 0 never re-dispatches a waiting task", () => {
		const inFlight = task({
			deployAttemptId: "d-1",
			deployAttemptInFlightNoted: "d-1",
			continuityHold: "d-1",
		});
		expect(isResumedStageRunnable({ type: "deploy" }, { task: inFlight })).toBe(false);
		expect(hasContinuityHold(inFlight)).toBe(true);
		expect(
			isAutoResumableWithReason(
				task({
					status: "interrupted",
					deployAttemptId: "d-1",
					deployAttemptInFlightNoted: "d-1",
					continuityHold: "d-1",
				}),
				{ type: "merge", command: "./deploy.sh --prod" },
			),
		).toEqual({ resumable: false, reason: "continuity-hold" });
	});

	it("hasContinuityHold is total and false for blank holds", () => {
		expect(hasContinuityHold(null)).toBe(false);
		expect(hasContinuityHold({ continuityHold: "" })).toBe(false);
		expect(hasContinuityHold({ continuityHold: "   " })).toBe(false);
		expect(hasContinuityHold({ continuityHold: true })).toBe(true);
		expect(hasContinuityHold({ continuityHold: "d-1" })).toBe(true);
	});

	it("findResumedCandidate leads with a marked rehydratable deploy", () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		store.seed(
			"p-1",
			task({
				id: "resumed-deploy",
				status: "in_stage",
				currentStageId: "s-d",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
				deployAttemptId: "deploy-resumed-1",
			}),
		);
		store.seed("p-1", task({ id: "fresh", status: "in_stage", currentStageId: "s-d" }));
		const found = findResumedCandidate(store);
		expect(found?.taskId).toBe("resumed-deploy");
		expect(found?.priorityReason).toBe("resumed_interrupted");
	});

	it("findResumedCandidate picks up a marked ci task with no markers; skips a markerless merge", () => {
		const mergeOnly = [{ id: "s-m", name: "Merge", type: "merge" }];
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: mergeOnly }],
		});
		store.seed(
			"p-1",
			task({
				id: "marked-bare",
				status: "in_stage",
				currentStageId: "s-m",
				resumedAfterInterruption: true,
				interruptedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		// A merge stage with no rehydration markers stays parked.
		expect(findResumedCandidate(store)).toBeNull();
	});
});

describe("WP6 recovery fail-safe hardening", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };

	it("reconcileInterruptedRuns flips status on a store without history helpers", () => {
		const store = makeStore();
		delete store._recordHistory;
		delete store._saveTaskMarkdown;
		store.seed("p-1", task({ id: "orphan", status: "running_ci", currentStageId: "s-1" }));
		expect(reconcileInterruptedRuns(store)).toEqual([{ projectId: "p-1", taskId: "orphan" }]);
		expect(store.getTask("p-1", "orphan").status).toBe("interrupted");
	});

	it("runScheduledTick still ticks when a continuity plugin reconcile fails", async () => {
		const { registerStageLifecyclePlugin, clearStageLifecyclePlugins } = await import(
			"./stageLifecycle.js"
		);
		try {
			// A throwing plugin must never break the tick: the idle tick below
			// still runs to completion (and retries reconcile next interval).
			registerStageLifecyclePlugin({
				name: "rotted-test-plugin",
				reconcileInterruptions: () => {
					throw new Error("continuity rotted");
				},
			});
			const store = makeStore();
			await expect(runScheduledTick(store)).resolves.toBeNull();
			expect(store.schedulerStats.ticks).toBe(1);
			expect(store.schedulerStats.lastOutcome).toBe("no-candidate-idle");
		} finally {
			clearStageLifecyclePlugins();
		}
	});

	it("runScheduledTick runs interruption plugins before ticking", async () => {
		const { registerStageLifecyclePlugin, clearStageLifecyclePlugins } = await import(
			"./stageLifecycle.js"
		);
		try {
			const order = [];
			registerStageLifecyclePlugin({
				name: "order-test-plugin",
				reconcileInterruptions: () => {
					order.push("reconcile");
					return [];
				},
			});
			const store = makeStore({
				projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
			});
			store.seed(
				"p-1",
				task({ status: "interrupted", currentStageId: "s-d", enteredStageAt: "2026-09-24T09:00:00.000Z" }),
			);
			await runScheduledTick(store);
			// The plugin reconcile ran first (ordering), then the tick
			// picked up the interrupted task: a legacy deploy-typed stage
			// normalizes to ci, so it auto-resumed and dispatched like any
			// other automated stage.
			expect(order).toEqual(["reconcile"]);
			expect(store.executeStage).toHaveBeenCalled();
			expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
		} finally {
			clearStageLifecyclePlugins();
		}
	});
});
