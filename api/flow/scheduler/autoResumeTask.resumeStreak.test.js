import { expect, test, describe, vi } from "vitest";
import { autoResumeTask } from "./autoResumeTask.js";

/***
 * MARK: autoResumeTask resume-streak tracking (task 3b82f6ae)
 * @description The durable state that drives the re-dispatch backoff:
 *   every auto-resume stamps `consecutiveResumes` / `consecutiveResumeStage`
 *   / `lastResumedAt` on the task. Same stage → streak increments; a stage
 *   change → streak restarts at 1; a corrupt (non-integer) streak fails
 *   safe to 1; a task that was never interrupted is left untouched.
 *   `lastResumedAt` is the timestamp the backoff counts down from, so it
 *   must be the post-flip `updatedAt` of the LATEST resume. Completion
 *   clears all three fields (covered in executionLedger.capInterruptLoop
 *   tests via completeExecution).
 ***/

function makeStore(task) {
	return {
		projectStore: {
			getProject: () => ({
				id: "p-1",
				cwd: "/repo",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Ship", type: "agent" },
				],
			}),
		},
		getTask: (pid, tid) => (tid === task.id ? task : null),
		_resetAutoIteration: vi.fn(),
		_recordHistory: vi.fn(),
		_recordTimeline: vi.fn(),
		_resolveProjectCwd: (pid, cwd) => cwd || "/repo",
		_saveTaskMarkdown: vi.fn(),
		eventBridge: { broadcastGlobal: vi.fn() },
	};
}

const interruptedTask = (over = {}) => ({
	id: "t-1",
	status: "interrupted",
	wasInterrupted: true,
	currentStageId: "s-1",
	updatedAt: "2026-11-23T10:00:00.000Z",
	history: [],
	...over,
});

// Simulates the refusal loop: interrupt flips the task back to
// "interrupted", then the scheduler auto-resumes it again.
const interruptAgain = (task) => {
	task.status = "interrupted";
	return task;
};

describe("autoResumeTask resume streak (task 3b82f6ae)", () => {
	test("first resume starts the streak at 1 and stamps lastResumedAt", () => {
		const task = interruptedTask();
		const store = makeStore(task);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.consecutiveResumes).toBe(1);
		expect(done.consecutiveResumeStage).toBe("s-1");
		expect(done.lastResumedAt).toBe(done.updatedAt);
		expect(done.lastResumedAt).not.toBe("2026-11-23T10:00:00.000Z"); // post-flip "now"
	});

	test("repeated resumes of the same stage increment the streak", () => {
		const task = interruptedTask();
		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		interruptAgain(task);
		const second = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(second.consecutiveResumes).toBe(2);
		expect(second.consecutiveResumeStage).toBe("s-1");
		interruptAgain(task);
		const third = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(third.consecutiveResumes).toBe(3);
		expect(third.consecutiveResumeStage).toBe("s-1");
		// lastResumedAt tracks the LATEST resume (the backoff counts from it).
		expect(third.lastResumedAt).toBe(third.updatedAt);
		expect(Date.parse(third.lastResumedAt)).toBeGreaterThanOrEqual(Date.parse(second.lastResumedAt));
	});

	test("a stage change restarts the streak at 1 on the new stage", () => {
		const task = interruptedTask();
		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		interruptAgain(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(task.consecutiveResumes).toBe(2);
		// The task moved on to stage s-2 before the next interruption.
		task.currentStageId = "s-2";
		interruptAgain(task);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.consecutiveResumes).toBe(1);
		expect(done.consecutiveResumeStage).toBe("s-2");
	});

	test("a corrupt streak fails safe to 1 instead of poisoning the backoff", () => {
		const task = interruptedTask({
			consecutiveResumes: "3", // garbage from an old/corrupt markdown
			consecutiveResumeStage: "s-1",
		});
		const store = makeStore(task);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.consecutiveResumes).toBe(1);
		expect(done.consecutiveResumeStage).toBe("s-1");
	});

	test("a task with no current stage records a null streak stage", () => {
		const task = interruptedTask({ currentStageId: undefined });
		const store = makeStore(task);
		const done = autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(done.consecutiveResumes).toBe(1);
		expect(done.consecutiveResumeStage).toBeNull();
	});

	test("non-interrupted and unknown tasks are left untouched", () => {
		const calm = { id: "t-2", status: "in_stage", currentStageId: "s-1", history: [] };
		const store = makeStore(calm);
		expect(autoResumeTask(store, "p-1", "t-2", "/repo")).toBe(calm);
		expect(calm.consecutiveResumes).toBeUndefined();
		expect(calm.lastResumedAt).toBeUndefined();
		expect(store._recordHistory).not.toHaveBeenCalled();
		expect(autoResumeTask(store, "p-1", "ghost", "/repo")).toBeNull();
	});

	test("the streak persists through the markdown save (durable across restarts)", () => {
		const task = interruptedTask();
		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", task);
		expect(task.consecutiveResumes).toBe(1);
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", task);
	});
});
