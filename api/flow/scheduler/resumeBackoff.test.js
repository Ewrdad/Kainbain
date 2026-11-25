import { expect, test, describe } from "vitest";
import {
	RESUME_BACKOFF_THRESHOLD,
	RESUME_BACKOFF_BASE_MS,
	RESUME_BACKOFF_MAX_MS,
	resumeBackoffMs,
} from "./resumeBackoff.js";

/***
 * MARK: resumeBackoffMs unit tests
 * @description The backoff curve itself (task 3b82f6ae): 0 below the
 *   threshold, then RESUME_BACKOFF_BASE_MS doubling per further resume,
 *   capped at RESUME_BACKOFF_MAX_MS. A streak belonging to another stage
 *   never delays, and garbage fields (missing, non-integer, null task)
 *   fail safe to 0 — a corrupt streak must never park a task.
 ***/
describe("resumeBackoffMs", () => {
	test("constants pin the survey q2 curve: 3 strikes, 30s base, 5min cap", () => {
		expect(RESUME_BACKOFF_THRESHOLD).toBe(3);
		expect(RESUME_BACKOFF_BASE_MS).toBe(30_000);
		expect(RESUME_BACKOFF_MAX_MS).toBe(300_000);
	});

	test("below the threshold there is no delay", () => {
		expect(resumeBackoffMs({}, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: 0 }, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: 1, consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: 2, consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
	});

	test("at and past the threshold the delay doubles per resume up to the cap", () => {
		const streak = (n) => ({ consecutiveResumes: n, consecutiveResumeStage: "s-1" });
		expect(resumeBackoffMs(streak(3), "s-1")).toBe(30_000);
		expect(resumeBackoffMs(streak(4), "s-1")).toBe(60_000);
		expect(resumeBackoffMs(streak(5), "s-1")).toBe(120_000);
		expect(resumeBackoffMs(streak(6), "s-1")).toBe(240_000);
		expect(resumeBackoffMs(streak(7), "s-1")).toBe(300_000);
		// The cap holds for absurd streaks (2**steps overflows to Infinity
		// eventually; Math.min must still land on the cap, never above it).
		expect(resumeBackoffMs(streak(50), "s-1")).toBe(300_000);
		expect(resumeBackoffMs(streak(1000), "s-1")).toBe(300_000);
	});

	test("a streak from another stage, or a null stage, means no delay", () => {
		const streak = { consecutiveResumes: 9, consecutiveResumeStage: "s-1" };
		expect(resumeBackoffMs(streak, "s-2")).toBe(0);
		expect(resumeBackoffMs(streak, null)).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: 9 }, "s-1")).toBe(0);
	});

	test("garbage input fails safe to 0 (never a delay, never NaN)", () => {
		expect(resumeBackoffMs(null, "s-1")).toBe(0);
		expect(resumeBackoffMs(undefined, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: "3", consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: 3.5, consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: -4, consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
		expect(resumeBackoffMs({ consecutiveResumes: NaN, consecutiveResumeStage: "s-1" }, "s-1")).toBe(0);
	});
});
