// Domain: The Flow — unit tests for the git-failure streak clear.
import { describe, it, expect } from "vitest";
import { clearGitFailureStreak } from "./clearGitFailureStreak.js";

describe("The Flow: clearGitFailureStreak", () => {
	it("clears a present streak and reports it", () => {
		const task = { gitFailureStreak: { count: 3 } };
		expect(clearGitFailureStreak(task)).toBe(true);
		expect(task).not.toHaveProperty("gitFailureStreak");
	});

	it("is a no-op without a streak", () => {
		const task = { status: "in_stage" };
		expect(clearGitFailureStreak(task)).toBe(false);
		expect(clearGitFailureStreak(undefined)).toBe(false);
		expect(clearGitFailureStreak(null)).toBe(false);
		expect(clearGitFailureStreak("task")).toBe(false);
	});
});
