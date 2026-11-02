/***
 * MARK: didFailbackMoveStages
 * @description True when the failback moved the task to a DIFFERENT stage
 *   than the one that failed. `stage` is the stage that failed (source);
 *   `currentStageId` is where the task sits now (the failback destination).
 *   When the destination equals the failed stage id (or the failed stage is
 *   unknown), the task never left its stage — it is still retrying that
 *   same stage in place. A null/unknown failed stage is treated as "did not
 *   move" so legacy records without a stage id keep their retry read.
 *   Co-located here (the resolver that classifies the re-run) so tests and
 *   UI predicate can share it without duplicating the compare.
 * @example didFailbackMoveStages({ currentStageId: '1' }, { id: '2' }) => true
 * @example didFailbackMoveStages({ currentStageId: '2' }, { id: '2' }) => false
 * @example didFailbackMoveStages({ currentStageId: '1' }, null) => false
 * @param {Object} [task] - Task (needs currentStageId after failback).
 * @param {Object} [stage] - The stage that failed (needs id).
 * @returns {boolean} True when the task moved to another stage.
 ***/
export function didFailbackMoveStages(task, stage) {
	const failedStageId = stage?.id != null ? String(stage.id) : null;
	if (failedStageId == null) return false;
	return String(task?.currentStageId ?? "") !== failedStageId;
}
