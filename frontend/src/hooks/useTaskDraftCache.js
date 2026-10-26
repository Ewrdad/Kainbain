import { useCallback, useEffect } from 'react';
import { usePersistentState } from './usePersistentState';
import {
  TASK_DRAFT_DISABLED_KEY,
  TASK_DRAFT_MAX_ENTRIES,
  countTaskDrafts,
  isValidTaskDraft,
  noteTaskDraftConfirmed,
  noteTaskDraftWritten,
  pruneTaskDrafts,
  readTaskDraft,
  taskDraftKey,
} from '../services/taskDrafts';

/***
 * MARK: useTaskDraftCache
 * @description Caches a task goal edit locally the moment it is typed and
 *   exposes `confirmReceived`, which only drops that cache entry once the
 *   backend has acknowledged the save. Reopening the task (even after a reload)
 *   restores the draft, so edits are never lost to a slow network.
 *
 *   Persistence is delegated to `usePersistentState` (one key per task, so a
 *   task switch re-reads rather than bleeding the previous task's text across;
 *   cross-tab updates arrive via `syncAcrossTabs`) while the draft namespace's
 *   entry cap and TTL are enforced by `services/taskDrafts`.
 *
 *   `confirmReceived(confirmedValue)` deliberately refuses to clear the cache
 *   when a newer keystroke landed while the save was in flight — otherwise a
 *   slow PATCH would delete the *next* unsaved edit along with the confirmed one.
 *
 * @example
 *   const { draftValue, cacheDraft, confirmReceived } = useTaskDraftCache(task.id, projectId);
 *   cacheDraft(nextText);            // on every keystroke
 *   await save(nextText);
 *   confirmReceived(nextText);       // only after the API says 2xx
 * @param {string|undefined} taskId - The task whose draft is being edited.
 * @param {string|undefined} projectId - Owning project, stored for board sweeps.
 * @returns {Object} `{ draftValue, draftEntry, cacheDraft, confirmReceived }`.
 ***/
export function useTaskDraftCache(taskId, projectId) {
  const storageKey = taskId ? taskDraftKey(taskId) : TASK_DRAFT_DISABLED_KEY;
  const [draftEntry, setDraftEntry, clearDraftEntry] = usePersistentState(storageKey, null, {
    validate: isValidTaskDraft,
    syncAcrossTabs: true,
  });

  // Bound the namespace after a write, but only run the (parsing) prune scan
  // once the cap is actually threatened — this effect fires on every keystroke
  // and the common case must stay cheap. TTL expiry is handled by the board
  // sweep and by readTaskDraft for the task being opened.
  useEffect(() => {
    if (!draftEntry) return;
    if (countTaskDrafts() > TASK_DRAFT_MAX_ENTRIES) pruneTaskDrafts();
  }, [draftEntry]);

  /***
   * MARK: cacheDraft
   * @description Persists the current editor text as a local draft. Called on
   *   every keystroke; the write is synchronous (no debounce) so closing the
   *   editor straight after typing cannot lose the text.
   * @example cacheDraft('Refined acceptance criteria')
   * @param {string} value - The text to cache.
   ***/
  const cacheDraft = useCallback(
    (value) => {
      if (!taskId || typeof value !== 'string') return;
      noteTaskDraftWritten();
      setDraftEntry({ value, updatedAt: Date.now(), projectId: projectId || null });
    },
    [taskId, projectId, setDraftEntry],
  );

  /***
   * MARK: confirmReceived
   * @description Drops the cached draft after the backend confirms receipt.
   *   Keeps the entry when the stored value is newer than the confirmed one,
   *   so a save that raced a later keystroke cannot delete that later edit.
   * @example confirmReceived('Refined acceptance criteria') => true
   * @param {string} [confirmedValue] - The value the API just accepted.
   * @returns {boolean} True when the cache entry was cleared.
   ***/
  const confirmReceived = useCallback(
    (confirmedValue) => {
      if (!taskId) return false;
      const stored = readTaskDraft(taskId);
      if (stored && typeof confirmedValue === 'string' && stored.value !== confirmedValue) {
        return false;
      }
      noteTaskDraftConfirmed();
      clearDraftEntry();
      return true;
    },
    [taskId, clearDraftEntry],
  );

  return {
    draftValue: draftEntry?.value ?? null,
    draftEntry,
    cacheDraft,
    confirmReceived,
  };
}

export default useTaskDraftCache;
