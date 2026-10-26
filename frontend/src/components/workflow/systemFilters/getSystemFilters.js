import { SYSTEM_FILTERS } from './registry';

/***
 * MARK: getSystemFilters
 * @description Returns a shallow copy of all registered system filters, so
 *   callers can iterate a stable snapshot without aliasing the live registry.
 * @example getSystemFilters() => [{ id: 'failed', ... }, { id: 'human', ... }]
 * @returns {Array<object>}
 ***/
export function getSystemFilters() {
  return SYSTEM_FILTERS.slice();
}
