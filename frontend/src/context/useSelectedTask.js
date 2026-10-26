// Domain: context — inspector selection (snapshot + fresh-board overlay + hydration).
// Owns the selected task snapshot; derives the freshest view from the board.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
export function useSelectedTask({ tasksList, activeProjectId }) {
  const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState(null);
  const selectedTaskProjectRef = useRef(null);

  // Derive the inspector's task: the snapshot chosen at selection time, but
  // preferring the freshest board entry with the same id. When a task created
  // via the inline form or opened from a card is updated by a WebSocket merge
  // or a background refresh (status change, server-curated prompt), the
  // inspector would otherwise show a stale snapshot forever. A same-id swap
  // never resets the editor's local edits (title/goal live in the
  // overlay's own state and only re-sync when the task id changes).
  const selectedTask = useMemo(() => {
    if (!selectedTaskSnapshot?.id) return selectedTaskSnapshot;
    const fresh = (tasksList || []).find((t) => String(t.id) === String(selectedTaskSnapshot.id));
    if (!fresh) return selectedTaskSnapshot;
    return {
      ...selectedTaskSnapshot,
      ...fresh,
      reports: fresh.reports?.some((report) => typeof report?.content === 'string')
        ? fresh.reports
        : selectedTaskSnapshot.reports || fresh.reports,
    };
  }, [selectedTaskSnapshot, tasksList]);

  const setSelectedTaskWithUrl = useCallback((task) => {
    // Same-task navigation must not replace hydrated detail with a compact row.
    // Fresh board metadata is overlaid by the selectedTask derivation above.
    setSelectedTaskSnapshot((previous) => (task?.id && previous?.id === task.id ? previous : task));
  }, []);

  // Compact board rows cannot supply inspector history or report bodies.
  // Fetch once per selection; cancellation prevents late responses replacing another task.
  const selectedTaskId = selectedTaskSnapshot?.id;
  useEffect(() => {
    const projectId = activeProjectId;
    if (selectedTaskProjectRef.current !== projectId) {
      selectedTaskProjectRef.current = projectId;
      // Task IDs alone do not identify detail across projects. Discard the old
      // project's bodies while the new project's detail request is pending.
      setSelectedTaskSnapshot((previous) => (previous ? { id: previous.id } : previous));
    }
    if (!selectedTaskId || !projectId) return undefined;
    let cancelled = false;
    api
      .getTask(projectId, selectedTaskId)
      .then((full) => {
        if (!full || cancelled) return;
        setSelectedTaskSnapshot((previous) =>
          previous?.id === selectedTaskId ? { ...previous, ...full } : previous,
        );
      })
      .catch((error) => logger.warn('Failed to hydrate task details', error));
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId, activeProjectId]);

  return {
    selectedTaskSnapshot,
    setSelectedTaskSnapshot,
    selectedTask,
    setSelectedTask: setSelectedTaskWithUrl,
  };
}
