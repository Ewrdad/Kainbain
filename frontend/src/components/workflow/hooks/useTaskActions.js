import { useState } from 'react';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { soundEffects } from '../../../services/soundEffects';
import { submitCreateTask } from '../../tasks/createTaskSubmit';

/***
 * MARK: useTaskActions
 * @description Task + stage mutation actions extracted from WorkflowCanvas:
 *   approve/reject/execute, stage reorder/add/remove (with persistence) and
 *   inline task creation. Owns the submit + single-flight delete guards.
 *   No JSX — returns callbacks + guard flags.
 * @example const actions = useTaskActions({ activeProjectId, stages, activeWfId, advanceTask, ... });
 ***/
export function useTaskActions({
  activeProjectId,
  stages,
  activeWfId,
  advanceTask,
  openFeedbackDialog,
  executeTaskStage,
  createTask,
  switchWorkflow,
  setSelectedTask,
  handleAddStage,
  handleRemoveStage,
  handleReorderStages,
  saveStages,
  hasPendingTaskSaveFlush,
  flushPendingTaskSave,
  uiPreferences,
  newTaskTitle,
  setNewTaskTitle,
  setAddingTaskStageId,
  setSelectedMobileStageId,
  setExpandedSettingsStageId,
}) {
  // Single-flight guard for stage mutations fired from the canvas chrome: while
  // a stage is being deleted, the delete button is disabled and shows a loading
  // state, and a fast double-click cannot fire the removal twice.
  const { pendingKey: pendingStageAction, run: runStageAction } = usePendingAction();
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  /***
   * MARK: handleApprove
   * @description Approves a checkpoint task from the canvas. Returns the advance
   *   promise so the TaskCard can keep its in-flight loading state until the
   *   backend has responded instead of clearing it immediately.
   *   When the task inspector is open, its (debounced) pending goal
   *   edits are flushed to the backend first, so approval only ever runs on
   *   the persisted state. A failed flush rejects instead of advancing,
   *   surfacing the save error from the updateTask notification layer.
   * @param {string} taskId
   * @example onApprove={handleApprove}
   ***/
  const handleApprove = (taskId) => {
    const pendingFlush = hasPendingTaskSaveFlush?.() ? flushPendingTaskSave?.() : null;
    // Fast path (inspector closed): advance without an extra microtask hop.
    const advancePromise = pendingFlush
      ? pendingFlush.then(() => advanceTask?.(activeProjectId, taskId))
      : Promise.resolve(advanceTask?.(activeProjectId, taskId));
    if (uiPreferences?.enableAudioChimes) {
      soundEffects.playChime('stageAdvance');
    }
    return advancePromise;
  };

  const handleReject = async (task) => {
    // Gate on the inspector's pending save: never open the rejection dialog on
    // top of unsaved edits (a failed flush surfaces via the updateTask
    // notification layer and keeps the dialog closed).
    const pendingFlush = hasPendingTaskSaveFlush?.() ? flushPendingTaskSave?.() : null;
    if (pendingFlush) {
      try {
        await pendingFlush;
      } catch {
        return;
      }
    }
    openFeedbackDialog?.(task);
    if (uiPreferences?.enableAudioChimes) {
      soundEffects.playChime('error');
    }
  };

  /***
   * MARK: handleExecute
   * @description Runs the automated stage for a task from the canvas. Returns the
   *   execution promise so the TaskCard can keep its in-flight loading state
   *   until the backend has responded instead of clearing it immediately.
   * @param {string} taskId
   * @example onExecute={handleExecute}
   ***/
  const handleExecute = (taskId) => {
    const executePromise = executeTaskStage?.(activeProjectId, taskId);
    if (uiPreferences?.enableAudioChimes) {
      soundEffects.playChime('stageAdvance');
    }
    return executePromise;
  };

  /***
   * MARK: reorderAndSave
   * @description Reorders the stage sequence and immediately persists the exact
   *   new order so drag/drop, ◀ ▶, and tray reorders are never lost to a stale
   *   closure (E1).
   * @example reorderAndSave(0, 2)
   * @param {number} fromIndex
   * @param {number} toIndex
   **/
  const reorderAndSave = (fromIndex, toIndex) => {
    const next = [...stages];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    handleReorderStages?.(fromIndex, toIndex);
    if (activeProjectId && saveStages) saveStages(activeProjectId, next);
  };

  /***
   * MARK: addStageAndSave
   * @description Appends a new blank stage and persists the exact new sequence.
   * @example addStageAndSave()
   **/
  const addStageAndSave = () => {
    const newStage = {
      id: `stage-${Date.now()}`,
      name: `New Stage ${stages.length + 1}`,
      type: 'agent',
      prompt: '',
      paused: false,
      failback: 'previous',
    };
    const next = [...stages, newStage];
    handleAddStage?.();
    if (activeProjectId && saveStages) saveStages(activeProjectId, next);
    // Mobile shows a single stage column: select the new stage so it opens
    // immediately. Harmless on desktop (this state only feeds the mobile
    // column via effectiveMobileStageId).
    setSelectedMobileStageId(newStage.id);
  };

  /***
   * MARK: removeStageAndSave
   * @description Removes a stage and persists the exact resulting sequence. The
   *   settings drawer stays open with a "Deleting..." loading state until the
   *   backend has confirmed the save, and the single-flight guard means a fast
   *   double-click cannot remove the stage twice.
   * @example removeStageAndSave('stage-1')
   * @param {string} id
   ***/
  const removeStageAndSave = (id) =>
    runStageAction(`delete-stage-${id}`, async () => {
      handleRemoveStage?.(id);
      await saveStages?.(
        activeProjectId,
        stages.filter((s) => String(s.id) !== String(id)),
      );
      setExpandedSettingsStageId(null);
    });

  /***
   * MARK: handleCreateTaskInline
   * @description Creates a task from the inline column form, then auto-dispatches
   *   the agent for non-checkpoint stages (F1). Guarded by isSubmittingTask so a
   *   fast double-submit cannot create two tasks. The inspector is opened with
   *   the created task as soon as the POST resolves, so the user can keep
   *   editing (goal) the moment the card exists.
   * @example handleCreateTaskInline('stage-1')
   * @param {string} stageId
   ***/
  const handleCreateTaskInline = async (stageId) => {
    if (isSubmittingTask || !newTaskTitle.trim()) return;
    setIsSubmittingTask(true);
    const goalText = newTaskTitle.trim();
    try {
      // Shared submission core (file a task, open the inspector, and
      // auto-dispatch the agent for non-checkpoint stages). The target is
      // always the active pipeline here, so no pipeline switch happens.
      await submitCreateTask({
        projectId: activeProjectId,
        title: goalText,
        goal: goalText,
        stageId,
        workflowId: activeWfId,
        activeWorkflowId: activeWfId,
        stages,
        createTask,
        switchWorkflow,
        executeTaskStage,
        setSelectedTask,
      });

      setNewTaskTitle('');
      setAddingTaskStageId(null);
      if (uiPreferences?.enableAudioChimes) {
        soundEffects.playChime('stageAdvance');
      }
    } catch {
      // Error handled by hook logger
    } finally {
      setIsSubmittingTask(false);
    }
  };

  return {
    handleApprove,
    handleReject,
    handleExecute,
    reorderAndSave,
    addStageAndSave,
    removeStageAndSave,
    handleCreateTaskInline,
    isSubmittingTask,
    pendingStageAction,
  };
}
