/***
 * MARK: stageTags
 * @description Shared stage tags normalization and matching helpers.
 *   Tags allow workflow stages to be categorized (e.g. 'PO', 'Dev', 'Review')
 *   and filtered on the board.
 ***/

export const STAGE_TAG_MAX_COUNT = 12;
export const STAGE_TAG_MAX_LENGTH = 24;

/***
 * MARK: normalizeStageTag
 * @description Normalizes a single tag: trims whitespace, collapses inner
 *   consecutive spaces, enforces the length constraint. Returns null if empty
 *   or invalid. Commas are rejected — they are the list separator in the
 *   `?tags=a,b` share-link format, so a tag containing one could never
 *   round-trip through a shared URL.
 * @example normalizeStageTag('  Front  End  ') => 'Front End'
 * @param {any} value
 * @returns {string|null}
 ***/
export function normalizeStageTag(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replace(/\s+/g, ' ');
  if (!tag || tag.includes(',') || tag.length > STAGE_TAG_MAX_LENGTH) return null;
  return tag;
}

/***
 * MARK: normalizeStageTags
 * @description Normalizes a stage's tags list.
 *   Absent/null returns undefined so legacy stage objects without tags remain byte-identical.
 *   Arrays and comma-separated strings are accepted.
 *   Deduplicates case-insensitively while preserving the casing of the first occurrence.
 *   Caps at STAGE_TAG_MAX_COUNT entries.
 * @example normalizeStageTags(['Dev', 'dev', 'QA']) => ['Dev', 'QA']
 * @param {Array|string|null|undefined} value
 * @returns {Array<string>|undefined}
 ***/
export function normalizeStageTags(value) {
  if (value === undefined || value === null) return undefined;
  let input;
  if (Array.isArray(value)) {
    input = value;
  } else if (value instanceof Set) {
    input = Array.from(value);
  } else {
    input = String(value).split(/,/);
  }
  const result = [];
  const seen = new Set();
  for (const entry of input) {
    const tag = normalizeStageTag(entry);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= STAGE_TAG_MAX_COUNT) break;
  }
  return result;
}

/***
 * MARK: stageTagKey
 * @description Computes the lookup key for tag comparison (trimmed, lowercased).
 * @param {any} tag
 * @returns {string}
 ***/
export function stageTagKey(tag) {
  return typeof tag === 'string' ? tag.trim().toLowerCase() : '';
}

/***
 * MARK: stageHasTag
 * @description Case-insensitive check if a stage carries a tag.
 * @param {Object} stage
 * @param {string} tag
 * @returns {boolean}
 ***/
export function stageHasTag(stage, tag) {
  const targetKey = stageTagKey(tag);
  if (!targetKey) return false;
  const tags = Array.isArray(stage?.tags) ? stage.tags : [];
  return tags.some((t) => stageTagKey(t) === targetKey);
}

/***
 * MARK: stageMatchesTags
 * @description Checks if a stage satisfies the selected tags filter.
 *   If no tags are selected (or selection is empty), all stages match.
 *   If mode === 'all', stage must have all selected tags.
 *   Otherwise ('any'), stage must have at least one selected tag.
 * @param {Object} stage
 * @param {Array<string>|Set<string>|string} selectedTags
 * @param {'any'|'all'} [mode='any']
 * @returns {boolean}
 ***/
export function stageMatchesTags(stage, selectedTags, mode = 'any') {
  let tagsList = [];
  if (selectedTags instanceof Set) {
    tagsList = Array.from(selectedTags);
  } else if (Array.isArray(selectedTags)) {
    tagsList = selectedTags;
  } else if (typeof selectedTags === 'string' && selectedTags.trim()) {
    tagsList = selectedTags.split(',');
  }
  const cleanTokens = tagsList.map(stageTagKey).filter(Boolean);
  if (cleanTokens.length === 0) return true;

  if (mode === 'all') {
    return cleanTokens.every((token) => stageHasTag(stage, token));
  }
  return cleanTokens.some((token) => stageHasTag(stage, token));
}

/***
 * MARK: availableStageTags
 * @description Extracts unique tags across an array of stages,
 *   preserving first-seen casing and sorting alphabetically (case-insensitively).
 * @param {Array<Object>} stages
 * @returns {Array<string>}
 ***/
export function availableStageTags(stages = []) {
  if (!Array.isArray(stages)) return [];
  const seen = new Map();
  for (const stage of stages) {
    const tags = Array.isArray(stage?.tags) ? stage.tags : [];
    for (const tag of tags) {
      const normalized = normalizeStageTag(tag);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, normalized);
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}
