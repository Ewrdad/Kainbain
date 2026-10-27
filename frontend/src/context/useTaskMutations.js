// Domain: context/tasks — lifecycle mutations (advance, reject, jump...).
// Board state + reads live in useTaskBoard; this hook reconciles through
// its refresh/upsert entry points so every mutation path lands the same way.
import { useCallback, useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
import { removeTaskDraft, readTaskDraft } from '../services/taskDrafts';

/***
 * MARK: saveTaskEdit
 * @description The single PATCH path for a task edit (title/goal). Kept as a
 *   pure request helper with no UI side effects so the mutation hook and the
 *   local draft cache share one network call and one error shape.
 * @example await saveTaskEdit('proj-1', 'task-9', { title: 'New', goal: 'New' })
 * @param {string} projectId - Owning project.
 * @param {string} taskId - Task to edit.
 * @param {Object} updates - Fields to patch.
 * @returns {Promise<Object>} The updated task payload.
 ***/
export async function saveTaskEdit(projectId, taskId, updates) {
  try {
    return await api.updateTask(projectId, taskId, updates);
  } catch (e) {
    // Normalize non-Error throws while preserving the backend's message.
    if (e instanceof Error) throw e;
    throw new Error(typeof e === 'string' ? e : 'Task update failed');
  }
}

/***
 * MARK: flushCachedTaskDraft
 * @description Pushes a goal draft that an editor left behind (closed before
 *   the save landed) so a checkpoint action never advances on a stale goal.
 *   No-op when the task has no cached draft. A failed flush keeps the draft
 *   and rethrows so the caller stops instead of acting on the old goal.
 * @example await flushCachedTaskDraft('proj-1', 'task-9')
 * @param {string} projectId - Owning project.
 * @param {string} taskId - Task about to be advanced/rejected.
 ***/
export async function flushCachedTaskDraft(projectId, taskId) {
  const draft = readTaskDraft(taskId);
  if (!draft) return;
  try {
    await saveTaskEdit(projectId, taskId, { title: draft.value, goal: draft.value });
    removeTaskDraft(taskId);
  } catch (e) {
    // The draft stays cached on failure: the user's text must survive.
    logger.warn('Could not flush a cached task draft before advancing', {
      taskId,
      err: e,
    });
    throw e;
  }
}
export function useTaskMutations({
  onNotification,
  refreshTasks,
  upsertTask,
  scheduleTaskRefresh,
} = {}) {
  const [feedbackTask, setFeedbackTask] = useState(null);
  const isCreatingRef = useRef(false);
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const advanceTask = useCallback(
    async (projectId, taskId, { autoExecute = true, guidance } = {}) => {
      try {
        // Never advance on a stale goal: if an editor left a local draft
        // behind, persist it first (a failure aborts the approval).
        await flushCachedTaskDraft(projectId, taskId);
        const advanced = guidance
          ? await api.advanceTask(projectId, taskId, guidance)
          : await api.advanceTask(projectId, taskId);
        await refreshTasks(projectId);
        if (
          autoExecute &&
          advanced &&
          advanced.status !== 'completed' &&
          advanced.status !== 'waiting_human'
        ) {
          api
            .executeTaskStage(projectId, taskId)
            .then(() => {
              refreshTasks(projectId);
            })
            .catch((err) => {
              logger.warn('Auto-execution non-blocking notice:', err);
            });
        }
        return advanced;
      } catch (e) {
        logger.error('Failed to advance task', e);
        // Approving used to fail silently (the backend returned the task
        // unchanged); now refusals such as terminal-failed 409s carry an
        // actionable message — surface it instead of swallowing.
        onNotificationRef.current?.({
          type: 'error',
          title: 'Approval Failed',
          message: e?.message || 'Could not approve the task',
        });
      }
    },
    [refreshTasks],
  );

  const followUpTask = useCallback(
    async (projectId, taskId, prompt) => {
      try {
        const result = await api.followUpTask(projectId, taskId, prompt);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Follow-up Sent',
          message: 'Follow-up prompt delivered to task',
        });
        return result;
      } catch (e) {
        logger.error('Failed to follow up task', e);
        onNotificationRef.current?.({
          type: 'error',
          title: 'Follow-up Failed',
          message: e?.message || 'Failed to send follow-up prompt',
        });
      }
    },
    [refreshTasks],
  );

  const steerTask = useCallback(
    async (projectId, taskId, guidance) => {
      try {
        const result = await api.steerTask(projectId, taskId, guidance);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Steering Guidance Sent',
          message: 'Steering guidance delivered to active agent',
        });
        return result;
      } catch (e) {
        logger.error('Failed to steer task', e);
        onNotificationRef.current?.({
          type: 'error',
          title: 'Steering Failed',
          message: e?.message || 'Failed to send steering guidance',
        });
      }
    },
    [refreshTasks],
  );

  const pauseTask = useCallback(
    async (projectId, taskId) => {
      try {
        const result = await api.pauseTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'warning',
          title: 'Task Paused',
          message: 'Task execution paused',
        });
        return result;
      } catch (e) {
        logger.error('Failed to pause task', e);
      }
    },
    [refreshTasks],
  );

  const resumeTask = useCallback(
    async (projectId, taskId) => {
      try {
        const result = await api.resumeTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Task Resumed',
          message: 'Task execution resumed',
        });
        return result;
      } catch (e) {
        logger.error('Failed to resume task', e);
      }
    },
    [refreshTasks],
  );

  const retryTask = useCallback(
    async (projectId, taskId) => {
      try {
        const result = await api.retryTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Stage Retried',
          message: 'Stage execution restarted',
        });
        return result;
      } catch (e) {
        logger.error('Failed to retry task stage', e);
      }
    },
    [refreshTasks],
  );

  const abortTask = useCallback(
    async (projectId, taskId) => {
      try {
        const result = await api.abortTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'warning',
          title: 'Execution Aborted',
          message: 'Stage execution stopped',
        });
        return result;
      } catch (e) {
        logger.error('Failed to abort task', e);
      }
    },
    [refreshTasks],
  );

  // Advisory-only diagnosis: sends the current stage logs to a user-chosen
  // model and reports whether the run looks stuck. Nothing is mutated, so
  // unlike the other task actions this does NOT refresh the task list.
  const checkTaskStuck = useCallback(async (projectId, taskId, options) => {
    try {
      return await api.checkTaskStuck(projectId, taskId, options);
    } catch (e) {
      logger.error('Stuck check failed', e);
      onNotificationRef.current?.({
        type: 'error',
        title: 'Stuck Check Failed',
        message: e?.message || 'Could not run the stuck check',
      });
      throw e;
    }
  }, []);

  const executeTaskStage = useCallback(
    async (projectId, taskId) => {
      try {
        const result = await api.executeTaskStage(projectId, taskId);
        await refreshTasks(projectId);
        if (result?.status === 'failed') {
          onNotificationRef.current?.({
            type: 'error',
            title: 'Execution Failed',
            message: result.error || 'Execution failed',
          });
        }
        return result;
      } catch (e) {
        logger.error('Failed to execute task stage', e);
        // Single-active invariant: the engine runs one task at a time and
        // answers 409 while busy. Surface that as a queued/busy signal —
        // the task stays queued — not as a generic execution error.
        const rawMessage = e?.message || 'Failed to execute stage';
        const isEngineBusy =
          rawMessage.includes('409') &&
          /already running another task|already processing/i.test(rawMessage);
        onNotificationRef.current?.(
          isEngineBusy
            ? {
                type: 'warning',
                title: 'Engine Busy — Task Queued',
                message:
                  'The engine is already running another task. This task stays queued; run it again after the current run finishes.',
              }
            : {
                type: 'error',
                title: 'Execution Error',
                message: rawMessage,
              },
        );
      }
    },
    [refreshTasks],
  );

  const rejectTask = useCallback(
    async (projectId, taskId) => {
      try {
        // Same guard as approval: a left-behind draft is persisted before the
        // task is returned to its fallback stage.
        await flushCachedTaskDraft(projectId, taskId);
        await api.failbackTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'warning',
          title: 'Task Rejected',
          message: 'Task rejected and returned to fallback stage',
        });
      } catch (e) {
        logger.error('Failed to failback task', e);
      }
    },
    [refreshTasks],
  );

  // Enhanced human review: reject with correction/feedback. Rejects on
  // failure (like checkTaskStuck/updateTask) so entry points keep the draft
  // open instead of navigating away from unsaved feedback.
  const rejectTaskWithFeedback = useCallback(
    async (projectId, taskId, feedback) => {
      try {
        await flushCachedTaskDraft(projectId, taskId);
        const result = await api.rejectTaskWithFeedback(projectId, taskId, feedback);
        setFeedbackTask(null);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'warning',
          title: 'Feedback Recorded',
          message: 'Human review feedback recorded; task returned to fallback stage',
        });
        return result;
      } catch (e) {
        logger.error('Failed to reject task with feedback', e);
        onNotificationRef.current?.({
          type: 'error',
          title: 'Rejection Failed',
          message: e?.message || 'Could not record the rejection; your feedback was kept.',
        });
        throw e;
      }
    },
    [refreshTasks],
  );

  const openFeedbackDialog = useCallback((task) => setFeedbackTask(task), []);
  const closeFeedbackDialog = useCallback(() => setFeedbackTask(null), []);

  const jumpTask = useCallback(
    async (projectId, taskId, stageId) => {
      try {
        await api.jumpTask(projectId, taskId, stageId);
        await refreshTasks(projectId);
      } catch (e) {
        logger.error('Failed to jump task', e);
      }
    },
    [refreshTasks],
  );

  const completeTask = useCallback(
    async (projectId, taskId) => {
      try {
        await api.completeTask(projectId, taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Task Completed',
          message: 'Task marked as completed',
        });
      } catch (e) {
        logger.error('Failed to complete task', e);
      }
    },
    [refreshTasks],
  );

  // Edit a task's title / goal from the Task Detail view. Rejects when the
  // backend refuses the edit so callers can block checkpoint actions (approve /
  // reject) on top of an unsaved edit instead of advancing on stale data.
  const updateTask = useCallback(
    async (projectId, taskId, updates) => {
      try {
        const updated = await saveTaskEdit(projectId, taskId, updates);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Task Updated',
          message: 'Task details updated',
        });
        return updated;
      } catch (e) {
        logger.error('Failed to update task', e);
        onNotificationRef.current?.({
          type: 'error',
          title: 'Task Update Failed',
          message: 'Your edit could not be saved to the task. Please try again.',
        });
        throw e;
      }
    },
    [refreshTasks],
  );

  /***
   * MARK: createTask
   * @description Creates a new task directly in a stage with idempotency protection and records workflowId without immediate dispatch.
   * @example await createTask('proj-1', { title: 'New Task', goal: 'Build API', stageId: '1', workflowId: 'wf-default' })
   * @param {string} projectId
   * @param {Object} taskPayload
   * @returns {Promise<Object>}
   ***/
  const createTask = useCallback(
    async (projectId, { title, goal, stageId, idempotencyKey, workflowId, blockedBy }) => {
      if (isCreatingRef.current) {
        return null;
      }
      isCreatingRef.current = true;
      try {
        const key = idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const task = await api.createTask(projectId, {
          title,
          goal,
          stageId,
          idempotencyKey: key,
          workflowId,
          blockedBy,
        });
        // Optimistic: merge the freshly created task straight onto the board so
        // the card is visible and editable immediately, without waiting for a
        // full list refetch (the backend also broadcasts TASK_UPDATED, which
        // re-merges via upsertTask in case two tabs created at once).
        upsertTask(task);
        // Reconcile in the background: a debounced full fetch still runs so any
        // server-curated fields land even if a broadcast was missed.
        scheduleTaskRefresh(projectId);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Task Created',
          message: `Created task "${task.title || title || goal}"`,
        });
        return task;
      } catch (e) {
        logger.error('Failed to create task', e);
        throw e;
      } finally {
        isCreatingRef.current = false;
      }
    },
    [upsertTask, scheduleTaskRefresh],
  );

  /***
   * MARK: deleteTask
   * @description Deletes a task from the project.
   * @param {string} projectId
   * @param {string} taskId
   ***/
  const deleteTask = useCallback(
    async (projectId, taskId) => {
      try {
        await api.deleteTask(projectId, taskId);
        // The task is gone: its cached draft can never be saved, so drop it
        // rather than letting an orphan linger until the TTL sweep.
        removeTaskDraft(taskId);
        await refreshTasks(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Task Deleted',
          message: 'Task removed from project',
        });
      } catch (e) {
        logger.error('Failed to delete task', e);
      }
    },
    [refreshTasks],
  );

  /***
   * MARK: getTaskReports
   * @description Fetches all markdown reports generated for a task.
   * @param {string} projectId
   * @param {string} taskId
   * @returns {Promise<Object>}
   ***/
  const getTaskReports = useCallback(async (projectId, taskId) => {
    try {
      return await api.getTaskReports(projectId, taskId);
    } catch (e) {
      logger.error('Failed to fetch task reports', e);
      return { taskId, reports: [] };
    }
  }, []);

  /***
   * MARK: getTask
   * @description Fetches one full task record (log history included) for
   *   read-only hydration. Never throws: null lets callers fall back to
   *   the board summary they already hold.
   * @param {string} projectId
   * @param {string} taskId
   * @returns {Promise<Object|null>}
   ***/
  const getTask = useCallback(async (projectId, taskId) => {
    try {
      return await api.getTask(projectId, taskId);
    } catch (e) {
      logger.error('Failed to fetch task', e);
      return null;
    }
  }, []);

  return {
    createTask,
    deleteTask,
    getTask,
    getTaskReports,
    advanceTask,
    executeTaskStage,
    rejectTask,
    rejectTaskWithFeedback,
    openFeedbackDialog,
    closeFeedbackDialog,
    jumpTask,
    completeTask,
    updateTask,
    feedbackTask,
    followUpTask,
    steerTask,
    pauseTask,
    resumeTask,
    retryTask,
    abortTask,
    checkTaskStuck,
  };
}
