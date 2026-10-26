import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";
import { taskStore } from "./taskStore.js";
import { PromptCurationEngine } from "./promptCuration.js";
import { loadSkill } from "./skills/skillsRegistry.js";

/**
 * MARK: Stage execution with skills — integration
 * @description Verifies the full engine path (not just the pure engine): a stage
 *   whose `skills` array carries direct + option attachments produces a
 *   `task.prompt` (the persisted curated prompt) that contains the
 *   `# Stage Skills` body injection and the `# Available Skills` manifest —
 *   executed through taskStore.executeStage with a mocked agent runner, exactly
 *   as a live stage run would persist it.
 */

const SKILLS_DIR = path.resolve(
	path.dirname(new URL(import.meta.url, "file:///").pathname),
	"..",
	"skills",
);

function makeMockAgentRunner(outputText = "Mock stage work complete.") {
	return async (prompt, { onChunk } = {}) => {
		onChunk?.(`[MOCK] Running stage with prompt of ${prompt.length} chars.\n`);
		return {
			output: outputText,
			summary: outputText,
			modifiedFiles: [],
		};
	};
}

describe("agentRunner + skills integration", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;
	let promptEngine;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skills-int-"));
		tempNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skills-notes-"));
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
		taskStore.setProjectStore(store);
		promptEngine = new PromptCurationEngine({
			loadSkill: (name) => loadSkill({ name, skillsDir: SKILLS_DIR }),
		});
	});

	afterEach(() => {
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
		}
	});

	it("persists task.prompt with # Stage Skills and # Available Skills when the stage has skills", async () => {
		const stages = [
			{
				id: "1",
				name: "Audit Findings",
				type: "agent",
				prompt: "Audit the project.",
				failback: "previous",
				skills: [
					{
						name: "creating-new-tickets",
						mode: "direct",
						config: { targetProject: "KainBain", targetStage: "Intake" },
					},
					{ name: "kainbain-task-analysis", mode: "option" },
				],
			},
			{ id: "2", name: "Plan", type: "agent", prompt: "Plan.", failback: "previous" },
		];
		const project = store.createProject({ name: "Skills Integration", stages , allowLocalOnly: true });

		// Loader backed by the real repo skills library.
		promptEngine = new PromptCurationEngine({
			loadSkill: (name, projectCwd) =>
				loadSkill({ name, skillsDir: SKILLS_DIR, projectSkillsDir: null }),
		});

		const created = taskStore.createTask(project.id, {
			title: "Audit with skills",
			goal: "Audit the project and create tickets",
			stageId: "1",
			projectCwd: project.cwd,
		});

		const result = await taskStore.executeStage(project.id, created.id, {
			stages,
			projectCwd: project.cwd,
			agentRunner: makeMockAgentRunner(),
			promptEngine,
			priority: "high",
		});

		expect(result).toBeTruthy();
		const task = taskStore.getTask(project.id, created.id);
		expect(task.prompt).toBeTruthy();
		expect(task.prompt).toContain("# Stage Skills");
		expect(task.prompt).toContain("## creating-new-tickets");
		// Direct-mode keyword overrides resolved into the persisted prompt.
		expect(task.prompt).toContain("Target project: `KainBain`");
		expect(task.prompt).toContain("Target stage: `Intake`");
		// Option-mode manifest references the real file path.
		expect(task.prompt).toContain("# Available Skills");
		expect(task.prompt).toContain("### kainbain-task-analysis");
		expect(task.prompt).toContain("SKILL.md");
		// The option skill's body is NOT injected.
		expect(task.prompt).not.toContain("# KainBain Task Analysis");
	});

	it("runs a legacy stage (no skills) with a byte-identical prompt shape", async () => {
		const stages = [
			{ id: "1", name: "Plain", type: "agent", prompt: "Do plain work.", failback: "previous" },
		];
		const project = store.createProject({ name: "Legacy Integration", stages , allowLocalOnly: true });

		const created = taskStore.createTask(project.id, {
			title: "Legacy",
			goal: "Plain goal",
			stageId: "1",
			projectCwd: project.cwd,
		});

		await taskStore.executeStage(project.id, created.id, {
			stages,
			projectCwd: project.cwd,
			agentRunner: makeMockAgentRunner(),
			promptEngine: new PromptCurationEngine(),
			priority: "high",
		});

		const task = taskStore.getTask(project.id, created.id);
		expect(task.prompt).toContain("# Task\nPlain goal");
		expect(task.prompt).toContain("# Stage\nDo plain work.");
		expect(task.prompt).not.toContain("# Stage Skills");
		expect(task.prompt).not.toContain("# Available Skills");
	});
});