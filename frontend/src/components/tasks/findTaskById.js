/***
 * MARK: findTaskById
 * @description Looks a task up in the board list by id, comparing as strings
 *   because route params are always strings while stored ids may not be.
 * @param {Object} opts
 * @param {Object[]} [opts.tasks] - Board task list from context.
 * @param {string} [opts.taskId] - Id to look for.
 * @example const listTask = findTaskById({ tasks, taskId: 'task-101' });
 * @returns {Object|null} The matching task, or null.
 ***/
export function findTaskById({ tasks, taskId } = {}) {
  if (!taskId || !Array.isArray(tasks)) return null;
  return tasks.find((t) => String(t?.id) === String(taskId)) || null;
}
