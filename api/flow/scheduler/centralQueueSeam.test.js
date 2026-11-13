// Domain: The Flow — unit tests for the central-queue seam (policy,
// overdue verdict, comparator, sort). These pin the documented ordering
// policy in docs/EngineDetails/TaskQueueing.md so both dispatch paths and
// the queue display stay in lockstep (task 16d6fbd6).
import { describe, expect, test } from "vitest";
import {
	resolveCentralQueuePolicy,
	CENTRAL_QUEUE_ORDER_OLDEST_FIRST,
	CENTRAL_QUEUE_ORDER_FURTHEST_ALONG,
	DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS,
} from "./centralQueuePolicy.js";
import { isCentralQueueCandidateOverdue } from "./isCentralQueueCandidateOverdue.js";
import { compareCentralQueueCandidates } from "./compareCentralQueueCandidates.js";
import { sortCentralQueue } from "./sortCentralQueue.js";

const cand = (over = {}) => ({
	enteredStageAt: 1_000,
	stageIndex: 0,
	totalStages: 2,
	...over,
});

describe("resolveCentralQueuePolicy", () => {
	test("defaults to oldest-first with the built-in 15 min ceiling", () => {
		const policy = resolveCentralQueuePolicy({ now: 5_000 });
		expect(policy.order).toBe(CENTRAL_QUEUE_ORDER_OLDEST_FIRST);
		expect(policy.maxWaitMs).toBe(DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS);
		expect(policy.now).toBe(5_000);
	});

	test("explicit opts override config", () => {
		const policy = resolveCentralQueuePolicy({
			order: "furthest-along",
			maxWaitMs: 0,
			now: 1,
		});
		expect(policy.order).toBe(CENTRAL_QUEUE_ORDER_FURTHEST_ALONG);
		// Legacy mode with a zero ceiling: guard fully off (exact legacy).
		expect(policy.maxWaitMs).toBe(0);
		expect(policy.now).toBe(1);
	});

	test("a positive maxWaitMs always wins", () => {
		expect(
			resolveCentralQueuePolicy({ maxWaitMs: 60_000, now: 0 }).maxWaitMs,
		).toBe(60_000);
		expect(
			resolveCentralQueuePolicy({ order: "furthest-along", maxWaitMs: 60_000 }).maxWaitMs,
		).toBe(60_000);
	});
});

describe("isCentralQueueCandidateOverdue", () => {
	test("wait past the ceiling is overdue; corrupt timestamps read as epoch", () => {
		const policy = { maxWaitMs: 1_000, now: 5_000 };
		expect(isCentralQueueCandidateOverdue(cand({ enteredStageAt: 4_500 }), policy)).toBe(
			false,
		);
		expect(isCentralQueueCandidateOverdue(cand({ enteredStageAt: 3_999 }), policy)).toBe(
			true,
		);
		expect(isCentralQueueCandidateOverdue(cand({ enteredStageAt: "junk" }), policy)).toBe(
			true,
		);
	});

	test("ceiling of 0 disables the verdict entirely", () => {
		expect(
			isCentralQueueCandidateOverdue(cand({ enteredStageAt: 0 }), {
				maxWaitMs: 0,
				now: 10_000_000,
			}),
		).toBe(false);
	});
});

describe("compareCentralQueueCandidates", () => {
	const policy = { order: "oldest-first", maxWaitMs: 10_000, now: 100_000 };

	test("overdue candidates jump ahead, oldest first", () => {
		const freshFar = cand({ enteredStageAt: 99_000, stageIndex: 5, totalStages: 6 });
		const overdueNewer = cand({ enteredStageAt: 50_000, stageIndex: 0, totalStages: 3 });
		const overdueOlder = cand({ enteredStageAt: 10_000, stageIndex: 0, totalStages: 3 });
		expect(
			compareCentralQueueCandidates(overdueNewer, freshFar, policy),
		).toBeLessThan(0);
		expect(
			compareCentralQueueCandidates(overdueOlder, overdueNewer, policy),
		).toBeLessThan(0);
	});

	test("oldest-first: oldest waiting wins regardless of stage index", () => {
		const oldEarly = cand({ enteredStageAt: 1_000, stageIndex: 0, totalStages: 3 });
		const newLate = cand({ enteredStageAt: 2_000, stageIndex: 9, totalStages: 10 });
		expect(compareCentralQueueCandidates(oldEarly, newLate, policy)).toBeLessThan(0);
	});

	test("oldest-first tiebreak: furthest along as a percentage of its own pipeline", () => {
		// Same wait age, ceiling disabled so the mode branch is reached:
		// 2/2 stages (100%) beats 9/10 (90%) even though absolute index 8 > 1.
		const noCeiling = { order: "oldest-first", maxWaitMs: 0, now: 100_000 };
		const shortDone = cand({ enteredStageAt: 1_000, stageIndex: 1, totalStages: 2 });
		const longMid = cand({ enteredStageAt: 1_000, stageIndex: 8, totalStages: 10 });
		expect(compareCentralQueueCandidates(shortDone, longMid, noCeiling)).toBeLessThan(0);
	});

	test("legacy furthest-along mode: highest absolute stage index first, then oldest", () => {
		const legacy = { order: "furthest-along", maxWaitMs: 0, now: 100_000 };
		const oldEarly = cand({ enteredStageAt: 1_000, stageIndex: 0, totalStages: 3 });
		const newLate = cand({ enteredStageAt: 2_000, stageIndex: 9, totalStages: 10 });
		expect(compareCentralQueueCandidates(newLate, oldEarly, legacy)).toBeLessThan(0);
		const sameStageOlder = cand({ enteredStageAt: 1_000, stageIndex: 1, totalStages: 2 });
		const sameStageNewer = cand({ enteredStageAt: 2_000, stageIndex: 1, totalStages: 2 });
		expect(compareCentralQueueCandidates(sameStageOlder, sameStageNewer, legacy)).toBeLessThan(0);
	});

	test("accepts ISO timestamps and stages[] instead of totalStages", () => {
		const iso = {
			order: "oldest-first",
			maxWaitMs: 0,
			now: Date.parse("2026-11-11T12:00:00.000Z"),
		};
		const a = {
			enteredStageAt: "2026-11-11T10:00:00.000Z",
			stageIndex: 1,
			stages: [{ id: "a" }, { id: "b" }],
		};
		const b = {
			enteredStageAt: "2026-11-11T11:00:00.000Z",
			stageIndex: 0,
			stages: [{ id: "c" }],
		};
		expect(compareCentralQueueCandidates(a, b, iso)).toBeLessThan(0);
	});
});

describe("sortCentralQueue", () => {
	test("returns a new array in central order and does not mutate the input", () => {
		const input = [
			cand({ id: "late-new", enteredStageAt: 9_000, stageIndex: 5, totalStages: 6 }),
			cand({ id: "old-early", enteredStageAt: 1_000, stageIndex: 0, totalStages: 3 }),
		];
		const sorted = sortCentralQueue(input, {
			order: "oldest-first",
			maxWaitMs: 0,
			now: 10_000,
		});
		expect(sorted.map((c) => c.id)).toEqual(["old-early", "late-new"]);
		expect(input[0].id).toBe("late-new");
		expect(sortCentralQueue(null)).toEqual([]);
	});
});
