/***
 * MARK: formatTimestamp
 * @description Formats a Date object into a YYYYMMDD-HHmmss timestamp string.
 * @example formatTimestamp(new Date('2026-08-18T19:51:42Z')) => '20260818-195142'
 * @param {Date} [date=new Date()]
 * @returns {string}
 ***/
import {
	buildSkillsPromptSections,
	resolveSkillKeywordMap,
	setInterpolatePromptKeywords,
} from "./skills/skillInjection.js";
import { skillsRegistry } from "./skills/skillsRegistry.js";
import { stageExpectsAgentVerdict } from "./agent/verdictContract.js";
import { config as appConfig } from "./config.js";
import { collectTaskImageRefs } from "./work/taskAssets.js";
import { resolveDocsDirName } from "./docsPath.js";
import {
	DEFAULT_PROMPT_LAYOUT,
	MANDATORY_LAYOUT_TOKENS,
	SECTION_TOKENS,
	extractLayoutTokens,
	renderPromptLayout,
} from "../shared/promptLayout.js";
import {
	getActivePromptLayout,
	recordPromptLayoutFallback,
	recordPromptLayoutSuccess,
	resolvePromptLayoutDir,
} from "./promptLayout/layoutStore.js";

// Dependency inversion: skillInjection resolves custom {{keywords}} through the same
// keyword engine (without an import cycle). No-op until promptCuration is imported.
setInterpolatePromptKeywords(interpolatePromptKeywords);

export function formatTimestamp(date = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");
	const yyyy = date.getFullYear();
	const MM = pad(date.getMonth() + 1);
	const dd = pad(date.getDate());
	const hh = pad(date.getHours());
	const mm = pad(date.getMinutes());
	const ss = pad(date.getSeconds());
	return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

/***
 * MARK: slugifyStageName
 * @description Converts a stage name or ID into a sanitized lowercase slug for file paths.
 * @example slugifyStageName('Technical Elab') => 'technical-elab'
 * @param {string} name
 * @returns {string}
 ***/
export function slugifyStageName(name) {
	if (!name) return "stage";
	return (
		String(name)
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-_]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "stage"
	);
}

/***
 * MARK: formatImageRefs
 * @description Formats the "# Task Images" prompt section from relative asset paths
 *   (`assets/<name>`): one markdown image reference per line plus a file-path guidance
 *   line, capped at `maxRefs` entries with an "(+N more, see assets/)" overflow note.
 *   Empty/blank entries are dropped; an empty result yields "" (no section at all, so
 *   image-less tasks keep byte-identical prompts).
 * @example formatImageRefs(['assets/a.png']) => '# Task Images\n...' (multi-line block)
 * @example formatImageRefs([]) => ''
 * @param {string[]} imageRefs
 * @param {Object} [opts]
 * @param {number} [opts.maxRefs] - Cap on injected references (default config.taskImageMaxPromptRefs).
 * @returns {string}
 ***/
export function formatImageRefs(imageRefs, { maxRefs } = {}) {
	const refs = (Array.isArray(imageRefs) ? imageRefs : [])
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
	if (refs.length === 0) return "";
	const cap =
		typeof maxRefs === "number" && maxRefs > 0
			? Math.floor(maxRefs)
			: appConfig.taskImageMaxPromptRefs;
	const listed = refs.slice(0, cap);
	const lines = listed.map((ref) => `- ![image](${ref}) — relative to the task folder`);
	if (refs.length > listed.length) {
		lines.push(
			`- (+${refs.length - listed.length} more images not listed; see the task's assets/ folder)`,
		);
	}
	return [
		"# Task Images",
		"The task's image assets are listed below. Reference them with the relative",
		"markdown path shown (they resolve inside this task's docs folder), open them",
		"with your file tools to view their content, and NEVER inline image bytes as",
		"base64 into prompts, logs, or reports.",
		...lines,
	].join("\n");
}

/***
 * MARK: interpolatePromptKeywords
 * @description Replaces runtime template keywords in stage or task prompts with live context:
 *   - {{project}}: Name of the project.
 *   - {{projectRoot}}: Absolute path to the project root (working directory).
 *   - {{projectRepo}} / {{taskRepo}}: Git repository URL or path.
 *   - {{taskGoal}}: Goal or title of the task.
 *   - {{taskDocs}}: Path to <projectRoot>/docs/tasks/<taskId>/.
 *   - {{previousReports}}: Newline-separated paths of all prior stage reports for this task.
 *   - {{latestReportPath}}: Path of the most recent stage report for this task.
 *   - {{latestReportPath:<stageSlug>}}: Path of the most recent report from <stageSlug> (or fallback if none exists).
 *   - {{latestReport:<stageSlug>}}: Markdown content of the most recent report from <stageSlug> (or fallback if none exists).
 *   Custom keys may be supplied via `context.customKeywords` (used for stage-skill
 *   KB_config keywords); a custom key takes precedence over a built-in one. Unknown
 *   `{{...}}` patterns are returned unchanged.
 * @example interpolatePromptKeywords('Goal: {{taskGoal}} in {{project}}', { task: { goal: 'Fix bug' }, project: { name: 'KainBain' } }) => 'Goal: Fix bug in KainBain'
 * @param {string} template - The template prompt string.
 * @param {Object} [context={}] - Context parameters including task, stage, project, and reports.
 * @returns {string} The interpolated prompt string.
 ***/
/***
 * MARK: buildInterpolationContext
 * @description Builds the keyword context object consumed by
 *   `interpolatePromptKeywords`, shared by the agent prompt curation engine
 *   and CI command interpolation so the two can never drift apart. Explicit
 *   fields win over the `options` bag (the prompt engine passes its whole
 *   options object there), which in turn wins over `task` fields. Returns
 *   exactly what `PromptCurationEngine.curatePrompt` used to build inline.
 * @example buildInterpolationContext({ task: { id: 't1' }, projectCwd: '/repo' }).task.id => 't1'
 * @param {Object} [args]
 * @param {Object} [args.task] - Task entity (goal, reports, project fallbacks).
 * @param {Object} [args.stage] - Current stage entity (name for {{stageName}}, skills for custom keywords).
 * @param {Object} [args.project] - Project record (overrides task.project).
 * @param {string} [args.projectName] - Project name override.
 * @param {string} [args.projectRepo] - Project repo URL override.
 * @param {string} [args.taskRepo] - Task repo URL override.
 * @param {string} [args.projectCwd] - Absolute project working directory.
 * @param {string} [args.taskDocs] - Task docs folder override.
 * @param {Array} [args.reports] - Prior stage reports override.
 * @param {Array} [args.latestReports] - Latest-reports supplement.
 * @param {Object} [args.customKeywords] - Stage-skill custom keyword overrides.
 * @param {Object} [args.options] - Options bag (prompt engine options); explicit fields win over it.
 * @returns {Object} Context object for `interpolatePromptKeywords`.
 ***/
export function buildInterpolationContext(args = {}) {
	const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? args : {};
	const taskInput = safeArgs.task;
	const stageInput = safeArgs.stage;
	const task = taskInput && typeof taskInput === "object" && !Array.isArray(taskInput) ? taskInput : {};
	const stage = stageInput && typeof stageInput === "object" && !Array.isArray(stageInput) ? stageInput : {};
	const {
		project,
		projectName,
		projectRepo,
		taskRepo,
		projectCwd,
		taskDocs,
		reports,
		latestReports,
		customKeywords,
		options = {},
	} = safeArgs;
	const source = options && typeof options === "object" && !Array.isArray(options) ? options : {};
	// Keep using task/stage locals below; avoid re-declaring source.

	// source resolved above
	return {
		task,
		stage,
		project: project || source.project || task.project,
		projectName:
			projectName ||
			source.projectName ||
			source.project?.name ||
			task.projectName,
		projectRepo:
			projectRepo ||
			source.projectRepo ||
			source.gitUrl ||
			source.project?.gitUrl ||
			task.gitUrl ||
			task.gitRepo,
		taskRepo:
			taskRepo ||
			source.taskRepo ||
			source.gitUrl ||
			task.taskRepo ||
			task.gitUrl ||
			task.gitRepo,
		projectCwd: projectCwd || source.projectCwd || task.projectCwd,
		taskDocs: taskDocs || source.taskDocs,
		reports: reports || source.reports || source.previousReports || task.reports || [],
		latestReports: latestReports || source.latestReports || [],
		...(customKeywords ? { customKeywords } : {}),
	};
}

/***
 * MARK: resolveStageCustomKeywords
 * @description Resolves a stage's skill custom keywords (KB_config +
 *   per-stage config) into the `customKeywords` map for interpolation.
 *   Returns null when the stage attaches no skills or none define keywords,
 *   so interpolation behaviour stays byte-identical to legacy. The loader
 *   defaults to the process-wide skill registry; the prompt engine passes
 *   its own override-aware loader instead.
 * @example resolveStageCustomKeywords({}) => null
 * @param {Object} [stage] - Stage entity carrying an optional `skills` array.
 * @param {string|null} [projectCwd] - Project working directory for overlay lookup.
 * @param {Function|null} [loadSkill] - Optional `(name) => skill|null` override.
 * @returns {Object|null} Keyword map, or null when there is nothing to add.
 ***/
export function resolveStageCustomKeywords(stage, projectCwd, loadSkill = null) {
	const attachments = Array.isArray(stage?.skills) ? stage.skills : [];
	if (attachments.length === 0) return null;
	const loader =
		typeof loadSkill === "function"
			? loadSkill
			: (name) => skillsRegistry.getSkill(name, { projectCwd });
	const keywordMap = {};
	for (const attachment of attachments) {
		const name =
			attachment && typeof attachment === "object"
				? String(attachment.name || "").trim()
				: "";
		if (!name) continue;
		const skill = loader(name);
		if (!skill || skill.invalid) continue;
		Object.assign(
			keywordMap,
			resolveSkillKeywordMap(skill.keywords, attachment.config || {}),
		);
	}
	return Object.keys(keywordMap).length > 0 ? keywordMap : null;
}

export function interpolatePromptKeywords(template, context = {}) {
	if (!template || typeof template !== "string") return "";
	const resolvedContext =
		context && typeof context === "object" && !Array.isArray(context) ? context : {};

	const rawTask = resolvedContext.task;
	const rawProject = resolvedContext.project;
	const task =
		rawTask && typeof rawTask === "object" && !Array.isArray(rawTask) ? rawTask : {};
	const project =
		rawProject && typeof rawProject === "object" && !Array.isArray(rawProject)
			? rawProject
			: {};
	const projectName = resolvedContext.projectName;
	const projectRepo = resolvedContext.projectRepo;
	const taskRepo = resolvedContext.taskRepo;
	const projectCwd = resolvedContext.projectCwd;
	const taskDocs = resolvedContext.taskDocs;
	const reports = Array.isArray(resolvedContext.reports) ? resolvedContext.reports : [];
	const latestReports = Array.isArray(resolvedContext.latestReports)
		? resolvedContext.latestReports
		: [];
	const customKeywords = resolvedContext.customKeywords;

	const resolvedProjectName =
		projectName ||
		project?.name ||
		task.projectName ||
		(typeof task.project === "string" ? task.project : task.project?.name) ||
		"Project";

	const resolvedRepo =
		projectRepo ||
		taskRepo ||
		project?.gitUrl ||
		project?.gitRepo ||
		task.gitUrl ||
		task.gitRepo ||
		task.taskRepo ||
		"";

	const resolvedGoal = task.goal || task.title || task.description || "";

	const taskId = task.id || "unassigned";
	const resolvedTaskDocs =
		taskDocs ||
		(projectCwd
			? `${projectCwd.replace(/\/+$/, "")}/${resolveDocsDirName(project)}/tasks/${taskId}/`
			: `./${resolveDocsDirName(project)}/tasks/${taskId}/`);

	const allReports = [
		...(Array.isArray(reports) ? reports : []),
		...(Array.isArray(latestReports) ? latestReports : []),
		...(Array.isArray(task.reports) ? task.reports : []),
	].sort((a, b) => {
		const ta =
			typeof a === "object" && a
				? a.timestamp || a.createdAt || ""
				: String(a || "");
		const tb =
			typeof b === "object" && b
				? b.timestamp || b.createdAt || ""
				: String(b || "");
		return String(ta).localeCompare(String(tb));
	});

	return template.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
		const key = rawKey.trim();

		// Stage-skill custom keywords (KB_config + per-stage config) take precedence
		// over built-ins; with customKeywords absent this branch never runs, so
		// legacy interpolation behaviour is byte-identical.
		if (
			customKeywords &&
			typeof customKeywords === "object" &&
			Object.prototype.hasOwnProperty.call(customKeywords, key)
		) {
			/* eslint-disable-next-line security/detect-object-injection -- guarded by hasOwnProperty */
			return String(customKeywords[key]);
		}

		if (key === "project") {
			return resolvedProjectName;
		}

		if (key === "projectRepo" || key === "taskRepo") {
			return resolvedRepo;
		}

		if (key === "taskGoal") {
			return resolvedGoal;
		}

		if (key === "taskDocs") {
			return resolvedTaskDocs;
		}

		if (key === "projectRoot") {
			return projectCwd || "./";
		}

		if (key === "previousReports") {
			const paths = allReports
				.map((r) =>
					typeof r === "string" ? r : r.path || r.filename || r.stageSlug,
				)
				.filter(Boolean);
			return paths.length > 0
				? paths.join("\n")
				: "(No previous stage reports available)";
		}

		if (key === "taskId") {
			return task.id || taskId || "";
		}

		if (key === "stageName") {
			return (
				resolvedContext.stage?.name ||
				resolvedContext.stageName ||
				(typeof resolvedContext.stage === "string" ? resolvedContext.stage : "") ||
				""
			);
		}

		if (key === "latestReportPath") {
			const last = allReports[allReports.length - 1];
			if (last) {
				return typeof last === "string" ? last : last.path || last.filename || "";
			}
			return "(No report available)";
		}

		if (key.startsWith("latestReportPath:")) {
			const targetSlug = slugifyStageName(
				key.slice("latestReportPath:".length).trim(),
			);

			// Path-only sibling of `latestReport:<slug>`: returns the report
			// path (never content) so CI shell commands can test for a prior
			// stage's report without hitting command-line length limits.
			const matchingReports = allReports.filter((r) => {
				if (!r) return false;
				const slug = r.stageSlug || slugifyStageName(r.stageName || r.name || "");
				return slug === targetSlug;
			});

			if (matchingReports.length > 0) {
				const latest = matchingReports[matchingReports.length - 1];
				const reportPath =
					typeof latest === "string"
						? latest
						: latest.path || latest.filename || "";
				if (reportPath) {
					return reportPath;
				}
			}

			return `(No report available for stage ${targetSlug})`;
		}

		if (key.startsWith("latestReport:")) {
			const targetSlug = slugifyStageName(
				key.slice("latestReport:".length).trim(),
			);

			// Find matching reports by stageSlug or stageName
			const matchingReports = allReports.filter((r) => {
				if (!r) return false;
				const slug = r.stageSlug || slugifyStageName(r.stageName || r.name || "");
				return slug === targetSlug;
			});

			if (matchingReports.length > 0) {
				const latest = matchingReports[matchingReports.length - 1];
				const content =
					typeof latest === "string"
						? latest
						: latest.content || latest.text || latest.body || "";
				if (content && typeof content === "string" && content.trim()) {
					return content.trim();
				}
			}

			return `(No report available for stage ${targetSlug})`;
		}

		return match;
	});
}

/***
 * MARK: STAGE_REPORT_SKILL_NAME
 * @description The stage-skill name whose attachment opts an agent stage into
 *   receiving the `# Reporting` prompt section (writer #1) and the engine's
 *   automatic success report (writer #2). Absent by default on every stage.
 * @example stageWantsReport({ skills: [{ name: "stage-report" }] }) => true
 ***/
export const STAGE_REPORT_SKILL_NAME = "stage-report";

/***
 * MARK: stageWantsReport
 * @description The single opt-in predicate for automatic agent-stage reporting.
 *   Returns true only when the stage explicitly asks for a report — either via
 *   the legacy `stage.report === true` flag or by attaching the `stage-report`
 *   skill. Default false: a default agent stage writes NO report file on success
 *   (neither an agent-authored one nor an engine-generated one), which stops
 *   the two-junk-files-per-stage pollution. CI / human / deploy / merge paths
 *   never consult this predicate and are unaffected.
 * @example stageWantsReport({}) => false
 * @example stageWantsReport({ report: true }) => true
 * @example stageWantsReport({ skills: [{ name: "stage-report" }] }) => true
 * @param {Object} [stage] - Stage entity (`report`, `skills`).
 * @returns {boolean} True when this stage opts into reporting.
 ***/
export function stageWantsReport(stage) {
	if (!stage || typeof stage !== "object") return false;
	if (stage.report === true) return true;
	if (!Array.isArray(stage.skills)) return false;
	return stage.skills.some(
		(attachment) =>
			attachment &&
			typeof attachment === "object" &&
			String(attachment.name || "").trim().toLowerCase() ===
				STAGE_REPORT_SKILL_NAME,
	);
}

/***
 * MARK: PromptCurationEngine
 * @description Assembles discrete task prompts containing the task goal, stage instructions,
 * target report markdown path, optional prior reports or failure/feedback details,
 * and performs dynamic keyword template substitution. When a stage declares `skills`
 * (see api/skills/), curated prompts also carry the direct-injected skill bodies and/or
 * the option-mode skill manifest; with no skills attached the output is byte-identical
 * to the legacy format.
 ***/
/***
 * MARK: TESTING_GUIDANCE_TEXT
 * @description Canonical testing-gate body. Rendered into `# Testing &
 *   Verification Guidance` for review/spec stages (legacy behaviour) and
 *   auto-re-injected for verdict-expecting agent stages whose custom layout
 *   omits `{{testingGuidance}}`, so test verification cannot be silently cut.
 * @example TESTING_GUIDANCE_TEXT.startsWith('Unit/integration tests') => true
 ***/
const TESTING_GUIDANCE_TEXT =
	"Unit/integration tests (`npm run test:unit`) and existing automated test suites are the primary verification gate. When visual verification is needed, do not spawn long-lived background servers — use isolated headless test runners, existing mock fixtures, or the headless screenshot tool (`npm run capture:screenshot`).";

/***
 * MARK: resolveAutoReinjectedTokens
 * @description Predicts which conditional contract sections a layout omits
 *   but the run still needs: `failureDetails` whenever failure/feedback
 *   context is non-empty, `testingGuidance` for agent stages expecting a
 *   verdict. Shared by the engine render path and the dry-run endpoint so
 *   the preview can never disagree with dispatch.
 * @example resolveAutoReinjectedTokens([], { hasFailureDetails: true, stage: { type: 'agent' } }) => ['failureDetails', 'testingGuidance']
 * @param {string[]} names - Token names present in the layout.
 * @param {Object} [facts]
 * @param {boolean} [facts.hasFailureDetails] - Failure/feedback context exists.
 * @param {Object} [facts.stage] - Current stage entity.
 * @returns {string[]} Conditional tokens to auto-append.
 ***/
export function resolveAutoReinjectedTokens(
	names = [],
	{ hasFailureDetails, stage } = {},
) {
	const present = Array.isArray(names) ? names : [];
	const autoReinjected = [];
	if (!present.includes("failureDetails") && hasFailureDetails) {
		autoReinjected.push("failureDetails");
	}
	if (!present.includes("testingGuidance") && stageExpectsAgentVerdict(stage)) {
		autoReinjected.push("testingGuidance");
	}
	return autoReinjected;
}

/***
 * MARK: hashPromptLayout
 * @description Short non-crypto fingerprint of a layout for fallback logs
 *   (identifies WHICH bad layout served default without logging its body).
 * @example hashPromptLayout('{{task}}').length => 8
 * @param {string} layout - Layout markdown.
 * @returns {string} Eight hex chars.
 ***/
export function hashPromptLayout(layout) {
	let hash = 0;
	for (const char of String(layout ?? "")) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

/***
 * MARK: safeRecordPromptLayoutFallback
 * @description Records a render fallback without ever throwing: health
 *   bookkeeping must not break prompt dispatch when the state dir is
 *   unwritable (disk full, permissions, stray file at the path). Failures
 *   are swallowed — the returned prompt already fell back to default.
 * @example safeRecordPromptLayoutFallback('/proc/hopefully-unwritable') => undefined
 * @param {string} dir - Layout state dir.
 ***/
function safeRecordPromptLayoutFallback(dir) {
	try {
		recordPromptLayoutFallback({ dir });
	} catch {
		// Health counter only; dispatch already serves the default layout.
	}
}

/***
 * MARK: safeRecordPromptLayoutSuccess
 * @description Clears the fallback counter without ever throwing (same
 *   fail-safe posture as safeRecordPromptLayoutFallback).
 * @example safeRecordPromptLayoutSuccess('/proc/hopefully-unwritable') => undefined
 * @param {string} dir - Layout state dir.
 ***/
function safeRecordPromptLayoutSuccess(dir) {
	try {
		recordPromptLayoutSuccess({ dir });
	} catch {
		// Health counter only; the rendered prompt is already correct.
	}
}

/***
 * MARK: safeGetActivePromptLayout
 * @description Resolves the active custom layout without ever throwing: any
 *   storage failure reads as "default layout active" so dispatch continues
 *   on the canonical prompt.
 * @example safeGetActivePromptLayout('/proc/hopefully-unwritable') => null
 * @param {string} dir - Layout state dir.
 * @returns {string|null} Custom layout markdown, or null for default.
 ***/
function safeGetActivePromptLayout(dir) {
	try {
		return getActivePromptLayout({ dir });
	} catch {
		return null;
	}
}

/***
 * MARK: renderCustomLayoutChunk
 * @description Renders one blank-line-delimited layout chunk: section tokens
 *   substitute their pre-built blocks raw (never re-interpolated, so legacy
 *   bodies keep byte-identical text), while the surrounding custom prose is
 *   interpolated with the live keyword context.
 * @param {string} chunk - One layout chunk.
 * @param {Object} [sectionMap] - Section name to pre-built block text.
 * @param {Object} [interpolationContext] - Live keyword context.
 * @returns {string} The rendered chunk (possibly blank when sections are empty).
 ***/
function renderCustomLayoutChunk(
	chunk,
	sectionMap = {},
	interpolationContext = {},
) {
	const sections =
		sectionMap && typeof sectionMap === "object" ? sectionMap : {};
	const context =
		interpolationContext && typeof interpolationContext === "object"
			? interpolationContext
			: {};
	const rendered = [];
	const pattern = /\{\{([^}]+)\}\}/g;
	let cursor = 0;
	for (const match of String(chunk).matchAll(pattern)) {
		const name = String(match[1] || "").trim();
		if (!SECTION_TOKENS.includes(name)) continue;
		rendered.push(
			interpolatePromptKeywords(String(chunk).slice(cursor, match.index), context),
		);
		const block = sections[name];
		rendered.push(block === undefined || block === null ? "" : String(block));
		cursor = match.index + match[0].length;
	}
	rendered.push(
		interpolatePromptKeywords(String(chunk).slice(cursor), context),
	);
	return rendered.join("");
}

/***
 * MARK: renderCustomLayout
 * @description Renders a custom layout: per-chunk section substitution with
 *   prose interpolation, dropping chunks left blank by empty sections.
 * @example renderCustomLayout('{{task}}\n\n{{stage}}', { task: 'a', stage: 'b' }) => 'a\n\nb'
 * @param {string} layout - Custom layout markdown.
 * @param {Object} [sectionMap] - Section name to pre-built block text.
 * @param {Object} [interpolationContext] - Live keyword context.
 * @returns {string} The rendered markdown.
 ***/
function renderCustomLayout(
	layout,
	sectionMap = {},
	interpolationContext = {},
) {
	return String(layout)
		.split(/\n\s*\n/)
		.map((chunk) =>
			renderCustomLayoutChunk(chunk, sectionMap, interpolationContext),
		)
		.filter((chunk) => chunk.trim())
		.join("\n\n");
}

export class PromptCurationEngine {
	/***
	 * MARK: constructor
	 * @description Creates the engine. All parameters are optional test seams:
	 *   `loadSkill` overrides skill lookup (`(name, projectCwd) => descriptor|null`),
	 *   `skillsMaxChars` overrides the injection size cap, `logger` receives
	 *   info/warn events for custom-layout renders, `promptLayoutDir` overrides
	 *   the layout state dir. Defaults come from the process-wide skills
	 *   registry and config, keeping legacy behaviour untouched.
	 * @param {Object} [opts]
	 * @param {Function} [opts.loadSkill]
	 * @param {number} [opts.skillsMaxChars]
	 * @param {Object} [opts.logger]
	 * @param {string} [opts.promptLayoutDir]
	 ***/
	constructor({ loadSkill, skillsMaxChars, logger, promptLayoutDir } = {}) {
		this._loadSkillOverride = typeof loadSkill === "function" ? loadSkill : null;
		this._skillsMaxChars =
			typeof skillsMaxChars === "number" && skillsMaxChars > 0
				? skillsMaxChars
				: null;
		this._logger = logger || null;
		this._promptLayoutDir =
			typeof promptLayoutDir === "string" && promptLayoutDir
				? promptLayoutDir
				: null;
	}

	/***
	 * MARK: setLogger
	 * @description Attaches a logger after construction (the shared engine is
	 *   built before the Fastify app exists, so `app.log` is wired this way).
	 * @example engine.setLogger(app.log)
	 * @param {Object} logger - Logger with `info`/`warn` methods.
	 ***/
	setLogger(logger) {
		this._logger = logger || null;
	}

	/***
	 * MARK: _skillLoaderFor
	 * @description Returns the skill lookup used for one curation pass: the injected
		 override when set, otherwise the process-wide registry (project overlay wins).
	 * @param {string|null} projectCwd
	 * @returns {Function} (name) => skill descriptor | null
	 ***/
	_skillLoaderFor(projectCwd) {
		if (this._loadSkillOverride) {
			return (name) => this._loadSkillOverride(name, projectCwd);
		}
		return (name) => skillsRegistry.getSkill(name, { projectCwd });
	}

	/***
	 * MARK: calculateReportPath
	 * @description Creates a standardized, timestamped file path for task reports in ./<docsDirName>/tasks/<taskID>/.
	 * @example engine.calculateReportPath('task-1', 'Plan', '20260818-120000') => './docs/tasks/task-1/plan-20260818-120000.md'
	 * @example engine.calculateReportPath('task-1', 'Plan', '20260818-120000', { docsDirName: 'k-docs' }) => './k-docs/tasks/task-1/plan-20260818-120000.md'
	 * @param {string} taskId
	 * @param {string} stageNameOrId
	 * @param {string} [timestamp]
	 * @param {Object} [project] - Project record carrying `docsDirName`; absent/invalid degrades to `docs`.
	 * @returns {string} The file path for the report.
	 ***/
	calculateReportPath(taskId, stageNameOrId, timestamp, project = null) {
		const safeTaskId = taskId || "unassigned";
		const stageSlug = slugifyStageName(stageNameOrId);
		const ts = timestamp || formatTimestamp();
		return `./${resolveDocsDirName(project)}/tasks/${safeTaskId}/${stageSlug}-${ts}.md`;
	}

	/***
	 * MARK: curatePrompt
	 * @description Generates a curated prompt by assembling task, stage, prior reports, and reporting elements
	 * while omitting historical trace clutter and dynamically interpolating runtime keyword templates.
	 * @example const prompt = engine.curatePrompt(task, stage, { failureDetails: 'Test failed' })
	 * @param {Object} task - The task definition.
	 * @param {Object} stage - The current stage definition.
	 * @param {Object|string} [options=null] - Optional failure details or options object.
	 * @returns {string} The curated prompt.
	 ***/
	curatePrompt(task = {}, stage = {}, options = null) {
		const sectionMap = {};

		let failureDetails = null;
		let previousReports = [];
		let timestamp = null;
		let projectContext = {};

		if (typeof options === "string") {
			failureDetails = options;
		} else if (options && typeof options === "object") {
			failureDetails = options.failureDetails || options.feedback || null;
			previousReports = Array.isArray(options.previousReports)
				? options.previousReports
				: Array.isArray(options.reports)
					? options.reports
					: [];
			timestamp = options.timestamp || null;
			projectContext = options;
		}

		if (!failureDetails && task.feedback) {
			failureDetails = task.feedback;
		}
		if (previousReports.length === 0 && Array.isArray(task.reports)) {
			previousReports = task.reports
				.map((r) => (typeof r === "string" ? r : r.path || r.filePath))
				.filter(Boolean);
		}

		// Shared builder (also used by CI command interpolation): the
		// returned object is exactly what the inline construction below
		// used to produce, so prompts stay byte-identical.
		const interpolationContext = buildInterpolationContext({
			task,
			stage,
			options: projectContext,
		});

		// Stage skills: KB_config + per-stage keyword overrides are re-exposed to the
		// stage prompt itself ({{<key>}}) via customKeywords. With no skills attached
		// this stays empty and interpolation behaviour is byte-identical to legacy.
		const projectCwd = interpolationContext.projectCwd || null;
		const stageSkillAttachments = Array.isArray(stage?.skills)
			? stage.skills
			: [];
		const skillLoader = this._skillLoaderFor(projectCwd);
		const stageKeywordMap = resolveStageCustomKeywords(
			stage,
			projectCwd,
			skillLoader,
		);
		if (stageKeywordMap) {
			interpolationContext.customKeywords = stageKeywordMap;
		}

		// 1. Task Prompt
		const rawTaskPrompt =
			task.goal ||
			task.title ||
			task.description ||
			"No overarching task specified.";
		const taskPrompt = interpolatePromptKeywords(
			rawTaskPrompt,
			interpolationContext,
		);
		sectionMap.task = `# Task\n${taskPrompt}`;

		// 2. Stage Prompt (the stage's own authored prompt or description; the
		// per-task system prompt override feature was removed — prompts are
		// composed dynamically from the task goal and stage context)
		const rawStagePrompt =
			stage.prompt ||
			stage.description ||
			"Perform the current stage of the task.";
		const stagePrompt = interpolatePromptKeywords(
			rawStagePrompt,
			interpolationContext,
		);
		sectionMap.stage = `# Stage\n${stagePrompt}`;

		// 2b. Stage Skills (direct-injected bodies and/or option-mode manifest).
		// Appended after # Stage and before # Previous Reports so stage guidance and
		// failure sections keep the last word. Empty when no skills => no-op.
		if (stageSkillAttachments.length > 0) {
			const { sections } = buildSkillsPromptSections({
				skills: stageSkillAttachments,
				interpolationContext,
				maxChars:
					this._skillsMaxChars === null
						? appConfig.stageSkillsMaxChars
						: this._skillsMaxChars,
				loadSkill: skillLoader,
			});
			if (sections.length > 0) {
				sectionMap.skills = sections.join("\n\n");
			}
		}

		// 2c. Task Images (relative file references, NEVER base64 bytes — most
		// harness/model pairs cannot consume embedded images and bytes would bloat
		// the context). Callers may pass options.taskImages to pin the list; when
		// omitted (and a task folder is resolvable) the assets directory is read.
		// Tasks without images keep byte-identical prompts (empty section skipped).
		const taskId = task.id || "unassigned";
		let imageRefs = [];
		if (Array.isArray(options?.taskImages)) {
			imageRefs = options.taskImages;
		} else if (projectCwd) {
			imageRefs = collectTaskImageRefs(
				projectCwd,
				taskId,
				appConfig.taskImageMaxPromptRefs,
				interpolationContext.project,
			);
		}
		const imageSection = formatImageRefs(imageRefs, {
			maxRefs: appConfig.taskImageMaxPromptRefs,
		});
		if (imageSection) {
			sectionMap.taskImages = imageSection;
		}

		// Per-project docs folder: the project record (when it is an object)
		// carries `docsDirName`; a bare name string degrades to the default.
		const docsProject =
			interpolationContext.project &&
			typeof interpolationContext.project === "object"
				? interpolationContext.project
				: task?.project && typeof task.project === "object"
					? task.project
					: null;
		const docsDirName = resolveDocsDirName(docsProject);

		// 3. Previous Stage Reports (if available)
		if (previousReports.length > 0) {
			const reportList = previousReports
				.map((p) =>
					typeof p === "string" ? p : p.path || p.filename || p.stageSlug,
				)
				.filter(Boolean)
				.map((p) => `- ${p}`)
				.join("\n");
			if (reportList) {
				sectionMap.previousReports =
					`# Previous Reports\nThe following prior stage reports are available in ./${docsDirName}/tasks/${task.id || "task"}/:\n${reportList}`;
			}
		}

		// Stage label is needed by the reporting gate (section 4) and the
		// testing-guidance heuristic (section 6).
		const stageLabel = stage.name || stage.id || "stage";

		// 4. Report Prompt — OPT-IN only. The legacy unconditional
		// "write a summary report" instruction was the first of two junk-file
		// writers per agent stage. It now renders only when the stage opts in
		// via `stage.report === true` or the `stage-report` skill; the skill
		// body (injected in 2b) carries the same instruction for the agent,
		// while the engine's structured save (stageExecution.js) stays the
		// single deterministic writer for opt-in stages.
		if (stageWantsReport(stage)) {
			const reportPath = this.calculateReportPath(
				task.id,
				stageLabel,
				timestamp,
				docsProject,
			);
			const reportPrompt = `After completing this stage, write a summary report to ${reportPath}.`;
			sectionMap.reporting = `# Reporting\n${reportPrompt}`;
		}

		// 5. Failure Details / Human Feedback (Optional)
		if (failureDetails) {
			sectionMap.failureDetails = `# Failure Details\n${failureDetails}`;
		}

		// 6. Testing & Review Guidance
		const isReviewOrSpecStage =
			/review/i.test(stageLabel) ||
			/review/i.test(stage.name || stage.id || "") ||
			/plan|spec|elab/i.test(stage.name || stage.id || "");
		if (isReviewOrSpecStage) {
			sectionMap.testingGuidance =
				`# Testing & Verification Guidance\n${TESTING_GUIDANCE_TEXT}`;
		}

		// 7. How to fail a stage (Standardized interface).
		// Rendered from the `stage-verdict` skill (global default, project
		// overlay wins) for agent stages, so wrapped harnesses without a
		// Fail_stage_skill tool can still fail WITH reasoned guidance.
		// Stages that attach `stage-verdict` explicitly already carry it
		// (see 2b) and non-agent stages keep the legacy line.
		const legacyFailGuidance =
			"If you fail this stage, use the Fail_stage_skill to report why. Do NOT request or specify a target stage — KainBain will route the task back to the stage configured for failback on this stage.";
		sectionMap.failureGuidance =
			`# Stage Failure Guidance\n${renderStageVerdictGuidance({
				stage,
				skillLoader,
				stageSkillAttachments,
				fallback: legacyFailGuidance,
			})}`;

		const useDefault = Boolean(
			options?.useDefaultLayout ||
				task?.useDefaultLayout ||
				task?.options?.useDefaultLayout,
		);

		let customLayout = null;
		if (!useDefault) {
			if (typeof options?.promptLayout === "string") {
				customLayout = options.promptLayout;
			} else {
				const storeDir = this._promptLayoutDir || resolvePromptLayoutDir();
				customLayout = safeGetActivePromptLayout(storeDir);
			}
		}

		if (customLayout) {
			const storeDir = this._promptLayoutDir || resolvePromptLayoutDir();
			const layoutTokens = extractLayoutTokens(customLayout);
			const missingMandatory = MANDATORY_LAYOUT_TOKENS.filter(
				(name) => !layoutTokens.includes(name),
			);

			if (missingMandatory.length > 0) {
				safeRecordPromptLayoutFallback(storeDir);
				this._logger?.warn?.(
					{
						taskId: task?.id,
						stage: stage?.name || stage?.id,
						missingTokens: missingMandatory,
						layoutHash: hashPromptLayout(customLayout),
					},
					"Prompt layout fallback to default: missing mandatory tokens",
				);
				return renderPromptLayout(DEFAULT_PROMPT_LAYOUT, sectionMap);
			}

			try {
				const autoReinjected = resolveAutoReinjectedTokens(layoutTokens, {
					hasFailureDetails: Boolean(failureDetails),
					stage,
				});

				if (
					autoReinjected.includes("testingGuidance") &&
					!sectionMap.testingGuidance
				) {
					sectionMap.testingGuidance =
						`# Testing & Verification Guidance\n${TESTING_GUIDANCE_TEXT}`;
				}

				let rendered = renderCustomLayout(
					customLayout,
					sectionMap,
					interpolationContext,
				);

				const extraSections = [];
				for (const token of autoReinjected) {
					if (sectionMap[token]) {
						extraSections.push(sectionMap[token]);
					}
				}
				if (extraSections.length > 0) {
					rendered = [rendered, ...extraSections].join("\n\n");
					this._logger?.warn?.(
						{
							taskId: task?.id,
							stage: stage?.name || stage?.id,
							autoReinjected,
							layoutHash: hashPromptLayout(customLayout),
						},
						"Prompt layout auto-reinjected conditional sections",
					);
				}

				safeRecordPromptLayoutSuccess(storeDir);
				this._logger?.info?.(
					{
						taskId: task?.id,
						stage: stage?.name || stage?.id,
						layoutHash: hashPromptLayout(customLayout),
					},
					"Custom prompt layout active",
				);

				return rendered;
			} catch (err) {
				safeRecordPromptLayoutFallback(storeDir);
				this._logger?.warn?.(
					{
						taskId: task?.id,
						stage: stage?.name || stage?.id,
						error: err?.message,
						layoutHash: hashPromptLayout(customLayout),
					},
					"Prompt layout render exception; falling back to default layout",
				);
				return renderPromptLayout(DEFAULT_PROMPT_LAYOUT, sectionMap);
			}
		}

		return renderPromptLayout(DEFAULT_PROMPT_LAYOUT, sectionMap);
	}
}

/***
 * MARK: renderStageVerdictGuidance
 * @description Resolves the "# Stage Failure Guidance" body: the
 *   `stage-verdict` skill body (project overlay wins via the skill loader)
 *   for agent stages — unless the stage already attaches it (injected in 2b,
 *   never duplicate) — with a legacy one-liner fallback when the skill is
 *   missing or invalid.
 * @example renderStageVerdictGuidance({ stage: { type: "agent" }, skillLoader: () => null, fallback: "legacy" }) => "legacy"
 * @param {Object} [opts]
 * @param {Object} [opts.stage] - The current stage definition.
 * @param {Function} [opts.skillLoader] - (name) => skill descriptor | null.
 * @param {Array} [opts.stageSkillAttachments] - The stage.skills attachments.
 * @param {string} [opts.fallback] - Legacy text when the skill is unavailable.
 * @returns {string} The guidance body.
 ***/
export function renderStageVerdictGuidance({
	stage,
	skillLoader,
	stageSkillAttachments = [],
	fallback = "",
}) {
	if (!stageExpectsAgentVerdict(stage)) return fallback;
	const attached = (
		Array.isArray(stageSkillAttachments) ? stageSkillAttachments : []
	).some(
		(attachment) =>
			attachment &&
			typeof attachment === "object" &&
			String(attachment.name || "").trim().toLowerCase() ===
				"stage-verdict",
	);
	if (attached) return fallback;
	try {
		const skill = skillLoader?.("stage-verdict");
		if (
			skill &&
			!skill.invalid &&
			typeof skill.body === "string" &&
			skill.body.trim()
		) {
			return skill.body.trim();
		}
	} catch {
		// Fall through to the legacy text below.
	}
	return fallback;
}
