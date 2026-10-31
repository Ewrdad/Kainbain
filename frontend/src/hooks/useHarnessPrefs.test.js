import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarnessPrefs } from './useHarnessPrefs';
import { HARNESS_PREFS_KEY } from '../services/harnessPrefs';

/***
 * MARK: useHarnessPrefs tests (R8 D4 fallback)
 * @description The brief names `useDeploy.js`/`useSkills.js`, which do not
 *   exist anywhere in the repo (verified by repo-wide search at
 *   implementation time) — so per the plan's D4 decision this file covers
 *   `useHarnessPrefs.js`, the only hook in `frontend/src/hooks/` without a
 *   test. Verifies defaults for unknown harnesses, updating/persisting a
 *   pref, reset, and the ModelSelector disabled-with-reason contract.
 ***/

beforeEach(() => {
  window.localStorage.clear();
});

describe('useHarnessPrefs', () => {
  it('defaults unknown harnesses to enabled + autoDetect', () => {
    const { result } = renderHook(() => useHarnessPrefs());
    expect(result.current.prefs).toEqual({});
    expect(result.current.prefsFor('pi')).toEqual({ enabled: true, autoDetect: true });
    expect(result.current.isHarnessDisabled({ id: 'pi', label: 'pi' })).toBeNull();
  });

  it('updatePref disables a harness and reports the disabled reason', () => {
    const { result } = renderHook(() => useHarnessPrefs());
    act(() => {
      result.current.updatePref('pi', { enabled: false });
    });
    expect(result.current.prefsFor('pi')).toEqual({ enabled: false, autoDetect: true });
    // The Harness tab was replaced by System Settings › Runners, so the
    // reason names the saved preference instead of the removed tab.
    expect(result.current.isHarnessDisabled({ id: 'pi', label: 'pi' })).toBe(
      'Disabled by a saved harness preference',
    );
    // Other harnesses stay selectable.
    expect(result.current.isHarnessDisabled({ id: 'antigravity' })).toBeNull();
  });

  it('persists prefs to localStorage across hook instances', () => {
    const first = renderHook(() => useHarnessPrefs());
    act(() => {
      first.result.current.updatePref('custom', { autoDetect: false });
    });
    expect(JSON.parse(window.localStorage.getItem(HARNESS_PREFS_KEY))).toMatchObject({
      custom: { enabled: true, autoDetect: false },
    });

    const second = renderHook(() => useHarnessPrefs());
    expect(second.result.current.prefsFor('custom')).toEqual({ enabled: true, autoDetect: false });
  });

  it('resetPrefs clears the stored prefs back to defaults', () => {
    const { result } = renderHook(() => useHarnessPrefs());
    act(() => {
      result.current.updatePref('pi', { enabled: false });
    });
    expect(result.current.prefsFor('pi').enabled).toBe(false);
    act(() => {
      result.current.resetPrefs();
    });
    expect(result.current.prefs).toEqual({});
    expect(result.current.prefsFor('pi')).toEqual({ enabled: true, autoDetect: true });
  });

  it('ignores updates without an id', () => {
    const { result } = renderHook(() => useHarnessPrefs());
    act(() => {
      result.current.updatePref('', { enabled: false });
    });
    expect(result.current.prefs).toEqual({});
  });
});
