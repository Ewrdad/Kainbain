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
	it("really interpolates taskDocs against the backend cwd", () => {
		const project = { id: "p1", name: "P", cwd: "/repo", stages: [{ id: "s1", prompt: "Write PLAN into {{taskDocs}}" }] };
		const out = curateRunnerPrompt({ project, task: { id: "t1", goal: "Cleanup", currentStageId: "s1" }, stageId: "s1" });
		expect(out).toContain("/repo/docs/tasks/t1/");
		expect(out).not.toContain("{{taskDocs}}");
	});
});
