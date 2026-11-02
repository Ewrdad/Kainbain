import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

/***
 * MARK: fleetCountsById
 * @description Indexes a fleet catalogue payload by model id for option
 *   badges: `{ [id]: { runnerCount, runnerIds, harnesses, tiers } }`.
 *   Malformed entries never crash a picker — they are skipped.
 * @example fleetCountsById({ models: [{ id: 'm', runnerCount: 2, runnerIds: ['r1', 'r2'] }] })
 *   => { m: { runnerCount: 2, runnerIds: ['r1', 'r2'], harnesses: [], tiers: [] } }
 * @param {Object} [payload] - `/runners/models/catalogue` response.
 * @returns {Object} Id-keyed availability map.
 ***/
export function fleetCountsById(payload) {
  const map = {};
  const list = Array.isArray(payload?.models) ? payload.models : [];
  for (const entry of list) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (!id || Object.hasOwn(map, id)) continue;
    map[id] = {
      runnerCount: typeof entry.runnerCount === 'number' ? entry.runnerCount : 0,
      runnerIds: Array.isArray(entry.runnerIds)
        ? entry.runnerIds.filter((r) => typeof r === 'string')
        : [],
      harnesses: Array.isArray(entry.harnesses)
        ? entry.harnesses.filter((h) => typeof h === 'string')
        : [],
      tiers: Array.isArray(entry.tiers)
        ? entry.tiers.filter((t) => typeof t === 'string')
        : [],
    };
  }
  return map;
}

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
  // True only after a catalogue fetch succeeds: pickers gate badges on this
  // (not on `counts` being non-empty) so a failed fetch — or a backend
  // without the endpoint — renders badge-free instead of "No runners".
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
      setLoaded(true);
    } catch {
      // Keep the current map; a refresh failure never downgrades `loaded`.
    }
  }, []);

  return { counts, loading, loaded, refresh };
}
