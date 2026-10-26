// Domain: default prompt layout — token catalogue, validation, rendering.
// The layout is markdown with `{{tokens}}` for the dynamic prompt blocks. It
// extends the `interpolatePromptKeywords` keyword system: section tokens name
// whole prompt blocks, inline keywords reuse the existing live context keys.

/***
 * MARK: MAX_LAYOUT_CHARS
 * @description Largest accepted layout in characters. Layouts are local
 *   markdown with no code execution, so the cap only bounds stored size and
 *   rendered prompt growth.
 * @example MAX_LAYOUT_CHARS => 20000
 ***/
export const MAX_LAYOUT_CHARS = 20000;

/***
 * MARK: SECTION_TOKENS
 * @description Block injectors: each names one prompt section the engine
 *   assembles today. A layout that omits one omits that block (subject to
 *   the mandatory/conditional guards below).
 * @example SECTION_TOKENS.includes('task') => true
 ***/
export const SECTION_TOKENS = Object.freeze([
	"task",
	"stage",
	"skills",
	"taskImages",
	"previousReports",
	"reporting",
	"failureDetails",
	"testingGuidance",
	"failureGuidance",
]);

/***
 * MARK: INLINE_KEYWORDS
 * @description Reused live-context keywords (resolved by
 *   `interpolatePromptKeywords`): authors may use these in layout prose.
 *   `latestReport:<slug>` and `latestReportPath:<slug>` are parametric and
 *   allowlisted by prefix.
 * @example INLINE_KEYWORDS.includes('taskGoal') => true
 ***/
export const INLINE_KEYWORDS = Object.freeze([
	"project",
	"projectRoot",
	"projectRepo",
	"taskRepo",
	"taskGoal",
	"taskDocs",
	"taskId",
	"stageName",
	"latestReportPath",
	"latestReportPath:<slug>",
]);

/***
 * MARK: MANDATORY_LAYOUT_TOKENS
 * @description Section tokens a saved layout MUST contain. Each guards a
 *   stage-contract section the reliability model depends on:
 *   - `task`: the task goal itself — without it the agent has no work order.
 *   - `stage`: the stage instructions — without them every stage runs blind.
 *   - `failureGuidance`: the `KAINBAIN_VERDICT` fail-stage contract that
 *     EscalationLadder Step 2 ("Verdict requirements") depends on; agents on
 *     wrapped harnesses without a Fail_stage_skill tool can only fail WITH
 *     reasoned guidance when this section is present.
 *   Validation rejects layouts missing these (400 with names); the render
 *   path additionally falls back to DEFAULT_PROMPT_LAYOUT when they are
 *   missing at runtime, so a contract-free prompt is never emitted.
 * @example MANDATORY_LAYOUT_TOKENS => ['task', 'stage', 'failureGuidance']
 ***/
export const MANDATORY_LAYOUT_TOKENS = Object.freeze([
	"task",
	"stage",
	"failureGuidance",
]);

/***
 * MARK: CONDITIONAL_LAYOUT_TOKENS
 * @description Section tokens that auto-re-inject at render time when their
 *   content is non-empty, instead of blocking the save:
 *   - `failureDetails`: required whenever failure/feedback context exists —
 *     EscalationLadder Step 5 (fail back so earlier stages correct issues)
 *     depends on the agent seeing what failed.
 *   - `testingGuidance`: required for agent stages that expect a verdict /
 *     test gates, so test verification cannot be silently dropped.
 *   Freely omittable chaff (no guard at all): `skills`, `taskImages`,
 *   `previousReports`, `reporting` and any surrounding markdown prose.
 * @example CONDITIONAL_LAYOUT_TOKENS.includes('failureDetails') => true
 ***/
export const CONDITIONAL_LAYOUT_TOKENS = Object.freeze([
	"failureDetails",
	"testingGuidance",
]);

/***
 * MARK: LAYOUT_TOKENS
 * @description Catalogue of every token a layout may use: section blocks and
 *   inline keywords with `requirement` badges (`required` = save-blocker,
 *   `conditional` = auto-added when needed, `optional` = free chaff).
 * @example LAYOUT_TOKENS.find((t) => t.token === 'task') => { token: 'task', ... }
 ***/
export const LAYOUT_TOKENS = Object.freeze([
	{
		token: "task",
		label: "Task",
		category: "section",
		requirement: "required",
		description: "The task goal header (# Task).",
	},
	{
		token: "stage",
		label: "Stage",
		category: "section",
		requirement: "required",
		description: "The stage instructions header (# Stage).",
	},
	{
		token: "skills",
		label: "Stage skills",
		category: "section",
		requirement: "optional",
		description: "Direct-injected stage skill bodies and manifests.",
	},
	{
		token: "taskImages",
		label: "Task images",
		category: "section",
		requirement: "optional",
		description: "Relative image asset references (# Task Images).",
	},
	{
		token: "previousReports",
		label: "Previous reports",
		category: "section",
		requirement: "optional",
		description: "Prior stage report list (# Previous Reports).",
	},
	{
		token: "reporting",
		label: "Reporting",
		category: "section",
		requirement: "optional",
		description: "Opt-in summary-report instruction (# Reporting).",
	},
	{
		token: "failureDetails",
		label: "Failure details",
		category: "section",
		requirement: "conditional",
		description:
			"Failure/feedback context — auto-appended whenever it exists.",
	},
	{
		token: "testingGuidance",
		label: "Testing guidance",
		category: "section",
		requirement: "conditional",
		description:
			"Test verification gate — auto-appended for verdict stages.",
	},
	{
		token: "failureGuidance",
		label: "Stage failure guidance",
		category: "section",
		requirement: "required",
		description: "The KAINBAIN_VERDICT fail-stage contract.",
	},
	{
		token: "project",
		label: "Project name",
		category: "inline",
		requirement: "optional",
		description: "Name of the project.",
	},
	{
		token: "projectRoot",
		label: "Project root",
		category: "inline",
		requirement: "optional",
		description: "Absolute path to the project root.",
	},
	{
		token: "projectRepo",
		label: "Project repo",
		category: "inline",
		requirement: "optional",
		description: "Git repository URL or path.",
	},
	{
		token: "taskRepo",
		label: "Task repo",
		category: "inline",
		requirement: "optional",
		description: "Task repository URL or path.",
	},
	{
		token: "taskGoal",
		label: "Task goal",
		category: "inline",
		requirement: "optional",
		description: "Goal or title of the task.",
	},
	{
		token: "taskDocs",
		label: "Task docs",
		category: "inline",
		requirement: "optional",
		description: "Path to the task docs folder.",
	},
	{
		token: "taskId",
		label: "Task id",
		category: "inline",
		requirement: "optional",
		description: "Id of the task.",
	},
	{
		token: "stageName",
		label: "Stage name",
		category: "inline",
		requirement: "optional",
		description: "Name of the current stage.",
	},
	{
		token: "latestReportPath",
		label: "Latest report path",
		category: "inline",
		requirement: "optional",
		description: "Path of the most recent stage report.",
	},
	{
		token: "latestReport:<slug>",
		label: "Latest stage report",
		category: "inline",
		requirement: "optional",
		description:
			"Markdown content of the most recent report from a stage (replace <slug>).",
	},
	{
		token: "latestReportPath:<slug>",
		label: "Latest stage report path",
		category: "inline",
		requirement: "optional",
		description:
			"Path of the most recent report from a stage (replace <slug>); shell-safe when quoted.",
	},
]);

/***
 * MARK: DEFAULT_PROMPT_LAYOUT
 * @description Canonical markdown template reproducing today's section order
 *   exactly: task, stage, skills, images, previous reports, reporting,
 *   failure details, testing guidance, stage failure guidance. Rendered
 *   through `renderPromptLayout` it is byte-identical to the legacy join.
 * @example DEFAULT_PROMPT_LAYOUT.split('\n\n').length => 9
 ***/
export const DEFAULT_PROMPT_LAYOUT = SECTION_TOKENS.map(
	(name) => `{{${name}}}`,
).join("\n\n");

const TOKEN_PATTERN = /\{\{([^}]+)\}\}/g;

/***
 * MARK: isInlineKeyword
 * @description Whether a token name is an allowlisted inline keyword
 *   (including the parametric `latestReport:<slug>` form).
 * @example isInlineKeyword('taskGoal') => true
 * @example isInlineKeyword('latestReport:plan') => true
 * @param {string} name - Trimmed token name from inside `{{...}}`.
 * @returns {boolean} True when the name is a known inline keyword.
 ***/
export function isInlineKeyword(name) {
	if (INLINE_KEYWORDS.includes(name)) return true;
	if (name.startsWith("latestReportPath:")) {
		return name.slice("latestReportPath:".length).trim().length > 0;
	}
	if (name.startsWith("latestReport:")) {
		return name.slice("latestReport:".length).trim().length > 0;
	}
	return false;
}

/***
 * MARK: extractLayoutTokens
 * @description Lists every `{{token}}` name in a layout, trimmed, in first-
 *   appearance order without duplicates.
 * @example extractLayoutTokens('# T\n{{task}}\n\n{{task}}') => ['task']
 * @param {string} layout - The layout markdown.
 * @returns {string[]} Token names in first-appearance order.
 ***/
export function extractLayoutTokens(layout) {
	if (typeof layout !== "string") return [];
	const seen = [];
	for (const match of layout.matchAll(TOKEN_PATTERN)) {
		const name = String(match[1] || "").trim();
		if (name && !seen.includes(name)) seen.push(name);
	}
	return seen;
}

function closestTokenName(name) {
	const known = [...SECTION_TOKENS, ...INLINE_KEYWORDS];
	let best = null;
	let bestDistance = Infinity;
	for (const candidate of known) {
		const distance = editDistance(
			name.toLowerCase(),
			candidate.toLowerCase(),
		);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}
	return bestDistance <= 2 ? best : null;
}

function editDistance(a, b) {
	const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
	for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			rows[i][j] = Math.min(
				rows[i - 1][j] + 1,
				rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
	}
	return rows[a.length][b.length];
}

/***
 * MARK: validatePromptLayout
 * @description Validates a layout without persisting it: rejects non-string,
 *   empty, and over-size layouts, layouts missing mandatory section tokens,
 *   and layouts with unknown tokens. Conditionally-mandatory tokens are NOT
 *   save-blockers — they surface as `warnings` (auto-re-injected at render).
 * @example validatePromptLayout(DEFAULT_PROMPT_LAYOUT).ok => true
 * @param {*} layout - Candidate layout markdown.
 * @returns {{ ok: boolean, errors: string[], missingMandatory: string[], unknownTokens: string[], warnings: string[] }}
 ***/
export function validatePromptLayout(layout) {
	const empty = {
		ok: false,
		errors: [],
		missingMandatory: [],
		unknownTokens: [],
		warnings: [],
	};
	if (typeof layout !== "string") {
		empty.errors.push("Prompt layout must be a markdown string.");
		return empty;
	}
	if (!layout.trim()) {
		empty.errors.push("Prompt layout must not be empty.");
		return empty;
	}
	if (layout.length > MAX_LAYOUT_CHARS) {
		empty.errors.push(
			`Prompt layout is ${layout.length} characters — the limit is ${MAX_LAYOUT_CHARS}.`,
		);
		return empty;
	}
	const names = extractLayoutTokens(layout);
	const result = {
		ok: true,
		errors: [],
		missingMandatory: [],
		unknownTokens: [],
		warnings: [],
	};
	result.missingMandatory = MANDATORY_LAYOUT_TOKENS.filter(
		(name) => !names.includes(name),
	);
	if (result.missingMandatory.length > 0) {
		result.ok = false;
		result.errors.push(
			`Prompt layout is missing required sections: ${result.missingMandatory.map((name) => `{{${name}}}`).join(", ")}.`,
		);
	}
	for (const name of names) {
		if (SECTION_TOKENS.includes(name) || isInlineKeyword(name)) continue;
		result.unknownTokens.push(name);
		const hint = closestTokenName(name);
		result.errors.push(
			hint
				? `Unknown prompt token {{${name}}} — did you mean {{${hint}}}?`
				: `Unknown prompt token {{${name}}}.`,
		);
	}
	if (result.unknownTokens.length > 0) result.ok = false;
	for (const name of CONDITIONAL_LAYOUT_TOKENS) {
		if (!names.includes(name)) {
			result.warnings.push(
				`{{${name}}} is omitted — it will be auto-appended whenever its content exists.`,
			);
		}
	}
	return result;
}

/***
 * MARK: renderPromptLayout
 * @description Substitutes section tokens with their pre-built blocks and
 *   drops chunks left blank by empty sections, joining the rest with blank
 *   lines. Unknown `{{...}}` tokens pass through unchanged (validation, not
 *   rendering, rejects them). Empty sections vanish without leaving blank
 *   lines, so the default layout renders byte-identical to the legacy join.
 * @example renderPromptLayout('{{task}}\n\n{{stage}}', { task: 'a', stage: 'b' }) => 'a\n\nb'
 * @param {string} layout - Layout markdown with `{{section}}` tokens.
 * @param {Object} [sectionMap] - Section name to pre-built block text.
 * @returns {string} The rendered markdown.
 ***/
export function renderPromptLayout(layout, sectionMap = {}) {
	if (typeof layout !== "string") {
		throw new Error("renderPromptLayout requires a layout string");
	}
	const sections =
		sectionMap && typeof sectionMap === "object" ? sectionMap : {};
	const chunks = String(layout).split(/\n\s*\n/);
	const rendered = [];
	for (const chunk of chunks) {
		const substituted = chunk.replace(TOKEN_PATTERN, (match, raw) => {
			const name = String(raw || "").trim();
			if (!SECTION_TOKENS.includes(name)) return match;
			const block =
				sections[name] === undefined || sections[name] === null
					? ""
					: String(sections[name]);
			return block;
		});
		if (substituted.trim()) rendered.push(substituted);
	}
	return rendered.join("\n\n");
}
