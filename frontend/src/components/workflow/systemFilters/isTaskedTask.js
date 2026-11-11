/***
 * MARK: isTaskedTask
 * @description Evaluates whether a task exists in the board task set — the
 *   predicate behind the `!tasked` system filter. Every task present counts,
 *   whatever its status; column visibility is decided by counting tasks per
 *   column, so the predicate itself just proves the task exists.
 * @example isTaskedTask({ id: 't1', status: 'active' }) => true
 * @param {object} task - Task object.
 * @returns {boolean}
 ***/
export function isTaskedTask(task) {
  return task != null;
}
