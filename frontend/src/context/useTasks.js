import { useTaskBoard, isValidProjectId } from './useTaskBoard';
import { useTaskMutations } from './useTaskMutations';

// Re-exported so existing importers keep working; the implementation lives
// in useTaskBoard.js beside the fetch paths that consume it.
export { isValidProjectId };

/**
 * MARK: useTasks
 * @description Task list + kanban lifecycle actions. Thin composer over
 * useTaskBoard (state + reads) and useTaskMutations; return shape unchanged.
 * @param {Object} [opts]
 * @param {Function} [opts.onNotification] - Notification dispatch callback.
 */
export function useTasks({ onNotification } = {}) {
  const board = useTaskBoard();
  const mutations = useTaskMutations({
    onNotification,
    refreshTasks: board.refreshTasks,
    upsertTask: board.upsertTask,
    scheduleTaskRefresh: board.scheduleTaskRefresh,
  });

  return {
    tasks: board.tasks,
    setTasks: board.setTasks,
    isLoading: board.isLoading,
    tasksError: board.tasksError,
    fetchTasks: board.fetchTasks,
    refreshTasks: board.refreshTasks,
    scheduleTaskRefresh: board.scheduleTaskRefresh,
    upsertTask: board.upsertTask,
    createTask: mutations.createTask,
    deleteTask: mutations.deleteTask,
    getTask: mutations.getTask,
    getTaskReports: mutations.getTaskReports,
    advanceTask: mutations.advanceTask,
    executeTaskStage: mutations.executeTaskStage,
    rejectTask: mutations.rejectTask,
    rejectTaskWithFeedback: mutations.rejectTaskWithFeedback,
    openFeedbackDialog: mutations.openFeedbackDialog,
    closeFeedbackDialog: mutations.closeFeedbackDialog,
    jumpTask: mutations.jumpTask,
    moveTask: board.moveTask,
    completeTask: mutations.completeTask,
    updateTask: mutations.updateTask,
    feedbackTask: mutations.feedbackTask,
    followUpTask: mutations.followUpTask,
    steerTask: mutations.steerTask,
    pauseTask: mutations.pauseTask,
    resumeTask: mutations.resumeTask,
    retryTask: mutations.retryTask,
    abortTask: mutations.abortTask,
    checkTaskStuck: mutations.checkTaskStuck,
  };
}
