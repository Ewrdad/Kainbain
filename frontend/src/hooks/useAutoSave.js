import { useState, useEffect, useRef, useCallback } from 'react';

/***
 * MARK: defaultEquals
 * @description Performs comparison between previous saved and current values.
 * @param {any} a - First value.
 * @param {any} b - Second value.
 * @returns {boolean} True if values are considered equal.
 * @example defaultEquals('test', 'test') => true
 ***/
export function defaultEquals(a, b) {
  if (a === b) return true;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/***
 * MARK: useAutoSave
 * @description Reusable auto-save debounce hook that invokes an `onSave` handler after 600ms of inactivity
 * or immediately upon `onBlur`, providing `isSaving`, `lastSaved`, `isDirty`, and error states.
 * @param {any} value - The state or value to monitor for changes.
 * @param {Function} onSave - The save function `(val) => Promise<void> | void`.
 * @param {Object} [options] - Configuration options.
 * @param {number} [options.delay=600] - Debounce delay in milliseconds (default: 600).
 * @param {number} [options.debounceMs] - Alias for delay.
 * @param {boolean} [options.enabled=true] - Whether auto-save is enabled.
 * @param {Function} [options.onSuccess] - Callback when save succeeds.
 * @param {Function} [options.onError] - Callback when save encounters an error.
 * @param {Function} [options.equals] - Comparator function `(a, b) => boolean`.
 * @returns {Object} `{ isSaving, lastSaved, error, isDirty, saveNow, handleBlur, cancel, resetBaseline }`
 * @example const { isSaving, lastSaved, handleBlur, saveNow } = useAutoSave(text, handleSave, { delay: 600 });
 ***/
export function useAutoSave(value, onSave, options = {}) {
  const {
    delay = 600,
    debounceMs,
    enabled = true,
    onSuccess,
    onError,
    equals = defaultEquals,
  } = options;

  const effectiveDelay = typeof debounceMs === 'number' ? debounceMs : delay;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [lastSavedValue, setLastSavedValue] = useState(value);
  const [error, setError] = useState(null);

  // References to keep latest callbacks without resetting timers unnecessarily
  const onSaveRef = useRef(onSave);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const equalsRef = useRef(equals);
  const latestValueRef = useRef(value);

  const timerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    onSaveRef.current = onSave;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    equalsRef.current = equals;
    latestValueRef.current = value;
  }, [onSave, onSuccess, onError, equals, value]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const isDirty = !equals(value, lastSavedValue);

  /***
   * MARK: executeSave
   * @description Executes the save operation immediately for a given value.
   * @param {any} valToSave - The value to persist.
   * @returns {Promise<any>} Result of onSave.
   ***/
  const executeSave = useCallback(async (valToSave) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!onSaveRef.current) return;

    if (isMountedRef.current) {
      setIsSaving(true);
      setError(null);
    }

    try {
      const result = await onSaveRef.current(valToSave);

      if (isMountedRef.current) {
        setLastSaved(new Date());
        setLastSavedValue(valToSave);
        setIsSaving(false);
        setError(null);
      }

      onSuccessRef.current?.(result, valToSave);
      return result;
    } catch (err) {
      if (isMountedRef.current) {
        setIsSaving(false);
        setError(err);
      }
      onErrorRef.current?.(err, valToSave);
      return undefined;
    }
  }, []);

  /***
   * MARK: cancel
   * @description Cancels any pending debounced save timer.
   * @example cancel()
   ***/
  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /***
   * MARK: resetBaseline
   * @description Re-anchors the saved baseline to a new value without touching
   *   the network. Used when the edited entity changes underneath the hook
   *   (e.g. the user opens a different task in the same mounted editor): the
   *   previous entity's baseline would otherwise mark the new text dirty and
   *   schedule a spurious save of unchanged text.
   * @example resetBaseline(nextTaskGoal)
   * @param {any} nextSavedValue - The value to treat as already saved.
   ***/
  const resetBaseline = useCallback((nextSavedValue) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLastSavedValue(nextSavedValue);
    setError(null);
    setIsSaving(false);
  }, []);

  /***
   * MARK: saveNow
   * @description Immediately invokes save with the current or explicitly provided value.
   * @example await saveNow()
   * @param {any} [overrideValue]
   * @returns {Promise<any>}
   ***/
  const saveNow = useCallback(
    async (overrideValue) => {
      const target = overrideValue !== undefined ? overrideValue : latestValueRef.current;
      return executeSave(target);
    },
    [executeSave],
  );

  /***
   * MARK: handleBlur
   * @description Blur event handler that triggers an immediate save if there are unsaved changes.
   * @example <input onBlur={handleBlur} />
   * @returns {Promise<any>|void}
   ***/
  const handleBlur = useCallback(() => {
    if (!enabled) return;
    const isCurrentlyDirty = !equalsRef.current(latestValueRef.current, lastSavedValue);
    if (isCurrentlyDirty || timerRef.current !== null) {
      return executeSave(latestValueRef.current);
    }
  }, [enabled, executeSave, lastSavedValue]);

  // Set up debounce timer on value changes
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const changed = !equals(value, lastSavedValue);
    if (!changed) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void executeSave(value);
    }, effectiveDelay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, lastSavedValue, enabled, effectiveDelay, equals, executeSave]);

  return {
    isSaving,
    lastSaved,
    error,
    isDirty,
    saveNow,
    handleBlur,
    cancel,
    resetBaseline,
  };
}

export default useAutoSave;
