import { useEffect, useRef, useState } from 'react';

/***
 * MARK: findTaskById
 * @description Looks a task up in the board list by id, comparing as strings
 *   because route params are always strings while stored ids may not be.
 * @param {Object} opts
 * @param {Object[]} [opts.tasks] - Board task list from context.
 * @param {string} [opts.taskId] - Id to look for.
 * @example const listTask = findTaskById({ tasks, taskId: 'task-101' });
 * @returns {Object|null} The matching task, or null.
 ***/
export const findTaskById = ({ tasks, taskId } = {}) => {
  if (!taskId || !Array.isArray(tasks)) return null;
  return tasks.find((t) => String(t?.id) === String(taskId)) || null;
}

/***
 * MARK: useRouteTask
 * @description Resolves which task the full-page detail view shows.
 *   Order: explicit prop -> context selection -> board-list record matching
 *   the route id -> a one-off `GET /tasks/:id` when the route id is not in
 *   the list yet. The fetch exists because a deep link (or a hash navigation
 *   right after creating a task) can arrive before the websocket has pushed
 *   the new task into the board list; previously the page fell back to
 *   `tasks[0]` and silently showed a DIFFERENT task. A deep link must never
 *   do that, so with a route id we only ever show the requested task, a
 *   loading state, or null (Not Found). `tasks[0]` is used only when there
 *   is no route id at all (legacy no-route behaviour). Once the task shows
 *   up in the live list, the list record wins over the fetched snapshot so
 *   live updates keep flowing. Stale responses (route changed, unmounted,
 *   or the task arrived via the list) and records whose id does not match
 *   are ignored.
 * @param {Object} opts
 * @param {Object} [opts.propTask] - Explicit task override from props.
 * @param {Object} [opts.ctxSelectedTask] - Task selected in context.
 * @param {string|null} [opts.routeTaskId] - Task id from the route.
 * @param {Object[]} [opts.tasks] - Board task list from context.
 * @param {string} [opts.activeProjectId] - Project scope for the fetch.
 * @param {Function} [opts.getTask] - `(projectId, taskId) => Promise<task>`.
 * @example const { task, loading } = useRouteTask({ propTask, ctxSelectedTask,
 *   routeTaskId, tasks, activeProjectId, getTask });
 * @returns {{ task: Object|null, loading: boolean }}
 ***/
export function useRouteTask({
  propTask,
  ctxSelectedTask,
  routeTaskId,
  tasks = [],
  activeProjectId,
  getTask,
} = {}) {
  // Settled fetch result, tagged with the request key it belongs to so a
  // result for a previous route/project can never be shown for the current one.
  const [settledFetch, setSettledFetch] = useState({ key: null, task: null });

  // Keep the latest fetcher in a ref so an unstable `getTask` identity from
  // context does not cancel and re-issue the in-flight request every render.
  const getTaskRef = useRef(getTask);
  useEffect(() => {
    getTaskRef.current = getTask;
  }, [getTask]);

  const listTask = findTaskById({ tasks, taskId: routeTaskId });
  const hasOverride = Boolean(propTask || ctxSelectedTask);
  const canFetch = Boolean(activeProjectId) && typeof getTask === 'function';
  const needsFetch = !hasOverride && Boolean(routeTaskId) && !listTask && canFetch;
  const fetchKey = needsFetch ? `${activeProjectId}|${routeTaskId}` : null;

  useEffect(() => {
    if (!fetchKey) return undefined;
    let isCurrent = true;
    const acceptResult = (task) => {
      if (isCurrent) setSettledFetch({ key: fetchKey, task });
    };
    Promise.resolve()
      .then(() => getTaskRef.current(activeProjectId, routeTaskId))
      .then(
        (data) => acceptResult(data && String(data.id) === String(routeTaskId) ? data : null),
        () => acceptResult(null),
      );
    return () => {
      isCurrent = false;
    };
  }, [fetchKey, activeProjectId, routeTaskId]);

  if (propTask) return { task: propTask, loading: false };
  if (ctxSelectedTask) return { task: ctxSelectedTask, loading: false };
  if (!routeTaskId) return { task: tasks[0] || null, loading: false };
  if (listTask) return { task: listTask, loading: false };
  if (!needsFetch) return { task: null, loading: false };
  if (settledFetch.key !== fetchKey) return { task: null, loading: true };
  return { task: settledFetch.task, loading: false };
}
