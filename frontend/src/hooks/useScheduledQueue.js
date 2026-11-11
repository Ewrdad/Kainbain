import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { subscribeObservability } from '../services/observabilityEvents';
import { INVALIDATION_DEBOUNCE_MS, QUEUE_POPUP_POLL_MS } from '../services/pollingCadences.js';
import { logger } from '../services/logger';

/***
 * MARK: useScheduledQueue
 * @description Shared frontend hook for the dispatch-ordered queue shown by the
 *   Now Playing bar's queue popup (and any future queue surface). Data source
 *   is the global observability snapshot (`api.observabilityStatus(undefined)`
 *   serves every project in dispatch order, so no new endpoint was needed).
 *   Fetches on enable only, refreshes on observability invalidations, and
 *   keeps a 15 s safety poll plus visibility/focus returns. The monitor
 *   dashboard deliberately keeps its own inline fetch: it publishes metrics
 *   and queue atomically from one response with monitor-only guards
 *   (TASK_UPDATED active-task filter, hidden-tab gating, a staleness rule),
 *   which this queue-only hook does not replicate. The return contract is
 *   exactly four fields (`items`, `loading`, `error`, `refresh`) — callers
 *   destructure those, nothing else. A missing API method surfaces as
 *   `error`, never as a silent empty queue; a malformed payload logs a
 *   warning and fails safe to an empty list.
 * @example const { items, loading, error, refresh } = useScheduledQueue({ projectScope: 'all', enabled: isOpen })
 * @param {Object} [opts]
 * @param {string} [opts.projectScope='all'] - 'all' or a project id.
 * @param {boolean} [opts.enabled=false] - Fetching is off until this is true.
 * @returns {{
 *   items: Array<Object>,
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => void,
 * }}
 ***/
export function useScheduledQueue({ projectScope = 'all', enabled = false } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const fetchInFlightRef = useRef(false);
  const pendingRefreshRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQueue = async (refresh = false) => {
    if (!enabled) return;
    if (fetchInFlightRef.current) {
      if (refresh) pendingRefreshRequestedRef.current = true;
      return;
    }
    fetchInFlightRef.current = true;
    pendingRefreshRequestedRef.current = false;
    if (mountedRef.current) {
      setLoading(true);
    }
    try {
      const projectId = projectScope && projectScope !== 'all' ? projectScope : undefined;
      if (typeof api?.observabilityStatus !== 'function') {
        throw new Error('Queue endpoint is unavailable');
      }
      const response = await api.observabilityStatus(projectId, refresh);
      if (!mountedRef.current) return;
      const rawQueue =
        response?.observability?.queue ??
        response?.queue ??
        (Array.isArray(response) ? response : null);
      if (rawQueue != null && !Array.isArray(rawQueue)) {
        logger.warn('Scheduled queue payload was not an array; treating as empty');
        setItems([]);
      } else {
        setItems(rawQueue ?? []);
      }
      setError(null);
    } catch (err) {
      logger.error('Failed to fetch scheduled queue', err);
      if (mountedRef.current) {
        setError(err?.message || 'Failed to load queue');
      }
    } finally {
      fetchInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
      if (mountedRef.current && pendingRefreshRequestedRef.current) {
        pendingRefreshRequestedRef.current = false;
        void fetchQueue(true);
      }
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    void fetchQueue();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchQueue closes over enabled/projectScope which are already deps; its identity is intentionally unstable to let the compiler auto-memoize
  }, [enabled, projectScope]);

  useEffect(() => {
    if (!enabled) return undefined;
    let debounceTimer = null;
    const scheduleRefresh = () => {
      pendingRefreshRequestedRef.current = true;
      if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (mountedRef.current) {
            void fetchQueue(true);
          }
        }, INVALIDATION_DEBOUNCE_MS);
      }
    };
    const unsubscribe = subscribeObservability((event) => {
      if (
        event?.projectId &&
        projectScope &&
        projectScope !== 'all' &&
        event.projectId !== projectScope
      ) {
        return;
      }
      scheduleRefresh();
    });
    const interval = setInterval(() => void fetchQueue(true), QUEUE_POPUP_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') void fetchQueue(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      unsubscribe();
      clearInterval(interval);
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchQueue closes over enabled/projectScope which are already deps; its identity is intentionally unstable to let the compiler auto-memoize
  }, [enabled, projectScope]);

  const refresh = () => {
    void fetchQueue(true);
  };

  return { items, loading, error, refresh };
}

/***
 * MARK: useScheduledQueue default
 * @description Default export alias for useScheduledQueue.
 * @example useScheduledQueue({ enabled: true }) => { items: [], loading: false }
 ***/
export default useScheduledQueue;
