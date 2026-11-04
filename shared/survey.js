/***
 * MARK: survey
 * @description Pure, runtime-agnostic survey model for the `question-me` skill.
 *   A task's `SURVEY.md` holds one `survey-json` fenced block per question
 *   round; rounds are append-only, so a failback that generates more questions
 *   adds a new block at the bottom instead of rewriting earlier answers.
 *
 *   Round shape:
 *   `{ round, generatedAt, stage, questions: [{ id, type, text, options,
 *   required, showIf }], answers: { [qid]: { selected: string[], notes } } }`
 *
 *   Conditional questions use a deliberately small `showIf` grammar so agents
 *   cannot get confused: `{ questionId, value }` (visible when the referenced
 *   answer selected `value`) or `{ questionId, values: [...] }` (visible when
 *   any of `values` was selected). Anything else (including the string form
 *   `q1 === "x"` shown in older drafts) is treated as "no condition" by the
 *   validator and rejected on write — one object form only.
 *
 *   A hidden question never blocks completion: `unansweredRequired` skips
 *   questions whose `showIf` is not satisfied, and answers already stored for
 *   a now-hidden question are preserved untouched.
 *
 *   An explicitly empty round (`questions: []`) is valid and means "the agent
 *   had good reason to ask nothing" — it completes immediately (`empty`).
 *
 * @example parseSurvey('# Survey\n```survey-json\n{...}\n```').rounds.length => 1
 ***/

export const SURVEY_FENCE = "survey-json";

export const QUESTION_TYPES = ["single", "multiple"];

/***
 * MARK: extractFenceBlocks
 * @description Returns the raw text of every ````survey-json```` fenced block
 *   in a markdown document, in document order. Fences without the exact
 *   `survey-json` language tag are ignored (human prose, other code).
 * @example extractFenceBlocks('```survey-json\n{}\n```') => ['{}']
 * @param {string} markdown
 * @returns {string[]}
 ***/
export function extractFenceBlocks(markdown) {
	if (typeof markdown !== "string" || markdown === "") return [];
	const blocks = [];
	const pattern = /```survey-json[ \t]*\r?\n([\s\S]*?)```/g;
	let match;
	while ((match = pattern.exec(markdown)) !== null) {
		blocks.push(match[1]);
	}
	return blocks;
}

/***
 * MARK: normalizeRound
 * @description Coerces one parsed JSON value into the canonical round shape,
 *   filling defaults (`answers: {}`, `required: false`, `showIf: null`) so
 *   readers tolerate agent-authored blocks that omit optional fields.
 *   Returns null when the value is not a round-like object.
 * @example normalizeRound({ round: 1, questions: [] }).round => 1
 * @param {*} value - Parsed JSON value from one fence block.
 * @param {number} index - Zero-based position (fallback round number).
 * @returns {Object|null}
 ***/
export function normalizeRound(value, index = 0) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const questions = Array.isArray(value.questions) ? value.questions : null;
	if (!questions) return null;
	const answers =
		value.answers && typeof value.answers === "object" && !Array.isArray(value.answers)
			? value.answers
			: {};
	return {
		round:
			Number.isFinite(Number(value.round)) && Number(value.round) > 0
				? Number(value.round)
				: index + 1,
		generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null,
		stage: typeof value.stage === "string" ? value.stage : null,
		questions: questions.map((q) => normalizeQuestion(q)).filter(Boolean),
		answers,
	};
}

/***
 * MARK: normalizeQuestion
 * @description Coerces one question descriptor into canonical shape.
 *   Returns null for non-objects; `showIf` is passed through untouched so
 *   `validateSurvey` (not the reader) decides whether it is well-formed.
 * @example normalizeQuestion({ id: 'q1', text: 'T?', options: ['a'] }).type => 'single'
 * @param {*} value
 * @returns {Object|null}
 ***/
export function normalizeQuestion(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const id = typeof value.id === "string" ? value.id.trim() : "";
	const text = typeof value.text === "string" ? value.text : "";
	const options = Array.isArray(value.options)
		? value.options.map((o) => String(o))
		: [];
	return {
		id,
		type: value.type === "multiple" ? "multiple" : "single",
		text,
		options,
		required: value.required === true,
		showIf:
			value.showIf === undefined || value.showIf === null ? null : value.showIf,
	};
}

/***
 * MARK: parseSurvey
 * @description Parses every `survey-json` block in a SURVEY.md document into
 *   normalized rounds. Invalid JSON blocks are skipped but reported in
 *   `errors` (index + message) so the UI can warn instead of crashing.
 * @example parseSurvey('no fences').rounds => []
 * @param {string} markdown
 * @returns {{ rounds: Array<Object>, errors: Array<Object> }}
 ***/
export function parseSurvey(markdown) {
	const blocks = extractFenceBlocks(markdown);
	const rounds = [];
	const errors = [];
	blocks.forEach((raw, index) => {
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			errors.push({ index, message: `round ${index + 1}: invalid JSON (${err.message})` });
			return;
		}
		const round = normalizeRound(parsed, index);
		if (!round) {
			errors.push({ index, message: `round ${index + 1}: not a survey round object` });
			return;
		}
		rounds.push(round);
	});
	return { rounds, errors };
}

/***
 * MARK: serializeRound
 * @description Serializes one round to indented JSON for embedding in a
 *   `survey-json` fence. Key order is fixed (round, generatedAt, stage,
 *   questions, answers) so diffs stay readable.
 * @example serializeRound({ round: 1, questions: [], answers: {} }) => '{\n  "round": 1, ...'
 * @param {Object} round
 * @returns {string}
 ***/
export function serializeRound(round) {
	const ordered = {
		round: round.round,
		generatedAt: round.generatedAt || new Date().toISOString(),
		stage: round.stage || null,
		questions: (round.questions || []).map((q) => ({
			id: q.id,
			type: q.type || "single",
			text: q.text || "",
			options: q.options || [],
			required: q.required === true,
			showIf: q.showIf === undefined ? null : q.showIf,
		})),
		answers: round.answers || {},
	};
	return JSON.stringify(ordered, null, 2);
}

/***
 * MARK: renderSurveyMarkdown
 * @description Renders the full SURVEY.md document for a list of rounds:
 *   a stable heading plus one `## Round N` section per round. Used for the
 *   initial creation and by `appendRound`.
 * @example renderSurveyMarkdown([{ round: 1, questions: [], answers: {} }]).includes('## Round 1') => true
 * @param {Array<Object>} rounds
 * @returns {string}
 ***/
export function renderSurveyMarkdown(rounds) {
	const lines = ["# Survey", "", "Generated by the `question-me` skill. Rounds are append-only: new questions are added at the bottom, earlier answers are never rewritten.", ""];
	for (const round of rounds || []) {
		lines.push(`## Round ${round.round}`, "", "```survey-json", serializeRound(round), "```", "");
	}
	return `${lines.join("\n").trim()}\n`;
}

/***
 * MARK: appendRound
 * @description Returns a new SURVEY.md string with an additional round
 *   appended. The next round number is `max(existing) + 1`, so re-runs after
 *   a failback can never collide with or overwrite an earlier round. When
 *   the existing document has no parseable rounds, round numbering restarts
 *   at 1 but the original text is preserved above the new block.
 * @example appendRound('', { questions: [] }).includes('## Round 1') => true
 * @param {string} existingMarkdown
 * @param {Object} [opts]
 * @param {string|null} [opts.stage]
 * @param {Array<Object>} [opts.questions=[]]
 * @param {string|null} [opts.generatedAt]
 * @returns {string}
 ***/
export function appendRound(existingMarkdown, { stage = null, questions = [], generatedAt = null } = {}) {
	const { rounds } = parseSurvey(typeof existingMarkdown === "string" ? existingMarkdown : "");
	const next = rounds.reduce((max, r) => Math.max(max, Number(r.round) || 0), 0) + 1;
	const normalized = (Array.isArray(questions) ? questions : [])
		.map((q) => normalizeQuestion(q))
		.filter(Boolean);
	const round = {
		round: next,
		generatedAt: generatedAt || new Date().toISOString(),
		stage,
		questions: normalized,
		answers: {},
	};
	const block = `## Round ${next}\n\n\`\`\`survey-json\n${serializeRound(round)}\n\`\`\`\n`;
	if (!existingMarkdown || !String(existingMarkdown).trim()) {
		return renderSurveyMarkdown([round]);
	}
	return `${String(existingMarkdown).replace(/\s+$/, "")}\n\n${block}`;
}

/***
 * MARK: validateShowIf
 * @description Checks one `showIf` value against the single supported grammar:
 *   null (always visible) or `{ questionId: string, value?: string,
 *   values?: string[] }` with at least one of `value`/`values`. Returns an
 *   error string, or null when valid.
 * @example validateShowIf(null) => null
 * @param {*} showIf
 * @returns {string|null}
 ***/
export function validateShowIf(showIf) {
	if (showIf === null || showIf === undefined) return null;
	if (!showIf || typeof showIf !== "object" || Array.isArray(showIf)) {
		return "showIf must be null or { questionId, value } / { questionId, values }";
	}
	if (typeof showIf.questionId !== "string" || !showIf.questionId.trim()) {
		return "showIf.questionId must be a non-empty string";
	}
	const hasValue = typeof showIf.value === "string";
	const hasValues = Array.isArray(showIf.values) && showIf.values.every((v) => typeof v === "string");
	if (!hasValue && !hasValues) {
		return "showIf needs a string `value` or a string array `values`";
	}
	return null;
}

/***
 * MARK: validateSurvey
 * @description Validates normalized rounds: per-round unique non-empty ids,
 *   non-empty text/options, known types, well-formed `showIf` referencing a
 *   question in the same or an earlier round, and answer values that are
 *   subsets of the question options. Returns `{ ok, errors }`.
 * @example validateSurvey([]).ok => true
 * @param {Array<Object>} rounds
 * @returns {{ ok: boolean, errors: string[] }}
 ***/
export function validateSurvey(rounds) {
	const errors = [];
	if (!Array.isArray(rounds)) return { ok: false, errors: ["survey must be a list of rounds"] };
	const knownIds = new Set();
	const allQuestionIds = new Set();
	const seenRoundNumbers = new Set();
	(rounds || []).forEach((round, ri) => {
		const label = `round ${round?.round ?? ri + 1}`;
		if (!round || typeof round !== "object") {
			errors.push(`${label}: not an object`);
			return;
		}
		if (!Array.isArray(round.questions)) {
			errors.push(`${label}: questions must be an array`);
			return;
		}
		if (seenRoundNumbers.has(round?.round)) {
			errors.push(`${label}: duplicate round number`);
		}
		seenRoundNumbers.add(round?.round);
		const seen = new Set();
		for (const q of round.questions) {
			const qlabel = `${label} question '${q?.id || "?"}'`;
			if (!q || typeof q !== "object" || !q.id) {
				errors.push(`${label}: question without an id`);
				continue;
			}
			if (seen.has(q.id)) errors.push(`${qlabel}: duplicate id within the round`);
			if (allQuestionIds.has(q.id)) errors.push(`${qlabel}: duplicate id across survey rounds`);
			seen.add(q.id);
			allQuestionIds.add(q.id);
			if (!q.text || !String(q.text).trim()) errors.push(`${qlabel}: text is required`);
			if (!Array.isArray(q.options) || q.options.length === 0) {
				errors.push(`${qlabel}: at least one option is required`);
			} else if (q.options.some((option) => !String(option).trim())) {
				errors.push(`${qlabel}: options must not be empty`);
			}
			if (q.type !== "single" && q.type !== "multiple") {
				errors.push(`${qlabel}: unknown type '${q.type}'`);
			}
			const showIfError = validateShowIf(q.showIf);
			if (showIfError) {
				errors.push(`${qlabel}: ${showIfError}`);
			} else if (q.showIf && !knownIds.has(q.showIf.questionId) && !seen.has(q.showIf.questionId)) {
				// The referenced question must already exist: earlier round or
				// earlier in this round (document order), so agents cannot
				// point a condition at a question that does not exist yet.
				// Forward references within the same round are allowed only
				// when the target appears earlier in that round's list.
				const laterInRound = round.questions.some((other) => other?.id === q.showIf.questionId);
				if (!laterInRound) errors.push(`${qlabel}: showIf references unknown question '${q.showIf.questionId}'`);
			}
			if (q.type === "single" && q.showIf && q.showIf.questionId === q.id) {
				errors.push(`${qlabel}: showIf must not reference its own question`);
			}
		}
		for (const q of round.questions) {
			if (q?.id) knownIds.add(q.id);
		}
		const answers = round.answers && typeof round.answers === "object" ? round.answers : {};
		for (const [qid, answer] of Object.entries(answers)) {
			const question = round.questions.find((q) => q?.id === qid)
				|| rounds.flatMap((r) => r?.questions || []).find((q) => q?.id === qid);
			if (!question) {
				errors.push(`${label}: answer for unknown question '${qid}'`);
				continue;
			}
			const selected = Array.isArray(answer?.selected) ? answer.selected : null;
			if (!selected) {
				errors.push(`${label}: answer '${qid}' needs a \`selected\` array`);
				continue;
			}
			const unknown = selected.filter((s) => !question.options.includes(s));
			if (unknown.length > 0) errors.push(`${label}: answer '${qid}' selects unknown option(s): ${unknown.join(", ")}`);
			if (question.type === "single" && selected.length > 1) {
				errors.push(`${label}: single-choice answer '${qid}' selects more than one option`);
			}
			if (answer?.notes !== undefined && typeof answer.notes !== "string") {
				errors.push(`${label}: answer '${qid}' notes must be a string`);
			}
		}
	});
	return { ok: errors.length === 0, errors };
}

/***
 * MARK: selectedValues
 * @description Reads the selected option values for one question id from an
 *   answers map, tolerating missing entries and legacy plain-array answers.
 * @example selectedValues({}, 'q1') => []
 * @param {Object} [answers]
 * @param {string} questionId
 * @returns {string[]}
 ***/
export function selectedValues(answers, questionId) {
	const entry = answers?.[questionId];
	if (!entry) return [];
	if (Array.isArray(entry)) return entry.map(String);
	if (Array.isArray(entry.selected)) return entry.selected.map(String);
	return [];
}

/***
 * MARK: isQuestionVisible
 * @description Evaluates a question's `showIf` against the combined answers
 *   of its round (plus earlier rounds, so conditions can span rounds).
 *   Unknown referenced questions hide the conditional question rather than
 *   showing it — a fail-closed default for agent-authored conditions.
 * @example isQuestionVisible({ showIf: null }, {}) => true
 * @param {Object} question
 * @param {Object} [answersById={}]
 * @param {Set<string>} [knownIds]
 * @returns {boolean}
 ***/
export function isQuestionVisible(question, answersById = {}, knownIds = null) {
	const showIf = question?.showIf;
	if (!showIf) return true;
	if (!showIf || typeof showIf !== "object" || typeof showIf.questionId !== "string") return true;
	if (knownIds instanceof Set && !knownIds.has(showIf.questionId)) return false;
	const selected = selectedValues(answersById, showIf.questionId);
	if (typeof showIf.value === "string" && selected.includes(showIf.value)) return true;
	if (Array.isArray(showIf.values) && showIf.values.some((v) => selected.includes(String(v)))) return true;
	return false;
}

/***
 * MARK: combinedAnswers
 * @description Merges the answers of all rounds (later rounds win per
 *   question id) for cross-round `showIf` evaluation.
 * @example combinedAnswers([{ answers: { q1: { selected: ['a'] } } }]).q1.selected => ['a']
 * @param {Array<Object>} rounds
 * @returns {Object}
 ***/
export function combinedAnswers(rounds) {
	const merged = {};
	for (const round of rounds || []) {
		Object.assign(merged, round?.answers || {});
	}
	return merged;
}

/***
 * MARK: unansweredRequired
 * @description Lists the visible, required questions that still lack an
 *   answer (`{ round, id }`). Hidden conditional questions never block.
 * @example unansweredRequired([]) => []
 * @param {Array<Object>} rounds
 * @returns {Array<Object>}
 ***/
export function unansweredRequired(rounds) {
	const missing = [];
	const answers = combinedAnswers(rounds);
	const knownIds = new Set();
	for (const round of rounds || []) {
		for (const q of round?.questions || []) knownIds.add(q.id);
	}
	for (const round of rounds || []) {
		for (const q of round?.questions || []) {
			if (q.required !== true) continue;
			if (!isQuestionVisible(q, answers, knownIds)) continue;
			if (selectedValues(round.answers || {}, q.id).length === 0
				&& selectedValues(answers, q.id).length === 0) {
				missing.push({ round: round.round, id: q.id });
			}
		}
	}
	return missing;
}

/***
 * MARK: surveyStatus
 * @description Overall survey state: `none` (no rounds yet), `empty` (rounds
 *   exist but carry zero questions — the agent had nothing to ask, completes
 *   immediately), `pending` (required questions unanswered), or `answered`.
 * @example surveyStatus([]) => 'none'
 * @param {Array<Object>} rounds
 * @returns {'none'|'empty'|'pending'|'answered'}
 ***/
export function surveyStatus(rounds) {
	if (!Array.isArray(rounds) || rounds.length === 0) return "none";
	const total = rounds.reduce((n, r) => n + (r?.questions?.length || 0), 0);
	if (total === 0) return "empty";
	return unansweredRequired(rounds).length > 0 ? "pending" : "answered";
}

/***
 * MARK: applyAnswers
 * @description Merges a flat answers patch (`{ [qid]: { selected, notes } }`)
 *   into the rounds that own each question — the latest round containing the
 *   id wins, earlier rounds are never touched — and returns new round objects
 *   (inputs are not mutated). Unknown question ids are reported, not thrown.
 * @example applyAnswers([{ round: 1, questions: [{ id: 'q1' }], answers: {} }], { q1: { selected: ['a'] } }).rounds[0].answers.q1.selected => ['a']
 * @param {Array<Object>} rounds
 * @param {Object} [patch={}]
 * @returns {{ rounds: Array<Object>, unknownIds: string[] }}
 ***/
export function applyAnswers(rounds, patch = {}) {
	const unknownIds = [];
	const ownerById = new Map();
	(rounds || []).forEach((round, ri) => {
		for (const q of round?.questions || []) {
			if (q?.id) ownerById.set(q.id, ri);
		}
	});
	const next = (rounds || []).map((round) => ({
		...round,
		questions: [...(round?.questions || [])],
		answers: { ...(round?.answers || {}) },
	}));
	for (const [qid, answer] of Object.entries(patch || {})) {
		if (!ownerById.has(qid)) {
			unknownIds.push(qid);
			continue;
		}
		const ri = ownerById.get(qid);
		const selected = selectedFromAnswer(answer);
		const notes = notesFromAnswer(answer);
		next[ri].answers[qid] = { selected, notes };
	}
	return { rounds: next, unknownIds };
}

function selectedFromAnswer(answer) {
	if (Array.isArray(answer?.selected)) return answer.selected.map(String);
	if (Array.isArray(answer)) return answer.map(String);
	return [];
}

function notesFromAnswer(answer) {
	if (typeof answer?.notes === "string") return answer.notes;
	if (typeof answer === "string") return answer;
	return "";
}


/***
 * MARK: spliceRoundsIntoMarkdown
 * @description Rewrites every `survey-json` fence in a markdown document with
 *   the matching round from `rounds` (document order), leaving all surrounding
 *   prose byte-for-byte. Throws when the fence count drifts from the round
 *   count, so a file edited underfoot is never half-rewritten.
 * @example spliceRoundsIntoMarkdown('```survey-json\n{}\n```', [{ round: 1, questions: [], answers: {} }]).includes('"round": 1') => true
 * @param {string} markdown
 * @param {Array<Object>} rounds
 * @returns {string}
 ***/
export function spliceRoundsIntoMarkdown(markdown, rounds) {
	let index = 0;
	const next = () => rounds[index++];
	const out = String(markdown).replace(/```survey-json[ \t]*\r?\n([\s\S]*?)```/g, () => {
		const round = next();
		if (!round) throw new Error("survey file changed underfoot: fewer rounds than fences");
		return `\`\`\`survey-json\n${serializeRound(round)}\n\`\`\``;
	});
	if (index !== rounds.length) {
		throw new Error("survey file changed underfoot: more rounds than fences");
	}
	return out;
}

/***
 * MARK: mergeSurveyDocuments
 * @description Merges a Runner-shipped survey copy (`incomingMarkdown`) with the
 *   backend's own copy (`backendMarkdown`) without losing either side's work.
 *   Runners author questions, humans (via the backend) author answers, and a
 *   Runner copy can lag behind: a remote Runner never sees answers saved after
 *   its worktree was prepared, so writing its copy over the backend file would
 *   wipe them. The merge keeps every round from both sides (matched by round
 *   number), unions questions by id (incoming wording wins — the Runner wrote
 *   them), and unions answers by question id (backend wins — the human wrote
 *   them). Backend-only rounds are appended as new blocks at the bottom.
 *   When the backend holds no rounds the incoming copy passes through
 *   untouched (survey creation); when the incoming copy holds no rounds the
 *   backend copy passes through untouched (nothing new to add). When the merge
 *   itself would produce an invalid survey (concurrent same-number rounds),
 *   the backend copy wins untouched so answers are never traded for questions.
 * @example mergeSurveyDocuments(backendDoc, staleRunnerDoc).merged => true
 * @param {string} backendMarkdown
 * @param {string} incomingMarkdown
 * @returns {{ markdown: string, merged: boolean }} `merged` is true only when
 *   backend content (answers, questions, or rounds) survived inside the result.
 ***/
export function mergeSurveyDocuments(backendMarkdown, incomingMarkdown) {
	const backendText = typeof backendMarkdown === "string" ? backendMarkdown : "";
	const incomingText = typeof incomingMarkdown === "string" ? incomingMarkdown : "";
	const backend = parseSurvey(backendText);
	const incoming = parseSurvey(incomingText);
	if (backend.rounds.length === 0) return { markdown: incomingText, merged: false };
	if (incoming.rounds.length === 0) return { markdown: backendText, merged: false };

	const backendByNumber = new Map();
	for (const round of backend.rounds) {
		if (!backendByNumber.has(round.round)) backendByNumber.set(round.round, round);
	}
	const backendAnswers = combinedAnswers(backend.rounds);
	let contributed = false;
	const mergedRounds = incoming.rounds.map((incomingRound) => {
		const backendRound = backendByNumber.get(incomingRound.round) || null;
		const questions = [...incomingRound.questions];
		const known = new Set(questions.map((question) => question.id));
		if (backendRound) {
			for (const question of backendRound.questions) {
				if (!known.has(question.id)) {
					known.add(question.id);
					questions.push(question);
					contributed = true;
				}
			}
		}
		const answers = { ...incomingRound.answers };
		for (const [qid, entry] of Object.entries(backendAnswers)) {
			if (!known.has(qid)) continue;
			const normalized = { selected: selectedFromAnswer(entry), notes: notesFromAnswer(entry) };
			if (!sameAnswer(answers[qid], normalized)) {
				answers[qid] = normalized;
				contributed = true;
			}
		}
		return { ...incomingRound, questions, answers };
	});

	const incomingNumbers = new Set(incoming.rounds.map((round) => round.round));
	const seenAppended = new Set();
	const appended = [];
	for (const round of backend.rounds) {
		if (!incomingNumbers.has(round.round) && !seenAppended.has(round.round)) {
			seenAppended.add(round.round);
			appended.push(round);
		}
	}

	if (!contributed && appended.length === 0) return { markdown: incomingText, merged: false };

	let markdown = spliceRoundsIntoMarkdown(incomingText, mergedRounds);
	for (const extra of appended) {
		markdown = `${markdown.replace(/\s+$/, "")}\n\n## Round ${extra.round}\n\n\`\`\`survey-json\n${serializeRound(extra)}\n\`\`\`\n`;
	}
	const merged = parseSurvey(markdown);
	if (!validateSurvey(merged.rounds).ok) return { markdown: backendText, merged: false };
	return { markdown, merged: true };
}

function sameAnswer(before, normalized) {
	if (!before || typeof before !== "object") return false;
	const selected = selectedFromAnswer(before);
	if (selected.length !== normalized.selected.length) return false;
	if (selected.some((value, index) => value !== normalized.selected[index])) return false;
	return notesFromAnswer(before) === normalized.notes;
}

export const QUESTION_ME_SKILL_NAME = "question-me";

/***
 * MARK: stageHasQuestionMe
 * @description Whether a stage opts into the questionnaire flow by attaching the
 *   `question-me` skill (case-insensitive; tolerant of string entries).
 * @example stageHasQuestionMe({ skills: [{ name: 'question-me' }] }) => true
 * @param {Object} [stage]
 * @returns {boolean}
 ***/
export function stageHasQuestionMe(stage) {
	const skills = stage?.skills;
	if (!Array.isArray(skills)) return false;
	return skills.some((entry) => {
		const name = typeof entry === "string" ? entry : entry?.name;
		return typeof name === "string" && name.trim().toLowerCase() === QUESTION_ME_SKILL_NAME;
	});
}

/***
 * MARK: SURVEY FILE NAMING
 * @description Default task-folder file holding question-me rounds.
 * @example DEFAULT_SURVEY_FILENAME => 'SURVEY.md'
 ***/
export const DEFAULT_SURVEY_FILENAME = "SURVEY.md";

/***
 * MARK: SURVEY FILE ALIASES
 * @description Configuration keys that may carry the selected output file name,
 *   in precedence order. `outputFile` is canonical; the rest are accepted as
 *   backward-compatible aliases by backend resolution.
 * @example SURVEY_OUTPUT_FILE_KEYS[0] => 'outputFile'
 ***/
export const SURVEY_OUTPUT_FILE_KEYS = [
	"outputFile",
	"surveyFile",
	"surveyFileName",
	"fileName",
	"targetFile",
	"file",
];

function _isPresentValue(value) {
	if (value === undefined || value === null) return false;
	if (typeof value === "string" && value.trim() === "") return false;
	return true;
}

function _rawConfigValue(source, key) {
	if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
	if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;
	const value = source[key];
	if (value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value")) {
		return value.value;
	}
	return value;
}

function _hasQuestionMeName(value) {
	// Same entry shape as the shared gate (`stageHasQuestionMe`: a string or
	// `{ name }`) so file resolution and parking can never disagree about
	// which attachment is the question-me skill.
	const name = typeof value === "string" ? value : value?.name;
	return typeof name === "string" && name.trim().toLowerCase() === QUESTION_ME_SKILL_NAME;
}

function _candidateSources(input) {
	const sources = [];
	if (!input || typeof input !== "object" || Array.isArray(input)) return sources;
	sources.push(input);
	if (input.config) sources.push(input.config);
	if (input.keywords) sources.push(input.keywords);
	if (input.skill) {
		sources.push(input.skill);
		if (input.skill.config) sources.push(input.skill.config);
		if (input.skill.keywords) sources.push(input.skill.keywords);
	}
	if (input.questionMeSkill) {
		sources.push(input.questionMeSkill);
		if (input.questionMeSkill.config) sources.push(input.questionMeSkill.config);
	}
	return sources;
}

/***
 * MARK: normalizeSurveyFileName
 * @description Normalizes a configured survey file name into a safe basename
 *   inside the task folder. Anything unsafe falls back to the default
 *   (`SURVEY.md`) — never throws, never escapes the task directory. A bare
 *   name without a dot gains a `.md` extension; an explicit extension must
 *   already be `.md` (case-insensitive).
 * @example normalizeSurveyFileName('FEEDBACK') => 'FEEDBACK.md'
 * @example normalizeSurveyFileName('') => 'SURVEY.md'
 * @param {*} value - Candidate file name (or `{ value }` keyword wrapper).
 * @returns {string} Safe basename, or `DEFAULT_SURVEY_FILENAME`.
 ***/
export function normalizeSurveyFileName(value) {
	let raw = value;
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		if (Object.prototype.hasOwnProperty.call(raw, "value")) raw = raw.value;
		else return DEFAULT_SURVEY_FILENAME;
	}
	// Only strings name files: numbers, booleans, and other scalars are a
	// misconfiguration, so they fail safe to the default instead of
	// minting surprising names like `true.md`.
	if (typeof raw !== "string") return DEFAULT_SURVEY_FILENAME;
	raw = raw.trim();
	if (!raw) return DEFAULT_SURVEY_FILENAME;
	if (raw.length > 64) return DEFAULT_SURVEY_FILENAME;
	if (
		raw.includes("/") ||
		raw.includes("\\") ||
		raw.includes("\0") ||
		raw.includes("\n") ||
		raw.includes("\r") ||
		raw.includes(":")
	) {
		return DEFAULT_SURVEY_FILENAME;
	}
	if (raw === "." || raw === ".." || raw.includes("..")) return DEFAULT_SURVEY_FILENAME;
	// Hidden files (`.md`, `.survey.md`) have no visible stem: reject.
	if (raw.startsWith(".")) return DEFAULT_SURVEY_FILENAME;
	if (!raw.includes(".")) return `${raw}.md`;
	const ext = raw.slice(raw.lastIndexOf(".")).toLowerCase();
	if (ext !== ".md") return DEFAULT_SURVEY_FILENAME;
	// A bare `.md` passed the dot checks only when it starts with a dot,
	// which is rejected above — this guards ` .md`-style trims.
	if (raw.length <= 3) return DEFAULT_SURVEY_FILENAME;
	return raw;
}

/***
 * MARK: outputFileFromSkillAttachment
 * @description Resolves a raw output-file value from a stage (or skill attachment)
 *   by inspecting the `question-me` skill entry's config and any supplied
 *   keyword defaults. Canonical key first, then accepted aliases.
 * @example outputFileFromSkillAttachment({ skills: [{ name: 'question-me', config: { outputFile: 'FEEDBACK.md' } }] }) => 'FEEDBACK.md'
 * @param {Object} [stageOrConfig]
 * @returns {*}
 ***/
export function outputFileFromSkillAttachment(stageOrConfig) {
	const entries = Array.isArray(stageOrConfig?.skills) ? stageOrConfig.skills : [];
	const qmEntry = entries.find(_hasQuestionMeName) || null;

	const sources = [];
	if (qmEntry) sources.push(..._candidateSources(qmEntry));
	sources.push(..._candidateSources(stageOrConfig));

	for (const key of SURVEY_OUTPUT_FILE_KEYS) {
		for (const source of sources) {
			const value = _rawConfigValue(source, key);
			if (_isPresentValue(value)) return value;
		}
	}
	return null;
}

/***
 * MARK: resolveQuestionMeOutputFile
 * @description Normalizes the selected survey file name for a stage/config value.
 * @example resolveQuestionMeOutputFile({ skills: [{ name: 'question-me', config: { outputFile: 'FEEDBACK.md' } }] }) => 'FEEDBACK.md'
 * @param {*} [stageOrConfig]
 * @returns {string}
 ***/
export function resolveQuestionMeOutputFile(stageOrConfig) {
	if (typeof stageOrConfig === "string") return normalizeSurveyFileName(stageOrConfig);
	if (!stageOrConfig || typeof stageOrConfig !== "object") return DEFAULT_SURVEY_FILENAME;
	const raw = outputFileFromSkillAttachment(stageOrConfig);
	return normalizeSurveyFileName(raw);
}
