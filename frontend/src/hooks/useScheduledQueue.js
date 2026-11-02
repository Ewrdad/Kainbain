/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { subscribeObservability } from '../services/observabilityEvents';
import { logger } from '../services/logger';

/***
 * MARK: useScheduledQueue
 * @description Shared frontend hook for the dispatch-ordered queue shown by the
 *   monitor and the Now Playing bar's queue popup. Fetches on enable only,
 *   refreshes on observability invalidations, and keeps a 15 s safety poll plus
 *   visibility/focus returns (mirroring ObservabilityDashboard). Returns the
 *   queue items under several convenience aliases so callers never fight over
 *   naming.
 * @example const { items, loading, error, refresh } = useScheduledQueue({ projectScope: 'all', enabled: isOpen })
 * @param {Object} [opts]
 * @param {string} [opts.projectScope='all'] - 'all' or a project id.
 * @param {boolean} [opts.enabled=false] - Fetching is off until this is true.
 * @returns {{
 *   items: Array<Object>,
 *   queue: Array<Object>,
 *   scheduledQueue: Array<Object>,
 *   loading: boolean,
 *   isLoading: boolean,
 *   error: string|null,
 *   refresh: () => void,
 *   reload: () => void,
 *   refetch: () => void,
 * }}
 ***/
export function useScheduledQueue({ projectScope = 'all', enabled = false } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQueue = useCallback(
    async (refresh = false) => {
      if (!enabled) return;
      if (inFlightRef.current) {
        if (refresh) dirtyRef.current = true;
        return;
      }
      inFlightRef.current = true;
      if (mountedRef.current) {
        setLoading(true);
      }
      try {
        const projectId =
          projectScope && projectScope !== 'all' ? projectScope : undefined;
        const response =
          typeof api?.observabilityStatus === 'function'
            ? await api.observabilityStatus(projectId, refresh)
            : null;
        if (!mountedRef.current) return;
        const queue =
          response?.observability?.queue ??
          response?.queue ??
          (Array.isArray(response) ? response : []);
        setItems(Array.isArray(queue) ? queue : []);
        setError(null);
      } catch (err) {
        logger.error('Failed to fetch scheduled queue', err);
        if (mountedRef.current) {
          setError(err?.message || 'Failed to load queue');
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
        if (mountedRef.current && dirtyRef.current) {
          dirtyRef.current = false;
          void fetchQueue(true);
        }
      }
    },
    [enabled, projectScope],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    void fetchQueue();
    return undefined;
  }, [enabled, fetchQueue]);

  useEffect(() => {
    if (!enabled) return undefined;
    let debounceTimer = null;
    const scheduleRefresh = () => {
      dirtyRef.current = true;
      if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (mountedRef.current) {
            void fetchQueue(true);
          }
        }, 500);
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
    const interval = setInterval(() => void fetchQueue(true), 15000);
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
  }, [enabled, fetchQueue, projectScope]);

  const refresh = useCallback(() => {
    void fetchQueue(true);
  }, [fetchQueue]);

  return {
    items,
    queue: items,
    scheduledQueue: items,
    data: items,
    loading,
    isLoading: loading,
    error,
    refresh,
    reload: refresh,
    refetch: refresh,
  };
}

/***
 * MARK: useScheduledQueue default
 * @description Default export alias for useScheduledQueue.
 * @example useScheduledQueue({ enabled: true }) => { items: [], loading: false }
 ***/
export default useScheduledQueue;
