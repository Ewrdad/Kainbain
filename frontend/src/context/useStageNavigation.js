// Domain: context — stage-column viewport focus + engine-owner skip.
// View-only navigation never mutates; skipCurrent advances the engine owner's task.
import { useState, useCallback } from 'react';
import { scrollIntoViewRespectingMotion } from '../a11y/reducedMotion';
export function useStageNavigation({ tasks, workflow, engineState }) {
  // ---- Navigation transport controls (Critique #9) ----
  const [focusedStageId, setFocusedStageId] = useState(null);

  const effectiveFocusedStageId =
    focusedStageId || workflow.currentStageId || workflow.stages[0]?.id;

  /***
   * MARK: lookBack
   * @description View-only navigation: shifts stage column focus to the left without server mutation.
   * @example lookBack()
   ***/
  const lookBack = useCallback(() => {
    const stagesList = workflow.stages;
    if (!stagesList || stagesList.length === 0) return;
    const currentIndex = stagesList.findIndex((s) => s.id === effectiveFocusedStageId);
    if (currentIndex > 0) {
      const targetStage = stagesList[currentIndex - 1];
      setFocusedStageId(targetStage.id);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`stage-col-${targetStage.id}`);
        scrollIntoViewRespectingMotion(el, { behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [workflow.stages, effectiveFocusedStageId]);

  /***
   * MARK: lookForward
   * @description View-only navigation: shifts stage column focus to the right without server mutation.
   * @example lookForward()
   ***/
  const lookForward = useCallback(() => {
    const stagesList = workflow.stages;
    if (!stagesList || stagesList.length === 0) return;
    const currentIndex = stagesList.findIndex((s) => s.id === effectiveFocusedStageId);
    if (currentIndex >= 0 && currentIndex < stagesList.length - 1) {
      const targetStage = stagesList[currentIndex + 1];
      setFocusedStageId(targetStage.id);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`stage-col-${targetStage.id}`);
        scrollIntoViewRespectingMotion(el, { behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [workflow.stages, effectiveFocusedStageId]);

  /***
   * MARK: jumpToActive
   * @description View-only navigation: resets viewport focus back to the actively executing stage.
   * @example jumpToActive()
   ***/
  const jumpToActive = useCallback(() => {
    const activeId = workflow.currentStageId || workflow.stages[0]?.id;
    if (activeId) {
      setFocusedStageId(activeId);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`stage-col-${activeId}`);
        scrollIntoViewRespectingMotion(el, { behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [workflow.currentStageId, workflow.stages]);

  /***
   * MARK: skipCurrent
   * @description Mutation: advances the universal engine owner's task past its
   * current stage. The engine owns a single queue fed by every pipeline, so
   * Skip follows engineState.activeTaskId — never the selected pipeline's
   * stage pointer — and advances it in its OWNING project (the owner may live
   * outside the selected project after a switch; the backend snapshot in
   * engineState.activeTask covers the off-list case). Only when the engine
   * names no owner does it fall back to the viewed pipeline's current-stage
   * task (then the stage pointer).
   * @example await skipCurrent('proj-1')
   * @param {string} projectId - The selected project (used only for the fallback path).
   ***/
  const skipCurrent = useCallback(
    async (projectId) => {
      const ownerId = engineState?.activeTaskId;
      const listedOwner =
        ownerId != null
          ? tasks.tasks.find((t) => String(t?.id) === String(ownerId))
          : null;
      // Off-list owner (another project is selected): the backend snapshot
      // still identifies it, so Skip acts on the engine owner regardless.
      const snapshotOwner =
        !listedOwner &&
        ownerId != null &&
        engineState?.activeTask &&
        String(engineState.activeTask?.id) === String(ownerId)
          ? engineState.activeTask
          : null;
      const ownerTask = listedOwner || snapshotOwner;
      if (ownerTask) {
        const ownerProjectId =
          ownerTask?.projectId || engineState?.activeProjectId || projectId;
        await tasks.advanceTask(ownerProjectId, ownerTask.id);
        return;
      }
      const activeTask = tasks.tasks.find(
        (t) => t.currentStageId === workflow.currentStageId && t.status !== 'completed',
      );
      if (activeTask) {
        await tasks.advanceTask(projectId, activeTask.id);
      } else {
        await workflow.skipStage(projectId);
      }
    },
    [tasks, workflow, engineState],
  );

  return {
    focusedStageId: effectiveFocusedStageId,
    setFocusedStageId,
    lookBack,
    lookForward,
    jumpToActive,
    skipCurrent,
  };
}
