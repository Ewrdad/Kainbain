import { useCallback, useMemo } from 'react';
import { usePersistentState } from './usePersistentState';
import {
  HARNESS_PREFS_KEY,
  normalizeHarnessPrefs,
  prefsForHarness,
  withHarnessPref,
  harnessDisabledReason,
} from '../services/harnessPrefs';

/***
 * MARK: useHarnessPrefs
 * @description App-wide harness integration preferences (`enabled` + `autoDetect`
 *   per harness id) persisted to localStorage. Missing ids default to visible
 *   + auto-detected, so new registry entries appear with zero migration, and
 *   unknown ids are stored verbatim but ignored at render time.
 *
 *   Step-0 persistence decision: no system-level (non-project) settings store
 *   exists on the backend yet (the System Settings modal is draft-only,
 *   `config` is env-driven), so prefs live in `usePersistentState` now; a
 *   backend endpoint can adopt the same `{ [id]: { enabled, autoDetect } }`
 *   shape as a follow-up without changing callers.
 * @example const { prefs, updatePref, isHarnessDisabled } = useHarnessPrefs();
 * @returns {{prefs: Object, updatePref: Function, resetPrefs: Function, prefsFor: Function, isHarnessDisabled: Function}}
 ***/
export function useHarnessPrefs() {
  const [stored, setStored, clear] = usePersistentState(HARNESS_PREFS_KEY, {}, {
    validate: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
  });

  // Belt-and-braces normalization: a hand-edited or older payload with
  // non-boolean flags resolves to safe defaults instead of crashing a toggle.
  const prefs = useMemo(() => normalizeHarnessPrefs(stored), [stored]);

  const updatePref = useCallback(
    (id, patch) => {
      if (!id) return;
      setStored((prev) => withHarnessPref(normalizeHarnessPrefs(prev), id, patch));
    },
    [setStored],
  );

  const resetPrefs = useCallback(() => clear(), [clear]);

  const prefsFor = useCallback((id) => prefsForHarness(prefs, id), [prefs]);

  // The ModelSelector `isHarnessDisabled` contract: a reason string renders
  // the option disabled-with-reason, null keeps it selectable. Disabled here
  // means *user-disabled in settings* — never hidden.
  const isHarnessDisabled = useCallback(
    (harness) => harnessDisabledReason(prefs, harness),
    [prefs],
  );

  return { prefs, updatePref, resetPrefs, prefsFor, isHarnessDisabled };
}
