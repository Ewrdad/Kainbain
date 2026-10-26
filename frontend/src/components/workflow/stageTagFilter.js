import {
  availableStageTags,
  normalizeStageTag,
  stageMatchesTags,
} from '../../../../shared/stageTags.js';

/***
 * MARK: stageTagFilter
 * @description Pure selectors and URL query parameter helpers for filtering
 *   workflow stages by custom tags and collapsing non-matching runs.
 ***/

export { availableStageTags, stageMatchesTags };

export const STAGE_TAG_FILTER_PARAM = 'tags';
export const STAGE_TAG_FILTER_MODE_PARAM = 'tagMode';
export const STAGE_TAG_FILTER_STORAGE_KEY = 'kainbain:board:stageTagFilter';
export const STAGE_TAG_FILTER_MODE_STORAGE_KEY = 'kainbain:board:stageTagFilterMode';

/***
 * MARK: normalizeSelectedTagTokens
 * @description Sanitizes a selection of tag tokens from string, array, Set, or comma list.
 *   Trims whitespace, drops empties, and dedupes case-insensitively while preserving first casing.
 * @example normalizeSelectedTagTokens(['Dev', 'dev', ' PO ']) => ['Dev', 'PO']
 * @param {Array<string>|Set<string>|string|null|undefined} value
 * @returns {Array<string>}
 ***/
export function normalizeSelectedTagTokens(value) {
  if (!value) return [];
  const list =
    value instanceof Set
      ? Array.from(value)
      : Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(',')
          : [];
  const result = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

/***
 * MARK: groupStagesByTagFilter
 * @description Partitions stages into visible stages and collapsed runs.
 *   When no tags are selected, every stage is emitted as a single `{ kind: 'stage', stage }`.
 *   When tags are selected, matching stages are emitted as `{ kind: 'stage', stage }`,
 *   and contiguous sequences of non-matching stages are coalesced into
 *   `{ kind: 'collapsed', id, stages: [...] }` entries.
 * @example groupStagesByTagFilter(stages, ['PO'], 'any')
 * @param {Array<Object>} stages - Pipeline stages.
 * @param {Array<string>|Set<string>|string} [selected=[]] - Selected filter tags.
 * @param {'any'|'all'} [mode='any'] - Filter match mode.
 * @returns {Array<{ kind: 'stage', stage: Object } | { kind: 'collapsed', id: string, stages: Array<Object> }>}
 ***/
export function groupStagesByTagFilter(stages = [], selected = [], mode = 'any') {
  if (!Array.isArray(stages) || stages.length === 0) return [];
  const normalizedSelected = normalizeSelectedTagTokens(selected);
  if (normalizedSelected.length === 0) {
    return stages.map((stage) => ({ kind: 'stage', stage }));
  }

  const entries = [];
  let currentCollapsed = [];

  for (const stage of stages) {
    const matches = stageMatchesTags(stage, normalizedSelected, mode);
    if (matches) {
      if (currentCollapsed.length > 0) {
        entries.push({
          kind: 'collapsed',
          id: `collapsed-${currentCollapsed.map((s) => s.id).join('-')}`,
          stages: currentCollapsed,
        });
        currentCollapsed = [];
      }
      entries.push({ kind: 'stage', stage });
    } else {
      currentCollapsed.push(stage);
    }
  }

  if (currentCollapsed.length > 0) {
    entries.push({
      kind: 'collapsed',
      id: `collapsed-${currentCollapsed.map((s) => s.id).join('-')}`,
      stages: currentCollapsed,
    });
  }

  return entries;
}

/***
 * MARK: parseStageTagFilterParam
 * @description Parses the query string for `tags` and optional `tagMode` parameters.
 *   Returns `{ present, selected, mode }`.
 *   A present but empty `?tags=` returns `{ present: true, selected: [], mode }`.
 * @example parseStageTagFilterParam('?tags=PO,Dev&tagMode=all')
 *   => { present: true, selected: ['PO', 'Dev'], mode: 'all' }
 * @param {string} [raw=''] - Raw URL or query string.
 * @returns {{ present: boolean, selected: Array<string>, mode?: 'any'|'all' }}
 ***/
export function parseStageTagFilterParam(raw = '') {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { present: false, selected: [], mode: undefined };
  }
  const queryStart = raw.indexOf('?');
  if (queryStart === -1) {
    return { present: false, selected: [], mode: undefined };
  }
  const query = raw.slice(queryStart + 1).split('#')[0];
  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return { present: false, selected: [], mode: undefined };
  }
  if (!params.has(STAGE_TAG_FILTER_PARAM)) {
    return { present: false, selected: [], mode: undefined };
  }
  const rawValue = params.get(STAGE_TAG_FILTER_PARAM) ?? '';
  const selected = normalizeSelectedTagTokens(rawValue);
  let mode;
  if (params.has(STAGE_TAG_FILTER_MODE_PARAM)) {
    const rawMode = (params.get(STAGE_TAG_FILTER_MODE_PARAM) || '').trim().toLowerCase();
    if (rawMode === 'all' || rawMode === 'any') {
      mode = rawMode;
    }
  }
  return { present: true, selected, mode };
}

/***
 * MARK: currentStageTagFilter
 * @description Reads active tag filter from location. HashRouter query in hash
 *   takes precedence over search query.
 * @param {Object} [location] - Location override (for tests); defaults to window.location.
 * @returns {{ present: boolean, selected: Array<string>, mode?: 'any'|'all' }}
 ***/
export function currentStageTagFilter(location) {
  let loc = location;
  if (!loc) {
    try {
      if (typeof window === 'undefined') return { present: false, selected: [], mode: undefined };
      loc = window.location;
    } catch {
      return { present: false, selected: [], mode: undefined };
    }
  }
  const hash = typeof loc.hash === 'string' ? loc.hash : '';
  const search = typeof loc.search === 'string' ? loc.search : '';
  const fromHash = parseStageTagFilterParam(
    hash.includes('?') ? hash.slice(hash.indexOf('?')) : '',
  );
  if (fromHash.present) return fromHash;
  return parseStageTagFilterParam(search);
}

/***
 * MARK: writeStageTagFilterParam
 * @description Synchronizes the selected tags and mode into the URL via `history.replaceState`.
 *   If no tags are selected, `tags` and `tagMode` query parameters are removed.
 *   If mode is default ('any'), `tagMode` is omitted to keep URLs clean.
 * @example writeStageTagFilterParam(['PO', 'Dev'], 'all')
 * @param {Array<string>|Set<string>} [selected=[]]
 * @param {'any'|'all'} [mode='any']
 * @param {Object} [options]
 * @param {'any'|'all'} [options.defaultMode='any']
 ***/
export function writeStageTagFilterParam(
  selected = [],
  mode = 'any',
  { defaultMode = 'any' } = {},
) {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const normalizedSelected = normalizeSelectedTagTokens(selected);
    const { pathname = '/', search = '', hash = '' } = window.location;
    const effectiveMode = mode === 'all' ? 'all' : 'any';
    const isDefaultMode = effectiveMode === defaultMode;

    const updateParams = (params) => {
      if (normalizedSelected.length === 0) {
        params.delete(STAGE_TAG_FILTER_PARAM);
        params.delete(STAGE_TAG_FILTER_MODE_PARAM);
      } else {
        params.set(STAGE_TAG_FILTER_PARAM, normalizedSelected.join(','));
        if (isDefaultMode) {
          params.delete(STAGE_TAG_FILTER_MODE_PARAM);
        } else {
          params.set(STAGE_TAG_FILTER_MODE_PARAM, effectiveMode);
        }
      }
    };

    if (hash) {
      const hashPath = hash.split('?')[0];
      const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const params = new URLSearchParams(hashQuery);
      updateParams(params);
      const nextQuery = params.toString();
      window.history.replaceState(
        null,
        '',
        `${pathname}${search}${hashPath}${nextQuery ? `?${nextQuery}` : ''}`,
      );
    } else {
      const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      updateParams(params);
      const nextQuery = params.toString();
      window.history.replaceState(null, '', `${pathname}${nextQuery ? `?${nextQuery}` : ''}`);
    }
  } catch {
    // Share-link sync is best-effort
  }
}
