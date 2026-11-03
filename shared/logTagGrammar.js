/**
 * MARK: logTagGrammar
 * @description The ONE tag grammar mapping a rendered log line to its
 *   structured entry kind and feed. Backend synthesis
 *   (`api/watch/processLogs.js`) and the frontend legacy parse
 *   (`frontend/src/components/tasks/logEntryModel.js`) both delegate here,
 *   so a tag can never classify one way in stored history and another way
 *   in the live view. The structured agent path never uses this — its
 *   records carry explicit kinds from the log processor; this grammar is
 *   only the fallback for tag-prefixed TEXT (command/git/CI output,
 *   runner text frames, legacy processLogs strings).
 *
 *   Pure module: zero dependencies — safe to import from the backend, the
 *   runner bundle, and the UI.
 */

/***
 * MARK: LOG_LINE_TAG_RULES
 * @description Tag prefix rules in match order (first match wins). No two
 *   rules overlap, so the order is documentation, not behavior — except
 *   that these run against the STDOUT-unwrapped line (see
 *   `classifyLogLineTag`).
 * @example LOG_LINE_TAG_RULES[0] => { pattern: /^\[(TOOL|RESULT)\]/, kind: 'tool', feed: 'tools' }
 ***/
const LOG_LINE_TAG_RULES = Object.freeze([
	{ pattern: /^\[(TOOL|RESULT)\]/, kind: "tool", feed: "tools" },
	// One rule covers `[RUNNER]` and `[runner <id>]`: after `[runner` the
	// next character is either `]` (caps form) or a space (inline form).
	{ pattern: /^\[runner[\] ]/i, kind: "runner", feed: "main" },
	{ pattern: /^\[THINKING\]/, kind: "thinking", feed: "thinking" },
	{ pattern: /^\[USAGE\]/, kind: "telemetry", feed: "telemetry" },
	{ pattern: /^\[RAW\]/, kind: "raw", feed: "raw" },
	{ pattern: /^\[PERM\]/, kind: "permission", feed: "main" },
	{ pattern: /^\[PLAN\]/, kind: "plan", feed: "main" },
	// Case-insensitive like every other error check in the UI: a lowercase
	// `[error]` line is still an error, not narrative.
	{ pattern: /^\[(ERROR|FAIL|STDERR)\]/i, kind: "error", feed: "main" },
	{
		pattern: /^\[(INFO|SYSTEM|GIT|CI\/CMD|CI|HUMAN|WARN)\]/,
		kind: "system",
		feed: "main",
	},
	{ pattern: /^\[AGENT\]/, kind: "assistant", feed: "main" },
]);

/***
 * MARK: classifyLogLineTag
 * @description Maps one rendered log chunk to its structured entry kind and
 *   feed using the shared tag grammar. Only the first line decides — except
 *   that a `[STDOUT]` stream wrapper unwraps to the second line, so the
 *   content tag classifies instead of the wrapper. (`[STDERR]` never
 *   unwraps: the error stream marker itself is the classification.)
 *   Untagged text is assistant narrative.
 * @example classifyLogLineTag('[TOOL] bash("ls")') => { kind: 'tool', feed: 'tools' }
 * @example classifyLogLineTag('[STDOUT]\n[AGENT] reasoning') => { kind: 'assistant', feed: 'main' }
 * @example classifyLogLineTag('plain narrative') => { kind: 'assistant', feed: 'main' }
 * @param {string} line - One rendered log chunk (may span lines).
 * @returns {{kind: string, feed: string}} The entry kind and feed.
 ***/
export function classifyLogLineTag(line) {
	const lines = String(line).split("\n");
	const firstLine = lines[0] || "";
	const checkLine =
		/^\[STDOUT\]/i.test(firstLine) && lines.length > 1 ? lines[1] : firstLine;
	const rule = LOG_LINE_TAG_RULES.find((candidate) =>
		candidate.pattern.test(checkLine),
	);
	if (rule) return { kind: rule.kind, feed: rule.feed };
	return { kind: "assistant", feed: "main" };
}
