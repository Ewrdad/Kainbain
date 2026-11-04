/***
 * MARK: survey.shared.test
 * @description Unit tests for the runtime-agnostic survey model in
 *   `shared/survey.js` (multi-round parse, append-only numbering, validation,
 *   conditional visibility, completion status, answer merging).
 ***/
import { describe, it, expect } from "vitest";

import {
	appendRound,
	applyAnswers,
	combinedAnswers,
	extractFenceBlocks,
	isQuestionVisible,
	mergeSurveyDocuments,
	parseSurvey,
	renderSurveyMarkdown,
	serializeRound,
	surveyStatus,
	unansweredRequired,
	validateSurvey,
} from "../shared/survey.js";

const q = (overrides = {}) => ({
	id: "q1",
	type: "single",
	text: "What?",
	options: ["a", "b"],
	required: true,
	showIf: null,
	...overrides,
});

const round = (overrides = {}) => ({
	round: 1,
	generatedAt: "2026-10-18T00:00:00.000Z",
	stage: "s1",
	questions: [q()],
	answers: {},
	...overrides,
});

describe("extractFenceBlocks", () => {
	it("finds every survey-json block in order and ignores other fences", () => {
		const md = [
			"# Survey",
			"```survey-json",
			'{"round":1}',
			"```",
			"```js",
			"not a survey",
			"```",
			"```survey-json",
			'{"round":2}',
			"```",
		].join("\n");
		expect(extractFenceBlocks(md)).toEqual(['{"round":1}\n', '{"round":2}\n']);
	});

	it("returns [] for non-string input", () => {
		expect(extractFenceBlocks(null)).toEqual([]);
		expect(extractFenceBlocks("no fences")).toEqual([]);
	});
});

describe("parseSurvey", () => {
	it("parses multiple rounds and reports invalid blocks without throwing", () => {
		const md = [
			"```survey-json",
			JSON.stringify({ round: 1, questions: [], answers: {} }),
			"```",
			"```survey-json",
			"not json",
			"```",
			"```survey-json",
			JSON.stringify({ round: 5, questions: [{ id: "q9", text: "T", options: ["x"] }], answers: {} }),
			"```",
		].join("\n");
		const { rounds, errors } = parseSurvey(md);
		expect(rounds).toHaveLength(2);
		expect(rounds[1].questions[0]).toMatchObject({ id: "q9", type: "single", required: false });
		expect(errors).toHaveLength(1);
	});

	it("fills defaults for sparse agent-authored blocks", () => {
		const { rounds } = parseSurvey(`\`\`\`survey-json\n${JSON.stringify({ questions: [{ id: "q1" }] })}\n\`\`\``);
		expect(rounds[0]).toMatchObject({ round: 1, answers: {} });
		expect(rounds[0].questions[0]).toMatchObject({ type: "single", required: false, showIf: null });
	});
});

describe("serializeRound / renderSurveyMarkdown", () => {
	it("round-trips through parse", () => {
		const md = renderSurveyMarkdown([round(), round({ round: 2, questions: [] })]);
		expect(md).toContain("## Round 1");
		expect(md).toContain("## Round 2");
		const { rounds, errors } = parseSurvey(md);
		expect(errors).toEqual([]);
		expect(rounds).toHaveLength(2);
		expect(serializeRound(rounds[0])).toContain('"id": "q1"');
	});
});

describe("appendRound", () => {
	it("creates round 1 from an empty document", () => {
		const md = appendRound("", { stage: "s1", questions: [q()] });
		expect(md).toContain("## Round 1");
		expect(parseSurvey(md).rounds).toHaveLength(1);
	});

	it("appends the next round number and preserves earlier answers", () => {
		const first = appendRound("", { questions: [q({ id: "q1" })] });
		const { rounds } = applyAnswers(parseSurvey(first).rounds, { q1: { selected: ["a"], notes: "n" } });
		const withAnswers = renderSurveyMarkdown(rounds);
		const second = appendRound(withAnswers, { questions: [q({ id: "q2" })] });
		const parsed = parseSurvey(second);
		expect(parsed.rounds).toHaveLength(2);
		expect(parsed.rounds[1].round).toBe(2);
		expect(parsed.rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "n" });
		expect(second).toContain("## Round 1");
	});

	it("continues numbering from the max round, not the count", () => {
		const md = renderSurveyMarkdown([round({ round: 1 }), round({ round: 7 })]);
		expect(appendRound(md, { questions: [] })).toContain("## Round 8");
	});
});

describe("validateSurvey", () => {
	it("accepts an empty round list and an explicitly empty round", () => {
		expect(validateSurvey([])).toEqual({ ok: true, errors: [] });
		expect(validateSurvey([round({ questions: [] })]).ok).toBe(true);
	});

	it("rejects duplicates, missing text/options, and bad showIf", () => {
		const { ok, errors } = validateSurvey([
			round({
				questions: [
					q({ id: "dup" }),
					q({ id: "dup", text: "", options: [] }),
					q({ id: "cond", showIf: { questionId: "nope", value: "a" } }),
					q({ id: "self", showIf: { questionId: "self", value: "a" } }),
					q({ id: "str", showIf: 'q1 === "a"' }),
				],
			}),
		]);
		expect(ok).toBe(false);
		expect(errors.join("\n")).toMatch("duplicate id");
		expect(errors.join("\n")).toMatch("text is required");
		expect(errors.join("\n")).toMatch("at least one option");
		expect(errors.join("\n")).toMatch("unknown question 'nope'");
		expect(errors.join("\n")).toMatch("must not reference its own question");
		expect(errors.join("\n")).toMatch("showIf must be null");
	});

	it("allows forward-visible references from earlier questions and earlier rounds", () => {
		const { ok, errors } = validateSurvey([
			round({ questions: [q({ id: "q1", required: false }), q({ id: "q2", required: false, showIf: { questionId: "q1", value: "a" } })] }),
			round({ round: 2, questions: [q({ id: "q3", required: false, showIf: { questionId: "q1", values: ["a", "b"] } })], answers: {} }),
		]);
		expect(errors).toEqual([]);
		expect(ok).toBe(true);
	});

	it("rejects answers that violate options, single-choice, and unknown ids", () => {
		const { ok, errors } = validateSurvey([
			round({
				answers: {
					q1: { selected: ["zzz"] },
					ghost: { selected: ["a"] },
				},
			}),
		]);
		expect(ok).toBe(false);
		expect(errors.join("\n")).toMatch("unknown option");
		expect(errors.join("\n")).toMatch("unknown question 'ghost'");
	});
});

describe("isQuestionVisible", () => {
	it("shows unconditional questions and matches value/values forms", () => {
		expect(isQuestionVisible({ showIf: null }, {})).toBe(true);
		const cond = { showIf: { questionId: "q1", value: "a" } };
		expect(isQuestionVisible(cond, { q1: { selected: ["a"] } })).toBe(true);
		expect(isQuestionVisible(cond, { q1: { selected: ["b"] } })).toBe(false);
		expect(isQuestionVisible(cond, {})).toBe(false);
		expect(
			isQuestionVisible({ showIf: { questionId: "q1", values: ["b", "c"] } }, { q1: { selected: ["c"] } }),
		).toBe(true);
	});

	it("fail-closes when the referenced question is unknown", () => {
		const cond = { showIf: { questionId: "ghost", value: "a" } };
		expect(isQuestionVisible(cond, {}, new Set(["q1"]))).toBe(false);
	});
});

describe("combinedAnswers / unansweredRequired / surveyStatus", () => {
	it("later rounds win for cross-round visibility", () => {
		expect(combinedAnswers([{ answers: { q1: { selected: ["a"] } } }, { answers: { q1: { selected: ["b"] } } }]).q1.selected).toEqual(["b"]);
	});

	it("hidden required questions never block completion", () => {
		const rounds = [
			round({
				questions: [
					q({ id: "q1", required: false }),
					q({ id: "q2", showIf: { questionId: "q1", value: "a" } }),
				],
				answers: { q1: { selected: ["b"], notes: "" } },
			}),
		];
		expect(unansweredRequired(rounds)).toEqual([]);
		expect(surveyStatus(rounds)).toBe("answered");
	});

	it("reports none / empty / pending / answered", () => {
		expect(surveyStatus([])).toBe("none");
		expect(surveyStatus([round({ questions: [] })])).toBe("empty");
		expect(surveyStatus([round()])).toBe("pending");
		const { rounds } = applyAnswers([round()], { q1: { selected: ["a"] } });
		expect(surveyStatus(rounds)).toBe("answered");
	});
});

describe("applyAnswers", () => {
	it("writes to the latest owning round, reports unknown ids, and never mutates inputs", () => {
		const rounds = [round({ questions: [q({ id: "q1" })] }), round({ round: 2, questions: [q({ id: "q1" })], answers: {} })];
		const frozen = JSON.parse(JSON.stringify(rounds));
		const { rounds: next, unknownIds } = applyAnswers(rounds, {
			q1: { selected: ["b"], notes: "hi" },
			ghost: { selected: ["a"] },
		});
		expect(next[1].answers.q1).toEqual({ selected: ["b"], notes: "hi" });
		expect(next[0].answers.q1).toBeUndefined();
		expect(unknownIds).toEqual(["ghost"]);
		expect(rounds).toEqual(frozen);
	});
});

describe("mergeSurveyDocuments", () => {
	const answered = (base, patch) => {
		const { rounds } = applyAnswers(parseSurvey(base).rounds, patch);
		return renderSurveyMarkdown(rounds);
	};

	it("keeps backend answers when the incoming copy is a stale blank (wipe guard)", () => {
		const incoming = renderSurveyMarkdown([round({ questions: [q({ id: "q1" }), q({ id: "q2" })] })]);
		const backend = answered(incoming, { q1: { selected: ["a"], notes: "human" } });
		const { markdown, merged } = mergeSurveyDocuments(backend, incoming);
		expect(merged).toBe(true);
		const { rounds, errors } = parseSurvey(markdown);
		expect(errors).toEqual([]);
		expect(rounds).toHaveLength(1);
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "human" });
		expect(validateSurvey(rounds).ok).toBe(true);
	});

	it("backfills stale early rounds while keeping the incoming new round", () => {
		const round1 = round({ questions: [q({ id: "q1" })] });
		const backend = answered(renderSurveyMarkdown([round1]), { q1: { selected: ["b"], notes: "" } });
		const incoming = renderSurveyMarkdown([round1, round({ round: 2, questions: [q({ id: "q2" })] })]);
		const { markdown, merged } = mergeSurveyDocuments(backend, incoming);
		expect(merged).toBe(true);
		const { rounds } = parseSurvey(markdown);
		expect(rounds).toHaveLength(2);
		expect(rounds[0].answers.q1).toEqual({ selected: ["b"], notes: "" });
		expect(rounds[1].questions.map((item) => item.id)).toEqual(["q2"]);
		expect(validateSurvey(rounds).ok).toBe(true);
	});

	it("re-appends backend-only rounds the incoming copy never saw", () => {
		const backend = answered(
			renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] }), round({ round: 2, questions: [q({ id: "q2" })] })]),
			{ q1: { selected: ["a"], notes: "" }, q2: { selected: ["b"], notes: "r2" } },
		);
		const incoming = renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]);
		const { markdown, merged } = mergeSurveyDocuments(backend, incoming);
		expect(merged).toBe(true);
		const { rounds } = parseSurvey(markdown);
		expect(rounds.map((item) => item.round)).toEqual([1, 2]);
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "" });
		expect(rounds[1].answers.q2).toEqual({ selected: ["b"], notes: "r2" });
		expect(validateSurvey(rounds).ok).toBe(true);
	});

	it("passes incoming through when the backend holds no survey content", () => {
		const incoming = renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]);
		expect(mergeSurveyDocuments("", incoming)).toEqual({ markdown: incoming, merged: false });
		expect(mergeSurveyDocuments("# notes\n\nno fences\n", incoming)).toEqual({ markdown: incoming, merged: false });
	});

	it("passes backend through when the incoming copy holds no survey content", () => {
		const backend = answered(renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]), {
			q1: { selected: ["a"], notes: "" },
		});
		expect(mergeSurveyDocuments(backend, "# prose\n\nno fences\n")).toEqual({ markdown: backend, merged: false });
	});

	it("keeps incoming-only answers such as agent pre-fills", () => {
		const incoming = renderSurveyMarkdown([
			round({ questions: [q({ id: "q1" })], answers: { q1: { selected: ["a"], notes: "prefill" } } }),
		]);
		const backend = renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]);
		const { markdown, merged } = mergeSurveyDocuments(backend, incoming);
		expect(merged).toBe(false);
		expect(parseSurvey(markdown).rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "prefill" });
	});

	it("unions questions and answers when one round number carries different questions", () => {
		const backend = answered(renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]), {
			q1: { selected: ["a"], notes: "" },
		});
		const incoming = renderSurveyMarkdown([round({ questions: [q({ id: "q1" }), q({ id: "q9", text: "New?", options: ["x"] })] })]);
		const { markdown } = mergeSurveyDocuments(backend, incoming);
		const { rounds } = parseSurvey(markdown);
		expect(rounds).toHaveLength(1);
		expect(rounds[0].questions.map((item) => item.id).sort()).toEqual(["q1", "q9"]);
		expect(rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "" });
		expect(validateSurvey(rounds).ok).toBe(true);
	});

	it("keeps the backend copy when the merge would be invalid", () => {
		const backend = answered(renderSurveyMarkdown([round({ questions: [q({ id: "q1" })] })]), {
			q1: { selected: ["a"], notes: "" },
		});
		// Incoming reuses q1 in a second round: merging would duplicate the id.
		const incoming = renderSurveyMarkdown([
			round({ questions: [q({ id: "q1" })] }),
			round({ round: 2, questions: [q({ id: "q1", text: "Again?" })] }),
		]);
		expect(mergeSurveyDocuments(backend, incoming)).toEqual({ markdown: backend, merged: false });
	});
});
