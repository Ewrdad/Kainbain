/**
 * MARK: logCategories tests
 * @description Classification matrix, filtering, grouping, timestamps,
 *   intervention detection, repeat flagging, and legacy migration for the
 *   unified log viewer taxonomy.
 */
import { describe, expect, test } from 'vitest';
import {
  LOG_CATEGORIES,
  categoriesFor,
  categoryFor,
  countByCategory,
  defaultCategorySet,
  extractDetail,
  filterLogRecords,
  formatLogRecordsForCopy,
  groupLogRecords,
  hydrateCategories,
  interventionSummary,
  isIntervention,
  legacyFeedToCategories,
  legacyTagToCategories,
  markRepeated,
  normalizeLogRecord,
  recordMatchesCategories,
  tagForRecord,
  timestampLabel,
} from './logCategories';
import {
  liveProcessLogs,
  structuredTaskEntries,
} from './__fixtures__';

describe('LOG_CATEGORIES taxonomy', () => {
  test('covers every user-requested lane plus practical extras', () => {
    const ids = LOG_CATEGORIES.map((c) => c.id);
    for (const required of [
      'output',
      'tools',
      'thinking',
      'ci',
      'stage',
      'debug',
      'system',
      'human',
      'error',
      'git',
    ]) {
      expect(ids).toContain(required);
    }
  });

  test('debug and raw stay off by default in both densities', () => {
    expect(defaultCategorySet('compact').has('debug')).toBe(false);
    expect(defaultCategorySet('compact').has('raw')).toBe(false);
    expect(defaultCategorySet('full').has('debug')).toBe(false);
    expect(defaultCategorySet('full').has('raw')).toBe(false);
  });
});

describe('categoryFor on structured entries', () => {
  test.each([
    [{ kind: 'assistant', text: 'hello' }, 'output'],
    [{ kind: 'tool', text: '[TOOL] bash' }, 'tools'],
    [{ kind: 'thinking', text: 'hmm' }, 'thinking'],
    [{ kind: 'error', text: '[ERROR] boom' }, 'error'],
    [{ kind: 'telemetry', text: '[USAGE] x' }, 'raw'],
    [{ kind: 'raw', text: '[RAW] x' }, 'raw'],
    [{ kind: 'permission', text: '[PERM] allow?' }, 'human'],
    [{ kind: 'plan', text: '[PLAN] next' }, 'stage'],
    [{ kind: 'system', tag: '[CI]', text: '[CI] build' }, 'ci'],
    [{ kind: 'system', tag: '[CI/CMD]', text: 'npm test' }, 'ci'],
    [{ kind: 'system', tag: '[GIT]', text: 'branch' }, 'git'],
    [{ kind: 'system', tag: '[HUMAN]', text: 'approved' }, 'human'],
    [{ kind: 'system', text: 'checkpoint reached' }, 'human'],
    [{ kind: 'system', text: 'STAGE_ENTER Idea' }, 'stage'],
    [{ kind: 'system', text: 'stage completed' }, 'stage'],
    [{ kind: 'system', tag: '[DEBUG]', text: 'x' }, 'debug'],
    [{ kind: 'system', text: 'KainBain debug queue' }, 'debug'],
    [{ kind: 'system', tag: '[INFO]', text: '[INFO] Task initialized in stage: X' }, 'system'],
    [{ kind: 'system', tag: '[INFO]', text: 'plain status' }, 'system'],
  ])('%j -> %s', (record, expected) => {
    expect(categoryFor(record)).toBe(expected);
  });
});

describe('categoryFor on live process-log lines (tag-first, text fallback)', () => {
  test.each([
    [{ tag: '[TOOL]', text: 'bash' }, 'tools'],
    [{ tag: '[RESULT]', text: 'ok' }, 'tools'],
    [{ tag: '[ERROR]', text: 'boom' }, 'error'],
    [{ tag: '[FAIL]', text: 'nope' }, 'error'],
    [{ tag: '[CI/CMD]', text: 'npm test' }, 'ci'],
    [{ tag: '[GIT]', text: 'push' }, 'git'],
    [{ tag: '[HUMAN]', text: 'approved' }, 'human'],
    [{ tag: '[AGENT]', text: 'reasoning' }, 'output'],
    [{ tag: '[INFO]', text: 'status' }, 'system'],
    [{ tag: '[INFO]', text: '[INFO] Task initialized in stage: X' }, 'system'],
    [{ tag: '[LOG]', text: '[TOOL] mirrored call' }, 'tools'],
    [{ tag: '[LOG]', text: 'untagged stdout line' }, 'output'],
    [{ tag: '[INFO]', text: 'KainBain debug heartbeat' }, 'debug'],
    [{ tag: '[CI]', text: 'STAGE_FAILBACK to Idea' }, 'stage'],
    [{ tag: 'INFO', text: 'dispatch' }, 'system'],
  ])('%j -> %s', (record, expected) => {
    expect(categoryFor(record)).toBe(expected);
  });

  test('fixture live lines classify into distinct lanes', () => {
    const got = liveProcessLogs.map(categoryFor);
    expect(got).toEqual(['output', 'tools', 'ci', 'error', 'human', 'debug', 'error', 'output']);
  });

  test('fixture structured entries classify across the taxonomy', () => {
    const got = structuredTaskEntries.map(categoryFor);
    expect(got).toContain('output');
    expect(got).toContain('thinking');
    expect(got).toContain('tools');
    expect(got).toContain('error');
    expect(got).toContain('ci');
    expect(got).toContain('stage');
    expect(got).toContain('git');
    expect(got).toContain('human');
    expect(got).toContain('debug');
    expect(got).toContain('raw');
  });
});

describe('categoriesFor secondary lanes', () => {
  test('collapsed thinking markers ride with the narrative; full blocks do not', () => {
    expect(
      categoriesFor({ kind: 'thinking', collapsedThinking: true, text: '[THINKING] (1)' }),
    ).toContain('output');
    expect(categoriesFor({ kind: 'thinking', text: 'full block' })).not.toContain('output');
  });

  test('failures surface under Errors from any primary lane', () => {
    expect(categoriesFor({ kind: 'tool', text: '[RESULT] exit code 1' })).toContain('error');
    expect(categoriesFor({ kind: 'system', text: 'STAGE_FAILBACK to Idea' })).toContain('error');
    expect(categoriesFor({ kind: 'assistant', text: 'all good' })).not.toContain('error');
  });
});

describe('normalizeLogRecord', () => {
  test('derives display tags, preserves identity, never invents timestamps', () => {
    const record = normalizeLogRecord({ kind: 'assistant', text: 'hi' });
    expect(record.tag).toBe('[AGENT]');
    expect(record.ts).toBeNull();
    expect(record.id).toMatch(/^log-rec-\d+$/);
  });

  test('synthetic ids are unique and stable-looking', () => {
    const a = normalizeLogRecord({ text: 'a' });
    const b = normalizeLogRecord({ text: 'b' });
    expect(a.id).not.toBe(b.id);
  });

  test('extractDetail prefers tool results, usage JSON, and raw sources', () => {
    expect(
      extractDetail({ kind: 'tool', text: '[TOOL] x', tool: { result: 'full output' } }),
    ).toBe('full output');
    expect(
      extractDetail({ kind: 'telemetry', usage: { tokens: 1 } }),
    ).toContain('"tokens"');
    expect(extractDetail({ text: 'plain' })).toBeNull();
  });
});

describe('filterLogRecords composition', () => {
  const records = [
    normalizeLogRecord({ id: 'a', kind: 'assistant', text: 'Agent hello' }),
    normalizeLogRecord({ id: 'b', kind: 'tool', text: '[TOOL] bash' }),
    normalizeLogRecord({ id: 'c', kind: 'error', text: '[ERROR] boom' }),
  ];

  test('empty selection and ALL show everything', () => {
    expect(filterLogRecords(records, { categories: new Set() })).toHaveLength(3);
    expect(filterLogRecords(records, { categories: new Set(['ALL']) })).toHaveLength(3);
  });

  test('multi-select narrows; search ANDs across text, tag, and title', () => {
    expect(
      filterLogRecords(records, { categories: new Set(['tools', 'error']) }).map((r) => r.id),
    ).toEqual(['b', 'c']);
    expect(
      filterLogRecords(records, { categories: new Set(['output', 'tools', 'error']), search: 'bash' }).map(
        (r) => r.id,
      ),
    ).toEqual(['b']);
    expect(
      filterLogRecords(records, { categories: new Set(['output']), search: '[AGENT]' }),
    ).toHaveLength(1);
  });

  test('secondary membership counts as visible (thinking markers in narrative)', () => {
    const marker = normalizeLogRecord({
      id: 'm',
      kind: 'thinking',
      collapsedThinking: true,
      text: '[THINKING] (5)',
      meta: { collapsed: true },
    });
    expect(marker.secondaryCategories).toContain('output');
    expect(recordMatchesCategories(marker, new Set(['output']))).toBe(true);
    const full = normalizeLogRecord({ id: 'f', kind: 'thinking', text: 'full block' });
    expect(recordMatchesCategories(full, new Set(['output']))).toBe(false);
    expect(recordMatchesCategories(full, new Set(['thinking']))).toBe(true);
  });
});

describe('groupLogRecords', () => {
  test('turn mode keeps adjacency with Turn labels; turnless share one group', () => {
    const groups = groupLogRecords(
      [
        { id: '1', turn: 1 },
        { id: '2', turn: 1 },
        { id: '3', turn: 2 },
        { id: '4', turn: null },
      ],
      { mode: 'turn' },
    );
    expect(groups.map((g) => g.label)).toEqual(['── Turn 1 ──', '── Turn 2 ──', null]);
    expect(groups[0].records).toHaveLength(2);
  });

  test('source mode and none mode', () => {
    const records = [{ id: '1', source: 'task' }, { id: '2', source: 'process-live' }];
    expect(groupLogRecords(records, { mode: 'source' })).toHaveLength(2);
    expect(groupLogRecords(records)).toHaveLength(1);
  });
});

describe('timestampLabel', () => {
  test('passes short clock times through and formats ISO stamps', () => {
    expect(timestampLabel('10:00:01')).toBe('10:00:01');
    expect(timestampLabel(null)).toBe('—');
    expect(timestampLabel('not-a-time')).toBe('—');
    expect(timestampLabel('2026-10-16T10:00:01.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(timestampLabel('2026-10-16T10:00:01.000Z', 'HH:MM:SS.mmm')).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3}$/,
    );
    expect(timestampLabel('2026-10-16T10:00:01.000Z', 'ISO')).toBe(
      '2026-10-16T10:00:01.000Z',
    );
  });
});

describe('isIntervention and interventionSummary', () => {
  test.each([
    [{ tag: '[ERROR]', text: 'x' }, true],
    [{ kind: 'error', text: 'x' }, true],
    [{ category: 'human', text: 'checkpoint ok' }, true],
    [{ text: 'Connection timed out' }, true],
    [{ text: '[PERM] allow deploy?' }, true],
    [{ text: 'STAGE_FAILBACK to Idea' }, true],
    [{ text: 'Agent analyzing requirements' }, false],
    [{ text: 'npm test passed' }, false],
    // CI stream wrappers: [STDERR] lines are interventions; [STDOUT] is not.
    [{ text: '[STDERR]\n[ERROR] canary stderr line' }, true],
    [{ text: '[STDERR]\nsome warning' }, true],
    [{ text: '[STDOUT]\n[AGENT] first line' }, false],
    [{ text: '[STDOUT]\nplain output' }, false],
  ])('%j -> %s', (record, expected) => {
    expect(isIntervention(record)).toBe(expected);
  });

  test('summary counts errors, checkpoints, repeats and flags attention', () => {
    const summary = interventionSummary([
      { category: 'error', tag: '[ERROR]', text: 'boom' },
      { category: 'human', tag: '[HUMAN]', text: 'checkpoint ok' },
      { category: 'output', tag: '[AGENT]', text: 'hi', isRepeated: true },
    ]);
    expect(summary).toEqual({ errors: 1, checkpoints: 1, repeated: 1, needsAttention: true });
    expect(interventionSummary([{ category: 'output', text: 'hi' }]).needsAttention).toBe(false);
  });

  test('summary counts [STDERR]-wrapped errors even without a category hint', () => {
    const summary = interventionSummary([
      { category: 'output', tag: '[STDERR]', text: '[STDERR]\n[ERROR] canary stderr line' },
    ]);
    expect(summary.errors).toBe(1);
    expect(summary.needsAttention).toBe(true);
  });
});

describe('CI stream-wrapper classification ([STDOUT]/[STDERR])', () => {
  test.each([
    // [STDERR] wrapper: error regardless of inner tag.
    [{ text: '[STDERR]\n[ERROR] canary stderr line' }, 'error'],
    [{ text: '[STDERR]\nsome warning text' }, 'error'],
    // [STDOUT] wrapper: classify by inner tag.
    [{ text: '[STDOUT]\n[AGENT] AGENT first line' }, 'output'],
    [{ text: '[STDOUT]\n[TOOL] bash("ls")' }, 'tools'],
    [{ text: '[STDOUT]\n[CI] build passed' }, 'ci'],
    [{ text: '[STDOUT]\n[ERROR] hidden error' }, 'error'],
    [{ text: '[STDOUT]\nplain untagged line' }, 'output'],
    // Bare tags still work.
    [{ text: '[ERROR] direct error' }, 'error'],
    [{ text: '[AGENT] direct output' }, 'output'],
  ])('%j -> %s', (record, expected) => {
    expect(categoryFor(record)).toBe(expected);
  });

  test('tagForRecord unwraps stream wrappers for display', () => {
    expect(tagForRecord({ text: '[STDERR]\n[ERROR] canary stderr line' })).toBe('[ERROR]');
    expect(tagForRecord({ text: '[STDOUT]\n[AGENT] first line' })).toBe('[AGENT]');
    expect(tagForRecord({ text: '[STDOUT]\nplain line' })).toBe('[LOG]');
  });

  test('categoriesFor adds error secondary for [STDERR]-wrapped content', () => {
    // When primary is already error, no secondary is needed (it is the primary).
    expect(categoryFor({ text: '[STDERR]\n[ERROR] canary stderr line' })).toBe('error');
    expect(categoryFor({ kind: 'system', tag: '[STDERR]', text: 'warning' })).toBe('error');
    // Text-level [ERROR] behind a non-error primary surfaces Errors as secondary.
    expect(categoriesFor({ kind: 'assistant', text: 'prefix\n[ERROR] hidden' })).toContain('error');
    // [STDERR] text behind a non-error primary surfaces Errors as secondary.
    expect(categoriesFor({ kind: 'assistant', text: 'prefix\n[STDERR] hidden' })).toContain('error');
  });
});

describe('markRepeated', () => {
  test('flags identical neighbours within the window, keeps order and purity', () => {
    const input = [
      { id: '1', category: 'ci', tag: '[CI]', text: 'npm test' },
      { id: '2', category: 'ci', tag: '[CI]', text: 'npm test' },
      { id: '3', category: 'ci', tag: '[CI]', text: 'npm other' },
    ];
    const out = markRepeated(input);
    expect(out.map((r) => Boolean(r.isRepeated))).toEqual([false, true, false]);
    expect(input[1].isRepeated).toBeUndefined();
  });
});

describe('legacy migration', () => {
  test('old task feeds map to category sets', () => {
    expect(legacyFeedToCategories('TOOLS')).toEqual(new Set(['tools']));
    expect(legacyFeedToCategories('THINKING')).toEqual(new Set(['thinking']));
    expect(legacyFeedToCategories('ASSISTANT')).toEqual(new Set(['output']));
    expect(legacyFeedToCategories('SYSTEM')).toEqual(
      new Set(['system', 'error', 'git', 'human', 'stage', 'ci']),
    );
    expect(legacyFeedToCategories('BOGUS').size).toBeGreaterThan(1);
  });

  test('old board tags map to category sets', () => {
    expect(legacyTagToCategories('ERROR')).toEqual(new Set(['error']));
    expect(legacyTagToCategories('CI/CMD')).toEqual(new Set(['ci']));
    expect(legacyTagToCategories('HUMAN')).toEqual(new Set(['human']));
    expect(legacyTagToCategories('BOGUS').size).toBeGreaterThan(1);
  });

  test('hydrateCategories drops unknown ids and defaults only when storage is absent', () => {
    expect(hydrateCategories(['output', 'BOGUS'])).toEqual(new Set(['output']));
    expect(hydrateCategories(undefined).size).toBeGreaterThan(1);
    expect(hydrateCategories('nope').size).toBeGreaterThan(1);
  });
});

describe('null/undefined safety (fail-safe)', () => {
  test('categoryFor never throws on null/undefined/partial input', () => {
    expect(() => categoryFor(null)).not.toThrow();
    expect(() => categoryFor(undefined)).not.toThrow();
    expect(() => categoryFor({})).not.toThrow();
    expect(categoryFor(null)).toBe('output'); // no kind, no tag -> untagged live stdout reads as narrative
    expect(categoryFor({ text: null })).toBe('output');
  });

  test('categoriesFor never throws on null/undefined input', () => {
    expect(() => categoriesFor(null)).not.toThrow();
    expect(() => categoriesFor(undefined)).not.toThrow();
    expect(Array.isArray(categoriesFor(null))).toBe(true);
  });

  test('tagForRecord never throws on null/undefined input', () => {
    expect(() => tagForRecord(null)).not.toThrow();
    expect(() => tagForRecord(undefined)).not.toThrow();
    expect(tagForRecord(null)).toBe('[LOG]');
  });

  test('extractDetail never throws on null/undefined/circular input', () => {
    expect(() => extractDetail(null)).not.toThrow();
    expect(() => extractDetail(undefined)).not.toThrow();
    expect(extractDetail(null)).toBeNull();
    // Circular reference in detail object: JSON.stringify throws, we catch.
    const circular = { a: 1 };
    circular.self = circular;
    expect(extractDetail({ detail: circular })).toBeNull();
    // Circular reference in usage object.
    const usageCircular = { tokens: 1 };
    usageCircular.loop = usageCircular;
    expect(extractDetail({ usage: usageCircular })).toBeNull();
  });

  test('normalizeLogRecord never throws on null/undefined input', () => {
    expect(() => normalizeLogRecord(null)).not.toThrow();
    expect(() => normalizeLogRecord(undefined)).not.toThrow();
    const rec = normalizeLogRecord(null);
    expect(rec.id).toMatch(/^log-rec-\d+$/);
    expect(rec.ts).toBeNull();
    expect(rec.text).toBe('');
    expect(rec.category).toBe('output');
  });

  test('filterLogRecords handles null/undefined records and state', () => {
    expect(filterLogRecords(null)).toEqual([]);
    expect(filterLogRecords(undefined)).toEqual([]);
    expect(filterLogRecords([], {})).toEqual([]);
    expect(filterLogRecords(null, { categories: new Set(['output']) })).toEqual([]);
  });

  test('groupLogRecords handles null/undefined records', () => {
    expect(groupLogRecords(null)).toEqual([{ id: 'all', turn: null, label: null, records: [] }]);
    expect(groupLogRecords(undefined, { mode: 'turn' })).toEqual([]);
    expect(groupLogRecords(null, { mode: 'source' })).toEqual([]);
  });

  test('countByCategory handles null/undefined records', () => {
    expect(countByCategory(null)).toEqual({});
    expect(countByCategory(undefined)).toEqual({});
    expect(countByCategory([])).toEqual({});
  });

  test('interventionSummary handles null/undefined records', () => {
    expect(interventionSummary(null)).toEqual({
      errors: 0,
      checkpoints: 0,
      repeated: 0,
      needsAttention: false,
    });
    expect(interventionSummary(undefined).needsAttention).toBe(false);
  });

  test('formatLogRecordsForCopy handles null/undefined records', () => {
    expect(formatLogRecordsForCopy(null)).toBe('');
    expect(formatLogRecordsForCopy(undefined)).toBe('');
    expect(formatLogRecordsForCopy([])).toBe('');
  });

  test('isIntervention handles null/undefined input', () => {
    expect(isIntervention(null)).toBe(false);
    expect(isIntervention(undefined)).toBe(false);
    expect(isIntervention({})).toBe(false);
  });

  test('markRepeated handles null/undefined records', () => {
    expect(markRepeated(null)).toEqual([]);
    expect(markRepeated(undefined)).toEqual([]);
    expect(markRepeated([])).toEqual([]);
  });

  test('timestampLabel handles Date objects and edge cases', () => {
    const d = new Date('2026-10-16T10:00:01.000Z');
    expect(timestampLabel(d)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(timestampLabel(d, 'ISO')).toBe('2026-10-16T10:00:01.000Z');
    expect(timestampLabel(d, 'HH:MM:SS.mmm')).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    // Empty string, whitespace-only — both render the em-dash placeholder.
    expect(timestampLabel('')).toBe('—');
    expect(timestampLabel('   ')).toBe('—');
    // Numeric timestamp (epoch ms)
    expect(timestampLabel(1760000000000)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('hydrateCategories handles non-array stored values', () => {
    expect(hydrateCategories(null).size).toBeGreaterThan(1);
    expect(hydrateCategories(undefined).size).toBeGreaterThan(1);
    expect(hydrateCategories('output').size).toBeGreaterThan(1);
    expect(hydrateCategories(42).size).toBeGreaterThan(1);
    expect(hydrateCategories({ id: 'output' }).size).toBeGreaterThan(1);
    // Empty array means "no filter" -> empty Set (shows everything)
    expect(hydrateCategories([])).toEqual(new Set());
  });

  test('legacyFeedToCategories and legacyTagToCategories handle null/undefined', () => {
    expect(legacyFeedToCategories(null).size).toBeGreaterThan(1);
    expect(legacyFeedToCategories(undefined).size).toBeGreaterThan(1);
    expect(legacyTagToCategories(null).size).toBeGreaterThan(1);
    expect(legacyTagToCategories(undefined).size).toBeGreaterThan(1);
  });

  test('recordMatchesCategories handles null/undefined record', () => {
    expect(recordMatchesCategories(null, new Set(['output']))).toBe(false);
    expect(recordMatchesCategories(undefined, new Set(['output']))).toBe(false);
    expect(recordMatchesCategories(null, new Set())).toBe(true); // empty set = ALL
    expect(recordMatchesCategories(null, new Set(['ALL']))).toBe(true);
  });

  test('iteration functions skip null elements within arrays', () => {
    const withNulls = [
      normalizeLogRecord({ id: 'a', kind: 'assistant', text: 'hi' }),
      null,
      undefined,
      normalizeLogRecord({ id: 'b', kind: 'error', text: '[ERROR] boom' }),
    ];
    // filterLogRecords drops nulls
    expect(filterLogRecords(withNulls, { categories: new Set(['output', 'error']) }).map((r) => r.id)).toEqual(['a', 'b']);
    // countByCategory skips nulls
    expect(countByCategory(withNulls)).toEqual({ output: 1, error: 1 });
    // interventionSummary skips nulls
    expect(interventionSummary(withNulls)).toEqual({ errors: 1, checkpoints: 0, repeated: 0, needsAttention: true });
    // formatLogRecordsForCopy skips nulls
    expect(formatLogRecordsForCopy(withNulls)).toContain('hi');
    expect(formatLogRecordsForCopy(withNulls)).toContain('boom');
    // groupLogRecords skips nulls
    const groups = groupLogRecords(withNulls, { mode: 'none' });
    expect(groups[0].records).toHaveLength(2);
  });
});

describe('markRepeated boundary conditions', () => {
  test('window size 1 flags only immediate duplicates', () => {
    const input = [
      { id: '1', category: 'ci', tag: '[CI]', text: 'a' },
      { id: '2', category: 'ci', tag: '[CI]', text: 'a' },
      { id: '3', category: 'ci', tag: '[CI]', text: 'b' },
      { id: '4', category: 'ci', tag: '[CI]', text: 'a' }, // not adjacent to first 'a'
    ];
    const out = markRepeated(input, 1);
    expect(out.map((r) => Boolean(r.isRepeated))).toEqual([false, true, false, false]);
  });

  test('window size 0 never flags repeats', () => {
    const input = [
      { id: '1', category: 'ci', tag: '[CI]', text: 'a' },
      { id: '2', category: 'ci', tag: '[CI]', text: 'a' },
    ];
    const out = markRepeated(input, 0);
    expect(out.map((r) => Boolean(r.isRepeated))).toEqual([false, false]);
  });

  test('different categories with same text are not repeats', () => {
    const input = [
      { id: '1', category: 'ci', tag: '[CI]', text: 'same text' },
      { id: '2', category: 'output', tag: '[AGENT]', text: 'same text' },
    ];
    const out = markRepeated(input);
    expect(out.map((r) => Boolean(r.isRepeated))).toEqual([false, false]);
  });
});

describe('countByCategory and copy formatting', () => {
  test('counts primaries; copy renders timestamp/tag lines', () => {
    const records = [
      normalizeLogRecord({ id: 'a', kind: 'assistant', text: 'hi' }),
      normalizeLogRecord({ id: 'b', kind: 'assistant', text: 'yo' }),
    ];
    expect(countByCategory(records)).toEqual({ output: 2 });
    const text = formatLogRecordsForCopy([
      { ...records[0], ts: '2026-10-16T10:00:01.000Z' },
    ]);
    expect(text).toContain('[AGENT] hi');
  });

  test('copy is summary-only unless the row was expanded', () => {
    const record = {
      ...normalizeLogRecord({ id: 'a', kind: 'tool', text: '[TOOL] edit', meta: { output: 'full diff here' } }),
      detail: 'full diff here',
    };
    expect(formatLogRecordsForCopy([record])).not.toContain('full diff here');
    expect(formatLogRecordsForCopy([record], { expandedIds: new Set(['a']) })).toContain(
      'full diff here',
    );
  });

  test('empty rows are missing data, never repeats', () => {
    const out = markRepeated([
      { id: '1', category: '', tag: '', text: '' },
      { id: '2', category: '', tag: '', text: '   ' },
    ]);
    expect(out.map((r) => Boolean(r.isRepeated))).toEqual([false, false]);
  });
});
