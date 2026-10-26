/**
 * MARK: logViewerState
 * @description Persistence-backed UI preferences for the unified LogViewer.
 *   `useLogViewerState({ surface, taskId })` owns selected categories,
 *   search, density, timestamp visibility/format, auto-scroll, and expanded
 *   rows. Category/density/timestamp/search/auto-scroll persist per surface
 *   (per task for the task surface); expanded rows are session-only.
 *
 *   Persistence keys (`kainbain:logViewer:<surface>[:task:<id>]:<field>`)
 *   are new for the unified viewer. Legacy keys migrate read-only exactly
 *   once: the old task feed (`kainbain:taskLogs:<id>:feed`) and the old
 *   board tag (`kainbain:board:logTag`) seed the initial categories when no
 *   unified key exists yet. Stale legacy keys are left untouched.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  defaultCategorySet,
  hydrateCategories,
  isKnownCategory,
  legacyFeedToCategories,
  legacyTagToCategories,
} from './logCategories';

const VALID_DENSITIES = ['compact', 'full'];
const VALID_TS_FORMATS = ['HH:MM:SS', 'HH:MM:SS.mmm', 'ISO'];

function readLegacyJson(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/***
 * MARK: baseKeyForSurface
 * @description Storage namespace for a viewer surface.
 ***/
export function baseKeyForSurface(surface = 'task', taskId = null) {
  if (surface === 'task') return `kainbain:logViewer:task:${taskId ?? 'none'}`;
  return `kainbain:logViewer:${surface}`;
}

/***
 * MARK: initialCategories
 * @description Pure initializer: stored unified categories win; otherwise a
 *   legacy feed/tag seeds once; otherwise density defaults. Exported for tests.
 ***/
export function initialCategories({ stored, surface, taskId, density }) {
  // A stored unified value (even partial) means the user already chose in
  // the new viewer, so it always wins over legacy keys.
  if (stored !== undefined && stored !== null) return hydrateCategories(stored, density);
  if (surface === 'task') {
    const legacyFeed = readLegacyJson(`kainbain:taskLogs:${taskId ?? 'none'}:feed`);
    if (typeof legacyFeed === 'string') return legacyFeedToCategories(legacyFeed, density);
  }
  if (surface === 'activity' || surface === 'live') {
    const legacyTag = readLegacyJson('kainbain:board:logTag');
    if (typeof legacyTag === 'string') return legacyTagToCategories(legacyTag, density);
  }
  return hydrateCategories(stored, density);
}

/***
 * MARK: initialSearch
 * @description Pure initializer for the search field: a stored unified value
 *   wins; otherwise the legacy per-surface search seeds once; else empty.
 *   Exported for tests.
 ***/
export function initialSearch({ stored, surface, taskId }) {
  if (typeof stored === 'string') return stored.slice(0, 500);
  if (surface === 'task') {
    const legacy = readLegacyJson(`kainbain:taskLogs:${taskId ?? 'none'}:search`);
    if (typeof legacy === 'string') return legacy.slice(0, 500);
  }
  if (surface === 'activity' || surface === 'live') {
    const legacy = readLegacyJson('kainbain:board:logSearch');
    if (typeof legacy === 'string') return legacy.slice(0, 500);
  }
  return '';
}

/***
 * MARK: useLogViewerState
 * @description Viewer preferences + persistence for one surface.
 ***/
export function useLogViewerState({ surface = 'task', taskId = null } = {}) {
  const baseKey = baseKeyForSurface(surface, taskId);
  const defaultDensity = surface === 'task' ? 'full' : 'compact';

  const [density, setDensity] = usePersistentState(`${baseKey}:density`, defaultDensity, {
    validate: (v) => VALID_DENSITIES.includes(v),
  });
  const effectiveDensity = VALID_DENSITIES.includes(density) ? density : defaultDensity;

  // Categories seed from legacy keys exactly once via the lazy initializer;
  // afterwards the persisted unified key is the source of truth. Note: the
  // hook only uses this fallback when the unified key is absent (or corrupt),
  // so a stored unified selection always wins over legacy keys.
  const [storedCategories, setStoredCategories] = usePersistentState(
    `${baseKey}:categories`,
    () => initialCategories({ stored: undefined, surface, taskId, density: defaultDensity }),
    {
      serialize: (set) => JSON.stringify([...set]),
      deserialize: (raw) => {
        const parsed = JSON.parse(raw);
        return new Set((Array.isArray(parsed) ? parsed : []).filter(isKnownCategory));
      },
      validate: (v) => v instanceof Set,
    },
  );
  const categories = useMemo(
    () =>
      storedCategories instanceof Set
        ? storedCategories
        : hydrateCategories(storedCategories, effectiveDensity),
    [storedCategories, effectiveDensity],
  );

  const [search, setSearch] = usePersistentState(
    `${baseKey}:search`,
    () => initialSearch({ stored: undefined, surface, taskId }),
    {
      validate: (v) => typeof v === 'string' && v.length <= 500,
      debounceMs: 800,
    },
  );

  const [showTimestamps, setShowTimestamps] = usePersistentState(
    `${baseKey}:timestamps`,
    effectiveDensity === 'full',
    { validate: (v) => typeof v === 'boolean' },
  );

  const [timestampFormat, setTimestampFormat] = usePersistentState(
    `${baseKey}:timestampFormat`,
    'HH:MM:SS',
    { validate: (v) => VALID_TS_FORMATS.includes(v) },
  );

  const [autoScroll, setAutoScroll] = usePersistentState(`${baseKey}:autoScroll`, true, {
    validate: (v) => typeof v === 'boolean',
  });

  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const toggleCategory = useCallback(
    (categoryId) => {
      setStoredCategories((prev) => {
        const base = prev instanceof Set ? prev : hydrateCategories([...(prev || [])]);
        const next = new Set(base);
        if (next.has(categoryId)) next.delete(categoryId);
        else next.add(categoryId);
        return next;
      });
    },
    [setStoredCategories],
  );

  const selectAll = useCallback(() => {
    setStoredCategories(defaultCategorySet(effectiveDensity));
  }, [setStoredCategories, effectiveDensity]);

  const reset = useCallback(() => {
    setStoredCategories(defaultCategorySet(effectiveDensity));
    setSearch('');
  }, [setStoredCategories, setSearch, effectiveDensity]);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const hasActiveFilter = useMemo(() => {
    const defaults = defaultCategorySet(effectiveDensity);
    const same = categories.size === defaults.size && [...categories].every((c) => defaults.has(c));
    return !same || String(search || '').trim() !== '';
  }, [categories, search, effectiveDensity]);

  return {
    surface,
    taskId,
    categories,
    search,
    density: effectiveDensity,
    showTimestamps,
    timestampFormat,
    autoScroll,
    expandedIds,
    setSearch,
    setDensity,
    setShowTimestamps,
    setTimestampFormat,
    setAutoScroll,
    toggleCategory,
    selectAll,
    reset,
    toggleExpanded,
    hasActiveFilter,
  };
}

export * from './logScroll';
