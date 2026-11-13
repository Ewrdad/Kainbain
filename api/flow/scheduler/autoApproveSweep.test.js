import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	autoApproveSweep,
	checkAutoApproveTask,
	collectAutoApproveCandidates,
	ensureAutoApproveTimer,
	ensureScheduler,
	startScheduler,
	stopScheduler,
} from "../taskScheduler.js";
import {
	clearAlertSinks,
	registerAlertSink,
} from "../../observability/alerts.js";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const HOLD_MS = 86400000;
const LEAD_MS = 3600000;

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: HOLD_MS },
	{ id: "s-3", name: "Done", type: "agent" },
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
		autoApproveTimer: null,
		_kickTimer: null,
		_onIdleTimer: null,
		lastCompletedTask: null,
		eventBridge: { broadcastGlobal: vi.fn(), emitProcessEvent: vi.fn() },
		blockedIds: new Set(),
		claimedIds: new Set(),
		claimStore: {
			describe: (tid) =>
				store.claimedIds.has(String(tid)) ? { runnerId: "r-1" } : null,
		},
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		listTasks: (pid) => Array.from(maps.get(pid)?.values() || []),
		isTaskBlocked: (pid, tid) => ({
			blocked: store.blockedIds.has(`${pid}:${tid}`),
			blockers: [],
			hasCycle: false,
		}),
		_saveTaskMarkdown: vi.fn(),
		advanceStage: vi.fn((pid, tid) => {
			// Faithful mimic of the real exit: the wait ends, the stamp clears.
			const t = maps.get(pid)?.get(tid);
			if (t) {
				t.status = "in_stage";
				t.autoApproveAt = null;
				t.autoApproveRemindedAt = null;
			}
			return t;
		}),
		executeStage: vi.fn(async () => ({ ok: true })),
		setEngineState: vi.fn((patch) => Object.assign(store.engineState, patch)),
	};
	return store;
}

function waitingTask(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "waiting_human",
		currentStageId: "s-2",
		enteredStageAt: iso(NOW - HOLD_MS),
		updatedAt: iso(NOW - HOLD_MS),
		autoApproveAt: iso(NOW - 1000),
		autoApproveRemindedAt: null,
		history: [],
		...overrides,
	};
}

const flushAlerts = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
};

beforeEach(() => {
	vi.clearAllMocks();
	clearAlertSinks();
});

afterEach(() => {
	clearAlertSinks();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("checkAutoApproveTask / collectAutoApproveCandidates", () => {
	it("collects only due-and-live tasks, earliest deadline first", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ id: "due-late", autoApproveAt: iso(NOW - 1000) }));
		store.seed("p-1", waitingTask({ id: "due-early", autoApproveAt: iso(NOW - 5000) }));
		store.seed("p-1", waitingTask({ id: "not-yet", autoApproveAt: iso(NOW + HOLD_MS) }));
		store.seed("p-1", waitingTask({ id: "no-stamp", autoApproveAt: null }));
		store.seed("p-1", waitingTask({ id: "bad-stamp", autoApproveAt: "not-a-date" }));
		store.seed("p-1", waitingTask({ id: "wrong-status", status: "in_stage" }));
		store.seed("p-1", waitingTask({ id: "agent-stage", currentStageId: "s-1" }));
		store.seed("p-1", waitingTask({ id: "completed", status: "completed" }));
		const { due, reminders } = collectAutoApproveCandidates(store, {
			now: NOW,
			configuredLeadMs: 0,
		});
		expect(due.map((d) => d.taskId)).toEqual(["due-early", "due-late"]);
		expect(reminders).toEqual([]);
		expect(due[0].stampMs).toBe(NOW - 5000);
		expect(due[0].durationMs).toBe(HOLD_MS);
	});

	it("excludes paused stages, blocked, claimed, and engine-owned tasks", () => {
		const paused = [
			{ id: "s-1", name: "Build", type: "agent" },
			{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: HOLD_MS, paused: true },
		];
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: paused }],
		});
		store.seed("p-1", waitingTask({ id: "paused-stage" }));
		store.seed("p-1", waitingTask({ id: "blocked" }));
		store.blockedIds.add("p-1:blocked");
		store.seed("p-1", waitingTask({ id: "claimed" }));
		store.claimedIds.add("claimed");
		store.seed("p-1", waitingTask({ id: "owner" }));
		store.engineState.status = "running";
		store.engineState.activeTaskId = "owner";
		// Survey parks are waiting_human at AGENT stages — never auto-approved.
		store.seed("p-1", waitingTask({ id: "survey", currentStageId: "s-1", surveyPending: true }));
		const { due, reminders } = collectAutoApproveCandidates(store, {
			now: NOW,
			configuredLeadMs: 0,
		});
		expect(due).toEqual([]);
		expect(reminders).toEqual([]);
	});

	it("derives the reminder duration from the stamp span when config changed mid-wait", () => {
		const changed = [
			{ id: "s-1", name: "Build", type: "agent" },
			{ id: "s-2", name: "Review", type: "human" },
		];
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: changed }],
		});
		// Stamp persists from the original visit; the hold is gone from config.
		store.seed(
			"p-1",
			waitingTask({ id: "edited", enteredStageAt: iso(NOW - HOLD_MS), autoApproveAt: iso(NOW) }),
		);
		const verdict = checkAutoApproveTask(
			store,
			store.projects[0],
			store.getTask("p-1", "edited"),
			{ now: NOW, configuredLeadMs: LEAD_MS },
		);
		expect(verdict?.kind).toBe("due");
		expect(verdict.durationMs).toBe(HOLD_MS);
	});

	it("never throws on unreadable stores or tasks", () => {
		expect(collectAutoApproveCandidates(null)).toEqual({ due: [], reminders: [] });
		expect(collectAutoApproveCandidates({})).toEqual({ due: [], reminders: [] });
		expect(checkAutoApproveTask(null, null, null)).toBeNull();
		expect(checkAutoApproveTask({}, {}, { status: "waiting_human" })).toBeNull();
		const throwing = makeStore();
		throwing.listTasks = () => { throw new Error("disk gone"); };
		expect(collectAutoApproveCandidates(throwing)).toEqual({ due: [], reminders: [] });
		const blockedThrow = makeStore();
		blockedThrow.isTaskBlocked = () => { throw new Error("graph gone"); };
		blockedThrow.seed("p-1", waitingTask());
		expect(
			collectAutoApproveCandidates(blockedThrow, { now: NOW }).due,
		).toEqual([]);
	});
});

describe("autoApproveSweep advances", () => {
	it("fires exactly at the stamp, never 1ms before (never-early)", () => {
		for (const [label, now, fires] of [
			["1ms before", NOW - 1, false],
			["exactly at", NOW, true],
			["1ms after", NOW + 1, true],
		]) {
			const store = makeStore();
			store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW) }));
			const summary = autoApproveSweep(store, { now, batch: 10, configuredLeadMs: 0 });
			expect([label, summary.advanced]).toEqual([label, fires ? 1 : 0]);
		}
	});

	it("advances via store.advanceStage with the automated marker", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ id: "t-9", autoApproveAt: iso(NOW - 10) }));
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary).toMatchObject({ advanced: 1, reminded: 0, deferred: 0, errors: 0, outcome: "advanced" });
		expect(store.advanceStage).toHaveBeenCalledWith(
			"p-1",
			"t-9",
			STAGES,
			undefined,
			"/repo",
			{
				automated: true,
				autoApproveAt: iso(NOW - 10),
				firedAt: iso(NOW),
				durationMs: HOLD_MS,
			},
		);
		expect(store.schedulerStats).toMatchObject({
			autoApproveSweeps: 1,
			autoApproved: 1,
			lastAutoApproveOutcome: "advanced",
		});
		expect(store.schedulerStats.lastAutoApproveSweepAt).toBe(iso(NOW));
		// The dispatch tick's own diagnosis is untouched by the sweeper.
		expect(store.schedulerStats.lastOutcome).toBeNull();
	});

	it("respects the batch cap oldest-first and continues on the next sweep", () => {
		const store = makeStore();
		for (let i = 0; i < 5; i++) {
			store.seed("p-1", waitingTask({ id: `t-${i}`, autoApproveAt: iso(NOW - (5 - i) * 1000) }));
		}
		const first = autoApproveSweep(store, { now: NOW, batch: 2, configuredLeadMs: 0 });
		expect(first).toMatchObject({ advanced: 2, deferred: 3 });
		expect(store.advanceStage.mock.calls.map((c) => c[1])).toEqual(["t-0", "t-1"]);
		const second = autoApproveSweep(store, { now: NOW, batch: 2, configuredLeadMs: 0 });
		expect(second).toMatchObject({ advanced: 2, deferred: 1 });
		expect(store.schedulerStats.autoApproved).toBe(4);
		expect(store.schedulerStats.autoApproveDeferred).toBe(4);
	});

	it("isolates per-task failures and counts them", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ id: "boom", autoApproveAt: iso(NOW - 3000) }));
		store.seed("p-1", waitingTask({ id: "fine", autoApproveAt: iso(NOW - 1000) }));
		store.advanceStage.mockImplementationOnce(() => { throw new Error("advance exploded"); });
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary).toMatchObject({ advanced: 1, errors: 1 });
		expect(store.schedulerStats.autoApproveErrors).toBe(1);
	});

	it("counts a missing advanceStage as an error instead of throwing", () => {
		const store = makeStore();
		store.advanceStage = null;
		store.seed("p-1", waitingTask());
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary).toMatchObject({ advanced: 0, errors: 1 });
	});

	it("reports idle/deferred/error outcomes", () => {
		const idle = makeStore();
		expect(autoApproveSweep(idle, { now: NOW, batch: 1 }).outcome).toBe("idle");
		const deferred = makeStore();
		deferred.seed("p-1", waitingTask());
		expect(autoApproveSweep(deferred, { now: NOW, batch: 0 }).outcome).toBe("deferred");
		const broken = makeStore();
		broken.advanceStage = null;
		broken.seed("p-1", waitingTask());
		expect(autoApproveSweep(broken, { now: NOW, batch: 10 }).outcome).toBe("error");
	});

	it("never throws, even on a hostile store", () => {
		expect(autoApproveSweep(null)).toMatchObject({ advanced: 0, errors: 0 });
		expect(autoApproveSweep({})).toMatchObject({ advanced: 0 });
		const hostile = makeStore();
		hostile.projectStore.listProjects = () => { throw new Error("nope"); };
		expect(autoApproveSweep(hostile, { now: NOW }).outcome).toBe("idle");
	});
});

describe("autoApproveSweep races (human wins)", () => {
	it("skips a task approved manually between scan and fire", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW - 1000) }));
		// listTasks sees the due wait; by revalidation the human acted.
		store.getTask = () => waitingTask({ status: "in_stage", autoApproveAt: null });
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary.advanced).toBe(0);
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("skips a task claimed between scan and fire", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW - 1000) }));
		let calls = 0;
		store.claimStore.describe = () => (++calls === 1 ? null : { runnerId: "r-9" });
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary.advanced).toBe(0);
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("skips a task that completed between scan and fire", () => {
		const store = makeStore();
		store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW - 1000) }));
		store.getTask = () => waitingTask({ status: "completed" });
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: 0 });
		expect(summary.advanced).toBe(0);
		expect(store.advanceStage).not.toHaveBeenCalled();
	});
});

describe("autoApproveSweep reminders", () => {
	it("sends one reminder inside the lead window, then never again", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (p) => { sent.push(p); return { delivered: true }; } });
		const store = makeStore();
		// Deadline in 30m with a 1h lead: inside the window, not due.
		store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW + 30 * 60000) }));
		const first = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: LEAD_MS });
		await flushAlerts();
		expect(first).toMatchObject({ advanced: 0, reminded: 1, outcome: "reminded" });
		const task = store.getTask("p-1", "t-1");
		expect(task.autoApproveRemindedAt).toBe(iso(NOW));
		expect(store._saveTaskMarkdown).toHaveBeenCalled();
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", task);
		const reminders = sent.filter((p) => p.event === "task.auto_approve_soon");
		expect(reminders).toHaveLength(1);
		expect(reminders[0].severity).toBe("info");
		expect(reminders[0].error.message).toContain("silence approves automatically after 1 day");
		expect(reminders[0].error.message).toContain(iso(NOW + 30 * 60000));

		const second = autoApproveSweep(store, { now: NOW + 60000, batch: 10, configuredLeadMs: LEAD_MS });
		await flushAlerts();
		expect(second.reminded).toBe(0);
		expect(sent.filter((p) => p.event === "task.auto_approve_soon")).toHaveLength(1);
	});

	it("never reminds before the window, when disabled, or when already marked", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (p) => { sent.push(p); return { delivered: true }; } });
		const store = makeStore();
		store.seed("p-1", waitingTask({ id: "early", autoApproveAt: iso(NOW + HOLD_MS) }));
		store.seed("p-1", waitingTask({ id: "marked", autoApproveAt: iso(NOW + 1000), autoApproveRemindedAt: iso(NOW - 1000) }));
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: LEAD_MS });
		await flushAlerts();
		expect(summary.reminded).toBe(0);
		expect(sent).toHaveLength(0);

		const disabled = makeStore();
		disabled.seed("p-1", waitingTask({ autoApproveAt: iso(NOW + 1000) }));
		const off = autoApproveSweep(disabled, { now: NOW, batch: 10, configuredLeadMs: 0 });
		await flushAlerts();
		expect(off.reminded).toBe(0);
		expect(sent).toHaveLength(0);
	});

	it("overdue-unreminded tasks advance instead of reminding", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (p) => { sent.push(p); return { delivered: true }; } });
		const store = makeStore();
		store.seed("p-1", waitingTask({ autoApproveAt: iso(NOW - 1000) }));
		const summary = autoApproveSweep(store, { now: NOW, batch: 10, configuredLeadMs: LEAD_MS });
		await flushAlerts();
		expect(summary).toMatchObject({ advanced: 1, reminded: 0 });
		expect(sent.filter((p) => p.event === "task.auto_approve_soon")).toHaveLength(0);
	});
});

describe("auto-approve sweeper lifecycle", () => {
	it("startScheduler arms the sweeper and stopScheduler clears it", () => {
		vi.useFakeTimers();
		try {
			const store = makeStore();
			startScheduler(store, { intervalMs: 1000 });
			expect(store.schedulerTimer).not.toBeNull();
			expect(store.autoApproveTimer).not.toBeNull();
			stopScheduler(store);
			expect(store.schedulerTimer).toBeNull();
			expect(store.autoApproveTimer).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves the sweeper off when disabled or when the cadence is 0", () => {
		vi.useFakeTimers();
		try {
			const disabled = makeStore();
			startScheduler(disabled, { intervalMs: 1000, disabled: true });
			expect(disabled.autoApproveTimer).toBeNull();

			const zero = makeStore();
			startScheduler(zero, { intervalMs: 1000, sweepMs: 0 });
			expect(zero.schedulerTimer).not.toBeNull();
			expect(zero.autoApproveTimer).toBeNull();
			stopScheduler(zero);
		} finally {
			vi.useRealTimers();
		}
	});

	it("ensureScheduler heals a lost sweeper timer but never starts a stopped loop", () => {
		vi.useFakeTimers();
		try {
			const store = makeStore();
			expect(ensureScheduler(store)).toBe(false);
			expect(store.autoApproveTimer).toBeNull();
			store.schedulerRunning = true;
			store.schedulerTimer = setInterval(() => {}, 100000);
			expect(ensureAutoApproveTimer(store)).toBe(true);
			clearInterval(store.autoApproveTimer);
			store.autoApproveTimer = null;
			expect(ensureScheduler(store)).toBe(false);
			expect(store.autoApproveTimer).not.toBeNull();
			stopScheduler(store);
		} finally {
			vi.useRealTimers();
		}
	});

	it("sweeps on its own cadence without disturbing dispatch", async () => {
		vi.useFakeTimers();
		try {
			const store = makeStore();
			store.seed("p-1", waitingTask({ autoApproveAt: iso(Date.now() - 1000) }));
			startScheduler(store, { intervalMs: 100000, sweepMs: 100, batch: 10 });
			await vi.advanceTimersByTimeAsync(100);
			expect(store.advanceStage).toHaveBeenCalledTimes(1);
			expect(store.executeStage).not.toHaveBeenCalled();
			expect(store.schedulerStats.autoApproveSweeps).toBe(1);
			stopScheduler(store);
			await vi.advanceTimersByTimeAsync(1000);
			expect(store.advanceStage).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("kicks the scheduler after advancing so the next stage dispatches promptly", () => {
		vi.useFakeTimers();
		try {
			const store = makeStore();
			store.schedulerRunning = true;
			store.schedulerTimer = setInterval(() => {}, 100000);
			store.seed("p-1", waitingTask({ autoApproveAt: iso(Date.now() - 1000) }));
			autoApproveSweep(store, { batch: 10, configuredLeadMs: 0 });
			expect(store._kickTimer).not.toBeNull();
			clearInterval(store.schedulerTimer);
			store.schedulerTimer = null;
			if (store._kickTimer) clearTimeout(store._kickTimer);
			store._kickTimer = null;
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("auto-approve scale (one sweeper, zero per-task timers)", () => {
	it("sweeps 1000 waits in one bounded pass with no per-task timers", () => {
		const store = makeStore({
			projects: [
				{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES },
				{ id: "p-2", name: "Q", cwd: "/other", stages: STAGES },
				{ id: "p-3", name: "R", cwd: "/third", stages: STAGES },
			],
		});
		const pids = ["p-1", "p-2", "p-3"];
		for (let i = 0; i < 1000; i++) {
			const pid = pids[i % 3];
			const kind = i % 3;
			store.seed(
				pid,
				waitingTask({
					id: `t-${i}`,
					projectId: pid,
					autoApproveAt:
						kind === 0
							? iso(NOW - (1000 - i)) // due (334)
							: kind === 1
								? iso(NOW + HOLD_MS) // not yet due
								: null, // unstamped
				}),
			);
		}
		const realSetTimeout = globalThis.setTimeout;
		const realSetInterval = globalThis.setInterval;
		let timerCalls = 0;
		globalThis.setTimeout = (...args) => {
			timerCalls += 1;
			return realSetTimeout(...args);
		};
		globalThis.setInterval = (...args) => {
			timerCalls += 1;
			return realSetInterval(...args);
		};
		try {
			const startedAt = Date.now();
			const first = autoApproveSweep(store, { now: NOW, batch: 25, configuredLeadMs: 0 });
			const wallMs = Date.now() - startedAt;
			expect(wallMs).toBeLessThan(5000);
			expect(timerCalls).toBe(0);
			expect(first.advanced).toBe(25);
			// 334 due minus 25 advanced.
			expect(first.deferred).toBe(309);
			// Oldest deadline first.
			expect(store.advanceStage.mock.calls[0][1]).toBe("t-0");

			const second = autoApproveSweep(store, { now: NOW, batch: 25, configuredLeadMs: 0 });
			expect(second.advanced).toBe(25);
			expect(second.deferred).toBe(284);
			expect(store.schedulerStats.autoApproved).toBe(50);
		} finally {
			globalThis.setTimeout = realSetTimeout;
			globalThis.setInterval = realSetInterval;
		}
	});
});
