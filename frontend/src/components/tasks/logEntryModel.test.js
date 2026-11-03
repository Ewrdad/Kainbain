// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  entryFromLogLine,
  parseLegacyProcessLogs,
  normalizeEntries,
  fullTextIndex,
} from './logEntryModel';

describe('logEntryModel — legacy parsing', () => {
  it('maps the tag grammar to entry kinds and feeds', () => {
    expect(entryFromLogLine('[TOOL] bash("ls")')).toMatchObject({ kind: 'tool', feed: 'tools' });
    expect(entryFromLogLine('[RESULT] ok')).toMatchObject({ kind: 'tool', feed: 'tools' });
    expect(entryFromLogLine('[THINKING] (12 chars)')).toMatchObject({
      kind: 'thinking',
      feed: 'thinking',
    });
    expect(entryFromLogLine('[ERROR] boom')).toMatchObject({ kind: 'error', feed: 'main' });
    expect(entryFromLogLine('[AGENT] reasoning')).toMatchObject({
      kind: 'assistant',
      feed: 'main',
    });
    expect(entryFromLogLine('[INFO] boot')).toMatchObject({ kind: 'system', feed: 'main' });
    expect(entryFromLogLine('[GIT] main')).toMatchObject({ kind: 'system', feed: 'main' });
    expect(entryFromLogLine('[USAGE] tokens=1/2/3')).toMatchObject({
      kind: 'telemetry',
      feed: 'telemetry',
    });
    expect(entryFromLogLine('[RAW] x: unmapped')).toMatchObject({ kind: 'raw', feed: 'raw' });
    expect(entryFromLogLine('[PERM] request bash')).toMatchObject({
      kind: 'permission',
      feed: 'main',
    });
    expect(entryFromLogLine('[PLAN] updated')).toMatchObject({ kind: 'plan', feed: 'main' });
    // Shared-grammar alignment: lowercase error tags and lowercase
    // [stdout] wrappers classify like their caps forms (as they do in the
    // backend synthesis and the category layer).
    expect(entryFromLogLine('[error] boom')).toMatchObject({ kind: 'error', feed: 'main' });
    expect(entryFromLogLine('[stdout]\n[TOOL] x')).toMatchObject({ kind: 'tool', feed: 'tools' });
    expect(entryFromLogLine('[STDERR]\n[TOOL] x')).toMatchObject({ kind: 'error', feed: 'main' });
    expect(entryFromLogLine('plain narrative')).toMatchObject({
      kind: 'assistant',
      feed: 'main',
    });
  });

  it('parses processLogs text dropping blanks and consecutive duplicates', () => {
    const entries = parseLegacyProcessLogs('[INFO] a\n\n[INFO] a\n[TOOL] b');
    expect(entries.map((e) => e.text)).toEqual(['[INFO] a', '[TOOL] b']);
    expect(entries.every((e) => e.turn === null)).toBe(true);
  });

  it('returns empty for empty or missing processLogs', () => {
    expect(parseLegacyProcessLogs('')).toEqual([]);
    expect(parseLegacyProcessLogs(null)).toEqual([]);
  });

  it('parses unified tags from legacy text', () => {
    const parsed = parseLegacyProcessLogs('[USAGE] tokens=1/2/3\n[PERM] request bash\n[PLAN] updated\n[RAW] x: unmapped');
    expect(parsed.map((e) => e.kind)).toEqual(['telemetry', 'permission', 'plan', 'raw']);
    expect(parsed.map((e) => e.feed)).toEqual(['telemetry', 'main', 'main', 'raw']);
  });
});

describe('logEntryModel — normalizeEntries', () => {
  it('prefers structured logEntries over the legacy text', () => {
    const task = {
      logEntries: [
        { id: 1, feed: 'main', feeds: ['main'], kind: 'assistant', turn: 1, text: 'grouped block' },
      ],
      processLogs: '[AGENT] narrative line',
    };
    const entries = normalizeEntries(task);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('grouped block');
  });

  it('falls back to parsing processLogs for legacy tasks', () => {
    const entries = normalizeEntries({ processLogs: '[INFO] legacy\n[TOOL] w("x")' });
    expect(entries).toHaveLength(2);
    expect(entries[1].kind).toBe('tool');
  });

  it('appends live WebSocket process lines as entries', () => {
    const entries = normalizeEntries(
      { logEntries: [{ id: 1, feed: 'main', feeds: ['main'], kind: 'assistant', turn: 1, text: 'base' }] },
      [{ tag: '[INFO]', text: 'live event' }],
    );
    expect(entries.map((e) => e.text)).toEqual(['base', '[INFO] live event']);
    expect(entries[1].kind).toBe('system');
  });

  it('reuses the socket line id so live rows keep stable keys', () => {
    const ws = [{ id: 'ws-line-1', tag: '[INFO]', text: 'live event' }];
    const first = normalizeEntries({ logEntries: [] }, ws);
    const second = normalizeEntries({ logEntries: [] }, ws);
    expect(first[0].id).toBe('ws-line-1');
    expect(second[0].id).toBe('ws-line-1');
  });

  it('classifies live runner frames and drops them once stored', () => {
    const stored = {
      id: 'log-1',
      kind: 'runner',
      text: '[runner local-alpha] hello',
      meta: { source: 'process-log', runnerId: 'local-alpha', executionId: 'exec-1', seq: 0 },
    };
    const task = { logEntries: [stored] };
    const ws = [
      // Same frame the socket already pushed: suppressed after refetch.
      {
        tag: '[RUNNER]',
        text: '[runner local-alpha] hello',
        raw: '[Project] [RUNNER] [runner local-alpha] hello',
        taskId: 't1',
        executionId: 'exec-1',
        seq: 0,
        runnerId: 'local-alpha',
      },
      // A newer frame not yet in stored entries: passes through live.
      {
        tag: '[RUNNER]',
        text: '[runner local-alpha] world',
        raw: '[Project] [RUNNER] [runner local-alpha] world',
        taskId: 't1',
        executionId: 'exec-1',
        seq: 1,
        runnerId: 'local-alpha',
      },
    ];
    const entries = normalizeEntries(task, ws);
    expect(entries.map((e) => e.text)).toEqual([
      '[runner local-alpha] hello',
      '[RUNNER] [runner local-alpha] world',
    ]);
    const live = entries[1];
    expect(live.kind).toBe('runner');
    expect(live.meta).toMatchObject({ executionId: 'exec-1', seq: 1, runnerId: 'local-alpha' });
  });

  it('keeps identity-free live lines passing through', () => {
    const entries = normalizeEntries(
      { logEntries: [] },
      [{ tag: '[CI/CMD]', text: '$ ls', raw: '[Project] [CI/CMD] $ ls', taskId: 't1' }],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('system');
  });

  it('passes structured live entries through untouched and drops them once stored', () => {
    const toolEntry = {
      id: 7,
      ts: '2026-10-30T00:00:00.000Z',
      feed: 'tools',
      feeds: ['main', 'tools'],
      kind: 'tool',
      turn: 1,
      text: '[TOOL] bash(ls)',
      meta: { toolName: 'bash', toolCallId: 'c1', source: 'runner-structured' },
      tool: { callId: 'c1', name: 'bash', args: { command: 'ls' } },
    };
    const live = [
      { taskId: 't1', executionId: 'exec-1', seq: 0, runnerId: 'r1', entry: toolEntry },
    ];
    const before = normalizeEntries({ logEntries: [] }, live);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ kind: 'tool', text: '[TOOL] bash(ls)' });
    expect(before[0].tool).toEqual({ callId: 'c1', name: 'bash', args: { command: 'ls' } });
    expect(before[0].meta).toMatchObject({ executionId: 'exec-1', seq: 0, runnerId: 'r1' });
    // After the refetch the same record arrives stored: the live copy drops.
    const stored = {
      ...toolEntry,
      meta: { ...toolEntry.meta, runnerId: 'r1', executionId: 'exec-1', seq: 0 },
    };
    const after = normalizeEntries({ logEntries: [stored] }, live);
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe('[TOOL] bash(ls)');
  });

  it('dedupes per lane: text and structured seqs never collide', () => {
    // The text lane and the structured lane keep independent seq counters on
    // the same execution (both start at 0). A stored structured batch at
    // exec:0 must not hide a live TEXT frame at exec:0, and vice versa —
    // that collision only matters during the structured→text fallback
    // transition, but there a wrongly dropped frame is a lost log line.
    const storedStructured = {
      id: 1,
      kind: 'tool',
      feeds: ['tools'],
      text: '[TOOL] bash(ls)',
      meta: { source: 'runner-structured', executionId: 'exec-1', seq: 0, runnerId: 'r1' },
    };
    const task = { logEntries: [storedStructured] };
    const liveTextFrame = {
      tag: '[RUNNER]',
      text: '[runner r1] plain text',
      raw: '[runner r1] plain text',
      taskId: 't1',
      executionId: 'exec-1',
      seq: 0, // same number, different lane — must survive
      runnerId: 'r1',
    };
    const entries = normalizeEntries(task, [liveTextFrame]);
    expect(entries).toHaveLength(2);
    expect(entries[1].text).toBe('[runner r1] plain text');

    // Mirror image: a stored TEXT frame at exec:0 must not hide a live
    // structured entry at exec:0.
    const storedText = {
      id: 2,
      kind: 'runner',
      feeds: ['main'],
      text: '[runner r1] stored text',
      meta: { source: 'process-log', executionId: 'exec-1', seq: 0, runnerId: 'r1' },
    };
    const liveStructured = {
      taskId: 't1',
      executionId: 'exec-1',
      seq: 0,
      runnerId: 'r1',
      entry: {
        id: 9,
        kind: 'tool',
        feeds: ['tools'],
        text: '[TOOL] bash(pwd)',
        meta: { source: 'runner-structured' },
      },
    };
    const entries2 = normalizeEntries({ logEntries: [storedText] }, [liveStructured]);
    expect(entries2).toHaveLength(2);
    expect(entries2[1].text).toBe('[TOOL] bash(pwd)');
  });
});

describe('logEntryModel — fullTextIndex', () => {
  it('indexes entries by id for collapsed-thinking lookup', () => {
    const entries = [
      { id: 7, kind: 'thinking', text: 'full hidden block' },
      { id: 8, kind: 'thinking', text: '[THINKING] (17 chars)', meta: { collapsed: true, fullTextId: 7 } },
    ];
    const byId = fullTextIndex(entries);
    expect(byId.get(entries[1].meta.fullTextId)?.text).toBe('full hidden block');
  });
});
