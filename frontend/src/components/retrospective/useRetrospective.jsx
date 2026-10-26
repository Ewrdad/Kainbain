import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/***
 * MARK: RetrospectiveContext
 * @description Shared selection state for the three retrospective panes
 *   (histories, quick actions, chat): the selected task-id set plus a
 *   seeded chat draft (text + nonce so identical seeds re-apply).
 ***/
const RetrospectiveContext = createContext(null);

/***
 * MARK: useRetrospective
 * @description Reads the retrospective selection context. Must render inside
 *   a `RetrospectiveProvider`.
 * @example const { selectedIds, toggleSelected } = useRetrospective();
 * @returns {{selectedIds: Set<string>, toggleSelected: Function, setSelected: Function, clearSelection: Function, chatSeed: {text: string, nonce: number}, seedChat: Function}}
 ***/
export function useRetrospective() {
  const ctx = useContext(RetrospectiveContext);
  if (!ctx) throw new Error('useRetrospective must be used inside a RetrospectiveProvider');
  return ctx;
}

/***
 * MARK: RetrospectiveProvider
 * @description Owns the cross-pane selection state for the retrospective page.
 * @example <RetrospectiveProvider><RetrospectivePage /></RetrospectiveProvider>
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {Array<string>} [props.initialSelectedIds] - Preselected task ids (tests).
 ***/
export function RetrospectiveProvider({ children, initialSelectedIds = [] }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedIds));
  const [chatSeed, setChatSeed] = useState({ text: '', nonce: 0 });

  const toggleSelected = useCallback((taskId) => {
    if (!taskId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const setSelected = useCallback((taskId, selected) => {
    if (!taskId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const seedChat = useCallback((text) => {
    setChatSeed((prev) => ({ text: typeof text === 'string' ? text : '', nonce: prev.nonce + 1 }));
  }, []);

  const value = useMemo(
    () => ({ selectedIds, toggleSelected, setSelected, clearSelection, chatSeed, seedChat }),
    [selectedIds, toggleSelected, setSelected, clearSelection, chatSeed, seedChat],
  );

  return <RetrospectiveContext.Provider value={value}>{children}</RetrospectiveContext.Provider>;
}
