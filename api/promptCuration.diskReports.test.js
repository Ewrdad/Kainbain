import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	PromptCurationEngine,
	formatPreviousReportsSection,
} from "./promptCuration.js";

/***
 * MARK: promptCuration disk-authoritative Previous Reports
 * @description Regression tests for the phantom-reports fix: the
 *   `# Previous Reports` section (and the `{{previousReports}}` /
 *   `{{latestReport*}}` keywords) must enumerate the files actually present
 *   in `docs/tasks/<taskId>/` — never stale, planned, or templated
 *   filenames from `task.reports` metadata.
 * @example run `npm run test --prefix api -- promptCuration.diskReports`
 ***/
describe("PromptCurationEngine disk-authoritative Previous Reports", () => {
	let projectCwd;

	beforeEach(() => {
		projectCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-disk-reports-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(projectCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const seedTaskDir = (taskId, names, docsDirName = "docs") => {
		const dir = path.join(projectCwd, docsDirName, "tasks", taskId);
		fs.mkdirSync(dir, { recursive: true });
		const base = Date.now() - names.length * 1000;
		names.forEach((name, index) => {
			const target = path.join(dir, name);
			fs.writeFileSync(target, `# ${name}\n`);
			const mtime = new Date(base + index * 1000);
			fs.utimesSync(target, mtime, mtime);
		});
		return dir;
	};

	const reportLines = (prompt) => {
		const section = prompt.split("# Previous Reports")[1] || "";
		return section
			.split("\n")
			.filter((line) => line.startsWith("- ./"))
			.map((line) => line.replace(/^-\s*/, "").trim());
	};

	it("omits phantom metadata reports and lists only files on disk", () => {
		const taskId = "task-phantom-1";
		seedTaskDir(taskId, ["SURVEY.md", "REAL.md"]);
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{
				id: taskId,
				goal: "G",
				reports: [
					{ stageSlug: "idea", path: `./docs/tasks/${taskId}/idea-20261116-072137.md` },
					{ stageSlug: "plan", path: `./docs/tasks/${taskId}/review-plan-20261116-082151.md` },
				],
			},
			{ id: "s", name: "Code", prompt: "P" },
			{
				projectCwd,
				previousReports: [
					`./docs/tasks/${taskId}/idea-20261116-072137.md`,
					`./docs/tasks/${taskId}/review-plan-20261116-082151.md`,
				],
			},
		);
		expect(prompt).not.toContain("idea-20261116-072137.md");
		expect(prompt).not.toContain("review-plan-20261116-082151.md");
		expect(prompt).toContain(`- ./docs/tasks/${taskId}/REAL.md`);
		expect(prompt).toContain(`- ./docs/tasks/${taskId}/SURVEY.md`);
		expect(prompt).toContain(
			`The following files are present in ./docs/tasks/${taskId}/:`,
		);
	});

	it("lists a manually created file that has no report metadata", () => {
		const taskId = "task-manual-1";
		seedTaskDir(taskId, ["MY_NOTES.md"]);
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: taskId, goal: "G", reports: [] },
			{ id: "s", name: "Code", prompt: "P" },
			{ projectCwd },
		);
		expect(prompt).toContain(`- ./docs/tasks/${taskId}/MY_NOTES.md`);
	});

	it("orders newest first, includes pngs, and excludes task.md", () => {
		const taskId = "task-order-1";
		// Seeded oldest-first so disk mtime order is a, b, c.
		const dir = seedTaskDir(taskId, ["a.md", "shot.png", "c.md"]);
		fs.writeFileSync(path.join(dir, "task.md"), "metadata");
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: taskId, goal: "G" },
			{ id: "s", name: "Code", prompt: "P" },
			{ projectCwd },
		);
		expect(reportLines(prompt)).toEqual([
			`./docs/tasks/${taskId}/c.md`,
			`./docs/tasks/${taskId}/shot.png`,
			`./docs/tasks/${taskId}/a.md`,
		]);
		expect(prompt).not.toContain("task.md");
	});

	it("caps the section at 5 with an overflow pointer", () => {
		const taskId = "task-cap-1";
		seedTaskDir(taskId, ["1.md", "2.md", "3.md", "4.md", "5.md", "6.md", "7.md"]);
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: taskId, goal: "G" },
			{ id: "s", name: "Code", prompt: "P" },
			{ projectCwd },
		);
		expect(reportLines(prompt)).toHaveLength(5);
		expect(prompt).toContain(
			`(+2 more files not listed; list ./docs/tasks/${taskId}/ to see them)`,
		);
	});

	it("caps and un-caps the section builder at its boundaries", () => {
		const files = ["a.md", "b.md", "c.md"].map(
			(name) => `./docs/tasks/t/${name}`,
		);
		const capped = formatPreviousReportsSection(files, {
			maxRefs: 2,
			docsDirName: "docs",
			taskId: "t",
		});
		expect(capped).toContain("- ./docs/tasks/t/a.md");
		expect(capped).toContain("- ./docs/tasks/t/b.md");
		expect(capped).not.toContain("- ./docs/tasks/t/c.md");
		expect(capped).toContain("(+1 more files not listed;");
		const all = formatPreviousReportsSection(files, {
			maxRefs: 0,
			docsDirName: "docs",
			taskId: "t",
		});
		expect(all).toContain("- ./docs/tasks/t/c.md");
		expect(all).not.toContain("more files not listed");
	});

	it("renders an explicit none-yet line for an empty or missing folder", () => {
		const engine = new PromptCurationEngine();
		for (const taskId of ["task-empty-1", "task-missing-1"]) {
			if (taskId === "task-empty-1") {
				fs.mkdirSync(path.join(projectCwd, "docs", "tasks", taskId), {
					recursive: true,
				});
			}
			const prompt = engine.curatePrompt(
				{ id: taskId, goal: "G" },
				{ id: "s", name: "Code", prompt: "P" },
				{ projectCwd },
			);
			expect(prompt).toContain("# Previous Reports");
			expect(prompt).toContain("No previous reports are available yet");
		}
	});

	it("keeps the legacy passthrough byte-identical when no projectCwd is set", () => {
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
		expect(prompt).toContain(
			"The following prior stage reports are available in ./docs/tasks/task-100/:",
		);
		expect(prompt).toContain("- ./docs/tasks/task-100/idea-20260818-100000.md");
		expect(prompt).toContain(
			"- ./docs/tasks/task-100/technical-elab-20260818-110000.md",
		);
	});

	it("enumerates a custom docsDirName folder", () => {
		const taskId = "task-docsdir-1";
		seedTaskDir(taskId, ["NOTE.md"], "kainbain-docs");
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{ id: taskId, goal: "G" },
			{ id: "s", name: "Plan", prompt: "P" },
			{
				projectCwd,
				project: { docsDirName: "kainbain-docs" },
				previousReports: ["./docs/tasks/task-1/stale.md"],
			},
		);
		expect(prompt).toContain(`- ./kainbain-docs/tasks/${taskId}/NOTE.md`);
		expect(prompt).not.toContain("stale.md");
	});

	it("makes {{previousReports}} disk-authoritative and never returns a phantom latest path", () => {
		const taskId = "task-kw-1";
		seedTaskDir(taskId, ["real-a.md", "real-b.md"]);
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{
				id: taskId,
				goal: "G",
				reports: [
					{ stageSlug: "idea", path: `./docs/tasks/${taskId}/phantom-idea.md` },
				],
			},
			{
				id: "s",
				name: "Code",
				prompt: "Prior:\n{{previousReports}}\nLatest: {{latestReportPath}}",
			},
			{ projectCwd },
		);
		expect(prompt).not.toContain("phantom-idea.md");
		expect(prompt).toContain(
			`Prior:\n./docs/tasks/${taskId}/real-b.md\n./docs/tasks/${taskId}/real-a.md`,
		);
		expect(prompt).toContain(`Latest: ./docs/tasks/${taskId}/real-b.md`);
	});

	it("returns {{latestReport:<slug>}} content only for on-disk reports", () => {
		const taskId = "task-kwslug-1";
		seedTaskDir(taskId, ["plan-20261116-000000.md"]);
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{
				id: taskId,
				goal: "G",
				reports: [
					{
						stageSlug: "plan",
						path: `./docs/tasks/${taskId}/plan-20261116-000000.md`,
						filename: "plan-20261116-000000.md",
						content: "real plan content",
					},
					{
						stageSlug: "idea",
						path: `./docs/tasks/${taskId}/phantom-idea.md`,
						filename: "phantom-idea.md",
						content: "phantom content",
					},
				],
			},
			{
				id: "s",
				name: "Code",
				prompt: "Plan: {{latestReport:plan}} | Idea: {{latestReport:idea}}",
			},
			{ projectCwd },
		);
		expect(prompt).toContain("Plan: real plan content");
		expect(prompt).not.toContain("phantom content");
		expect(prompt).toContain("Idea: (No report available for stage idea)");
	});

	it("case-study regression: 0d29c64c-style phantoms never render and every listed file exists", () => {
		const taskId = "task-case-1";
		const dir = seedTaskDir(taskId, [
			"SURVEY.md",
			"IMPLEMENTATION_PLAN.md",
			"OVERFLOW_FIX_NOTE.md",
			"code-standards-review-20261116.md",
			"install-safety-verdict-20261116.md",
			"stage-review-20261116.md",
			"overflow-after-1440.png",
			"overflow-after-320.png",
			"overflow-after-768.png",
		]);
		const phantoms = [
			"idea-20261115-222653.md",
			"review-plan-20261115-223714.md",
			"automated-tests-failure-20261115-233558.md",
			"final-review-20261116-064824.md",
		];
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(
			{
				id: taskId,
				goal: "G",
				reports: phantoms.map((filename) => ({
					path: `./docs/tasks/${taskId}/${filename}`,
					filename,
				})),
			},
			{ id: "s", name: "Retrospective", prompt: "P" },
			{
				projectCwd,
				previousReports: phantoms.map(
					(filename) => `./docs/tasks/${taskId}/${filename}`,
				),
			},
		);
		for (const phantom of phantoms) {
			expect(prompt).not.toContain(phantom);
		}
		const listed = reportLines(prompt);
		expect(listed.length).toBeGreaterThan(0);
		for (const rel of listed) {
			const basename = rel.split("/").pop();
			expect(fs.existsSync(path.join(dir, basename))).toBe(true);
		}
	});
});
