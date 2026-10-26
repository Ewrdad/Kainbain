import { SYSTEM_FILTERS } from './registry';

/***
 * MARK: findSystemFilter
 * @description Looks up a registered system filter descriptor by id,
 *   case-insensitively. Returns undefined for unknown or malformed ids.
 * @example findSystemFilter('FAILED')?.id => 'failed'
 * @param {string} id - Filter identifier.
 * @returns {object|undefined}
 ***/
export function findSystemFilter(id) {
  if (typeof id !== 'string') return undefined;
  const key = id.trim().toLowerCase();
  if (!key) return undefined;
  return SYSTEM_FILTERS.find((entry) => String(entry.id).trim().toLowerCase() === key);
}
