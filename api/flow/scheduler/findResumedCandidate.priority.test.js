import { expect, test, describe } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { findResumedCandidate } from "./findResumedCandidate.js";
import { findNextCandidateTask } from "./findNextCandidateTask.js";
import { resumeBackoffMs, RESUME_BACKOFF_THRESHOLD } from "./resumeBackoff.js";
import { resumeBackoffRemainingMs } from "./resumeBackoffRemainingMs.js";
import { isCapacityRefusalHidden, CAPACITY_REFUSAL_HIDE_MS } from "./capacityRefusalHide.js";
import { scanClaimableTasks } from "../dispatch/scanClaimableTasks.js";
import { RESUMED_PRIORITY_REASON } from "../routing/tables/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");

const NOW = Date.parse("2026-11-23T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const STAGES = [{ id: "s-1", name: "Build", type: "agent" }];
const project = { id: "p-1", name: "P", cwd: "/repo", stages: STAGES };

/***
 * MARK: re-dispatch backoff + fresh-work priority (task 3b82f6ae)
 * @description Survey q2/q3/q4 defaults: the first resumes of a task+stage
 *   stay instant Rule-0; from RESUME_BACKOFF_THRESHOLD consecutive resumes
 *   the re-offer waits 30s doubling to 5min (all resume kinds, not just
 *   capacity refusals), fresh work wins meanwhile, and the refusing runner
 *   does not see the task for ~2min on the fleet scan.
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

describe("resumeBackoffMs curve (task 3b82f6ae)", () => {
	test("below the threshold there is no delay; then 30s doubling to the 5min cap", () => {
		expect(RESUME_BACKOFF_THRESHOLD).toBe(3);
		expect(resumeBackoffMs(task({ consecutiveResumes: 0 }), "s-1")).toBe(0);
		expect(resumeBackoffMs(task({ consecutiveResumes: 2 }), "s-1")).toBe(0);
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: 3, consecutiveResumeStage: "s-1" }),
				"s-1",
			),
		).toBe(30_000);
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: 4, consecutiveResumeStage: "s-1" }),
				"s-1",
			),
		).toBe(60_000);
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: 5, consecutiveResumeStage: "s-1" }),
				"s-1",
			),
		).toBe(120_000);
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: 50, consecutiveResumeStage: "s-1" }),
				"s-1",
			),
		).toBe(300_000);
	});

	test("streak of another stage, missing fields, and garbage all mean no delay", () => {
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: 9, consecutiveResumeStage: "s-1" }),
				"s-2",
			),
		).toBe(0);
		expect(resumeBackoffMs(task(), "s-1")).toBe(0);
		expect(resumeBackoffMs(null, "s-1")).toBe(0);
		expect(
			resumeBackoffMs(
				task({ consecutiveResumes: "3", consecutiveResumeStage: "s-1" }),
				"s-1",
			),
		).toBe(0);
	});

	test("remaining delay counts down from the last offer and floors at 0", () => {
		const t = task({
			consecutiveResumes: 3,
			consecutiveResumeStage: "s-1",
			lastResumedAt: iso(NOW),
		});
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 10_000)).toBe(20_000);
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 30_000)).toBe(0);
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 999_000)).toBe(0);
		// Garbage timestamp collapses to the epoch → elapsed huge → no delay.
		const corrupt = task({
			consecutiveResumes: 3,
			consecutiveResumeStage: "s-1",
			lastResumedAt: "not-a-date",
			updatedAt: "also-not-a-date",
		});
		expect(resumeBackoffRemainingMs(corrupt, "s-1", NOW)).toBe(0);
	});
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
});

describe("scanClaimableTasks backoff + refusing-runner hide (task 3b82f6ae)", () => {
	const deps = (tasks) => ({
		projectStore: { listProjects: () => [project] },
		taskStore: {
			listTasks: () => tasks,
			isTaskBlocked: () => ({ blocked: false }),
		},
		claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
	});

	test("a backed-off in_stage task is not offered until the delay elapses", () => {
		const t = task({
			consecutiveResumes: 3,
			consecutiveResumeStage: "s-1",
			lastResumedAt: iso(NOW - 1_000),
		});
		expect(scanClaimableTasks(deps([t]), { now: NOW }).map((c) => c.taskId)).toEqual([]);
		t.lastResumedAt = iso(NOW - 31_000);
		expect(scanClaimableTasks(deps([t]), { now: NOW }).map((c) => c.taskId)).toEqual(["t-1"]);
	});

	test("a task is hidden from the refusing runner for ~2min, visible to others", () => {
		const t = task({
			lastCapacityRefusal: { runnerId: "r-full", at: iso(NOW - 1_000) },
		});
		expect(
			scanClaimableTasks(deps([t]), { now: NOW, runnerId: "r-full" }).map((c) => c.taskId),
		).toEqual([]);
		expect(
			scanClaimableTasks(deps([t]), { now: NOW, runnerId: "r-other" }).map((c) => c.taskId),
		).toEqual(["t-1"]);
		// After the hide window the refusing runner sees it again.
		expect(
			scanClaimableTasks(deps([t]), {
				now: NOW + CAPACITY_REFUSAL_HIDE_MS + 1,
				runnerId: "r-full",
			}).map((c) => c.taskId),
		).toEqual(["t-1"]);
	});

	test("isCapacityRefusalHidden: match, other runner, expiry, garbage", () => {
		const t = { lastCapacityRefusal: { runnerId: "r1", at: iso(NOW) } };
		expect(isCapacityRefusalHidden(t, "r1", NOW + 1_000)).toBe(true);
		expect(isCapacityRefusalHidden(t, "r2", NOW + 1_000)).toBe(false);
		expect(isCapacityRefusalHidden(t, "r1", NOW + CAPACITY_REFUSAL_HIDE_MS)).toBe(false);
		expect(isCapacityRefusalHidden(t, null, NOW)).toBe(false);
		expect(isCapacityRefusalHidden({}, "r1", NOW)).toBe(false);
		expect(
			isCapacityRefusalHidden(
				{ lastCapacityRefusal: { runnerId: "r1", at: "garbage" } },
				"r1",
				NOW,
			),
		).toBe(false);
	});
});
