import { useCallback, useEffect, useRef, useState } from 'react';

/***
 * MARK: usePendingAction
 * @description Makes button-triggered mutations (approve, reject, delete, skip...)
 *   safe on a slow connection. While one action is in flight the UI can show a
 *   blocking loading state (disable the button, show a spinner) and any further
 *   run() call is ignored, so a fast double-click can never submit the same
 *   mutation twice or fire a second action on stale data.
 *
 *   The in-flight marker is mirrored in a ref so a second click in the same tick
 *   (before React re-renders) is still rejected synchronously.
 *
 * @example const { pendingKey, run } = usePendingAction();
 *   const isDeleting = pendingKey === 'delete';
 *   <button
 *     disabled={pendingKey !== null}
 *     onClick={() => run('delete', () => deleteTask(projectId, task.id))}
 *   >
 *     {isDeleting ? 'Deleting...' : 'Delete Task'}
 *   </button>
 ***/
export function usePendingAction() {
  // Which action (key) is currently in flight, for loading labels/disabled states.
  const [pendingKey, setPendingKey] = useState(null);
  // Synchronous single-flight guard: set before the first render reflects it.
  const pendingKeyRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /***
   * MARK: run
   * @description Runs the given async mutation exactly one at a time. If another
   *   action started via this hook is still awaiting the backend, the call is
   *   ignored and undefined is returned; otherwise it resolves with the action's
   *   result once the backend has responded (errors propagate to the caller).
   * @example await run('approve', () => advanceTask(projectId, taskId))
   * @param {string} key - Stable name of the action, e.g. 'approve' or 'delete'.
   * @param {Function} action - Async mutation to perform.
   * @returns {Promise<any>} The action's result, or undefined when skipped.
   ***/
  const run = useCallback(async (key, action) => {
    if (pendingKeyRef.current) return undefined;
    pendingKeyRef.current = key;
    setPendingKey(key);
    try {
      return await action();
    } finally {
      pendingKeyRef.current = null;
      if (isMountedRef.current) setPendingKey(null);
    }
  }, []);

  return { pendingKey, isPending: pendingKey !== null, run };
}