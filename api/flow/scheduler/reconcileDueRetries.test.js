import { describe, it, expect, vi } from "vitest";
import { reconcileDueRetries } from "./reconcileDueRetries.js";

// Domain: The Scheduler — startup recovery for orphaned retry arms.
// A retry scheduled while the engine was stopped must either run again
// (just-due, still in_stage) or park as failed — never render RETRYING
// forever.

const NOW = Date.parse("2026-10-31T00:00:00.000Z");

const makeStore = (tasksByProject) => ({
	_saveTaskMarkdown: vi.fn(),
	projectStore: {
		listProjects: () => Object.keys(tasksByProject).map((id) => ({ id, cwd: `/tmp/${id}` })),
	},
	listTasks: (projectId) => tasksByProject[projectId] || [],
});

describe("The Scheduler: reconcileDueRetries", () => {
	it("parks long-overdue scheduled retries as failed/exhausted", () => {
		const task = {
			id: "t1",
			status: "in_stage",
			retryState: "scheduled",
			autoRetrying: true,
			nextRetryAt: new Date(NOW - 3600_000).toISOString(),
			failureReason: "boom",
		};
		const store = makeStore({ p1: [task] });
		expect(reconcileDueRetries(store, NOW)).toEqual([{ projectId: "p1", taskId: "t1" }]);
		expect(task.status).toBe("failed");
		expect(task.retryState).toBe("exhausted");
		expect(task.autoRetrying).toBe(false);
		// The last error is preserved for the operator; the retry flag is not.
		expect(task.failureReason).toBe("boom");
		expect(task.history.at(-1).action).toMatch(/parked as failed/);
	});

	it("leaves just-due scheduled retries alone for the normal tick", () => {
		const task = {
			id: "t1",
			status: "in_stage",
			retryState: "scheduled",
			autoRetrying: true,
			nextRetryAt: new Date(NOW + 60_000).toISOString(),
		};
		const store = makeStore({ p1: [task] });
		expect(reconcileDueRetries(store, NOW)).toEqual([]);
		expect(task.status).toBe("in_stage");
		expect(task.retryState).toBe("scheduled");
	});

	it("ignores tasks that are not retrying and is idempotent", () => {
		const tasks = [
			{ id: "t1", status: "failed", retryState: "exhausted" },
			{ id: "t2", status: "in_stage" },
		];
		const store = makeStore({ p1: tasks });
		expect(reconcileDueRetries(store, NOW)).toEqual([]);
		expect(reconcileDueRetries(store, NOW)).toEqual([]);
	});

	it("one unreadable task never blocks the rest of the pass", () => {
		const good = {
			id: "t-good",
			status: "in_stage",
			retryState: "scheduled",
			nextRetryAt: new Date(NOW - 3600_000).toISOString(),
		};
		const store = makeStore({ p1: [null, good] });
		expect(reconcileDueRetries(store, NOW)).toEqual([{ projectId: "p1", taskId: "t-good" }]);
		expect(good.status).toBe("failed");
	});
});
