import { describe, it, expect } from "vitest";
import { PromptCurationEngine } from "./promptCuration.js";

/***
 * MARK: prompt layout baseline characterisation
 * @description Pins the exact `curatePrompt` output for a full and a minimal
 *   fixture BEFORE the prompt-layout render seam lands. The layout refactor
 *   must keep both byte-identical when no custom layout is configured.
 * @example run `npm run test --prefix api -- promptCuration.layoutBaseline`
 ***/

const STUB_SKILL = {
	name: "demo-skill",
	description: "Demo",
	body: "Demo skill body for {{project}}.",
	keywords: {},
	config: {},
};

function fullEngine() {
	return new PromptCurationEngine({
		loadSkill: (name) => (name === "demo-skill" ? STUB_SKILL : null),
	});
}

const TASK = {
	id: "task-1",
	goal: "Fix the login bug for {{project}}",
	project: "Demo",
	projectCwd: "/projects/demo",
};

const FULL_OPTIONS = {
	timestamp: "20260102-030405",
	previousReports: ["./docs/tasks/task-1/idea-old.md"],
	taskImages: ["assets/a.png"],
	failureDetails: "Tests failed: login.spec",
};

const FULL_STAGE = {
	id: "2",
	name: "Plan",
	type: "agent",
	prompt: "Draft a plan for {{taskGoal}}.",
	report: true,
	skills: [{ name: "demo-skill" }],
};

const EXPECTED_FULL = `# Task
Fix the login bug for Demo

# Stage
Draft a plan for Fix the login bug for {{project}}.

# Stage Skills
## demo-skill
Demo skill body for Demo.

# Task Images
The task's image assets are listed below. Reference them with the relative
markdown path shown (they resolve inside this task's docs folder), open them
with your file tools to view their content, and NEVER inline image bytes as
base64 into prompts, logs, or reports.
- ![image](assets/a.png) — relative to the task folder

# Previous Reports
The following prior stage reports are available in ./docs/tasks/task-1/:
- ./docs/tasks/task-1/idea-old.md

# Reporting
After completing this stage, write a summary report to ./docs/tasks/task-1/plan-20260102-030405.md.

# Failure Details
Tests failed: login.spec

# Testing & Verification Guidance
Unit/integration tests (\`npm run test:unit\`) and existing automated test suites are the primary verification gate. When visual verification is needed, do not spawn long-lived background servers — use isolated headless test runners, existing mock fixtures, or the headless screenshot tool (\`npm run capture:screenshot\`).

# Stage Failure Guidance
If you fail this stage, use the Fail_stage_skill to report why. Do NOT request or specify a target stage — KainBain will route the task back to the stage configured for failback on this stage.`;

const EXPECTED_MINIMAL = `# Task
Fix the login bug for Demo

# Stage
Do it.

# Stage Failure Guidance
If you fail this stage, use the Fail_stage_skill to report why. Do NOT request or specify a target stage — KainBain will route the task back to the stage configured for failback on this stage.`;

describe("promptCuration layout baseline", () => {
	it("renders the full fixture byte-identically (pre-layout-seam pin)", () => {
		expect(fullEngine().curatePrompt(TASK, FULL_STAGE, FULL_OPTIONS)).toBe(
			EXPECTED_FULL,
		);
	});

	it("renders the minimal fixture byte-identically (pre-layout-seam pin)", () => {
		const engine = new PromptCurationEngine({ loadSkill: () => null });
		expect(
			engine.curatePrompt(
				TASK,
				{ id: "3", name: "Build", type: "agent", prompt: "Do it." },
				{ taskImages: [] },
			),
		).toBe(EXPECTED_MINIMAL);
	});
});
