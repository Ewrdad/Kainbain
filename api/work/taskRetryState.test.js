import { describe, it, expect, vi } from "vitest";
import {
	TASK_RETRY_STATES,
	retryStateOf,
	isRetryingTask,
	retryProgressLabel,
	retryWaitLabel,
	clearRetryState,
	setRetryScheduled,
	isRetryStuck,
} from "../../shared/taskRetryState.js";
import {
	readRetryState,
	setRetryScheduled as storeSetRetryScheduled,
	clearRetryState as storeClearRetryState,
	armRetry,
} from "./taskRetryState.js";

// Domain: Task retry state — the shared contract behind the RETRYING badge.
// A task is only "retrying" while a retry is scheduled or running; a parked
// failed task (even one with a stale legacy autoRetrying flag) is not.

describe("The Work: shared retry-state contract", () => {
	it("retryStateOf(null) is none with zeroed counts", () => {
		expect(retryStateOf(null)).toEqual({
			state: "none",
			attempt: 0,
			maxAttempts: 0,
			nextRetryAt: null,
			hasRetryableSchedule: false,
		});
	});

	it("legacy autoRetrying maps to scheduled for runnable tasks", () => {
		const info = retryStateOf({ autoRetrying: true, status: "in_stage" });
		expect(info.state).toBe(TASK_RETRY_STATES.SCHEDULED);
		expect(info.hasRetryableSchedule).toBe(false);
	});

	it("a parked failed task with a lingering autoRetrying flag is not retrying", () => {
		const task = { status: "failed", autoRetrying: true };
		expect(retryStateOf(task).state).toBe(TASK_RETRY_STATES.EXHAUSTED);
		expect(isRetryingTask(task)).toBe(false);
	});

	it("an explicit scheduled state on a failed task converts to exhausted", () => {
		const task = { status: "failed", retryState: "scheduled", autoRetrying: true };
		expect(retryStateOf(task).state).toBe(TASK_RETRY_STATES.EXHAUSTED);
		expect(isRetryingTask(task)).toBe(false);
	});

	it("paused/interrupted/blocked tasks are never retrying", () => {
		for (const status of ["paused", "interrupted", "blocked", "completed", "done", "passed"]) {
			expect(isRetryingTask({ status, retryState: "scheduled", autoRetrying: true })).toBe(false);
		}
	});

	it("scheduled and running tasks in_stage are retrying", () => {
		expect(isRetryingTask({ status: "in_stage", retryState: "scheduled" })).toBe(true);
		expect(isRetryingTask({ status: "in_stage", retryState: "running" })).toBe(true);
		expect(isRetryingTask({ status: "in_stage", retryState: "none" })).toBe(false);
	});

	it("retryProgressLabel names scheduled, running, manual, and counts", () => {
		expect(retryProgressLabel({ status: "in_stage", retryState: "scheduled" })).toBe(
			"RETRYING (scheduled)",
		);
		expect(
			retryProgressLabel({
				status: "in_stage",
				retryState: "scheduled",
				retryAttempt: 2,
				retryMaxAttempts: 5,
			}),
		).toBe("RETRYING (scheduled) 2/5");
		expect(retryProgressLabel({ status: "in_stage", retryState: "running" })).toBe("RETRYING");
		expect(
			retryProgressLabel({ status: "in_stage", retryState: "running", lastRetrySource: "operator" }),
		).toBe("RETRYING (manual)");
		expect(retryProgressLabel({ status: "failed", retryState: "exhausted" })).toBe("");
	});

	it("retryWaitLabel counts down or degrades gracefully", () => {
		const now = Date.parse("2026-10-31T00:00:00.000Z");
		expect(retryWaitLabel({ status: "in_stage" }, now)).toBe("");
		expect(
			retryWaitLabel(
				{
					status: "in_stage",
					retryState: "scheduled",
					nextRetryAt: new Date(now + 12_000).toISOString(),
				},
				now,
			),
		).toBe("in 12s");
		expect(
			retryWaitLabel(
				{
					status: "in_stage",
					retryState: "scheduled",
					nextRetryAt: new Date(now - 1_000).toISOString(),
				},
				now,
			),
		).toBe("due now");
		expect(
			retryWaitLabel(
				{ status: "in_stage", retryState: "scheduled", nextRetryAt: "not-a-date" },
				now,
			),
		).toBe("");
	});

	it("clearRetryState clears every flag and preserves history by default", () => {
		const task = {
			status: "in_stage",
			autoRetrying: true,
			retryState: "scheduled",
			nextRetryAt: "2026-10-31T00:00:00.000Z",
			retryAttempt: 2,
			retryMaxAttempts: 5,
			failureReason: "boom",
			history: [{ action: "x" }],
		};
		clearRetryState(task);
		expect(task.autoRetrying).toBe(false);
		expect(task.retryState).toBe("none");
		expect(task.nextRetryAt).toBeNull();
		expect(task.failureReason).toBe("boom");
		expect(task.history).toHaveLength(1);
	});

	it("setRetryScheduled arms the display state", () => {
		const task = { status: "in_stage" };
		setRetryScheduled(task, {
			attempt: 2,
			maxAttempts: 5,
			nextRetryAt: "2026-10-31T00:00:00.000Z",
		});
		expect(task.retryState).toBe("scheduled");
		expect(task.autoRetrying).toBe(true);
		expect(task.retryAttempt).toBe(2);
		expect(task.retryMaxAttempts).toBe(5);
		expect(isRetryingTask(task)).toBe(true);
	});

	it("isRetryStuck only fires for long-overdue scheduled retries", () => {
		const now = Date.parse("2026-10-31T00:00:00.000Z");
		const overdue = {
			status: "in_stage",
			retryState: "scheduled",
			nextRetryAt: new Date(now - 120_000).toISOString(),
		};
		const fresh = {
			status: "in_stage",
			retryState: "scheduled",
			nextRetryAt: new Date(now - 2_000).toISOString(),
		};
		expect(isRetryStuck(overdue, now)).toBe(true);
		expect(isRetryStuck(fresh, now)).toBe(false);
		expect(isRetryStuck({ status: "in_stage", retryState: "scheduled" }, now)).toBe(false);
		expect(isRetryStuck({ status: "failed", retryState: "exhausted" }, now)).toBe(false);
	});
});

describe("The Work: store-aware retry-state helpers", () => {
	const makeStore = (task, opts = {}) => ({
		schedulerRunning: opts.schedulerRunning ?? true,
		scheduleTick: vi.fn(async () => ({})),
		getTask: vi.fn(() => task),
	});

	it("readRetryState mirrors the shared contract", () => {
		expect(readRetryState({ autoRetrying: true, status: "in_stage" }).state).toBe("scheduled");
		expect(readRetryState({ status: "failed", autoRetrying: true }).state).toBe("exhausted");
	});

	it("armRetry records the deadline and kicks the scheduler when running", () => {
		vi.useFakeTimers();
		try {
			const task = { id: "t1", status: "in_stage" };
			const store = makeStore(task, { schedulerRunning: true });
			expect(armRetry(store, task, 2000, { attempt: 1, maxAttempts: 3 })).toBe(true);
			expect(task.retryState).toBe("scheduled");
			expect(task.autoRetrying).toBe(true);
			expect(Date.parse(task.nextRetryAt)).toBeGreaterThan(Date.now() - 5000);
			expect(task.retryScheduledInStandby).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("armRetry marks standby instead of dropping the retry when the scheduler is stopped", () => {
		const task = { id: "t1", status: "in_stage" };
		const store = makeStore(task, { schedulerRunning: false });
		expect(armRetry(store, task, 2000, { attempt: 1, maxAttempts: 3 })).toBe(false);
		expect(task.retryState).toBe("scheduled");
		expect(task.autoRetrying).toBe(true);
		expect(task.nextRetryAt).not.toBeNull();
		expect(task.retryScheduledInStandby).toBe(true);
		expect(store._dueRetryIds.has("t1")).toBe(true);
	});

	it("store set/clear round-trips through getTask", () => {
		const task = { id: "t1", status: "in_stage" };
		const store = makeStore(task);
		storeSetRetryScheduled(store, "p", "t1", { attempt: 1, maxAttempts: 2 });
		expect(task.retryState).toBe("scheduled");
		storeClearRetryState(store, "p", "t1");
		expect(task.retryState).toBe("none");
		expect(task.autoRetrying).toBe(false);
		expect(task.nextRetryAt).toBeNull();
	});
});
