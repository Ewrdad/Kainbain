import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PromptCurationEngine } from "../promptCuration.js";
import { loadSkill, listSkills } from "./skillsRegistry.js";
import {
	buildSkillsPromptSections,
	buildDirectSkillBlock,
} from "./skillInjection.js";

/**
 * MARK: PoC — creating-new-tickets stage skill
 * @description Proves the stage-skills feature end-to-end with the REAL
 *   `skills/creating-new-tickets` package from the repo library:
 *   - direct mode injects the resolved skill body (KB_config context + keywords
 *     like {{targetProject}}/{{targetStage}}/{{kbApiBase}}) into the curated prompt;
 *   - option mode injects only the manifest entry + absolute SKILL.md path (no body);
 *   - KB_config is tolerant (unknown fields preserved, never executed);
 *   - the injected instructions actually describe POST /tasks so a stage agent
 *     can create a ticket into the configured pipeline/stage.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const SKILL_NAME = "creating-new-tickets";

describe("PoC: creating-new-tickets stage skill", () => {
	beforeAll(() => {
		expect(fs.existsSync(path.join(SKILLS_DIR, SKILL_NAME, "SKILL.md"))).toBe(true);
		expect(fs.existsSync(path.join(SKILLS_DIR, SKILL_NAME, "KB_config.json"))).toBe(true);
	});

	it("is discoverable in the global library and parses cleanly", () => {
		const skills = listSkills({ skillsDir: SKILLS_DIR });
		const poc = skills.find((s) => s.name === SKILL_NAME);
		expect(poc).toBeTruthy();
		expect(poc.invalid).toBe(false);
		expect(poc.hasConfig).toBe(true);
		expect(poc.source).toBe("global");
		// Non-declarative tolerance: unknown KB_config fields are preserved.
		expect(poc.config.ticketLabel).toBe("audit-finding");
		expect(poc.config.maxTicketsPerRun).toBe(10);
		// Keyword defaults from KB_config.
		expect(poc.keywords.kbApiBase).toBe("http://localhost:3100");
		expect(poc.keywords.targetProject).toBe("{{project}}");
		expect(poc.keywords.targetStage).toBe("Idea");
	});

	it("direct mode injects the full body with keywords resolved from stage config", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		expect(skill.invalid).toBe(false);

		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		const prompt = engine.curatePrompt(
			{ id: "audit-1", goal: "Audit the deployment and report findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit the project.",
				skills: [
					{
						name: SKILL_NAME,
						mode: "direct",
						config: {
							targetProject: "KainBain",
							targetWorkflow: "wf-default",
							targetStage: "Intake",
						},
					},
				],
			},
			{ timestamp: "20260912-000000", projectName: "KainBain", projectCwd: "/tmp/poc" },
		);

		expect(prompt).toContain("# Stage Skills");
		expect(prompt).toContain(`## ${SKILL_NAME}`);
		// Stage-config overrides win over KB_config defaults.
		expect(prompt).toContain("Target project: `KainBain`");
		expect(prompt).toContain("Target stage: `Intake`");
		expect(prompt).toContain("Target workflow: `wf-default`");
		// KB_config keyword default (kbApiBase) resolves.
		expect(prompt).toContain("API base: `http://localhost:3100`");
		// The KB_config `context` block is prepended to the body.
		expect(prompt).toContain("You may create follow-on KainBain tasks for verified findings");
		// The creation recipe is present (POST /tasks with idempotencyKey).
		expect(prompt).toContain("POST");
		expect(prompt).toContain("idempotencyKey");
		// No unresolved custom keywords remain in the direct body.
		expect(prompt).not.toContain("{{targetProject}}");
		expect(prompt).not.toContain("{{targetStage}}");
		expect(prompt).not.toContain("{{kbApiBase}}");
	});

	it("KB_config targetProject default {{project}} resolves from task context", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		const prompt = engine.curatePrompt(
			{ id: "audit-2", goal: "Audit findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit.",
				skills: [{ name: SKILL_NAME, mode: "direct" }],
			},
			{ timestamp: "t", projectName: "My Audit Project" },
		);
		// KB_config default `targetProject: "{{project}}"` resolves via the built-in.
		expect(prompt).toContain("Target project: `My Audit Project`");
		// Untouched KB_config default for targetStage.
		expect(prompt).toContain("Target stage: `Idea`");
	});

	it("option mode injects only the manifest entry with the SKILL.md path — never the body", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		const prompt = engine.curatePrompt(
			{ id: "audit-3", goal: "Audit findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit.",
				skills: [{ name: SKILL_NAME, mode: "option", config: { targetStage: "Intake" } }],
			},
			{ timestamp: "t", projectName: "My Audit Project" },
		);

		expect(prompt).toContain("# Available Skills");
		expect(prompt).toContain(`### ${SKILL_NAME}`);
		// The absolute file path is exposed so the agent can self-read it.
		expect(prompt).toContain(
			path.join(SKILLS_DIR, SKILL_NAME, "SKILL.md"),
		);
		expect(prompt).toContain("Read this file with your file tools");
		// The manifest carries the description, but NOT the skill body.
		expect(prompt).toContain("Create follow-on KainBain tasks (tickets)");
		expect(prompt).not.toContain("# Creating New Tickets (KainBain)");
		expect(prompt).not.toContain("Target project: `");
		expect(prompt).not.toContain("# Stage Skills");
	});

	it("mode falls back to KB_config defaults.mode (direct) when the stage omits mode", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		const prompt = engine.curatePrompt(
			{ id: "audit-4", goal: "Audit findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit.",
				skills: [{ name: SKILL_NAME }],
			},
			{ timestamp: "t", projectName: "P" },
		);
		// KB_config defaults.mode is "direct" => full body injected.
		expect(prompt).toContain("# Stage Skills");
		expect(prompt).toContain("# Creating New Tickets (KainBain)");
	});

	it("mixed attachments deliver direct + option in one prompt (size within cap)", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		const prompt = engine.curatePrompt(
			{ id: "audit-5", goal: "Audit findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit.",
				skills: [
					{ name: SKILL_NAME, mode: "direct", config: { targetStage: "Intake" } },
					{ name: SKILL_NAME, mode: "option" },
				],
			},
			{ timestamp: "t", projectName: "P" },
		);
		expect(prompt).toContain("# Stage Skills");
		expect(prompt).toContain("# Available Skills");
		// usedChars stays within the cap (16k).
		expect(prompt.length).toBeLessThan(16000 + 2000);
	});

	it("composes sections[0] from the exported pure functions with the real package (direct, Proj A)", () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		expect(skill.invalid).toBe(false);
		const stageSkill = {
			name: SKILL_NAME,
			mode: "direct",
			config: {
				targetProject: "{{project}}",
				targetWorkflow: "wf-default",
				targetStage: "Idea",
			},
		};
		const interpolationContext = { project: { name: "Proj A" } };
		const result = buildSkillsPromptSections({
			skills: [stageSkill],
			interpolationContext,
			maxChars: 16000,
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
		});
		// Composition pin: the section is exactly the header plus the direct block.
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]).toBe(
			"# Stage Skills\n" +
				buildDirectSkillBlock({ skill, stageSkill, interpolationContext }),
		);
		// Built-in {{project}} resolves through the stage-config override.
		expect(result.sections[0]).toContain("Target project: `Proj A`");
		expect(result.sections[0]).toContain("Target workflow: `wf-default`");
		expect(result.sections[0]).toContain("Target stage: `Idea`");
		// No unresolved custom keywords remain in the direct body.
		expect(result.sections[0]).not.toContain("{{targetProject}}");
		expect(result.sections[0]).not.toContain("{{targetWorkflow}}");
		expect(result.sections[0]).not.toContain("{{targetStage}}");
	});
});