import { describe, it, expect } from "vitest";
import {
	PromptCurationEngine,
	buildInterpolationContext,
	resolveStageCustomKeywords,
	interpolatePromptKeywords,
} from "./promptCuration.js";
import {
	STAGE_KEYWORD_TOKENS,
	STAGE_KEYWORD_TOKEN_KINDS,
} from "../shared/stageKeywordTokens.js";
import { SECTION_TOKENS, isInlineKeyword } from "../shared/promptLayout.js";

/***
 * MARK: CI keyword unit tests
 * @description Covers the keyword machinery CI command interpolation relies
 *   on: the shared context builder (precedence + parity with the prompt
 *   engine), stage-skill custom keywords, the shell-safe
 *   `latestReportPath:<slug>` token, and consistency between the shared UI
 *   token catalogue and the backend resolver.
 ***/

describe("buildInterpolationContext", () => {
	it("matches the prompt engine context for the same inputs", () => {
		const task = {
			id: "task-1",
			goal: "Ship it",
			projectName: "KainBain",
			gitUrl: "https://git.example.com/team/repo.git",
			reports: [{ stageSlug: "idea", path: "./docs/tasks/task-1/idea.md" }],
		};
		const stage = { id: "s1", name: "Plan" };
		const options = { projectCwd: "/repo", timestamp: "20261017-220000" };

		const direct = buildInterpolationContext({ task, stage, options });
		expect(direct).toEqual({
			task,
			stage,
			project: task.project,
			projectName: "KainBain",
			projectRepo: "https://git.example.com/team/repo.git",
			taskRepo: "https://git.example.com/team/repo.git",
			projectCwd: "/repo",
			taskDocs: undefined,
			reports: task.reports,
			latestReports: [],
		});

		// The engine prompt carries the same interpolated values.
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(task, { ...stage, prompt: "Docs: {{taskDocs}}" }, options);
		expect(prompt).toContain("Docs: /repo/docs/tasks/task-1/");
		expect(interpolatePromptKeywords("Docs: {{taskDocs}}", direct)).toContain(
			"/repo/docs/tasks/task-1/",
		);
	});

	it("prefers explicit fields over the options bag over task fields", () => {
		const task = { id: "t1", projectName: "TaskProject", projectCwd: "/task-cwd" };
		const context = buildInterpolationContext({
			task,
			projectName: "Explicit",
			options: { projectName: "Options", projectCwd: "/options-cwd" },
		});
		expect(context.projectName).toBe("Explicit");
		// No explicit projectCwd: the options bag wins over the task field.
		expect(context.projectCwd).toBe("/options-cwd");
	});

	it("tolerates missing task, stage, and options", () => {
		const context = buildInterpolationContext();
		expect(context.task).toEqual({});
		expect(context.stage).toEqual({});
		expect(interpolatePromptKeywords("{{taskDocs}}|{{projectRoot}}", context)).toBe(
			"./docs/tasks/unassigned/|./",
		);
	});
});

describe("resolveStageCustomKeywords", () => {
	it("returns null when the stage attaches no skills", () => {
		expect(resolveStageCustomKeywords({})).toBeNull();
		expect(resolveStageCustomKeywords({ skills: [] })).toBeNull();
		expect(resolveStageCustomKeywords(null)).toBeNull();
	});

	it("resolves keywords through the loader with per-stage config winning", () => {
		const loadSkill = () => ({
			keywords: { target: "default-target" },
		});
		const stage = {
			skills: [{ name: "deploy", config: { target: "prod-override" } }],
		};
		expect(resolveStageCustomKeywords(stage, "/repo", loadSkill)).toEqual({
			target: "prod-override",
		});
	});

	it("skips missing, invalid, and nameless attachments", () => {
		const loadSkill = (name) =>
			name === "good"
				? { keywords: { key: "v" } }
				: name === "bad"
					? { invalid: true }
					: null;
		const stage = {
			skills: [{ name: "good" }, { name: "bad" }, { name: "missing" }, {}],
		};
		expect(resolveStageCustomKeywords(stage, "/repo", loadSkill)).toEqual({
			key: "v",
		});
		expect(
			resolveStageCustomKeywords(
				{ skills: [{ name: "missing" }] },
				"/repo",
				() => null,
			),
		).toBeNull();
	});
});

describe("latestReportPath:<slug>", () => {
	const reports = [
		{
			stageSlug: "idea",
			stageName: "Idea",
			path: "./docs/tasks/t1/idea-20261017-1.md",
			content: "# Idea\nbig body that must never land in a shell command",
		},
		{
			stageSlug: "plan",
			stageName: "Plan",
			path: "./docs/tasks/t1/plan-20261017-2.md",
			content: "# Plan\nsteps",
		},
		{
			stageSlug: "plan",
			stageName: "Plan",
			path: "./docs/tasks/t1/plan-20261017-3.md",
			content: "# Plan v2\nrevised steps",
		},
	];

	it("resolves the latest matching report path, never content", () => {
		const out = interpolatePromptKeywords("test -f '{{latestReportPath:plan}}'", {
			task: { id: "t1", reports },
		});
		expect(out).toBe("test -f './docs/tasks/t1/plan-20261017-3.md'");
	});

	it("matches by stage name slug as well as stageSlug", () => {
		const out = interpolatePromptKeywords("{{latestReportPath:Idea}}", {
			task: { id: "t1", reports },
		});
		expect(out).toBe("./docs/tasks/t1/idea-20261017-1.md");
	});

	it("falls back visibly when no report matches", () => {
		const out = interpolatePromptKeywords("{{latestReportPath:spec}}", {
			task: { id: "t1", reports },
		});
		expect(out).toBe("(No report available for stage spec)");
	});

	it("leaves unknown tokens literal", () => {
		expect(
			interpolatePromptKeywords("echo {{sendMessage}} {{taskDocs}}", {
				task: { id: "t1" },
				projectCwd: "/repo",
			}),
		).toBe("echo {{sendMessage}} /repo/docs/tasks/t1/");
	});
});

describe("shared stage keyword catalogue consistency", () => {
	const catalogueContext = () => ({
		task: {
			id: "task-9",
			goal: "Prove keywords",
			projectName: "KainBain",
			gitUrl: "https://git.example.com/team/repo.git",
			reports: [
				{
					stageSlug: "plan",
					stageName: "Plan",
					path: "./docs/tasks/task-9/plan-20261017.md",
					content: "# Plan",
				},
			],
		},
		stage: { id: "ci-1", name: "Verify plan" },
		project: { name: "KainBain" },
		projectCwd: "/repo",
	});

	it("lists every token exactly once with a known kind", () => {
		const tokens = STAGE_KEYWORD_TOKENS.map((entry) => entry.token);
		expect(new Set(tokens).size).toBe(tokens.length);
		for (const entry of STAGE_KEYWORD_TOKENS) {
			expect(entry.token).toMatch(/^\{\{[^}]+\}\}$/);
			expect(entry.label).toBeTruthy();
			expect(entry.hint).toBeTruthy();
			expect(STAGE_KEYWORD_TOKEN_KINDS).toContain(entry.kind);
		}
	});

	it("resolves every catalogue token through the backend engine", () => {
		const context = buildInterpolationContext(catalogueContext());
		for (const entry of STAGE_KEYWORD_TOKENS) {
			const resolved = interpolatePromptKeywords(entry.token, context);
			// Resolved means the literal token is gone (a visible fallback
			// still counts — it fails loud in logs instead of silently empty).
			expect(
				resolved,
				`${entry.token} must resolve through interpolatePromptKeywords`,
			).not.toContain(entry.token);
			expect(resolved.trim().length).toBeGreaterThan(0);
		}
	});

	it("recognises every catalogue token in the shared layout system", () => {
		for (const entry of STAGE_KEYWORD_TOKENS) {
			const name = entry.token.slice(2, -2).trim();
			const parametric = name.replace(/:[^:]+$/, ":<slug>");
			const recognised =
				SECTION_TOKENS.includes(name) ||
				isInlineKeyword(name) ||
				isInlineKeyword(parametric);
			expect(
				recognised,
				`${entry.token} must be a section or inline layout token`,
			).toBe(true);
		}
	});
});
