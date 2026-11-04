/***
 * MARK: survey.shared.test
 * @description Unit tests for the runtime-agnostic survey model in
 *   `shared/survey.js` (multi-round parse, append-only numbering, validation,
 *   conditional visibility, completion status, answer merging).
 ***/
import { describe, it, expect } from "vitest";

import {
	IMAGE_ENTRY_STATUSES,
	IMAGE_QUESTION_MAX_OPTIONS,
	QUESTION_TYPES,
	appendRound,
	applyAnswers,
	combinedAnswers,
	extractFenceBlocks,
	isQuestionVisible,
	normalizeQuestion,
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

describe("image questions", () => {
	const img = (overrides = {}) =>
		q({
			id: "qi",
			type: "image",
			text: "Pick a design",
			options: ["dark dashboard", "light dashboard"],
			...overrides,
		});

	it("registers the image type with a 4-option cap and a pending/ready/failed lifecycle", () => {
		expect(QUESTION_TYPES).toContain("image");
		expect(IMAGE_QUESTION_MAX_OPTIONS).toBe(4);
		expect(IMAGE_ENTRY_STATUSES).toEqual(["pending", "ready", "failed"]);
	});

	it("normalizes the image type and preserves backend-owned images", () => {
		const question = normalizeQuestion(
			img({ images: [{ option: 0, file: "assets/a.png", status: "ready" }] }),
		);
		expect(question.type).toBe("image");
		expect(question.images).toEqual([{ option: 0, file: "assets/a.png", status: "ready" }]);
		expect(normalizeQuestion(img()).images).toEqual([]);
		// Unknown types still degrade to single (existing guarantee).
		expect(normalizeQuestion({ ...img(), type: "stars" }).type).toBe("single");
	});

	it("validates a full ready/pending/failed lifecycle round-trip", () => {
		const rounds = [
			round({
				questions: [
					img({
						images: [
							{ option: 0, file: "assets/survey-r1-qi-0.png", status: "ready" },
							{ option: 1, file: "assets/survey-r1-qi-1.png", status: "pending" },
						],
					}),
					img({ id: "qj", options: ["logo A", "logo B"], images: [{ option: 0, file: "assets/x.png", status: "failed", error: "no-key" }] }),
				],
			}),
		];
		expect(validateSurvey(rounds)).toEqual({ ok: true, errors: [] });
		const serialized = serializeRound(rounds[0]);
		expect(JSON.parse(serialized).questions[0].images).toHaveLength(2);
		expect(JSON.parse(serialized).questions[1].images[0].error).toBe("no-key");
		// And the serialized form re-parses valid.
		expect(validateSurvey(parseSurvey(`\`\`\`survey-json\n${serialized}\n\`\`\``).rounds).ok).toBe(true);
	});

	it("serializes byte-identical when no question carries images", () => {
		const before = serializeRound(round({ questions: [q({ id: "q1" }), img()] }));
		expect(before).not.toContain('"images"');
		const parsed = JSON.parse(before);
		expect(parsed.questions.map((entry) => entry.type)).toEqual(["single", "image"]);
	});

	it("rejects over-long option lists, malformed images, and multi-pick answers", () => {
		const { ok, errors } = validateSurvey([
			round({
				questions: [
					img({ id: "too-many", options: ["a", "b", "c", "d", "e"] }),
					img({
						id: "bad-images",
						images: [
							{ option: 7, file: "assets/a.png", status: "ready" },
							{ option: 0, file: "", status: "ready" },
							{ option: 0, file: "assets/a.png", status: "baking" },
							"not-an-object",
						],
					}),
					img({ id: "not-an-array", images: "nope" }),
				],
				answers: { "too-many": { selected: ["a", "b"], notes: "" } },
			}),
		]);
		expect(ok).toBe(false);
		const joined = errors.join("\n");
		expect(joined).toMatch("at most 4 options");
		expect(joined).toMatch(/images\[0\].*option must be an option index/);
		expect(joined).toMatch(/images\[1\].*file is required/);
		expect(joined).toMatch(/images\[2\].*unknown status 'baking'/);
		expect(joined).toMatch(/images\[3\].*must be an object/);
		expect(joined).toMatch("images must be an array");
		expect(joined).toMatch("single-choice answer 'too-many' selects more than one option");
	});

	it("lets failed entries omit the file (no artifact exists) with a failure code", () => {
		const { ok, errors } = validateSurvey([
			round({
				questions: [
					q({
						id: "qi",
						type: "image",
						text: "Pick a design",
						options: ["dark dashboard", "light dashboard"],
						images: [
							{ option: 0, file: "assets/a.png", status: "ready" },
							{ option: 1, status: "failed", code: "no-key", error: "No API key saved." },
						],
					}),
				],
			}),
		]);
		expect(errors).toEqual([]);
		expect(ok).toBe(true);
	});

	it("treats image questions as single-pick for completion and self-reference rules", () => {
		const rounds = [round({ questions: [img({ required: true })] })];
		expect(surveyStatus(rounds)).toBe("pending");
		const { rounds: answered } = applyAnswers(rounds, { qi: { selected: ["dark dashboard"] } });
		expect(surveyStatus(answered)).toBe("answered");
		const { errors } = validateSurvey([
			round({ questions: [img({ showIf: { questionId: "qi", value: "dark dashboard" } })] }),
		]);
		expect(errors.join("\n")).toMatch("must not reference its own question");
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
