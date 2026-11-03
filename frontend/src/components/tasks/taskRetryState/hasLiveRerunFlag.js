/***
 * MARK: hasLiveRerunFlag
 * @description True when the task carries any automatic re-run flag
 *   (`autoRetrying` or `autoIterating`), ignoring status. Unlike
 *   `isRetryInProgress`, this deliberately does NOT apply the settled-status
 *   guard: it answers "is an automatic re-run in flight?" for liveness reads
 *   (e.g. pace colour) where a re-run is active engine work even if a stale
 *   status string is still attached. The backend clears both flags on every
 *   park/move path and the persistence read drops them for non-running
 *   tasks, so a settled task cannot carry these flags in practice — and the
 *   RETRYING *label* still uses the guarded `isRetryInProgress` instead.
 * @example hasLiveRerunFlag({ autoRetrying: true }) => true
 * @example hasLiveRerunFlag({ autoIterating: true }) => true
 * @example hasLiveRerunFlag({ status: 'failed', autoRetrying: true }) => true
 * @example hasLiveRerunFlag({ status: 'failed' }) => false
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True when any automatic re-run flag is set.
 ***/
export function hasLiveRerunFlag(task) {
  return task?.autoRetrying === true || task?.autoIterating === true;
}
