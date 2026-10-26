// Domain: canonical CI/agent keyword token catalogue.
// The single list of `{{...}}` tokens the UI may offer for stage commands
// and agent prompts. Every entry resolves through `interpolatePromptKeywords`
// (api/promptCuration.js) at execution time; `kind` marks shell-safe path
// tokens vs plain values. Content-bearing tokens (report bodies) stay
// prompt-only by omission: they would blow past command-line length limits.

/***
 * MARK: STAGE_KEYWORD_TOKENS
 * @description Canonical keyword tokens for stage commands and agent
 *   prompts. Each token resolves server-side at execution time; unknown
 *   `{{...}}` patterns are left literal so misconfiguration fails visible.
 *   `{{latestReportPath:<slug>}}` is shown with the `plan` slug as the
 *   copyable example — replace it with any stage slug.
 * @example STAGE_KEYWORD_TOKENS.some((t) => t.token === '{{taskDocs}}') => true
 ***/
export const STAGE_KEYWORD_TOKENS = Object.freeze([
	{
		token: "{{project}}",
		label: "Project",
		hint: "Project name",
		kind: "value",
	},
	{
		token: "{{projectRoot}}",
		label: "Project Root",
		hint: "Absolute root directory path",
		kind: "path",
	},
	{
		token: "{{projectRepo}}",
		label: "Project Repo",
		hint: "Git repository URL or path",
		kind: "value",
	},
	{
		token: "{{taskRepo}}",
		label: "Task Repo",
		hint: "Task repository URL or path",
		kind: "value",
	},
	{
		token: "{{taskGoal}}",
		label: "Task Goal",
		hint: "Task goal or title",
		kind: "value",
	},
	{
		token: "{{taskDocs}}",
		label: "Task Docs",
		hint: "Task dedicated docs folder",
		kind: "path",
	},
	{
		token: "{{taskId}}",
		label: "Task ID",
		hint: "Unique task identifier",
		kind: "value",
	},
	{
		token: "{{stageName}}",
		label: "Stage Name",
		hint: "Current stage name",
		kind: "value",
	},
	{
		token: "{{previousReports}}",
		label: "Previous Reports",
		hint: "Paths of all prior stage reports",
		kind: "path",
	},
	{
		token: "{{latestReportPath}}",
		label: "Latest Report Path",
		hint: "Path of the most recent stage report",
		kind: "path",
	},
	{
		token: "{{latestReportPath:plan}}",
		label: "Stage Report Path",
		hint: "Path of the most recent report from one stage (replace plan with the stage slug)",
		kind: "path",
	},
]);

/***
 * MARK: STAGE_KEYWORD_TOKEN_KINDS
 * @description Allowed `kind` values for catalogue entries: `value` (plain
 *   string), `path` (shell-safe when quoted — always quote tokens in
 *   commands, e.g. `test -f "{{taskDocs}}plan.md"`), or `action` (a
 *   side-effecting keyword deferred to a future hook/env mechanism).
 * @example STAGE_KEYWORD_TOKEN_KINDS => ['value', 'path', 'action']
 ***/
export const STAGE_KEYWORD_TOKEN_KINDS = Object.freeze(["value", "path", "action"]);
