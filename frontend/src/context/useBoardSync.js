// Domain: context — live board-sync wiring (no state of its own).
// Keeps the WebSocket handlers pointed at the latest project via refs, and
// runs the foreground polling safety net for throttled background tabs.
import { useEffect } from 'react';
export function useBoardSync({ activeProjectIdRef, taskSyncHandlerRef, activeProjectId, tasks }) {
  // Keep the live board-sync ref pointed at the current project.
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId ?? null;
  }, [activeProjectId, activeProjectIdRef]);

  // Wire the task-refresh handler once `tasks` (and thus scheduleTaskRefresh)
  // exists; the WebSocket hook reads it via ref at event time.
  useEffect(() => {
    taskSyncHandlerRef.current = (projectId) => {
      if (projectId) tasks.scheduleTaskRefresh?.(projectId);
    };
  }, [tasks, taskSyncHandlerRef]);

  // Live board sync safety net. The WebSocket TASK_UPDATED/TASK_DELETED events
  // keep the board fresh in the foreground, but browsers throttle timers and
  // events hard for background tabs — exactly when the board can go stale. So:
  //  - light foreground polling (skipped entirely while the tab is hidden), and
  //  - an immediate catch-up refresh whenever a backgrounded tab regains focus.
  useEffect(() => {
    const pid = activeProjectId;
    if (!pid) return undefined;

    let alive = true;
    const sync = () => {
      if (alive) taskSyncHandlerRef.current?.(pid);
    };
    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const interval = setInterval(() => {
      if (isVisible()) sync();
    }, 8000);

    const onVisibility = () => {
      if (isVisible()) sync();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onVisibility);
    }

    return () => {
      alive = false;
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibility);
      }
    };
  }, [activeProjectId, taskSyncHandlerRef]);
}
