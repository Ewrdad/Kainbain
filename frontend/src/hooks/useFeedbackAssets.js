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

  // Pure fetch (no setState): shared by the mount effect and refresh().
  // Listing failures resolve to fail-open (`available: false`) so the
  // client pre-check is skipped — the server's 422 still guards the
  // submit, so the reviewer is never blocked by a transient list outage.
  const fetchNames = useCallback(async () => {
    if (!projectId || !taskId) {
      return { names: [], available: false };
    }
    try {
      const result = await api.listTaskImages(projectId, taskId);
      const list = Array.isArray(result?.images)
        ? result.images.map((image) => image?.name).filter(Boolean)
        : [];
      return { names: list, available: true };
    } catch {
      return { names: [], available: false };
    }
  }, [projectId, taskId]);

  const refresh = useCallback(async () => {
    const fresh = await fetchNames();
    setNames(fresh.names);
    setAvailable(fresh.available);
    return fresh;
  }, [fetchNames]);

  // Mount fetch as a promise chain (never a sync effect call — the
  // react-hooks/set-state-in-effect rule): state only settles in async
  // continuations, and the cancelled flag drops late responses.
  useEffect(() => {
    let cancelled = false;
    fetchNames().then((fresh) => {
      if (cancelled) return;
      setNames(fresh.names);
      setAvailable(fresh.available);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchNames]);

  return { names, available, refresh };
}
