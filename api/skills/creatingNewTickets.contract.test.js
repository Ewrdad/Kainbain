import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PromptCurationEngine } from "../promptCuration.js";
import { loadSkill } from "./skillsRegistry.js";

/**
 * MARK: Contract for creating-new-tickets skill content
 * @description Pins the invariants agents depend on when turning findings into
 *   KainBain tickets: blockers are acknowledged explicitly and every goal opens
 *   with a title first line. Any future skill edit that drops either rule fails
 *   here before agents ever see the degraded text.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const SKILL_NAME = "creating-new-tickets";

describe("Contract: creating-new-tickets skill content", () => {
	beforeAll(() => {
		expect(fs.existsSync(path.join(SKILLS_DIR, SKILL_NAME, "SKILL.md"))).toBe(true);
	});

	const directPrompt = () => {
		const skill = loadSkill({ name: SKILL_NAME, skillsDir: SKILLS_DIR });
		expect(skill.invalid).toBe(false);
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME ? skill : null),
			skillsMaxChars: 16000,
		});
		return engine.curatePrompt(
			{ id: "contract-1", goal: "Audit the deployment and report findings" },
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
			{ timestamp: "20261113-000000", projectName: "KainBain", projectCwd: "/tmp/contract" },
		);
	};

	it("does not leak unresolved custom keywords", () => {
		const prompt = directPrompt();
		expect(prompt).not.toContain("{{targetProject}}");
		expect(prompt).not.toContain("{{targetStage}}");
		expect(prompt).not.toContain("{{kbApiBase}}");
	});

	it("states the blockedBy recipe and the never-guess-id rule", () => {
		const prompt = directPrompt();
		expect(prompt).toContain("blockedBy");
		expect(prompt).toContain("never guess");
		expect(prompt).toContain("blockers: none");
		// array-of-ids example shape
		expect(prompt).toMatch(/"blockedBy"\s*:\s*\[/);
	});

	it("requires a first-line title in goal", () => {
		const prompt = directPrompt();
		expect(prompt).toContain("# <title>");
		expect(prompt).toContain("first line");
		expect(prompt).not.toContain("{{targetProject}}");
	});

	it("documents API validation and same-project blockers", () => {
		const prompt = directPrompt();
		expect(prompt).toContain("same-project");
		expect(prompt).toContain("HTTP 400");
		expect(prompt).toContain("failed/cancelled");
	});

	it("ties the goal title to the formatter fallback", () => {
		const prompt = directPrompt();
		expect(prompt).toContain("formatTaskTitleFirstLine");
		expect(prompt).toContain("Untitled Task");
		expect(prompt).toContain("Never target the stage that is CURRENTLY executing");
	});
	it("stays within the direct-mode prompt budget", () => {
		const prompt = directPrompt();
		expect(prompt.length).toBeLessThan(16000 + 2000);
	});
});

describe("Contract: pretty two-stage flow", () => {
	const REPO_ROOT2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
	const SKILLS_DIR2 = path.join(REPO_ROOT2, "skills");
	const SKILL_NAME2 = "creating-new-tickets";
	const directPrompt2 = () => {
		const skill = loadSkill({ name: SKILL_NAME2, skillsDir: SKILLS_DIR2 });
		const engine = new PromptCurationEngine({
			loadSkill: (name) => (name === SKILL_NAME2 ? skill : null),
			skillsMaxChars: 16000,
		});
		return engine.curatePrompt(
			{ id: "contract-1", goal: "Audit the deployment and report findings" },
			{
				id: "audit",
				name: "Audit Findings",
				prompt: "Audit the project.",
				skills: [
					{
						name: SKILL_NAME2,
						mode: "direct",
						config: {
							targetProject: "KainBain",
							targetWorkflow: "wf-default",
							targetStage: "Intake",
						},
					},
				],
			},
			{ timestamp: "20261113-000000", projectName: "KainBain", projectCwd: "/tmp/contract" },
		);
	};

	it("documents the two-stage flow and draft files", () => {
		const prompt = directPrompt2();
		expect(prompt).toContain("Stage 1");
		expect(prompt).toContain("Stage 2");
		expect(prompt).toContain("drafts/");
		expect(prompt).toContain("EXACT contents");
	});
	it("documents the draft template headings", () => {
		const prompt = directPrompt2();
		expect(prompt).toContain("## Context");
		expect(prompt).toContain("## Steps");
		expect(prompt).toContain("## Acceptance criteria");
	});
	it("documents create-upload-patch image ordering", () => {
		const prompt = directPrompt2();
		expect(prompt).toContain("create → upload → patch");
		expect(prompt).toContain("assets/");
	});
	it("keeps the prompt under budget", () => {
		const prompt = directPrompt2();
		expect(prompt.length).toBeLessThan(18000);
	});
});
