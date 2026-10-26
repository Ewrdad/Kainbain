import { systemFilterMatches } from './systemFilterMatches';

/***
 * MARK: isFailedTask
 * @description Evaluates whether a task has failed (status, failureReason,
 *   or lastError) — the predicate behind the `!failed` system filter,
 *   extracted so the registry is a move, not a rewrite.
 * @example isFailedTask({ status: 'failed' }) => true
 * @param {object} task - Task object.
 * @returns {boolean}
 ***/
export function isFailedTask(task) {
  return systemFilterMatches('failed', task, []);
}
