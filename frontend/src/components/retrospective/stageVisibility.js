import { normalizeStageType } from '../stageTypes';

/***
 * MARK: stageVisibility
 * @description Pure helpers behind the retrospective stage-type filter: which
 *   stage types the loaded tasks use, which duration bars stay visible, and
 *   how the hidden set round-trips through localStorage (`usePersistentState`
 *   in the panel) and the shareable `?show=` URL parameter.
 ***/

/***
 * MARK: STAGE_VISIBILITY_STORAGE_KEY
 * @description localStorage key for the hidden stage-type list (JSON array of
 *   normalized type names). A hidden list (not a visible list) so stage types
 *   that appear later — new workflow stages, fresh projects — stay visible
 *   instead of silently hiding.
 ***/
export const STAGE_VISIBILITY_STORAGE_KEY = 'kainbain:retrospective:hiddenStageTypes';

/***
 * MARK: STAGE_VISIBILITY_QUERY_PARAM
 * @description URL parameter carrying the visible stage types for shareable
 *   links (`#/retrospective?show=ci,merge`). Lists visible types (not hidden
 *   ones) so a link reads as what the recipient will see.
 ***/
export const STAGE_VISIBILITY_QUERY_PARAM = 'show';

/***
 * MARK: CANONICAL_TYPE_ORDER
 * @description Display order for the stage-type toggles, matching the
 *   authoritative `STAGE_TYPES` order (agent, human, ci, merge).
 ***/
const CANONICAL_TYPE_ORDER = ['agent', 'human', 'ci', 'merge'];

/***
 * MARK: SHOW_TOKEN_ALIASES
 * @description Accepted `?show=` tokens beyond the canonical four: legacy
 *   stage types (`review`, `script`, `deploy`, `custom`) plus `approval`, the
 *   plain word for a human approval checkpoint.
 * @example SHOW_TOKEN_ALIASES.get('review') => 'human'
 ***/
const SHOW_TOKEN_ALIASES = new Map([
  ['agent', 'agent'],
  ['human', 'human'],
  ['review', 'human'],
  ['approval', 'human'],
  ['ci', 'ci'],
  ['script', 'ci'],
  ['deploy', 'ci'],
  ['merge', 'merge'],
  ['custom', 'agent'],
]);

/***
 * MARK: isStageVisibilityToggleEnabled
 * @description Feature flag for the stage-type filter
 *   (`VITE_ENABLE_STAGE_VISIBILITY_TOGGLE`). Enabled by default; set the
 *   variable to `0` or `false` to hide the toggles and show every stage type.
 * @example isStageVisibilityToggleEnabled() => true
 * @returns {boolean} False only when the flag explicitly disables the filter.
 ***/
export function isStageVisibilityToggleEnabled() {
  try {
    const flag = import.meta.env?.VITE_ENABLE_STAGE_VISIBILITY_TOGGLE;
    if (flag === undefined || flag === null || flag === '') return true;
    const text = String(flag).trim().toLowerCase();
    return text !== '0' && text !== 'false' && text !== 'off';
  } catch {
    return true;
  }
}

/***
 * MARK: sampleStageType
 * @description The normalized stage type of one duration sample. Samples
 *   without a type (older API responses, hand-built fixtures) read as
 *   `agent` — the same fail-visible default as `normalizeStageType`.
 * @example sampleStageType({ stageName: 'Verify', stageType: 'CI' }) => 'ci'
 * @param {Object} [sample] - One `stageDurationSamples` entry.
 * @returns {string} The canonical type ('agent' | 'human' | 'ci' | 'merge' — a
 *   deploy is a `ci` stage, so it never appears as its own type).
 ***/
export function sampleStageType(sample) {
  return normalizeStageType(sample?.stageType);
}

/***
 * MARK: listStageTypes
 * @description Distinct stage types used across the loaded tasks, in canonical
 *   display order. Drives the toggle list — only types with durations appear.
 * @example listStageTypes(tasks) => ['agent', 'ci']
 * @param {Array<Object>} [tasks=[]] - Duration-enriched task summaries.
 * @returns {Array<string>} Canonical type names in display order.
 ***/
export function listStageTypes(tasks = []) {
  const present = new Set();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const samples = Array.isArray(task?.stageDurationSamples) ? task.stageDurationSamples : [];
    for (const sample of samples) present.add(sampleStageType(sample));
  }
  return CANONICAL_TYPE_ORDER.filter((type) => present.has(type));
}

/***
 * MARK: normalizeHiddenList
 * @description Sanitizes a stored hidden-type list: keeps known tokens
 *   (canonical plus legacy/approval aliases), drops anything else, dedupes.
 *   Unknown strings must never fall through to `agent` — a corrupt entry
 *   hiding the agent stages would be worse than ignoring it.
 * @example normalizeHiddenList(['CI', 'bogus', 'review']) => ['ci', 'human']
 * @param {any} [value] - Raw stored value.
 * @returns {Array<string>} Canonical hidden type names.
 ***/
export function normalizeHiddenList(value) {
  if (!Array.isArray(value)) return [];
  const hidden = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const key = entry.trim().toLowerCase();
    if (!SHOW_TOKEN_ALIASES.has(key)) continue;
    const normalized = SHOW_TOKEN_ALIASES.get(key);
    if (!hidden.includes(normalized)) hidden.push(normalized);
  }
  return hidden;
}

/***
 * MARK: filterStageSamples
 * @description Keeps the duration samples whose stage type is not hidden.
 * @example filterStageSamples(samples, new Set(['human'])) => [...]
 * @param {Array<Object>} [samples=[]] - One task's `stageDurationSamples`.
 * @param {Set<string>|Array<string>} [hiddenTypes] - Hidden canonical types.
 * @returns {Array<Object>} Visible samples (new array, input untouched).
 ***/
export function filterStageSamples(samples = [], hiddenTypes) {
  const list = Array.isArray(samples) ? samples : [];
  const hidden =
    hiddenTypes instanceof Set ? hiddenTypes : new Set(normalizeHiddenList(hiddenTypes));
  if (hidden.size === 0) return [...list];
  return list.filter((sample) => !hidden.has(sampleStageType(sample)));
}

/***
 * MARK: parseShowParam
 * @description Parses a query string for the `?show=` parameter. Three
 *   outcomes: absent (use stored preferences), present with valid tokens
 *   (show exactly those), or present-but-empty (`?show=`, hide everything —
 *   the state the panel writes when every type is toggled off). A present
 *   parameter with only unknown tokens is treated as absent so a typo can
 *   never blank the page.
 * @example parseShowParam('?show=ci,merge') => { present: true, visible: ['ci', 'merge'] }
 * @example parseShowParam('?show=deploy') => { present: true, visible: ['ci'] }
 * @param {string} [raw=''] - Query string (`?show=ci`) or full URL/hash.
 * @returns {{present: boolean, visible: Array<string>}} The parsed visibility.
 ***/
export function parseShowParam(raw = '') {
  if (typeof raw !== 'string' || raw.length === 0) return { present: false, visible: [] };
  const queryStart = raw.indexOf('?');
  if (queryStart === -1) return { present: false, visible: [] };
  const query = raw.slice(queryStart + 1).split('#')[0];
  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return { present: false, visible: [] };
  }
  if (!params.has(STAGE_VISIBILITY_QUERY_PARAM)) return { present: false, visible: [] };
  const rawValue = params.get(STAGE_VISIBILITY_QUERY_PARAM) ?? '';
  if (rawValue.trim() === '') return { present: true, visible: [] };
  const visible = [];
  for (const token of rawValue.split(',')) {
    const key = token.trim().toLowerCase();
    if (!SHOW_TOKEN_ALIASES.has(key)) continue;
    const normalized = SHOW_TOKEN_ALIASES.get(key);
    if (!visible.includes(normalized)) visible.push(normalized);
  }
  if (visible.length === 0) return { present: false, visible: [] };
  return { present: true, visible };
}

/***
 * MARK: currentShowParam
 * @description Reads the live `?show=` value. HashRouter URLs carry the query
 *   inside the hash (`#/retrospective?show=ci`); plain and future
 *   BrowserRouter URLs carry it in `.search`. The hash wins when both exist.
 * @example currentShowParam() => { present: true, visible: ['ci'] }
 * @param {Object} [location] - Location override (tests); defaults to window.location.
 * @returns {{present: boolean, visible: Array<string>}} The parsed visibility.
 ***/
export function currentShowParam(location) {
  let loc = location;
  if (!loc) {
    try {
      if (typeof window === 'undefined') return { present: false, visible: [] };
      loc = window.location;
    } catch {
      return { present: false, visible: [] };
    }
  }
  const hash = typeof loc.hash === 'string' ? loc.hash : '';
  const search = typeof loc.search === 'string' ? loc.search : '';
  const fromHash = parseShowParam(hash.includes('?') ? hash.slice(hash.indexOf('?')) : '');
  if (fromHash.present) return fromHash;
  return parseShowParam(search);
}

/***
 * MARK: writeShowParam
 * @description Syncs the toggle state into the URL with `history.replaceState`
 *   (no reload, no navigation event) so the address bar stays a shareable
 *   link. All types visible removes the parameter; otherwise it lists the
 *   visible types. Best-effort: storage quirks and missing history APIs are
 *   swallowed — the toggles themselves never depend on the URL write.
 * @example writeShowParam(['human'], ['agent', 'human', 'ci']) // ?show=agent,ci
 * @param {Array<string>|Set<string>} [hiddenTypes=[]] - Hidden canonical types.
 * @param {Array<string>} [knownTypes=[]] - Types currently on the page.
 ***/
export function writeShowParam(hiddenTypes = [], knownTypes = []) {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const hidden =
      hiddenTypes instanceof Set ? hiddenTypes : new Set(normalizeHiddenList(hiddenTypes));
    const known = Array.isArray(knownTypes) ? knownTypes : [];
    const visible = known.filter((type) => !hidden.has(type));
    const { pathname = '/', search = '', hash = '' } = window.location;
    // HashRouter app: the query lives inside the hash (`#/path?show=...`).
    // Without a hash the query lives in `.search` (tests, future BrowserRouter).
    if (hash) {
      const hashPath = hash.split('?')[0];
      const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const params = new URLSearchParams(hashQuery);
      if (hidden.size === 0) params.delete(STAGE_VISIBILITY_QUERY_PARAM);
      else params.set(STAGE_VISIBILITY_QUERY_PARAM, visible.join(','));
      const nextQuery = params.toString();
      window.history.replaceState(
        null,
        '',
        `${pathname}${search}${hashPath}${nextQuery ? `?${nextQuery}` : ''}`,
      );
    } else {
      const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      if (hidden.size === 0) params.delete(STAGE_VISIBILITY_QUERY_PARAM);
      else params.set(STAGE_VISIBILITY_QUERY_PARAM, visible.join(','));
      const nextQuery = params.toString();
      window.history.replaceState(null, '', `${pathname}${nextQuery ? `?${nextQuery}` : ''}`);
    }
  } catch {
    // Share-link sync is best-effort; the toggles work without it.
  }
}
