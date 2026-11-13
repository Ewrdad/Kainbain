import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: isColumnSystemFilter
 * @description Whether a system filter id names a column-scoping filter —
 *   one whose registry entry carries `hidesColumns: true` (`!running`,
 *   `!tasked`). Only those filters hide board columns; task-level filters
 *   (`!failed`, `!human`) and unknown ids never do.
 * @example isColumnSystemFilter('running') => true
 * @param {string} id - Filter identifier.
 * @returns {boolean}
 ***/
export function isColumnSystemFilter(id) {
  return findSystemFilter(id)?.hidesColumns === true;
}
