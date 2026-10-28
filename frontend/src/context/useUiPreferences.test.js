import { expect, test, vi, beforeEach, describe } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useUiPreferences,
  DEFAULT_UI_PREFERENCES,
  STORAGE_KEY,
  applyPreferencesToDom,
  sanitizePreferences,
  isValidPreferenceValue,
} from './useUiPreferences';

describe('useUiPreferences', () => {
  let store = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, value) => {
        store[key] = String(value);
      }),
      removeItem: vi.fn((key) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  test('initializes with default preferences when localStorage is empty', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_UI_PREFERENCES);
    expect(result.current.preferences.theme).toBe('dark');
  });

  test('loads saved preferences from localStorage on initialization', () => {
    const saved = { ...DEFAULT_UI_PREFERENCES, theme: 'midnight' };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences.theme).toBe('midnight');
  });

  test('updates a single preference and persists to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('theme', 'light');
    });

    expect(result.current.preferences.theme).toBe('light');
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.theme).toBe('light');
  });

  test('updates multiple preferences at once', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreferences({
        density: 'compact',
        columnWidth: '320px',
        enableAudioChimes: true,
      });
    });

    expect(result.current.preferences.density).toBe('compact');
    expect(result.current.preferences.columnWidth).toBe('320px');
    expect(result.current.preferences.enableAudioChimes).toBe(true);
  });

  test('resets preferences to defaults', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('theme', 'light');
    });
    expect(result.current.preferences.theme).toBe('light');

    act(() => {
      result.current.resetPreferences();
    });

    expect(result.current.preferences.theme).toBe('dark');
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.theme).toBe('dark');
  });

  test('exports preferences as valid JSON string', () => {
    const { result } = renderHook(() => useUiPreferences());
    const exported = result.current.exportPreferences();
    const parsed = JSON.parse(exported);
    expect(parsed.theme).toBe('dark');
  });

  test('imports valid preferences JSON and applies it', () => {
    const { result } = renderHook(() => useUiPreferences());
    const custom = JSON.stringify({ theme: 'high-contrast' });

    let status;
    act(() => {
      status = result.current.importPreferences(custom);
    });

    expect(status.success).toBe(true);
    expect(result.current.preferences.theme).toBe('high-contrast');
  });

  test('handles invalid JSON import gracefully', () => {
    const { result } = renderHook(() => useUiPreferences());
    let status;
    act(() => {
      status = result.current.importPreferences('invalid-json');
    });

    expect(status.success).toBe(false);
    expect(result.current.preferences.theme).toBe('dark');
  });

  test('keepScreenAwakeOnMonitor defaults to true', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences.keepScreenAwakeOnMonitor).toBe(true);
    expect(DEFAULT_UI_PREFERENCES.keepScreenAwakeOnMonitor).toBe(true);
  });

  test('showRunnerBoxes defaults to true so boxes need no migration', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences.showRunnerBoxes).toBe(true);
    expect(DEFAULT_UI_PREFERENCES.showRunnerBoxes).toBe(true);
  });

  test('showRunnerBoxes kill switch persists, survives import/export/reset, rejects junk', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('showRunnerBoxes', false);
    });
    expect(result.current.preferences.showRunnerBoxes).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).showRunnerBoxes).toBe(false);

    // A hand-edited "false" string must NOT disable the boxes.
    act(() => {
      result.current.updatePreference('showRunnerBoxes', 'false');
    });
    expect(result.current.preferences.showRunnerBoxes).toBe(false);

    // Export carries the key; import restores it; unknown values report dropped.
    const exported = JSON.parse(result.current.exportPreferences());
    expect(exported.showRunnerBoxes).toBe(false);
    act(() => {
      result.current.updatePreference('showRunnerBoxes', true);
    });
    let status;
    act(() => {
      status = result.current.importPreferences(JSON.stringify(exported));
    });
    expect(status.success).toBe(true);
    expect(result.current.preferences.showRunnerBoxes).toBe(false);

    // Reset restores the default (boxes back on).
    act(() => {
      result.current.resetPreferences();
    });
    expect(result.current.preferences.showRunnerBoxes).toBe(true);
  });

  test('missing showRunnerBoxes in stored JSON falls back to default', () => {
    const { showRunnerBoxes: _dropped, ...legacy } = DEFAULT_UI_PREFERENCES;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences.showRunnerBoxes).toBe(true);
  });

  test('keepScreenAwakeOnMonitor persists across reload and survives import/export/reset', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('keepScreenAwakeOnMonitor', false);
    });
    expect(result.current.preferences.keepScreenAwakeOnMonitor).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).keepScreenAwakeOnMonitor).toBe(
      false,
    );

    // Export carries the key; import restores it.
    const exported = JSON.parse(result.current.exportPreferences());
    expect(exported.keepScreenAwakeOnMonitor).toBe(false);
    act(() => {
      result.current.updatePreference('keepScreenAwakeOnMonitor', true);
    });
    let status;
    act(() => {
      status = result.current.importPreferences(JSON.stringify(exported));
    });
    expect(status.success).toBe(true);
    expect(result.current.preferences.keepScreenAwakeOnMonitor).toBe(false);

    // Reset restores the default.
    act(() => {
      result.current.resetPreferences();
    });
    expect(result.current.preferences.keepScreenAwakeOnMonitor).toBe(true);
  });

  test('missing keepScreenAwakeOnMonitor in stored JSON falls back to default', () => {
    const { keepScreenAwakeOnMonitor: _dropped, ...legacy } = DEFAULT_UI_PREFERENCES;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.preferences.keepScreenAwakeOnMonitor).toBe(true);
  });

  test('poisoned stored JSON falls back per key instead of breaking theming', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: 'garbage',
        density: 'compact',
        reduceMotion: 'false',
        consoleHeight: 99999,
        cardPreviewLines: 'everything',
        evilKey: 'pwned',
      }),
    );

    const { result } = renderHook(() => useUiPreferences());
    // Valid value survives; every invalid/unknown entry resolves to default.
    expect(result.current.preferences.density).toBe('compact');
    expect(result.current.preferences.theme).toBe(DEFAULT_UI_PREFERENCES.theme);
    expect(result.current.preferences.reduceMotion).toBe(false);
    expect(result.current.preferences.consoleHeight).toBe(DEFAULT_UI_PREFERENCES.consoleHeight);
    expect(result.current.preferences.cardPreviewLines).toBe(
      DEFAULT_UI_PREFERENCES.cardPreviewLines,
    );
    expect(result.current.preferences.evilKey).toBeUndefined();
  });

  test('updatePreference ignores unknown keys without touching state', () => {
    const { result } = renderHook(() => useUiPreferences());
    const before = result.current.preferences;

    act(() => {
      result.current.updatePreference('them', 'light');
    });

    expect(result.current.preferences).toEqual(before);
    expect(result.current.preferences.theme).toBe('dark');
  });

  test('updatePreference with an invalid value keeps the current value', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('theme', 'light');
    });
    expect(result.current.preferences.theme).toBe('light');

    act(() => {
      result.current.updatePreference('theme', 'garbage');
    });
    // Fail-safe: the bad write is dropped, the good value stays.
    expect(result.current.preferences.theme).toBe('light');
  });

  test('import applies valid keys, keeps current values for invalid ones, and reports dropped', () => {
    const { result } = renderHook(() => useUiPreferences());

    act(() => {
      result.current.updatePreference('theme', 'midnight');
    });

    let status;
    act(() => {
      status = result.current.importPreferences(
        JSON.stringify({ density: 'compact', theme: 'garbage', evilKey: 1 }),
      );
    });

    expect(status.success).toBe(true);
    expect(status.dropped).toEqual(expect.arrayContaining(['theme', 'evilKey']));
    expect(result.current.preferences.density).toBe('compact');
    expect(result.current.preferences.theme).toBe('midnight');
  });

  test('import rejects array payloads without touching state', () => {
    const { result } = renderHook(() => useUiPreferences());

    let status;
    act(() => {
      status = result.current.importPreferences('["theme"]');
    });

    expect(status.success).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_UI_PREFERENCES);
  });

  test('applyPreferencesToDom sets data attributes and CSS variables on root', () => {
    const prefs = {
      theme: 'midnight',
      density: 'compact',
      fontSize: 'large',
      fontMono: 'fira',
      columnWidth: '320px',
      reduceMotion: true,
    };

    applyPreferencesToDom(prefs);

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('midnight');
    expect(root.getAttribute('data-density')).toBe('compact');
    expect(root.getAttribute('data-font-size')).toBe('large');
    expect(root.getAttribute('data-mono-font')).toBe('fira');
    expect(root.getAttribute('data-reduce-motion')).toBe('true');
    expect(root.style.getPropertyValue('--column-width')).toBe('320px');
  });

  test('applyPreferencesToDom resolves garbage values to defaults, never broken CSS', () => {
    applyPreferencesToDom({
      theme: 'garbage',
      density: 42,
      fontSize: null,
      fontMono: undefined,
      columnWidth: 'evil',
      reduceMotion: 'yes',
    });

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe(DEFAULT_UI_PREFERENCES.theme);
    expect(root.getAttribute('data-density')).toBe(DEFAULT_UI_PREFERENCES.density);
    expect(root.getAttribute('data-font-size')).toBe(DEFAULT_UI_PREFERENCES.fontSize);
    expect(root.getAttribute('data-mono-font')).toBe(DEFAULT_UI_PREFERENCES.fontMono);
    expect(root.hasAttribute('data-reduce-motion')).toBe(false);
    expect(root.style.getPropertyValue('--column-width')).toBe(DEFAULT_UI_PREFERENCES.columnWidth);
  });
});

describe('sanitizePreferences', () => {
  test('accepts every default value and drops nothing', () => {
    const { preferences, dropped } = sanitizePreferences({
      ...DEFAULT_UI_PREFERENCES,
    });
    expect(dropped).toEqual([]);
    expect(preferences).toEqual(DEFAULT_UI_PREFERENCES);
  });

  test('rejects truthy-string booleans and out-of-range numbers', () => {
    expect(isValidPreferenceValue('enableAudioChimes', 'false')).toBe(false);
    expect(isValidPreferenceValue('enableAudioChimes', 1)).toBe(false);
    expect(isValidPreferenceValue('consoleHeight', NaN)).toBe(false);
    expect(isValidPreferenceValue('consoleHeight', 50)).toBe(false);
    expect(isValidPreferenceValue('consoleHeight', 256)).toBe(true);
  });

  test('coerces numeric-string preview lines to their canonical number', () => {
    const { preferences, dropped } = sanitizePreferences({ cardPreviewLines: '3' });
    expect(dropped).toEqual([]);
    expect(preferences.cardPreviewLines).toBe(3);
  });

  test('never throws on non-object input', () => {
    for (const input of [null, undefined, 'theme', 42, ['dark']]) {
      const { preferences, dropped } = sanitizePreferences(input);
      expect(dropped).toEqual([]);
      expect(preferences).toEqual(DEFAULT_UI_PREFERENCES);
    }
  });
});
