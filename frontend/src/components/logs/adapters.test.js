/**
 * MARK: adapters tests
 * @description Adapter equivalence: structured entries and live lines keep
 *   their identity/metadata through normalization, and the tool-mirror dedup
 *   policy drops only raw [TOOL] mirrors while cards are shown.
 */
import { describe, expect, test } from 'vitest';
import {
  adaptProcessLogLine,
  adaptProcessLogLines,
  adaptTaskEntries,
  adaptTaskEntry,
  excludeToolMirrorLinesWhenToolCardsShown,
} from './adapters';
import {
  liveProcessLogs,
  structuredTaskEntries,
} from './__fixtures__';

describe('adaptTaskEntry', () => {
  test('preserves id/ts/turn/text/meta and classifies', () => {
    const record = adaptTaskEntry(structuredTaskEntries[0]);
    expect(record.id).toBe('1');
    expect(record.ts).toBe('2026-10-16T10:00:01.000Z');
    expect(record.turn).toBe(1);
    expect(record.text).toContain('Analyzing');
    expect(record.category).toBe('output');
    expect(record.source).toBe('task');
  });

  test('thinking markers keep expansion affordances', () => {
    const record = adaptTaskEntry(structuredTaskEntries[2]);
    expect(record.category).toBe('thinking');
    expect(record.collapsedThinking).toBe(true);
    expect(record.fullTextId).toBe(2);
    expect(record.secondaryCategories).toContain('output');
  });

  test('tool results expose full output as detail', () => {
    const record = adaptTaskEntry(structuredTaskEntries[3]);
    expect(record.category).toBe('tools');
    expect(record.detail).toContain('FAIL tests/unit/retry.test.js');
  });

  test('never throws on partial entries', () => {
    expect(() => adaptTaskEntry()).not.toThrow();
    expect(() => adaptTaskEntry({})).not.toThrow();
  });
});

describe('adaptProcessLogLine', () => {
  test('maps live fields and stashes the raw line for legacy copy formats', () => {
    const record = adaptProcessLogLine(liveProcessLogs[0]);
    expect(record.id).toBe('ws-1');
    expect(record.ts).toBe('10:00:01');
    expect(record.tag).toBe('[AGENT]');
    expect(record.text).toBe('Agent analyzing task requirements');
    expect(record.category).toBe('output');
    expect(record.source).toBe('process-live');
    expect(record.projectName).toBe('Alpha');
    expect(record.taskId).toBe('task-1');
    expect(record.meta.rawLine.tag).toBe('[AGENT]');
  });

  test('classifies error and ci live lines', () => {
    expect(adaptProcessLogLine(liveProcessLogs[2]).category).toBe('ci');
    expect(adaptProcessLogLine(liveProcessLogs[3]).category).toBe('error');
    expect(adaptProcessLogLine(liveProcessLogs[3]).isIntervention).toBe(true);
  });

  test('falls back to raw text when text is missing', () => {
    const record = adaptProcessLogLine({ id: 'x', timestamp: 't', raw: '[CI] build' });
    expect(record.text).toBe('[CI] build');
    expect(record.category).toBe('ci');
  });

  test('classifies [STDERR]-wrapped lines as error interventions', () => {
    const record = adaptProcessLogLine({
      id: 'ws-err',
      timestamp: '10:00:02',
      text: '[STDERR]\n[ERROR] canary stderr line',
      raw: '[STDERR]\n[ERROR] canary stderr line',
    });
    expect(record.category).toBe('error');
    expect(record.isIntervention).toBe(true);
    expect(record.tag).toBe('[ERROR]');
  });

  test('classifies [STDOUT]-wrapped lines by inner tag', () => {
    const agent = adaptProcessLogLine({
      id: 'ws-out',
      timestamp: '10:00:03',
      text: '[STDOUT]\n[AGENT] AGENT first line',
    });
    expect(agent.category).toBe('output');
    expect(agent.tag).toBe('[AGENT]');

    const ci = adaptProcessLogLine({
      id: 'ws-ci',
      timestamp: '10:00:04',
      text: '[STDOUT]\n[CI] build passed',
    });
    expect(ci.category).toBe('ci');
    expect(ci.tag).toBe('[CI]');
  });
});

describe('bulk adapters flag repeats', () => {
  test('adaptTaskEntries and adaptProcessLogLines mark repeats', () => {
    const out = adaptTaskEntries([
      { id: '1', kind: 'assistant', text: 'same' },
      { id: '2', kind: 'assistant', text: 'same' },
    ]);
    expect(out[1].isRepeated).toBe(true);
    const live = adaptProcessLogLines([liveProcessLogs[0], liveProcessLogs[0]]);
    expect(live[1].isRepeated).toBe(true);
  });
});

describe('null/undefined safety', () => {
  test('adaptProcessLogLine never throws on null/undefined input', () => {
    expect(() => adaptProcessLogLine(null)).not.toThrow();
    expect(() => adaptProcessLogLine(undefined)).not.toThrow();
    const rec = adaptProcessLogLine(null);
    expect(rec.id).toMatch(/^log-rec-\d+$/);
    expect(rec.text).toBe('');
    expect(rec.source).toBe('process-live');
  });

  test('adaptTaskEntries and adaptProcessLogLines handle null/undefined', () => {
    expect(adaptTaskEntries(null)).toEqual([]);
    expect(adaptTaskEntries(undefined)).toEqual([]);
    expect(adaptProcessLogLines(null)).toEqual([]);
    expect(adaptProcessLogLines(undefined)).toEqual([]);
  });

  test('excludeToolMirrorLinesWhenToolCardsShown handles null/undefined', () => {
    expect(excludeToolMirrorLinesWhenToolCardsShown(null)).toEqual([]);
    expect(excludeToolMirrorLinesWhenToolCardsShown(undefined)).toEqual([]);
    expect(excludeToolMirrorLinesWhenToolCardsShown(null, { showToolCards: false })).toEqual([]);
    // Null options defaults to showToolCards: true
    expect(excludeToolMirrorLinesWhenToolCardsShown([{ tag: '[TOOL]', source: 'process-live' }], null)).toEqual([]);
  });
});

describe('excludeToolMirrorLinesWhenToolCardsShown', () => {
  const records = [
    { id: '1', tag: '[TOOL]', text: 'bash', category: 'tools', source: 'process-live' },
    { id: '2', tag: '[RESULT]', text: 'ok', category: 'tools', source: 'process-live' },
    { id: '3', tag: '[CI/CMD]', text: 'npm test', category: 'ci', source: 'process-live' },
  ];

  test('drops raw [TOOL] mirrors but keeps results and other lanes', () => {
    const out = excludeToolMirrorLinesWhenToolCardsShown(records, { showToolCards: true });
    expect(out.map((r) => r.id)).toEqual(['2', '3']);
  });

  test('keeps everything when no card lane exists', () => {
    expect(
      excludeToolMirrorLinesWhenToolCardsShown(records, { showToolCards: false }),
    ).toHaveLength(3);
  });
});
