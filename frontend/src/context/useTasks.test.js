import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTasks } from './useTasks';

vi.mock('../services/api', () => ({
  isValidProjectId: (id) => {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('wf-') || trimmed.startsWith('stage-')) return false;
    if (/^\d+$/.test(trimmed)) return false;
    return true;
  },
  api: {
    listTasks: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    getTaskReports: vi.fn(),
    advanceTask: vi.fn(),
    failbackTask: vi.fn(),
    rejectTaskWithFeedback: vi.fn(),
    jumpTask: vi.fn(),
    completeTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { api } from '../services/api';

/**
 * MARK: useTasks tests
 * @description Verifies the task list state and the kanban lifecycle actions:
 *   advance, failback, reject-with-feedback, jump, complete, create, delete, and the feedback
 *   dialog state.
 */
describe('useTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The mutation hook now consults the local task-draft cache before
    // advancing/rejecting; keep each test free of a previous test's drafts.
    window.localStorage.clear();
  });

  it('fetchTasks stores the task list', async () => {
    api.listTasks.mockResolvedValue([{ id: 't1', goal: 'A' }]);
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(result.current.tasks).toEqual([{ id: 't1', goal: 'A' }]);
  });

  it('createTask creates and refreshes the task list with idempotencyKey', async ({ }) =>{
    api.createTask.mockResolvedValue({ id: 't2', title: 'New Task', goal: 'Goal' });
    api.listTasks.mockResolvedValue([{ id: 't2', title: 'New Task', goal: 'Goal' }]);
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      const task = await result.current.createTask('proj-1', {
        title: 'New Task',
        goal: 'Goal',
        stageId: '1',
      });
      expect(task.id).toBe('t2');
    });
    expect(api.createTask).toHaveBeenCalledWith('proj-1', {
      title: 'New Task',
      goal: 'Goal',
      stageId: '1',
      idempotencyKey: expect.any(String),
    });
    expect(result.current.tasks).toHaveLength(1);
  });

  it('createTask inserts the task immediately without awaiting the full list refresh', async () => {
    // Slow list endpoint: create must NOT wait for it to show the card.
    api.listTasks.mockImplementation(() => new Promise(() => {}));
    api.createTask.mockResolvedValue({ id: 't9', title: 'Instant Task', goal: 'Instant Task' });
    const { result } = renderHook(() => useTasks());

    let created;
    await act(async () => {
      created = await result.current.createTask('proj-1', {
        title: 'Instant Task',
        stageId: '1',
      });
    });

    // The card is on the board the moment the POST response lands, even though
    // the list refetch (debounced, then slowed above) has not responded.
    expect(result.current.tasks).toEqual([created]);
    expect(result.current.tasks[0].id).toBe('t9');
  });

  it('createTask still reconciles board state with a background full refresh', async () => {
    vi.useFakeTimers();
    try {
      // Server truth includes a curated field the optimistic POST snapshot lacks.
      api.listTasks.mockResolvedValue([{ id: 't9', title: 'Instant Task', prompt: 'curated' }]);
      api.createTask.mockResolvedValue({ id: 't9', title: 'Instant Task' });
      const { result } = renderHook(() => useTasks());

      await act(async () => {
        await result.current.createTask('proj-1', { title: 'Instant Task' });
      });
      expect(api.listTasks).not.toHaveBeenCalled();

      // Debounced background refresh lands and reconciles the curated fields.
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      expect(api.listTasks).toHaveBeenCalledWith('proj-1');
      expect(result.current.tasks[0].prompt).toBe('curated');
    } finally {
      vi.useRealTimers();
    }
  });

  it('upsertTask prepends an unknown task (live-created card) and replaces a known one in place', () => {
    const { result } = renderHook(() => useTasks());

    act(() => {
      // Broadcast for a task the board has never seen (created in another tab).
      result.current.upsertTask({ id: 't-live', title: 'Live task' });
    });
    expect(result.current.tasks).toEqual([{ id: 't-live', title: 'Live task' }]);

    act(() => {
      // Stage changed elsewhere: same card must not duplicate.
      result.current.upsertTask({ id: 't-live', title: 'Live task', currentStageId: '3' });
    });
    expect(result.current.tasks).toEqual([
      { id: 't-live', title: 'Live task', currentStageId: '3' },
    ]);
  });

  it('upsertTask rejects payloads without an id', () => {
    const { result } = renderHook(() => useTasks());
    api.listTasks.mockResolvedValue([{ id: 't1' }]);
    let merged;
    act(() => {
      merged = result.current.upsertTask({ title: 'No id' });
    });
    expect(merged).toBe(false);
    expect(result.current.tasks).toEqual([]);
  });

  it('createTask guards against concurrent calls while in flight', async () => {
    let resolveCreate;
    api.createTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    api.listTasks.mockResolvedValue([{ id: 't2', title: 'Task' }]);
    const { result } = renderHook(() => useTasks());

    let p1, p2;
    act(() => {
      p1 = result.current.createTask('proj-1', { title: 'Task' });
      p2 = result.current.createTask('proj-1', { title: 'Task' });
    });

    await act(async () => {
      resolveCreate({ id: 't2', title: 'Task' });
      await p1;
      const res2 = await p2;
      expect(res2).toBeNull();
    });

    expect(api.createTask).toHaveBeenCalledTimes(1);
  });

  it('updateTask rejects when the backend refuses the edit (approve gating relies on this)', async () => {
    api.updateTask.mockRejectedValue(new Error('backend rejected the edit'));
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));

    await expect(
      act(async () => {
        await result.current.updateTask('proj-1', 't1', { goal: 'Edited goal' });
      }),
    ).rejects.toThrow('backend rejected the edit');

    // The failure is surfaced to the user before the rejection propagates.
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Task Update Failed',
      }),
    );
  });

  it('deleteTask deletes and refreshes the task list', async () => {
    api.listTasks.mockResolvedValue([]);
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      await result.current.deleteTask('proj-1', 't1');
    });
    expect(api.deleteTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(result.current.tasks).toHaveLength(0);
  });

  it('getTaskReports fetches reports', async () => {
    api.getTaskReports.mockResolvedValue({ taskId: 't1', reports: [{ name: 'report.md' }] });
    const { result } = renderHook(() => useTasks());
    let res;
    await act(async () => {
      res = await result.current.getTaskReports('proj-1', 't1');
    });
    expect(api.getTaskReports).toHaveBeenCalledWith('proj-1', 't1');
    expect(res.reports).toHaveLength(1);
  });

  it('advanceTask advances and refreshes the list without firing transition toast (#18)', async () => {
    api.advanceTask.mockResolvedValue({ id: 't1', currentStageId: '2' });
    api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: '2' }]);
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));
    await act(async () => {
      await result.current.advanceTask('proj-1', 't1', { autoExecute: false });
    });
    expect(api.advanceTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(result.current.tasks[0].currentStageId).toBe('2');
    expect(onNotification).not.toHaveBeenCalled();
  });

  it('executeTaskStage does not fire success toast but notifies on failure (#18)', async () => {
    api.executeTaskStage = vi.fn().mockResolvedValue({ status: 'completed' });
    api.listTasks.mockResolvedValue([{ id: 't1', status: 'completed' }]);
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));

    await act(async () => {
      await result.current.executeTaskStage('proj-1', 't1');
    });
    expect(onNotification).not.toHaveBeenCalled();

    // Failure case
    api.executeTaskStage.mockResolvedValue({ status: 'failed', error: 'Process timeout' });
    await act(async () => {
      await result.current.executeTaskStage('proj-1', 't1');
    });
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Execution Failed',
      }),
    );
  });

  it('rejectTask fails the task back', async () => {
    api.listTasks.mockResolvedValue([]);
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      await result.current.rejectTask('proj-1', 't1');
    });
    expect(api.failbackTask).toHaveBeenCalledWith('proj-1', 't1');
  });

  it('rejectTaskWithFeedback closes the dialog and refreshes', async () => {
    api.listTasks.mockResolvedValue([]);
    const { result } = renderHook(() => useTasks());
    act(() => result.current.openFeedbackDialog({ id: 't1' }));
    expect(result.current.feedbackTask).toEqual({ id: 't1' });
    await act(async () => {
      await result.current.rejectTaskWithFeedback('proj-1', 't1', 'add tests');
    });
    expect(api.rejectTaskWithFeedback).toHaveBeenCalledWith('proj-1', 't1', 'add tests');
    expect(result.current.feedbackTask).toBeNull();
  });

  it('rejectTaskWithFeedback notifies and rethrows on failure without closing the dialog', async () => {
    api.listTasks.mockResolvedValue([]);
    api.rejectTaskWithFeedback.mockRejectedValue(new Error('backend down'));
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));
    act(() => result.current.openFeedbackDialog({ id: 't1' }));
    await act(async () => {
      await expect(
        result.current.rejectTaskWithFeedback('proj-1', 't1', 'add tests'),
      ).rejects.toThrow('backend down');
    });
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Rejection Failed' }),
    );
    // The dialog stays open so the operator's feedback is not lost.
    expect(result.current.feedbackTask).toEqual({ id: 't1' });
  });

  it('openFeedbackDialog and closeFeedbackDialog toggle the dialog state', () => {
    const { result } = renderHook(() => useTasks());
    act(() => result.current.openFeedbackDialog({ id: 't9' }));
    expect(result.current.feedbackTask).toEqual({ id: 't9' });
    act(() => result.current.closeFeedbackDialog());
    expect(result.current.feedbackTask).toBeNull();
  });

  it('jumpTask jumps and refreshes without firing transition toast (#18)', async () => {
    api.jumpTask.mockResolvedValue({ id: 't1', currentStageId: '5' });
    api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: '5' }]);
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));
    await act(async () => {
      await result.current.jumpTask('proj-1', 't1', '5');
    });
    expect(api.jumpTask).toHaveBeenCalledWith('proj-1', 't1', '5');
    expect(result.current.tasks[0].currentStageId).toBe('5');
    expect(onNotification).not.toHaveBeenCalled();
  });

  it('moveTask moves a task to an arbitrary stage without firing transition toast (#18)', async () => {
    api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: '3' }]);
    api.moveTask = vi.fn().mockResolvedValue({});
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));
    await act(async () => {
      await result.current.moveTask('proj-1', 't1', '3');
    });
    expect(api.moveTask).toHaveBeenCalledWith('proj-1', 't1', '3');
    expect(result.current.tasks[0].currentStageId).toBe('3');
    expect(onNotification).not.toHaveBeenCalled();
  });

  it('moveTask updates the board optimistically before the backend responds, and reconciles on failure', async () => {
    // Server truth: the task is in stage '2'. The drag moves it to stage '5'.
    api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: '2' }]);
    api.moveTask = vi.fn().mockRejectedValue(new Error('move rejected by backend'));
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });

    let movePromise;
    act(() => {
      movePromise = result.current.moveTask('proj-1', 't1', '5');
    });

    // Optimistic: the card sits in the target stage before the backend answers
    // (no snap-back while the user keeps dragging on a slow connection).
    expect(result.current.tasks[0].currentStageId).toBe('5');

    // Reconciliation: once the move has failed, the refresh restores the truth.
    await act(async () => {
      await movePromise;
    });
    expect(result.current.tasks[0].currentStageId).toBe('2');
  });

  it('completeTask completes and refreshes with meaningful success toast', async () => {
    api.completeTask.mockResolvedValue({ id: 't1', status: 'completed' });
    api.listTasks.mockResolvedValue([{ id: 't1', status: 'completed' }]);
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTasks({ onNotification }));
    await act(async () => {
      await result.current.completeTask('proj-1', 't1');
    });
    expect(api.completeTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(result.current.tasks[0].status).toBe('completed');
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Task Completed',
      }),
    );
  });

  it('supports followUpTask, steerTask, pauseTask, resumeTask, retryTask, abortTask', async () => {
    api.followUpTask = vi.fn().mockResolvedValue({ id: 't1' });
    api.steerTask = vi.fn().mockResolvedValue({ id: 't1' });
    api.pauseTask = vi.fn().mockResolvedValue({ id: 't1', status: 'paused' });
    api.resumeTask = vi.fn().mockResolvedValue({ id: 't1', status: 'in_stage' });
    api.retryTask = vi.fn().mockResolvedValue({ id: 't1' });
    api.abortTask = vi.fn().mockResolvedValue({ id: 't1' });
    api.listTasks.mockResolvedValue([{ id: 't1' }]);

    const { result } = renderHook(() => useTasks());

    await act(async () => {
      await result.current.followUpTask('proj-1', 't1', 'Follow up prompt');
    });
    expect(api.followUpTask).toHaveBeenCalledWith('proj-1', 't1', 'Follow up prompt');

    await act(async () => {
      await result.current.steerTask('proj-1', 't1', 'Steer guidance');
    });
    expect(api.steerTask).toHaveBeenCalledWith('proj-1', 't1', 'Steer guidance');

    await act(async () => {
      await result.current.pauseTask('proj-1', 't1');
    });
    expect(api.pauseTask).toHaveBeenCalledWith('proj-1', 't1');

    await act(async () => {
      await result.current.resumeTask('proj-1', 't1');
    });
    expect(api.resumeTask).toHaveBeenCalledWith('proj-1', 't1');

    await act(async () => {
      await result.current.retryTask('proj-1', 't1');
    });
    expect(api.retryTask).toHaveBeenCalledWith('proj-1', 't1');

    await act(async () => {
      await result.current.abortTask('proj-1', 't1');
    });
    expect(api.abortTask).toHaveBeenCalledWith('proj-1', 't1');
  });

  it('scheduleTaskRefresh coalesces bursts into a single debounced fetch', async () => {
    vi.useFakeTimers();
    try {
      api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: '2' }]);
      const { result } = renderHook(() => useTasks());

      // Fire several live-sync refreshes rapidly; they must collapse to one fetch.
      act(() => {
        result.current.scheduleTaskRefresh('proj-1');
        result.current.scheduleTaskRefresh('proj-1');
        result.current.scheduleTaskRefresh('proj-1');
      });
      expect(api.listTasks).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      expect(api.listTasks).toHaveBeenCalledTimes(1);
      expect(api.listTasks).toHaveBeenCalledWith('proj-1');
      expect(result.current.tasks).toEqual([{ id: 't1', currentStageId: '2' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetchTasks guards against invalid stage IDs and workflow IDs passed as projectId', async () => {
    const { logger } = await import('../services/logger');
    const { result } = renderHook(() => useTasks());

    // Single digit stage IDs
    await act(async () => {
      await result.current.fetchTasks('1');
      await result.current.fetchTasks('2');
    });

    // stage- prefix
    await act(async () => {
      await result.current.fetchTasks('stage-idea');
      await result.current.fetchTasks('stage-123');
    });

    // wf- prefix
    await act(async () => {
      await result.current.fetchTasks('wf-default');
      await result.current.fetchTasks('wf-custom');
    });

    // Ensure api.listTasks was never dispatched for invalid project IDs
    expect(api.listTasks).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('scheduleTaskRefresh guards against invalid stage IDs and workflow IDs passed as projectId', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTasks());

      act(() => {
        result.current.scheduleTaskRefresh('1');
        result.current.scheduleTaskRefresh('stage-1');
        result.current.scheduleTaskRefresh('wf-default');
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(api.listTasks).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes isLoading while the task list fetch is in flight', async () => {
    let resolveFetch;
    api.listTasks.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { result } = renderHook(() => useTasks());
    expect(result.current.isLoading).toBe(false);
    let fetchPromise;
    act(() => {
      fetchPromise = result.current.fetchTasks('proj-1');
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolveFetch([{ id: 't1', goal: 'A' }]);
      await fetchPromise;
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tasks).toEqual([{ id: 't1', goal: 'A' }]);
  });

  it('records tasksError on failure and clears it on success', async () => {
    api.listTasks.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useTasks());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(result.current.tasks).toEqual([]);
    expect(result.current.tasksError).toBeTruthy();

    api.listTasks.mockResolvedValueOnce([{ id: 't1', goal: 'A' }]);
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(result.current.tasksError).toBeNull();
    expect(result.current.tasks).toEqual([{ id: 't1', goal: 'A' }]);
  });
});
