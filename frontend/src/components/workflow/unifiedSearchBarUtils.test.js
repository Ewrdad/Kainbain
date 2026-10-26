import { describe, expect, test, vi } from 'vitest';
import {
  buildDisplayText,
  dedupeTagLabels,
  draftTokenSpan,
  getTagLabel,
  isCommittableDraft,
  normalizeSearchValue,
  normalizeTagOptions,
  scheduleAfterPaint,
} from './unifiedSearchBarUtils';

/***
 * MARK: unifiedSearchBarUtils tests
 * @description Colocated unit tests for the UnifiedSearchBar pure helpers.
 *   Every helper is total: malformed inputs degrade to empty results instead
 *   of throwing, so a bad prop can never crash the toolbar.
 ***/

describe('getTagLabel', () => {
  test('reads plain strings and { value, label } objects', () => {
    expect(getTagLabel('Dev')).toBe('Dev');
    expect(getTagLabel({ value: 'Dev', label: 'Dev' })).toBe('Dev');
    expect(getTagLabel({ value: 'PO' })).toBe('PO');
    // An empty label falls through to the value.
    expect(getTagLabel({ label: '', value: 'PO' })).toBe('PO');
  });

  test('degrades anything else to an empty label', () => {
    expect(getTagLabel(null)).toBe('');
    expect(getTagLabel(undefined)).toBe('');
    expect(getTagLabel(42)).toBe('');
    expect(getTagLabel({})).toBe('');
    expect(getTagLabel({ label: null, value: null })).toBe('');
  });
});

describe('normalizeTagOptions', () => {
  test('passes arrays through by reference (stable for memoization)', () => {
    const options = [{ value: 'Dev' }];
    expect(normalizeTagOptions(options)).toBe(options);
  });

  test('coerces every non-array input to the shared empty list', () => {
    const empty = normalizeTagOptions(null);
    expect(empty).toEqual([]);
    expect(normalizeTagOptions(undefined)).toBe(empty);
    expect(normalizeTagOptions('Dev')).toBe(empty);
    expect(normalizeTagOptions({ value: 'Dev' })).toBe(empty);
    expect(normalizeTagOptions(42)).toBe(empty);
  });
});

describe('normalizeSearchValue', () => {
  test('passes strings through untouched', () => {
    expect(normalizeSearchValue('auth #Dev')).toBe('auth #Dev');
    expect(normalizeSearchValue('')).toBe('');
  });

  test('coerces nullish to an empty query and anything else to its string form', () => {
    expect(normalizeSearchValue(null)).toBe('');
    expect(normalizeSearchValue(undefined)).toBe('');
    expect(normalizeSearchValue(123)).toBe('123');
  });
});

describe('dedupeTagLabels', () => {
  test('dedupes case-insensitively, keeping first-seen casing and order', () => {
    expect(dedupeTagLabels(['Dev', 'dev', 'PO', 'po', 'Design'])).toEqual(['Dev', 'PO', 'Design']);
  });

  test('drops empty and non-string entries', () => {
    expect(dedupeTagLabels(['Dev', '', null, 42, undefined, 'PO'])).toEqual(['Dev', 'PO']);
  });

  test('coerces non-array input to an empty list', () => {
    expect(dedupeTagLabels(null)).toEqual([]);
    expect(dedupeTagLabels('Dev')).toEqual([]);
  });
});

describe('scheduleAfterPaint', () => {
  test('runs the callback (via rAF when available, synchronously otherwise)', async () => {
    const fn = vi.fn();
    scheduleAfterPaint(fn);
    // rAF path: fires on the next frame; sync path: already called.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('draftTokenSpan', () => {
  test('returns token boundaries for the #token under the caret', () => {
    expect(draftTokenSpan('auth #De', 8)).toEqual({ token: '#De', start: 5, end: 8 });
    expect(draftTokenSpan('#De', 3)).toEqual({ token: '#De', start: 0, end: 3 });
    // The caret may sit anywhere inside the token run.
    expect(draftTokenSpan('auth #Dev #PO', 7)).toEqual({ token: '#Dev', start: 5, end: 9 });
  });

  test('returns the bare # trigger while it is being typed', () => {
    expect(draftTokenSpan('#', 1)).toEqual({ token: '#', start: 0, end: 1 });
  });

  test('returns null when the caret is not inside a tag token', () => {
    expect(draftTokenSpan('auth', 2)).toBeNull();
    expect(draftTokenSpan('auth ', 5)).toBeNull();
    expect(draftTokenSpan('', 0)).toBeNull();
  });

  test('degrades malformed input to null instead of throwing', () => {
    expect(draftTokenSpan(null, 0)).toBeNull();
    expect(draftTokenSpan(undefined, 3)).toBeNull();
    expect(draftTokenSpan('auth #De', null)).toBeNull();
    expect(draftTokenSpan('auth #De', -1)).toBeNull();
    expect(draftTokenSpan('auth #De', 99)).toBeNull();
  });
});

describe('isCommittableDraft', () => {
  test('accepts a #token with at least one character after the hash', () => {
    expect(isCommittableDraft('#D')).toBe(true);
    expect(isCommittableDraft('#Dev')).toBe(true);
  });

  test('rejects a bare hash, double hashes, plain text, and non-strings', () => {
    expect(isCommittableDraft('#')).toBe(false);
    expect(isCommittableDraft('##x')).toBe(false);
    expect(isCommittableDraft('auth')).toBe(false);
    expect(isCommittableDraft('')).toBe(false);
    expect(isCommittableDraft(null)).toBe(false);
    expect(isCommittableDraft(undefined)).toBe(false);
  });
});

describe('buildDisplayText', () => {
  test('joins committed text and an in-progress draft with one space', () => {
    expect(buildDisplayText('auth', '#De', false)).toBe('auth #De');
    expect(buildDisplayText('', '#De', false)).toBe('#De');
  });

  test('keeps a lone trailing separator so the caret never jumps', () => {
    expect(buildDisplayText('auth', '', true)).toBe('auth ');
  });

  test('the draft wins over the trailing separator', () => {
    expect(buildDisplayText('auth', '#De', true)).toBe('auth #De');
  });

  test('degrades empty and malformed input to a safe string', () => {
    expect(buildDisplayText('', '', false)).toBe('');
    expect(buildDisplayText('', '', true)).toBe('');
    expect(buildDisplayText(null, null, false)).toBe('');
    expect(buildDisplayText(undefined, undefined, true)).toBe('');
  });
});
