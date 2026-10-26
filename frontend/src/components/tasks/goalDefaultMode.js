/***
 * MARK: goalDefaultMode
 * @description Single source of truth for the Task Goal section's initial
 * edit/preview mode, shared by the full task page and the slide-over
 * inspector. Tasks open in preview by default so the first thing a user
 * sees is the rendered goal; only tasks created within the edit window
 * open ready to edit, so a user who just created a task can keep typing
 * without an extra click.
 * @example resolveDefaultGoalMode({ isExecuting: false, isNewlyCreated: false }) => 'preview'
 * @example isNewlyCreatedTask({ createdAt: new Date().toISOString() }) => true
 ***/

/***
 * MARK: NEW_TASK_EDIT_WINDOW_MS
 * @description How long after creation a task still counts as "just been
 * created" and opens its goal in edit mode. Five minutes covers the
 * create-then-refine flow without keeping old tasks editable-first.
 * @example NEW_TASK_EDIT_WINDOW_MS => 300000
 ***/
export const NEW_TASK_EDIT_WINDOW_MS = 5 * 60 * 1000;

/***
 * MARK: isNewlyCreatedTask
 * @description Whether the task was created within the edit window, i.e. the
 * user probably just created it and is still refining the goal. Accepts
 * either a task object carrying `createdAt` or a bare ISO timestamp.
 * Missing or unparseable dates fail closed to false (preview default):
 * an unknown age is never treated as "just created".
 * @example isNewlyCreatedTask({ createdAt: new Date().toISOString() }) => true
 * @example isNewlyCreatedTask({ createdAt: '2026-01-01T00:00:00Z' }) => false
 * @example isNewlyCreatedTask({}) => false
 * @param {Object|string|null} [taskOrCreatedAt] - Task object or ISO timestamp.
 * @param {number} [nowMs=Date.now()] - Injectable "now" so tests can pin time.
 * @returns {boolean}
 ***/
export function isNewlyCreatedTask(taskOrCreatedAt, nowMs = Date.now()) {
  const createdAt =
    typeof taskOrCreatedAt === 'string' ? taskOrCreatedAt : taskOrCreatedAt?.createdAt;
  if (typeof createdAt !== 'string' || createdAt.length === 0) return false;
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs <= NEW_TASK_EDIT_WINDOW_MS;
}

/***
 * MARK: resolveDefaultGoalMode
 * @description Resolves the goal section's initial mode: preview by default,
 * except newly-created tasks (per `isNewlyCreatedTask`), which open ready
 * to edit so a user who just created a task can keep refining the goal.
 * Newly-created wins over executing — a fresh task whose first stage
 * already dispatched still opens in edit (the running-stage warning in
 * the component explains the next-stage caveat).
 * @example resolveDefaultGoalMode({ isExecuting: false, isNewlyCreated: false }) => 'preview'
 * @example resolveDefaultGoalMode({ isExecuting: true, isNewlyCreated: true }) => 'edit'
 * @param {Object} [options]
 * @param {boolean} [options.isExecuting=false] - True while a stage is running.
 * @param {boolean} [options.isNewlyCreated=false] - From `isNewlyCreatedTask`.
 * @returns {string} 'edit' | 'preview'
 ***/
export function resolveDefaultGoalMode({ isExecuting = false, isNewlyCreated = false } = {}) {
  void isExecuting;
  return isNewlyCreated ? 'edit' : 'preview';
}
