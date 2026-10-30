/**
 * MARK: logEntryModel
 * @description Pure model for the task Logs tab. Turns a task's structured
 *   log entries (`task.logEntries`, produced by the agent log streamer) into
 *   grouped, filterable, renderable views — and falls back to parsing the
 *   legacy `task.processLogs` text (line-based tag grammar) so old tasks keep
 *   rendering exactly as before.
 *
 *   The tag grammar mirrors the API-side synthesis in
 *   `api/taskStore.js` (_logEntryKindFromText):
 *     [TOOL] [RESULT]      -> kind "tool"      (tools feed)
 *     [THINKING]           -> kind "thinking"  (thinking feed)
 *     [ERROR] [FAIL]       -> kind "error"     (main feed)
 *     [AGENT]              -> kind "assistant" (main feed)
 *     [INFO] [SYSTEM] [GIT] [CI] [CI/CMD] [HUMAN] [WARN] -> kind "system"
 *     untagged text        -> kind "assistant" (main feed)
 */

export const LOG_FEEDS = ['ALL', 'ASSISTANT', 'TOOLS', 'THINKING', 'SYSTEM', 'TELEMETRY', 'RAW'];

const TAG_KIND_RULES = [
  { pattern: /^\[(TOOL|RESULT)\]/, kind: 'tool', feed: 'tools' },
  { pattern: /^\[RUNNER\]/, kind: 'runner', feed: 'main' },
  { pattern: /^\[runner[\] ]/i, kind: 'runner', feed: 'main' },
  { pattern: /^\[THINKING\]/, kind: 'thinking', feed: 'thinking' },
  { pattern: /^\[USAGE\]/, kind: 'telemetry', feed: 'telemetry' },
  { pattern: /^\[RAW\]/, kind: 'raw', feed: 'raw' },
  { pattern: /^\[PERM\]/, kind: 'permission', feed: 'main' },
  { pattern: /^\[PLAN\]/, kind: 'plan', feed: 'main' },
  { pattern: /^\[(ERROR|FAIL|STDERR)\]/, kind: 'error', feed: 'main' },
  {
    pattern: /^\[(INFO|SYSTEM|GIT|CI\/CMD|CI|HUMAN|WARN)\]/,
    kind: 'system',
    feed: 'main',
  },
  { pattern: /^\[AGENT\]/, kind: 'assistant', feed: 'main' },
];

/***
 * MARK: legacyLogEntryId
 * @description Stable synthetic id for a parsed legacy log line.
 ***/
let legacyEntryCounter = 0;
const legacyLogEntryId = () => {
  legacyEntryCounter += 1;
  return `legacy-log-${legacyEntryCounter}`;
};

/***
 * MARK: entryFromLogLine
 * @description Maps one rendered log line to a structured entry using the
 *   shared tag grammar. Untagged text is assistant narrative.
 * @example entryFromLogLine('[TOOL] bash("ls")') => { kind: 'tool', feed: 'tools', text: '…' }
 * @param {string} line
 * @returns {Object} A structured log entry.
 ***/
export function entryFromLogLine(line) {
  const lines = String(line).split('\n');
  const firstLine = lines[0] || '';
  const checkLine = /^\[STDOUT\]/.test(firstLine) && lines.length > 1 ? lines[1] : firstLine;
  const rule = TAG_KIND_RULES.find((r) => r.pattern.test(checkLine));
  const kind = rule ? rule.kind : 'assistant';
  const feed = rule ? rule.feed : 'main';
  return {
    id: legacyLogEntryId(),
    ts: null,
    feed,
    feeds: [feed],
    kind,
    turn: null,
    text: String(line),
    meta: { source: 'legacy-process-logs' },
  };
}

/***
 * MARK: parseLegacyProcessLogs
 * @description Parses the legacy `task.processLogs` text into structured
 *   entries: blank lines are dropped, consecutive duplicates are de-duped
 *   (the exact behavior of today's line-based Logs tab).
 * @example parseLegacyProcessLogs('[INFO] a\n[INFO] a') => [entry('[INFO] a')]
 * @param {string} text
 * @returns {Array<Object>} Structured log entries.
 ***/
export function parseLegacyProcessLogs(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').filter((l) => l.trim());
  const result = [];
  for (const line of lines) {
    if (result.length === 0 || result.at(-1).text !== line) {
      result.push(entryFromLogLine(line));
    }
  }
  return result;
}

/***
 * MARK: normalizeEntries
 * @description Returns the task's structured log entries when present, or
 *   synthesizes them from the legacy processLogs text otherwise. WebSocket
 *   process lines (live system output) are appended as system entries.
 * @example normalizeEntries(task) => [entry, …]
 * @param {Object} task - The task (may carry logEntries and/or processLogs).
 * @param {Array<Object>} [wsProcessLines] - Live process:stdout lines from the WebSocket.
 * @returns {Array<Object>} Structured log entries.
 ***/
export function normalizeEntries(task, wsProcessLines = []) {
  const structured = Array.isArray(task?.logEntries) ? task.logEntries.filter(Boolean) : [];
  const base = structured.length > 0 ? [...structured] : parseLegacyProcessLogs(task?.processLogs);
  // Frames already persisted (keyed by execution+seq) must not reappear
  // as live lines after a refetch: the socket pushes each frame the
  // moment it is ingested, and the same frame lands in stored entries on
  // the next task fetch. Frames without an identity (legacy CI lines)
  // always pass through, as before.
  const storedKeys = new Set();
  for (const entry of base) {
    const meta = entry?.meta;
    if (meta && meta.executionId != null && meta.seq != null) {
      storedKeys.add(`${meta.executionId}:${meta.seq}`);
    }
  }
  const live = [];
  for (const p of Array.isArray(wsProcessLines) ? wsProcessLines : []) {
    if (!p) continue;
    if (p.executionId != null && p.seq != null && storedKeys.has(`${p.executionId}:${p.seq}`)) {
      continue;
    }
    // Structured live entries (`PROCESS_LOG_ENTRIES` frames): the backend
    // record rides along untouched — same shape as stored history, so the
    // viewer renders tool cards, timings, and expandable details live.
    if (p.entry && typeof p.entry === 'object') {
      live.push({
        ...p.entry,
        meta: {
          ...(p.entry.meta || {}),
          source: p.entry.meta?.source || 'ws-log-entries',
          ...(p.executionId != null ? { executionId: p.executionId } : {}),
          ...(p.seq != null ? { seq: p.seq } : {}),
          ...(p.runnerId != null ? { runnerId: p.runnerId } : {}),
        },
      });
      continue;
    }
    // WS records carry a `[Project] ` prefix; strip one leading bracket
    // group so the tag grammar classifies the actual line kind.
    const line = p.raw || `${p.tag || '[INFO]'} ${p.text || ''}`;
    const entry = entryFromLogLine(String(line).replace(/^\[[^\]\n]+\] (?=\[)/, ''));
    entry.meta = {
      ...(entry.meta || {}),
      source: 'ws-process-logs',
      ...(p.executionId != null ? { executionId: p.executionId } : {}),
      ...(p.seq != null ? { seq: p.seq } : {}),
      ...(p.runnerId != null ? { runnerId: p.runnerId } : {}),
    };
    live.push(entry);
  }
  return [...base, ...live];
}

/***
 * MARK: groupByTurn
 * @description Groups entries into ordered turns for the grouped rendering.
 *   Entries without a turn (legacy parse) all land in one un-numbered group.
 * @example groupByTurn(entries) => [{ turn: 1, entries: [...] }, …]
 * @param {Array<Object>} entries
 * @returns {Array<{turn: number|null, entries: Array<Object>}>}
 ***/
export function groupByTurn(entries) {
  const groups = [];
  for (const entry of entries) {
    const turn = Number.isFinite(entry?.turn) ? entry.turn : null;
    const last = groups.at(-1);
    if (last && last.turn === turn) {
      last.entries.push(entry);
    } else {
      groups.push({ turn, entries: [entry] });
    }
  }
  return groups;
}

/***
 * MARK: feedMatchesEntry
 * @description Whether an entry belongs to a feed chip. ALL is the combined
 *   main terminal view (main + tools entries — full thinking blocks stay on
 *   the THINKING chip and telemetry/raw records stay on their own chips so
 *   they never leak into the narrative or copy). Errors surface under the
 *   SYSTEM chip (still color-highlighted).
 * @example feedMatchesEntry('SYSTEM', { kind: 'error' }) => true
 * @param {string} feed - One of LOG_FEEDS.
 * @param {Object} entry
 * @returns {boolean}
 ***/
export function feedMatchesEntry(feed, entry) {
  const entryFeeds = Array.isArray(entry.feeds) ? entry.feeds : [entry.feed];
  if (!feed || feed === 'ALL') {
    return entryFeeds.some((f) => f === 'main' || f === 'tools');
  }
  if (feed === 'ASSISTANT') return entry.kind === 'assistant';
  if (feed === 'TOOLS') return entry.kind === 'tool';
  // The dedicated thinking feed shows the full blocks, not the markers.
  if (feed === 'THINKING') return entry.kind === 'thinking' && !entry.meta?.collapsed;
  if (feed === 'SYSTEM')
    return (
      entry.kind === 'system' ||
      entry.kind === 'error' ||
      entry.kind === 'permission' ||
      entry.kind === 'plan'
    );
  if (feed === 'TELEMETRY') return entry.kind === 'telemetry';
  if (feed === 'RAW') return entry.kind === 'raw';
  return true;
}

/***
 * MARK: filterEntries
 * @description Filters entries by feed chip and free-text search (case
 *   insensitive, against the rendered text).
 * @example filterEntries(entries, { feed: 'TOOLS', search: 'bash' })
 * @param {Array<Object>} entries
 * @param {{feed?: string, search?: string}} [criteria]
 * @returns {Array<Object>} The matching entries.
 ***/
export function filterEntries(entries, criteria = {}) {
  const { feed = 'ALL', search = '' } = criteria;
  const needle = String(search).trim().toLowerCase();
  return (entries || []).filter((entry) => {
    if (!feedMatchesEntry(feed, entry)) return false;
    if (
      needle &&
      !String(entry.text || '')
        .toLowerCase()
        .includes(needle)
    )
      return false;
    return true;
  });
}

/***
 * MARK: renderEntryText
 * @description The rendered text of an entry — the entry's own text, with
 *   collapsed thinking markers expandable to their full block.
 * @example renderEntryText(entry) => "[TOOL] bash(\"ls\")"
 * @param {Object} entry
 * @param {{expandThinking?: boolean, fullTextById?: Map}} [options]
 * @returns {string}
 ***/
export function renderEntryText(entry, options = {}) {
  if (!entry) return '';
  const { expandThinking = false, fullTextById = null } = options;
  if (
    expandThinking &&
    entry.meta?.collapsed &&
    entry.meta?.fullTextId &&
    fullTextById?.has(entry.meta.fullTextId)
  ) {
    return fullTextById.get(entry.meta.fullTextId).text;
  }
  return entry.text || '';
}

/***
 * MARK: severityClass
 * @description Tailwind text classes for a rendered log line, keyed by the
 *   legacy tag grammar (colors identical to today's Logs tab). Unified-lane
 *   tags ([USAGE]/[PERM]/[PLAN]/[RAW]) reuse the closest existing tones so
 *   no new palette is introduced before the visual refactor.
 * @example severityClass('[ERROR] boom') => 'text-[#ffb4ab] font-bold'
 * @param {string} line
 * @returns {string}
 ***/
export function severityClass(line) {
  if (/\[ERROR\]|\[FAIL\]/i.test(line)) return 'text-[#ffb4ab] font-bold';
  if (/\[WARN\]/i.test(line)) return 'text-[#ffb77f] font-bold';
  if (/\[TOOL\]/i.test(line)) return 'text-[#a6e3a1] font-semibold';
  if (/\[RESULT\]/i.test(line)) return 'text-[#94e2d5]';
  if (/\[HUMAN\]/i.test(line)) return 'text-[#9acbff] font-medium';
  if (/\[INFO\]|\[SYSTEM\]|\[USAGE\]/i.test(line)) return 'text-[#c2c8ca]';
  if (/\[PERM\]|\[PLAN\]/i.test(line)) return 'text-[#ffb77f] font-medium';
  if (/\[RAW\]/i.test(line)) return 'text-[#c2c8ca]';
  if (/\[AGENT\]/i.test(line)) return 'text-[#7bdb85] font-medium';
  if (/\[CI\]|\[CI\/CMD\]/i.test(line)) return 'text-[#ffb77f]';
  return 'text-on-surface';
}

/***
 * MARK: renderEntryDetail
 * @description Typed detail view for one entry: `{ summary, detail }`.
 *   `summary` is the inline line (the entry's own text); `detail` is the
 *   full payload for expand affordances — full tool output, usage JSON,
 *   permission/plan fields, or the bounded raw wire source. Entries without
 *   a typed payload return `{ summary: text, detail: null }` so panels can
 *   skip the expand affordance.
 * @example renderEntryDetail({ kind: 'telemetry', usage: {...} }) => { summary: '[USAGE] …', detail: '{…}' }
 * @param {Object} entry
 * @returns {{summary: string, detail: string|null}}
 ***/
export function renderEntryDetail(entry) {
  if (!entry) return { summary: '', detail: null };
  const summary = entry.text || '';
  const kind = entry.kind;
  if (kind === 'tool') {
    const output =
      entry.tool?.result ||
      entry.tool?.partials ||
      entry.meta?.output ||
      null;
    return {
      summary,
      detail: typeof output === 'string' && output && output !== summary ? output : null,
    };
  }
  if (kind === 'telemetry') {
    if (entry.usage && typeof entry.usage === 'object') {
      let detail = null;
      try {
        detail = JSON.stringify(entry.usage, null, 2);
      } catch {
        detail = null;
      }
      return { summary, detail };
    }
    return { summary, detail: null };
  }
  if (kind === 'permission' || kind === 'plan') {
    return { summary, detail: null };
  }
  if (kind === 'raw') {
    const source = entry.evidence?.sourceEvent;
    return {
      summary,
      detail: typeof source === 'string' && source ? source : null,
    };
  }
  if (kind === 'thinking' && entry.meta?.collapsed) {
    return { summary, detail: null };
  }
  return { summary, detail: null };
}

/***
 * MARK: fullTextIndex
 * @description Indexes entries by id so collapsed thinking markers can look
 *   up their full thinking block.
 * @example fullTextIndex(entries).get(marker.meta.fullTextId)?.text
 * @param {Array<Object>} entries
 * @returns {Map} Map of entry id -> entry.
 ***/
export function fullTextIndex(entries) {
  return new Map((entries || []).map((entry) => [entry.id, entry]));
}

/***
 * MARK: isResultEntry
 * @description Whether an entry is a tool result line (rendered indented
 *   under its tool call).
 * @example isResultEntry({ text: '[RESULT] ok' }) => true
 * @param {Object} entry
 * @returns {boolean}
 ***/
export function isResultEntry(entry) {
  return String(entry?.text || '').startsWith('[RESULT]');
}
