import { SYSTEM_FILTERS, SYSTEM_FILTER_IDS } from './registry';
import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: registerSystemFilter
 * @description Registers an extendable system filter into the registry.
 *   Adding a future native filter is one call (or one default entry in
 *   `registry.js`) — parser, suggestions, chips, and board filtering all
 *   read the registry, so no other code changes. Throws on duplicate ids
 *   and on a missing/non-function `match` predicate.
 * @example registerSystemFilter({ id: 'custom', match: () => true })
 * @param {object} filter - System filter descriptor.
 * @returns {object} The registered filter entry.
 ***/
export function registerSystemFilter(filter) {
  if (!filter || typeof filter !== 'object') {
    throw new Error('systemFilter must be an object');
  }
  const id = typeof filter.id === 'string' ? filter.id.trim() : '';
  if (!id) throw new Error('id is required');
  if (findSystemFilter(id)) throw new Error('duplicate system filter id');
  if (typeof filter.match !== 'function') {
    throw new Error('match must be a function');
  }
  const entry = {
    id,
    label: typeof filter.label === 'string' && filter.label.trim() ? filter.label.trim() : id,
    description: typeof filter.description === 'string' ? filter.description : '',
    match: filter.match,
  };
  SYSTEM_FILTERS.push(entry);
  if (Array.isArray(SYSTEM_FILTER_IDS) && !SYSTEM_FILTER_IDS.includes(entry.id)) {
    SYSTEM_FILTER_IDS.push(entry.id);
  }
  return entry;
}
