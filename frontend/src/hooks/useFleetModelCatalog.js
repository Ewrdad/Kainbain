import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { fleetCountsById } from './useFleetModelCatalog/fleetCountsById';

// Re-exported so existing consumers keep one import site for the pure
// mapper alongside the hook.
export { fleetCountsById } from './useFleetModelCatalog/fleetCountsById';

/***
 * MARK: useFleetModelCatalog
 * @description Fetches the fleet model catalogue (derived live from Runner
 *   registrations) once on mount: per-model runner availability for the
 *   stage, default, and alias pickers. No client cache — the backend
 *   derives it per request, so joins, leaves, and allowlist edits reflect
 *   on the next mount or manual `refresh()`. Failures resolve to an empty
 *   map (pickers render badge-free, never mislead).
 * @example const { counts, loading, loaded, refresh } = useFleetModelCatalog();
 * @param {Object} [opts]
 * @param {boolean} [opts.enabled=true] - When false, no request until it flips true.
 * @returns {{counts: Object, loading: boolean, loaded: boolean, refresh: Function}}
 ***/
export function useFleetModelCatalog({ enabled = true } = {}) {
  const [counts, setCounts] = useState({});
  const [harnesses, setHarnesses] = useState([]);
  const [models, setModels] = useState([]);
  const [quarantined, setQuarantined] = useState([]);
  // True only after a catalogue fetch succeeds: pickers gate badges on this
  // (not on `counts` being non-empty) so a failed fetch — or a backend
  // without the endpoint — renders badge-free instead of "0 runners".
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(
    () => enabled && typeof api.getFleetModelCatalog === 'function',
  );

  useEffect(() => {
    if (!enabled || typeof api.getFleetModelCatalog !== 'function') {
      return undefined;
    }
    let isMounted = true;
    api
      .getFleetModelCatalog()
      .then((res) => {
        if (!isMounted) return;
        setCounts(fleetCountsById(res));
        setHarnesses(Array.isArray(res?.harnesses) ? res.harnesses : []);
        setModels(Array.isArray(res?.models) ? res.models : []);
        setQuarantined(Array.isArray(res?.quarantined) ? res.quarantined : []);
        setLoaded(true);
      })
      .catch(() => {
        if (isMounted) setCounts({});
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (typeof api.getFleetModelCatalog !== 'function') return;
    try {
      const res = await api.getFleetModelCatalog();
      setCounts(fleetCountsById(res));
      setHarnesses(Array.isArray(res?.harnesses) ? res.harnesses : []);
      setModels(Array.isArray(res?.models) ? res.models : []);
      setQuarantined(Array.isArray(res?.quarantined) ? res.quarantined : []);
      setLoaded(true);
    } catch {
      // Keep the current map; a refresh failure never downgrades `loaded`.
    }
  }, []);

  return { counts, loading, loaded, refresh, harnesses, models, quarantined };
}
