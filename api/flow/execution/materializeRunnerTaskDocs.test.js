import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyAnswers, parseSurvey, renderSurveyMarkdown } from "../../../shared/survey.js";
import { materializeRunnerTaskDocs } from "./materializeRunnerTaskDocs.js";

const surveyQuestion = (overrides = {}) => ({
	id: "q1",
	type: "single",
	text: "Pick one",
	options: ["a", "b"],
	required: true,
	showIf: null,
	...overrides,
});

const surveyRound = (overrides = {}) => ({
	round: 1,
	generatedAt: "2026-11-04T00:00:00.000Z",
	stage: "ask",
	questions: [surveyQuestion()],
	answers: {},
	...overrides,
});

const withAnswers = (markdown, patch) => renderSurveyMarkdown(applyAnswers(parseSurvey(markdown).rounds, patch).rounds);

describe("materializeRunnerTaskDocs", () => {
	let cwd;
	beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-mat-")); });
	afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });
	it("writes runner files into the backend task folder", () => {
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [{ name: "IMPLEMENTATION_PLAN.md", content: "plan-body" }] });
		expect(out.written).toEqual(["IMPLEMENTATION_PLAN.md"]);
		expect(fs.readFileSync(path.join(cwd, "docs/tasks/t1/IMPLEMENTATION_PLAN.md"), "utf8")).toBe("plan-body");
	});
	it("never overwrites task.md, blocks traversal, caps size", () => {
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [
			{ name: "task.md", content: "evil" },
			{ name: "../../escape.md", content: "x" },
			{ name: "big.md", content: "x".repeat(300 * 1024) },
		]});
		expect(out.written).toEqual(["escape.md"]);
		expect(fs.existsSync(path.join(cwd, "docs/tasks/t1/task.md"))).toBe(false);
		expect(fs.existsSync(path.join(cwd, "escape.md"))).toBe(false);
		expect(fs.readFileSync(path.join(cwd, "docs/tasks/t1/escape.md"), "utf8")).toBe("x");
	});

	it("merges a stale runner survey over backend answers instead of wiping them", () => {
		const stale = renderSurveyMarkdown([surveyRound()]);
		const backendFile = path.join(cwd, "docs/tasks/t1/SURVEY.md");
		fs.mkdirSync(path.dirname(backendFile), { recursive: true });
		fs.writeFileSync(backendFile, withAnswers(stale, { q1: { selected: ["a"], notes: "human" } }), "utf8");
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [{ name: "SURVEY.md", content: stale }] });
		// Nothing is rewritten: the merged bytes equal the backend file, but the
		// merge still engaged (backend answers survived the stale shipment).
		expect(out.written).toEqual([]);
		expect(out.merged).toEqual(["SURVEY.md"]);
		const { rounds } = parseSurvey(fs.readFileSync(backendFile, "utf8"));
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "human" });
	});

	it("lands runner-added rounds while keeping backend answers", () => {
		const round1 = surveyRound();
		const backendFile = path.join(cwd, "docs/tasks/t1/SURVEY.md");
		fs.mkdirSync(path.dirname(backendFile), { recursive: true });
		fs.writeFileSync(backendFile, withAnswers(renderSurveyMarkdown([round1]), { q1: { selected: ["b"], notes: "" } }), "utf8");
		const incoming = renderSurveyMarkdown([round1, surveyRound({ round: 2, questions: [surveyQuestion({ id: "q2" })] })]);
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [{ name: "SURVEY.md", content: incoming }] });
		expect(out.merged).toEqual(["SURVEY.md"]);
		const { rounds } = parseSurvey(fs.readFileSync(backendFile, "utf8"));
		expect(rounds).toHaveLength(2);
		expect(rounds[0].answers.q1).toEqual({ selected: ["b"], notes: "" });
		expect(rounds[1].questions.map((question) => question.id)).toEqual(["q2"]);
	});

	it("writes a survey file as-is when the backend has none yet", () => {
		const incoming = renderSurveyMarkdown([surveyRound()]);
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [{ name: "SURVEY.md", content: incoming }] });
		expect(out.written).toEqual(["SURVEY.md"]);
		expect(out.merged).toEqual([]);
		expect(fs.readFileSync(path.join(cwd, "docs/tasks/t1/SURVEY.md"), "utf8")).toBe(incoming);
	});
});
