/***
 * MARK: taskSurvey.test
 * @description Tests for the append-only SURVEY.md service (`api/work/taskSurvey.js`):
 *   path resolution, read/append/answer round-trips, append-only preservation,
 *   validation guards, and the engine-gate predicate.
 ***/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import {
	appendSurveyRound,
	normalizeSurveyFileName,
	outputFileFromSkillAttachment,
	readSurvey,
	resolveQuestionMeOutputFile,
	resolveSurveyGate,
	resolveSurveyPath,
	saveSurveyAnswers,
	spliceRoundsIntoMarkdown,
	stageHasQuestionMe,
	DEFAULT_SURVEY_FILENAME,
} from "./taskSurvey.js";
import { parseSurvey } from "../../shared/survey.js";

let cwd;
const project = null;
const taskId = "t-survey-1";

const q = (overrides = {}) => ({
	id: "q1",
	type: "single",
	text: "Pick one",
	options: ["a", "b"],
	required: true,
	showIf: null,
	...overrides,
});

beforeEach(() => {
	cwd = fs.mkdtempSync(path.join(os.tmpdir(), "survey-test-"));
});

describe("resolveSurveyPath", () => {
	it("lands inside docs/tasks/<taskId>/SURVEY.md and rejects blanks", () => {
		expect(resolveSurveyPath(cwd, project, taskId)).toBe(
			path.join(cwd, "docs", "tasks", taskId, "SURVEY.md"),
		);
		expect(resolveSurveyPath("", project, taskId)).toBeNull();
		expect(resolveSurveyPath(cwd, project, "")).toBeNull();
	});
});

describe("readSurvey", () => {
	it("reports none for a missing file without throwing", () => {
		expect(readSurvey(cwd, project, taskId)).toMatchObject({ exists: false, status: "none", rounds: [] });
	});
});

describe("appendSurveyRound", () => {
	it("creates the file, then appends round 2 preserving round 1 answers", () => {
		const first = appendSurveyRound({ cwd, project, taskId, stage: "s1", questions: [q({ id: "q1" })] });
		expect(first.round).toBe(1);
		saveSurveyAnswers({ cwd, project, taskId, patch: { q1: { selected: ["a"], notes: "why" } } });
		const second = appendSurveyRound({ cwd, project, taskId, stage: "s1", questions: [q({ id: "q2" })] });
		expect(second.round).toBe(2);
		const { rounds } = readSurvey(cwd, project, taskId);
		expect(rounds).toHaveLength(2);
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "why" });
		expect(rounds[1].questions.map((item) => item.id)).toEqual(["q2"]);
	});

	it("rejects an invalid round without touching the file", () => {
		expect(() => appendSurveyRound({ cwd, project, taskId, questions: [{ id: "x", text: "T", options: [] }] })).toThrow("at least one option");
		expect(fs.existsSync(resolveSurveyPath(cwd, project, taskId))).toBe(false);
	});

	it("accepts an explicitly empty round (agent had nothing to ask)", () => {
		const created = appendSurveyRound({ cwd, project, taskId, questions: [] });
		expect(created.status).toBe("empty");
	});
});

describe("saveSurveyAnswers", () => {
	it("404s when no survey exists and 400s on invalid selections", () => {
		expect(() => saveSurveyAnswers({ cwd, project, taskId, patch: {} })).toThrowError(
			expect.objectContaining({ code: "SURVEY_NOT_FOUND" }),
		);
		appendSurveyRound({ cwd, project, taskId, questions: [q({ id: "q1" })] });
		const before = fs.readFileSync(resolveSurveyPath(cwd, project, taskId), "utf8");
		expect(() => saveSurveyAnswers({ cwd, project, taskId, patch: { q1: { selected: ["zzz"] } } })).toThrow("unknown option");
		expect(fs.readFileSync(resolveSurveyPath(cwd, project, taskId), "utf8")).toBe(before);
	});

	it("marks pending until every visible required question is answered", () => {
		appendSurveyRound({
			cwd,
			project,
			taskId,
			questions: [q({ id: "q1", required: false }), q({ id: "q2", showIf: { questionId: "q1", value: "a" } })],
		});
		const partial = saveSurveyAnswers({ cwd, project, taskId, patch: { q1: { selected: ["a"] } } });
		expect(partial.status).toBe("pending");
		expect(partial.missing).toEqual([{ round: 1, id: "q2" }]);
		const done = saveSurveyAnswers({ cwd, project, taskId, patch: { q2: { selected: ["b"], notes: "n" } } });
		expect(done.unknownIds).toEqual([]);
		expect(done.status).toBe("answered");
	});
});

describe("single vs multiple answer persistence", () => {
	it("stores multi-select answers across both options", () => {
		appendSurveyRound({
			cwd,
			project,
			taskId,
			questions: [{ id: "m1", type: "multiple", text: "Pick many", options: ["x", "y", "z"], required: true, showIf: null }],
		});
		const done = saveSurveyAnswers({ cwd, project, taskId, patch: { m1: { selected: ["x", "z"], notes: "both" } } });
		expect(done.status).toBe("answered");
		expect(readSurvey(cwd, project, taskId).rounds[0].answers.m1).toEqual({ selected: ["x", "z"], notes: "both" });
	});
});

describe("spliceRoundsIntoMarkdown", () => {
	it("preserves surrounding prose byte-for-byte", () => {
		const md = `# Survey\n\nCustom intro line.\n\n\`\`\`survey-json\n${JSON.stringify({ round: 1, questions: [], answers: {} })}\n\`\`\`\n`;
		const { rounds } = parseSurvey(md);
		const out = spliceRoundsIntoMarkdown(md, rounds);
		expect(out.startsWith("# Survey\n\nCustom intro line.")).toBe(true);
	});
});

describe("normalizeSurveyFileName", () => {
	it("passes the default through and fills in a missing extension", () => {
		expect(DEFAULT_SURVEY_FILENAME).toBe("SURVEY.md");
		expect(normalizeSurveyFileName("SURVEY.md")).toBe("SURVEY.md");
		expect(normalizeSurveyFileName("FEEDBACK")).toBe("FEEDBACK.md");
		expect(normalizeSurveyFileName("  INTENT_SURVEY.md  ")).toBe("INTENT_SURVEY.md");
		expect(normalizeSurveyFileName("SECURITY_QUESTIONARY.MD")).toBe("SECURITY_QUESTIONARY.MD");
	});

	it("fails safe to the default on blanks and non-string scalars", () => {
		for (const bad of ["", "   ", null, undefined, 0, 42, true, false, [], ["FEEDBACK.md"]]) {
			expect(normalizeSurveyFileName(bad)).toBe("SURVEY.md");
		}
	});

	it("rejects traversal, separators, and control characters", () => {
		for (const bad of ["../SURVEY.md", "..\\SURVEY.md", "a/b.md", "a\\b.md", "..", ".", "...md",
			"FEEDBACK.txt", "notes.json", "FEEDBACK:1.md", "A\0B.md", "A\nB.md", "A\rB.md",
			".md", ".hidden.md", "x".repeat(65) + ".md"]) {
			expect(normalizeSurveyFileName(bad)).toBe("SURVEY.md");
		}
	});

	it("unwraps skill-keyword { value } forms", () => {
		expect(normalizeSurveyFileName({ value: "FEEDBACK.md" })).toBe("FEEDBACK.md");
		expect(normalizeSurveyFileName({ value: "" })).toBe("SURVEY.md");
		expect(normalizeSurveyFileName({ other: "FEEDBACK.md" })).toBe("SURVEY.md");
	});
});

describe("outputFileFromSkillAttachment / resolveQuestionMeOutputFile", () => {
	const stageWith = (config) => ({ id: "ask", skills: [{ name: "question-me", config }] });

	it("defaults when no skill or no config is present", () => {
		expect(resolveQuestionMeOutputFile(null)).toBe("SURVEY.md");
		expect(resolveQuestionMeOutputFile({})).toBe("SURVEY.md");
		expect(resolveQuestionMeOutputFile({ skills: [] })).toBe("SURVEY.md");
		expect(resolveQuestionMeOutputFile({ skills: [{ name: "other", config: { outputFile: "X.md" } }] })).toBe("SURVEY.md");
		expect(outputFileFromSkillAttachment({ skills: [{ name: "question-me" }] })).toBeNull();
	});

	it("reads the canonical key and every alias", () => {
		expect(resolveQuestionMeOutputFile(stageWith({ outputFile: "FEEDBACK.md" }))).toBe("FEEDBACK.md");
		for (const key of ["surveyFile", "surveyFileName", "fileName", "targetFile", "file"]) {
			expect(resolveQuestionMeOutputFile(stageWith({ [key]: "SECURITY_QUESTIONARY.md" }))).toBe("SECURITY_QUESTIONARY.md");
		}
	});

	it("normalizes through the same fail-safe rules and matches case-insensitively", () => {
		expect(resolveQuestionMeOutputFile(stageWith({ outputFile: "../evil.md" }))).toBe("SURVEY.md");
		expect(resolveQuestionMeOutputFile(stageWith({ outputFile: "FEEDBACK" }))).toBe("FEEDBACK.md");
		expect(resolveQuestionMeOutputFile({ skills: ["Question-Me"] })).toBe("SURVEY.md");
		expect(resolveQuestionMeOutputFile("INTENT_SURVEY.md")).toBe("INTENT_SURVEY.md");
	});
});

describe("configurable survey files", () => {
	it("resolves paths per configured file and keeps the default form working", () => {
		const custom = { id: "ask", skills: [{ name: "question-me", config: { outputFile: "FEEDBACK.md" } }] };
		expect(resolveSurveyPath(cwd, project, taskId)).toBe(
			path.join(cwd, "docs", "tasks", taskId, "SURVEY.md"),
		);
		expect(resolveSurveyPath(cwd, project, taskId, custom)).toBe(
			path.join(cwd, "docs", "tasks", taskId, "FEEDBACK.md"),
		);
		expect(resolveSurveyPath(cwd, project, taskId, "INTENT_SURVEY.md")).toBe(
			path.join(cwd, "docs", "tasks", taskId, "INTENT_SURVEY.md"),
		);
	});

	it("round-trips a custom file without touching SURVEY.md", () => {
		const fileArgs = { cwd, project, taskId, outputFile: "FEEDBACK.md" };
		const created = appendSurveyRound({ ...fileArgs, stage: "ask", questions: [q({ id: "q1" })] });
		expect(created.round).toBe(1);
		expect(readSurvey(cwd, project, taskId, "FEEDBACK.md").status).toBe("pending");
		expect(readSurvey(cwd, project, taskId)).toMatchObject({ exists: false, status: "none" });
		const done = saveSurveyAnswers({ ...fileArgs, patch: { q1: { selected: ["a"] } } });
		expect(done.status).toBe("answered");
		const second = appendSurveyRound({ ...fileArgs, stage: "ask", questions: [q({ id: "q2" })] });
		expect(second.round).toBe(2);
		const { rounds } = readSurvey(cwd, project, taskId, "FEEDBACK.md");
		expect(rounds).toHaveLength(2);
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "" });
		expect(fs.existsSync(path.join(cwd, "docs", "tasks", taskId, "SURVEY.md"))).toBe(false);
	});

	it("resolves the file from a stage object on read, append, and save", () => {
		const stage = { id: "ask", skills: [{ name: "question-me", config: { outputFile: "SECURITY_QUESTIONARY.md" } }] };
		appendSurveyRound({ cwd, project, taskId, stage, questions: [q({ id: "q1" })] });
		expect(readSurvey(cwd, project, taskId, stage).status).toBe("pending");
		saveSurveyAnswers({ cwd, project, taskId, stage, patch: { q1: { selected: ["b"] } } });
		expect(readSurvey(cwd, project, taskId, stage).status).toBe("answered");
	});
});

describe("stageHasQuestionMe / resolveSurveyGate", () => {
	it("detects the skill case-insensitively and tolerates string entries", () => {
		expect(stageHasQuestionMe({ skills: [{ name: "Question-Me" }] })).toBe(true);
		expect(stageHasQuestionMe({ skills: ["question-me"] })).toBe(true);
		expect(stageHasQuestionMe({ skills: [{ name: "other" }] })).toBe(false);
		expect(stageHasQuestionMe({})).toBe(false);
	});

	it("parks on none/pending, advances on empty/answered or without the skill", () => {
		const stage = { skills: [{ name: "question-me" }] };
		expect(resolveSurveyGate(stage, [])).toMatchObject({ park: true, status: "none" });
		expect(resolveSurveyGate(stage, [{ round: 1, questions: [], answers: {} }])).toMatchObject({ park: false, status: "empty" });
		expect(resolveSurveyGate(stage, [{ round: 1, questions: [q()], answers: {} }])).toMatchObject({ park: true, status: "pending" });
		expect(resolveSurveyGate({ skills: [] }, [])).toMatchObject({ park: false });
	});
});
