import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	buildDirectSkillBlock,
	setInterpolatePromptKeywords,
} from "./skillInjection.js";
import { interpolatePromptKeywords } from "../promptCuration.js";
import {
	normalizeSkillKeywords,
	parseSkillConfig,
	parseSkillFrontmatter,
} from "./skillsRegistry.js";

/**
 * MARK: question-me imageGen prompt test
 * @description Loads the real `question-me` skill package and proves the
 *   `imageGen` keyword contract: the default (`none`) renders byte-identical
 *   to the pre-feature prompt (checked-in fixture — the section is removed
 *   entirely, markers included), while a provider id injects the documented
 *   image-question section with keywords substituted.
 */

setInterpolatePromptKeywords(interpolatePromptKeywords);

const SKILL_DIR = path.resolve(import.meta.dirname, "../../skills/question-me");
const FIXTURE_PATH = path.resolve(import.meta.dirname, "question-me-none.fixture.md");

const loadRealSkill = () => {
	const markdown = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
	const { config, error } = parseSkillConfig(
		fs.readFileSync(path.join(SKILL_DIR, "KB_config.json"), "utf8"),
	);
	if (error) throw new Error(error);
	const { body } = parseSkillFrontmatter(markdown);
	return {
		name: "question-me",
		body,
		config,
		keywords: normalizeSkillKeywords(config.keywords),
		description: config.description || "",
		path: path.join(SKILL_DIR, "SKILL.md"),
	};
};

const CONTEXT = {
	task: { goal: "Snapshot task", projectName: "KainBain" },
	project: { name: "KainBain" },
	stage: { id: "stage-snapshot", name: "Ask" },
};

const renderQuestionMe = (config) =>
	buildDirectSkillBlock({
		skill: loadRealSkill(),
		stageSkill: { name: "question-me", config },
		interpolationContext: CONTEXT,
	});

describe("question-me imageGen prompt", () => {
	it("declares imageGen defaulting to none with a provider-select dropdown", () => {
		const skill = loadRealSkill();
		expect(skill.keywords.imageGen).toBe("none");
		expect(skill.config.keywords.imageGen).toMatchObject({
			value: "none",
			ui: "provider-select",
			providerApi: "/settings/image-gen/providers",
		});
		expect(skill.config.keywords.imageGen.enum).toContain("none");
	});

	it("renders byte-identical to the pre-feature prompt when imageGen is none", () => {
		const fixture = fs.readFileSync(FIXTURE_PATH, "utf8").replace(/\n$/, "");
		expect(renderQuestionMe({})).toBe(fixture);
		expect(renderQuestionMe({ imageGen: "none" })).toBe(fixture);
		expect(renderQuestionMe({ imageGen: "None" })).toBe(fixture);
		expect(renderQuestionMe({})).not.toContain("{{#if");
		expect(renderQuestionMe({})).not.toContain("{{/if}}");
		expect(renderQuestionMe({})).not.toContain("Image questions");
	});

	it("injects the documented image-question section for a provider id", () => {
		const out = renderQuestionMe({ imageGen: "muse" });
		expect(out).toContain("## Image questions (generated design examples)");
		expect(out).toContain('"type": "image"');
		expect(out).toContain("configured provider (`muse`)");
		expect(out).toContain("referenced from `SURVEY.md`");
		expect(out).not.toContain("{{#if");
		expect(out).not.toContain("{{/if}}");
		expect(out).not.toContain("{{imageGen}}");
	});
});
