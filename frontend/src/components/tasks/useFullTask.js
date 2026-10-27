import { useEffect, useState } from 'react';

/***
 * MARK: useFullTask
 * @description Hydrates a board-summary task into its full record for
 *   read-only surfaces (the Logs tab): summaries strip log entries for
 *   list weight, so without this the viewer only ever shows the live
 *   websocket feed — "this session". Fetches `GET /tasks/:id` once per
 *   task id and only when the prop lacks entries; any failure (or a
 *   missing fetcher) falls back to the prop task, so the viewer degrades
 *   to today's behavior instead of breaking. Never used for edits.
 * @param {Object} [opts]
 * @param {Object} [opts.task] - Board-summary (or full) task.
 * @param {string} [opts.activeProjectId] - Project scope for the fetch.
 * @param {Function} [opts.getTask] - `(projectId, taskId) => Promise<task>`.
 * @example const logsTask = useFullTask({ task, activeProjectId, getTask });
 * @returns {Object} Full task when hydrated, else the prop task.
 ***/
export function useFullTask({ task, activeProjectId, getTask } = {}) {
  const [full, setFull] = useState(null);
  const taskId = task?.id;
  const hasLogs =
    (Array.isArray(task?.logEntries) && task.logEntries.length > 0) || task?.processLogs;

  // Reset the hydrated record whenever the inputs change. Done during
  // render (the documented adjust-state-when-props-change pattern) rather
  // than with a synchronous setState inside the fetch effect below.
  const [resetKey, setResetKey] = useState(null);
  const key = `${taskId}|${activeProjectId}|${hasLogs ? 1 : 0}|${typeof getTask}`;
  if (resetKey !== key) {
    setResetKey(key);
    setFull(null);
  }

  useEffect(() => {
    if (!taskId || !activeProjectId || hasLogs || typeof getTask !== 'function') return;
    let live = true;
    getTask(activeProjectId, taskId).then(
      (data) => {
        if (live && data && data.id === taskId) setFull(data);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [taskId, activeProjectId, hasLogs, getTask]);

  return full && full.id === taskId ? full : task;
}
