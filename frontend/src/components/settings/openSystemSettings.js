import { isNarrowViewport } from '../util/viewport';

/***
 * MARK: SYSTEM_SETTINGS_POPOUT_NAME
 * @description `window.open` target name for the System Settings popout. A
 *   named target means a second invocation focuses the existing settings
 *   window instead of stacking duplicates. `SystemSettingsPage` matches its
 *   `window.name` against this to know it is the popout document.
 * @example openSystemSettings() => window.name === SYSTEM_SETTINGS_POPOUT_NAME
 ***/
export const SYSTEM_SETTINGS_POPOUT_NAME = 'kainbain_system_settings';

/***
 * MARK: openSystemSettings
 * @description Action that opens System Settings in a new window by default
 * (with targeted window features matching desktop popout conventions), falling
 * back to same-tab setView('system-settings') navigation when the popout is
 * blocked or errors, or when the viewport is phone-narrow (a popout there would
 * trap the user on a tiny screen).
 *
 * How it can fail (all fail safe to same-tab navigation, never a dead click):
 * - Popup blocker: `win.open` returns null, throws, or returns an
 *   immediately-closed (dead) handle — falls through to `setView`.
 * - Phone-narrow viewport: `window.open` is never attempted.
 * - No `setView` callback (e.g. outside the provider): falls back to setting
 *   `win.location.hash` directly. With neither `setView` nor `win` (SSR),
 *   nothing can navigate, so the call is a documented no-op that still
 *   returns 'same-tab'.
 * @param {Object} [options]
 * @param {Function} [options.setView] - KainBain setView navigation callback.
 * @param {Window} [options.win] - Window to query/open; injectable for tests.
 * @returns {'popout'|'same-tab'} Which navigation path was executed.
 * @example openSystemSettings({ setView })
 ***/
export function openSystemSettings({
  setView,
  win = typeof window !== 'undefined' ? window : undefined,
} = {}) {
  const target = '#/system-settings';
  const isNarrow = isNarrowViewport(win);

  if (!isNarrow && win && typeof win.open === 'function') {
    try {
      // pi-lens-ignore: no-open-redirect-js
      const popout = win.open(
        target,
        SYSTEM_SETTINGS_POPOUT_NAME,
        'width=1200,height=800,menubar=no,toolbar=no,location=no',
      );
      // A truthy handle is not proof: aggressive blockers return a window
      // that is already closed. Only a live handle counts as a popout.
      if (popout && !popout.closed) {
        try {
          popout.focus?.();
        } catch {
          // Focus is a courtesy, never a failure.
        }
        return 'popout';
      }
    } catch {
      // Popup blocked or window.open disallowed in context
    }
  }

  if (typeof setView === 'function') {
    setView('system-settings');
  } else if (win?.location) {
    win.location.hash = target;
  }
  return 'same-tab';
}
