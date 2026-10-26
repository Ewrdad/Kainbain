import { resetAttemptBudgets } from './resetAttemptBudgets.js';

/***
 * MARK: resetAutoIteration
 * @description Clears a task's automatic-iteration state. Called when a human
 *   takes over (retry/resume/reject) so the task gets a fresh iteration budget.
 * @param {Object} task
  * @example resetAutoIteration(task) => (iteration state cleared)
 ***/
export function resetAutoIteration(task) {
	return resetAttemptBudgets(task);
}
