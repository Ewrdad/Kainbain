// Domain: The Work — submit-time feedback validation (UI shell).
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

/***
 * MARK: useFeedbackAssets
 * @description Lists a task's attached image names for client-side feedback
 *   validation. The list is advisory-instant (refreshed when the composer
 *   opens and after every upload); the server re-validates authoritatively,
 *   so a listing failure degrades to `available: false` (pre-check skipped,
 *   server still guards) instead of ever blocking the reviewer.
 * @example const { names, available, refresh } = useFeedbackAssets(projectId, taskId);
 * @param {string} projectId - Owning project id.
 * @param {string} taskId - Owning task id.
 * @returns {{names: string[], available: boolean, refresh: Function}} Attached names, list health, and a re-fetch resolving `{ names, available }`.
 ***/
export function useFeedbackAssets(projectId, taskId) {
  const [names, setNames] = useState([]);
  const [available, setAvailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId || !taskId) {
      setNames([]);
      setAvailable(false);
      return { names: [], available: false };
    }
    try {
      const result = await api.listTaskImages(projectId, taskId);
      const list = Array.isArray(result?.images)
        ? result.images.map((image) => image?.name).filter(Boolean)
        : [];
      setNames(list);
      setAvailable(true);
      return { names: list, available: true };
    } catch {
      // Listing failures skip the client pre-check (fail-open): the
      // server's 422 still guards the submit, so the reviewer is never
      // blocked by a transient list outage.
      setNames([]);
      setAvailable(false);
      return { names: [], available: false };
    }
  }, [projectId, taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { names, available, refresh };
}
