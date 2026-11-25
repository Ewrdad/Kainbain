import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { saveTaskEdit, useTaskMutations } from './useTaskMutations';

vi.mock('../services/api', () => ({
  api: {
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    advanceTask: vi.fn(),
    failbackTask: vi.fn(),
    followUpTask: vi.fn(),
    steerTask: vi.fn(),
    rejectTaskWithFeedback: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

vi.mock('../services/taskDrafts', () => ({
  removeTaskDraft: vi.fn(),
  readTaskDraft: vi.fn(),
}));

import { api } from '../services/api';
import { removeTaskDraft, readTaskDraft } from '../services/taskDrafts';

/***
 * MARK: useTaskMutations tests
 * @description Pins the single task-edit PATCH seam (`saveTaskEdit`) and the
 *   `updateTask` wrapper contract the draft cache and approve/reject gating
 *   depend on: resolve + refresh on success, notify + rethrow on failure.
 ***/
describe('useTaskMutations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readTaskDraft.mockReturnValue(null);
  });

  it('saveTaskEdit delegates to the API exactly once with the edit', async () => {
    api.updateTask.mockResolvedValue({ id: 't1', goal: 'Edited' });
    const updated = await saveTaskEdit('proj-1', 't1', { title: 'Edited', goal: 'Edited' });
    expect(api.updateTask).toHaveBeenCalledWith('proj-1', 't1', {
      title: 'Edited',
      goal: 'Edited',
    });
    expect(updated).toEqual({ id: 't1', goal: 'Edited' });
  });

  it('saveTaskEdit preserves the backend error message', async () => {
    api.updateTask.mockRejectedValue(new Error('backend rejected the edit'));
    await expect(saveTaskEdit('proj-1', 't1', { goal: 'x' })).rejects.toThrow(
      'backend rejected the edit',
    );
  });

  it('saveTaskEdit normalizes a non-Error rejection', async () => {
    api.updateTask.mockRejectedValue('plain string failure');
    await expect(saveTaskEdit('proj-1', 't1', { goal: 'x' })).rejects.toThrow(
      'plain string failure',
    );
  });

  it('updateTask refreshes the board and notifies on success', async () => {
    api.updateTask.mockResolvedValue({ id: 't1' });
    const refreshTasks = vi.fn().mockResolvedValue(undefined);
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTaskMutations({ refreshTasks, onNotification }));

    await act(async () => {
      await result.current.updateTask('proj-1', 't1', { goal: 'Edited' });
    });

    expect(refreshTasks).toHaveBeenCalledWith('proj-1');
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', title: 'Task Updated' }),
    );
  });

  it('updateTask notifies and rethrows on failure so gating can stop', async () => {
    api.updateTask.mockRejectedValue(new Error('backend rejected the edit'));
    const refreshTasks = vi.fn();
    const onNotification = vi.fn();
    const { result } = renderHook(() => useTaskMutations({ refreshTasks, onNotification }));

    await expect(
      act(async () => {
        await result.current.updateTask('proj-1', 't1', { goal: 'Edited' });
      }),
    ).rejects.toThrow('backend rejected the edit');

    expect(refreshTasks).not.toHaveBeenCalled();
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Task Update Failed' }),
    );
  });

  it('deleteTask drops the task local draft so it cannot linger as an orphan', async () => {
    api.deleteTask.mockResolvedValue(undefined);
    const refreshTasks = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useTaskMutations({ refreshTasks }));

    await act(async () => {
      await result.current.deleteTask('proj-1', 't1');
    });

    expect(removeTaskDraft).toHaveBeenCalledWith('t1');
    expect(refreshTasks).toHaveBeenCalledWith('proj-1');
  });

  it('advanceTask persists a left-behind draft before advancing', async () => {
    const order = [];
    readTaskDraft.mockReturnValue({
      value: 'Draft goal',
      updatedAt: Date.now(),
      projectId: 'proj-1',
    });
    api.updateTask.mockImplementation(() => {
      order.push('update');
      return Promise.resolve({ id: 't1' });
    });
    api.advanceTask.mockImplementation(() => {
      order.push('advance');
      return Promise.resolve({ id: 't1', status: 'in_stage' });
    });
    const refreshTasks = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useTaskMutations({ refreshTasks }));

    await act(async () => {
      await result.current.advanceTask('proj-1', 't1', { autoExecute: false });
    });

    expect(api.updateTask).toHaveBeenCalledWith('proj-1', 't1', {
      title: 'Draft goal',
      goal: 'Draft goal',
    });
    expect(order).toEqual(['update', 'advance']);
    expect(removeTaskDraft).toHaveBeenCalledWith('t1');
  });

  it('advanceTask aborts when the left-behind draft cannot be saved', async () => {
    readTaskDraft.mockReturnValue({
      value: 'Draft goal',
      updatedAt: Date.now(),
      projectId: 'proj-1',
    });
    api.updateTask.mockRejectedValue(new Error('offline'));
    api.advanceTask.mockResolvedValue({ id: 't1' });
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useTaskMutations({ refreshTasks: vi.fn(), onNotification }),
    );

    await act(async () => {
      await result.current.advanceTask('proj-1', 't1', { autoExecute: false });
    });

    expect(api.advanceTask).not.toHaveBeenCalled();
    expect(removeTaskDraft).not.toHaveBeenCalled();
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Approval Failed' }),
    );
  });

  it('advanceTask skips the pre-save PATCH when there is no draft', async () => {
    api.advanceTask.mockResolvedValue({ id: 't1', status: 'in_stage' });
    const { result } = renderHook(() => useTaskMutations({ refreshTasks: vi.fn() }));

    await act(async () => {
      await result.current.advanceTask('proj-1', 't1', { autoExecute: false });
    });

    expect(api.updateTask).not.toHaveBeenCalled();
    expect(api.advanceTask).toHaveBeenCalledWith('proj-1', 't1');
  });

  it('rejectTask persists a left-behind draft before returning the task', async () => {
    const order = [];
    readTaskDraft.mockReturnValue({
      value: 'Draft goal',
      updatedAt: Date.now(),
      projectId: 'proj-1',
    });
    api.updateTask.mockImplementation(() => {
      order.push('update');
      return Promise.resolve({ id: 't1' });
    });
    api.failbackTask.mockImplementation(() => {
      order.push('reject');
      return Promise.resolve({ id: 't1' });
    });
    const { result } = renderHook(() => useTaskMutations({ refreshTasks: vi.fn() }));

    await act(async () => {
      await result.current.rejectTask('proj-1', 't1');
    });

    expect(order).toEqual(['update', 'reject']);
  });

  it('advanceTask rethrows 422 feedback-validation refusals with the file named', async () => {
    const err = new Error('API 422 on /tasks/t1/advance: refused');
    err.status = 422;
    err.body = JSON.stringify({
      code: 'FEEDBACK_VALIDATION_FAILED',
      missing: [{ ref: 'assets/gone.png', name: 'gone.png' }],
      imageOnly: false,
    });
    api.advanceTask.mockRejectedValue(err);
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useTaskMutations({ onNotification, refreshTasks: vi.fn() }),
    );
    await expect(
      result.current.advanceTask('proj-1', 't1', { guidance: 'See the screenshot' }),
    ).rejects.toBe(err);
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Approval Failed',
        message: expect.stringContaining('assets/gone.png'),
      }),
    );
  });

  it('advanceTask still swallows non-422 failures', async () => {
    api.advanceTask.mockRejectedValue(new Error('Task failed in its current stage'));
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useTaskMutations({ onNotification, refreshTasks: vi.fn() }),
    );
    let outcome;
    await act(async () => {
      outcome = await result.current.advanceTask('proj-1', 't1', {});
    });
    expect(outcome).toBe(undefined);
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approval Failed' }),
    );
  });

  it('followUpTask and steerTask rethrow 422s, swallow the rest', async () => {
    const err = new Error('API 422 on /tasks/t1/steer: refused');
    err.status = 422;
    err.body = JSON.stringify({
      code: 'FEEDBACK_VALIDATION_FAILED',
      missing: [],
      imageOnly: true,
    });
    api.followUpTask.mockRejectedValue(err);
    api.steerTask.mockRejectedValueOnce(err).mockRejectedValue(new Error('no session'));
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useTaskMutations({ onNotification, refreshTasks: vi.fn() }),
    );
    await expect(result.current.followUpTask('proj-1', 't1', 'x')).rejects.toBe(err);
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Follow-up Failed',
        message: expect.stringContaining('only images'),
      }),
    );
    await expect(result.current.steerTask('proj-1', 't1', 'x')).rejects.toBe(err);
    let outcome;
    await act(async () => {
      outcome = await result.current.steerTask('proj-1', 't1', 'plain guidance here');
    });
    expect(outcome).toBe(undefined);
  });

  it('rejectTaskWithFeedback names the file in plain words on a 422 (no raw JSON toast)', async () => {
    const err = new Error(
      'API 422 on /tasks/t1/reject: {"error":"Feedback references 1 file…","code":"FEEDBACK_VALIDATION_FAILED"}',
    );
    err.status = 422;
    err.body = JSON.stringify({
      code: 'FEEDBACK_VALIDATION_FAILED',
      missing: [{ ref: 'assets/gone.png', name: 'gone.png' }],
      imageOnly: false,
    });
    api.rejectTaskWithFeedback.mockRejectedValue(err);
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useTaskMutations({ onNotification, refreshTasks: vi.fn() }),
    );
    await expect(
      result.current.rejectTaskWithFeedback('proj-1', 't1', 'See ![g](assets/gone.png)'),
    ).rejects.toBe(err);
    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rejection Failed',
        message: expect.stringContaining('assets/gone.png'),
      }),
    );
    const toast = onNotification.mock.calls[0][0].message;
    expect(toast).not.toContain('API 422');
    expect(toast).not.toContain('FEEDBACK_VALIDATION_FAILED');
  });
});
