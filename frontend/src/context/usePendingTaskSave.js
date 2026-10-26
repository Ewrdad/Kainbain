// Domain: context — pending task-editor save flush (approve/reject gating).
// Owns the flush ref; editors register, checkpoint actions await it.
import { useCallback, useRef } from 'react';
export function usePendingTaskSave() {
  // The task inspector (overlay / detail page) registers a flush function here
  // so checkpoint approve/reject can first persist its still-unsaved edits.
  const pendingTaskSaveFlushRef = useRef(null);

  /***
   * MARK: setPendingTaskSaveFlush
   * @description Registers (or clears) the flush function of the currently open
   *   task editor. `flush` must persist any unsaved edits and reject when the
   *   save fails. Called with `null` when the editor unmounts.
   * @example setPendingTaskSaveFlush(() => savePendingEdits())
   ***/
  const setPendingTaskSaveFlush = useCallback((flush) => {
    pendingTaskSaveFlushRef.current = typeof flush === 'function' ? flush : null;
  }, []);

  /***
   * MARK: hasPendingTaskSaveFlush
   * @description Synchronously reports whether a task editor with a flush
   *   function is currently open. Used as a fast-path guard so approve/reject
   *   only goes async (waits on the flush) when the inspector is mounted.
   * @example if (hasPendingTaskSaveFlush()) { await flushPendingTaskSave(); }
   ***/
  const hasPendingTaskSaveFlush = useCallback(() => Boolean(pendingTaskSaveFlushRef.current), []);

  /***
   * MARK: flushPendingTaskSave
   * @description Runs the registered editor flush, persisting unsaved task
   *   edits. No-ops when no editor is open. Rejects if the underlying save
   *   failed so the caller can stop instead of acting on stale data.
   * @example await flushPendingTaskSave().then(() => advanceTask(...))
   ***/
  const flushPendingTaskSave = useCallback(async () => {
    const flush = pendingTaskSaveFlushRef.current;
    if (flush) await flush();
  }, []);

  return {
    setPendingTaskSaveFlush,
    hasPendingTaskSaveFlush,
    flushPendingTaskSave,
  };
}
