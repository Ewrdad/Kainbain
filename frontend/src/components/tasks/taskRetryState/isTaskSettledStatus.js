/***
 * MARK: settledTaskStatuses
 * @description The task statuses that count as settled (not live work):
 *   finished, parked on a failure, held by an operator action, or waiting
 *   at a human checkpoint. One shared list (not a copy per reader) so the
 *   RETRYING label, the pace tint, and the history rows can never disagree
 *   about whether a task is still live. Unknown or missing statuses are
 *   NOT settled here, so tasks without a status still classify by flags.
 * @example settledTaskStatuses.has('failed') => true
 */
const settledTaskStatuses = new Set([
  'completed',
  'done',
  'failed',
  'aborted',
  'cancelled',
  'paused',
  'interrupted',
  'waiting_human',
  'blocked',
]);

/***
 * MARK: isTaskSettledStatus
 * @description True when a task's status counts as settled (not live work).
 *   Every retry / iteration readout must treat these as "not in progress" —
 *   a stale saved flag on a settled task must never label it RETRYING.
 *   Unknown or missing statuses are NOT settled here, so tasks without a
 *   status still classify by their flags.
 * @example isTaskSettledStatus({ status: 'failed' }) => true
 * @example isTaskSettledStatus({ status: 'in_stage' }) => false
 * @example isTaskSettledStatus({}) => false
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True only when the task status is a known settled status.
 ***/
export function isTaskSettledStatus(task) {
  const status = String(task?.status || '').toLowerCase();
  if (!status) return false;
  return settledTaskStatuses.has(status);
}
