import { isSystemFilterToken } from './isSystemFilterToken';
import { normalizeSystemFilterTokens } from './normalizeSystemFilterTokens';
import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: parseSystemFilters
 * @description Extracts and validates registered system filter tokens from a
 *   string or array. Only ids present in the registry survive — unknown
 *   `!tokens` are dropped here because the query parser keeps them as plain
 *   text (they are never silently wiped from the user's query).
 * @example parseSystemFilters('!failed !unknown') => ['failed']
 * @param {any} value
 * @returns {Array<string>}
 ***/
export function parseSystemFilters(value) {
  if (value == null) return [];
  let candidates;
  if (typeof value === 'string') {
    candidates = value
      .split(/\s+/)
      .filter(isSystemFilterToken)
      .map((tok) => tok.slice(1));
  } else {
    candidates = normalizeSystemFilterTokens(value);
  }
  const normalized = normalizeSystemFilterTokens(candidates);
  return normalized.filter((id) => Boolean(findSystemFilter(id)));
}
