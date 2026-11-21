// Domain: The Flow — unit tests for the git-failure streak recorder.
import { describe, it, expect } from "vitest";
import { recordGitFailureStreak } from "./recordGitFailureStreak.js";

const envelope = (overrides = {}) => ({
	kind: "hook-rejected",
	phase: "stage-commit",
	command: "git commit -m x",
	exitCode: 1,
	hookName: "pre-commit",
	files: ["a.png"],
	hookOutput: "binary-guard check FAILED",
	remedy: "Re-capture a.png",
	summary: "Commit blocked by pre-commit hook",
	...overrides,
});

describe("The Flow: recordGitFailureStreak", () => {
	it("starts a streak at 1 and bumps same-signature repeats", () => {
		const task = { currentStageId: "build", history: [] };
		const first = recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		expect(first.parked).toBe(false);
		expect(task.gitFailureStreak).toMatchObject({
			stageId: "build",
			signature: "hook-rejected|pre-commit|stage-commit|a.png",
			count: 1,
		});
		const second = recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		expect(second.parked).toBe(false);
		expect(task.gitFailureStreak.count).toBe(2);
	});

	it("parks at the third strike with one history line", () => {
		const task = { currentStageId: "build", history: [] };
		recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		const third = recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		expect(third.parked).toBe(true);
		expect(task.gitFailureStreak.count).toBe(3);
		const parkLines = task.history.filter((entry) =>
			String(entry.action).includes("auto-dispatch paused"),
		);
		expect(parkLines).toHaveLength(1);
		expect(parkLines[0].action).toContain("3 consecutive");
		// A fourth strike stays parked without a second line.
		const fourth = recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		expect(fourth.parked).toBe(true);
		expect(
			task.history.filter((entry) => String(entry.action).includes("auto-dispatch paused")),
		).toHaveLength(1);
	});

	it("restarts the streak when the signature changes", () => {
		const task = { currentStageId: "build", history: [] };
		recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope() });
		const changed = recordGitFailureStreak({
			task,
			stageId: "build",
			gitFailure: envelope({ files: ["b.png"] }),
		});
		expect(changed.parked).toBe(false);
		expect(task.gitFailureStreak).toMatchObject({ count: 1 });
		expect(task.gitFailureStreak.signature).toContain("b.png");
	});

	it("clears on passes, plain failures, and reserved kinds", () => {
		const task = {
			currentStageId: "build",
			history: [],
			gitFailureStreak: { stageId: "build", signature: "s", count: 2 },
		};
		expect(recordGitFailureStreak({ task, stageId: "build", gitFailure: null }).streak).toBeNull();
		expect(task).not.toHaveProperty("gitFailureStreak");

		task.gitFailureStreak = { stageId: "build", signature: "s", count: 2 };
		recordGitFailureStreak({ task, stageId: "build", gitFailure: undefined });
		expect(task).not.toHaveProperty("gitFailureStreak");

		// Reserved push/auth kinds may be transient: never a parking strike.
		task.gitFailureStreak = { stageId: "build", signature: "s", count: 2 };
		recordGitFailureStreak({ task, stageId: "build", gitFailure: envelope({ kind: "push-failed" }) });
		expect(task).not.toHaveProperty("gitFailureStreak");
	});

	it("falls back to the task's current stage and never throws", () => {
		const task = { currentStageId: "build", history: [] };
		recordGitFailureStreak({ task, gitFailure: envelope() });
		expect(task.gitFailureStreak.stageId).toBe("build");
		expect(recordGitFailureStreak({}).streak).toBeNull();
		expect(recordGitFailureStreak().streak).toBeNull();
		expect(recordGitFailureStreak({ task: null, gitFailure: envelope() }).streak).toBeNull();
	});
});
