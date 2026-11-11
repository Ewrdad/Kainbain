/***
 * MARK: tabVisibility
 * @description Single helper for background-tab polling behaviour: every
 *   foreground poller skips its tick while the tab is hidden and catches
 *   up immediately when the tab returns (the `useBoardSync` pattern the
 *   survey chose — pause in background, catch up on return).
 * @example isTabVisible() => true
 ***/

/***
 * MARK: isTabVisible
 * @description True unless the document is explicitly hidden. Server-side
 *   (no document) and `prerender` both count as visible so polling never
 *   stalls outside a real background tab.
 * @example isTabVisible() => true
 * @returns {boolean} Whether the tab is currently visible.
 ***/
export const isTabVisible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden';

/***
 * MARK: subscribeTabVisible
 * @description Registers a catch-up callback fired on every
 *   background→foreground transition (`visibilitychange` + window `focus`,
 *   the same pair `useBoardSync` uses). Returns an unsubscribe function
 *   for effect cleanup. Guards `document`/`window` so server-side callers
 *   get a no-op unsubscribe instead of a crash.
 * @example const stop = subscribeTabVisible(() => refresh());
 * @param {Function} onVisible - Called whenever the tab becomes visible.
 * @returns {Function} Unsubscribe function.
 ***/
export const subscribeTabVisible = (onVisible) => {
  const handler = () => {
    if (isTabVisible() && typeof onVisible === 'function') onVisible();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handler);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handler);
  }
  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handler);
    }
  };
};
