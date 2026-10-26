// Domain: `!` system-native search filters (barrel over systemFilters modules).
/***
 * MARK: systemFilters barrel
 * @description Extendable registry of "system native" (built-in) search
 *   filters invoked with a `!` prefix (e.g. `!failed`, `!human`), parallel to
 *   `#` stage-tag tokens. Adding a future native filter is one entry in
 *   `registry.js` (or one `registerSystemFilter` call) plus tests — the
 *   parser, suggestions, chips, and board filtering all read this registry.
 * @example parseSystemFilters('!failed') => ['failed']
 ***/

export { SYSTEM_FILTERS, SYSTEM_FILTER_IDS } from './registry';
export { findSystemFilter } from './findSystemFilter';
export { findSystemFilter as getSystemFilter } from './findSystemFilter';
export { registerSystemFilter } from './registerSystemFilter';
export { getSystemFilters } from './getSystemFilters';
export { isSystemFilterToken } from './isSystemFilterToken';
export { normalizeSystemFilterTokens } from './normalizeSystemFilterTokens';
export { parseSystemFilters } from './parseSystemFilters';
export { systemFilterMatches } from './systemFilterMatches';
export { isSystemFilterDraftToken } from './isSystemFilterDraftToken';
export { isFailedTask } from './isFailedTask';
export { isHumanTask } from './isHumanTask';
