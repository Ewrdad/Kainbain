import { expect, test, describe } from "vitest";
import { findResumedCandidate } from "./findResumedCandidate.js";
import { findNextCandidateTask } from "./findNextCandidateTask.js";
import { RESUMED_PRIORITY_REASON } from "../routing/tables/index.js";

const NOW = Date.parse("2026-11-23T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const STAGES = [{ id: "s-1", name: "Build", type: "agent" }];
const project = { id: "p-1", name: "P", cwd: "/repo", stages: STAGES };

/***
 * MARK: re-dispatch backoff + fresh-work priority (task 3b82f6ae)
 * @description Survey q2/q3 defaults at the candidate-selection level: the
 *   first resumes of a task+stage stay instant Rule-0; from 3 consecutive
 *   resumes the re-offer waits 30s doubling to 5min (all resume kinds, not
 *   just capacity refusals), fresh work wins meanwhile, and once the delay
 *   elapses the resumed task takes Rule 0 again. The backoff curve itself
 *   is unit-tested next to resumeBackoff.js / resumeBackoffRemainingMs.js;
 *   the fleet-scan half is tested in dispatch/scanClaimableTasks.test.js.
 ***/

function makeStore(tasks) {
	const map = new Map(tasks.map((t) => [t.id, t]));
	return {
		projectStore: {
			listProjects: () => [project],
			getProject: (id) => (id === project.id ? project : null),
		},
		listTasks: () => Array.from(map.values()),
		getTask: (pid, tid) => map.get(tid),
		isTaskBlocked: () => ({ blocked: false }),
		claimStore: { describe: () => null },
	};
}

const task = (over = {}) => ({
	id: "t-1",
	projectId: "p-1",
	status: "in_stage",
	currentStageId: "s-1",
	enteredStageAt: iso(NOW - 60_000),
	updatedAt: iso(NOW - 60_000),
	history: [],
	...over,
});

// An interrupted task that has already been resumed N times on stage s-1;
// the last resume (re-offer) happened `interruptedAgoMs` before NOW — the
// tight refusal loop shape, where the backoff counts from the last offer.
const backedOffResume = (n, interruptedAgoMs = 1_000) =>
	task({
		id: "t-resumed",
		status: "interrupted",
		consecutiveResumes: n,
		consecutiveResumeStage: "s-1",
		lastResumedAt: iso(NOW - interruptedAgoMs),
		updatedAt: iso(NOW - interruptedAgoMs),
	});

describe("findResumedCandidate backoff (task 3b82f6ae)", () => {
	test("first and second resumes keep instant Rule-0 priority", () => {
		for (const n of [1, 2]) {
			const store = makeStore([backedOffResume(n, 500)]);
			const found = findResumedCandidate(store, { now: NOW });
			expect(found?.taskId).toBe("t-resumed");
			expect(found?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
		}
	});

	test("a 3rd-resume task is skipped until 30s elapsed, 4th until 60s", () => {
		// Interrupted 1s ago with a 3-resume streak: 30s backoff, 29s remaining.
		expect(findResumedCandidate(makeStore([backedOffResume(3, 1_000)]), { now: NOW })).toBeNull();
		// 31s elapsed since the interruption: backoff served.
		const later = findResumedCandidate(makeStore([backedOffResume(3, 31_000)]), {
			now: NOW,
		});
		expect(later?.taskId).toBe("t-resumed");
		// 4-resume streak needs 60s.
		expect(findResumedCandidate(makeStore([backedOffResume(4, 59_000)]), { now: NOW })).toBeNull();
		expect(
			findResumedCandidate(makeStore([backedOffResume(4, 61_000)]), { now: NOW })?.taskId,
		).toBe("t-resumed");
	});

	test("a task without a resume streak is never delayed", () => {
		const store = makeStore([task({ id: "t-plain", status: "interrupted", updatedAt: iso(NOW - 500) })]);
		expect(findResumedCandidate(store, { now: NOW })?.taskId).toBe("t-plain");
	});

	test("ignoreBackoff returns a backed-off candidate (pending-work check only)", () => {
		const store = makeStore([backedOffResume(3, 1_000)]);
		expect(findResumedCandidate(store, { now: NOW })).toBeNull();
		const pending = findResumedCandidate(store, { now: NOW, ignoreBackoff: true });
		expect(pending?.taskId).toBe("t-resumed");
		// findNextCandidateTask threads the flag the same way.
		expect(findNextCandidateTask(store, { now: NOW, ignoreBackoff: true })?.taskId).toBe("t-resumed");
		expect(findNextCandidateTask(store, { now: NOW })).toBeNull();
	});

	test("fresh in_stage work wins over a backed-off resume (findNextCandidateTask)", () => {
		const store = makeStore([
			backedOffResume(3, 1_000), // would resume now, but 29s of backoff left
			task({ id: "t-fresh", enteredStageAt: iso(NOW - 500), updatedAt: iso(NOW - 500) }),
		]);
		const next = findNextCandidateTask(store, { now: NOW });
		expect(next?.taskId).toBe("t-fresh");
		// Once the backoff has elapsed, the resumed task takes Rule 0 again.
		const nextLater = findNextCandidateTask(
			makeStore([
				backedOffResume(3, 31_000),
				task({ id: "t-fresh", enteredStageAt: iso(NOW - 500), updatedAt: iso(NOW - 500) }),
			]),
			{ now: NOW },
		);
		expect(nextLater?.taskId).toBe("t-resumed");
		expect(nextLater?.priorityReason).toBe(RESUMED_PRIORITY_REASON);
	});

	test("a marked in_stage resume (startup recovery shape) is also held back", () => {
		const marked = task({
			id: "t-marked",
			resumedAfterInterruption: true,
			consecutiveResumes: 5,
			consecutiveResumeStage: "s-1",
			lastResumedAt: iso(NOW - 1_000),
		});
		expect(findResumedCandidate(makeStore([marked]), { now: NOW })).toBeNull();
		const later = findResumedCandidate(
			makeStore([{ ...marked, lastResumedAt: iso(NOW - 121_000) }]),
			{ now: NOW },
		);
		expect(later?.taskId).toBe("t-marked");
	});
});
