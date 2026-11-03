/***
 * MARK: isRetryInProgress
 * @description Single source of truth for whether a task is genuinely
 *   RETRYING IN PLACE. `autoRetrying` alone is not enough: the backend sets
 *   it both for a same-stage transient retry (a real in-place retry that
 *   should read RETRYING) and — on older records — after a cross-stage
 *   failback re-run, where the task has already MOVED to another stage and
 *   must read as normal in-progress work instead. A true in-place retry is
 *   one where the task still sits in the stage that failed:
 *   `currentStageId === lastError.stageId`. When there is no recorded failed
 *   stage id (e.g. a transient infra blip clears `lastError`), the task never
 *   left its stage, so the flag counts as an in-place retry. New backend
 *   records additionally set `autoIterating` (and clear `autoRetrying`) when
 *   the failback moved stages; this helper also honours that, so legacy and
 *   current payloads classify identically. The unknown-id rule here (an
 *   unprovable move keeps the retry read) mirrors the backend
 *   `didFailbackMoveStages` resolver (api/flow/routing/resolvers/): the two
 *   classifiers agree on every input, so stored flags and displayed labels
 *   can never disagree about whether the task moved.
 * @example isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: { stageId: '2' } }) => true
 * @example isRetryInProgress({ autoRetrying: true, currentStageId: '1', lastError: { stageId: '2' } }) => false
 * @example isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: null }) => true
 * @example isRetryInProgress({ autoRetrying: false, currentStageId: '2', lastError: { stageId: '2' } }) => false
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True only when the task is retrying the same stage in place.
 ***/
export function isRetryInProgress(task) {
  if (task?.autoRetrying !== true) return false;
  // New backend records mark a cross-stage failback re-run explicitly.
  if (task?.autoIterating === true) return false;
  const failedStageId = task?.lastError?.stageId;
  // No recorded failed stage (transient blip clears lastError): the task
  // never left its stage, so this is an in-place retry.
  if (failedStageId === undefined || failedStageId === null || failedStageId === '') return true;
  const currentStageId = task?.currentStageId;
  // Degenerate payload without a current stage: cannot prove a move, so keep
  // the historical RETRYING read rather than hiding a live retry.
  if (currentStageId === undefined || currentStageId === null || currentStageId === '') return true;
  return String(currentStageId) === String(failedStageId);
}
