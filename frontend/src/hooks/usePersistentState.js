import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../services/logger';

/***
 * MARK: storageAvailable
 * @description Checks whether localStorage can be used (SSR/private-mode safe).
 * @returns {boolean} True when window.localStorage is reachable.
 ***/
function storageAvailable() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/***
 * MARK: readStoredValue
 * @description Reads one persisted key, falling back to the default on any
 *   failure (missing key, corrupt payload, failed validation, no storage).
 * @param {string} key - localStorage key.
 * @param {any} defaultValue - Fallback value (or lazy initializer function).
 * @param {Function} deserialize - Parses the stored string.
 * @param {Function} validate - Predicate the parsed value must satisfy.
 * @returns {any} The stored value or the default.
 ***/
function readStoredValue(key, defaultValue, deserialize, validate) {
  const fallback = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  if (!storageAvailable()) return fallback;
  let raw = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (err) {
    logger.warn('Failed to read localStorage key', { key, err });
    return fallback;
  }
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = deserialize(raw);
    if (validate(parsed)) return parsed;
    return fallback;
  } catch (err) {
    logger.warn('Failed to parse localStorage key, using default', { key, err });
    return fallback;
  }
}

/***
 * MARK: writeStoredValue
 * @description Writes one value to localStorage; quota/private-mode errors
 *   are logged and never thrown.
 * @param {string} key - localStorage key.
 * @param {any} value - Value to persist.
 * @param {Function} serialize - Converts the value to a string.
 ***/
function writeStoredValue(key, value, serialize) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(key, serialize(value));
  } catch (err) {
    logger.warn('Failed to write localStorage key', { key, err });
  }
}

/***
 * MARK: usePersistentState
 * @description useState that survives page refreshes via localStorage. Reads
 *   once with a lazy initializer (validate-or-default on corrupt data) and
 *   writes on change (optionally debounced for free-text search fields).
 * @example const [query, setQuery] = usePersistentState('kainbain:board:search', '', { debounceMs: 800 });
 * @param {string} key - localStorage key (use the `kainbain:` namespace).
 * @param {any} defaultValue - Default (or lazy initializer) used when storage
 *   is missing, corrupt, or fails validation.
 * @param {Object} [options] - Configuration options.
 * @param {Function} [options.serialize] - Value-to-string (default JSON.stringify).
 * @param {Function} [options.deserialize] - String-to-value (default JSON.parse).
 * @param {Function} [options.validate] - Predicate parsed values must satisfy.
 * @param {number} [options.debounceMs] - Debounce writes by this many ms (0 = synchronous).
 * @param {boolean} [options.syncAcrossTabs] - Re-read on `storage` events from other tabs.
 * @returns {[any, Function, Function]} `[value, setValue, clear]` where
 *   `clear()` removes the key and resets to the default.
 ***/
export function usePersistentState(key, defaultValue, options = {}) {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    validate = () => true,
    debounceMs = 0,
    syncAcrossTabs = false,
  } = options;

  // Latest options for effects and callbacks. Initialized via the useRef
  // argument (no .current access during render); refreshed after every
  // render by the updater effect below, which is declared before all
  // consumers so same-commit readers always see fresh options.
  const configRef = useRef({ serialize, deserialize, validate, defaultValue });
  useEffect(() => {
    configRef.current = { serialize, deserialize, validate, defaultValue };
  });

  // The key actually backing `value`. When the key prop changes (e.g. task
  // switch with per-task keys), re-read during render and reset — the
  // documented "previous render info" pattern, also used in TaskDetailPage —
  // so one task's filter text never bleeds into another task.
  const [activeKey, setActiveKey] = useState(key);
  const [value, setValue] = useState(() =>
    readStoredValue(key, defaultValue, deserialize, validate),
  );
  if (key !== activeKey) {
    setActiveKey(key);
    setValue(readStoredValue(key, defaultValue, deserialize, validate));
  }

  const latestRef = useRef({ key, value });
  useEffect(() => {
    latestRef.current = { key, value };
  });

  const skipMountRef = useRef(true);
  const skipNextWriteRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // Skip the initial mount: the lazy initializer already reflects storage.
    // Also skip one write after clear(): the key was just removed on purpose.
    if (skipMountRef.current) {
      skipMountRef.current = false;
      return undefined;
    }
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return undefined;
    }
    const cfg = configRef.current;
    if (debounceMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        writeStoredValue(activeKey, value, cfg.serialize);
      }, debounceMs);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    writeStoredValue(activeKey, value, cfg.serialize);
    return undefined;
  }, [value, debounceMs, activeKey]);

  // Flush a pending debounced write on unmount so a refresh keeps the
  // latest keystrokes.
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const latest = latestRef.current;
        writeStoredValue(latest.key, latest.value, configRef.current.serialize);
      }
    },
    [],
  );

  useEffect(() => {
    if (!syncAcrossTabs) return undefined;
    const onStorage = (event) => {
      if (event.key !== latestRef.current.key) return;
      const cfg = configRef.current;
      if (event.newValue === null || event.newValue === undefined) {
        setValue(typeof cfg.defaultValue === 'function' ? cfg.defaultValue() : cfg.defaultValue);
        return;
      }
      try {
        const parsed = cfg.deserialize(event.newValue);
        if (cfg.validate(parsed)) setValue(parsed);
      } catch (err) {
        logger.warn('Failed to parse cross-tab storage event, ignoring', {
          key: latestRef.current.key,
          err,
        });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncAcrossTabs]);

  const clear = useCallback(() => {
    const cfg = configRef.current;
    const resolvedDefault =
      typeof cfg.defaultValue === 'function' ? cfg.defaultValue() : cfg.defaultValue;
    // Only skip the write-back when the reset actually changes state;
    // otherwise a stale flag would swallow the next legitimate write.
    if (!Object.is(latestRef.current.value, resolvedDefault)) {
      skipNextWriteRef.current = true;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (storageAvailable()) window.localStorage.removeItem(latestRef.current.key);
    } catch (err) {
      logger.warn('Failed to clear localStorage key', {
        key: latestRef.current.key,
        err,
      });
    }
    setValue(resolvedDefault);
  }, []);

  return [value, setValue, clear];
}
