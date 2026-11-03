/**
 * MARK: logEntryModel
 * @description Pure model for the task Logs tab: turns a task's stored
 *   entries plus live socket lines into one renderable entry list
 *   (`normalizeEntries`), falling back to parsing the legacy
 *   `task.processLogs` text (line-based tag grammar) so old tasks keep
 *   rendering exactly as before. Grouping, filtering, search, severity,
 *   and detail expansion all live in the unified viewer
 *   (`frontend/src/components/logs/`); this module only normalizes.
 *
 *   The tag grammar is the shared `classifyLogLineTag`
 *   (`shared/logTagGrammar.js`) — the same module the API-side synthesis
 *   reads, so stored history and this parse can never disagree:
 *     [TOOL] [RESULT]      -> kind "tool"       (tools feed)
 *     [THINKING]           -> kind "thinking"   (thinking feed)
 *     [USAGE]              -> kind "telemetry"  (telemetry feed)
 *     [RAW]                -> kind "raw"        (raw feed)
 *     [PERM] [PLAN]        -> kind "permission"/"plan" (main feed)
 *     [ERROR] [FAIL]       -> kind "error"      (main feed)
 *     [AGENT]              -> kind "assistant"  (main feed)
 *     [INFO] [SYSTEM] [GIT] [CI] [CI/CMD] [HUMAN] [WARN] -> kind "system"
 *     untagged text        -> kind "assistant"  (main feed)
 */

import { classifyLogLineTag } from '../../../../shared/logTagGrammar.js';

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
 *   shared tag grammar (`classifyLogLineTag`) — the single source this
 *   parse and the backend synthesis both read, so a tag can never
 *   classify one way in stored history and another way live. Untagged
 *   text is assistant narrative.
 * @example entryFromLogLine('[TOOL] bash("ls")') => { kind: 'tool', feed: 'tools', text: '…' }
 * @param {string} line
 * @returns {Object} A structured log entry.
 ***/
export function entryFromLogLine(line) {
  const { kind, feed } = classifyLogLineTag(line);
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
  // Frames already persisted (keyed by lane + execution + seq) must not
  // reappear as live lines after a refetch: the socket pushes each frame
  // the moment it is ingested, and the same frame lands in stored entries
  // on the next task fetch. The lane prefix matters: the text lane
  // (process:stdout) and the structured lane (PROCESS_LOG_ENTRIES) keep
  // INDEPENDENT seq counters on the same execution, so a bare
  // `executionId:seq` key could collide across lanes during the fallback
  // transition and hide a frame that was never stored. Frames without an
  // identity (legacy CI lines) always pass through, as before.
  const storedKeys = new Set();
  for (const entry of base) {
    const meta = entry?.meta;
    if (meta && meta.executionId != null && meta.seq != null) {
      const lane = meta.source === 'runner-structured' ? 'structured' : 'text';
      storedKeys.add(`${lane}:${meta.executionId}:${meta.seq}`);
    }
  }
  const live = [];
  for (const p of Array.isArray(wsProcessLines) ? wsProcessLines : []) {
    if (!p) continue;
    if (p.executionId != null && p.seq != null) {
      const lane = p.entry && typeof p.entry === 'object' ? 'structured' : 'text';
      if (storedKeys.has(`${lane}:${p.executionId}:${p.seq}`)) {
        continue;
      }
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
    // The socket line already carries a stable id (minted once when the
    // line arrived): reuse it so live rows keep their React keys and
    // expansion state across recomputes instead of remounting on every
    // new line. Lines without one keep a synthetic id, as before.
    if (p.id != null) entry.id = p.id;
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
