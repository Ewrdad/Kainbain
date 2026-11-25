import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	PromptCurationEngine,
	formatTimestamp,
	slugifyStageName,
	formatImageRefs,
	stageWantsReport,
	STAGE_REPORT_SKILL_NAME,
} from "./promptCuration.js";

/**
 * MARK: PromptCurationEngine unit tests
 * @description Verifies the curated prompt assembly: task goal, stage instructions,
 * timestamped report path in ./docs/tasks/<taskID>/, previous stage reports, and optional
 * failure/human feedback details.
 */

describe("PromptCurationEngine", () => {
	it("slugifies stage names properly", () => {
		expect(slugifyStageName("Technical Elab")).toBe("technical-elab");
		expect(slugifyStageName("Review & Sign-Off")).toBe("review-sign-off");
		expect(slugifyStageName("")).toBe("stage");
	});

	it("formats timestamps consistently", () => {
		const fixedDate = new Date("2026-08-18T19:51:42");
		const ts = formatTimestamp(fixedDate);
		expect(ts).toBe("20260818-195142");
	});

	it("assembles task, stage, and timestamped reporting sections when the stage opts in", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{
				id: "2",
				name: "Technical Elab",
				prompt: "Elaborate specs",
				report: true,
			},
			{ timestamp: "20260818-120000" },
		);
		expect(prompt).toContain("# Task\nBuild the API");
		expect(prompt).toContain("# Stage\nElaborate specs");
		expect(prompt).toContain(
			"# Reporting\nAfter completing this stage, write a summary report to ./docs/tasks/task-100/technical-elab-20260818-120000.md.",
		);
		expect(prompt).toContain("Fail_stage_skill");
	});

	it("omits the # Reporting section by default (no report flag, no skill)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{ id: "2", name: "Technical Elab", prompt: "Elaborate specs" },
			{ timestamp: "20260818-120000" },
		);
		expect(prompt).toContain("# Task\nBuild the API");
		expect(prompt).toContain("# Stage\nElaborate specs");
		expect(prompt).not.toContain("# Reporting");
		expect(prompt).not.toContain("write a summary report");
	});

	it("omits the # Reporting section when the stage attaches an unrelated skill", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{
				id: "2",
				name: "Plan",
				prompt: "Elaborate specs",
				skills: [{ name: "stage-verdict" }],
			},
			{ timestamp: "20260818-120000" },
		);
		expect(prompt).not.toContain("# Reporting");
	});

	it("renders the # Reporting section when the stage-report skill is attached", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Build the API" },
			{
				id: "2",
				name: "Technical Elab",
				prompt: "Elaborate specs",
				skills: [{ name: STAGE_REPORT_SKILL_NAME }],
			},
			{ timestamp: "20260818-120000" },
		);
		expect(prompt).toContain(
			"# Reporting\nAfter completing this stage, write a summary report to ./docs/tasks/task-100/technical-elab-20260818-120000.md.",
		);
	});

	describe("stageWantsReport predicate", () => {
		it("defaults to false for a bare stage", () => {
			expect(stageWantsReport({})).toBe(false);
			expect(stageWantsReport({ id: "s", name: "Plan" })).toBe(false);
			expect(stageWantsReport(null)).toBe(false);
			expect(stageWantsReport(undefined)).toBe(false);
		});

		it("is true when stage.report is explicitly true", () => {
			expect(stageWantsReport({ report: true })).toBe(true);
		});

		it("is false when stage.report is falsy or absent", () => {
			expect(stageWantsReport({ report: false })).toBe(false);
			expect(stageWantsReport({ report: undefined })).toBe(false);
		});

		it("is true when the stage-report skill is attached", () => {
			expect(
				stageWantsReport({ skills: [{ name: "stage-report" }] }),
			).toBe(true);
			expect(
				stageWantsReport({
					skills: [{ name: "stage-verdict" }, { name: "stage-report" }],
				}),
			).toBe(true);
		});

		it("is false for unrelated skills or malformed attachments", () => {
			expect(stageWantsReport({ skills: [{ name: "stage-verdict" }] })).toBe(
				false,
			);
			expect(stageWantsReport({ skills: [] })).toBe(false);
			expect(stageWantsReport({ skills: [{}] })).toBe(false);
			expect(stageWantsReport({ skills: [null] })).toBe(false);
			expect(stageWantsReport({ skills: "stage-report" })).toBe(false);
		});
	});

	it("falls back to default text when task or stage fields are absent", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt({ id: "t" }, { id: "s" });
		expect(prompt).toContain("No overarching task specified.");
		expect(prompt).toContain("Perform the current stage of the task.");
	});

	it("includes previous reports section when prior reports are provided", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-100", goal: "Implement feature" },
			{ id: "3", name: "Plan", prompt: "Write execution plan" },
			{
				previousReports: [
					"./docs/tasks/task-100/idea-20260818-100000.md",
					"./docs/tasks/task-100/technical-elab-20260818-110000.md",
				],
			},
		);
		expect(prompt).toContain("# Previous Reports");
		expect(prompt).toContain(
			"The following prior stage reports are available in ./docs/tasks/task-100/:",
		);
		expect(prompt).toContain(
			"- ./docs/tasks/task-100/idea-20260818-100000.md",
		);
		expect(prompt).toContain(
			"- ./docs/tasks/task-100/technical-elab-20260818-110000.md",
		);
	});

	it("always uses the stage prompt for the stage section (no per-task override)", () => {
		const engine = new PromptCurationEngine();
		// The per-task prompt override feature was removed: a stale stored
		// task prompt (with or without provenance flags) must never win over
		// the stage's authored prompt.
		const prompt = engine.curatePrompt(
			{
				id: "task-7",
				goal: "Build the API",
				prompt: "Custom stage instructions from the user",
				promptIsCustom: true,
			},
			{ id: "2", name: "Technical Elab", prompt: "Elaborate specs" },
		);
		expect(prompt).toContain("# Stage\nElaborate specs");
		expect(prompt).not.toContain("Custom stage instructions from the user");
	});

	it("ignores a stored task prompt record when the stage has no authored prompt", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{
				id: "task-7",
				goal: "Build the API",
				prompt: "# Task\nCurated by the engine",
			},
			{ id: "2", name: "Technical Elab" },
		);
		// With no stage prompt/description the generic stage default is used —
		// the engine's own stored output must never pin itself.
		expect(prompt).toContain("# Stage\nPerform the current stage of the task.");
	});

	it("includes failure details when provided as string or object", () => {
		const engine = new PromptCurationEngine();
		const promptStr = engine.curatePrompt(
			{ id: "t", goal: "G" },
			{ id: "s", prompt: "P" },
			"Build failed with syntax error",
		);
		expect(promptStr).toContain(
			"# Failure Details\nBuild failed with syntax error",
		);

		const promptObj = engine.curatePrompt(
			{ id: "t", goal: "G" },
			{ id: "s", prompt: "P" },
			{ feedback: "Human rejected: add unit tests" },
		);
		expect(promptObj).toContain(
			"# Failure Details\nHuman rejected: add unit tests",
		);
	});

	it("omits failure details and previous reports when none are supplied", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt({ id: "t", goal: "G" }, { id: "s" });
		expect(prompt).not.toContain("# Failure Details");
		expect(prompt).not.toContain("# Previous Reports");
	});

	it("interpolates dynamic template keywords {{project}}, {{projectRepo}}, {{taskGoal}}, {{taskDocs}}", () => {
		const engine = new PromptCurationEngine();
		const task = {
			id: "task-42",
			title: "Refactor Database",
			goal: "Migrate to SQLite repository",
			project: "KainBain",
			gitRepo: "https://git.example.com/team/KainBain.git",
		};
		const stage = {
			id: "2",
			name: "Tech Elab",
			prompt:
				"Working on {{project}} (Repo: {{projectRepo}}). Goal is {{taskGoal}}. Output files to {{taskDocs}}.",
		};

		const prompt = engine.curatePrompt(task, stage, {
			projectName: "KainBain",
			projectRepo: "https://git.example.com/team/KainBain.git",
			projectCwd: "/home/server/projects/kainbain",
		});

		expect(prompt).toContain(
			"Working on KainBain (Repo: https://git.example.com/team/KainBain.git). Goal is Migrate to SQLite repository. Output files to /home/server/projects/kainbain/docs/tasks/task-42/.",
		);
	});

	it("interpolates {{taskRepo}} as an alias for git repo", () => {
		const engine = new PromptCurationEngine();
		const task = {
			id: "task-99",
			goal: "Add feature",
			gitUrl: "https://git.example.com/team/MyRepo.git",
		};
		const stage = {
			id: "1",
			name: "Spec",
			prompt: "Clone from {{taskRepo}}",
		};
		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain("Clone from https://git.example.com/team/MyRepo.git");
	});

	it("interpolates {{latestReport:<stageSlug>}} with matching report markdown content", () => {
		const engine = new PromptCurationEngine();
		const task = {
			id: "task-50",
			goal: "Build Feature",
			reports: [
				{
					stageSlug: "idea",
					stageName: "Idea",
					content: "# Idea Report\nApproved feature concept.",
				},
				{
					stageSlug: "technical-elab",
					stageName: "Technical Elab",
					content: "# Tech Spec\nArchitecture detailed.",
				},
			],
		};
		const stage = {
			id: "3",
			name: "Plan",
			prompt:
				"Review prior spec:\n{{latestReport:technical-elab}}\nAnd initial idea:\n{{latestReport:idea}}",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain("# Tech Spec\nArchitecture detailed.");
		expect(prompt).toContain("# Idea Report\nApproved feature concept.");
	});

	it("provides graceful fallback when {{latestReport:<stageSlug>}} has no available report", () => {
		const engine = new PromptCurationEngine();
		const task = {
			id: "task-50",
			goal: "Build Feature",
			reports: [],
		};
		const stage = {
			id: "3",
			name: "Plan",
			prompt: "Check spec: {{latestReport:technical-elab}}",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain(
			"Check spec: (No report available for stage technical-elab)",
		);
	});

	it("falls back gracefully for missing project or task variables", () => {
		const engine = new PromptCurationEngine();
		const task = { id: "task-empty" };
		const stage = {
			id: "1",
			prompt:
				"Project: '{{project}}', Repo: '{{projectRepo}}', Goal: '{{taskGoal}}', Docs: '{{taskDocs}}'",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain(
			"Project: 'Project', Repo: '', Goal: '', Docs: './docs/tasks/task-empty/'",
		);
	});

	it("interpolates {{projectRoot}}, {{previousReports}}, and {{latestReportPath}}", () => {
		// Disk-authoritative: the prompt lists the real files in a tmp task
		// folder (phantom metadata entries are dropped).
		const projectCwd = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-prompt-curation-"),
		);
		try {
			const taskDir = path.join(projectCwd, "docs", "tasks", "task-77");
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, "idea-1.md"), "idea");
			fs.writeFileSync(path.join(taskDir, "plan-2.md"), "plan");
			const older = new Date(Date.now() - 2000);
			const newer = new Date();
			fs.utimesSync(path.join(taskDir, "idea-1.md"), older, older);
			fs.utimesSync(path.join(taskDir, "plan-2.md"), newer, newer);
			const engine = new PromptCurationEngine();
			const task = {
				id: "task-77",
				goal: "Ship feature",
				reports: [
					{ stageSlug: "idea", path: "./docs/tasks/task-77/idea-1.md" },
					{ stageSlug: "plan", path: "./docs/tasks/task-77/plan-2.md" },
					{
						stageSlug: "ghost",
						path: "./docs/tasks/task-77/ghost-9.md",
					},
				],
			};
			const stage = {
				id: "3",
				name: "Plan",
				prompt:
					"Root: {{projectRoot}}\nPrior:\n{{previousReports}}\nLatest: {{latestReportPath}}",
			};

			const prompt = engine.curatePrompt(task, stage, {
				projectCwd,
			});

			expect(prompt).toContain(`Root: ${projectCwd}`);
			expect(prompt).toContain(
				"Prior:\n./docs/tasks/task-77/plan-2.md\n./docs/tasks/task-77/idea-1.md",
			);
			expect(prompt).toContain("Latest: ./docs/tasks/task-77/plan-2.md");
			expect(prompt).not.toContain("ghost-9.md");
		} finally {
			fs.rmSync(projectCwd, { recursive: true, force: true });
		}
	});

	it("provides graceful fallbacks for {{projectRoot}}, {{previousReports}}, {{latestReportPath}} when absent", () => {
		const engine = new PromptCurationEngine();
		const task = { id: "task-78", goal: "G" };
		const stage = {
			id: "1",
			prompt:
				"Root: {{projectRoot}} | Prior: {{previousReports}} | Latest: {{latestReportPath}}",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain("Root: ./");
		expect(prompt).toContain("Prior: (No previous stage reports available)");
		expect(prompt).toContain("Latest: (No report available)");
	});

	it("preserves unrecognized template tags in code syntax such as Vue or Handlebars", () => {
		const engine = new PromptCurationEngine();
		const task = { id: "task-code", goal: "Template feature" };
		const stage = {
			id: "1",
			prompt: "Render HTML: <div>{{item.name}}</div> and binding {{v-model}}",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain("<div>{{item.name}}</div> and binding {{v-model}}");
	});

	it("interpolates {{taskId}} and {{stageName}} dynamic context keywords (#35)", () => {
		const engine = new PromptCurationEngine();
		const task = { id: "task-xyz-99", goal: "Build dynamic tokens" };
		const stage = {
			id: "2",
			name: "Architecture & Verification",
			prompt: "Executing Task ID: {{taskId}} in Stage: {{stageName}}",
		};

		const prompt = engine.curatePrompt(task, stage);
		expect(prompt).toContain("Executing Task ID: task-xyz-99 in Stage: Architecture & Verification");
	});
});

describe("formatImageRefs", () => {
	it("returns an empty string for no images (byte-identical prompts)", () => {
		expect(formatImageRefs([])).toBe("");
		expect(formatImageRefs(null)).toBe("");
		expect(formatImageRefs(["", "   "])).toBe("");
	});

	it("formats one relative reference per line with markdown image syntax", () => {
		const block = formatImageRefs(["assets/a.png"]);
		expect(block).toContain("# Task Images");
		expect(block).toContain("- ![image](assets/a.png) — relative to the task folder");
		expect(block).toContain("NEVER inline image bytes as");
	});

	it("lists N references in order", () => {
		const block = formatImageRefs(["assets/a.png", "assets/b.jpeg", "assets/c.webp"]);
		expect(block).toContain("assets/a.png");
		expect(block).toContain("assets/b.jpeg");
		expect(block).toContain("assets/c.webp");
	});

	it("caps references and notes the overflow", () => {
		const refs = Array.from({ length: 13 }, (_, i) => `assets/img-${i + 1}.png`);
		const block = formatImageRefs(refs, { maxRefs: 10 });
		expect(block).toContain("assets/img-10.png");
		expect(block).not.toContain("assets/img-11.png");
		expect(block).toContain("(+3 more images not listed");
	});
});

describe("Task Images prompt section", () => {
	it("omits the section for tasks without images (back-compat)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-plain", goal: "No images here" },
			{ id: "1", name: "Plan" },
		);
		expect(prompt).not.toContain("# Task Images");
	});

	it("injects the provided image references between stage and reporting sections", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-img", goal: "Add image support" },
			{
				id: "2",
				name: "Technical Elab",
				prompt: "Elaborate",
				report: true,
			},
			{ timestamp: "20260818-120000", taskImages: ["assets/shot.png"] },
		);
		expect(prompt).toContain("# Stage\nElaborate");
		expect(prompt).toContain("# Task Images");
		expect(prompt).toContain("- ![image](assets/shot.png)");
		// Section order: # Task Images comes after the stage block, before reports/reporting.
		const stageIdx = prompt.indexOf("# Stage\n");
		const imagesIdx = prompt.indexOf("# Task Images");
		const reportsIdx = prompt.indexOf("# Reporting\n");
		expect(stageIdx).toBeGreaterThan(-1);
		expect(imagesIdx).toBeGreaterThan(stageIdx);
		expect(reportsIdx).toBeGreaterThan(imagesIdx);
	});

	it("places # Task Images before the failure-guidance section when reporting is off (default)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-img", goal: "Add image support" },
			{ id: "2", name: "Plan", prompt: "Elaborate" },
			{ timestamp: "20260818-120000", taskImages: ["assets/shot.png"] },
		);
		const imagesIdx = prompt.indexOf("# Task Images");
		const failureIdx = prompt.indexOf("# Stage Failure Guidance\n");
		expect(imagesIdx).toBeGreaterThan(-1);
		expect(failureIdx).toBeGreaterThan(imagesIdx);
		expect(prompt).not.toContain("# Reporting");
	});

	it("collects image refs from the task assets folder when a project cwd is given", () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-prompt-images-"));
		try {
			const assetsDir = path.join(tempCwd, "docs", "tasks", "task-disk", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "from-disk.png"), Buffer.from([1]));
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{ id: "task-disk", goal: "Disk-collected images" },
				{ id: "1", name: "Plan" },
				{ projectCwd: tempCwd },
			);
			expect(prompt).toContain("- ![image](assets/from-disk.png)");
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});
});

describe("Missing Task Assets prompt section", () => {
	function withTempCwd(fn) {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-prompt-missing-"));
		try {
			return fn(tempCwd);
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	}

	it("warns first, naming the dangling file, when the asset is absent", () => {
		withTempCwd((tempCwd) => {
			fs.mkdirSync(path.join(tempCwd, "docs", "tasks", "task-dangle"), {
				recursive: true,
			});
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{
					id: "task-dangle",
					goal: "Fix the overflow. See ![image.png](assets/image.png).",
				},
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{ projectCwd: tempCwd },
			);
			expect(prompt.startsWith("# Missing Task Assets\n")).toBe(true);
			expect(prompt).toContain("MISSING-ASSET");
			expect(prompt).toContain("assets/image.png");
			expect(prompt).toContain("docs/tasks/task-dangle/assets/image.png");
			expect(prompt.indexOf("# Missing Task Assets")).toBeLessThan(
				prompt.indexOf("# Task\n"),
			);
		});
	});

	it("stays silent when the referenced asset is on disk", () => {
		withTempCwd((tempCwd) => {
			const assetsDir = path.join(tempCwd, "docs", "tasks", "task-healthy", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "image.png"), Buffer.from([1]));
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{
					id: "task-healthy",
					goal: "Fix the overflow. See ![image.png](assets/image.png).",
				},
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{ projectCwd: tempCwd },
			);
			expect(prompt).not.toContain("# Missing Task Assets");
			expect(prompt).not.toContain("MISSING-ASSET");
		});
	});

	it("stays silent for drifted-but-servable refs and for ref-free goals", () => {
		withTempCwd((tempCwd) => {
			const assetsDir = path.join(tempCwd, "docs", "tasks", "task-drift", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "my-shot.png"), Buffer.from([1]));
			const engine = new PromptCurationEngine();
			const drifted = engine.curatePrompt(
				{ id: "task-drift", goal: "See ![s](assets/My Shot.PNG)." },
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{ projectCwd: tempCwd },
			);
			expect(drifted).not.toContain("MISSING-ASSET");
			const plain = engine.curatePrompt(
				{ id: "task-drift", goal: "No references here." },
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{ projectCwd: tempCwd },
			);
			expect(plain).not.toContain("# Missing Task Assets");
		});
	});

	it("also warns on dangling refs carried by failure details", () => {
		withTempCwd((tempCwd) => {
			fs.mkdirSync(path.join(tempCwd, "docs", "tasks", "task-fail"), {
				recursive: true,
			});
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{ id: "task-fail", goal: "Fix it." },
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{
					projectCwd: tempCwd,
					failureDetails: "Prior attempt saw ![x](assets/gone.png).",
				},
			);
			expect(prompt).toContain("MISSING-ASSET");
			expect(prompt).toContain("assets/gone.png");
		});
	});

	it("re-injects the warning first even when a custom layout omits it", () => {
		withTempCwd((tempCwd) => {
			fs.mkdirSync(path.join(tempCwd, "docs", "tasks", "task-custom"), {
				recursive: true,
			});
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{ id: "task-custom", goal: "See ![x](assets/gone.png)." },
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{
					projectCwd: tempCwd,
					promptLayout: "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}",
				},
			);
			expect(prompt).toContain("MISSING-ASSET");
			expect(prompt).toContain("assets/gone.png");
			expect(prompt.startsWith("# Missing Task Assets\n")).toBe(true);
		});
	});

	it("pins the legacy backstop: a dead ref minted before submit-time validation still warns byte-identically", () => {
		// Legacy tasks never resubmit, so the curate-time warning is their
		// only guard: a pre-existing rejection reason shaped exactly like
		// the cf4b6847 case study (feedback literally just the image ref,
		// bytes never uploaded) must render the identical warning block.
		withTempCwd((tempCwd) => {
			fs.mkdirSync(path.join(tempCwd, "docs", "tasks", "task-legacy"), {
				recursive: true,
			});
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{
					id: "task-legacy",
					goal: "Ship the widget.\n\n## Human Correction / Feedback\n![image.png](assets/image.png)",
				},
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{
					projectCwd: tempCwd,
					failureDetails: "Rejected by human review: ![image.png](assets/image.png)",
				},
			);
			const expectedBlock = [
				"# Missing Task Assets",
				"MISSING-ASSET: the task references a file that is not in its assets folder:",
				"- `assets/image.png` — expected at `docs/tasks/task-legacy/assets/image.png`",
				"Do not guess at their visual content. Proceed from source, say the screenshot was unavailable, and continue working — re-uploading the file heals the next run automatically.",
			].join("\n");
			expect(prompt.startsWith(`${expectedBlock}\n`)).toBe(true);
		});
	});

	it("stays silent when the checkout cannot be verified (no project cwd)", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: "task-nocwd", goal: "See ![x](assets/gone.png)." },
			{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
		);
		expect(prompt).not.toContain("MISSING-ASSET");
	});

	it("stays silent when the bytes sit on the task branch (branch flap)", () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-prompt-flap-"));
		try {
			const git = (args) =>
				execFileSync("git", args, {
					cwd: repo,
					stdio: "ignore",
					env: {
						...process.env,
						GIT_CONFIG_GLOBAL: os.devNull,
						GIT_CONFIG_SYSTEM: os.devNull,
					},
				});
			git(["init", "-q", "--initial-branch=main"]);
			git(["config", "user.email", "t@t.t"]);
			git(["config", "user.name", "t"]);
			git(["config", "commit.gpgsign", "false"]);
			const assetsDir = path.join(repo, "docs", "tasks", "task-flap", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "shot.png"), "branch-bytes");
			fs.writeFileSync(path.join(repo, "docs", "tasks", "task-flap", "task.md"), "x");
			git(["add", "."]);
			git(["commit", "-qm", "seed"]);
			git(["checkout", "-qb", "kb/task-flap"]);
			git(["checkout", "-q", "main"]);
			git(["rm", "-q", "-r", "--cached", "docs/tasks/task-flap"]);
			fs.rmSync(path.join(repo, "docs", "tasks", "task-flap"), {
				recursive: true,
				force: true,
			});
			git(["commit", "-qm", "flap away"]);
			const engine = new PromptCurationEngine();
			const prompt = engine.curatePrompt(
				{
					id: "task-flap",
					branch: "kb/task-flap",
					goal: "See ![s](assets/shot.png) and ![g](assets/gone.png).",
				},
				{ id: "1", name: "Plan", type: "agent", prompt: "Make a plan." },
				{ projectCwd: repo },
			);
			// shot.png rides the task branch (the agent's worktree has it);
			// only the genuinely absent gone.png warns.
			expect(prompt).not.toContain("assets/shot.png`");
			expect(prompt).toContain("assets/gone.png");
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});
});
