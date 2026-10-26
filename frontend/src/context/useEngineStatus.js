// Domain: context — engine + subsystem health status.
// Owns compute running flag, health snapshot, and their polling effects.
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
export function useEngineStatus({ notifySuccess, notifyInfo, notifyError, engineState } = {}) {
  const [computeRunning, setComputeRunning] = useState(false);
  const [healthState, setHealthState] = useState({
    status: 'unknown',
    timestamp: null,
    checks: {
      litellm: { status: 'unknown', message: 'Checking LiteLLM...' },
      device: { status: 'unknown', message: 'Checking Host Device...' },
      ollamaCloud: { status: 'unknown', message: 'Checking Ollama Cloud...' },
    },
  });
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false);

  // ---- Engine & Subsystem Health status ----
  const fetchHealth = useCallback(async (refresh = false) => {
    try {
      setIsHealthRefreshing(true);
      const data = await api.healthStatus(refresh);
      if (data && data.checks) {
        setHealthState(data);
      }
    } catch (e) {
      logger.error('Failed to fetch health status', e);
    } finally {
      setIsHealthRefreshing(false);
    }
  }, []);

  // Poll health checks periodically every 30 seconds with tab visibility pausing
  useEffect(() => {
    let alive = true;
    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const loadHealth = async () => {
      if (alive && isVisible()) {
        await fetchHealth();
      }
    };
    void loadHealth();

    const interval = setInterval(() => {
      if (alive && isVisible()) {
        void fetchHealth();
      }
    }, 30000);

    const onVisibility = () => {
      if (alive && isVisible()) {
        void fetchHealth();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onVisibility);
    }

    return () => {
      alive = false;
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibility);
      }
    };
  }, [fetchHealth]);

  // ---- Compute status ----
  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.computeStatus();
      setComputeRunning(data.running);
    } catch (e) {
      logger.error('Failed to fetch status', e);
    }
  }, []);

  const toggleCompute = useCallback(
    async (projectId) => {
      // Single pipeline: the dispatcher is global, and stop must interrupt the
      // OWNER's live run (cancelProjectExecutions + session dispose are
      // project-scoped on the backend). Resolve the target from the engine
      // owner, not the selected project; idle engines name no owner, so start
      // keeps the selected project for its new session.
      const targetProjectId = engineState?.activeProjectId || projectId;
      const endpoint = computeRunning ? api.computeStop : api.computeStart;
      try {
        const data = await endpoint(targetProjectId);
        setComputeRunning(data.running);
        if (data.running) {
          notifySuccess('Compute engine started', 'Engine Active');
        } else {
          notifyInfo('Compute engine stopped', 'Engine Idle');
        }
      } catch (e) {
        logger.error('Failed to toggle compute', e);
        notifyError('Failed to toggle compute engine', 'Compute Error');
      }
    },
    [computeRunning, notifySuccess, notifyInfo, notifyError, engineState?.activeProjectId],
  );

  return {
    computeRunning,
    healthState,
    isHealthRefreshing,
    fetchHealth,
    fetchStatus,
    toggleCompute,
  };
}
