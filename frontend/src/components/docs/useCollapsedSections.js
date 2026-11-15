import { useCallback, useState } from 'react';
import { DOCS_SIDEBAR_STORAGE_KEY } from './docsSections';

/***
 * MARK: readStoredCollapsed
 * @description Reads the persisted collapsed-section set without throwing:
 *   missing storage, corrupt JSON, or non-array payloads all fall back to an
 *   empty (all-expanded) set. Unknown ids are kept here and ignored by
 *   callers that only look up known sections.
 * @returns {Set<string>} Section ids stored as collapsed.
 * @example readStoredCollapsed() // => Set() on first visit
 ***/
export const readStoredCollapsed = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(DOCS_SIDEBAR_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s) => typeof s === 'string' && s.length > 0));
  } catch {
    return new Set();
  }
};

/***
 * MARK: useCollapsedSections
 * @description Collapse state for the docs sidebar groups. Initialised from
 *   localStorage (survey mandate: choices persist across visits) and written
 *   back on every change. `isCollapsed` forces a stored-collapsed group open
 *   when it holds the filter match or the active article — callers pass the
 *   forced-open set, the hook only owns the stored set.
 * @returns {{ collapsed: Set<string>, toggle: (section: string) => void }}
 * @example const { collapsed, toggle } = useCollapsedSections();
 ***/
export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  const toggle = useCallback((section) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(DOCS_SIDEBAR_STORAGE_KEY, JSON.stringify([...next]));
        }
      } catch {
        // Private-mode / quota failures must never break the sidebar toggle.
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
