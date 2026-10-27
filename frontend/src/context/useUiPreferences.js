import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../services/logger';

export const STORAGE_KEY = 'kainbain_ui_preferences';

export const DEFAULT_UI_PREFERENCES = {
  // Theme & Appearance
  theme: 'dark', // 'dark' | 'midnight' | 'light' | 'high-contrast'
  density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  fontSize: 'medium', // 'small' | 'medium' | 'large' | 'extra-large'
  fontMono: 'jetbrains', // 'jetbrains' | 'fira' | 'source' | 'system'
  reduceMotion: false,

  // Layout & Workspace
  columnWidth: '280px', // '240px' | '280px' | '320px' | '360px' | 'fill'
  showNowPlayingBar: true,
  showRunnerBoxes: true, // Now Playing left side shows per-runner boxes for 1-4 runners; false forces the single-task view
  activityDrawerDefaultOpen: false,
  consoleHeight: 256, // 120px to 600px resizable Activity Console height
  keepScreenAwakeOnMonitor: true, // hold a screen wake lock while the monitor is open and running

  // Task Cards & Display
  showTaskId: true,
  showStageBadge: true,
  showTimeInStage: true,
  cardPreviewLines: 2, // 1 | 2 | 3 | 'unlimited'
  taskCardDensity: 'compact', // 'compact' | 'default' — compact shrinks cards on all viewports
  taskSort: 'manual', // 'manual' | 'oldest' — card order within each stage column
  defaultShowCompletedTasks: false,

  // Sound & Notifications
  enableAudioChimes: false,
  autoScrollLogs: true,

  // Keyboard Shortcuts & Hints
  enableKeyboardShortcuts: true,
  showKeyboardHints: true,
};

const ENUM_PREFERENCE_VALUES = {
  theme: ['dark', 'midnight', 'light', 'high-contrast'],
  density: ['compact', 'comfortable', 'spacious'],
  fontSize: ['small', 'medium', 'large', 'extra-large'],
  fontMono: ['jetbrains', 'fira', 'source', 'system'],
  columnWidth: ['240px', '280px', '320px', '360px', 'fill'],
  taskCardDensity: ['compact', 'default'],
  taskSort: ['manual', 'oldest'],
};

const BOOLEAN_PREFERENCE_KEYS = [
  'reduceMotion',
  'showNowPlayingBar',
  'showRunnerBoxes',
  'activityDrawerDefaultOpen',
  'keepScreenAwakeOnMonitor',
  'showTaskId',
  'showStageBadge',
  'showTimeInStage',
  'defaultShowCompletedTasks',
  'enableAudioChimes',
  'autoScrollLogs',
  'enableKeyboardShortcuts',
  'showKeyboardHints',
];

// Resizable Activity Console height bounds (px); out-of-range stored values
// fall back to the default instead of breaking layout.
const CONSOLE_HEIGHT_MIN = 120;
const CONSOLE_HEIGHT_MAX = 600;

const PREVIEW_LINES_NUMERIC = [1, 2, 3];

/**
 * MARK: isValidPreferenceValue
 * @description Per-key validator: enum keys accept only their known ids,
 *   boolean keys accept only real booleans (truthy strings like "false"
 *   from hand-edited JSON must NOT enable a feature), consoleHeight must be
 *   a finite number inside its layout bounds, and cardPreviewLines accepts
 *   1-3 or 'unlimited' (numeric strings coerce, everything else rejects).
 * @param {string} key - Preference key (must exist in DEFAULT_UI_PREFERENCES).
 * @param {*} value - Candidate value.
 * @returns {boolean} True when the value is safe to apply and persist.
 */
export function isValidPreferenceValue(key, value) {
  /* eslint-disable security/detect-object-injection -- key is validated by Object.hasOwn on the same allowlist above */
  if (Object.hasOwn(ENUM_PREFERENCE_VALUES, key)) {
    return ENUM_PREFERENCE_VALUES[key].includes(value);
  }
  /* eslint-enable security/detect-object-injection */
  if (BOOLEAN_PREFERENCE_KEYS.includes(key)) {
    return typeof value === 'boolean';
  }
  if (key === 'consoleHeight') {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= CONSOLE_HEIGHT_MIN &&
      value <= CONSOLE_HEIGHT_MAX
    );
  }
  if (key === 'cardPreviewLines') {
    if (value === 'unlimited') return true;
    const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return PREVIEW_LINES_NUMERIC.includes(numeric);
  }
  return false;
}

/**
 * MARK: normalizePreferenceValue
 * @description Coerce the narrow legacy shapes we still accept (numeric
 *   strings for cardPreviewLines) into their canonical stored form. Every
 *   other valid value passes through untouched; call only after
 *   isValidPreferenceValue.
 */
function normalizePreferenceValue(key, value) {
  if (key === 'cardPreviewLines' && value !== 'unlimited') {
    return Number(value);
  }
  return value;
}

/**
 * MARK: sanitizePreferences
 * @description Fail-safe merge for any untrusted preferences object
 *   (localStorage payloads, cross-tab storage events, pasted import JSON,
 *   partial updates). Unknown keys are dropped, invalid values keep the
 *   base value (caller picks the base: defaults for fresh loads, current
 *   state for merges so one bad key never resets unrelated settings).
 *   Never throws — non-object input yields a copy of the base.
 * @example sanitizePreferences({ theme: 'garbage', density: 'compact' }) => { theme: 'dark', density: 'compact', ... }
 * @param {*} input - Untrusted candidate preferences.
 * @param {Object} [base=DEFAULT_UI_PREFERENCES] - Fallback values per key.
 * @returns {{ preferences: Object, dropped: string[] }} Sanitized copy plus the dropped key names.
 */
export function sanitizePreferences(input, base = DEFAULT_UI_PREFERENCES) {
  const safeBase =
    base && typeof base === 'object' ? base : DEFAULT_UI_PREFERENCES;
  const next = { ...DEFAULT_UI_PREFERENCES, ...safeBase };
  const dropped = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { preferences: next, dropped };
  }
  /* eslint-disable security/detect-object-injection -- key is validated against DEFAULT_UI_PREFERENCES below */
  for (const key of Object.keys(DEFAULT_UI_PREFERENCES)) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (value === undefined || !isValidPreferenceValue(key, value)) {
      dropped.push(key);
      continue;
    }
    next[key] = normalizePreferenceValue(key, value);
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULT_UI_PREFERENCES, key)) {
      dropped.push(key);
    }
  }
  /* eslint-enable security/detect-object-injection */
  return { preferences: next, dropped };
}

/**
 * Apply styling tokens directly to the document root element.
 * Unknown values can never reach here through the hook (every write path
 * sanitizes first), but the allowlists below keep direct callers fail-safe
 * too: garbage can only ever resolve to a default, never to broken CSS.
 * @param {Object} prefs
 */
export function applyPreferencesToDom(prefs) {
  if (typeof document === 'undefined') return;

  const source = prefs && typeof prefs === 'object' ? prefs : {};
  /* eslint-disable security/detect-object-injection -- pick is only ever called with compile-time literal keys below */
  const pick = (key) =>
    isValidPreferenceValue(key, source[key])
      ? source[key]
      : DEFAULT_UI_PREFERENCES[key];
  /* eslint-enable security/detect-object-injection */

  const root = document.documentElement;

  // Set data attributes for css selector targets
  root.setAttribute('data-theme', pick('theme'));
  root.setAttribute('data-density', pick('density'));
  root.setAttribute('data-font-size', pick('fontSize'));
  root.setAttribute('data-mono-font', pick('fontMono'));

  if (source.reduceMotion === true) {
    root.setAttribute('data-reduce-motion', 'true');
  } else {
    root.removeAttribute('data-reduce-motion');
  }

  // Set CSS custom properties
  const colWidth = pick('columnWidth');
  root.style.setProperty('--column-width', colWidth === 'fill' ? '100%' : colWidth);
}

/**
 * Safely load preferences from localStorage. Corrupt JSON, non-object
 * payloads, unknown keys, and out-of-range values all resolve to defaults
 * per key — a poisoned value can never break theming on boot.
 */
export function loadSavedPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_UI_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw);
    const { preferences, dropped } = sanitizePreferences(parsed);
    if (dropped.length > 0) {
      logger.warn('Ignoring invalid stored UI preferences', dropped);
    }
    return preferences;
  } catch (e) {
    logger.error('Failed to load UI preferences from localStorage', e);
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

/**
 * MARK: useUiPreferences
 * @description Hook managing user interface customization preferences,
 * reactive DOM updates, cross-tab synchronization, and localStorage persistence.
 */
export function useUiPreferences() {
  const [preferences, setPreferences] = useState(() => loadSavedPreferences());
  const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  const isInitialMount = useRef(true);

  // Apply to DOM on state change and persist
  useEffect(() => {
    applyPreferencesToDom(preferences);

    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      }
    } catch (e) {
      logger.error('Failed to save UI preferences to localStorage', e);
    }
  }, [preferences]);

  // Sync across tabs via window storage event
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          // Sanitize against current state: a bad value from another tab
          // keeps this tab's value instead of spreading breakage.
          setPreferences((prev) => sanitizePreferences(updated, prev).preferences);
        } catch {
          // Ignore parse errors from concurrent updates
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const updatePreference = useCallback((key, value) => {
    // Unknown keys are programmer errors (usually a typo): refuse them
    // loudly in the log but keep state untouched instead of persisting junk.
    if (!Object.hasOwn(DEFAULT_UI_PREFERENCES, key)) {
      logger.warn(`Ignoring unknown UI preference "${key}"`);
      return;
    }
    setPreferences((prev) => sanitizePreferences({ [key]: value }, prev).preferences);
  }, []);

  const updatePreferences = useCallback((partial) => {
    if (!partial || typeof partial !== 'object') {
      logger.warn('Ignoring non-object UI preferences update');
      return;
    }
    setPreferences((prev) => sanitizePreferences(partial, prev).preferences);
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_UI_PREFERENCES);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_UI_PREFERENCES));
      }
    } catch (e) {
      logger.error('Failed to reset UI preferences', e);
    }
  }, []);

  const exportPreferences = useCallback(() => {
    return JSON.stringify(preferences, null, 2);
  }, [preferences]);

  const importPreferences = useCallback(
    (jsonString) => {
      // Failure contract (surfaced by the Backup tab's import form):
      // - unparseable JSON or a non-object payload => { success: false, error }
      //   and state is untouched;
      // - valid object => merged over current state key-by-key, with unknown
      //   keys and invalid values reported in `dropped` (state keeps its
      //   current value for those keys, everything else applies).
      // NOTE: sanitize runs here (not inside the setState updater) so the
      // returned `dropped` list is computed synchronously from the current
      // render's state — updaters run later and cannot feed a return value.
      try {
        const parsed = JSON.parse(jsonString);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Invalid preferences JSON structure');
        }
        const { preferences: next, dropped } = sanitizePreferences(parsed, preferences);
        setPreferences(next);
        if (dropped.length > 0) {
          logger.warn('Imported UI preferences with ignored entries', dropped);
        }
        return { success: true, dropped };
      } catch (e) {
        logger.error('Failed to import UI preferences', e);
        return { success: false, error: e.message };
      }
    },
    [preferences],
  );

  return {
    preferences,
    updatePreference,
    updatePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
    isCustomizationModalOpen,
    setIsCustomizationModalOpen,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
  };
}
