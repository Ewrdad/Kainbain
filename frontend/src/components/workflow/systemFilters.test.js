// Run in the lighter node environment: pure registry logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  SYSTEM_FILTERS,
  SYSTEM_FILTER_IDS,
  getSystemFilter,
  isSystemFilterToken,
  normalizeSystemFilterTokens,
  parseSystemFilters,
  registerSystemFilter,
  systemFilterMatches,
} from './systemFilters';

/***
 * MARK: systemFilters tests
 * @description Unit tests for the extendable `!` system-filter registry:
 *   token shape, lookup, registration validation, normalization, matching,
 *   and input parsing. Adding a future native filter is one registry entry —
 *   these tests pin that seam.
 ***/

describe('SYSTEM_FILTERS registry', () => {
  test('ships failed + human in display order', () => {
    expect(SYSTEM_FILTERS.map((entry) => entry.id)).toEqual(['failed', 'human']);
    expect(SYSTEM_FILTER_IDS).toEqual(['failed', 'human']);
  });

  test('every entry has label, description, and a match predicate', () => {
    for (const entry of SYSTEM_FILTERS) {
      expect(typeof entry.label).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.match).toBe('function');
    }
  });
});

describe('isSystemFilterToken', () => {
  test('accepts !-prefixed tokens', () => {
    expect(isSystemFilterToken('!failed')).toBe(true);
    expect(isSystemFilterToken('!human')).toBe(true);
    expect(isSystemFilterToken('!anything')).toBe(true);
  });

  test('rejects non-tokens', () => {
    expect(isSystemFilterToken('!')).toBe(false);
    expect(isSystemFilterToken('!!failed')).toBe(false);
    expect(isSystemFilterToken('#Dev')).toBe(false);
    expect(isSystemFilterToken('failed')).toBe(false);
    expect(isSystemFilterToken('')).toBe(false);
    expect(isSystemFilterToken(null)).toBe(false);
    expect(isSystemFilterToken(undefined)).toBe(false);
  });
});

describe('getSystemFilter', () => {
  test('looks up registered ids case-insensitively', () => {
    expect(getSystemFilter('failed')?.id).toBe('failed');
    expect(getSystemFilter('FAILED')?.id).toBe('failed');
    expect(getSystemFilter('Human')?.id).toBe('human');
  });

  test('returns undefined for unknown ids', () => {
    expect(getSystemFilter('bogus')).toBeUndefined();
    expect(getSystemFilter('')).toBeUndefined();
    expect(getSystemFilter(null)).toBeUndefined();
  });
});

describe('registerSystemFilter', () => {
  test('adds a new filter future UI/parser/filter code reads with no edits', () => {
    const entry = registerSystemFilter({
      id: 'test-only-alpha',
      label: 'alpha',
      description: 'Test-only filter.',
      match: (task) => task?.flagged === true,
    });
    expect(entry.id).toBe('test-only-alpha');
    expect(getSystemFilter('TEST-ONLY-ALPHA')?.id).toBe('test-only-alpha');
    expect(SYSTEM_FILTERS.some((item) => item.id === 'test-only-alpha')).toBe(true);
    expect(systemFilterMatches('test-only-alpha', { flagged: true }, [])).toBe(true);
    expect(systemFilterMatches('test-only-alpha', {}, [])).toBe(false);
  });

  test('duplicate ids throw case-insensitively', () => {
    expect(() => registerSystemFilter({ id: 'FAILED', match: () => true })).toThrow(
      /duplicate system filter id/,
    );
  });

  test('missing id or non-function match throws', () => {
    expect(() => registerSystemFilter({ match: () => true })).toThrow(/id is required/);
    expect(() => registerSystemFilter(null)).toThrow(/must be an object/);
    expect(() => registerSystemFilter({ id: 'test-only-bad' })).toThrow(
      /match must be a function/,
    );
  });
});

describe('normalizeSystemFilterTokens', () => {
  test('dedupes case-insensitively, first casing wins', () => {
    expect(normalizeSystemFilterTokens(['Failed', 'failed', 'HUMAN'])).toEqual([
      'Failed',
      'HUMAN',
    ]);
  });

  test('strips leading ! and drops empties', () => {
    expect(normalizeSystemFilterTokens(['!failed', '', '  ', null])).toEqual(['failed']);
  });

  test('degrades for nullish input', () => {
    expect(normalizeSystemFilterTokens(null)).toEqual([]);
    expect(normalizeSystemFilterTokens(undefined)).toEqual([]);
  });
});

describe('systemFilterMatches', () => {
  const reviewStages = [{ id: 's-review', type: 'human' }];

  test('failed matches status, failureReason, or lastError', () => {
    expect(systemFilterMatches('failed', { status: 'failed' }, [])).toBe(true);
    expect(systemFilterMatches('failed', { failureReason: 'boom' }, [])).toBe(true);
    expect(systemFilterMatches('failed', { lastError: 'boom' }, [])).toBe(true);
    expect(systemFilterMatches('failed', { status: 'active' }, [])).toBe(false);
    expect(systemFilterMatches('failed', null, [])).toBe(false);
  });

  test('human matches checkpoint stage type or waiting_human status', () => {
    expect(
      systemFilterMatches('human', { currentStageId: 's-review' }, reviewStages),
    ).toBe(true);
    expect(systemFilterMatches('human', { status: 'waiting_human' }, [])).toBe(true);
    expect(systemFilterMatches('human', { currentStageId: 's-other' }, reviewStages)).toBe(
      false,
    );
  });

  test('unknown ids never match so they cannot wipe the board', () => {
    expect(systemFilterMatches('bogus', { status: 'failed' }, [])).toBe(false);
  });

  test('throwing predicates degrade to false', () => {
    registerSystemFilter({
      id: 'test-only-throws',
      match: () => {
        throw new Error('boom');
      },
    });
    expect(systemFilterMatches('test-only-throws', {}, [])).toBe(false);
  });
});

describe('parseSystemFilters', () => {
  test('parses registered !tokens from a query string', () => {
    expect(parseSystemFilters('auth !failed #Dev !human')).toEqual(['failed', 'human']);
  });

  test('unknown !tokens are dropped (the parser keeps them as text)', () => {
    expect(parseSystemFilters('!failed !bogus')).toEqual(['failed']);
  });

  test('accepts arrays and Sets', () => {
    expect(parseSystemFilters(['failed', 'bogus'])).toEqual(['failed']);
    expect(parseSystemFilters(new Set(['human']))).toEqual(['human']);
  });

  test('nullish input yields no filters', () => {
    expect(parseSystemFilters(null)).toEqual([]);
    expect(parseSystemFilters(undefined)).toEqual([]);
  });
});
