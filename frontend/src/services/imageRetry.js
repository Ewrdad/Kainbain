// Domain: The Work — one shared image-load retry + failure-observability path
// for every task-image renderer (markdown images, attach thumbnails, failure
// thumbnails, explorer previews, survey illustrations). A transient miss (slow
// first byte, branch checkout flapping tracked bytes, cold server) must
// self-recover with bounded backoff instead of latching a broken chip, and
// every failure must be observable headless (counter + last-failure detail)
// so regressions are provable without eyeballing.
import { useState, useEffect, useRef, useCallback } from 'react';

/***
 * MARK: IMAGE_RETRY_DELAYS_MS
 * @description Backoff schedule for automatic image reloads: 1.5s, 3s, 6s.
 *   Three bounded attempts (~10s window) ride out branch-checkout flaps and
 *   cold starts; anything still failing is a real miss and latches with a
 *   manual Retry control (which restarts the budget).
 * @example IMAGE_RETRY_DELAYS_MS.length => 3
 ***/
export const IMAGE_RETRY_DELAYS_MS = [1500, 3000, 6000];

let failureCount = 0;
let lastFailure = null;

/***
 * MARK: getImageFailureStats
 * @description Headless-observable image failure record: how many `<img>`
 *   loads failed since boot (or the last reset) and the most recent failure
 *   detail (`{ src, component, attempt, hasTaskContext, at }`). HTTP status
 *   is unobtainable from `<img onError>` by browser design, so it is absent
 *   by construction — pair with the API's structured `reason` codes instead.
 * @example getImageFailureStats() => { count: 0, lastFailure: null }
 * @returns {{count: number, lastFailure: Object|null}}
 ***/
export const getImageFailureStats = () => ({ count: failureCount, lastFailure });

/***
 * MARK: resetImageFailureStats
 * @description Clears the headless failure record (test isolation; the UI
 *   never calls this).
 * @example resetImageFailureStats() => undefined
 ***/
export const resetImageFailureStats = () => {
  failureCount = 0;
  lastFailure = null;
};

/***
 * MARK: reportImageFailure
 * @description Records one failed image load: bumps the headless counter and
 *   warns on the console with the resolved URL, the renderer, the attempt
 *   number, and whether task context was present — the triple that classifies
 *   bucket (a) vs (b)/(c) in the field. Called by `useImageRetry` only.
 * @example reportImageFailure({ src: '/projects/p/tasks/t/images/a.png', component: 'md-image', attempt: 1, hasTaskContext: true })
 * @param {Object} detail - `{ src, component, attempt, hasTaskContext }`.
 * @returns {Object} The recorded failure (with timestamp).
 ***/
export const reportImageFailure = ({ src, component, attempt, hasTaskContext }) => {
  failureCount += 1;
  lastFailure = {
    src: typeof src === 'string' ? src : '',
    component: component || 'image',
    attempt: Number.isFinite(attempt) ? attempt : 0,
    hasTaskContext: Boolean(hasTaskContext),
    at: new Date().toISOString(),
  };
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[task-image] load failed', lastFailure);
  }
  return lastFailure;
};

/***
 * MARK: useImageRetry
 * @description Shared load/retry state for one image element: `failed` flips
 *   on `markFailed` (wire to `<img onError>`), then bounded automatic
 *   retries refetch with backoff (`delaysMs`, default 1.5s/3s/6s); when the
 *   budget is spent the image latches `failed` with a manual `retry` that
 *   restarts the budget. A latched image also revalidates on `online` and on
 *   tab-visible (a branch flap that ended while hidden heals without a
 *   refresh). A new `src` always resets to a clean load attempt.
 * @example const { failed, retryKey, markFailed, retry } = useImageRetry({ src, component: 'md-image', hasTaskContext: true })
 * @param {Object} opts
 * @param {string} opts.src - The resolved image URL (identity for resets).
 * @param {string} [opts.component] - Renderer name for failure reports.
 * @param {boolean} [opts.hasTaskContext] - Whether projectId/taskId resolved.
 * @param {number[]} [opts.delaysMs] - Backoff schedule override (tests).
 * @returns {{failed: boolean, retryKey: number, markFailed: Function, retry: Function}}
 ***/
export const useImageRetry = ({ src, component = 'image', hasTaskContext = false, delaysMs }) => {
  const [failed, setFailed] = useState(false);
  // Bumped to force a fresh load attempt for the same URL; without a key
  // change the <img> would never refetch.
  const [retryKey, setRetryKey] = useState(0);
  const schedule = Array.isArray(delaysMs) ? delaysMs : IMAGE_RETRY_DELAYS_MS;
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);
  const prevSrcRef = useRef(src);
  const failedRef = useRef(failed);
  // Synced in an effect (never during render) for the visibility/online
  // listeners below, which must read the latest value without resubscribing.
  useEffect(() => {
    failedRef.current = failed;
  }, [failed]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A fresh source always starts with a clean load attempt, including direct
  // prop updates that do not remount the component.
  useEffect(() => {
    if (prevSrcRef.current === src) return;
    prevSrcRef.current = src;
    attemptsRef.current = 0;
    clearTimer();
    setFailed(false);
    setRetryKey(0);
  }, [src, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Bounded automatic retries: each failure schedules the next attempt until
  // the budget is spent, then the image latches for manual/visibility retry.
  useEffect(() => {
    if (!failed) return undefined;
    if (attemptsRef.current >= schedule.length) return undefined;
    const delay = schedule[attemptsRef.current];
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      attemptsRef.current += 1;
      setFailed(false);
      setRetryKey((key) => key + 1);
    }, delay);
    return clearTimer;
  }, [failed, retryKey, schedule, clearTimer]);

  const markFailed = useCallback(() => {
    reportImageFailure({
      src,
      component,
      attempt: attemptsRef.current + 1,
      hasTaskContext,
    });
    setFailed(true);
  }, [src, component, hasTaskContext]);

  // Explicit revalidation (manual Retry, tab-visible, back-online) restarts
  // the auto budget: the user/signal asked, so transient budget spent during
  // a flap must not block recovery now that conditions changed.
  const retry = useCallback(() => {
    attemptsRef.current = 0;
    clearTimer();
    setFailed(false);
    setRetryKey((key) => key + 1);
  }, [clearTimer]);

  // Revalidate a latched image when the tab becomes visible or the browser
  // comes back online — no-ops while healthy or unmounted.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const revalidate = () => {
      if (failedRef.current) retry();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      revalidate();
    };
    window.addEventListener('online', revalidate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', revalidate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [retry]);

  return { failed, retryKey, markFailed, retry };
};
