import { findSystemFilter } from './findSystemFilter';

/***
 * MARK: systemFilterMatches
 * @description Checks whether a task matches the specified registered system
 *   filter by running its `match` predicate. Unknown ids and throwing
 *   predicates degrade to false so a bad filter can never wipe the board.
 *   The optional `ctx` (`{ engineState, isAgentRunning }`) reaches
 *   liveness-aware predicates such as `!running`; existing two-argument
 *   predicates ignore it.
 * @example systemFilterMatches('failed', { status: 'failed' }, []) => true
 * @param {string} id - System filter id.
 * @param {object} task - Task object.
 * @param {Array<object>} stages - Workflow stages.
 * @param {object} [ctx] - Filter context: `{ engineState, isAgentRunning }`.
 * @returns {boolean}
 ***/
export function systemFilterMatches(id, task, stages, ctx) {
  if (task == null) return false;
  const entry = findSystemFilter(id);
  if (!entry) return false;
  try {
    return Boolean(entry.match(task, Array.isArray(stages) ? stages : stages || [], ctx));
  } catch {
    return false;
  }
}
