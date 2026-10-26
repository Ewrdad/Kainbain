import { useEffect, useState } from 'react';

/***
 * MARK: tickSources
 * @description Module-level shared tick sources, one interval per distinct
 * cadence no matter how many cards subscribe. Every card age on the board
 * (and the inspector's live row) re-renders from the same 60s broadcast
 * instead of each owning a timer.
 ***/
const tickSources = new Map();

/***
 * MARK: readClock
 * @description Reads the wall clock for tick state. A named seam (rather
 * than inline Date.now calls) so render purity stays checkable and every
 * tick read flows through one place.
 * @example readClock() => 1759233600000
 * @returns {number} Current epoch milliseconds.
 ***/
function readClock() {
  return Date.now();
}

/***
 * MARK: subscribeToTick
 * @description Subscribes one listener to the shared interval for a cadence,
 * starting the interval on first subscribe and stopping it when the last
 * listener leaves. Ticks pause while the tab is hidden, matching the board
 * polling safety net (see useBoardSync).
 * @example const stop = subscribeToTick(60000, setNowMs);
 * @param {number} intervalMs - Milliseconds between ticks.
 * @param {Function} listener - Called with the fresh timestamp on each tick.
 * @returns {Function} Unsubscribe function.
 ***/
function subscribeToTick(intervalMs, listener) {
  let source = tickSources.get(intervalMs);
  if (!source) {
    source = { listeners: new Set(), timerId: null };
    source.timerId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = readClock();
      for (const notify of [...source.listeners]) notify(now);
    }, intervalMs);
    // The board owns a matching cleanup: when the last card unsubscribes
    // the interval is cleared, so idle boards and finished tests hold no
    // timers. Allow the process to exit without waiting for it in runtimes
    // whose timers support unref (node test runners).
    if (source.timerId && typeof source.timerId.unref === 'function') {
      source.timerId.unref();
    }
    tickSources.set(intervalMs, source);
  }
  source.listeners.add(listener);
  return () => {
    source.listeners.delete(listener);
    if (source.listeners.size === 0) {
      clearInterval(source.timerId);
      tickSources.delete(intervalMs);
    }
  };
}

/***
 * MARK: useNow
 * @description Single shared tick source for card ages and the inspector's
 * live elapsed row. The board already refreshes its data over the WebSocket
 * plus an 8s foreground polling safety net (see useBoardSync), so this tick
 * only smooths the displayed elapsed time — 60s keeps every visible age
 * fresh while all subscribers share one interval. Safe to call in every
 * card; pass an explicit `nowMs` prop instead when a test needs a frozen
 * clock.
 * @example const nowMs = useNow();
 * @param {number} [intervalMs=60000] - Milliseconds between ticks.
 * @returns {number} Current epoch milliseconds, updated on each tick.
 ***/
export function useNow(intervalMs = 60000) {
  const [nowMs, setNowMs] = useState(() => readClock());

  useEffect(() => {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval <= 0) return undefined;
    return subscribeToTick(interval, setNowMs);
  }, [intervalMs]);

  return nowMs;
}
