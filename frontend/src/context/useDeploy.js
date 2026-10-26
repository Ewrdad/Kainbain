import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';

/***
 * MARK: useDeploy
 * @description Owns the self-deployment state for the UI: live status (running,
 *   last result, history), the deploy log, and actions to trigger a deploy,
 *   trigger a fast deploy, or roll back. Polls status while a deploy is running
 *   so the UI reflects progress even though the deploy restarts the API.
 * @example const deploy = useDeploy()
 ***/
export function useDeploy() {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollTimerRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api.deployStatus();
      setStatus(data);
      setError(null);
      return data;
    } catch (e) {
      logger.error('Failed to fetch deploy status', e);
      setError('Could not reach the deploy service.');
      return null;
    }
  }, []);

  const refreshLog = useCallback(async () => {
    try {
      const data = await api.deployLog(300);
      setLog(data.log || '');
    } catch (e) {
      logger.error('Failed to fetch deploy log', e);
    }
  }, []);

  // Poll status + log while a deploy is running (the API restarts mid-deploy,
  // so polling is the only reliable way to observe completion).
  useEffect(() => {
    if (status?.running) {
      pollTimerRef.current = setInterval(async () => {
        const s = await refreshStatus();
        if (s && !s.running) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        refreshLog();
      }, 3000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [status?.running, refreshStatus, refreshLog]);

  const triggerDeploy = useCallback(
    async (fast = false) => {
      setLoading(true);
      setError(null);
      try {
        await api.triggerDeploy(fast);
        await refreshStatus();
        await refreshLog();
      } catch (e) {
        logger.error('Failed to trigger deploy', e);
        setError(e.message || 'Failed to trigger deploy.');
      } finally {
        setLoading(false);
      }
    },
    [refreshStatus, refreshLog],
  );

  const triggerRollback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.triggerRollback();
      await refreshStatus();
      await refreshLog();
    } catch (e) {
      logger.error('Failed to trigger rollback', e);
      setError(e.message || 'Failed to trigger rollback.');
    } finally {
      setLoading(false);
    }
  }, [refreshStatus, refreshLog]);

  // Initial load.
  useEffect(() => {
    void (async () => {
      await refreshStatus();
      await refreshLog();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    log,
    loading,
    error,
    refreshStatus,
    refreshLog,
    triggerDeploy,
    triggerRollback,
  };
}
