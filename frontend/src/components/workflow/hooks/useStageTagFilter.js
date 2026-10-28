import { useCallback, useRef, useState } from 'react';
import {
  STAGE_TAG_FILTER_STORAGE_KEY,
  STAGE_TAG_FILTER_MODE_STORAGE_KEY,
  currentStageTagFilter,
  normalizeSelectedTagTokens,
  writeStageTagFilterParam,
} from '../stageTagFilter';

/***
 * MARK: readStoredStageTags
 * @description Reads the persisted tag selection from localStorage. Corrupt
 *   or non-array payloads degrade to an empty selection — a bad stored value
 *   must never blank the board.
 * @returns {Array<string>}
 ***/
function readStoredStageTags() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STAGE_TAG_FILTER_STORAGE_KEY);
    if (!raw) return [];
    return normalizeSelectedTagTokens(JSON.parse(raw));
  } catch {
    return [];
  }
}

/***
 * MARK: readStoredStageTagMode
 * @description Reads the persisted match mode ('any' | 'all'); anything other
 *   than 'all' reads as the default 'any'.
 * @returns {'any'|'all'}
 ***/
function readStoredStageTagMode() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'any';
    return window.localStorage.getItem(STAGE_TAG_FILTER_MODE_STORAGE_KEY) === 'all' ? 'all' : 'any';
  } catch {
    return 'any';
  }
}

/***
 * MARK: writeStoredStageTags
 * @description Persists the tag selection; an empty selection removes the key
 *   so a cleared filter never resurrects on the next load.
 * @param {Array<string>} tags
 ***/
function writeStoredStageTags(tags) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (tags.length === 0) {
      window.localStorage.removeItem(STAGE_TAG_FILTER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(STAGE_TAG_FILTER_STORAGE_KEY, JSON.stringify(tags));
    }
  } catch {
    // Storage unavailable (private mode); the filter still works this session.
  }
}

/***
 * MARK: useStageTagFilter
 * @description Board tag-filter state: the selected stage tags and the match
 *   mode ('any' matches at least one selected tag, 'all' requires every
 *   selected tag). Hydration is URL-first — a shared `?tags=PO,Dev&tagMode=all`
 *   link always wins — with localStorage as the fallback for repeat visits.
 *   Every mutation writes both localStorage and the URL (via
 *   `writeStageTagFilterParam`) so the address bar stays a shareable link.
 * @example const { selectedStageTags, setSelectedStageTags } = useStageTagFilter();
 ***/
export function useStageTagFilter() {
  const [selectedStageTags, setSelectedStageTagsState] = useState(() => {
    const fromUrl = currentStageTagFilter();
    if (fromUrl.present) return fromUrl.selected;
    return readStoredStageTags();
  });
  const [stageTagFilterMode, setStageTagFilterModeState] = useState(() => {
    const fromUrl = currentStageTagFilter();
    // When the URL mentions the tag filter at all, it is the source of truth
    // for the match mode too: an omitted `tagMode` means the default 'any',
    // regardless of any value stashed in localStorage on this device.
    if (fromUrl.present) return fromUrl.mode === 'all' ? 'all' : 'any';
    return readStoredStageTagMode();
  });
  // Refs mirror the state so each setter writes the URL with the other's
  // latest value (no stale-closure drift between the two setters).
  const selectedRef = useRef(selectedStageTags);
  const modeRef = useRef(stageTagFilterMode);

  /***
   * MARK: setSelectedStageTags
   * @description Sets the selected tags (array/Set/comma string), normalises,
   *   and syncs localStorage + URL.
   * @param {Array<string>|Set<string>|string} next
   ***/
  const setSelectedStageTags = useCallback((next) => {
    const normalized = normalizeSelectedTagTokens(next);
    selectedRef.current = normalized;
    setSelectedStageTagsState(normalized);
    writeStoredStageTags(normalized);
    writeStageTagFilterParam(normalized, modeRef.current);
  }, []);

  /***
   * MARK: setStageTagFilterMode
   * @description Sets the match mode ('any' | 'all'; anything else reads as
   *   'any') and syncs localStorage + URL.
   * @param {'any'|'all'} next
   ***/
  const setStageTagFilterMode = useCallback((next) => {
    const mode = next === 'all' ? 'all' : 'any';
    modeRef.current = mode;
    setStageTagFilterModeState(mode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STAGE_TAG_FILTER_MODE_STORAGE_KEY, mode);
      }
    } catch {
      // Storage unavailable; the mode still works this session.
    }
    writeStageTagFilterParam(selectedRef.current, mode);
  }, []);

  return {
    selectedStageTags,
    setSelectedStageTags,
    stageTagFilterMode,
    setStageTagFilterMode,
  };
}
