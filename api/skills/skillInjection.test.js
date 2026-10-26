import { describe, it, expect, beforeEach } from "vitest";
import {
	buildSkillsPromptSections,
	buildDirectSkillBlock,
	buildOptionManifestEntry,
	resolveSkillKeywordMap,
	resolveSkillMode,
	applySkillKeywords,
	estimateSkillInjectionChars,
	setInterpolatePromptKeywords,
} from "./skillInjection.js";
import { interpolatePromptKeywords } from "../promptCuration.js";

/**
 * MARK: skillInjection unit tests
 * @description Verifies the pure prompt-section builder: direct vs option modes,
 *   keyword layering (stage config > KB_config > built-ins), unknown {{...}}
 *   preservation, and the size cap with visible omission markers.
 */

// Wire the keyword engine (same seam promptCuration.js wires at import time).
setInterpolatePromptKeywords(interpolatePromptKeywords);

function makeSkill(overrides = {}) {
	return {
		name: "demo-skill",
		description: "Demo skill description",
		source: "global",
		path: "/skills/demo-skill/SKILL.md",
		body: "# Demo\nDo the demo things for {{project}} at {{targetStage}}.",
		config: {},
		keywords: {},
		invalid: false,
		...overrides,
	};
}

describe("resolveSkillMode", () => {
	it("explicit stage mode wins", () => {
		expect(resolveSkillMode({ mode: "option" }, { defaults: { mode: "direct" } })).toBe(
			"option",
		);
	});
	it("KB_config defaults.mode is next", () => {
		expect(resolveSkillMode({}, { defaults: { mode: "option" } })).toBe("option");
	});
	it("falls back to direct", () => {
		expect(resolveSkillMode({}, {})).toBe("direct");
		expect(resolveSkillMode({ mode: "weird" }, {})).toBe("direct");
	});
});

describe("resolveSkillKeywordMap (layering)", () => {
	it("stage config overrides KB_config keywords", () => {
		const map = resolveSkillKeywordMap(
			{ targetStage: "KB Default", kbApiBase: "http://kb" },
			{ targetStage: "Intake" },
		);
		expect(map.targetStage).toBe("Intake");
		expect(map.kbApiBase).toBe("http://kb");
	});

	it("coerces scalar values and ignores bad sources", () => {
		expect(resolveSkillKeywordMap({ n: 5 }, { flag: true, b: { obj: true }, arr: [] })).toEqual({
			n: "5",
			flag: "true",
		});
		expect(resolveSkillKeywordMap(null, null)).toEqual({});
	});
});

describe("applySkillKeywords", () => {
	const ctx = {
		task: { goal: "G" },
		project: { name: "KainBain" },
	};

	it("custom keys win over built-ins of the same name", () => {
		const out = applySkillKeywords("{{project}}", { project: "Overridden" }, ctx);
		expect(out).toBe("Overridden");
	});

	it("custom values may reference built-ins like {{project}}", () => {
		const out = applySkillKeywords(
			"Target: {{targetProject}}",
			{ targetProject: "{{project}}" },
			ctx,
		);
		expect(out).toBe("Target: KainBain");
	});

	it("unknown {{...}} patterns are preserved", () => {
		const out = applySkillKeywords("keep {{mystery}} intact", { a: "1" }, ctx);
		expect(out).toBe("keep {{mystery}} intact");
	});
});

describe("buildDirectSkillBlock", () => {
	it("prepends KB_config context and resolves keywords", () => {
		const block = buildDirectSkillBlock({
			skill: makeSkill({
				config: { context: "Extra context about {{project}}." },
				keywords: { targetStage: "Audit" },
			}),
			stageSkill: { name: "demo-skill" },
			interpolationContext: { project: { name: "KainBain" } },
		});
		expect(block).toContain("## demo-skill");
		expect(block).toContain("Extra context about KainBain.");
		expect(block).toContain("Do the demo things for KainBain at Audit.");
	});

	it("stage config overrides KB_config keywords inside the body", () => {
		const block = buildDirectSkillBlock({
			skill: makeSkill({ keywords: { targetStage: "KB Default" } }),
			stageSkill: { name: "demo-skill", config: { targetStage: "Intake" } },
			interpolationContext: { project: { name: "KainBain" } },
		});
		expect(block).toContain("at Intake.");
		expect(block).not.toContain("KB Default");
	});
});

describe("buildOptionManifestEntry", () => {
	it("contains name, description, and the absolute file path — never the body", () => {
		const entry = buildOptionManifestEntry({
			skill: makeSkill({ path: "/skills/demo-skill/SKILL.md" }),
		});
		expect(entry).toContain("### demo-skill");
		expect(entry).toContain("Demo skill description");
		expect(entry).toContain("/skills/demo-skill/SKILL.md");
		expect(entry).toContain("Read this file with your file tools");
		expect(entry).not.toContain("Do the demo things");
	});
});

describe("buildSkillsPromptSections", () => {
	const interpolationContext = { project: { name: "KainBain" } };

	it("returns empty sections when skills are absent or empty (legacy no-op)", () => {
		for (const skills of [undefined, [], null]) {
			const result = buildSkillsPromptSections({
				skills,
				interpolationContext,
				loadSkill: () => makeSkill(),
			});
			expect(result.sections).toEqual([]);
			expect(result.injected).toEqual([]);
			expect(result.omitted).toEqual([]);
		}
	});

	it("builds a # Stage Skills section for direct skills", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "demo-skill" }],
			interpolationContext,
			loadSkill: () =>
				makeSkill({ keywords: { targetStage: "Intake" } }),
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toContain("# Stage Skills");
		expect(result.sections[0]).toContain("## demo-skill");
		expect(result.sections[0]).toContain("for KainBain at Intake");
		expect(result.injected).toEqual([
			{ name: "demo-skill", mode: "direct", chars: expect.any(Number) },
		]);
	});

	it("builds an # Available Skills manifest for option skills without the body", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "demo-skill", mode: "option" }],
			interpolationContext,
			loadSkill: () => makeSkill(),
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toContain("# Available Skills");
		expect(result.sections[0]).toContain("### demo-skill");
		expect(result.sections[0]).toContain("SKILL.md");
		expect(result.sections[0]).not.toContain("Do the demo things");
		expect(result.injected[0].mode).toBe("option");
	});

	// Characterization test: pins the EXACT rendering of the canonical
	// creating-new-tickets attachment shape (targetProject built-in + canonical
	// workflow/stage ids) on the unmodified injection engine. The dropdown
	// feature stores exactly these canonical id values in stage.skills[i].config.
	it("renders a creating-new-tickets-shaped attachment exactly (characterization)", () => {
		const skill = makeSkill({
			name: "creating-new-tickets",
			description: "Create follow-on KainBain tasks (tickets) into a chosen project/pipeline/stage via the KainBain API.",
			body: "**Resolved targets for this run:**\n\n- Target project: `{{targetProject}}`\n- Target workflow: `{{targetWorkflow}}`\n- Target stage: `{{targetStage}}`\n\nCreate the tickets now.",
			config: {
				context: "You may create follow-on KainBain tasks for verified findings using the KainBain API.",
				keywords: {
					kbApiBase: { value: "http://localhost:3100", description: "API base" },
					targetProject: { value: "{{project}}", description: "p", kbRef: "project" },
					targetWorkflow: { value: "wf-default", description: "w", kbRef: "workflow" },
					targetStage: { value: "Idea", description: "s", kbRef: "stage" },
				},
			},
			keywords: {
				kbApiBase: "http://localhost:3100",
				targetProject: "{{project}}",
				targetWorkflow: "wf-default",
				targetStage: "Idea",
			},
		});
		const result = buildSkillsPromptSections({
			skills: [
				{
					name: "creating-new-tickets",
					mode: "direct",
					config: {
						targetProject: "{{project}}",
						targetWorkflow: "wf-default",
						targetStage: "stage-idea-abc123",
					},
				},
			],
			interpolationContext,
			loadSkill: () => skill,
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toBe(
			"# Stage Skills\n" +
				"## creating-new-tickets\n" +
				"You may create follow-on KainBain tasks for verified findings using the KainBain API.\n\n" +
				"**Resolved targets for this run:**\n\n" +
				"- Target project: `KainBain`\n" +
				"- Target workflow: `wf-default`\n" +
				"- Target stage: `stage-idea-abc123`\n\n" +
				"Create the tickets now.",
		);
		expect(result.injected).toEqual([
			{ name: "creating-new-tickets", mode: "direct", chars: expect.any(Number) },
		]);
		expect(result.omitted).toEqual([]);
	});

	it("supports mixed direct + option skills in stage order", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "direct-skill" }, { name: "option-skill", mode: "option" }],
			interpolationContext,
			loadSkill: (name) => makeSkill({ name, body: `Body of ${name}.` }),
		});
		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]).toContain("# Stage Skills");
		expect(result.sections[0]).toContain("## direct-skill");
		expect(result.sections[1]).toContain("# Available Skills");
		expect(result.sections[1]).toContain("### option-skill");
	});

	it("resolves mode from KB_config defaults when stage omits it", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "demo-skill" }],
			interpolationContext,
			loadSkill: () => makeSkill({ config: { defaults: { mode: "option" } } }),
		});
		expect(result.injected[0].mode).toBe("option");
	});

	it("omits unknown skills with a visible reason", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "ghost-skill" }],
			interpolationContext,
			loadSkill: () => null,
		});
		expect(result.sections).toEqual([]);
		expect(result.omitted).toEqual([
			{ name: "ghost-skill", reason: "skill not found in library" },
		]);
	});

	it("omits invalid skills with the parse error", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "broken" }],
			interpolationContext,
			loadSkill: () => makeSkill({ invalid: true, error: "KB_config.json parse error" }),
		});
		expect(result.omitted).toEqual([
			{ name: "broken", reason: "KB_config.json parse error" },
		]);
	});

	it("drops skills above the size cap with a visible marker, in stage order", () => {
		const bigBody = "B".repeat(600);
		const result = buildSkillsPromptSections({
			skills: [{ name: "fits" }, { name: "too-big" }, { name: "never-reached" }],
			interpolationContext,
			maxChars: 700,
			loadSkill: (name) => makeSkill({ name, body: `# ${name}\n${bigBody}` }),
		});
		const names = result.injected.map((i) => i.name);
		expect(names).toEqual(["fits"]);
		expect(result.omitted.map((o) => `${o.name}:${o.reason}`)).toEqual([
			"too-big:size cap",
			"never-reached:size cap",
		]);
		expect(result.sections.some((s) => s.includes("[skill too-big omitted: size cap]"))).toBe(
			true,
		);
		expect(result.sections.some((s) => s.includes("[skill never-reached omitted: size cap]"))).toBe(
			true,
		);
	});

	it("reports attachments without a name", () => {
		const result = buildSkillsPromptSections({
			skills: [{ nope: true }, { name: "  " }],
			interpolationContext,
			loadSkill: () => makeSkill(),
		});
		expect(result.omitted).toHaveLength(2);
		expect(result.omitted[0].reason).toBe("missing skill name");
	});

	it("is inert when loadSkill is not provided", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "demo-skill" }],
			interpolationContext,
		});
		expect(result.sections).toEqual([]);
	});

	it("estimateSkillInjectionChars mirrors section accounting", () => {
		const estimate = estimateSkillInjectionChars({
			skills: [{ name: "demo-skill" }],
			loadSkill: () => makeSkill(),
			maxChars: 16000,
		});
		expect(estimate.maxChars).toBe(16000);
		expect(estimate.usedChars).toBeGreaterThan(0);
	});
});

describe("buildDirectSkillBlock (heading isolation)", () => {
	it("keeps the heading stable for empty bodies", () => {
		const block = buildDirectSkillBlock({
			skill: makeSkill({ body: "" }),
			stageSkill: {},
			interpolationContext: {},
		});
		expect(block).toBe("## demo-skill\n");
	});
});

/**
 * MARK: characterization — creating-new-tickets-shaped attachments
 * @description Pins the exact rendered output of the injection seam for the
 *   attachment shape used by skills/creating-new-tickets: KB_config `context`
 *   prepended to the body, stage.skills[i].config overrides winning over
 *   KB_config.keywords defaults, built-in {{project}} resolution, tolerant stage
 *   config (extra keys / missing / non-object), and an option-mode manifest that
 *   never leaks resolved keyword values. The synthetic skill's KB_config keyword
 *   defaults deliberately differ from the attachment config so precedence is
 *   observable in the rendered text.
 */

describe("buildSkillsPromptSections (creating-new-tickets-shaped attachments)", () => {
	const interpolationContext = { project: { name: "Proj A" } };

	/** Realistic creating-new-tickets-shaped synthetic skill (stub loader target). */
	function makeTicketsSkill(overrides = {}) {
		return {
			name: "creating-new-tickets",
			description:
				"Create follow-on KainBain tasks (tickets) into a chosen project/pipeline/stage via the KainBain API.",
			source: "global",
			path: "/skills/creating-new-tickets/SKILL.md",
			body: [
				"# Creating New Tickets (KainBain)",
				"",
				"**Resolved targets for this run:**",
				"",
				"- Target project: `{{targetProject}}`",
				"- Target workflow: `{{targetWorkflow}}`",
				"- Target stage: `{{targetStage}}`",
				"- API base: `{{kbApiBase}}`",
				"",
				"## Create the ticket",
				"",
				"`POST {{kbApiBase}}/tasks` with the resolved ids and a deterministic `idempotencyKey`.",
			].join("\n"),
			config: {
				context:
					"You may create follow-on KainBain tasks for verified findings using the KainBain API.",
			},
			keywords: {
				kbApiBase: "http://localhost:3100",
				targetProject: "Legacy Project",
				targetWorkflow: "wf-legacy",
				targetStage: "Legacy Stage",
			},
			invalid: false,
			...overrides,
		};
	}

	it("direct mode renders the exact section with stage-config overrides winning over KB_config defaults", () => {
		const result = buildSkillsPromptSections({
			skills: [
				{
					name: "creating-new-tickets",
					config: {
						targetProject: "{{project}}",
						targetWorkflow: "wf-default",
						targetStage: "Idea",
					},
				},
			],
			interpolationContext,
			loadSkill: () => makeTicketsSkill(),
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toBe(
			[
				"# Stage Skills",
				"## creating-new-tickets",
				"You may create follow-on KainBain tasks for verified findings using the KainBain API.",
				"",
				"# Creating New Tickets (KainBain)",
				"",
				"**Resolved targets for this run:**",
				"",
				"- Target project: `Proj A`",
				"- Target workflow: `wf-default`",
				"- Target stage: `Idea`",
				"- API base: `http://localhost:3100`",
				"",
				"## Create the ticket",
				"",
				"`POST http://localhost:3100/tasks` with the resolved ids and a deterministic `idempotencyKey`.",
			].join("\n"),
		);
		expect(result.injected).toEqual([
			{
				name: "creating-new-tickets",
				mode: "direct",
				chars: expect.any(Number),
			},
		]);
		// Precedence spelled out (already baked into the exact string above).
		expect(result.sections[0]).not.toContain("Legacy Project");
		expect(result.sections[0]).not.toContain("wf-legacy");
		expect(result.sections[0]).not.toContain("Legacy Stage");
		expect(result.sections[0]).not.toContain("{{targetProject}}");
	});

	it("option mode renders the exact manifest and stage config overrides never leak into it", () => {
		const result = buildSkillsPromptSections({
			skills: [
				{
					name: "creating-new-tickets",
					mode: "option",
					config: {
						targetProject: "{{project}}",
						targetWorkflow: "wf-default",
						targetStage: "Idea",
					},
				},
			],
			interpolationContext,
			loadSkill: () => makeTicketsSkill(),
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toBe(
			[
				"# Available Skills",
				"The following optional skills are attached to this stage. Use one only if it is relevant to your current work.",
				"### creating-new-tickets",
				"Create follow-on KainBain tasks (tickets) into a chosen project/pipeline/stage via the KainBain API.",
				"Skill file: `/skills/creating-new-tickets/SKILL.md` — Read this file with your file tools if you need it; follow its instructions.",
			].join("\n"),
		);
		// Overrides stay out of the manifest: no resolved keywords, no body/context.
		expect(result.sections[0]).not.toContain("wf-default");
		expect(result.sections[0]).not.toContain("You may create follow-on");
	});

	it("tolerates unknown/extra keys in stage.skills[i].config (rendering unchanged)", () => {
		const clean = buildDirectSkillBlock({
			skill: makeTicketsSkill(),
			stageSkill: {
				name: "creating-new-tickets",
				config: { targetStage: "Idea" },
			},
			interpolationContext,
		});
		const withExtraKeys = buildDirectSkillBlock({
			skill: makeTicketsSkill(),
			stageSkill: {
				name: "creating-new-tickets",
				config: {
					targetStage: "Idea",
					someFutureKey: "unused-value",
					numericKey: 7,
					objectKey: { nested: true },
					arrayKey: ["a"],
				},
			},
			interpolationContext,
		});
		expect(withExtraKeys).toBe(clean);
		expect(withExtraKeys).toContain("- Target stage: `Idea`");
	});

	it("tolerates missing or non-object stage config (KB_config keyword defaults still apply)", () => {
		for (const stageSkill of [
			{ name: "creating-new-tickets" },
			{ name: "creating-new-tickets", config: null },
			{ name: "creating-new-tickets", config: "not-an-object" },
			{ name: "creating-new-tickets", config: 42 },
		]) {
			const result = buildSkillsPromptSections({
				skills: [stageSkill],
				interpolationContext,
				loadSkill: () => makeTicketsSkill(),
			});
			expect(result.omitted).toEqual([]);
			expect(result.sections[0]).toContain("- Target project: `Legacy Project`");
			expect(result.sections[0]).toContain("- Target workflow: `wf-legacy`");
			expect(result.sections[0]).toContain("- Target stage: `Legacy Stage`");
		}
	});

	it("preserves unknown {{...}} placeholders through the full direct rendering", () => {
		const result = buildSkillsPromptSections({
			skills: [{ name: "creating-new-tickets" }],
			interpolationContext,
			loadSkill: () =>
				makeTicketsSkill({
					body: "Post to {{mysteryEndpoint}} for {{targetStage}}.",
					config: {},
					keywords: { targetStage: "Idea" },
				}),
		});
		expect(result.sections[0]).toContain(
			"Post to {{mysteryEndpoint}} for Idea.",
		);
	});

	it("preserves unknown {{...}} inside custom keyword values (single-pass substitution)", () => {
		const block = buildDirectSkillBlock({
			skill: makeSkill({
				body: "Go to {{targetStage}} now.",
				keywords: { targetStage: "Stage {{stillUnknown}}" },
			}),
			stageSkill: {},
			interpolationContext: { project: { name: "KainBain" } },
		});
		expect(block).toBe("## demo-skill\nGo to Stage {{stillUnknown}} now.");
	});
});