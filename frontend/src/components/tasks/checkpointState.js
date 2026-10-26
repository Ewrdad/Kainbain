import { isCheckpoint } from '../stageTypes';

/***
 * MARK: resolveTaskStage
 * @description Resolves a task's stage record from the active pipeline's
 *   stage list by `currentStageId` (falling back to legacy `stageId`).
 *   The returned record — not the `role` prop passed down the column, and
 *   never `task.status` alone — is the source of truth for checkpoint UI
 *   (task 8a056fc4): after a pipeline switch the column type and the task
 *   payload can briefly disagree, and the active pipeline's record wins.
 * @example resolveTaskStage([{id:'s1',type:'agent'}], {currentStageId:'s1'})
 * @param {Array} [stages] - The active pipeline's stage list.
 * @param {Object} [task] - The task payload.
 * @returns {Object|null} The matching stage record, or null when none resolves.
 ***/
export function resolveTaskStage(stages, task) {
  if (!Array.isArray(stages) || stages.length === 0 || !task) return null;
  const id = task.currentStageId ?? task.stageId;
  if (id === null || id === undefined || id === '') return null;
  return stages.find((s) => String(s?.id) === String(id)) || null;
}

/***
 * MARK: resolveCheckpointState
 * @description Decides whether a card shows human-checkpoint chrome
 *   (AWAITING_REVIEW label, Approve/Reject, PR-review row) from the active
 *   pipeline's stage record. A stale `status: 'waiting_human'` payload on a
 *   non-checkpoint stage never shows checkpoint UI — that staleness is the
 *   pipeline-switch bug in task 8a056fc4. Unknown/missing stage records are
 *   fail-visible (no Approve, never a wrong Approve); only a standalone card
 *   with no resolvable record falls back to the `role`/`stageName` props so
 *   isolated renders keep working.
 * @example resolveCheckpointState({status:'waiting_human'}, {id:'s1',type:'agent'})
 * @param {Object} [task] - The task payload (status is a hint, never sufficient).
 * @param {Object|null} [stage] - The active-pipeline stage record for the
 *   task (see resolveTaskStage); null/undefined when none resolves.
 * @param {Object} [fallback] - Standalone-card fallback used only when no
 *   record resolves.
 * @param {string} [fallback.role] - Column role prop (e.g. 'agent', 'human').
 * @param {string} [fallback.stageName] - Column stage-name prop.
 * @returns {{showCheckpoint: boolean}} Whether checkpoint chrome renders.
 ***/
export function resolveCheckpointState(task, stage, fallback = {}) {
  void task;
  if (stage) {
    return { showCheckpoint: isCheckpoint(stage.type) };
  }
  const { role, stageName } = fallback;
  return {
    showCheckpoint:
      isCheckpoint(role) || String(stageName || '').toLowerCase() === 'human',
  };
}
