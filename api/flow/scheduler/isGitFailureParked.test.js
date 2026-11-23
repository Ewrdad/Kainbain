// Domain: The Flow — unit tests for git-failure parking.
import { describe, it, expect } from "vitest";
import { isGitFailureParked } from "./isGitFailureParked.js";

const streak = (overrides = {}) => ({
	stageId: "build",
	signature: "hook-rejected|pre-commit|stage-commit|a.png",
	count: 3,
	updatedAt: "2026-11-21T06:00:00.000Z",
	...overrides,
});

describe("The Flow: isGitFailureParked", () => {
	it("parks at three strikes on the current stage", () => {
		expect(isGitFailureParked({ currentStageId: "build", gitFailureStreak: streak() })).toBe(true);
		expect(
			isGitFailureParked({ currentStageId: "build", gitFailureStreak: streak({ count: 9 }) }),
		).toBe(true);
	});

	it("does not park below the threshold", () => {
		expect(
			isGitFailureParked({ currentStageId: "build", gitFailureStreak: streak({ count: 2 }) }),
		).toBe(false);
		expect(
			isGitFailureParked({ currentStageId: "build", gitFailureStreak: streak({ count: 1 }) }),
		).toBe(false);
	});

	it("unparks when the task left the streak's stage", () => {
		// The failback walk and operator moves change the stage: a streak
		// naming another stage never blocks the current one.
		expect(
			isGitFailureParked({ currentStageId: "design", gitFailureStreak: streak() }),
		).toBe(false);
	});

	it("degrades on absent or malformed streaks", () => {
		for (const task of [
			undefined,
			null,
			"build",
			{},
			{ currentStageId: "build" },
			{ currentStageId: "build", gitFailureStreak: null },
			{ currentStageId: "build", gitFailureStreak: "parked" },
			{ currentStageId: "build", gitFailureStreak: [] },
			{ currentStageId: "build", gitFailureStreak: streak({ count: 0 }) },
			{ currentStageId: "build", gitFailureStreak: streak({ count: 2.5 }) },
			{ currentStageId: "build", gitFailureStreak: streak({ stageId: "" }) },
			{ currentStageId: "build", gitFailureStreak: streak({ signature: "" }) },
			{ currentStageId: "build", gitFailureStreak: streak({ count: 3, stageId: 42 }) },
		]) {
			expect(isGitFailureParked(task)).toBe(false);
		}
	});
});
