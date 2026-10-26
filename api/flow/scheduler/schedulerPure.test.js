// Domain: The Flow — scheduler pure helpers (ordering math, marker reads,
// orphaned-status table) pinned without store fixtures.
import { describe, it, expect } from "vitest";
import { interruptionTimestampMs } from "./interruptionTimestampMs.js";
import { isResumedAfterInterruption } from "./isResumedAfterInterruption.js";
import { resumedTimestampMs } from "./resumedTimestampMs.js";
import { hasContinuityHold } from "./hasContinuityHold.js";
import { hasRehydrationMarkers } from "./hasRehydrationMarkers.js";
import { ORPHANED_RUNNING_STATUSES } from "./orphanedRunningStatuses.js";

describe("interruptionTimestampMs", () => {
	it("parses ISO timestamps to millis", () => {
		expect(interruptionTimestampMs({ updatedAt: "2026-09-24T10:00:00.000Z" })).toBe(1790244000000);
	});
	it("collapses corrupt and missing timestamps to the epoch, never NaN", () => {
		expect(interruptionTimestampMs({ updatedAt: "not-a-date" })).toBe(0);
		expect(interruptionTimestampMs({})).toBe(0);
		expect(interruptionTimestampMs(null)).toBe(0);
	});
});

describe("isResumedAfterInterruption", () => {
	it("detects the durable startup-recovery marker", () => {
		expect(isResumedAfterInterruption({ status: "in_stage", resumedAfterInterruption: true })).toBe(true);
		expect(isResumedAfterInterruption({ status: "in_stage" })).toBe(false);
		expect(isResumedAfterInterruption({ status: "interrupted", resumedAfterInterruption: true })).toBe(false);
	});
});

describe("resumedTimestampMs", () => {
	it("prefers the interruptedAt snapshot", () => {
		expect(
			resumedTimestampMs({
				interruptedAt: "2026-09-24T10:00:00.000Z",
				updatedAt: "2026-09-25T10:00:00.000Z",
			}),
		).toBe(1790244000000);
	});
	it("falls back to interruption ordering on corrupt snapshots", () => {
		expect(resumedTimestampMs({ interruptedAt: "junk", updatedAt: "2026-09-24T10:00:00.000Z" })).toBe(
			1790244000000,
		);
	});
});

describe("hasContinuityHold", () => {
	it("reads string and boolean holds, total on untrusted input", () => {
		expect(hasContinuityHold({ continuityHold: "attempt-1" })).toBe(true);
		expect(hasContinuityHold({ continuityHold: true })).toBe(true);
		expect(hasContinuityHold({ continuityHold: "  " })).toBe(false);
		expect(hasContinuityHold({})).toBe(false);
		expect(hasContinuityHold(null)).toBe(false);
	});
});

describe("hasRehydrationMarkers", () => {
	it("proves the in-flight attempt from durable markers", () => {
		expect(hasRehydrationMarkers({ mergeAttemptId: "merge-t-1-123" })).toBe(true);
		expect(hasRehydrationMarkers({ preMergeMainSha: "abc" })).toBe(true);
		expect(hasRehydrationMarkers({ reviewBaseline: { mergedAt: "2026-09-24T10:00:00.000Z" } })).toBe(true);
		expect(hasRehydrationMarkers({})).toBe(false);
		expect(hasRehydrationMarkers(null)).toBe(false);
	});
});

describe("ORPHANED_RUNNING_STATUSES", () => {
	it("covers every live running variant plus the legacy deploy label", () => {
		for (const status of ["running_agent", "running_ci", "running_merge", "advancing", "running_deploy"]) {
			expect(ORPHANED_RUNNING_STATUSES.has(status)).toBe(true);
		}
		expect(ORPHANED_RUNNING_STATUSES.has("in_stage")).toBe(false);
	});
});
