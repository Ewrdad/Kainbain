// Domain: image generation — background survey-image job (backend gateway).
// The runner/agent only writes description options; this job turns them into
// pictures at park time (fire-and-forget, so the park itself never waits on
// provider latency) and on survey reads (crash recovery). Images land in the
// task folder's assets/ via the taskAssets helpers; per-image status is
// spliced into the round JSON via updateSurveyImages. Descriptions are the
// durable contract — images are derived artifacts, and any failure degrades
// to the descriptions fallback instead of blocking the survey.
import fs from "node:fs";
import { _atomicWriteFileSync } from "../house/index.js";
import { _appendProcessLog } from "../watch/index.js";
import { readSurvey, resolveSurveyPath, updateSurveyImages } from "../work/taskSurvey.js";
import {
	resolveTaskAssetFile,
	sanitizeImageName,
	taskAssetRelPath,
	writeTaskImage,
} from "../work/taskAssets.js";
import { getImageGenKey } from "./keyStore.js";
import {
	IMAGE_GEN_DEFAULT_SIZE,
	generateImage,
	getImageGenProvider,
} from "./providers.js";

/***
 * MARK: SURVEY_IMAGE_CAP
 * @description Most generated images one survey file may hold (cost guard:
 *   3 full image questions at ~$0.01/image). Options beyond the cap get a
 *   terminal `cap` failure entry and render descriptions-only.
 * @example SURVEY_IMAGE_CAP => 12
 ***/
export const SURVEY_IMAGE_CAP = 12;

/***
 * MARK: IMAGE_GEN_DISABLED
 * @description The question-me `imageGen` value meaning "no image questions"
 *   (the default — the job no-ops and the prompt section is removed).
 * @example IMAGE_GEN_DISABLED => 'none'
 ***/
export const IMAGE_GEN_DISABLED = "none";

const shortError = (message) =>
	String(message || "unknown error").replace(/\s+/g, " ").trim().slice(0, 160);

/***
 * MARK: imageGenRequestedBy
 * @description Raw `imageGen` value from a stage's question-me attachment
 *   config (null when the stage carries no override).
 * @example imageGenRequestedBy({ skills: [{ name: 'question-me', config: { imageGen: 'muse' } }] }) => 'muse'
 * @param {Object} [stage] - Stage (or attachment) carrying question-me config.
 * @returns {string|null}
 ***/
export const imageGenRequestedBy = (stage) => {
	const entries = Array.isArray(stage?.skills) ? stage.skills : [];
	const found = entries.find((entry) => {
		const name = typeof entry === "string" ? entry : entry?.name;
		return typeof name === "string" && name.trim().toLowerCase() === "question-me";
	});
	const raw = found && typeof found === "object" ? found.config?.imageGen : null;
	if (raw === undefined || raw === null) return null;
	return typeof raw === "string" ? raw : String(raw);
};

/***
 * MARK: resolveImageGenProvider
 * @description Effective image provider for a stage (or raw value): a
 *   registered provider id, else `none`. Unknown values fail safe to `none`
 *   (the job logs a warning; the survey falls back to descriptions).
 * @example resolveImageGenProvider('muse') => 'muse'
 * @example resolveImageGenProvider('nope') => 'none'
 * @param {Object|string} [stageOrValue]
 * @returns {string}
 ***/
export const resolveImageGenProvider = (stageOrValue) => {
	const raw =
		typeof stageOrValue === "string" ? stageOrValue : imageGenRequestedBy(stageOrValue);
	const id = String(raw || "").trim().toLowerCase();
	if (!id || id === IMAGE_GEN_DISABLED) return IMAGE_GEN_DISABLED;
	return getImageGenProvider(id) ? id : IMAGE_GEN_DISABLED;
};

/***
 * MARK: surveyImageFileName
 * @description Deterministic asset name for one generated survey image
 *   (`survey-r<round>-<qid>-<i>.png`, sanitized — agent-authored question ids
 *   can carry unsafe characters).
 * @example surveyImageFileName(1, 'q1', 0) => 'survey-r1-q1-0.png'
 * @param {number} round - Round number.
 * @param {string} questionId - Question id.
 * @param {number} index - Option index.
 * @returns {string}
 ***/
export const surveyImageFileName = (round, questionId, index) => {
	const safe = sanitizeImageName(`survey-r${round}-${safeQuestionStem(questionId)}-${index}.png`);
	return safe || `survey-r${round}-image-${index}.png`;
};

// The stem is sanitized BEFORE composing: sanitizing the composed name
// would let a hostile question id (`../../x`) eat the round prefix.
const safeQuestionStem = (questionId) =>
	sanitizeImageName(String(questionId || "").trim() || "question").replace(/\.[^.]*$/, "") ||
	"question";

const sameEntries = (a, b) => {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	return a.every((entry, i) => JSON.stringify(entry) === JSON.stringify(b[i]));
};

const byOptionIndex = (entries) => {
	const map = new Map();
	for (const entry of Array.isArray(entries) ? entries : []) {
		if (entry && Number.isInteger(entry.option) && !map.has(entry.option)) {
			map.set(entry.option, entry);
		}
	}
	return map;
};

// In-flight jobs by task+file so a park-time kick and concurrent survey reads
// (or a slow provider under polling) share one run instead of stampeding.
const INFLIGHT_JOBS = new Map();

const jobKeyFor = ({ cwd, taskId, surveyFile } = {}) => {
	if (!cwd || !taskId) return null;
	return `${cwd}::${taskId}::${surveyFile || "SURVEY.md"}`;
};

const runSurveyImageJob = async (opts = {}) => {
	const {
		cwd,
		project = null,
		taskId,
		surveyFile = null,
		stage = null,
		rounds: providedRounds,
		imageGenDir,
		fetchImpl,
		retryFailed = false,
	} = opts;
	const summary = {
		providerId: IMAGE_GEN_DISABLED,
		status: "disabled",
		generated: 0,
		failed: 0,
		capped: 0,
		skipped: 0,
		warnings: [],
		errors: [],
	};
	if (!cwd || !taskId) {
		summary.status = "invalid";
		return summary;
	}
	const requested =
		typeof opts.providerId === "string" ? opts.providerId : imageGenRequestedBy(stage);
	const providerId = resolveImageGenProvider(requested);
	summary.providerId = providerId;
	if (
		requested &&
		providerId === IMAGE_GEN_DISABLED &&
		String(requested).trim().toLowerCase() !== IMAGE_GEN_DISABLED
	) {
		summary.warnings.push(
			`Unknown image provider '${requested}' — image generation disabled for this survey.`,
		);
	}
	if (providerId === IMAGE_GEN_DISABLED) {
		summary.status = "disabled";
		return summary;
	}
	const provider = getImageGenProvider(providerId);
	const survey = Array.isArray(providedRounds)
		? { exists: true, rounds: providedRounds }
		: readSurvey(cwd, project, taskId, surveyFile || undefined);
	if (!survey.exists || !Array.isArray(survey.rounds) || survey.rounds.length === 0) {
		summary.status = "no-survey";
		return summary;
	}
	const imageQuestions = [];
	for (const round of survey.rounds) {
		for (const question of round?.questions || []) {
			if (question?.type === "image") imageQuestions.push({ round: round.round, question });
		}
	}
	if (imageQuestions.length === 0) {
		summary.status = "no-image-questions";
		return summary;
	}
	const apiKey = provider.requiresKey ? getImageGenKey({ providerId, dir: imageGenDir }) : "";
	const keyMissing = provider.requiresKey && !apiKey;
	const readyCount = imageQuestions.reduce(
		(n, { question }) =>
			n + (Array.isArray(question.images) ? question.images.filter((e) => e?.status === "ready").length : 0),
		0,
	);
	// Only ready images spend the budget upfront: pending entries are either
	// owned by this run (filled in pass 2) or orphans of a crashed run (they
	// regenerate below and spend one unit each like any other generation).
	let budget = Math.max(0, SURVEY_IMAGE_CAP - readyCount);
	const label = provider.label || providerId;

	// Decides the terminal entry for one option that will NOT be generated
	// this run (unconfigured provider, spent budget, or a failed entry this
	// run must not retry). Returns null when the option needs generation.
	const terminalEntryFor = (optionIndex, existing) => {
		if (keyMissing) {
			return {
				option: optionIndex,
				status: "failed",
				code: "no-key",
				error: `No API key saved for ${label} — add one in System Settings › Images.`,
			};
		}
		if (existing?.status === "failed" && existing?.code === "no-key" && !keyMissing) {
			return null; // Healed: a key exists now, generate below.
		}
		if (existing?.status === "failed" && !retryFailed) return existing;
		if (existing?.status === "ready") return existing;
		// Pending entries regenerate: while a job is in flight the dedupe
		// map owns them, so any pending entry seen here is an orphan of a
		// crashed run (or this run's own pass-1 write, filled in pass 2).
		if (budget <= 0) {
			if (existing?.status === "failed") return existing; // Keep the earlier reason.
			return {
				option: optionIndex,
				status: "failed",
				code: "cap",
				error: `Survey image limit reached (${SURVEY_IMAGE_CAP} per survey) — showing descriptions.`,
			};
		}
		return null;
	};

	// Pass 1: publish pending/terminal entries so the UI can show progress
	// (or an honest fallback) while generation runs.
	const planned = [];
	for (const { round, question } of imageQuestions) {
		const options = Array.isArray(question.options) ? question.options : [];
		const current = Array.isArray(question.images) ? [...question.images] : [];
		const known = byOptionIndex(current);
		const next = [...current];
		const setEntry = (entry) => {
			const at = next.findIndex((e) => e?.option === entry.option);
			if (at >= 0) next[at] = entry;
			else next.push(entry);
		};
		const toGenerate = [];
		for (let i = 0; i < options.length; i += 1) {
			const existing = known.get(i);
			if (existing?.status === "ready") {
				summary.skipped += 1;
				continue;
			}
			const terminal = terminalEntryFor(i, existing);
			if (terminal) {
				const before = next.find((e) => e?.option === i);
				setEntry(terminal);
				if (!before || JSON.stringify(before) !== JSON.stringify(terminal)) {
					if (terminal.status === "failed" && terminal.code === "cap") summary.capped += 1;
					else if (terminal.status === "failed") summary.failed += 1;
				}
				continue;
			}
			budget -= 1;
			const fileName = surveyImageFileName(round, question.id, i);
			setEntry({ option: i, file: `assets/${fileName}`, status: "pending" });
			toGenerate.push({ index: i, prompt: options[i], fileName });
		}
		next.sort((a, b) => (a?.option || 0) - (b?.option || 0));
		if (!sameEntries(current, next)) {
			try {
				updateSurveyImages({
					cwd,
					project,
					taskId,
					...(surveyFile ? { outputFile: surveyFile } : {}),
					round,
					questionId: question.id,
					images: next,
				});
			} catch (err) {
				summary.errors.push(`r${round}/${question.id}: ${shortError(err?.message)}`);
				continue;
			}
		}
		if (toGenerate.length > 0) planned.push({ round, questionId: question.id, options, entries: next, toGenerate });
	}

	// Pass 2: generate each planned image (one retry unless the failure
	// cannot heal) and splice the outcome per question.
	for (const item of planned) {
		const entries = item.entries.map((e) => ({ ...e }));
		const setEntry = (entry) => {
			const at = entries.findIndex((e) => e?.option === entry.option);
			if (at >= 0) entries[at] = entry;
			else entries.push(entry);
		};
		for (const target of item.toGenerate) {
			let bytes = null;
			let lastError = null;
			for (let attempt = 0; attempt < 2 && !bytes; attempt += 1) {
				try {
					bytes = await generateImage({
						providerId,
						prompt: target.prompt,
						size: IMAGE_GEN_DEFAULT_SIZE,
						apiKey,
						fetchImpl,
					});
				} catch (err) {
					lastError = err;
					if (err?.code === "IMAGE_GEN_NO_KEY" || err?.code === "INVALID_IMAGE_GEN_PROMPT") break;
				}
			}
			if (bytes && bytes.length > 0) {
				try {
					writeTaskImage(cwd, taskId, target.fileName, bytes, project);
					setEntry({ option: target.index, file: `assets/${target.fileName}`, status: "ready" });
					summary.generated += 1;
				} catch (err) {
					setEntry({
						option: target.index,
						status: "failed",
						code: "gen",
						error: shortError(`Could not save the generated image: ${err?.message}`),
					});
					summary.failed += 1;
				}
			} else {
				setEntry({
					option: target.index,
					status: "failed",
					code: "gen",
					error: shortError(`Generation failed: ${lastError?.message || "unknown error"}`),
				});
				summary.failed += 1;
				summary.errors.push(
					`r${item.round}/${item.questionId}#${target.index}: ${shortError(lastError?.message)}`,
				);
			}
		}
		entries.sort((a, b) => (a?.option || 0) - (b?.option || 0));
		try {
			updateSurveyImages({
				cwd,
				project,
				taskId,
				...(surveyFile ? { outputFile: surveyFile } : {}),
				round: item.round,
				questionId: item.questionId,
				images: entries,
			});
		} catch (err) {
			summary.errors.push(`r${item.round}/${item.questionId}: ${shortError(err?.message)}`);
		}
	}
	summary.status = "done";
	return summary;
};

/***
 * MARK: ensureSurveyImages
 * @description Generates the missing images for a survey's image questions
 *   (never throws — every failure lands in the returned summary and as
 *   failed entries with a descriptions fallback). Concurrent calls for the
 *   same task+file share one run. Park sites pass `retryFailed: true` so a
 *   new round also heals earlier failures; survey reads leave it false so a
 *   broken provider cannot be hammered by polling.
 * @example await ensureSurveyImages({ cwd: '/repo', taskId: 't1', stage }) => ({ status: 'done', ... })
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - Project working directory.
 * @param {Object} [opts.project] - Project record (docs-dir aware).
 * @param {string} [opts.taskId] - Task id.
 * @param {string} [opts.surveyFile] - Survey file name (defaults to SURVEY.md).
 * @param {Object} [opts.stage] - Parked stage (resolves the imageGen provider).
 * @param {string} [opts.providerId] - Explicit provider override (tests).
 * @param {Array} [opts.rounds] - Pre-read rounds (skips the file read for planning).
 * @param {string} [opts.imageGenDir] - Key store dir override (tests).
 * @param {Function} [opts.fetchImpl] - Fetch override (tests).
 * @param {boolean} [opts.retryFailed] - Also retry earlier `gen`/`cap` failures.
 * @returns {Promise<Object>} Summary (providerId, status, generated/failed/capped/skipped, warnings, errors).
 ***/
export const ensureSurveyImages = (opts = {}) => {
	const key = jobKeyFor(opts);
	if (!key) {
		return Promise.resolve({
			providerId: IMAGE_GEN_DISABLED,
			status: "invalid",
			generated: 0,
			failed: 0,
			capped: 0,
			skipped: 0,
			warnings: [],
			errors: [],
		});
	}
	const inflight = INFLIGHT_JOBS.get(key);
	if (inflight) return inflight;
	const promise = runSurveyImageJob(opts)
		.catch((err) => ({
			providerId: IMAGE_GEN_DISABLED,
			status: "error",
			generated: 0,
			failed: 0,
			capped: 0,
			skipped: 0,
			warnings: [],
			errors: [shortError(err?.message)],
		}))
		.finally(() => {
			if (INFLIGHT_JOBS.get(key) === promise) INFLIGHT_JOBS.delete(key);
		});
	INFLIGHT_JOBS.set(key, promise);
	return promise;
};

/***
 * MARK: kickSurveyImageJob
 * @description Fire-and-forget park hook shared by the embedded and
 *   Runner-report finish paths: starts the generation job (which also heals
 *   earlier failures on a new park) and reports its summary to the task log
 *   when it settles. Never throws, never blocks the park.
 * @example kickSurveyImageJob({ store, cwd: '/repo', taskId: 't1', task, stage })
 * @param {Object} [opts]
 * @param {Object} [opts.store] - Task store (for the completion report).
 * @param {string} [opts.cwd] - Project working directory.
 * @param {Object} [opts.project] - Project record (docs-dir aware).
 * @param {string} [opts.taskId] - Task id.
 * @param {Object} [opts.task] - Task entity (receives the report lines).
 * @param {string} [opts.surveyFile] - Survey file name.
 * @param {Object} [opts.stage] - Parked stage (resolves the imageGen provider).
 ***/
export const kickSurveyImageJob = ({ store, cwd, project, taskId, task, surveyFile, stage } = {}) => {
	void ensureSurveyImages({
		cwd,
		project: project || null,
		taskId,
		surveyFile: surveyFile || null,
		stage: stage || null,
		retryFailed: true,
	}).then(
		(summary) => reportSurveyImagesToTask({ store, cwd, task, summary }),
		() => {},
	);
};

/***
 * MARK: reportSurveyImagesToTask
 * @description Appends one job summary to the task's process log (and saves
 *   the task) so the park history shows what image generation did. Silent
 *   (returns null, touches nothing) when the feature is off and there is
 *   nothing to warn about.
 * @example reportSurveyImagesToTask({ store, cwd: '/repo', task, summary }) => ['[INFO] image-gen: ...'] | null
 * @param {Object} [opts]
 * @param {Object} [opts.store] - Task store (for `_saveTaskMarkdown`).
 * @param {string} [opts.cwd] - Project working directory.
 * @param {Object} [opts.task] - Task entity (mutated with log lines).
 * @param {Object} [opts.summary] - `ensureSurveyImages` summary.
 * @returns {string[]|null} Log lines written, or null when silent.
 ***/
export const reportSurveyImagesToTask = ({ store, cwd, task, summary } = {}) => {
	if (!task || !summary) return null;
	const lines = [];
	if (summary.providerId !== IMAGE_GEN_DISABLED) {
		const parts = [];
		if (summary.generated > 0) parts.push(`${summary.generated} generated`);
		if (summary.failed > 0) parts.push(`${summary.failed} failed`);
		if (summary.capped > 0) parts.push(`${summary.capped} over the survey limit`);
		if (summary.skipped > 0) parts.push(`${summary.skipped} already ready`);
		lines.push(
			`[INFO] image-gen: provider '${summary.providerId}' — ${parts.length > 0 ? parts.join(", ") : "nothing to do"}`,
		);
	}
	for (const warning of summary.warnings || []) lines.push(`[WARN] image-gen: ${warning}`);
	for (const error of (summary.errors || []).slice(0, 3)) lines.push(`[WARN] image-gen: ${error}`);
	if (lines.length === 0) return null;
	for (const line of lines) {
		try {
			_appendProcessLog(task, line);
		} catch {
			// Logging must never break the caller.
		}
	}
	try {
		store?._saveTaskMarkdown?.(cwd, task);
	} catch {
		// Best effort: the summary is also in the returned value.
	}
	return lines;
};

/***
 * MARK: CHOSEN_DESIGNS_HEADING
 * @description Markdown section heading listing the human's picked survey
 *   images (appended to the survey file on submit, updated on re-submit).
 * @example CHOSEN_DESIGNS_HEADING => '## Chosen designs'
 ***/
export const CHOSEN_DESIGNS_HEADING = "## Chosen designs";

/***
 * MARK: chosenSurveyImageFileName
 * @description Stable asset name for a human's picked survey image
 *   (`survey-r<round>-<qid>-chosen.png`, sanitized): re-submits overwrite
 *   the same file, so downstream stages can rely on the path.
 * @example chosenSurveyImageFileName(1, 'q1') => 'survey-r1-q1-chosen.png'
 * @param {number} round - Round number.
 * @param {string} questionId - Question id.
 * @returns {string}
 ***/
export const chosenSurveyImageFileName = (round, questionId) => {
	const safe = sanitizeImageName(`survey-r${round}-${safeQuestionStem(questionId)}-chosen.png`);
	return safe || `survey-r${round}-chosen.png`;
};

const CHOSEN_ENTRY_PATTERN = /^- \[r(\d+)\/([^\]]+)\]/;

const escapeMarkdownText = (value) =>
	String(value || "").replace(/\s+/g, " ").trim().replace(/[\[\]]/g, "\\$&").slice(0, 200);

/***
 * MARK: upsertChosenDesignsSection
 * @description Returns survey markdown with the `## Chosen designs` reference
 *   section added or merged: each entry is one `- [r<round>/<qid>] ![...](assets/...)`
 *   line keyed by round+question, so re-submits update prior picks in place
 *   instead of duplicating them. Round JSON fences are never touched (pure
 *   markdown surgery around them).
 * @example upsertChosenDesignsSection('# Survey\n', [{ round: 1, questionId: 'qi', text: 'Pick', option: 'dark', file: 'assets/a.png' }]).includes('## Chosen designs') => true
 * @param {string} markdown - Current survey file text.
 * @param {Array<Object>} entries - `{ round, questionId, text, option, file }` picks.
 * @returns {string}
 ***/
export const upsertChosenDesignsSection = (markdown, entries) => {
	const base = typeof markdown === "string" ? markdown : "";
	const picks = (Array.isArray(entries) ? entries : []).filter(
		(e) => e && Number.isFinite(e.round) && e.questionId && e.file,
	);
	if (picks.length === 0) return base;
	const lines = base.split("\n");
	const headerAt = lines.findIndex((line) => line.trim() === CHOSEN_DESIGNS_HEADING);
	const renderEntry = (entry) =>
		`- [r${entry.round}/${entry.questionId}] ![${escapeMarkdownText(`${entry.text || entry.questionId}: ${entry.option || ""}`)}](${entry.file})`;
	// Merge key: entries are keyed r<round>/<qid>; newcomers append, picks
	// for a known key overwrite in place.
	const merged = new Map();
	const intro = [];
	const harvest = (line) => {
		const match = CHOSEN_ENTRY_PATTERN.exec(line.trim());
		if (match) merged.set(`r${match[1]}/${match[2]}`, line.trim());
		else if (line.trim()) intro.push(line);
	};
	let sectionEnd = lines.length;
	if (headerAt >= 0) {
		sectionEnd = lines.length;
		for (let i = headerAt + 1; i < lines.length; i += 1) {
			if (/^##\s+\S/.test(lines[i])) {
				sectionEnd = i;
				break;
			}
		}
		for (let i = headerAt + 1; i < sectionEnd; i += 1) harvest(lines[i]);
	}
	for (const entry of picks) {
		merged.set(`r${entry.round}/${entry.questionId}`, renderEntry(entry));
	}
	const ordered = [...merged.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([, line]) => line);
	// Harvested prose (human annotations) survives updates; fresh sections
	// get the default explainer.
	const introLines = intro.length > 0
		? intro
		: ["Image-question selections, saved automatically when the survey is submitted (re-submitting updates this list)."];
	const section = [CHOSEN_DESIGNS_HEADING, "", ...introLines, "", ...ordered, ""];
	if (headerAt >= 0) {
		const next = [...lines.slice(0, headerAt), ...section, ...lines.slice(sectionEnd)];
		return `${next.join("\n").replace(/\s+$/, "")}\n`;
	}
	return `${base.replace(/\s+$/, "")}\n\n${section.join("\n").replace(/\s+$/, "")}\n`;
};

/***
 * MARK: persistChosenSurveyImages
 * @description Copies every answered image question's picked picture to a
 *   stable `assets/survey-r<round>-<qid>-chosen.png` name and references it
 *   from the survey file's `## Chosen designs` section (markdown only — round
 *   JSON is untouched). Idempotent: re-running with the same answers rewrites
 *   identical bytes. Never throws — persistence failures are reported in the
 *   result so a submit can never fail on them.
 * @example await persistChosenSurveyImages({ cwd: '/repo', taskId: 't1' }) => ({ chosen: [...], sectionWritten: true })
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - Project working directory.
 * @param {Object} [opts.project] - Project record (docs-dir aware).
 * @param {string} [opts.taskId] - Task id.
 * @param {string} [opts.surveyFile] - Survey file name (defaults to SURVEY.md).
 * @param {Array} [opts.rounds] - Pre-read rounds (skips the file read for planning).
 * @returns {Promise<{ chosen: Array, sectionWritten: boolean, errors: Array }>}
 ***/
export const persistChosenSurveyImages = async (opts = {}) => {
	const result = { chosen: [], sectionWritten: false, errors: [] };
	try {
		const { cwd, project = null, taskId, surveyFile = null, rounds: providedRounds } = opts;
		if (!cwd || !taskId) return result;
		const survey = Array.isArray(providedRounds)
			? { exists: true, rounds: providedRounds, markdown: null }
			: readSurvey(cwd, project, taskId, surveyFile || undefined);
		if (!survey.exists || !Array.isArray(survey.rounds)) return result;
		for (const round of survey.rounds) {
			const answers = round?.answers && typeof round.answers === "object" ? round.answers : {};
			for (const question of round?.questions || []) {
				if (question?.type !== "image") continue;
				const selected = answers[question.id]?.selected;
				if (!Array.isArray(selected) || selected.length === 0) continue;
				const optionIndex = (question.options || []).indexOf(selected[0]);
				if (optionIndex < 0) continue;
				const entry = (Array.isArray(question.images) ? question.images : []).find(
					(e) => e?.option === optionIndex && e?.status === "ready",
				);
				if (!entry || typeof entry.file !== "string" || !entry.file) continue;
				const sourceName = entry.file.split("/").pop();
				const sourceFile = resolveTaskAssetFile(cwd, taskId, sourceName, project);
				if (!sourceFile) continue;
				let bytes;
				try {
					/* eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved through the traversal-safe asset helper */
					bytes = fs.readFileSync(sourceFile);
				} catch {
					continue; // Artifact gone (deleted by hand): skip, keep the survey valid.
				}
				const chosenName = chosenSurveyImageFileName(round.round, question.id);
				try {
					writeTaskImage(cwd, taskId, chosenName, bytes, project);
				} catch (err) {
					result.errors.push(`r${round.round}/${question.id}: ${shortError(err?.message)}`);
					continue;
				}
				result.chosen.push({
					round: round.round,
					questionId: question.id,
					text: question.text || "",
					option: selected[0],
					file: taskAssetRelPath(chosenName),
				});
			}
		}
		if (result.chosen.length === 0) return result;
		const filePath = resolveSurveyPath(cwd, project, taskId, surveyFile || undefined);
		if (!filePath) return result;
		let before;
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved through the survey path helper */
			before = survey.markdown !== null && survey.markdown !== undefined
				? survey.markdown
				: fs.readFileSync(filePath, "utf8");
		} catch {
			return result;
		}
		const after = upsertChosenDesignsSection(before, result.chosen);
		if (after !== before) {
			_atomicWriteFileSync(filePath, after);
			result.sectionWritten = true;
		} else {
			result.sectionWritten = true; // Idempotent re-submit: already recorded.
		}
		return result;
	} catch (err) {
		result.errors.push(shortError(err?.message));
		return result;
	}
};
