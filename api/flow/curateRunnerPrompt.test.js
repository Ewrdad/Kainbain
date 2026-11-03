import { describe, it, expect } from "vitest";
import { curateRunnerPrompt } from "./curateRunnerPrompt.js";

describe("curateRunnerPrompt", () => {
	it("curates with backend project cwd and matched stage", () => {
		const seen = [];
		const engine = { curatePrompt: (task, stage, opts) => { seen.push([task, stage, opts]); return "PROMPT"; } };
		const project = { id: "p1", name: "P", cwd: "/repo", stages: [{ id: "s1" }, { id: "s2" }] };
		const task = { id: "t1", currentStageId: "s2", reports: [{ path: "r.md" }] };
		expect(curateRunnerPrompt({ project, task, stageId: "s2", engine })).toBe("PROMPT");
		expect(seen[0][1].id).toBe("s2");
		expect(seen[0][2].projectCwd).toBe("/repo");
		expect(seen[0][2].reports).toEqual(task.reports);
	});
	it("returns empty string when curation throws or task missing", () => {
		const engine = { curatePrompt: () => { throw new Error("boom"); } };
		expect(curateRunnerPrompt({ project: {}, task: { id: "t" }, engine })).toBe("");
		expect(curateRunnerPrompt({ project: {}, task: null, engine })).toBe("");
	});
	it("ships the prior failure reason as failureDetails to the engine", () => {
		const seen = [];
		const engine = { curatePrompt: (task, stage, opts) => { seen.push(opts); return "P"; } };
		const project = { id: "p1", name: "P", cwd: "/repo", stages: [{ id: "s1" }] };
		const task = {
			id: "t1",
			currentStageId: "s1",
			failureReason: "tests failed: 2 assertions",
			lastError: {
				message: "tests failed: 2 assertions",
				stageId: "ci",
				stageName: "CI",
				stageType: "ci",
				stderr: "AssertionError: expected 1, got 2",
			},
		};
		curateRunnerPrompt({ project, task, stageId: "s1", engine });
		expect(seen[0].failureDetails).toContain("tests failed: 2 assertions");
		expect(seen[0].failureDetails).toContain('previous stage "CI"');
		expect(seen[0].failureDetails).toContain("AssertionError: expected 1, got 2");
	});
	it("passes null failureDetails when the task has no prior failure", () => {
		const seen = [];
		const engine = { curatePrompt: (task, stage, opts) => { seen.push(opts); return "P"; } };
		curateRunnerPrompt({ project: { id: "p1", stages: [{ id: "s1" }] }, task: { id: "t1", currentStageId: "s1" }, stageId: "s1", engine });
		expect(seen[0].failureDetails ?? null).toBe(null);
	});
	it("renders a Failure Details section with the real engine after a failure", () => {
		const project = { id: "p1", name: "P", cwd: "/repo", stages: [{ id: "s1", prompt: "Do work" }] };
		const task = {
			id: "t1",
			goal: "Cleanup",
			currentStageId: "s1",
			failureReason: "stage exploded",
			lastError: { message: "stage exploded", stageName: "Build", stageType: "agent", stdout: "compiling..." },
		};
		const out = curateRunnerPrompt({ project, task, stageId: "s1" });
		expect(out).toContain("# Failure Details");
		expect(out).toContain("stage exploded");
		expect(out).toContain('previous stage "Build"');
	});
	it("really interpolates taskDocs against the backend cwd", () => {
		const project = { id: "p1", name: "P", cwd: "/repo", stages: [{ id: "s1", prompt: "Write PLAN into {{taskDocs}}" }] };
		const out = curateRunnerPrompt({ project, task: { id: "t1", goal: "Cleanup", currentStageId: "s1" }, stageId: "s1" });
		expect(out).toContain("/repo/docs/tasks/t1/");
		expect(out).not.toContain("{{taskDocs}}");
	});
});
