// Domain: The Flow — queue-empty push latch tests.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
	scheduleTick,
	stopScheduler,
	QUEUE_EMPTY_DEBOUNCE_MS,
	countHumanPendingTasks,
} from "./taskScheduler.js";

const stages = [{ id: "work", name: "Work", type: "agent" }];

const humanStages = [
	{ id: "work", name: "Work", type: "agent" },
	{ id: "review", name: "Review", type: "human" },
];

function runnableTask(id = "t1") {
	return { id, status: "in_stage", currentStageId: "work" };
}

/***
 * MARK: makeTickStore
 * @description Minimal scheduleTick store: idle engine, one project, a
 *   controllable task list, and a synchronously-recording notifyQueueEmpty
 *   stub that also captures the payload so human-pending enrichment is
 *   assertable. Queue-empty delivery is debounced (see
 *   QUEUE_EMPTY_DEBOUNCE_MS), so firing tests advance fake timers.
 ***/
function makeTickStore({ tasks = [], busy = false, stages: projectStages = stages } = {}) {
	const calls = [];
	const store = {
		schedulerStats: null,
		executionQueue: { isRunning: busy },
		engineState: { status: busy ? "running" : "idle" },
		projectStore: {
			listProjects: () => [{ id: "p1", stages: projectStages, cwd: "/tmp/kb-push-sched-test" }],
		},
		listTasks: () => tasks,
		isTaskBlocked: () => ({ blocked: false }),
		notifyQueueEmpty: (opts) => {
			calls.push({ at: Date.now(), opts });
			return Promise.resolve({ delivered: 1 });
		},
		executeStage: async () => ({ status: "passed" }),
	};
	return { store, calls };
}

afterEach(() => {
	vi.useRealTimers();
});

/***
 * MARK: scheduler queue-empty push tests
 * @description The push fires once per active→idle transition, but only after
 *   a debounce window still finds zero runnable candidates (stage handover
 *   safety). It stays silent on consecutive idle ticks and on cold boot, and
 *   re-arms when new work arrives. When only human-checkpoint work remains
 *   the push still fires (the automated runner is idle) but carries the
 *   human-pending count.
 ***/
describe("scheduler queue-empty push latch", () => {
	it("stays silent on cold boot with no work and no history", async () => {
		vi.useFakeTimers();
		const { store, calls } = makeTickStore({ tasks: [] });
		await scheduleTick(store);
		await scheduleTick(store);
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS * 2);
		expect(calls).toHaveLength(0);
	});

	it("waits out the debounce before firing when dispatched work drains", async () => {
		vi.useFakeTimers();
		const tasks = [runnableTask()];
		const { store, calls } = makeTickStore({ tasks });
		// Tick 1: candidate dispatched (active latch set).
		await scheduleTick(store, {});
		expect(store._schedulerWasActive).toBe(true);
		expect(calls).toHaveLength(0);
		// Work completes: the queue is now empty — no immediate fire.
		tasks.length = 0;
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		// The debounce expires with the queue still empty: exactly one push.
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(1);
		// Consecutive idle ticks never re-fire.
		await scheduleTick(store, {});
		await scheduleTick(store, {});
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS * 2);
		expect(calls).toHaveLength(1);
	});

	it("fires after the debounce once a busy engine goes idle", async () => {
		vi.useFakeTimers();
		const { store, calls } = makeTickStore({ tasks: [], busy: true });
		await scheduleTick(store, {});
		expect(store._schedulerWasActive).toBe(true);
		expect(calls).toHaveLength(0);
		store.executionQueue.isRunning = false;
		store.engineState.status = "idle";
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(1);
	});

	it("re-arms when new work arrives after a push", async () => {
		vi.useFakeTimers();
		const tasks = [runnableTask()];
		const { store, calls } = makeTickStore({ tasks });
		await scheduleTick(store, {});
		tasks.length = 0;
		await scheduleTick(store, {});
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(1);
		// New work arrives and runs, then drains again: second push.
		tasks.push(runnableTask("t2"));
		await scheduleTick(store, {});
		expect(calls).toHaveLength(1);
		tasks.length = 0;
		await scheduleTick(store, {});
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(2);
	});

	it("cancels the pending push when work resumes before the debounce expires", async () => {
		vi.useFakeTimers();
		const tasks = [runnableTask()];
		const { store, calls } = makeTickStore({ tasks });
		await scheduleTick(store, {});
		tasks.length = 0;
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		// Fresh runnable work arrives and dispatches: the pending push dies.
		tasks.push(runnableTask("t2"));
		await scheduleTick(store, {});
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS * 2);
		expect(calls).toHaveLength(0);
	});

	it("suppresses the pending push when a candidate appears during the window", async () => {
		vi.useFakeTimers();
		const tasks = [];
		const { store, calls } = makeTickStore({ tasks });
		store._schedulerWasActive = true; // Previous stage was running.
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		// The next stage lands before the debounce expires (no tick ran):
		// the fire-time re-check sees the candidate and stays silent.
		tasks.push(runnableTask());
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(0);
	});

	it("fires with the human-pending count when only human work remains", async () => {
		vi.useFakeTimers();
		const tasks = [{ id: "t1", status: "in_stage", currentStageId: "review" }];
		const { store, calls } = makeTickStore({ tasks, stages: humanStages });
		store._schedulerWasActive = true; // Previous agent stage was running.
		await scheduleTick(store, {});
		// The automated runner is idle (nothing dispatchable): no sync fire.
		expect(calls).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(1);
		expect(calls[0].opts).toMatchObject({ humanPendingCount: 1 });
	});

	it("does not count automated work as human-pending", async () => {
		vi.useFakeTimers();
		const tasks = [runnableTask()];
		const { store, calls } = makeTickStore({ tasks });
		await scheduleTick(store, {});
		tasks.length = 0;
		await scheduleTick(store, {});
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(1);
		expect(calls[0].opts).toMatchObject({ humanPendingCount: 0 });
	});

	it("suppresses the pending push when the engine becomes busy before timer expiry", async () => {
		vi.useFakeTimers();
		const tasks = [];
		const { store, calls } = makeTickStore({ tasks });
		store._schedulerWasActive = true;
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		// Engine becomes busy out of band
		store.engineState.status = "running";
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(0);
	});

	it("suppresses the pending push when the circuit breaker is tripped at timer expiry", async () => {
		vi.useFakeTimers();
		const tasks = [];
		const { store, calls } = makeTickStore({ tasks });
		store._schedulerWasActive = true;
		await scheduleTick(store, {});
		expect(calls).toHaveLength(0);
		// Circuit breaker trips while debouncing
		store.circuitState = { tripped: true, reason: "disk floor" };
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		expect(calls).toHaveLength(0);
	});

	it("stopScheduler clears a pending queue-empty push", async () => {
		vi.useFakeTimers();
		const tasks = [runnableTask()];
		const { store, calls } = makeTickStore({ tasks });
		await scheduleTick(store, {});
		tasks.length = 0;
		await scheduleTick(store, {});
		stopScheduler(store);
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS * 2);
		expect(calls).toHaveLength(0);
	});

	it("survives a missing seam and a throwing seam without breaking the tick", async () => {
		vi.useFakeTimers();
		const { store } = makeTickStore({ tasks: [] });
		store._schedulerWasActive = true;
		delete store.notifyQueueEmpty;
		await expect(scheduleTick(store, {})).resolves.toBeNull();
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		store._schedulerWasActive = true;
		store.notifyQueueEmpty = () => {
			throw new Error("push down");
		};
		await expect(scheduleTick(store, {})).resolves.toBeNull();
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
		store._schedulerWasActive = true;
		store.notifyQueueEmpty = async () => {
			throw new Error("push down async");
		};
		await expect(scheduleTick(store, {})).resolves.toBeNull();
		await vi.advanceTimersByTimeAsync(QUEUE_EMPTY_DEBOUNCE_MS);
	});
});

describe("countHumanPendingTasks", () => {
	it("counts waiting_human tasks", () => {
		const { store } = makeTickStore({
			tasks: [
				{ id: "t1", status: "waiting_human", currentStageId: "review" },
				runnableTask("t2"),
			],
			stages: humanStages,
		});
		expect(countHumanPendingTasks(store)).toBe(1);
	});

	it("counts in_stage tasks parked at a human checkpoint", () => {
		const { store } = makeTickStore({
			tasks: [{ id: "t1", status: "in_stage", currentStageId: "review" }],
			stages: humanStages,
		});
		expect(countHumanPendingTasks(store)).toBe(1);
	});

	it("ignores automated, done, and failed tasks", () => {
		const { store } = makeTickStore({
			tasks: [
				runnableTask("t1"),
				{ id: "t2", status: "done", currentStageId: "work" },
				{ id: "t3", status: "failed", currentStageId: "work" },
			],
		});
		expect(countHumanPendingTasks(store)).toBe(0);
	});

	it("returns 0 when the store has no projects", () => {
		expect(countHumanPendingTasks({})).toBe(0);
	});

	it("safely handles non-array projects, invalid project entries, or non-array tasks", () => {
		expect(countHumanPendingTasks({ projectStore: { listProjects: () => null } })).toBe(0);
		expect(countHumanPendingTasks({ projectStore: { listProjects: () => ["not-an-object", null] } })).toBe(0);
		expect(countHumanPendingTasks({
			projectStore: { listProjects: () => [{ id: "p1" }] },
			listTasks: () => null,
		})).toBe(0);
		expect(countHumanPendingTasks({
			projectStore: { listProjects: () => [{ id: "p1" }] },
			listTasks: () => [null, undefined, 42],
		})).toBe(0);
	});
});
