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
