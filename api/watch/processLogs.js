// Domain: Watching the Work — task progress entries and their feeds.
import { config } from "../config.js";
/***
 * MARK: _logEntryKindFromText
 * @description Maps a rendered log chunk to its structured entry kind and
 *   feed using the shared tag grammar. Untagged text is assistant narrative.
 * @example _logEntryKindFromText('[TOOL] bash(…)') => { kind: 'tool', feed: 'tools' }
 * @param {string} text
 * @returns {{kind: string, feed: string}}
 ***/
function _logEntryKindFromText(text) {
	const raw = String(text);
	const lines = raw.split("\n");
	const firstLine = lines[0] || "";
	if (/^\[(ERROR|FAIL|STDERR)\]/i.test(firstLine))
		return { kind: "error", feed: "main" };
	const checkLine = /^\[STDOUT\]/i.test(firstLine) && lines.length > 1 ? lines[1] : firstLine;
	if (/^\[(TOOL|RESULT)\]/.test(checkLine))
		return { kind: "tool", feed: "tools" };
	if (/^\[THINKING\]/.test(checkLine))
		return { kind: "thinking", feed: "thinking" };
	if (/^\[(ERROR|FAIL|STDERR)\]/.test(checkLine))
		return { kind: "error", feed: "main" };
	if (/^\[(INFO|SYSTEM|GIT|CI\/CMD|CI|HUMAN|WARN)\]/.test(checkLine)) {
		return { kind: "system", feed: "main" };
	}
	if (/^\[AGENT\]/.test(checkLine)) return { kind: "assistant", feed: "main" };
	// Runner frames carry an inline `[runner <id>]` prefix (ingested over
	// the wire). They get their own kind so the log viewer can tag and
	// filter them per runner instead of lumping them into assistant output.
	if (/^\[runner[ \]]/i.test(checkLine)) return { kind: "runner", feed: "main" };
	// Untagged text is assistant narrative (block text from the agent streamer).
	return { kind: "assistant", feed: "main" };
}

/** Monotonic counter for synthesized log entry ids (never Date.now() so
 *  same-millisecond entries cannot collide). */
let _logEntryIdCounter = 0;

/***
 * MARK: _synthesizedLogEntry
 * @description Wraps a rendered log chunk as a structured log entry so the
 *   UI has one uniform shape for every log source (agent streamer entries
 *   and system/GIT/CI lines alike).
 * @example _synthesizedLogEntry('[GIT] Switched to main') => { kind: 'system', text: '…', … }
 * @param {string} chunk
 * @returns {Object} A structured log entry.
 ***/
function _synthesizedLogEntry(chunk, meta = {}) {
	_logEntryIdCounter += 1;
	const { kind, feed } = _logEntryKindFromText(chunk);
	return {
		id: `log-${_logEntryIdCounter}`,
		ts: new Date().toISOString(),
		feed,
		feeds: [feed],
		kind,
		turn: null,
		text: String(chunk),
		meta: { source: "process-log", ...meta },
	};
}

/***
 * MARK: _capLogEntries
 * @description Keeps at most `config.logEntriesMaxCount` entries on a task,
 *   dropping the oldest and recording the eviction under a single updating
 *   marker entry (mirrors the streamer's eviction behaviour).
 * @example _capLogEntries(task)
 * @param {Object} task
 * @returns {void}
 ***/
function _capLogEntries(task) {
	const max = config.logEntriesMaxCount;
	if (!Array.isArray(task.logEntries) || task.logEntries.length <= max) return;
	const existingMarker = task.logEntries[0];
	const hasMarker = existingMarker?.meta?.evictedCount !== undefined;
	// Reserve one slot for the marker so the cap holds after it is unshifted.
	const keepTarget = hasMarker ? max : max - 1;
	const overflow = task.logEntries.length - keepTarget;
	if (overflow <= 0) return;
	task.logEntries.splice(hasMarker ? 1 : 0, overflow);
	const markerText = `[INFO] (${overflow} earlier log entries evicted)`;
	if (hasMarker) {
		const previousCount = existingMarker.meta.evictedCount + overflow;
		existingMarker.text = `[INFO] (${previousCount} earlier log entries evicted)`;
		existingMarker.meta = { evictedCount: previousCount };
	} else {
		_logEntryIdCounter += 1;
		task.logEntries.unshift({
			id: `log-${_logEntryIdCounter}`,
			ts: new Date().toISOString(),
			feed: "main",
			feeds: ["main"],
			kind: "system",
			turn: null,
			text: markerText,
			meta: { evictedCount: overflow },
		});
	}
}

/***
 * MARK: parseLegacyProcessLogText
 * @description Parses legacy rendered process-log text (line-based tag
 *   grammar) into structured entries (blank lines dropped, consecutive
 *   duplicates de-duped) so tasks predating the structured-entries era still
 *   serve feeds. Shared by the markdown legacy-section synthesis
 *   (`parseTaskMarkdown`) and the in-memory feed fallback below — it is a
 *   read-only migration path, never a second storage format.
 * @example parseLegacyProcessLogText('[INFO] a\n[INFO] a') => [entry('[INFO] a')]
 * @param {string} text
 * @returns {Array<Object>} Structured log entries.
 ***/
export function parseLegacyProcessLogText(text) {
	const source = typeof text === "string" ? text : "";
	if (!source.trim()) return [];
	const parsed = [];
	for (const line of source.split("\n")) {
		if (!line.trim()) continue;
		if (parsed.length > 0 && parsed[parsed.length - 1].text === line) continue;
		parsed.push(_synthesizedLogEntry(line));
	}
	return parsed;
}

/***
 * MARK: renderLogEntriesText
 * @description The ONE shared renderer from structured log entries to legacy
 *   tag-grammar text — every text view is derived here at read time, never
 *   stored. With a `feed` option only that feed's entries render; without
 *   one, the combined main+tools narrative renders (thinking entries stay
 *   out, mirroring the streamer's combined view).
 * @example renderLogEntriesText(entries) => "[AGENT] reasoning…\n[TOOL] bash(…)"
 * @example renderLogEntriesText(entries, { feed: 'tools' }) => "[TOOL] bash(…)"
 * @param {Array<Object>} entries
 * @param {{ feed?: string }} [opts]
 * @returns {string}
 ***/
export function renderLogEntriesText(entries, { feed } = {}) {
	const selected = (Array.isArray(entries) ? entries : []).filter((entry) => {
		if (!entry) return false;
		const placed = Array.isArray(entry.feeds) ? entry.feeds : [entry.feed];
		if (feed) return placed.includes(feed);
		return placed.includes("main") || placed.includes("tools");
	});
	return selected.map((entry) => entry.text).join("\n");
}

/***
 * MARK: _logEntriesForFeed
 * @description Collects a task's entries placed on one feed (main/thinking/
 *   tools), bounded to `config.logEntriesMaxCount`. Structured entries are
 *   the single storage path; the legacy-text fallback only exists for tasks
 *   still carrying a pre-migration `processLogs` string (read-only).
 * @example _logEntriesForFeed(task, 'thinking') => [thinkingEntry, …]
 * @param {Object} task
 * @param {string} feed
 * @returns {Array<Object>} The feed's entries, oldest first.
 ***/
export function _logEntriesForFeed(task, feed) {
	const structured = Array.isArray(task?.logEntries)
		? task.logEntries.filter(Boolean)
		: [];
	const all =
		structured.length > 0
			? structured
			: parseLegacyProcessLogText(task?.processLogs);
	const matching = all.filter((entry) =>
		(Array.isArray(entry.feeds) ? entry.feeds : [entry.feed]).includes(feed),
	);
	const capped = { logEntries: matching };
	_capLogEntries(capped);
	return capped.logEntries;
}

/***
 * MARK: _appendLogEntries
 * @description Appends structured log entries to task.logEntries, capping the
 *   array to `config.logEntriesMaxCount`.
 * @example _appendLogEntries(task, streamer.snapshot().entries)
 * @param {Object} task
 * @param {Array<Object>} newEntries
 * @returns {void}
 ***/
export function _appendLogEntries(task, newEntries) {
	if (!task || !Array.isArray(newEntries)) return;
	if (!Array.isArray(task.logEntries)) task.logEntries = [];
	for (const entry of newEntries) {
		if (entry) task.logEntries.push(entry);
	}
	_capLogEntries(task);
}

/***
 * MARK: _replaceLogEntries
 * @description Replaces the log entries accumulated for one stage run (the
 *   synthesized tail of the array) with the agent streamer's structured
 *   entries, upgrading turn-grouped text blocks into the task's log.
 * @example _replaceLogEntries(task, startIndex, result.logEntries)
 * @param {Object} task
 * @param {number} startIndex - Index where the stage's entries begin.
 * @param {Array<Object>} entries - The structured entries for the stage.
 * @returns {void}
 ***/
export function _replaceLogEntries(task, startIndex, entries) {
	if (!task || !Array.isArray(entries)) return;
	if (!Array.isArray(task.logEntries)) task.logEntries = [];
	const safeStart = Math.max(0, Math.min(startIndex, task.logEntries.length));
	task.logEntries.splice(safeStart);
	_appendLogEntries(task, entries);
}

/***
 * MARK: _appendProcessLog
 * @description Appends a rendered log chunk to the task's structured
 *   `logEntries` as one synthesized entry — the single log storage path
 *   (agent streamer entries replace the synthesized ones when the stage
 *   result arrives). Growth is bounded by `config.logEntriesMaxCount` with
 *   an eviction marker; the historical rendered-text copy
 *   (`task.processLogs`) is gone and every text view is derived from entries
 *   at read time via `renderLogEntriesText`.
 * @example _appendProcessLog(task, '[GIT] Switched to main')
 * @param {Object} task
 * @param {string} chunk
 * @param {Object} [meta] - Extra entry metadata (e.g. `{ runnerId }`).
 * @returns {void}
 ***/
export function _appendProcessLog(task, chunk, meta = {}) {
	if (!task || !chunk) return;
	_appendLogEntries(task, [_synthesizedLogEntry(String(chunk).trim(), meta)]);
}
