import { useState } from 'react';

/***
 * MARK: useCollapsedGroups
 * @description Collapsed-group seam extracted from WorkflowCanvas: tracks which
 *   collapsed stage runs have been expanded (ephemeral, per-session) and
 *   provides a copy-on-write toggle.
 * @example const { expandedCollapsedGroups, toggleCollapsedGroup } = useCollapsedGroups();
 ***/
export function useCollapsedGroups() {
  const [expandedCollapsedGroups, setExpandedCollapsedGroups] = useState(() => new Set());

  const toggleCollapsedGroup = (groupId) => {
    setExpandedCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const isGroupExpanded = (groupId) => expandedCollapsedGroups.has(groupId);

  return {
    expandedCollapsedGroups,
    toggleCollapsedGroup,
    isGroupExpanded,
  };
}
