import { describe, it, expect } from "vitest";
import {
	DEFAULT_PROMPT_LAYOUT,
	LAYOUT_TOKENS,
	MANDATORY_LAYOUT_TOKENS,
	MAX_LAYOUT_CHARS,
	SECTION_TOKENS,
	extractLayoutTokens,
	isInlineKeyword,
	renderPromptLayout,
	validatePromptLayout,
} from "../../shared/promptLayout.js";

describe("shared/promptLayout", () => {
	it("DEFAULT_PROMPT_LAYOUT contains all section tokens in canonical order", () => {
		const extracted = extractLayoutTokens(DEFAULT_PROMPT_LAYOUT);
		expect(extracted).toEqual(SECTION_TOKENS);
	});

	it("LAYOUT_TOKENS covers mandatory, conditional, and optional tokens", () => {
		const required = LAYOUT_TOKENS.filter((t) => t.requirement === "required").map((t) => t.token);
		expect(required.sort()).toEqual([...MANDATORY_LAYOUT_TOKENS].sort());

		const conditional = LAYOUT_TOKENS.filter((t) => t.requirement === "conditional").map((t) => t.token);
		expect(conditional).toEqual(["failureDetails", "testingGuidance"]);
	});

	it("validates DEFAULT_PROMPT_LAYOUT cleanly", () => {
		const result = validatePromptLayout(DEFAULT_PROMPT_LAYOUT);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.missingMandatory).toEqual([]);
		expect(result.unknownTokens).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("rejects non-string and empty layouts", () => {
		expect(validatePromptLayout(null).ok).toBe(false);
		expect(validatePromptLayout(123).ok).toBe(false);
		expect(validatePromptLayout("").ok).toBe(false);
		expect(validatePromptLayout("   \n\t  ").ok).toBe(false);
	});

	it("rejects layouts exceeding MAX_LAYOUT_CHARS", () => {
		const oversized = "{{task}}\n{{stage}}\n{{failureGuidance}}\n" + "x".repeat(MAX_LAYOUT_CHARS + 1);
		const result = validatePromptLayout(oversized);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/the limit is 20000/);
	});

	it("rejects layouts missing any mandatory token", () => {
		// Missing failureGuidance
		const noVerdict = "# Task\n{{task}}\n\n# Stage\n{{stage}}";
		const res1 = validatePromptLayout(noVerdict);
		expect(res1.ok).toBe(false);
		expect(res1.missingMandatory).toContain("failureGuidance");
		expect(res1.errors.some((e) => e.includes("{{failureGuidance}}"))).toBe(true);

		// Missing task
		const noTask = "{{stage}}\n\n{{failureGuidance}}";
		const res2 = validatePromptLayout(noTask);
		expect(res2.ok).toBe(false);
		expect(res2.missingMandatory).toContain("task");

		// Missing stage
		const noStage = "{{task}}\n\n{{failureGuidance}}";
		const res3 = validatePromptLayout(noStage);
		expect(res3.ok).toBe(false);
		expect(res3.missingMandatory).toContain("stage");
	});

	it("rejects layouts with unknown tokens and offers closest match hints", () => {
		const typoLayout = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}\n\n{{tastImages}}";
		const res = validatePromptLayout(typoLayout);
		expect(res.ok).toBe(false);
		expect(res.unknownTokens).toContain("tastImages");
		expect(res.errors.some((e) => e.includes("did you mean {{taskImages}}?"))).toBe(true);
	});

	it("allows inline keywords and parametric latestReport:<slug>", () => {
		const custom =
			"# Task\n{{task}}\n\nProject: {{project}}\nGoal: {{taskGoal}}\n\n# Stage\n{{stage}}\n\n{{latestReport:plan}}\n\n{{failureGuidance}}";
		const res = validatePromptLayout(custom);
		expect(res.ok).toBe(true);
		expect(res.unknownTokens).toEqual([]);
	});

	it("warns when conditional tokens are omitted (not save blockers)", () => {
		const chaffCut = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		const res = validatePromptLayout(chaffCut);
		expect(res.ok).toBe(true);
		expect(res.errors).toEqual([]);
		expect(res.warnings).toHaveLength(2);
		expect(res.warnings.some((w) => w.includes("{{failureDetails}}"))).toBe(true);
		expect(res.warnings.some((w) => w.includes("{{testingGuidance}}"))).toBe(true);
	});

	it("LAYOUT_TOKENS has no duplicate token names", () => {
		const names = LAYOUT_TOKENS.map((t) => t.token);
		expect(new Set(names).size).toBe(names.length);
	});

	it("previousReports is a section token, not an inline keyword", () => {
		// The catalogue once listed previousReports twice (section + inline)
		// with identical {{previousReports}} syntax — the renderer always
		// substituted the section block, so the inline entry was dead weight.
		expect(isInlineKeyword("previousReports")).toBe(false);
		const res = validatePromptLayout("{{task}}\n\n{{stage}}\n\n{{previousReports}}\n\n{{failureGuidance}}");
		expect(res.ok).toBe(true);
	});

	it("renderPromptLayout substitutes present sections and collapses empty chunks", () => {
		const layout = "{{task}}\n\n{{skills}}\n\n{{stage}}\n\n{{failureGuidance}}";
		const rendered = renderPromptLayout(layout, {
			task: "# Task\nGoal 1",
			stage: "# Stage\nStep 1",
			failureGuidance: "# Stage Failure Guidance\nVerdict",
		});
		expect(rendered).toBe("# Task\nGoal 1\n\n# Stage\nStep 1\n\n# Stage Failure Guidance\nVerdict");
	});
});
