import { useEffect, useRef } from 'react';

/***
 * MARK: useGlassesRefreshTick
 * @description Calls the given refresh on a steady beat (default every 5s)
 *   so the Meta Ray-Ban views update by themselves. A tick is skipped while
 *   the tab is hidden, while the caller pauses it (confirm dialog or
 *   details open), or while the previous refresh is still in flight — a
 *   slow backend can delay ticks but never stack them. The timer stops on
 *   unmount. The latest refresh is always called, so callers pass inline
 *   callbacks without re-subscribing.
 * @example useGlassesRefreshTick(() => refreshTasks(projectId), { paused: confirming });
 * @param {Function} onRefresh - Refresh to call on each tick.
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs=5000] - Milliseconds between ticks.
 * @param {boolean} [opts.paused=false] - True pauses the beat until cleared.
 ***/
export function useGlassesRefreshTick(onRefresh, { intervalMs = 5000, paused = false } = {}) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (paused) return undefined;
    if (typeof refreshRef.current !== 'function') return undefined;
    const cadence = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000;
    let stopped = false;
    let inFlight = false;
    const tick = () => {
      if (stopped || paused || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const refresh = refreshRef.current;
      if (typeof refresh !== 'function') return;
      let result;
      try {
        result = refresh();
      } catch {
        return;
      }
      if (result && typeof result.then === 'function') {
        inFlight = true;
        result.then(
          () => {
            inFlight = false;
          },
          () => {
            inFlight = false;
          },
        );
      }
    };
    const timerId = setInterval(tick, cadence);
    return () => {
      stopped = true;
      clearInterval(timerId);
    };
    // The refresh runs through a ref on purpose: re-subscribing on every
    // inline-callback identity change would restart the beat on each render.
  }, [intervalMs, paused]);
}
