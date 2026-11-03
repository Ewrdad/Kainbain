/***
 * MARK: didFailbackMoveStages
 * @description True when the failback moved the task to a DIFFERENT stage
 *   than the one that failed. `stage` is the stage that failed (source);
 *   `currentStageId` is where the task sits now (the failback destination).
 *   When the destination equals the failed stage id, the task never left
 *   its stage — it is still retrying that same stage in place.
 *   Fail-safe: a move is only ever claimed when BOTH ids are known and
 *   differ. An unknown failed stage id (null, undefined, or empty) or an
 *   unknown current stage id means the move cannot be proven, so this
 *   returns false and the re-run keeps the in-place retry read instead of
 *   hiding a live retry. This mirrors the task view predicate
 *   `isRetryInProgress` (frontend/src/components/tasks/taskRetryState.js),
 *   which applies the same rule to legacy records — the two classifiers
 *   agree on every input, so the stored flags and the displayed label can
 *   never disagree about whether the task moved.
 * @example didFailbackMoveStages({ currentStageId: '1' }, { id: '2' }) => true
 * @example didFailbackMoveStages({ currentStageId: '2' }, { id: '2' }) => false
 * @example didFailbackMoveStages({ currentStageId: '1' }, null) => false
 * @example didFailbackMoveStages({}, { id: '2' }) => false
 * @param {Object} [task] - Task (needs currentStageId after failback).
 * @param {Object} [stage] - The stage that failed (needs id).
 * @returns {boolean} True only when the task provably moved to another stage.
 ***/
export function didFailbackMoveStages(task, stage) {
	const failedStageId = stage?.id != null ? String(stage.id) : "";
	if (!failedStageId) return false;
	const currentStageId = task?.currentStageId;
	if (currentStageId == null || String(currentStageId) === "") return false;
	return String(currentStageId) !== failedStageId;
}
