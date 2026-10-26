/***
 * MARK: normalizeSystemFilterTokens
 * @description Normalizes and deduplicates a collection of system filter
 *   tokens (case-insensitive, first casing wins). Accepts an array, a Set,
 *   or a whitespace/comma-delimited string; strips leading `!` characters
 *   and drops empties. Non-list input degrades to an empty list.
 * @example normalizeSystemFilterTokens(['!failed', 'failed']) => ['failed']
 * @param {any} value
 * @returns {Array<string>}
 ***/
export function normalizeSystemFilterTokens(value) {
  if (value == null) return [];
  let list;
  if (value instanceof Set) list = Array.from(value);
  else if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') list = value.split(/[\s,]+/);
  else return [];
  const result = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const candidate = item.trim().replace(/^!+/, '');
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
