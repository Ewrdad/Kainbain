// Domain: The Work — append-only survey storage for the `question-me` skill.
import fs from "node:fs";
import path from "node:path";
import { _atomicWriteFileSync } from "../house/index.js";
import { docsProjectFor, resolveTaskDocsDir } from "../docsPath.js";
import {
	appendRound,
	applyAnswers,
	parseSurvey,
	renderSurveyMarkdown,
	serializeRound,
	surveyStatus,
	unansweredRequired,
	validateSurvey,
	stageHasQuestionMe,
} from "../../shared/survey.js";

/***
 * MARK: SURVEY FILE NAMING
 * @description Default task-folder file holding question-me rounds.
 * @example DEFAULT_SURVEY_FILENAME => 'SURVEY.md'
 ***/
export const DEFAULT_SURVEY_FILENAME = "SURVEY.md";

// Backward-compatible alias for older imports/tests.
export const SURVEY_FILENAME = DEFAULT_SURVEY_FILENAME;

// Re-exported from the shared survey model so frontend, backend, and task
// store share one source of truth for the skill name (see shared/survey.js).
export { QUESTION_ME_SKILL_NAME } from "../../shared/survey.js";

/***
 * MARK: SURVEY FILE ALIASES
 * @description Configuration keys that may carry the selected output file name,
 *   in precedence order. `outputFile` is canonical; the rest are accepted as
 *   backward-compatible aliases by backend resolution.
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
	return typeof name === "string" && name.trim().toLowerCase() === "question-me";
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

/***
 * MARK: resolveSurveyPath
 * @description Absolute path of a task's configured survey file
 *   (`<cwd>/<docs>/tasks/<id>/<file>`). Returns null when cwd/task id missing.
 *   The fourth argument may be a file name string or a stage/config object.
 * @example resolveSurveyPath('/repo', {}, 't-1') => '/repo/docs/tasks/t-1/SURVEY.md'
 * @param {string} cwd
 * @param {Object} [project]
 * @param {string} taskId
 * @param {*} [stageOrFileName]
 * @returns {string|null}
 ***/
export function resolveSurveyPath(cwd, project, taskId, stageOrFileName = null) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	if (!taskId || typeof taskId !== "string") return null;
	if (taskId.includes("/") || taskId.includes("\\") || taskId === "." || taskId === ".." || taskId.includes("\0")) return null;
	const dir = resolveTaskDocsDir(cwd, project, taskId);
	if (!dir) return null;
	let fileName = DEFAULT_SURVEY_FILENAME;
	if (stageOrFileName !== null && stageOrFileName !== undefined) {
		fileName = resolveQuestionMeOutputFile(stageOrFileName);
	}
	return path.join(dir, fileName);
}

/***
 * MARK: surveyProjectFor
 ***/
export function surveyProjectFor(store, projectId) {
	return docsProjectFor(store, projectId);
}

const EXPLICIT_FILE_KEYS = [...SURVEY_OUTPUT_FILE_KEYS];

function _explicitFileFromArgs(args) {
	for (const key of EXPLICIT_FILE_KEYS) {
		if (args && Object.prototype.hasOwnProperty.call(args, key)) {
			const value = args[key];
			if (_isPresentValue(value)) return value;
		}
	}
	return undefined;
}

function _stageListFromArgs(args) {
	if (Array.isArray(args?.stages)) return args.stages;
	if (Array.isArray(args?.stageList)) return args.stageList;
	if (Array.isArray(args?.projectStages)) return args.projectStages;
	return null;
}

function _findStageById(stages, wanted) {
	if (!Array.isArray(stages) || typeof wanted !== "string" || !wanted) return null;
	return stages.find((s) => String(s?.id) === wanted || String(s?.name) === wanted) || null;
}

// Single derivation for "which configured file does this call mean": an
// explicit file-name key wins, otherwise a stage object (or a stage id
// resolved against a supplied stage list) decides, otherwise null (default).
function _fileInputForArgs(args) {
	const explicit = _explicitFileFromArgs(args);
	if (explicit !== undefined) return explicit;
	const stageObj = args.stageObj || args.stageObject || args.stageConfig || null;
	if (stageObj) return stageObj;
	const stages = _stageListFromArgs(args);
	if (typeof args.stage === "object" && args.stage !== null) return args.stage;
	// A stage id without a resolvable stage list cannot name a file: fail
	// safe to the default rather than minting `<stageId>.md`. (An earlier
	// read-path helper returned the raw string; no caller or test relies on
	// that, and the write path always defaulted here.)
	if (typeof args.stage === "string") return _findStageById(stages, args.stage) || null;
	if (typeof args.stageId === "string") return _findStageById(stages, args.stageId) || null;
	return null;
}

function _normalizeCallArgs(first, second, third, fourth) {
	if (first && typeof first === "object" && !Array.isArray(first) && typeof first.cwd === "string") {
		const args = first;
		return {
			cwd: args.cwd,
			project: args.project !== undefined ? args.project : (second !== undefined ? second : null),
			taskId: args.taskId ?? args.id ?? args.taskID ?? third,
			stageOrFile: _fileInputForArgs(args),
		};
	}
	// Positional form is backward-compatible verbatim: the fourth argument is
	// a file name string or a stage/config object, and `second` is always
	// the project record (or null). Stage-id strings resolve only in the
	// object form via `_fileInputForArgs` above.
	return {
		cwd: first,
		project: (second === undefined ? null : second),
		taskId: third,
		stageOrFile: fourth,
	};
}

/***
 * MARK: readSurvey
 * @description Reads and parses the configured survey file. Never throws for
 *   filesystem problems: a missing or unreadable file yields
 *   `{ exists: false, status: "none" }`.
 ***/
export function readSurvey(...callArgs) {
	const { cwd, project, taskId, stageOrFile } = _normalizeCallArgs(callArgs[0], callArgs[1], callArgs[2], callArgs[3]);
	const empty = { exists: false, markdown: "", rounds: [], errors: [], status: "none" };
	const filePath = resolveSurveyPath(cwd, project, taskId, stageOrFile);
	if (!filePath) return empty;
	let markdown;
	try {
		if (!fs.existsSync(filePath)) return empty;
		markdown = fs.readFileSync(filePath, "utf8");
	} catch {
		return empty;
	}
	const { rounds, errors } = parseSurvey(markdown);
	return { exists: true, markdown, rounds, errors, status: surveyStatus(rounds) };
}

/***
 * MARK: spliceRoundsIntoMarkdown
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

function _roundStageId(args) {
	let roundStage = args.stage ?? args.stageId ?? null;
	if (roundStage && typeof roundStage === "object") {
		roundStage = roundStage.id ?? roundStage.stageId ?? roundStage.name ?? null;
	}
	return roundStage;
}

/***
 * MARK: appendSurveyRound
 * @description Appends one question round to the configured survey file,
 *   creating it when missing. Earlier rounds and their answers are preserved.
 * @param {Object} args - `{ cwd, project?, taskId|id, stage?, questions }`
 *   plus an optional file selector: an explicit file-name key
 *   (`outputFile` or alias) or a stage object (`stage`/`stageObj`/…).
 * @returns {{ markdown: string, round: number, status: string }}
 * @throws {Error} When the path cannot be resolved, the existing file is
 *   unreadable, or the new round fails validation (the file is untouched).
 ***/
export function appendSurveyRound(args) {
	const a = args && typeof args === "object" ? args : {};
	const cwd = a.cwd;
	const project = a.project !== undefined ? a.project : null;
	const taskId = a.taskId ?? a.id;
	const roundStage = _roundStageId(a);
	const questions = a.questions !== undefined ? a.questions : [];
	const filePath = resolveSurveyPath(cwd, project, taskId, _fileInputForArgs(a));
	if (!filePath) throw new Error("cannot resolve survey path: missing cwd or task id");
	let existing = "";
	try {
		if (fs.existsSync(filePath)) existing = fs.readFileSync(filePath, "utf8");
	} catch (err) {
		throw new Error(`cannot read survey file: ${err.message}`);
	}
	const markdown = appendRound(existing, { stage: roundStage, questions });
	const { rounds, errors } = parseSurvey(markdown);
	if (errors.length > 0) throw new Error(`new survey round is invalid: ${errors[0].message}`);
	const { ok, errors: validationErrors } = validateSurvey(rounds);
	if (!ok) throw new Error(`new survey round is invalid: ${validationErrors[0]}`);
	_atomicWriteFileSync(filePath, markdown);
	const created = rounds.at(-1);
	return { markdown, round: created.round, status: surveyStatus(rounds) };
}

/***
 * MARK: saveSurveyAnswers
 * @description Merges answer patches into the configured survey file,
 *   preserving questions and surrounding prose byte-for-byte. The file is
 *   only rewritten after the merged rounds validate, so a rejected patch
 *   leaves the file untouched.
 * @param {Object} args - `{ cwd, project?, taskId|id, patch|answers }` plus
 *   an optional file selector (explicit file-name key or stage object).
 * @returns {{ markdown: string, status: string, missing: Array, unknownIds: Array }}
 * @throws {Error} `SURVEY_NOT_FOUND` (404) when no file exists — including a
 *   delete between the existence check and the read; `SURVEY_INVALID` (400)
 *   when merged answers fail validation; plain `Error` when the path cannot
 *   be resolved.
 ***/
export function saveSurveyAnswers(args) {
	const a = args && typeof args === "object" ? args : {};
	const cwd = a.cwd;
	const project = a.project !== undefined ? a.project : null;
	const taskId = a.taskId ?? a.id;
	let patch = a.patch;
	if (patch === undefined) {
		patch = a.answers !== undefined ? a.answers : {};
	}
	const filePath = resolveSurveyPath(cwd, project, taskId, _fileInputForArgs(a));
	if (!filePath) throw new Error("cannot resolve survey path: missing cwd or task id");
	const notFound = () => Object.assign(new Error("no survey exists for this task yet"), { statusCode: 404, code: "SURVEY_NOT_FOUND" });
	if (!fs.existsSync(filePath)) throw notFound();
	let before;
	try {
		before = fs.readFileSync(filePath, "utf8");
	} catch (err) {
		if (err?.code === "ENOENT") throw notFound();
		throw new Error(`cannot read survey file: ${err.message}`);
	}
	const { rounds } = parseSurvey(before);
	const { rounds: next, unknownIds } = applyAnswers(rounds, patch || {});
	const { ok, errors } = validateSurvey(next);
	if (!ok) throw Object.assign(new Error(`survey answers invalid: ${errors[0]}`), { statusCode: 400, code: "SURVEY_INVALID" });
	const markdown = spliceRoundsIntoMarkdown(before, next);
	_atomicWriteFileSync(filePath, markdown);
	return { markdown, status: surveyStatus(next), missing: unansweredRequired(next), unknownIds };
}

// Re-exported from the shared survey model (see shared/survey.js).
export { stageHasQuestionMe };

/***
 * MARK: resolveSurveyGate
 * @description Decides whether a finished agent stage parks for a human
 *   survey. Parks only when the stage carries the `question-me` skill and
 *   rounds are missing (`none`) or incomplete (`pending`); an explicitly
 *   empty round or fully answered rounds advance.
 ***/
export function resolveSurveyGate(stage, rounds = []) {
	const status = surveyStatus(Array.isArray(rounds) ? rounds : []);
	if (!stageHasQuestionMe(stage)) return { park: false, reason: "no-question-me-skill", status };
	if (status === "empty") return { park: false, reason: "no-questions", status };
	if (status === "answered") return { park: false, reason: "already-answered", status };
	return { park: true, reason: status === "none" ? "no-survey" : "unanswered", status };
}

/***
 * MARK: renderSurveyMarkdownFor
 ***/
export function renderSurveyMarkdownFor(rounds) {
	return renderSurveyMarkdown(rounds || []);
}
