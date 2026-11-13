import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PromptCurationEngine } from "../promptCuration.js";
import { loadSkill } from "./skillsRegistry.js";

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

	it("stays within the direct-mode prompt budget", () => {
		const prompt = directPrompt();
		expect(prompt.length).toBeLessThan(16000 + 2000);
	});
});
