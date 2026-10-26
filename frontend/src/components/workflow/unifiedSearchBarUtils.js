/***
 * MARK: unifiedSearchBarUtils
 * @description Pure helpers behind the UnifiedSearchBar: display-text
 *   assembly, in-progress `#tag` draft detection, tag-option normalization,
 *   and paint-timing for focus/caret sync. No React imports, no side effects
 *   — independently unit-testable and reusable by any component that renders
 *   the same merged search field.
 *
 *   Failure contract: every helper is total. Non-string, null, undefined, or
 *   otherwise malformed inputs degrade to an empty result instead of throwing,
 *   so a bad prop can never crash the toolbar that renders this bar.
 * @example buildDisplayText('auth', '#De', false) // 'auth #De'
 ***/

import { extractTagTokenAtCursor, extractSystemTokenAtCursor } from './searchQueryParser';

// Shared frozen empty list: normalizeTagOptions returns this exact reference
// for every non-array input so memoized consumers keep a stable dependency.
const NO_TAG_OPTIONS = Object.freeze([]);

/***
 * MARK: getTagLabel
 * @description Reads the display label off a tag option. Options are either
 *   plain strings or `{ value, label }` objects; anything else (null, numbers,
 *   objects without either field) yields an empty label and is filtered out
 *   by the caller.
 * @param {string|{value?: string, label?: string}|any} option
 * @returns {string}
 * @example getTagLabel({ value: 'Dev', label: 'Dev' }) // 'Dev'
 * @example getTagLabel('PO') // 'PO'
 * @example getTagLabel(null) // ''
 ***/
/***
 * MARK: safeString
 * @description Coerces any value to a string without throwing. Mirrors
 *   normalizeSearchValue's intent for the tiny internal spots that must not
 *   ever propagate an exception into the toolbar render path.
 ***/
function safeString(value) {
  try {
    return String(value);
  } catch {
    return '';
  }
}

export function getTagLabel(option) {
  if (option == null) return '';
  if (typeof option === 'string') return option;
  // Prefer an explicit label, falling back to value even when the label is
  // the empty string. Coerce defensively so a symbol (or similar exotic)
  // can never throw inside the toolbar.
  const label =
    option.label != null ? safeString(option.label) : '';
  const value =
    option.value != null ? safeString(option.value) : '';
  return label || value;
}

/***
 * MARK: normalizeTagOptions
 * @description Coerces the `tagOptions` prop into a real array. Arrays pass
 *   through by reference (stable for memoization); every non-array value
 *   (null, undefined, a string, an object) becomes the shared empty list, so
 *   the suggestion dropdown simply never opens instead of crashing.
 * @param {Array<string|{value?: string, label?: string}>|any} tagOptions
 * @returns {Array<string|{value?: string, label?: string}>}
 * @example normalizeTagOptions([{ value: 'Dev' }]) // [{ value: 'Dev' }]
 * @example normalizeTagOptions(null) // []
 ***/
export function normalizeTagOptions(tagOptions) {
  return Array.isArray(tagOptions) ? tagOptions : NO_TAG_OPTIONS;
}

/***
 * MARK: normalizeSearchValue
 * @description Coerces the `value` prop (the raw query string) into a string.
 *   Strings pass through untouched; null/undefined become an empty query;
 *   anything else becomes its string form (mirroring parseSearchQuery, so the
 *   rendered field always matches what the parser would show).
 * @param {string|any} value
 * @returns {string}
 * @example normalizeSearchValue('auth #Dev') // 'auth #Dev'
 * @example normalizeSearchValue(null) // ''
 ***/
export function normalizeSearchValue(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return String(value);
  } catch {
    return '';
  }
}

/***
 * MARK: dedupeTagLabels
 * @description Deduplicates tag labels case-insensitively, preserving the
 *   first-seen casing and order. Prevents two things at once: the suggestion
 *   dropdown offering `Dev` and `dev` as separate entries, and duplicate
 *   React keys when both render as options.
 * @param {Array<string>|any} labels
 * @returns {Array<string>}
 * @example dedupeTagLabels(['Dev', 'dev', 'PO']) // ['Dev', 'PO']
 ***/
export function dedupeTagLabels(labels) {
  const list = Array.isArray(labels) ? labels : [];
  const seen = new Set();
  const result = [];
  for (const label of list) {
    if (typeof label !== 'string' || !label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

/***
 * MARK: scheduleAfterPaint
 * @description Runs a callback after the next paint so focus/caret sync sees
 *   the committed input value. Falls back to a synchronous call when
 *   requestAnimationFrame is unavailable (older mocks/SSR) — the caret sync
 *   then simply runs immediately, which is always safe.
 * @param {Function} fn
 * @returns {void}
 * @example scheduleAfterPaint(() => inputRef.current?.focus())
 ***/
export function scheduleAfterPaint(fn) {
  if (typeof fn !== 'function') return;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(fn);
    return;
  }
  fn();
}

/***
 * MARK: draftTokenSpan
 * @description Same token detection as `extractTagTokenAtCursor`, but also
 *   returning the token boundaries so callers can tell the in-progress token
 *   under the caret apart from already-typed tokens elsewhere.
 * @param {string|any} text
 * @param {number|null} cursorPosition
 * @returns {{ token: string, start: number, end: number }|null}
 * @example draftTokenSpan('auth #De', 8) // { token: '#De', start: 5, end: 8 }
 ***/
export function draftTokenSpan(text, cursorPosition) {
  if (typeof text !== 'string') return null;
  if (typeof cursorPosition !== 'number' || !Number.isFinite(cursorPosition)) return null;
  let extracted = extractTagTokenAtCursor(text, cursorPosition);
  if (extracted === null) extracted = extractSystemTokenAtCursor(text, cursorPosition);
  if (extracted === null) return null;
  const source = text;
  const before = source.slice(0, cursorPosition);
  const trailingRun = before.match(/\S*$/);
  const start = before.length - (trailingRun ? trailingRun[0].length : 0);
  const after = source.slice(cursorPosition);
  const trailingMatch = after.match(/^\S*/);
  const end = cursorPosition + (trailingMatch ? trailingMatch[0].length : 0);
  return { token: extracted, start, end };
}

/***
 * MARK: isCommittableDraft
 * @description True when a draft `#token` names a real tag: at least one
 *   character after the `#` and no second `#` (`#` alone and `##x` stay text).
 * @param {string|any} candidate
 * @returns {boolean}
 * @example isCommittableDraft('#Dev') // true
 * @example isCommittableDraft('#') // false
 ***/
export function isCommittableDraft(candidate) {
  if (typeof candidate !== 'string' || candidate.length < 2) return false;
  if (candidate.charAt(0) !== '#') return false;
  if (candidate.charAt(1) === '#') return false;
  return true;
}

/***
 * MARK: buildDisplayText
 * @description Combines the committed free text with any in-progress `#tag`
 *   draft (or a single trailing word separator) so the field shows exactly
 *   what the user is currently typing without duplicating committed tags.
 * @param {string|any} text
 * @param {string|any} draft
 * @param {boolean} trailingGap
 * @returns {string}
 * @example buildDisplayText('auth', '#De', false) // 'auth #De'
 * @example buildDisplayText('auth', '', true) // 'auth '
 ***/
export function buildDisplayText(text, draft, trailingGap) {
  const safeText = typeof text === 'string' ? text : '';
  const safeDraft = typeof draft === 'string' ? draft : '';
  if (trailingGap && !safeDraft && safeText) return `${safeText} `;
  if (safeDraft) return safeText ? `${safeText} ${safeDraft}` : safeDraft;
  return safeText;
}
