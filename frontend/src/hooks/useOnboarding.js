import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

/***
 * MARK: useOnboarding
 * @description Fetches the first-run onboarding summary (`GET /onboarding`:
 *   Runner bootstrap story, project/task counts, unadopted checkouts, and
 *   the precomputed guided checklist) once on mount. The empty state and
 *   checklist UIs read this alone instead of three separate fetches.
 *   Failures resolve to a null summary (callers render static CTAs, never
 *   a blank board), and a backend without the endpoint is tolerated the
 *   same way an unreachable one is.
 * @example const { summary, loading, loaded, refresh } = useOnboarding();
 * @param {Object} [opts]
 * @param {boolean} [opts.enabled=true] - When false, no request until it flips true.
 * @returns {{summary: Object|null, loading: boolean, loaded: boolean, refresh: Function}}
 ***/
export function useOnboarding({ enabled = true } = {}) {
  const [summary, setSummary] = useState(null);
  // True only after a summary fetch succeeds: callers gate the
  // server-confirmed empty state on this (not on `summary` merely
  // resolving) so a failed fetch renders static CTAs instead of a
  // misleading "zero projects" board.
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(
    () => enabled && typeof api.getOnboarding === 'function',
  );

  useEffect(() => {
    if (!enabled || typeof api.getOnboarding !== 'function') {
      return undefined;
    }
    let isMounted = true;
    api
      .getOnboarding()
      .then((res) => {
        if (!isMounted) return;
        setSummary(res && typeof res === 'object' ? res : null);
        setLoaded(true);
      })
      .catch(() => {
        if (isMounted) setSummary(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (typeof api.getOnboarding !== 'function') return null;
    try {
      const res = await api.getOnboarding();
      const next = res && typeof res === 'object' ? res : null;
      setSummary(next);
      setLoaded(true);
      return next;
    } catch {
      // Keep the current summary; a refresh failure never downgrades `loaded`.
      return null;
    }
  }, []);

  return { summary, loading, loaded, refresh };
}
