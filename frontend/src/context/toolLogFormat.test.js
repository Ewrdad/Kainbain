import { describe, expect, it } from 'vitest';
import {
  parseResultEnvelope,
  stripAnsi,
  summarizePermission,
  summarizePlan,
  summarizeRaw,
  summarizeToolResult,
  summarizeToolStart,
  summarizeUsage,
  truncateAtWord,
} from '../../../shared/toolLogFormat.js';
import {
  ENVELOPE_FIXTURES,
  PERMISSION_SUMMARY_FIXTURES,
  PLAN_SUMMARY_FIXTURES,
  RAW_SUMMARY_FIXTURES,
  TOOL_RESULT_FIXTURES,
  TOOL_START_FIXTURES,
  USAGE_SUMMARY_FIXTURES,
} from '../../../shared/toolLogFormat.fixtures.js';

// MARK: toolLogFormat golden tests (frontend side)
// The live console and the Task Logs tab share one summarization rule table
// (`shared/toolLogFormat.js`). These golden tests pin every messy real-world
// sample from the shared corpus to its readable summary; the api suite
// asserts the identical corpus (`api/toolLogFormat.shared.test.js`) so the
// two sides cannot drift.

describe('summarizeToolResult golden corpus', () => {
  for (const fixture of TOOL_RESULT_FIXTURES) {
    it(fixture.name, () => {
      expect(summarizeToolResult(fixture.tool, fixture.input, fixture.options)).toBe(
        fixture.expected,
      );
    });
  }
});

describe('summarizeToolStart golden corpus', () => {
  for (const fixture of TOOL_START_FIXTURES) {
    it(fixture.name, () => {
      expect(summarizeToolStart(fixture.tool, fixture.input, fixture.options)).toBe(
        fixture.expected,
      );
    });
  }
});

describe('parseResultEnvelope golden corpus', () => {
  for (const fixture of ENVELOPE_FIXTURES) {
    it(fixture.name, () => {
      const parsed = parseResultEnvelope(fixture.input, fixture.options?.maxLength);
      if (fixture.expectedKind === null) {
        expect(parsed).toBeNull();
      } else {
        expect(parsed?.kind).toBe(fixture.expectedKind);
        expect(parsed?.summary).toBe(fixture.expectedSummary);
        expect(parsed?.detail).toBe(fixture.expectedDetail);
      }
    });
  }
});

describe('unified-lane golden corpus', () => {
  for (const fixture of USAGE_SUMMARY_FIXTURES) {
    it(`usage: ${fixture.name}`, () => {
      expect(summarizeUsage(fixture.input)).toBe(fixture.expected);
    });
  }
  for (const fixture of PERMISSION_SUMMARY_FIXTURES) {
    it(`permission: ${fixture.name}`, () => {
      expect(summarizePermission(fixture.input)).toBe(fixture.expected);
    });
  }
  for (const fixture of PLAN_SUMMARY_FIXTURES) {
    it(`plan: ${fixture.name}`, () => {
      expect(summarizePlan(fixture.input)).toBe(fixture.expected);
    });
  }
  for (const fixture of RAW_SUMMARY_FIXTURES) {
    it(`raw: ${fixture.name}`, () => {
      expect(summarizeRaw(fixture.input)).toBe(fixture.expected);
    });
  }

  it('unified summarizers never throw and always return a string', () => {
    const hostile = [undefined, null, 0, true, {}, [], 'x', 'x'.repeat(100_000)];
    for (const input of hostile) {
      expect(() => summarizeUsage(input)).not.toThrow();
      expect(typeof summarizeUsage(input)).toBe('string');
      expect(() => summarizePermission(input)).not.toThrow();
      expect(typeof summarizePermission(input)).toBe('string');
      expect(() => summarizePlan(input)).not.toThrow();
      expect(typeof summarizePlan(input)).toBe('string');
      expect(() => summarizeRaw(input)).not.toThrow();
      expect(typeof summarizeRaw(input)).toBe('string');
    }
  });
});

describe('fallback guarantees', () => {
  const hostileInputs = [
    undefined,
    null,
    0,
    42,
    true,
    { nested: { deep: ['x'] } },
    ['a', 'b'],
    '',
    '   ',
    '\n\t\n',
    '�',
    '{"unclosed": true',
    '[{"unclosed": true}]',
    '{"a": mothersDay}',
    'not json at all [[[[',
    '\u001b[31mred\u001b[0m \u001b[1mbold\u001b[0m',
    '\uFEFF{"command": "bom", "output": "ok"}',
    'x'.repeat(100_000),
  ];

  it('summarizeToolResult never throws and always returns a string', () => {
    for (const input of hostileInputs) {
      for (const tool of ['bash', 'edit_file', '', null, undefined]) {
        let summary;
        expect(() => {
          summary = summarizeToolResult(tool, input, { maxLength: 80 });
        }).not.toThrow();
        expect(typeof summary).toBe('string');
      }
    }
  });

  it('summarizeToolResult never returns empty for non-blank input', () => {
    for (const input of hostileInputs) {
      // Nullish renders empty by design (pinned by the 'null input renders
      // empty' golden fixture — the caller omits the excerpt), so it is blank
      // here even though JSON.stringify would print 'null'/'undefined'.
      if (input === null || input === undefined) continue;
      const text = typeof input === 'string' ? input : JSON.stringify(input) || String(input);
      if (!text.trim()) continue;
      expect(summarizeToolResult('bash', input, { maxLength: 80 }).length).toBeGreaterThan(0);
    }
  });

  it('summarizeToolResult respects the budget on every hostile input', () => {
    for (const input of hostileInputs) {
      expect(summarizeToolResult('bash', input, { maxLength: 80 }).length).toBeLessThanOrEqual(
        80,
      );
    }
  });

  it('summarizeToolStart never throws and always returns a string', () => {
    const circular = { self: null };
    circular.self = circular;
    for (const input of [...hostileInputs, circular, { command: ['ls', '-la'] }]) {
      let summary;
      expect(() => {
        summary = summarizeToolStart('bash', input, { maxLength: 120 });
      }).not.toThrow();
      expect(typeof summary).toBe('string');
    }
  });

  it('summarizeToolStart respects the budget on every hostile input', () => {
    for (const input of hostileInputs) {
      expect(summarizeToolStart('bash', input, { maxLength: 120 }).length).toBeLessThanOrEqual(
        120,
      );
    }
  });

  it('summarizeToolStart falls back to a sane default on garbage budgets', () => {
    expect(summarizeToolStart('bash', { a: 1 }, { maxLength: 0 })).toBe('{"a":1}');
    expect(summarizeToolStart('bash', { a: 1 }, { maxLength: -5 })).toBe('{"a":1}');
    expect(summarizeToolStart('bash', { a: 1 }, { maxLength: Number.NaN })).toBe('{"a":1}');
  });

  it('stripAnsi removes color codes but keeps the text', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m')).toBe('ok');
    expect(stripAnsi('plain')).toBe('plain');
    expect(stripAnsi('')).toBe('');
    expect(stripAnsi(null)).toBe('');
    expect(stripAnsi(undefined)).toBe('');
  });

  it('truncateAtWord cuts at word boundaries with an ellipsis', () => {
    expect(truncateAtWord('short', 80)).toBe('short');
    expect(truncateAtWord('exact', 5)).toBe('exact');
    expect(truncateAtWord('one two three', 9)).toBe('one two…');
    expect(truncateAtWord('onetwothree', 9)).toBe('onetwoth…');
    expect(truncateAtWord('a, b, c, d', 7)).toBe('a, b…');
    expect(truncateAtWord('', 80)).toBe('');
    expect(truncateAtWord(null, 80)).toBe('');
    expect(truncateAtWord('abc', 0)).toBe('');
    expect(truncateAtWord('abc', 1)).toBe('…');
  });

  it('truncateAtWord keeps a fitting trailing word instead of dropping it', () => {
    // Head ends exactly on 'word' (next char is a space): the word fits, keep it.
    expect(truncateAtWord(`${'word '.repeat(23)}word and more`, 120)).toBe(
      `${'word '.repeat(23)}word…`,
    );
  });

  it('truncateAtWord trims dangling punctuation but keeps the fitting word', () => {
    // Head ends with ',' and the next char is a space: already on a boundary,
    // so only the comma goes — 'f09.js' stays.
    expect(truncateAtWord('f00.js, f01.js, f02.js, extra', 24)).toBe('f00.js, f01.js, f02.js…');
  });

  it('truncateAtWord steps back over short fragments, keeps long ones', () => {
    // 1-char fragment of 'ccc': noise, step back to the last space.
    expect(truncateAtWord('aaa bbb ccc', 10)).toBe('aaa bbb…');
    // 66-char token fragment: readable on its own, keep the hard cut.
    expect(truncateAtWord(`description: ${'d'.repeat(200)}`, 80)).toBe(
      `description: ${'d'.repeat(66)}…`,
    );
  });
});
