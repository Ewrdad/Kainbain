import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

/***
 * MARK: useTaskHistories
 * @description Loads the duration-enriched task summaries (`GET /tasks`) for
 *   the retrospective bird's-eye list and hydrates one full task
 *   (`GET /tasks/:id`) when its row expands. Client-side only — no new query
 *   params; sorting/filtering happens in the panel over this data.
 * @example const { tasks, loading, expandedTask, toggleExpanded } = useTaskHistories({ projectId });
 * @param {Object} [opts]
 * @param {string} [opts.projectId] - Active project id.
 * @returns {{tasks: Array<Object>, loading: boolean, error: string|null, refresh: Function, expandedId: string|null, expandedTask: Object|null, expanding: boolean, toggleExpanded: Function}}
 ***/
export function useTaskHistories({ projectId } = {}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [expanding, setExpanding] = useState(false);
  const hydratedCache = useRef(new Map());
  const requestSeq = useRef(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Retry is an event-handler state bump (never a sync effect setState):
  // the mount effect below re-runs on the nonce and resolves everything in
  // async continuations — same pattern as useModelCatalog.
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    api
      .listTasks(projectId)
      .then((list) => {
        if (requestSeq.current !== seq) return;
        setTasks(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (requestSeq.current !== seq) return;
        setTasks([]);
        setError(err?.message || 'Failed to load task histories.');
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  }, [projectId, refreshNonce]);

  const toggleExpanded = useCallback(
    async (taskId) => {
      if (!taskId) return;
      if (expandedId === taskId) {
        setExpandedId(null);
        setExpandedTask(null);
        return;
      }
      setExpandedId(taskId);
      const cached = hydratedCache.current.get(taskId);
      if (cached) {
        setExpandedTask(cached);
        return;
      }
      // Fall back to the summary row while the full task loads.
      setExpandedTask(tasks.find((t) => t?.id === taskId) || null);
      setExpanding(true);
      try {
        const full = await api.getTask(projectId, taskId);
        if (full && typeof full === 'object') {
          hydratedCache.current.set(taskId, full);
          setExpandedTask((prev) => (prev?.id === taskId || !prev ? full : prev));
        }
      } catch {
        // Keep rendering the summary row; expansion detail is best-effort.
      } finally {
        setExpanding(false);
      }
    },
    [expandedId, projectId, tasks],
  );

  return {
    tasks,
    loading,
    error,
    refresh,
    expandedId,
    expandedTask,
    expanding,
    toggleExpanded,
  };
}
