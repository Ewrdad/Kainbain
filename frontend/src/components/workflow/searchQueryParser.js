/***
 * MARK: searchQueryParser
 * @description Pure helpers for parsing a unified search query into its
 *   textual search terms, stage-tag tokens (anything beginning with `#`)
 *   and system-native filter tokens (anything beginning with `!`).
 *   No React imports, no side effects — independently unit-testable.
 * @example parseSearchQuery('auth !failed #Dev') // { text: 'auth', tags: ['Dev'], systemFilters: ['failed'], raw: 'auth !failed #Dev' }
 ***/

import { normalizeSelectedTagTokens } from './stageTagFilter';
import { isSystemFilterToken, getSystemFilter, normalizeSystemFilterTokens } from './systemFilters';

/***
 * MARK: isTagToken
 * @description True when a whitespace-delimited token is a stage tag reference:
 *   it begins with `#` and is followed by at least one non-`#` character.
 * @example isTagToken('#dev') => true
 * @param {string} token
 * @returns {boolean}
 ***/
export function isTagToken(token) {
  if (typeof token !== 'string' || token.length < 2) return false;
  if (token.charAt(0) !== '#') return false;
  // `##double` (a second hash) is not a valid tag reference.
  if (token.charAt(1) === '#') return false;
  return true;
}

/***
 * MARK: isSystemFilterToken
 * @description Re-export of the registry's `!` token check: a token is a
 *   system filter only when its `!name` matches a registered filter id.
 ***/
export { isSystemFilterToken };

/***
 * MARK: parseSearchQuery
 * @description Splits a raw search query into `{ text, tags, systemFilters, raw }`.
 *   `#` tokens route to tags, `!` tokens route to systemFilters, everything
 *   else stays free text. Tags and system filters are normalized and
 *   deduplicated case-insensitively (first casing/registered casing wins).
 * @example parseSearchQuery('auth !failed #Dev') => { text: 'auth', tags: ['Dev'], systemFilters: ['failed'], raw: 'auth !failed #Dev' }
 * @param {string} raw - Raw search query string.
 * @returns {{ text: string, tags: Array<string>, systemFilters: Array<string>, raw: string }}
 ***/
export function parseSearchQuery(raw) {
  let source;
  if (typeof raw === 'string') source = raw;
  else if (raw == null) source = '';
  else source = String(raw);
  const tokens = source.split(/\s+/).filter((token) => token.length > 0);
  const textTokens = [];
  const tagTokens = [];
  const systemTokens = [];
  for (const token of tokens) {
    if (isTagToken(token)) {
      tagTokens.push(token.slice(1));
    } else if (isSystemFilterToken(token) && getSystemFilter(token.slice(1))) {
      systemTokens.push(token.slice(1));
    } else {
      textTokens.push(token);
    }
  }
  const tags = normalizeSelectedTagTokens(tagTokens);
  const systemFilters = normalizeSystemFilterTokens(systemTokens);
  return {
    text: textTokens.join(' ').trim(),
    tags,
    systemFilters,
    raw: source,
  };
}

/***
 * MARK: buildSearchQuery
 * @description Reconstructs a search query string from a text portion, a list
 *   of tag names and a list of system-filter ids.
 * @example buildSearchQuery('auth', ['Dev'], ['failed']) => 'auth #Dev !failed'
 * @param {string} text - Search text.
 * @param {Array<string>} [tags=[]] - Stage tags.
 * @param {Array<string>} [systemFilters=[]] - System filters.
 * @returns {string} Combined query string.
 ***/
export function buildSearchQuery(text, tags = [], systemFilters = []) {
  let textPart;
  if (typeof text === 'string') textPart = text.trim();
  else if (text == null) textPart = '';
  else textPart = String(text).trim();
  const tagPart = (Array.isArray(tags) ? tags : [])
    .map((tag) => {
      if (typeof tag === 'string') return tag.trim();
      return '';
    })
    .filter(Boolean)
    .reduce(
      (acc, tag) => {
        if (!acc.seen.has(tag.toLowerCase())) {
          acc.seen.add(tag.toLowerCase());
          acc.tags.push(tag);
        }
        return acc;
      },
      { tags: [], seen: new Set() },
    )
    .tags.map((tag) => `#${tag}`)
    .join(' ');
  const systemPart = normalizeSystemFilterTokens(Array.isArray(systemFilters) ? systemFilters : [])
    .map((id) => `!${id}`)
    .join(' ');
  return [textPart, tagPart, systemPart].filter(Boolean).join(' ').trim();
}

/***
 * MARK: extractPrefixedTokenAtCursor
 * @description Shared `#`/`!` token extraction at a cursor position.
 * @example extractPrefixedTokenAtCursor('hello !fail', 10, '!') => '!fail'
 * @param {string} raw - Input string.
 * @param {number} cursorPosition - Position of the cursor.
 * @param {string} prefix - Token prefix character.
 * @returns {string|null} Extracted token or null.
 ***/
export function extractPrefixedTokenAtCursor(raw, cursorPosition, prefix) {
  let source;
  if (typeof raw === 'string') source = raw;
  else if (raw == null) source = '';
  else source = String(raw);
  if (typeof cursorPosition !== 'number' || cursorPosition < 0 || cursorPosition > source.length) {
    return null;
  }
  const before = source.slice(0, cursorPosition);
  const after = source.slice(cursorPosition);

  const trailingRun = before.match(/\S*$/);
  const tokenStart = before.length - (trailingRun ? trailingRun[0].length : 0);
  const trailingMatch = after.match(/^\S*/);
  const trailingLen = trailingMatch ? trailingMatch[0].length : 0;
  const tokenEnd = cursorPosition + trailingLen;
  const token = source.slice(tokenStart, tokenEnd);

  if (!token.startsWith(prefix)) return null;
  // Allow a lone prefix char while typing.
  return token;
}

/***
 * MARK: extractTagTokenAtCursor
 * @description Extracts `#` tag token at cursor position.
 * @example extractTagTokenAtCursor('test #tag', 8) => '#tag'
 * @param {string} raw - Input string.
 * @param {number} cursorPosition - Position of the cursor.
 * @returns {string|null} Extracted tag token or null.
 ***/
export function extractTagTokenAtCursor(raw, cursorPosition) {
  return extractPrefixedTokenAtCursor(raw, cursorPosition, '#');
}

/***
 * MARK: extractSystemTokenAtCursor
 * @description Extracts `!` system filter token at cursor position.
 * @example extractSystemTokenAtCursor('test !fail', 9) => '!fail'
 * @param {string} raw - Input string.
 * @param {number} cursorPosition - Position of the cursor.
 * @returns {string|null} Extracted system filter token or null.
 ***/
export function extractSystemTokenAtCursor(raw, cursorPosition) {
  return extractPrefixedTokenAtCursor(raw, cursorPosition, '!');
}
