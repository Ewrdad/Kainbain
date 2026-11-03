/***
 * MARK: isTaskSettledStatus
 * @description Single source of truth for the task statuses that count as
 *   settled (not live work): completed, failed, aborted, cancelled, paused,
 *   interrupted, waiting at a human checkpoint, or blocked. Every retry /
 *   iteration readout must treat these as "not in progress" — a stale
 *   persisted flag on a settled task must never label it RETRYING (the
 *   99709f "everything says retrying" bug). Unknown or missing statuses are
 *   NOT settled here, so in-memory payloads without a status still classify
 *   by their flags.
 * @example isTaskSettledStatus({ status: 'failed' }) => true
 * @example isTaskSettledStatus({ status: 'in_stage' }) => false
 * @example isTaskSettledStatus({}) => false
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True only when the task status is a known settled status.
 ***/
export function isTaskSettledStatus(task) {
  const status = String(task?.status || '').toLowerCase();
  if (!status) return false;
  return new Set([
    'completed', 'done', 'failed', 'aborted', 'cancelled',
    'paused', 'interrupted', 'waiting_human', 'blocked',
  ]).has(status);
}
