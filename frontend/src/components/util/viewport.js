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

// The Meta Ray-Ban display reports a roughly square canvas around 600x600
// CSS pixels. Detection below is shape-based (both dimensions plus aspect
// ratio) rather than width-only, so phone-narrow viewports (tall, under
// 639px wide) never qualify and desktop/mobile behaviour stays untouched.

/***
 * MARK: glasses viewport override
 * @description Test seam for the glasses-viewport check below. Null means
 *   auto-detect from window dimensions, otherwise the override wins —
 *   mirroring the narrow-viewport override above.
 * @example setGlassesViewportOverride(true)
 ***/
export let glassesViewportOverride = null;

/***
 * MARK: setGlassesViewportOverride
 * @description Test-only seam: forces the glasses-viewport answer (or pass
 *   null to restore dimension auto-detection). Always reset in afterEach.
 * @param {boolean|null} value - Forced answer, or null to restore detection.
 * @example setGlassesViewportOverride(true)
 ***/
export function setGlassesViewportOverride(value) {
  glassesViewportOverride = value;
}

/***
 * MARK: isGlassesViewport
 * @description True when the viewport looks like a smart-glasses canvas: a
 *   roughly square box around 600x600 pixels (both dimensions 560-680 and
 *   aspect ratio 0.9-1.1). Phones stay excluded by shape (600x900 is tall,
 *   not square) even though their width is below the `sm` breakpoint.
 *   Falls back to false when dimensions are unavailable — the safe default
 *   for SSR, jsdom, and every non-glasses screen.
 * @param {Window} [win=window] - Window to query; injectable for tests.
 * @returns {boolean} Whether the viewport is glasses-shaped.
 * @example isGlassesViewport({ innerWidth: 600, innerHeight: 600 }) => true
 * @example isGlassesViewport({ innerWidth: 600, innerHeight: 900 }) => false
 ***/
export function isGlassesViewport(win = typeof window !== 'undefined' ? window : undefined) {
  if (glassesViewportOverride !== null) return glassesViewportOverride;
  try {
    const width = Number(win?.innerWidth);
    const height = Number(win?.innerHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return false;
    }
    if (width < 560 || width > 680 || height < 560 || height > 680) return false;
    const ratio = width / height;
    return ratio >= 0.9 && ratio <= 1.1;
  } catch {
    return false;
  }
}

/***
 * MARK: useIsGlassesViewport
 * @description Live glasses-viewport flag that flips as the window is
 *   resized into or out of the ~600x600 square. Re-reads dimensions on
 *   every resize so docking/undocking a glasses display switches modes
 *   without a reload. No-ops on the server.
 * @returns {boolean} Whether the viewport is currently glasses-shaped.
 * @example const isGlasses = useIsGlassesViewport();
 ***/
export function useIsGlassesViewport() {
  const [isGlasses, setIsGlasses] = useState(() => isGlassesViewport());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const onResize = () => setIsGlasses(isGlassesViewport(window));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener?.('resize', onResize);
  }, []);
  return isGlasses;
}
