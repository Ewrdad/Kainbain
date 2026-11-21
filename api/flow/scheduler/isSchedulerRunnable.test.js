// Domain: The Flow — git-failure parking in the shared dispatch gate.
import { describe, test, expect } from "vitest";
import { isSchedulerRunnable } from "./isSchedulerRunnable.js";

const parkedStreak = (overrides = {}) => ({
	stageId: "build",
	signature: "hook-rejected|pre-commit|stage-commit|a.png",
	count: 3,
	...overrides,
});

describe("isSchedulerRunnable git-failure parking", () => {
	test("an in_stage task is runnable without a streak", () => {
		expect(isSchedulerRunnable({ status: "in_stage" }, { type: "agent" })).toBe(true);
	});

	test("a parked task is not runnable", () => {
		const task = { status: "in_stage", currentStageId: "build", gitFailureStreak: parkedStreak() };
		expect(isSchedulerRunnable(task, { type: "agent" })).toBe(false);
		expect(isSchedulerRunnable(task, { type: "ci" })).toBe(false);
	});

	test("a stale streak on another stage does not block", () => {
		const task = { status: "in_stage", currentStageId: "design", gitFailureStreak: parkedStreak() };
		expect(isSchedulerRunnable(task, { type: "agent" })).toBe(true);
	});

	test("a sub-threshold streak does not block", () => {
		const task = {
			status: "in_stage",
			currentStageId: "build",
			gitFailureStreak: parkedStreak({ count: 2 }),
		};
		expect(isSchedulerRunnable(task, { type: "agent" })).toBe(true);
	});
});
