/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir test fixture by design */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	PromptCurationEngine,
	interpolatePromptKeywords,
	renderStageVerdictGuidance,
} from "./promptCuration.js";

/**
 * MARK: Prompt curation + stage skills contract tests
 * @description HARD GATE for legacy behaviour: with `stage.skills` absent or empty,
 *   `curatePrompt` output must be byte-identical to the legacy prompt format. Any
 *   change to buildStagePrompt/curatePrompt that breaks this contract is a legacy
 *   regression and must not ship. Also locks the skills injection ordering
 *   (# Stage Skills after # Stage, before # Previous Reports) and keyword exposure.
 */

describe("promptCuration skills contract", () => {
	const task = { id: "task-77", goal: "Build the {{project}} widget" };
	const stage = {
		id: "2",
		name: "Technical Elab",
		type: "agent",
		prompt: "Elaborate specs for {{taskGoal}}",
	};
	const options = {
		timestamp: "20260818-120000",
		projectName: "KainBain",
		projectCwd: "/tmp/some-project",
		reports: ["./docs/tasks/task-77/idea-20260818-100000.md"],
	};

	it("legacy prompt shape when stage.skills is ABSENT (reporting now opt-in: no # Reporting section by default)", () => {
		const engine = new PromptCurationEngine();
		const legacy = engine.curatePrompt(task, stage, options);
		const sections = legacy.split("\n\n");
		// Sections 1-4 are byte-frozen legacy text (Testing & Verification is
		// present: "Technical Elab" matches the plan|spec|elab rule). The
		// `# Reporting` section is GONE by default — it only renders when the
		// stage opts in via `stage.report` or the `stage-report` skill.
		expect(sections[0]).toBe("# Task\nBuild the KainBain widget");
		expect(sections[1]).toBe(
			"# Stage\nElaborate specs for Build the {{project}} widget",
		);
		expect(sections[2]).toBe(
			"# Previous Reports\nThe following prior stage reports are available in ./docs/tasks/task-77/:\n- ./docs/tasks/task-77/idea-20260818-100000.md",
		);
		expect(sections[3]).toContain("# Testing & Verification Guidance");
		expect(legacy).not.toContain("# Reporting\n");
		expect(legacy).not.toContain("write a summary report");
		// Section 7 renders the global stage-verdict skill for agent stages:
		// it must carry BOTH fail paths (tool + text block) and the
		// reason-mandatory rule — this is the fail-open contract. (The
		// skill body itself contains blank lines, so slice from its header
		// to the end of the prompt.)
		const failureIdx = legacy.indexOf("# Stage Failure Guidance\n");
		expect(failureIdx).toBeGreaterThan(-1);
		const failureSection = legacy.slice(failureIdx);
		expect(failureSection).toBeTruthy();
		expect(failureSection).toContain("Fail_stage_skill");
		expect(failureSection).toContain("KAINBAIN_VERDICT: FAIL");
		expect(failureSection).toContain("KAINBAIN_REASON:");
		expect(failureSection).toContain("KAINBAIN_FIX:");
	});

	it("renders # Reporting only when the stage opts in (report flag or stage-report skill)", () => {
		const engine = new PromptCurationEngine();
		const withFlag = engine.curatePrompt(task, { ...stage, report: true }, options);
		expect(withFlag).toContain(
			"# Reporting\nAfter completing this stage, write a summary report to ./docs/tasks/task-77/technical-elab-20260818-120000.md.",
		);
		const withSkill = engine.curatePrompt(
			task,
			{ ...stage, skills: [{ name: "stage-report" }] },
			options,
		);
		expect(withSkill).toContain("# Reporting\nAfter completing this stage");
	});

	it("byte-identical prompt when stage.skills is EMPTY", () => {
		const engine = new PromptCurationEngine();
		const withEmptySkills = engine.curatePrompt(
			task,
			{ ...stage, skills: [] },
			options,
		);
		const legacy = engine.curatePrompt(task, stage, options);
		expect(withEmptySkills).toBe(legacy);
	});

	it("byte-identical interpolation for legacy projects (no customKeywords)", () => {
		const legacy = interpolatePromptKeywords("Hello {{project}} {{unknown_key}}", {
			project: { name: "KainBain" },
		});
		expect(legacy).toBe("Hello KainBain {{unknown_key}}");
	});

	it("customKeywords take precedence over built-ins and preserve unknown keys", () => {
		const out = interpolatePromptKeywords("{{project}} {{custom_x}} {{unknown_y}}", {
			project: { name: "BuiltIn" },
			customKeywords: { project: "CustomProject", custom_x: "CX" },
		});
		expect(out).toBe("CustomProject CX {{unknown_y}}");
	});

	it("injects # Stage Skills after # Stage and before # Previous Reports", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-skills-"));
		try {
			const skillDir = path.join(tempDir, "injected-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: injected-skill\ndescription: injected\n---\n# Injected Skill\nFollow this.",
				"utf8",
			);
			const engine = new PromptCurationEngine({
				loadSkill: (name) =>
					name === "injected-skill"
					? {
							name,
							description: "injected",
							source: "global",
							path: path.join(skillDir, "SKILL.md"),
							body: "# Injected Skill\nFollow this.",
							config: {},
							keywords: {},
							invalid: false,
						}
					: null,
			});
			const prompt = engine.curatePrompt(
				task,
				{ ...stage, skills: [{ name: "injected-skill" }] },
				options,
			);
			const stageIdx = prompt.indexOf("# Stage\n");
			const skillsIdx = prompt.indexOf("# Stage Skills");
			const prevIdx = prompt.indexOf("# Previous Reports");
			expect(skillsIdx).toBeGreaterThan(-1);
			expect(skillsIdx).toBeGreaterThan(stageIdx);
			expect(skillsIdx).toBeLessThan(prevIdx);
			expect(prompt).toContain("## injected-skill");
			expect(prompt).toContain("Follow this.");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("exposes skill keywords to the stage prompt itself via customKeywords", () => {
		const engine = new PromptCurationEngine({
			loadSkill: (name) => ({
				name,
				description: "d",
				source: "global",
				path: "/skills/x/SKILL.md",
				body: "Body.",
				config: {},
				keywords: { targetStage: "Intake" },
				invalid: false,
			}),
		});
		const prompt = engine.curatePrompt(
			{ id: "t", goal: "G" },
			{
				id: "s",
				name: "S",
				prompt: "Deliver tickets into {{targetStage}}",
				skills: [{ name: "any" }],
			},
			{ timestamp: "t" },
		);
		expect(prompt).toContain("# Stage\nDeliver tickets into Intake");
	});

	it("does not emit skills sections when the skill library is empty", () => {
		const engine = new PromptCurationEngine({ loadSkill: () => null });
		const prompt = engine.curatePrompt(
			task,
			{ ...stage, skills: [{ name: "ghost" }] },
			options,
		);
		expect(prompt).not.toContain("# Stage Skills");
		expect(prompt).not.toContain("# Available Skills");
	});

	// Synthetic creating-new-tickets-shaped descriptor: KB_config `context` + keyword
	// body. KB_config keyword defaults deliberately differ from the attachment config
	// below, so the resolved prompt proves stage-config precedence over KB defaults.
	const ticketsSkill = {
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
		].join("\n"),
		config: {
			context:
				"You may create follow-on KainBain tasks for verified findings using the KainBain API.",
		},
		keywords: {
			kbApiBase: "http://localhost:3100",
			targetProject: "Unconfigured Project",
			targetWorkflow: "wf-legacy",
			targetStage: "Backlog",
		},
		invalid: false,
	};
	const ticketsLoadSkill = (name) =>
		name === "creating-new-tickets" ? ticketsSkill : null;

	it("direct creating-new-tickets attachment: # Stage Skills sits between # Stage and # Previous Reports with overrides resolved", () => {
		const engine = new PromptCurationEngine({ loadSkill: ticketsLoadSkill });
		const prompt = engine.curatePrompt(
			task,
			{
				...stage,
				skills: [
					{
						name: "creating-new-tickets",
						mode: "direct",
						config: {
							targetProject: "{{project}}",
							targetWorkflow: "wf-default",
							targetStage: "Idea",
						},
					},
				],
			},
			options,
		);
		const stageIdx = prompt.indexOf("# Stage\n");
		const skillsIdx = prompt.indexOf("# Stage Skills");
		const prevIdx = prompt.indexOf("# Previous Reports");
		expect(skillsIdx).toBeGreaterThan(-1);
		expect(skillsIdx).toBeGreaterThan(stageIdx);
		expect(skillsIdx).toBeLessThan(prevIdx);
		// Attachment config overrides resolve into the injected body ({{project}} built-in included).
		expect(prompt).toContain("Target project: `KainBain`");
		expect(prompt).toContain("Target workflow: `wf-default`");
		expect(prompt).toContain("Target stage: `Idea`");
		// KB_config keyword fallback (kbApiBase carries no override).
		expect(prompt).toContain("API base: `http://localhost:3100`");
		// KB_config defaults lose to the attachment config.
		expect(prompt).not.toContain("wf-legacy");
		expect(prompt).not.toContain("Backlog");
	});

	it("option creating-new-tickets attachment: # Available Skills manifest with the SKILL.md path, never the resolved keywords", () => {
		const engine = new PromptCurationEngine({ loadSkill: ticketsLoadSkill });
		const prompt = engine.curatePrompt(
			task,
			{
				...stage,
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
			},
			options,
		);
		expect(prompt).toContain("# Available Skills");
		expect(prompt).toContain("### creating-new-tickets");
		expect(prompt).toContain("/skills/creating-new-tickets/SKILL.md");
		expect(prompt).toContain("Read this file with your file tools");
		// No resolved keyword values, no KB_config defaults, no body/context leak.
		expect(prompt).not.toContain("wf-default");
		expect(prompt).not.toContain("wf-legacy");
		expect(prompt).not.toContain("Target project: `");
		expect(prompt).not.toContain("Target workflow: `");
		expect(prompt).not.toContain("Target stage: `");
		expect(prompt).not.toContain("API base: `");
		expect(prompt).not.toContain("You may create follow-on");
	});
});

describe("renderStageVerdictGuidance", () => {
	const fallback = "legacy line";

	it("renders the skill body for agent stages", () => {
		const out = renderStageVerdictGuidance({
			stage: { type: "agent" },
			skillLoader: () => ({ body: "# Custom verdict", invalid: false }),
			fallback,
		});
		expect(out).toBe("# Custom verdict");
	});

	it("resolves through the loader so project overlays win (global default otherwise)", () => {
		const seen = [];
		const out = renderStageVerdictGuidance({
			stage: { type: "agent" },
			skillLoader: (name) => {
				seen.push(name);
				return { body: "overlay body", invalid: false };
			},
			fallback,
		});
		expect(seen).toEqual(["stage-verdict"]);
		expect(out).toBe("overlay body");
	});

	it("falls back to legacy text when the skill is missing or invalid", () => {
		for (const skillLoader of [
			() => null,
			() => ({ body: "", invalid: false }),
			() => ({ body: "x", invalid: true }),
			() => {
				throw new Error("boom");
			},
		]) {
			expect(
				renderStageVerdictGuidance({
					stage: { type: "agent" },
					skillLoader,
					fallback,
				}),
			).toBe(fallback);
		}
	});

	it("never duplicates an explicitly attached stage-verdict skill", () => {
		const out = renderStageVerdictGuidance({
			stage: { type: "agent" },
			skillLoader: () => ({ body: "# Custom verdict", invalid: false }),
			stageSkillAttachments: [{ name: " Stage-Verdict " }],
			fallback,
		});
		expect(out).toBe(fallback);
	});

	it("keeps the legacy line for non-agent stages", () => {
		const out = renderStageVerdictGuidance({
			stage: { type: "ci" },
			skillLoader: () => ({ body: "# Custom verdict", invalid: false }),
			fallback,
		});
		expect(out).toBe(fallback);
	});

	it("resolves the real global skill end-to-end (fail-open contract present)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-77", goal: "Build the widget" },
			{ id: "2", name: "Review", type: "agent", prompt: "Review it" },
			{ timestamp: "20260818-120000", projectCwd: "/tmp/some-project" },
		);
		expect(prompt).toContain("KAINBAIN_VERDICT: FAIL");
		expect(prompt).toContain("Fail_stage_skill");
	});
});