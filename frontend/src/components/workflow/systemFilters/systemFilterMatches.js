import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: systemFilterMatches
 * @description Checks whether a task matches the specified registered system
 *   filter by running its `match` predicate. Unknown ids and throwing
 *   predicates degrade to false so a bad filter can never wipe the board.
 * @example systemFilterMatches('failed', { status: 'failed' }, []) => true
 * @param {string} id - System filter id.
 * @param {object} task - Task object.
 * @param {Array<object>} stages - Workflow stages.
 * @returns {boolean}
 ***/
export function systemFilterMatches(id, task, stages) {
  if (task == null) return false;
  const entry = findSystemFilter(id);
  if (!entry) return false;
  try {
    return Boolean(entry.match(task, Array.isArray(stages) ? stages : stages || []));
  } catch {
    return false;
  }
}
