import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTaskGoalDraft } from './useTaskGoalDraft';
import { taskDraftKey } from '../services/taskDrafts';

/***
 * MARK: seedDraft
 * @description Writes a draft record straight to localStorage, simulating an
 *   edit cached by a previous editor session.
 ***/
function seedDraft(taskId, value, { updatedAt = Date.now(), projectId = 'proj-1' } = {}) {
  window.localStorage.setItem(
    taskDraftKey(taskId),
    JSON.stringify({ value, updatedAt, projectId }),
  );
}

/***
 * MARK: setup
 * @description Renders the shared goal-draft hook with mocked collaborators.
 ***/
function setup(task, overrides = {}) {
  const updateTask = overrides.updateTask ?? vi.fn().mockResolvedValue({ id: task?.id });
  const setPendingTaskSaveFlush = overrides.setPendingTaskSaveFlush ?? vi.fn();
  const runTaskAction = overrides.runTaskAction ?? vi.fn((_key, fn) => fn());
  const props = {
    task,
    activeProjectId: 'proj-1',
    updateTask,
    setPendingTaskSaveFlush,
    runTaskAction,
  };
  const hook = renderHook((hookProps) => useTaskGoalDraft(hookProps), {
    initialProps: props,
  });
  return { ...hook, props, updateTask, setPendingTaskSaveFlush, runTaskAction };
}

describe('useTaskGoalDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts from the server goal with no pending edits when nothing is cached', () => {
    const { result } = setup({ id: 'task-1', goal: 'Server goal', title: 'Server goal' });

    expect(result.current.title).toBe('Server goal');
    expect(result.current.hasUnsyncedGoalChanges).toBe(false);
    expect(result.current.hasPendingEdits).toBe(false);
  });

  it('caches a keystroke synchronously and flags it unsynced', () => {
    const { result } = setup({ id: 'task-1', goal: 'Server goal' });

    act(() => {
      result.current.handleTitleChange('Half-typed goal');
    });

    expect(result.current.title).toBe('Half-typed goal');
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toContain('Half-typed goal');
    expect(result.current.hasUnsyncedGoalChanges).toBe(true);
  });

  it('flushes pending edits and drops the cache once the API confirms', async () => {
    const { result, updateTask } = setup({ id: 'task-1', goal: 'Server goal' });

    act(() => {
      result.current.handleTitleChange('Confirmed goal');
    });
    await act(async () => {
      await result.current.flushPendingTaskSaves();
    });

    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-1', {
      title: 'Confirmed goal',
      goal: 'Confirmed goal',
    });
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
    expect(result.current.hasUnsyncedGoalChanges).toBe(false);
    // Settle the confirm-to-clear state chain inside act.
    await act(async () => {});
  });

  it('keeps the draft and rejects the flush when the save fails', async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error('backend down'));
    const { result } = setup({ id: 'task-1', goal: 'Server goal' }, { updateTask });

    act(() => {
      result.current.handleTitleChange('Doomed goal');
    });
    await act(async () => {
      await expect(result.current.flushPendingTaskSaves()).rejects.toThrow(
        'Failed to save pending task edits',
      );
    });

    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toContain('Doomed goal');
    expect(result.current.hasUnsyncedGoalChanges).toBe(true);
    // Settle the failure-recording state chain inside act.
    await act(async () => {});
  });

  it('re-pushes a left-behind draft when the task is opened', async () => {
    seedDraft('task-1', 'Left-behind goal');
    const { result, updateTask } = setup({ id: 'task-1', goal: 'Server goal' });

    // The draft wins over the stale server value immediately.
    expect(result.current.title).toBe('Left-behind goal');

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-1', {
        title: 'Left-behind goal',
        goal: 'Left-behind goal',
      });
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
    });
    // Settle the confirm-to-clear state chain inside act.
    await act(async () => {});
  });

  it('drops a draft that already matches the server instead of re-saving it', async () => {
    seedDraft('task-1', 'Server goal');
    const { result, updateTask } = setup({ id: 'task-1', goal: 'Server goal' });

    expect(result.current.title).toBe('Server goal');
    await waitFor(() => {
      expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
    });
    expect(updateTask).not.toHaveBeenCalled();
    // Settle the clear state chain inside act.
    await act(async () => {});
  });

  it('switching tasks shows the new task draft, never the previous task text', async () => {
    seedDraft('task-a', 'Draft A');
    seedDraft('task-b', 'Draft B');
    const { result, rerender, props } = setup({ id: 'task-a', goal: 'Goal A' });
    expect(result.current.title).toBe('Draft A');

    rerender({ ...props, task: { id: 'task-b', goal: 'Goal B' } });

    expect(result.current.title).toBe('Draft B');
    // Settle the reopened task's retry-save chain inside act.
    await act(async () => {});
  });

  it('switching to an unedited task leaves no spurious unsynced state', async () => {
    const { result, rerender, props } = setup({ id: 'task-a', goal: 'Goal A' });
    act(() => {
      result.current.handleTitleChange('Edited A');
    });
    expect(result.current.hasPendingEdits).toBe(true);

    rerender({ ...props, task: { id: 'task-b', goal: 'Goal B' } });

    expect(result.current.title).toBe('Goal B');
    // The previous task's save baseline must not mark the new text dirty.
    expect(result.current.hasPendingEdits).toBe(false);
    // Settle any pending save chain inside act.
    await act(async () => {});
  });

  it('registers its flush with the context and unregisters on unmount', () => {
    const { unmount, setPendingTaskSaveFlush } = setup({
      id: 'task-1',
      goal: 'Server goal',
    });

    expect(setPendingTaskSaveFlush).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(setPendingTaskSaveFlush).toHaveBeenLastCalledWith(null);
  });

  it('manual save confirms through the API and reports Saved', async () => {
    const { result, updateTask, runTaskAction } = setup({
      id: 'task-1',
      goal: 'Server goal',
    });

    act(() => {
      result.current.handleTitleChange('Manually saved goal');
    });
    await act(async () => {
      result.current.saveChanges();
      await runTaskAction.mock.results[0].value;
    });

    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-1', {
      title: 'Manually saved goal',
      goal: 'Manually saved goal',
    });
    expect(result.current.saved).toBe(true);
    // Settle the confirm-to-clear state chain inside act.
    await act(async () => {});
  });
});
