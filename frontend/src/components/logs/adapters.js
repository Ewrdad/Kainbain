/**
 * MARK: adapters
 * @description Source-specific normalizers into the shared LogRecord shape
 *   (see `logCategories.normalizeLogRecord`). Contract:
 *   - null/missing fields never throw; timestamps are passed through
 *     untouched (never invented — see `timestampLabel` for display);
 *   - every adapter preserves the source identity (`id`, `turn`, `meta`)
 *     so copy, expansion, and grouping keep working downstream;
 *   - classification itself lives in `logCategories.categoryFor`, never here.
 */

import { markRepeated, normalizeLogRecord } from './logCategories';

/***
 * MARK: adaptTaskEntry
 * @description Structured task entries (`task.logEntries`, including legacy
 *   parses from `logEntryModel`) into LogRecords. Thinking markers keep
 *   `collapsedThinking`/`fullTextId` so the viewer can expand them against a
 *   `fullTextById` index without ever leaking full blocks by default.
 ***/
export function adaptTaskEntry(entry = {}) {
  const safe = entry || {};
  return normalizeLogRecord(
    {
      id: safe.id,
      ts: safe.ts,
      kind: safe.kind,
      tag: safe.tag,
      text: safe.text,
      title: safe.title,
      detail: safe.detail,
      tool: safe.tool,
      usage: safe.usage,
      evidence: safe.evidence,
      meta: safe.meta,
      turn: safe.turn,
      collapsedThinking: safe.collapsedThinking,
      fullTextId: safe.fullTextId,
      projectName: safe.projectName,
      taskId: safe.taskId,
      projectId: safe.projectId,
      source: 'task',
    },
    'task',
  );
}

/***
 * MARK: adaptProcessLogLine
 * @description Live WebSocket process-log lines (`useWebSocket.addProcessLog`
 *   shape: `{id,timestamp,tag,text,raw,projectId,projectName,taskId}`) into
 *   LogRecords. The original line is stashed on `meta.rawLine` so copy
 *   formatters can keep their exact legacy output.
 ***/
export function adaptProcessLogLine(line = {}) {
  const safe = line || {};
  const text = safe.text ?? safe.raw ?? '';
  return normalizeLogRecord(
    {
      id: safe.id,
      ts: safe.timestamp,
      tag: safe.tag,
      text,
      raw: safe.raw,
      projectId: safe.projectId,
      projectName: safe.projectName,
      taskId: safe.taskId,
      source: 'process-live',
      meta: {
        ...(safe.meta || {}),
        // Original line by reference (never mutated downstream) so copy
        // formatters and facades can recover the exact legacy shape.
        rawLine: safe,
      },
    },
    'process-live',
  );
}

/***
 * MARK: adaptTaskEntries
 * @description Adapts a whole entry list and flags command repeats
 *   (`markRepeated`) so the intervention strip can count them.
 ***/
export function adaptTaskEntries(entries = []) {
  return markRepeated((entries || []).filter(Boolean).map(adaptTaskEntry));
}

/***
 * MARK: adaptProcessLogLines
 * @description Adapts a whole live-line list with repeat flagging.
 ***/
export function adaptProcessLogLines(lines = []) {
  return markRepeated((lines || []).filter(Boolean).map(adaptProcessLogLine));
}

/***
 * MARK: excludeToolMirrorLinesWhenToolCardsShown
 * @description Named dedup policy (kept from `nodeModel.filterProcessLogs`):
 *   raw `[TOOL]` mirror lines are dropped when tool cards render the same
 *   calls below — otherwise every invocation appears twice. `[RESULT]` lines
 *   are kept: cards do not render result bodies. Pass
 *   `{ showToolCards: false }` to keep the mirrors (e.g. monitor surfaces
 *   with no card lane).
 ***/
export function excludeToolMirrorLinesWhenToolCardsShown(records = [], options = {}) {
  const { showToolCards = true } = options || {};
  if (!showToolCards) return records || [];
  return (records || []).filter((record) => {
    const tag = String(record?.tag || '')
      .toUpperCase()
      .replace(/[[\]]/g, '');
    if (tag !== 'TOOL') return true;
    // Tool-call-sourced records (adapted tool cards) are the representation;
    // only raw live mirrors are dropped.
    if (record?.source === 'tool-call') return true;
    return false;
  });
}
