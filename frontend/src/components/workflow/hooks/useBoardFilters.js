import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSearchQuery } from '../searchQueryParser';
import { usePersistentState } from '../../../hooks/usePersistentState';

/***
 * MARK: useBoardFilters
 * @description Board filter state extracted from WorkflowCanvas: search
 *   (which now also carries `!` system-native filters), show-completed
 *   toggle, inline add-task form state and the mobile stage-tab selection.
 *   No JSX — returns state values + setters.
 * @example const filters = useBoardFilters({ uiPreferences });
 ***/
export function useBoardFilters({ uiPreferences } = {}) {
  const [searchQuery, setSearchQuery] = usePersistentState('kainbain:board:search', '', {
    validate: (v) => typeof v === 'string' && v.length <= 500,
    debounceMs: 800,
    syncAcrossTabs: true,
  });
  const [showCompleted, setShowCompletedRaw] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('kainbain:showCompleted');
      if (stored !== null) return stored === 'true';
    }
    return uiPreferences?.defaultShowCompletedTasks === true;
  });
  const [addingTaskStageId, setAddingTaskStageId] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedMobileStageId, setSelectedMobileStageId] = useState(null);

  // One-time migration of the legacy `kainbain:board:statusFilter` pill state
  // into the merged search bar: append `!failed` / `!human` to the query once.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const stored = window.localStorage.getItem('kainbain:board:statusFilter');
      if (!stored) return;
      let parsedStatus = stored;
      try {
        parsedStatus = JSON.parse(stored);
      } catch {
        // Keep the raw stored string.
      }
      if (parsedStatus === 'failed' || parsedStatus === 'human') {
        setSearchQuery((prev) => {
          const safePrev = typeof prev === 'string' ? prev : '';
          if (safePrev.includes(`!${parsedStatus}`)) return safePrev;
          const trimmed = safePrev.trim();
          return trimmed ? `${trimmed} !${parsedStatus}` : `!${parsedStatus}`;
        });
      }
      window.localStorage.removeItem('kainbain:board:statusFilter');
    } catch {
      // Storage unavailable; ignore.
    }
  }, [setSearchQuery]);

  const setShowCompleted = (next) => {
    setShowCompletedRaw(next);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('kainbain:showCompleted', String(next));
      } catch {
        // Storage unavailable (e.g. privacy mode); toggle still works for this session.
      }
    }
  };

  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    derivedTags: parsedQuery.tags,
    derivedText: parsedQuery.text,
    derivedSystemFilters: parsedQuery.systemFilters,
    parsedQuery,
    showCompleted,
    setShowCompleted,
    addingTaskStageId,
    setAddingTaskStageId,
    newTaskTitle,
    setNewTaskTitle,
    selectedMobileStageId,
    setSelectedMobileStageId,
  };
}
