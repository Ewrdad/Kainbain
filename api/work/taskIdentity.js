// Domain: The Work — preserves the task store's existing public contract.

/***
 * MARK: _sanitizeTaskTitle
 * @description Sanitizes task titles by stripping leading markdown heading symbols (#, ##),
 * unescaping wrapping quotes, and trimming whitespace so card headers stay clean.
 * @example _sanitizeTaskTitle('"# Add warning"') => 'Add warning'
 * @param {string} raw
 * @returns {string}
 ***/
export function _sanitizeTaskTitle(raw) {
	if (!raw || typeof raw !== "string") return "Untitled task";
	// Collapse multi-line titles to single line
	let str = raw.replace(/[\r\n]+/g, " ").trim();
	// Repeatedly strip wrapping quotes, markdown headers, and stray edge quotes
	let prev;
	do {
		prev = str;
		str = str.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim();
		str = str.replace(/^#+\s*/, "").trim();
	} while (str !== prev);

	return str || "Untitled task";
}

/***
 * MARK: deriveTaskTitleFromGoal
 * @description Derives the fallback task title from a goal's FIRST line only:
 *   goals are markdown documents, so only the title line may become a title
 *   (never a mid-document slice). Splits on CR, LF, or CRLF so Windows and
 *   old-Mac line endings behave the same, and caps the result at
 *   `maxTitleLength` (60, matching the historical `goal.slice(0, 60)` cap).
 *   Returns "" for empty or non-string input so callers can layer their own
 *   fallback (e.g. `_sanitizeTaskTitle`'s "Untitled task").
 * @example deriveTaskTitleFromGoal({ goal: '# Fix it\n\nbody text' }) => '# Fix it'
 * @example deriveTaskTitleFromGoal({ goal: 'a\r\nb' }) => 'a'
 * @example deriveTaskTitleFromGoal({ goal: null }) => ''
 * @param {Object} [args]
 * @param {string} [args.goal] - Raw goal text (may be multi-line markdown).
 * @param {number} [args.maxTitleLength=60] - Max characters kept from the first line.
 * @returns {string} The first line sliced to `maxTitleLength` ("" when absent).
 ***/
export function deriveTaskTitleFromGoal({ goal, maxTitleLength = 60 } = {}) {
	if (!goal || typeof goal !== "string") return "";
	const firstLine = goal.split(/\r\n|\r|\n/)[0] ?? "";
	return firstLine.slice(0, maxTitleLength);
}

/***
 * MARK: toTaskSummary
 * @description Projects one task onto its board-list shape: everything the
 *   kanban board, search, and analytics read, without the detail-only
 *   weight (log entries, process logs, curated prompt, history, timeline,
 *   stats, and full report bodies — a 45-task project serves ~20MB with
 *   them, seconds on a fast link and effectively never over a relayed
 *   phone connection). Report entries keep their metadata (path, name,
 *   stage) so counts and links still resolve, capped at the 5 most
 *   recent with the total in `reportCount`; detail views hydrate the
 *   full task through `GET /tasks/:id` on open.
 * @example toTaskSummary(task) => { id: 'task-1', reports: [{ path, … }], … }
 * @param {Object} [task] - The full task record (never mutated).
 * @returns {Object} The summary projection ({} when task is missing).
 ***/
// Board lists fetch every task on load: a long-lived task can accumulate
// hundreds of report entries, so summaries carry only the recent few.
// `body` mirrors `goal`, and `reliabilitySamples`/`reviewBaseline` serve
// api-side or detail views — none of them ride the list (detail views
// hydrate the full task through `GET /tasks/:id` on open).
const SUMMARY_REPORT_LIMIT = 5;

export function toTaskSummary(task) {
	if (!task || typeof task !== "object") return {};
	const {
		prompt: _prompt,
		processLogs: _processLogs,
		logEntries: _logEntries,
		history: _history,
		timeline: _timeline,
		stats: _stats,
		body: _body,
		reliabilitySamples: _reliabilitySamples,
		reviewBaseline: _reviewBaseline,
		reports,
		...rest
	} = task;
	const meta = Array.isArray(reports)
		? reports.map((r) => {
				if (r === null || typeof r !== "object") return r;
				const { content: _content, ...meta } = r;
				return meta;
			})
		: reports;
	return {
		...rest,
		reports: Array.isArray(meta) ? meta.slice(-SUMMARY_REPORT_LIMIT) : meta,
		reportCount: Array.isArray(reports) ? reports.length : 0,
	};
}
