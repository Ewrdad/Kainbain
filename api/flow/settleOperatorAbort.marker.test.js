// Domain: The Flow — regression test: parking an orphaned run for resume/retry
// consumes the startup-recovery priority marker, so an operator-aborted run
// cannot outrank fresh work on the next scheduler tick.
import { describe, it, expect, vi } from "vitest";

import { settleOperatorAbort } from "./stageFailureRouting.js";

function makeStore() {
	const maps = new Map();
	const store = {
		engineState: { status: "idle", activeTaskId: null },
		eventBridge: { emitSystemLog: vi.fn() },
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		_resolveProjectCwd: vi.fn((_pid, cwd) => cwd || "/repo"),
		_saveTaskMarkdown: vi.fn(),
	};
	return store;
}

describe("settleOperatorAbort marker handling", () => {
	it("clears the startup-recovery marker when parking an orphaned run", () => {
		const store = makeStore();
		const task = store.seed("p-1", {
			id: "t-1",
			projectId: "p-1",
			status: "running_agent",
			resumedAfterInterruption: true,
			interruptedAt: "2026-10-08T09:00:00.000Z",
			history: [],
		});
		const result = settleOperatorAbort(store, "p-1", "t-1", { id: "s-1", name: "Build" }, new Error("aborted"), {
			bridge: store.eventBridge,
			projectCwd: "/repo",
		});
		expect(result.status).toBe("in_stage");
		expect(task.resumedAfterInterruption).toBe(false);
		expect(task.interruptedAt).toBeNull();
		// The cleared marker is what reaches the persisted markdown.
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", task);
		expect(task.resumedAfterInterruption).toBe(false);
	});

	it("consumes the superseded-run marker left by an operator move", () => {
		// An agent run superseded by an operator move settles here via the
		// operator-abort classification (task 072e2cfa): the marker must not
		// survive for later runs to trip over.
		const store = makeStore();
		const task = store.seed("p-1", {
			id: "t-3",
			projectId: "p-1",
			status: "in_stage",
			currentStageId: "plan",
			supersededStageId: "deploy",
			history: [],
		});
		settleOperatorAbort(store, "p-1", "t-3", { id: "plan", name: "Plan" }, new Error("aborted"), {
			bridge: store.eventBridge,
			projectCwd: "/repo",
		});
		expect(task.status).toBe("in_stage");
		expect(task.supersededStageId).toBeUndefined();
	});

	it("leaves claimed (non-running) states untouched and still clears the marker on running states only", () => {
		const store = makeStore();
		const pausedTask = store.seed("p-1", {
			id: "t-2",
			projectId: "p-1",
			status: "interrupted",
			resumedAfterInterruption: true,
			interruptedAt: "2026-10-08T09:00:00.000Z",
			history: [],
		});
		// An interrupted task is NOT flipped by settleOperatorAbort (operator
		// owns it) — only the running_* branch clears the marker.
		settleOperatorAbort(store, "p-1", "t-2", { id: "s-1" }, new Error("aborted"), {
			bridge: store.eventBridge,
			projectCwd: "/repo",
		});
		expect(pausedTask.status).toBe("interrupted");
	});
});
