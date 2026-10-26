import { describe, expect, test } from 'vitest';
import {
  buildSearchQuery,
  extractTagTokenAtCursor,
  isTagToken,
  parseSearchQuery,
} from './searchQueryParser';

/***
 * MARK: searchQueryParser tests
 * @description Colocated unit tests for the unified search bar query parser:
 *   `#tag` tokens are extracted as stage-tag filters, everything else stays
 *   free text, and the cursor helper powers the suggestion dropdown.
 ***/

describe('isTagToken', () => {
  test('accepts tokens starting with a single hash', () => {
    expect(isTagToken('#Dev')).toBe(true);
    expect(isTagToken('#PO')).toBe(true);
    expect(isTagToken('#a')).toBe(true);
  });

  test('rejects a bare hash with no tag name', () => {
    expect(isTagToken('#')).toBe(false);
  });

  test('rejects double-hash tokens', () => {
    expect(isTagToken('##double')).toBe(false);
  });

  test('rejects plain text and non-strings', () => {
    expect(isTagToken('auth')).toBe(false);
    expect(isTagToken('')).toBe(false);
    expect(isTagToken(null)).toBe(false);
    expect(isTagToken(undefined)).toBe(false);
  });
});

describe('parseSearchQuery', () => {
  test('empty string yields empty text and no tags', () => {
    expect(parseSearchQuery('')).toEqual({ text: '', tags: [], systemFilters: [], raw: '' });
  });

  test('plain text only yields text and no tags', () => {
    expect(parseSearchQuery('auth login')).toEqual({
      text: 'auth login',
      tags: [],
      systemFilters: [],
      raw: 'auth login',
    });
  });

  test('tags only yield no text', () => {
    expect(parseSearchQuery('#Dev #PO')).toEqual({
      text: '',
      tags: ['Dev', 'PO'],
      systemFilters: [],
      raw: '#Dev #PO',
    });
  });

  test('mixed text and tags split correctly', () => {
    expect(parseSearchQuery('auth #Dev')).toEqual({
      text: 'auth',
      tags: ['Dev'],
      systemFilters: [],
      raw: 'auth #Dev',
    });
  });

  test('tag position does not matter (start, middle, end)', () => {
    expect(parseSearchQuery('#Dev auth login').tags).toEqual(['Dev']);
    expect(parseSearchQuery('#Dev auth login').text).toBe('auth login');
    expect(parseSearchQuery('auth #Dev login').tags).toEqual(['Dev']);
    expect(parseSearchQuery('auth #Dev login').text).toBe('auth login');
    expect(parseSearchQuery('auth login #Dev').tags).toEqual(['Dev']);
    expect(parseSearchQuery('auth login #Dev').text).toBe('auth login');
  });

  test('extra whitespace is normalized', () => {
    expect(parseSearchQuery('  auth   #Dev   #PO  ')).toEqual({
      text: 'auth',
      tags: ['Dev', 'PO'],
      systemFilters: [],
      raw: '  auth   #Dev   #PO  ',
    });
  });

  test('duplicate tags dedupe case-insensitively, first casing wins', () => {
    expect(parseSearchQuery('#Dev #dev #PO #po').tags).toEqual(['Dev', 'PO']);
  });

  test('a bare hash is treated as text, not a tag', () => {
    expect(parseSearchQuery('auth # login')).toEqual({
      text: 'auth # login',
      tags: [],
      systemFilters: [],
      raw: 'auth # login',
    });
  });

  test('double-hash tokens are treated as text, not tags', () => {
    const parsed = parseSearchQuery('auth ##double');
    expect(parsed.tags).toEqual([]);
    expect(parsed.systemFilters).toEqual([]);
    expect(parsed.text).toBe('auth ##double');
  });

  test('non-string input degrades to empty', () => {
    expect(parseSearchQuery(null)).toEqual({ text: '', tags: [], systemFilters: [], raw: '' });
    expect(parseSearchQuery(undefined)).toEqual({ text: '', tags: [], systemFilters: [], raw: '' });
  });
});

describe('buildSearchQuery', () => {
  test('combines text and tags', () => {
    expect(buildSearchQuery('auth', ['Dev', 'PO'])).toBe('auth #Dev #PO');
  });

  test('tags only', () => {
    expect(buildSearchQuery('', ['Dev'])).toBe('#Dev');
  });

  test('text only', () => {
    expect(buildSearchQuery('auth', [])).toBe('auth');
  });

  test('both empty yields empty string', () => {
    expect(buildSearchQuery('', [])).toBe('');
  });

  test('trims text and tag names, drops empties, dedupes', () => {
    expect(buildSearchQuery('  auth  ', [' Dev ', '', 'dev'])).toBe('auth #Dev');
  });

  test('round-trips with parseSearchQuery', () => {
    const raw = 'auth login #Dev #PO';
    const parsed = parseSearchQuery(raw);
    expect(buildSearchQuery(parsed.text, parsed.tags)).toBe(raw);
    expect(parseSearchQuery(buildSearchQuery('auth', ['Dev']))).toEqual({
      text: 'auth',
      tags: ['Dev'],
      systemFilters: [],
      raw: 'auth #Dev',
    });
  });
});

describe('extractTagTokenAtCursor', () => {
  test('identifies the tag token at the cursor', () => {
    expect(extractTagTokenAtCursor('auth #De', 8)).toBe('#De');
  });

  test('bare hash at the cursor is still a token being typed', () => {
    expect(extractTagTokenAtCursor('auth #', 6)).toBe('#');
  });

  test('cursor in the middle of a tag token returns the whole token', () => {
    expect(extractTagTokenAtCursor('auth #DevOps', 8)).toBe('#DevOps');
  });

  test('cursor inside plain text returns null', () => {
    expect(extractTagTokenAtCursor('auth login', 2)).toBeNull();
  });

  test('cursor on whitespace between tokens returns null', () => {
    expect(extractTagTokenAtCursor('auth login', 4)).toBeNull();
  });

  test('cursor at the start of the input returns null for text', () => {
    expect(extractTagTokenAtCursor('auth', 0)).toBeNull();
  });

  test('out-of-range cursor returns null', () => {
    expect(extractTagTokenAtCursor('auth', -1)).toBeNull();
    expect(extractTagTokenAtCursor('auth', 99)).toBeNull();
    expect(extractTagTokenAtCursor('auth')).toBeNull();
  });

  test('non-string input degrades to null', () => {
    expect(extractTagTokenAtCursor(null, 0)).toBeNull();
  });
});
