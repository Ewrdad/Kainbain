import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	RESUMED_PRIORITY_RANK,
	RESUMED_QUEUE_REASON,
	getScheduledQueue,
	scheduleTick,
} from "./taskScheduler.js";
import {
	autoResumeInterrupted,
	countInterrupted,
	performStartupRecovery,
	startupRecoverySummary,
} from "./startupRecovery.js";

const AGENT_STAGES = [{ id: "s-1", name: "Build", type: "agent" }];

function makeStore({ projects } = {}) {
	const list =
		projects || [{ id: "p-1", name: "P", cwd: "/repo", stages: AGENT_STAGES }];
	const maps = new Map();
	const store = {
		projectStore: {
			listProjects: () => list,
			getProject: (pid) => list.find((p) => p.id === pid),
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
		eventBridge: null,
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
		setEngineState: vi.fn((patch) => {
			store.engineState = { ...store.engineState, ...patch };
		}),
		executeStage: vi.fn(async () => ({ ok: true })),
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		_resetAutoIteration: vi.fn(),
		_resolveProjectCwd: (pid, cwd) => cwd || "/repo",
		_saveTaskMarkdown: vi.fn(),
		saveStageReport: vi.fn(),
		handleStageFailure: vi.fn(),
		advanceStage: vi.fn(),
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

describe("startupRecoverySummary", () => {
	it("renders the N → M + K line", () => {
		expect(
			startupRecoverySummary({
				interruptedFound: 3,
				autoResumed: [{ taskId: "a" }],
			}),
		).toBe("startup recovery: 3 interrupted → 1 auto-resumed, 2 left for operator");
		expect(startupRecoverySummary({ interruptedFound: 0, autoResumed: [] })).toBe(
			"startup recovery: 0 interrupted → 0 auto-resumed, 0 left for operator",
		);
	});
});

describe("autoResumeInterrupted", () => {
	it("returns [] without projects", () => {
		const store = makeStore();
		store.projectStore = null;
		expect(autoResumeInterrupted(store)).toEqual([]);
	});

	it("resumes agent and ci interruptions and parks the rest", () => {
		// A deploy-typed stage normalizes to `ci`: a deploy-command stage is
		// an ordinary ci stage and auto-resumes like any other ci stage.
		const ciStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const humanStage = { id: "s-h", name: "Review", type: "human" };
		const store = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					stages: [AGENT_STAGES[0], ciStage, humanStage],
				},
			],
		});
		store.seed("p-1", task({ id: "agent", status: "interrupted" }));
		store.seed(
			"p-1",
			task({ id: "deploy", status: "interrupted", currentStageId: "s-d" }),
		);
		store.seed(
			"p-1",
			task({ id: "human", status: "interrupted", currentStageId: "s-h" }),
		);
		store.seed("p-1", task({ id: "calm" }));

		expect(autoResumeInterrupted(store)).toEqual([
			{ projectId: "p-1", taskId: "agent" },
			{ projectId: "p-1", taskId: "deploy" },
		]);
		expect(store.getTask("p-1", "agent").status).toBe("in_stage");
		expect(store.getTask("p-1", "deploy").status).toBe("in_stage");
		expect(store.getTask("p-1", "human").status).toBe("interrupted");
	});

	it("resumes every ci interruption under Rule 0 (no rehydration markers needed)", () => {
		// A deploy-command ci stage is an ordinary ci stage: it auto-resumes
		// without rehydration markers, exactly like any other ci stage.
		const ciStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [
				{
					id: "p-1",
					name: "P",
					cwd: "/repo",
					stages: [AGENT_STAGES[0], ciStage],
				},
			],
		});
		store.seed(
			"p-1",
			task({
				id: "deploy-marked",
				status: "interrupted",
				currentStageId: "s-d",
				deployAttemptId: "deploy-deploy-m-1",
			}),
		);
		store.seed(
			"p-1",
			task({ id: "deploy-bare", status: "interrupted", currentStageId: "s-d" }),
		);

		expect(autoResumeInterrupted(store)).toEqual([
			{ projectId: "p-1", taskId: "deploy-marked" },
			{ projectId: "p-1", taskId: "deploy-bare" },
		]);
		expect(store.getTask("p-1", "deploy-marked").status).toBe("in_stage");
		expect(store.getTask("p-1", "deploy-bare").status).toBe("in_stage");
	});

	it("flips nothing while tripped and records the deferral reason", () => {
		const store = makeStore();
		store.circuitState = { tripped: true, reason: "error cascade" };
		store.seed("p-1", task({ id: "agent", status: "interrupted" }));

		expect(autoResumeInterrupted(store)).toEqual([]);
		const parked = store.getTask("p-1", "agent");
		expect(parked.status).toBe("interrupted");
		expect(
			parked.history.some((h) =>
				String(h.action).includes("circuit breaker tripped"),
			),
		).toBe(true);
	});

	it("records a Resumed timeline entry with evidence on every auto-resume", () => {
		const store = makeStore();
		store._recordTimeline = vi.fn((t, entry) => {
			t.timeline = t.timeline || [];
			t.timeline.push(entry);
		});
		store.seed(
			"p-1",
			task({
				id: "agent",
				status: "interrupted",
				preMergeMainSha: "abc123",
			}),
		);

		expect(autoResumeInterrupted(store)).toEqual([
			{ projectId: "p-1", taskId: "agent" },
		]);
		expect(store._recordTimeline).toHaveBeenCalledWith(
			store.getTask("p-1", "agent"),
			expect.objectContaining({
				status: "Resumed",
				markers: expect.arrayContaining(["preMergeMainSha"]),
				shas: expect.objectContaining({ preMergeMainSha: "abc123" }),
				verdict: "auto-resumed",
			}),
		);
	});
});

describe("countInterrupted", () => {
	it("counts only the interrupted label", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "a", status: "interrupted" }));
		store.seed("p-1", task({ id: "b", status: "running_agent" }));
		store.seed("p-1", task({ id: "c" }));
		expect(countInterrupted(store)).toBe(1);
	});
});

describe("performStartupRecovery", () => {
	it("collapses orphans, resumes agent work, and starts the scheduler", async () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "orphan", status: "running_agent" }));
		store.seed(
			"p-1",
			task({ id: "sigterm", status: "interrupted", wasInterrupted: true }),
		);
		try {
			const result = await performStartupRecovery(store, { disabled: true });
			// kill -9 orphan and SIGTERM interruption both land runnable.
			expect(store.getTask("p-1", "orphan").status).toBe("in_stage");
			expect(store.getTask("p-1", "sigterm").status).toBe("in_stage");
			expect(result.runs).toEqual([{ projectId: "p-1", taskId: "orphan" }]);
			expect(result.autoResumed).toEqual([
				{ projectId: "p-1", taskId: "orphan" },
				{ projectId: "p-1", taskId: "sigterm" },
			]);
			expect(result.interruptedFound).toBe(2);
			expect(result.summary).toContain("2 interrupted → 2 auto-resumed");
			expect(store.schedulerStats.resumedInterrupted).toBe(2);
		} finally {
			store.stopScheduler?.();
		}
	});

	it("auto-resumes an interrupted ci stage at startup (ordinary CI, no plugin reconcile)", async () => {
		// A deploy-command ci stage is an ordinary ci stage: startup recovery
		// auto-resumes it (no continuity plugin reconcile, no special deploy
		// path). With no plugins registered `result.deploys` is empty.
		const ciStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciStage] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 7,
				finishedAt: "2026-09-24T10:01:00.000Z",
				message: "ok",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		const result = await performStartupRecovery(store, { disabled: true });
		// No plugins: nothing deploy-specific reconciles.
		expect(result.deploys).toEqual([]);
		// The ci stage is auto-resumed (ordinary CI behaviour).
		expect(result.autoResumed).toEqual([{ projectId: "p-1", taskId: "t-1" }]);
		expect(store.executeStage).not.toHaveBeenCalled();
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
	});

	it("survives a throwing plugin reconcile and still recovers the rest", async () => {
		// A throwing continuity plugin (or a broken deploy manager behind it)
		// must never prevent boot: the scheduler still starts and ordinary
		// interruptions still auto-resume.
		const store = makeStore();
		store.deployManager = {
			readJson: () => {
				throw new Error("disk unreadable");
			},
		};
		store.seed("p-1", task({ id: "agent", status: "interrupted" }));
		const result = await performStartupRecovery(store, { disabled: true });
		expect(result.autoResumed).toEqual([{ projectId: "p-1", taskId: "agent" }]);
	});

	it("is idempotent: a second pass resumes and reconciles nothing", async () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "interrupted" }));
		const first = await performStartupRecovery(store, { disabled: true });
		const historyLength = store.getTask("p-1", "t-1").history.length;
		const second = await performStartupRecovery(store, { disabled: true });
		expect(first.autoResumed).toHaveLength(1);
		expect(second.autoResumed).toEqual([]);
		expect(second.runs).toEqual([]);
		expect(store.getTask("p-1", "t-1").history).toHaveLength(historyLength);
		expect(store.schedulerStats.resumedInterrupted).toBe(1);
	});

	it("transitions state but never dispatches while the engine is owned", async () => {
		vi.useFakeTimers();
		const store = makeStore();
		try {
			store.engineState = { status: "running", activeTaskId: "busy-task" };
			store.seed("p-1", task({ status: "interrupted" }));
			const result = await performStartupRecovery(store, { intervalMs: 1000 });
			expect(store.schedulerRunning).toBe(true);
			expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
			expect(result.autoResumed).toHaveLength(1);
			expect(store.executeStage).not.toHaveBeenCalled();
			// The armed kick and intervals keep skipping while busy.
			await vi.advanceTimersByTimeAsync(5000);
			expect(store.executeStage).not.toHaveBeenCalled();
			expect(store.schedulerStats.skippedBusy).toBeGreaterThan(0);
		} finally {
			const { stopScheduler } = await import("./taskScheduler.js");
			stopScheduler(store);
			vi.useRealTimers();
		}
	});

	it("starts the scheduler and kicks for fast pickup", async () => {
		vi.useFakeTimers();
		const store = makeStore();
		try {
			store.seed("p-1", task());
			await performStartupRecovery(store, { intervalMs: 1000 });
			expect(store.schedulerRunning).toBe(true);
			// The kick fires one debounced re-tick (~150 ms).
			await vi.advanceTimersByTimeAsync(150);
			expect(store.executeStage).toHaveBeenCalledTimes(1);
		} finally {
			const { stopScheduler } = await import("./taskScheduler.js");
			stopScheduler(store);
			vi.useRealTimers();
		}
	});

	it("never rejects: a throwing project list still resolves with the scheduler ticking", async () => {
		const store = makeStore();
		store.projectStore.listProjects = () => {
			throw new Error("projects unreadable");
		};
		const result = await performStartupRecovery(store, { disabled: true });
		expect(result.runs).toEqual([]);
		expect(result.deploys).toEqual([]);
		expect(result.autoResumed).toEqual([]);
		expect(result.interruptedFound).toBe(0);
		expect(result.summary).toContain("0 interrupted → 0 auto-resumed");
	});

	it("one unreadable project does not block recovery of the others", async () => {
		const store = makeStore({
			projects: [
				{ id: "p-1", name: "P1", cwd: "/a", stages: AGENT_STAGES },
				{ id: "p-2", name: "P2", cwd: "/b", stages: AGENT_STAGES },
			],
		});
		const realListTasks = store.listTasks;
		store.listTasks = (pid) => {
			if (pid === "p-1") throw new Error("unreadable");
			return realListTasks(pid);
		};
		store.seed("p-2", task({ id: "survivor", status: "interrupted" }));

		const result = await performStartupRecovery(store, { disabled: true });
		expect(result.autoResumed).toEqual([
			{ projectId: "p-2", taskId: "survivor" },
		]);
		expect(store.getTask("p-2", "survivor").status).toBe("in_stage");
	});

	it("auto-resumes a ci stage parked under its stage name (ordinary CI)", async () => {
		// A ci stage whose command runs the deploy script auto-resumes under
		// its stage name exactly like any other ci stage — no deploy-specific
		// reconcile path in generic startup recovery.
		const ciStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciStage] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 7,
				finishedAt: "2026-09-24T10:01:00.000Z",
				message: "ok",
			}),
		};
		// Parked under "Deploy" (the name), not "s-d" (the id).
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "Deploy",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		const result = await performStartupRecovery(store, { disabled: true });
		// No plugins: nothing deploy-specific reconciles.
		expect(result.deploys).toEqual([]);
		// The ci stage is auto-resumed (ordinary CI behaviour).
		expect(result.autoResumed).toEqual([{ projectId: "p-1", taskId: "t-1" }]);
		expect(store.executeStage).not.toHaveBeenCalled();
	});
});

describe("startup recovery → dispatch priority", () => {
	function recoveryStore() {
		return makeStore({
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
	}

	it("dispatches the recovered interruption before further-along work", async () => {
		const store = recoveryStore();
		store.seed(
			"p-1",
			task({
				id: "interrupted-old",
				status: "interrupted",
				wasInterrupted: true,
				currentStageId: "s-1",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "far-along",
				currentStageId: "s-3",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				updatedAt: "2026-09-24T10:00:00.000Z",
			}),
		);

		await performStartupRecovery(store, { disabled: true });
		// Recovery flips the label…
		expect(store.getTask("p-1", "interrupted-old").status).toBe("in_stage");

		// …but the queue still leads with the recovered interruption…
		const queue = getScheduledQueue(store);
		expect(queue[0].id).toBe("interrupted-old");
		expect(queue[0].priorityRank).toBe(RESUMED_PRIORITY_RANK);
		expect(queue[0].priorityReason).toBe(RESUMED_QUEUE_REASON);

		// …and the first dispatch picks up where the stop left off.
		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(store.executeStage.mock.calls[0][1]).toBe("interrupted-old");
	});

	it("dispatches the recovered interruption before an armed follow-on", async () => {
		const store = recoveryStore();
		store.seed(
			"p-1",
			task({
				id: "interrupted-old",
				status: "interrupted",
				wasInterrupted: true,
				currentStageId: "s-1",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		store.seed("p-1", task({ id: "follow-on", currentStageId: "s-2" }));

		await performStartupRecovery(store, { disabled: true });
		store.lastCompletedTask = { projectId: "p-1", taskId: "follow-on" };

		await scheduleTick(store);
		expect(store.executeStage).toHaveBeenCalledTimes(1);
		expect(store.executeStage.mock.calls[0][1]).toBe("interrupted-old");
		// The follow-on stays armed for the next tick.
		expect(store.lastCompletedTask).toEqual({
			projectId: "p-1",
			taskId: "follow-on",
		});
	});
});
