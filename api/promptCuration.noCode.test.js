import { describe, it, expect } from "vitest";
import { PromptCurationEngine, buildNoCodePromptSection } from "./promptCuration.js";

describe("buildNoCodePromptSection", () => {
	it("includes the docs directory name", () => {
		expect(buildNoCodePromptSection("k-docs")).toContain("k-docs");
	});

	it("falls back to docs for empty input", () => {
		expect(buildNoCodePromptSection("")).toContain("./docs/");
	});

	it("accepts a project carrying docsDirName", () => {
		expect(buildNoCodePromptSection({ docsDirName: "kainbain-docs" })).toContain("kainbain-docs");
	});
});

describe("PromptCurationEngine no-code stages", () => {
	it("includes a No Code section when stage.noCode is true", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P", noCode: true },
			{ project: { docsDirName: "kainbain-docs" } },
		);
		expect(prompt).toContain("# No Code (Docs-Only)");
		expect(prompt).toContain("kainbain-docs");
	});

	it("omits the section when noCode is false/absent", () => {
		const engine = new PromptCurationEngine();
		const base = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P" },
			{ project: { docsDirName: "docs" } },
		);
		const flagged = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P", noCode: false },
			{ project: { docsDirName: "docs" } },
		);
		expect(base).not.toContain("# No Code (Docs-Only)");
		expect(flagged).not.toContain("# No Code (Docs-Only)");
		expect(flagged).toBe(base);
	});

	it("auto-reinjects the guard when a custom layout omits {{noCode}}", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "t1", goal: "G" },
			{ id: "s", name: "Plan", prompt: "P", noCode: true },
			{
				project: { docsDirName: "docs" },
				promptLayout: "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}",
			},
		);
		expect(prompt).toContain("# No Code (Docs-Only)");
	});
});
