import { expect, test, describe } from "vitest";
import { resumeBackoffRemainingMs } from "./resumeBackoffRemainingMs.js";

/***
 * MARK: resumeBackoffRemainingMs unit tests
 * @description The countdown half of the re-dispatch backoff (task
 *   3b82f6ae): remaining delay = curve minus time since the reference
 *   timestamp, floored at 0 and clamped at the curve. Fail-safe rules:
 *   a garbage reference timestamp collapses to the epoch (huge elapsed →
 *   0 remaining, so a corrupt date can never park a task), a future-dated
 *   reference (clock skew) can never extend the wait past the curve, and
 *   a garbage injected clock falls back to Date.now().
 ***/
const NOW = Date.parse("2026-11-23T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const streakTask = (over = {}) => ({
	consecutiveResumes: 3,
	consecutiveResumeStage: "s-1",
	lastResumedAt: iso(NOW),
	...over,
});

describe("resumeBackoffRemainingMs", () => {
	test("no streak / other stage means dispatchable immediately", () => {
		expect(resumeBackoffRemainingMs({}, "s-1", NOW)).toBe(0);
		expect(resumeBackoffRemainingMs(streakTask(), "s-2", NOW)).toBe(0);
		expect(resumeBackoffRemainingMs(null, "s-1", NOW)).toBe(0);
	});

	test("counts down from the last resume and floors at 0", () => {
		const t = streakTask();
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 10_000)).toBe(20_000);
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 29_999)).toBe(1);
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 30_000)).toBe(0);
		expect(resumeBackoffRemainingMs(t, "s-1", NOW + 999_000)).toBe(0);
	});

	test("the reference falls back through interruptedAt/updatedAt/enteredStageAt", () => {
		const base = { consecutiveResumes: 3, consecutiveResumeStage: "s-1" };
		expect(
			resumeBackoffRemainingMs({ ...base, interruptedAt: iso(NOW), updatedAt: iso(NOW - 60_000) }, "s-1", NOW + 30_000),
		).toBe(0);
		expect(
			resumeBackoffRemainingMs({ ...base, updatedAt: iso(NOW - 10_000), enteredStageAt: iso(NOW - 60_000) }, "s-1", NOW),
		).toBe(20_000);
		expect(
			resumeBackoffRemainingMs({ ...base, enteredStageAt: iso(NOW - 5_000) }, "s-1", NOW),
		).toBe(25_000);
	});

	test("a garbage reference timestamp collapses to the epoch → no remaining delay", () => {
		const corrupt = streakTask({ lastResumedAt: "not-a-date", interruptedAt: "also-bad", updatedAt: "nope", enteredStageAt: "nah" });
		expect(resumeBackoffRemainingMs(corrupt, "s-1", NOW)).toBe(0);
	});

	test("a future-dated reference (clock skew) never extends the wait past the curve", () => {
		const skewed = streakTask({ lastResumedAt: iso(NOW + 60_000) });
		// Backoff is 30s; even though the reference is in the future, the
		// remaining delay is clamped to 30s, not 90s.
		expect(resumeBackoffRemainingMs(skewed, "s-1", NOW)).toBe(30_000);
		// At the skewed reference itself, elapsed is 0 → the full 30s remain.
		expect(resumeBackoffRemainingMs(skewed, "s-1", NOW + 60_000)).toBe(30_000);
		// 30s past the reference, the delay is fully served.
		expect(resumeBackoffRemainingMs(skewed, "s-1", NOW + 90_000)).toBe(0);
	});

	test("a garbage injected clock falls back to the wall clock (no NaN)", () => {
		const t = streakTask();
		const out = resumeBackoffRemainingMs(t, "s-1", NaN);
		expect(Number.isFinite(out)).toBe(true);
		expect(out).toBeGreaterThanOrEqual(0);
		expect(out).toBeLessThanOrEqual(30_000);
	});

	test("default clock parameter is Date.now()", () => {
		const t = streakTask({ lastResumedAt: new Date().toISOString() });
		const out = resumeBackoffRemainingMs(t, "s-1");
		expect(out).toBeLessThanOrEqual(30_000);
		expect(out).toBeGreaterThan(30_000 - 5_000); // just resumed → nearly full backoff
	});
});
