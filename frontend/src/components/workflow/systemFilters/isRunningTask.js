import { isTaskRunning } from '../../tasks/runningTask';

/***
 * MARK: isRunningTask
 * @description Evaluates whether a task is genuinely executing right now —
 *   the predicate behind the `!running` system filter. Reuses the
 *   `isTaskRunning` engine-owner lock (the single source of truth shared by
 *   every monitor surface) instead of sniffing `running_*` status labels, so
 *   a stale label without ownership never counts. Without an engine snapshot
 *   the label is trusted (isolated renders, old tests).
 * @example isRunningTask({ id: 't1' }, { engineState: { status: 'running', activeTaskId: 't1' } }) => true
 * @param {object} task - Task object.
 * @param {object} [ctx] - Filter context: `{ engineState, isAgentRunning }`.
 * @returns {boolean}
 ***/
export function isRunningTask(task, ctx) {
  return isTaskRunning(task, ctx?.engineState, ctx?.isAgentRunning);
}
