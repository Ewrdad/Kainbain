import { SYSTEM_FILTERS } from './registry';

/***
 * MARK: getSystemFilters
 * @description Returns a shallow copy of all registered system filters, so
 *   callers can iterate a stable snapshot without aliasing the live registry.
 * @example getSystemFilters().map((f) => f.id) => ['failed', 'human', 'running', 'tasked']
 * @returns {Array<object>}
 ***/
export function getSystemFilters() {
  return SYSTEM_FILTERS.slice();
}
