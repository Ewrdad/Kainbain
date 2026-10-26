// Domain: The Flow — a never-settling run can never park the scheduler.
// Regression cover for the 2026-10-21 incident: one dispatch never settled,
// the ExecutionQueue latch stayed parked, the engine read idle, and every
// scheduler tick exited `skipped-busy` for 70+ minutes with nothing ever
// detecting or recovering it.
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { ExecutionQueue } from "./executionQueue.js";
import {
	describeQueueWedge,
	resolveIdleWedge,
	resolveRunningWedge,
	scheduleTick,
} from "./taskScheduler.js";
import {
	resolveWedgeStuckMs,
	resolveWedgeOccupant,
	recoverWedgedQueueEntry,
} from "./stageHeartbeat.js";

const STAGES = [{ id: "s1", name: "Work", type: "agent" }];
// Agent stall budget is 10 min in default config: older than this with no
// fresh heartbeat counts as wedged; younger counts as starting/healthy.
const OLD_MS = 11 * 60 * 1000;

afterEach(() => {
	vi.useRealTimers();
});

function mockQueue({ taskId = "t1", projectId = "p1", ageMs = 0 } = {}) {
	const settled = [];
	const queue = {
		isRunning: true,
		activeEntry: taskId == null ? null : { taskId, projectId },
		activeAgeMs: ageMs,
		settleActive(err) {
			settled.push(err);
			this.isRunning = false;
			this.activeEntry = null;
			this.activeAgeMs = 0;
			return true;
		},
		settled,
	};
	return queue;
}

function mockWedgeStore({ queue, engine, hbAge = null, taskId = "t1" } = {}) {
	const task = {
		id: taskId,
		projectId: "p1",
		status: "in_stage",
		currentStageId: "s1",
		history: [],
		timeline: [],
	};
	const project = { id: "p1", name: "P1", cwd: "/tmp/kb-wedge-test", stages: STAGES };
	const transientCalls = [];
	const pushCalls = [];
	const store = {
		schedulerStats: {
			ticks: 0,
			dispatched: 0,
			idleNoCandidate: 0,
			skippedBusy: 0,
			skippedBusyWhileIdle: 0,
			stallRecoveries: 0,
			lastOutcome: null,
		},
		executionQueue: queue,
		engineState: { status: "idle", activeTaskId: null, ...engine },
		stageHeartbeats: new Map(),
		projectStore: {
			getProject: (pid) => (pid === "p1" ? project : null),
			listProjects: () => [project],
		},
		getTask: (pid, tid) => (pid === "p1" && tid === taskId ? task : null),
		setEngineState(updates) {
			Object.assign(this.engineState, updates);
			return this.engineState;
		},
		_resolveProjectCwd: () => null,
		_saveTaskMarkdown: () => {},
		_recordHistory: (t, action, ts) => {
			t.history.push({ timestamp: ts, action });
		},
		killTaskProcess: () => false,
		handleTransientFailure: (...args) => {
			transientCalls.push(args);
			return { task, stageType: "agent", status: "retrying" };
		},
		notifySchedulerStall: async (detail) => {
			pushCalls.push(detail);
			return { delivered: 1 };
		},
		eventBridge: {},
		_task: task,
		_transientCalls: transientCalls,
		_pushCalls: pushCalls,
	};
	if (hbAge != null) {
		store.stageHeartbeats.set(String(taskId), {
			lastBeatAt: Date.now() - hbAge,
			stageId: "s1",
			kind: "agent",
		});
	}
	return store;
}

describe("describeQueueWedge", () => {
	it("returns null when the queue is idle or the engine state is unremarkable", () => {
		expect(describeQueueWedge({ executionQueue: { isRunning: false } })).toBeNull();
		expect(describeQueueWedge({})).toBeNull();
		expect(describeQueueWedge(null)).toBeNull();
	});

	it("classifies a young idle-latched entry as starting: count distinctly, touch nothing", () => {
		const store = mockWedgeStore({ queue: mockQueue({ ageMs: 1000 }) });
		expect(describeQueueWedge(store)).toMatchObject({ kind: "idle-starting", ageMs: 1000 });
	});

	it("classifies an old idle-latched entry with no heartbeat as stuck", () => {
		const store = mockWedgeStore({ queue: mockQueue({ ageMs: OLD_MS }) });
		const wedge = describeQueueWedge(store);
		expect(wedge).toMatchObject({ kind: "idle-stuck", taskId: "t1", projectId: "p1" });
		expect(wedge.stage?.id).toBe("s1");
		expect(wedge.stuckMs).toBeGreaterThan(0);
	});

	it("classifies an old idle-latched entry with a fresh heartbeat as reconcilable, never stuck", () => {
		const store = mockWedgeStore({ queue: mockQueue({ ageMs: OLD_MS }), hbAge: 1000 });
		expect(describeQueueWedge(store)).toMatchObject({ kind: "idle-reconcilable" });
	});

	it("classifies a stale heartbeat as dead, not fresh", () => {
		const store = mockWedgeStore({ queue: mockQueue({ ageMs: OLD_MS }), hbAge: OLD_MS });
		expect(describeQueueWedge(store)).toMatchObject({ kind: "idle-stuck" });
	});

	it("leaves a merely long running entry alone while its heartbeat is fresh", () => {
		const store = mockWedgeStore({
			queue: mockQueue({ ageMs: OLD_MS }),
			engine: { status: "running", activeTaskId: "t1" },
			hbAge: 1000,
		});
		expect(describeQueueWedge(store)).toBeNull();
	});

	it("classifies an old running entry with no heartbeat as running-stuck", () => {
		const store = mockWedgeStore({
			queue: mockQueue({ ageMs: OLD_MS }),
			engine: { status: "running", activeTaskId: "t1" },
		});
		expect(describeQueueWedge(store)).toMatchObject({ kind: "running-stuck", taskId: "t1" });
	});

	it("leaves a young running entry alone", () => {
		const store = mockWedgeStore({
			queue: mockQueue({ ageMs: 1000 }),
			engine: { status: "running", activeTaskId: "t1" },
		});
		expect(describeQueueWedge(store)).toBeNull();
	});

	it("keeps paused/checkpoint engine states on the plain skipped-busy path", () => {
		const store = mockWedgeStore({
			queue: mockQueue({ ageMs: OLD_MS }),
			engine: { status: "paused", activeTaskId: "t1" },
		});
		expect(describeQueueWedge(store)).toBeNull();
	});
});

describe("resolveIdleWedge", () => {
	it("settles a stuck entry, routes it, and reports a distinct outcome", () => {
		const queue = mockQueue({ ageMs: OLD_MS });
		const store = mockWedgeStore({ queue });
		resolveIdleWedge(store, store.schedulerStats);
		expect(queue.settled).toHaveLength(1);
		expect(store._transientCalls).toHaveLength(1);
		expect(store.schedulerStats.lastOutcome).toBe("stall-recovered-wedged-entry");
		expect(store.schedulerStats.stallRecoveries).toBe(1);
		expect(store._pushCalls).toHaveLength(1);
		expect(store._pushCalls[0]).toMatchObject({ taskId: "t1", reason: "engine-idle" });
	});

	it("pages at most once per episode no matter how many ticks see the wedge", () => {
		const queue = mockQueue({ ageMs: OLD_MS });
		const store = mockWedgeStore({ queue });
		// First tick rescues (queue drains in the mock, like the real one).
		resolveIdleWedge(store, store.schedulerStats);
		expect(store._pushCalls).toHaveLength(1);
		// A racing second rescue attempt for the same episode stays silent.
		store.executionQueue = mockQueue({ ageMs: OLD_MS });
		resolveIdleWedge(store, store.schedulerStats);
		expect(store.schedulerStats.lastOutcome).toBe("stall-recovered-wedged-entry");
		expect(store._pushCalls).toHaveLength(1);
	});

	it("re-attaches the engine owner for a live entry instead of settling it", () => {
		const queue = mockQueue({ ageMs: OLD_MS });
		const store = mockWedgeStore({ queue, hbAge: 1000 });
		resolveIdleWedge(store, store.schedulerStats);
		expect(queue.settled).toHaveLength(0);
		expect(store._transientCalls).toHaveLength(0);
		expect(store._pushCalls).toHaveLength(0);
		expect(store.engineState).toMatchObject({ status: "running", activeTaskId: "t1" });
		expect(store.schedulerStats.lastOutcome).toBe("reconciled-running-owner");
	});

	it("counts a young entry distinctly without touching the queue", () => {
		const queue = mockQueue({ ageMs: 1000 });
		const store = mockWedgeStore({ queue });
		resolveIdleWedge(store, store.schedulerStats);
		expect(queue.settled).toHaveLength(0);
		expect(store.schedulerStats.lastOutcome).toBe("skipped-busy-while-idle");
	});
});

describe("resolveRunningWedge", () => {
	it("rescues an old heartbeat-silent running entry and reports it", () => {
		const queue = mockQueue({ ageMs: OLD_MS });
		const store = mockWedgeStore({
			queue,
			engine: { status: "running", activeTaskId: "t1" },
		});
		expect(resolveRunningWedge(store, store.schedulerStats)).toBe(true);
		expect(queue.settled).toHaveLength(1);
		expect(store.schedulerStats.lastOutcome).toBe("stall-recovered-wedged-entry");
		expect(store.schedulerStats.stallRecoveries).toBe(1);
	});

	it("returns false for a live running entry", () => {
		const queue = mockQueue({ ageMs: OLD_MS });
		const store = mockWedgeStore({
			queue,
			engine: { status: "running", activeTaskId: "t1" },
			hbAge: 1000,
		});
		expect(resolveRunningWedge(store, store.schedulerStats)).toBe(false);
		expect(queue.settled).toHaveLength(0);
	});
});

describe("resolveWedgeStuckMs / resolveWedgeOccupant", () => {
	it("prefers the occupant stage threshold, falls back to the queue budget, honors 0 as off", () => {
		expect(resolveWedgeStuckMs({}, { type: "agent" })).toBe(600000);
		expect(resolveWedgeStuckMs({}, { type: "merge" })).toBe(900000);
		expect(resolveWedgeStuckMs({}, null)).toBe(900000);
		expect(resolveWedgeStuckMs({}, { type: "agent" }, { queueEntryTimeoutMs: 1000 })).toBe(600000);
		expect(resolveWedgeStuckMs({}, null, { queueEntryTimeoutMs: 1000 })).toBe(1000);
		expect(resolveWedgeStuckMs({}, { type: "human" }, { queueEntryTimeoutMs: 0 })).toBe(0);
	});

	it("resolves nothing instead of throwing on a half-torn store", () => {
		expect(resolveWedgeOccupant(null, "p1", "t1")).toEqual({ project: null, task: null, stage: null });
		expect(resolveWedgeOccupant({}, "p1", "t1")).toEqual({ project: null, task: null, stage: null });
		expect(resolveWedgeOccupant({ projectStore: null }, "p1", "t1")).toEqual({
			project: null,
			task: null,
			stage: null,
		});
	});

	it("falls back to scanning projects when the entry tag is stale", () => {
		const store = mockWedgeStore({ queue: mockQueue() });
		const occupant = resolveWedgeOccupant(store, "deleted-project", "t1");
		expect(occupant.task?.id).toBe("t1");
		expect(occupant.project?.id).toBe("p1");
		expect(occupant.stage?.id).toBe("s1");
	});
});

describe("recoverWedgedQueueEntry", () => {
	it("never throws and settles even when the occupant is unresolvable", () => {
		const queue = mockQueue({ taskId: "ghost", ageMs: OLD_MS });
		const store = mockWedgeStore({ queue });
		store.getTask = () => null;
		store.projectStore = { getProject: () => null, listProjects: () => [] };
		expect(recoverWedgedQueueEntry(store, { reason: "engine-idle" })).toBeNull();
		expect(queue.settled).toHaveLength(1);
		// The task id is known, so the operator is still paged once.
		expect(store._pushCalls).toHaveLength(1);
		expect(store._pushCalls[0]).toMatchObject({ taskId: "ghost" });
	});

	it("stays silent when nothing identifies the occupant", () => {
		const queue = mockQueue({ taskId: null, ageMs: OLD_MS });
		const store = mockWedgeStore({ queue });
		expect(recoverWedgedQueueEntry(store, { reason: "engine-idle" })).toBeNull();
		expect(store._pushCalls).toHaveLength(0);
	});
});

describe("scheduleTick wedge wiring", () => {
	function tickStore({ queue } = {}) {
		const task = {
			id: "t1",
			projectId: "p1",
			status: "in_stage",
			currentStageId: "s1",
			history: [],
			timeline: [],
		};
		const project = { id: "p1", name: "P1", cwd: "/tmp/kb-wedge-tick", stages: STAGES };
		return {
			schedulerStats: null,
			executionQueue: queue,
			engineState: { status: "idle", activeTaskId: null },
			projectStore: {
				listProjects: () => [project],
				getProject: () => project,
			},
			listTasks: () => [],
			getTask: () => task,
			isTaskBlocked: () => ({ blocked: false }),
			setEngineState(updates) {
				Object.assign(this.engineState, updates);
				return this.engineState;
			},
			_resolveProjectCwd: () => null,
			_saveTaskMarkdown: () => {},
			_recordHistory: () => {},
			killTaskProcess: () => false,
			handleTransientFailure: () => ({ task, status: "retrying" }),
			notifySchedulerStall: async () => ({ delivered: 1 }),
			eventBridge: {},
			executeStage: async () => ({ status: "passed" }),
		};
	}

	it("counts a young wedged tick distinctly and never settles the live entry", async () => {
		const queue = new ExecutionQueue();
		// A hung run that just started: young entry, engine idle (mid-dispatch window).
		const hung = queue.enqueue(() => new Promise(() => {}), { taskId: "t1", projectId: "p1" });
		hung.catch(() => {});
		const store = tickStore({ queue });
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats).toMatchObject({
			ticks: 1,
			skippedBusy: 0,
			skippedBusyWhileIdle: 1,
			lastOutcome: "skipped-busy-while-idle",
		});
		expect(queue.isRunning).toBe(true);
		queue.settleActive(new Error("test teardown"));
	});

	it("rescues an aged wedged entry and unparks the queue for the next dispatch", async () => {
		const queue = new ExecutionQueue();
		const hung = queue.enqueue(() => new Promise(() => {}), { taskId: "t1", projectId: "p1" });
		hung.catch(() => {});
		// Age the entry past every stuck budget without waiting for it.
		queue._activeStartedAt = Date.now() - OLD_MS;
		const store = tickStore({ queue });
		await expect(scheduleTick(store)).resolves.toBeNull();
		expect(store.schedulerStats).toMatchObject({
			ticks: 1,
			skippedBusy: 0,
			skippedBusyWhileIdle: 1,
			stallRecoveries: 1,
			lastOutcome: "stall-recovered-wedged-entry",
		});
		expect(queue.isRunning).toBe(false);
	});
});
