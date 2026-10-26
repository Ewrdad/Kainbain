import { systemFilterMatches } from './systemFilterMatches';

/***
 * MARK: isHumanTask
 * @description Evaluates whether a task is waiting for human interaction
 *   (sits in a human checkpoint stage or carries `waiting_human` status) —
 *   the predicate behind the `!human` system filter.
 * @example isHumanTask({ status: 'waiting_human' }, []) => true
 * @param {object} task - Task object.
 * @param {Array<object>} stages - Workflow stages.
 * @returns {boolean}
 ***/
export function isHumanTask(task, stages) {
  return systemFilterMatches('human', task, stages);
}
