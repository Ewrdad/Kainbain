import { describe, it, expect } from "vitest";
import { PromptCurationEngine } from "./promptCuration.js";

/**
 * MARK: promptCuration docsDirName regression tests
 * @description Custom `docsDirName` must flow into curated prompts: the
 *   report path agents are told to write and the previous-reports directory
 *   line must use the project's link-folder name, with legacy default `docs`
 *   byte-identical when no custom name is set.
 */
describe("PromptCurationEngine custom docsDirName", () => {
	it("calculateReportPath defaults to docs/ without a project", () => {
		const engine = new PromptCurationEngine();
		expect(engine.calculateReportPath("t1", "Plan", "20261007-000000")).toBe(
			"./docs/tasks/t1/plan-20261007-000000.md",
		);
	});

	it("calculateReportPath honours a custom docsDirName", () => {
		const engine = new PromptCurationEngine();
		expect(
			engine.calculateReportPath("t1", "Plan", "20261007-000000", {
				docsDirName: "kainbain-docs",
			}),
		).toBe("./kainbain-docs/tasks/t1/plan-20261007-000000.md");
	});

	it("calculateReportPath degrades garbage names to the docs default", () => {
		const engine = new PromptCurationEngine();
		expect(
			engine.calculateReportPath("t1", "Plan", "20261007-000000", {
				docsDirName: "../escape",
			}),
		).toBe("./docs/tasks/t1/plan-20261007-000000.md");
	});

	it("curatePrompt reporting path honours a custom docsDirName when the stage opts in", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P", report: true },
			{
				timestamp: "20261007-000000",
				project: { docsDirName: "kainbain-docs" },
			},
		);
		expect(prompt).toContain(
			"write a summary report to ./kainbain-docs/tasks/t1/plan-20261007-000000.md.",
		);
		expect(prompt).not.toContain("./docs/tasks/");
	});

	it("curatePrompt previous-reports line honours a custom docsDirName", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P" },
			{
				previousReports: ["./kainbain-docs/tasks/t1/idea-20261007-000000.md"],
				project: { docsDirName: "kainbain-docs" },
			},
		);
		expect(prompt).toContain(
			"The following prior stage reports are available in ./kainbain-docs/tasks/t1/:",
		);
	});

	it("curatePrompt omits # Reporting by default even without docs settings (legacy shape minus reporting)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{ id: "2", name: "Technical Elab", prompt: "Elaborate specs" },
			{ timestamp: "20260818-120000" },
		);
		expect(prompt).not.toContain("# Reporting");
	});

	it("curatePrompt renders # Reporting with the custom docs dir when the stage opts in", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{
				id: "2",
				name: "Technical Elab",
				prompt: "Elaborate specs",
				report: true,
			},
			{
				timestamp: "20260818-120000",
				project: { docsDirName: "kainbain-docs" },
			},
		);
		expect(prompt).toContain(
			"# Reporting\nAfter completing this stage, write a summary report to ./kainbain-docs/tasks/task-100/technical-elab-20260818-120000.md.",
		);
	});
});
