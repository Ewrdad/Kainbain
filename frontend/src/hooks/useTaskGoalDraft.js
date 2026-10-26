import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoSave } from './useAutoSave';
import { useTaskDraftCache } from './useTaskDraftCache';
import { noteTaskDraftFailure, readTaskDraft } from '../services/taskDrafts';

/***
 * MARK: useTaskGoalDraft
 * @description Single owner of the task goal/title draft lifecycle, shared by
 *   the full task page and the slide-over inspector so the two editors can
 *   never drift apart. Every keystroke is cached to localStorage synchronously
 *   (closing or reloading before the debounced save cannot lose text) and the
 *   entry is dropped only after the backend confirms the PATCH — a newer
 *   keystroke that raced an in-flight save is never deleted with it.
 *
 *   Reopening a task with a draft restores the text with an unsynced flag and
 *   re-pushes it once; approving/rejecting flushes pending edits first so a
 *   checkpoint never advances on stale state.
 * @example const goal = useTaskGoalDraft({ task, activeProjectId, updateTask, setPendingTaskSaveFlush, runTaskAction });
 * @param {Object} options
 * @param {Object} [options.task] - The task being edited.
 * @param {string} [options.activeProjectId] - Owning project.
 * @param {Function} options.updateTask - `(projectId, taskId, patch) => Promise`.
 * @param {Function} [options.setPendingTaskSaveFlush] - Registers the flush so
 *   checkpoint actions fired outside this editor wait for its pending save.
 * @param {Function} [options.runTaskAction] - Single-flight runner owning the
 *   manual-save busy state.
 * @returns {Object} Title state, auto-save wiring, unsynced flags, flush and
 *   manual-save callbacks.
 ***/
export function useTaskGoalDraft({
  task,
  activeProjectId,
  updateTask,
  setPendingTaskSaveFlush,
  runTaskAction,
}) {
  const taskId = task?.id;
  const serverGoal = task?.goal ?? task?.title ?? '';

  // Local draft cache for the goal editor: text is cached on every keystroke
  // and only dropped once the backend confirms the PATCH. A draft restored on
  // reopen survives a slow connection (the reported close/reopen data loss).
  const { draftEntry, cacheDraft, confirmReceived } = useTaskDraftCache(
    taskId,
    activeProjectId,
  );

  const [title, setTitle] = useState(() => draftEntry?.value ?? serverGoal);

  // Auto-save the task goal/title. `lastSaveFailedRef` lets the flush helper
  // below tell a failed save from a successful one (the hook records errors in
  // state but resolves saveNow normally).
  const lastSaveFailedRef = useRef(false);

  /***
   * MARK: persistGoal
   * @description Sends one goal edit to the backend and drops the local draft
   *   only after the API confirms receipt. When a newer keystroke raced this
   *   PATCH, `confirmReceived` keeps that newer draft instead of deleting it.
   * @example await persistGoal('Refined goal text')
   * @param {string} val - The goal/title text to save.
   ***/
  const persistGoal = useCallback(
    async (val) => {
      if (!taskId) return;
      const patch = { title: val, goal: val };
      try {
        await updateTask(activeProjectId, taskId, patch);
        confirmReceived(val);
      } catch (e) {
        lastSaveFailedRef.current = true;
        noteTaskDraftFailure({ taskId });
        throw e; // recorded as the hook's error state and shown by the goal section
      }
    },
    [taskId, activeProjectId, updateTask, confirmReceived],
  );

  const {
    isSaving: goalIsSaving,
    lastSaved: goalLastSaved,
    error: goalError,
    isDirty: goalIsDirty,
    handleBlur: goalHandleBlur,
    saveNow: goalSaveNow,
    resetBaseline: resetSaveBaseline,
  } = useAutoSave(title, persistGoal);

  // Sync state if the open task changes (an unconfirmed draft for the new
  // task wins over the server value so reopening never hides the user's
  // edit). The new task's draft is read straight from storage: on this render
  // pass the hook state above still belongs to the previous task, so using it
  // here would bleed one task's text into another. The save baseline is
  // re-anchored to the new text so the previous task's baseline cannot mark
  // it dirty and schedule a spurious save of unchanged text.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    const stored = taskId ? readTaskDraft(taskId) : null;
    const nextTitle = stored?.value ?? serverGoal;
    setTitle(nextTitle);
    resetSaveBaseline(nextTitle);
  }

  // A cached draft means the backend has not confirmed the latest text yet.
  const hasUnsyncedGoalChanges = goalIsDirty || Boolean(draftEntry);
  const hasPendingEdits = hasUnsyncedGoalChanges;

  /***
   * MARK: handleTitleChange
   * @description Keeps the goal text in React state for the editor and caches
   *   it locally in the same keystroke, so a close/reopen before the debounced
   *   save can never lose it.
   * @example handleTitleChange('Refined goal text')
   * @param {string} value - The new goal/title text.
   ***/
  const handleTitleChange = useCallback(
    (value) => {
      setTitle(value);
      cacheDraft(value);
    },
    [cacheDraft],
  );

  // Reopening a task with a cached draft must not leave it stranded: push it
  // once per task open (a failed attempt keeps the draft for the next open).
  // A draft that already matches the server is a lost confirmation — drop it.
  const retriedDraftTaskRef = useRef(null);
  useEffect(() => {
    if (!taskId || !activeProjectId) return;
    if (retriedDraftTaskRef.current === taskId) return;
    const stored = readTaskDraft(taskId);
    if (!stored) return;
    retriedDraftTaskRef.current = taskId;
    if (stored.value === serverGoal) {
      confirmReceived(stored.value);
      return;
    }
    void goalSaveNow();
  }, [taskId, activeProjectId, serverGoal, confirmReceived, goalSaveNow]);

  // Cross-tab reconciliation: another tab cached a newer draft for this task.
  // Adopt it during render (the same adjust-state pattern the task switch
  // above uses) and only while this editor has no local unsaved edits, so text
  // is never yanked out from under the user mid-typing.
  const [prevDraftValue, setPrevDraftValue] = useState(draftEntry?.value ?? null);
  if ((draftEntry?.value ?? null) !== prevDraftValue) {
    setPrevDraftValue(draftEntry?.value ?? null);
    if (draftEntry?.value && draftEntry.value !== title && !goalIsDirty) {
      setTitle(draftEntry.value);
    }
  }

  // True while a checkpoint action is flushing this editor's pending save, so
  // the approve/reject buttons can report "Saving edits..." instead of going
  // idle on a slow connection.
  const [isFlushingSave, setIsFlushingSave] = useState(false);

  /***
   * MARK: flushPendingTaskSaves
   * @description Persists this editor's pending goal edits immediately
   *   (bypassing the debounce) and resolves only when the backend holds them.
   *   Rejects when the save failed so checkpoint approve/reject can stop
   *   instead of acting on a half-saved task.
   * @example await flushPendingTaskSaves().then(() => advanceTask(...))
   ***/
  const flushPendingTaskSaves = useCallback(async () => {
    if (!taskId || !activeProjectId || !hasPendingEdits) return;
    setIsFlushingSave(true);
    try {
      lastSaveFailedRef.current = false;
      await goalSaveNow();
      if (lastSaveFailedRef.current) {
        throw new Error('Failed to save pending task edits');
      }
    } finally {
      setIsFlushingSave(false);
    }
  }, [taskId, activeProjectId, hasPendingEdits, goalSaveNow]);

  // Register the flush with the context so a checkpoint approve/reject fired
  // from a card button (canvas) waits for this editor's pending save too.
  // The wrapper is stable; the ref keeps it pointing at the latest flush so
  // the registration effect never has to re-run while values change.
  const flushRef = useRef(flushPendingTaskSaves);
  useEffect(() => {
    flushRef.current = flushPendingTaskSaves;
  });
  const stableFlush = useCallback(() => flushRef.current?.(), []);
  useEffect(() => {
    setPendingTaskSaveFlush?.(stableFlush);
    return () => setPendingTaskSaveFlush?.(null);
  }, [setPendingTaskSaveFlush, stableFlush]);

  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    },
    [],
  );

  /***
   * MARK: saveChanges
   * @description Manual-save entry point for the Save button. Routes through
   *   the auto-save hook so a manual save updates the same dirty/last-saved
   *   state and cancels any pending debounce timer. The confirm-on-success
   *   call lives inside persistGoal either way.
   * @example <button onClick={saveChanges}>Save Changes</button>
   ***/
  const saveChanges = useCallback(() => {
    if (typeof runTaskAction !== 'function') return;
    runTaskAction('save', async () => {
      lastSaveFailedRef.current = false;
      await goalSaveNow(title);
      if (lastSaveFailedRef.current) return; // failure surfaced; draft stays cached
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 2000);
    }).catch(() => {
      // updateTask surfaces failures via its notification layer.
    });
  }, [runTaskAction, goalSaveNow, title]);

  return {
    title,
    handleTitleChange,
    goalIsSaving,
    goalLastSaved,
    goalError,
    goalIsDirty,
    goalHandleBlur,
    goalSaveNow,
    hasUnsyncedGoalChanges,
    hasPendingEdits,
    flushPendingTaskSaves,
    isFlushingSave,
    saveChanges,
    saved,
  };
}

export default useTaskGoalDraft;
