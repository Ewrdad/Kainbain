import { expect, test, describe } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { findNextCandidateTask } from "../taskScheduler.js";
import { isSchedulerRunnable } from "./isSchedulerRunnable.js";

/***
 * MARK: No-double-dispatch tests
 * @description A Runner-held lease owns the task out-of-process (D1): the
 *   scheduler must not surface it as an embedded-dispatch candidate while
 *   the hold is live, and must surface it again once the lease lapses.
 ***/
describe("no double dispatch onto Runner-held tasks", () => {
	const project = {
		id: "p1",
		name: "P",
		cwd: "/tmp",
		stages: [{ id: "s1", name: "Stage", type: "agent" }],
	};
	const task = {
		id: "t1",
		status: "in_stage",
		currentStageId: "s1",
		updatedAt: new Date().toISOString(),
	};

	function fakeStore(claimStore) {
		return {
			circuitState: { tripped: false },
			projectStore: {
				listProjects: () => [project],
				getProject: () => project,
			},
			listTasks: () => [task],
			getTask: () => task,
			isTaskBlocked: () => ({ blocked: false }),
			claimStore,
			lastCompletedTask: null,
		};
	}

	test("isSchedulerRunnable rejects claimed tasks", () => {
		expect(
			isSchedulerRunnable({ status: "in_stage" }, { type: "agent" }, { claimed: true }),
		).toBe(false);
		expect(
			isSchedulerRunnable({ status: "in_stage" }, { type: "agent" }, { claimed: false }),
		).toBe(true);
	});

	test("findNextCandidateTask skips a live hold and resumes after expiry", () => {
		const claimStore = new ClaimStore({ ttlMs: 60000, now: (() => { let t = 1_000_000; return () => t; })() });
		const store = fakeStore(claimStore);
		expect(findNextCandidateTask(store)?.taskId).toBe("t1");
		claimStore.claim("t1", "runner-a");
		expect(findNextCandidateTask(store)).toBeNull();
		claimStore.invalidate("t1");
		expect(findNextCandidateTask(store)?.taskId).toBe("t1");
	});
});
