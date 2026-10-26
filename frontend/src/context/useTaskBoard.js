// Domain: context/tasks — board state (list, fetch, coalesced live-sync).
// Owns the task array and the read paths; mutations live in useTaskMutations.
import { useCallback, useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
import { sweepTaskDrafts } from '../services/taskDrafts';

/***
 * MARK: isValidProjectId
 * @description Validates that a project ID is syntactically valid and not a stage ID or workflow ID.
 * @param {string} [projectId]
 * @returns {boolean}
 ***/
export function isValidProjectId(projectId) {
  if (typeof api?.isValidProjectId === 'function') {
    return api.isValidProjectId(projectId);
  }
  if (!projectId || typeof projectId !== 'string') return false;
  const trimmed = projectId.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('wf-') || trimmed.startsWith('stage-')) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return true;
}

export function useTaskBoard() {
  const [tasks, setTasks] = useState([]);
  // True while a task-list fetch is in flight; the board shows a skeleton
  // instead of a silent empty board on slow links. tasksError carries the
  // last fetch failure (cleared on success) so the board can offer a retry.
  const [isLoading, setIsLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);
  const inFlightRef = useRef(0);
  const fetchSequenceRef = useRef(0);
  // Coalescing refresh used by live-sync sources (WebSocket task events and the
  // visibility-aware board poll) so bursts of events map to a single fetch.
  const refreshTimerRef = useRef(null);
  const pendingProjectRef = useRef(null);

  const fetchTasks = useCallback(async (projectId) => {
    if (!projectId) return;
    if (!isValidProjectId(projectId)) {
      logger.warn(`Invalid projectId passed to fetchTasks: ${projectId}`);
      return;
    }
    const seq = ++fetchSequenceRef.current;
    inFlightRef.current += 1;
    setIsLoading(true);
    try {
      const data = await api.listTasks(projectId);
      if (seq === fetchSequenceRef.current && Array.isArray(data)) {
        setTasks(data);
        setTasksError(null);
        // Cache hygiene: a draft whose task is no longer on the board can
        // never be saved, so drop it on load (other projects are untouched and
        // a transient empty list is ignored by the sweep itself).
        sweepTaskDrafts({ projectId, validTaskIds: data.map((t) => t?.id).filter(Boolean) });
      }
    } catch (e) {
      logger.error('Failed to fetch tasks', e);
      if (seq === fetchSequenceRef.current) setTasksError(e);
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current <= 0) {
        inFlightRef.current = 0;
        setIsLoading(false);
      }
    }
  }, []);

  // Alias kept for callers that read better as "refresh".
  const refreshTasks = fetchTasks;

  /***
   * MARK: scheduleTaskRefresh
   * @description Debounces/coalesces live-sync refreshes (WebSocket
   *   TASK_UPDATED/TASK_DELETED events, visibility-aware polling) so a burst of
   *   events collapses into a single fetch. Rejects stale timers when the
   *   project changes, so the fetch always targets the latest active project.
   * @example scheduleTaskRefresh('proj-1')
   * @param {string} projectId
   **/
  const scheduleTaskRefresh = useCallback(
    (projectId) => {
      if (!projectId || !isValidProjectId(projectId)) return;
      pendingProjectRef.current = projectId;
      if (refreshTimerRef.current) return; // already queued
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        const pid = pendingProjectRef.current;
        pendingProjectRef.current = null;
        fetchTasks(pid);
      }, 150);
    },
    [fetchTasks],
  );

  // Clear a pending coalesced refresh on unmount so a late fire never updates
  // state after the hook is torn down.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  /***
   * MARK: upsertTask
   * @description Merges a single task snapshot (a WebSocket TASK_UPDATED payload
   *   or a freshly created task) straight into the local board without a full
   *   list fetch: the card appears or refreshes instantly. An unknown task is
   *   prepended (new card), a known one is replaced in place.
   * @example upsertTask({ id: 'task-9', goal: 'New work', currentStageId: '1' })
   * @param {Object} task - Full task snapshot (must carry an id).
   * @returns {boolean} True when the task was merged into the board.
   ***/
  const upsertTask = useCallback((task) => {
    if (!task || !task.id) return false;
    setTasks((prevTasks) => {
      const exists = prevTasks.some((t) => String(t.id) === String(task.id));
      if (!exists) return [task, ...prevTasks];
      return prevTasks.map((t) => (String(t.id) === String(task.id) ? task : t));
    });
    return true;
  }, []);

  /***
   * MARK: moveTask
   * @description Moves a task to a designated stage with immediate optimistic state update to prevent snap-back during drag-and-drop.
   * @param {string} projectId
   * @param {string} taskId
   * @param {string} stageId
   * @example await moveTask('proj-1', 'task-1', 'stage-2')
   ***/
  const moveTask = useCallback(
    async (projectId, taskId, stageId) => {
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          String(t.id) === String(taskId) ? { ...t, currentStageId: String(stageId) } : t,
        ),
      );
      try {
        await api.moveTask(projectId, taskId, stageId);
        await refreshTasks(projectId);
      } catch (e) {
        logger.error('Failed to move task', e);
        await refreshTasks(projectId);
      }
    },
    [refreshTasks],
  );

  return {
    tasks,
    setTasks,
    isLoading,
    tasksError,
    fetchTasks,
    refreshTasks,
    scheduleTaskRefresh,
    upsertTask,
    moveTask,
  };
}
