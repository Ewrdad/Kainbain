import { useEffect, useState } from 'react';

// Canonical home for the shared phone-narrow viewport helpers. Two features
// consume them — the observability compact monitor and the System Settings
// popout-first navigation — so they live here instead of inside either
// feature module. `monitorCompact.js` re-exports this module for backwards
// compatibility; new code imports from here.

// Test override for viewport width: null = auto-detect via matchMedia,
// otherwise the override wins. Mirrors the useTapGuard override pattern.
/***
 * MARK: narrow viewport override
 * @description Test seam for the narrow-viewport check below.
 ***/
export let narrowViewportOverride = null;

/***
 * MARK: setNarrowViewportOverride
 * @description Test-only seam: forces the narrow-viewport answer (or pass
 *   null to restore matchMedia auto-detection). Always reset in afterEach.
 * @param {boolean|null} value - Forced answer, or null to restore detection.
 * @example setNarrowViewportOverride(true)
 ***/
export function setNarrowViewportOverride(value) {
  narrowViewportOverride = value;
}

/***
 * MARK: isNarrowViewport
 * @description True when the viewport is below the Tailwind `sm` breakpoint
 *   (640px), i.e. a phone-width layout where popouts and full cockpits do
 *   not belong. Falls back to false (full layout) when matchMedia is
 *   unavailable — the safe default for SSR, jsdom, and wide screens.
 * @param {Window} [win=window] - Window to query; injectable for tests.
 * @returns {boolean} Whether the viewport is phone-narrow.
 ***/
export function isNarrowViewport(win = typeof window !== 'undefined' ? window : undefined) {
  if (narrowViewportOverride !== null) return narrowViewportOverride;
  try {
    const query = win?.matchMedia?.('(max-width: 639px)');
    return Boolean(query?.matches);
  } catch {
    return false;
  }
}

/***
 * MARK: useIsNarrowViewport
 * @description Live narrow-viewport flag that flips as the window crosses
 *   the `sm` breakpoint (resizing a desktop window narrow opens the compact
 *   presentation; widening restores the full cockpit). No-ops on the server.
 * @returns {boolean} Whether the viewport is currently phone-narrow.
 ***/
export function useIsNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => isNarrowViewport());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 639px)');
    const onChange = (event) => setIsNarrow(Boolean(event?.matches));
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return isNarrow;
}
