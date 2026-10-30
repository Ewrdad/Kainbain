// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  LOG_FEEDS,
  entryFromLogLine,
  parseLegacyProcessLogs,
  normalizeEntries,
  groupByTurn,
  feedMatchesEntry,
  filterEntries,
  renderEntryDetail,
  renderEntryText,
  severityClass,
  fullTextIndex,
  isResultEntry,
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
});

describe('logEntryModel — grouping', () => {
  it('groups structured entries by turn in order', () => {
    const entries = [
      { id: 1, kind: 'system', turn: 1, text: '[AGENT] start' },
      { id: 2, kind: 'assistant', turn: 1, text: 'do things' },
      { id: 3, kind: 'tool', turn: 1, text: '[TOOL] bash()' },
      { id: 4, kind: 'assistant', turn: 2, text: 'again' },
   ];
    const groups = groupByTurn(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ turn: 1, entries: entries.slice(0, 3) });
    expect(groups[1]).toEqual({ turn: 2, entries: [entries[3]] });
  });

  it('keeps legacy (turnless) entries in one un-numbered group', () => {
    const groups = groupByTurn(parseLegacyProcessLogs('[INFO] a\n[INFO] b'));
    expect(groups).toHaveLength(1);
    expect(groups[0].turn).toBeNull();
  });
});

describe('logEntryModel — filtering', () => {
  const entries = parseLegacyProcessLogs(
    '[AGENT] narrative\n[TOOL] bash("ls")\n[RESULT] ok\n[THINKING] (9 chars)\n[ERROR] bad\n[INFO] sys',
  );

  it('exposes the feed chips', () => {
    expect(LOG_FEEDS).toEqual(['ALL', 'ASSISTANT', 'TOOLS', 'THINKING', 'SYSTEM', 'TELEMETRY', 'RAW']);
  });

  it('filters by feed chip', () => {
    // ALL is the main terminal view: main + tools entries (the thinking
    // marker belongs to the THINKING chip).
    expect(filterEntries(entries, { feed: 'ALL' })).toHaveLength(5);
    expect(filterEntries(entries, { feed: 'ASSISTANT' }).map((e) => e.text)).toEqual([
      '[AGENT] narrative',
    ]);
    expect(filterEntries(entries, { feed: 'TOOLS' }).map((e) => e.kind)).toEqual([
      'tool',
      'tool',
    ]);
    expect(filterEntries(entries, { feed: 'THINKING' })).toHaveLength(1);
    // Errors surface under SYSTEM alongside operational lines.
    expect(filterEntries(entries, { feed: 'SYSTEM' }).map((e) => e.kind)).toEqual([
      'error',
      'system',
    ]);
  });

  it('filters by search against the rendered text (case-insensitive)', () => {
    expect(filterEntries(entries, { search: 'BASH' }).map((e) => e.text)).toEqual([
      '[TOOL] bash("ls")',
    ]);
    expect(filterEntries(entries, { feed: 'TOOLS', search: 'ok' }).map((e) => e.text)).toEqual([
      '[RESULT] ok',
    ]);
  });
});

describe('logEntryModel — rendering', () => {
  it('renders the entry text by default', () => {
    expect(renderEntryText({ text: '[TOOL] x()' })).toBe('[TOOL] x()');
  });

  it('expands collapsed thinking through the fullTextId link', () => {
    const entries = [
      {
        id: 7,
        kind: 'thinking',
        feed: 'thinking',
        feeds: ['thinking'],
        turn: 1,
        text: 'full hidden block',
        meta: { charCount: 17 },
      },
      {
        id: 8,
        kind: 'thinking',
        feed: 'main',
        feeds: ['main'],
        turn: 1,
        text: '[THINKING] (17 chars)',
        meta: { charCount: 17, collapsed: true, fullTextId: 7 },
      },
    ];
    const byId = fullTextIndex(entries);
    const marker = entries[1];
    expect(renderEntryText(marker)).toBe('[THINKING] (17 chars)');
    expect(renderEntryText(marker, { expandThinking: true, fullTextById: byId })).toBe(
      'full hidden block',
    );
  });

  it('flags tool result entries for indentation', () => {
    expect(isResultEntry({ text: '[RESULT] ok' })).toBe(true);
    expect(isResultEntry({ text: '[TOOL] bash()' })).toBe(false);
  });
});

describe('logEntryModel — severity classes', () => {
  it('colors by the legacy tag grammar', () => {
    expect(severityClass('[ERROR] boom')).toContain('font-bold');
    expect(severityClass('[TOOL] x')).toContain('#a6e3a1');
    expect(severityClass('plain')).toBe('text-on-surface');
  });

  it('colors the unified-lane tags without inventing a palette', () => {
    expect(severityClass('[USAGE] tokens=1/2/3')).toContain('#c2c8ca');
    expect(severityClass('[PERM] request bash')).toContain('font-medium');
    expect(severityClass('[PLAN] 2 steps')).toContain('font-medium');
    expect(severityClass('[RAW] x: unmapped')).toContain('#c2c8ca');
  });
});

describe('logEntryModel — unified lanes', () => {
  const unified = [
    { id: 1, kind: 'telemetry', feed: 'telemetry', feeds: ['telemetry'], text: '[USAGE] tokens=1/2/3', usage: { inputTokens: 1 }, meta: {} },
    { id: 2, kind: 'permission', feed: 'main', feeds: ['main'], text: '[PERM] request bash', meta: {} },
    { id: 3, kind: 'plan', feed: 'main', feeds: ['main'], text: '[PLAN] updated', meta: {} },
    { id: 4, kind: 'raw', feed: 'raw', feeds: ['raw'], text: '[RAW] x: unmapped', evidence: { wireType: 'x', sourceEvent: '{"a":1}', reason: 'unmapped' }, meta: {} },
    { id: 5, kind: 'assistant', feed: 'main', feeds: ['main'], text: 'narrative', meta: {} },
  ];

  it('routes telemetry and raw to their own chips, never into ALL', () => {
    expect(filterEntries(unified, { feed: 'ALL' }).map((e) => e.id)).toEqual([2, 3, 5]);
    expect(filterEntries(unified, { feed: 'TELEMETRY' }).map((e) => e.id)).toEqual([1]);
    expect(filterEntries(unified, { feed: 'RAW' }).map((e) => e.id)).toEqual([4]);
    expect(filterEntries(unified, { feed: 'SYSTEM' }).map((e) => e.id)).toEqual([2, 3]);
  });

  it('parses unified tags from legacy text', () => {
    const parsed = parseLegacyProcessLogs('[USAGE] tokens=1/2/3\n[PERM] request bash\n[PLAN] updated\n[RAW] x: unmapped');
    expect(parsed.map((e) => e.kind)).toEqual(['telemetry', 'permission', 'plan', 'raw']);
    expect(parsed.map((e) => e.feed)).toEqual(['telemetry', 'main', 'main', 'raw']);
  });

  it('returns typed detail for expand affordances', () => {
    expect(renderEntryDetail(unified[0]).detail).toContain('inputTokens');
    expect(renderEntryDetail(unified[1])).toEqual({ summary: '[PERM] request bash', detail: null });
    expect(renderEntryDetail(unified[3]).detail).toBe('{"a":1}');
    expect(renderEntryDetail(unified[4])).toEqual({ summary: 'narrative', detail: null });
    expect(renderEntryDetail(null)).toEqual({ summary: '', detail: null });
  });

  it('returns full tool output for tool entries', () => {
    const tool = {
      id: 6,
      kind: 'tool',
      feed: 'tools',
      feeds: ['tools'],
      text: '[RESULT] ok…',
      tool: { name: 'bash', result: 'line1\nline2' },
      meta: {},
    };
    expect(renderEntryDetail(tool).detail).toBe('line1\nline2');
  });
});