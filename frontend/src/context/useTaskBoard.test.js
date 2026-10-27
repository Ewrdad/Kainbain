import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskBoard, isValidProjectId } from './useTaskBoard';

vi.mock('../services/api', () => ({
  api: {
    isValidProjectId: (id) => typeof id === 'string' && id.startsWith('proj-'),
    listTasks: vi.fn(),
    moveTask: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: useTaskBoard tests
 * @description Pins the board read paths: project-id validation, fetch with
 * stale-sequence guard, optimistic upsert, and optimistic move + reconcile.
 ***/
describe('useTaskBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.listTasks.mockResolvedValue([]);
    api.moveTask.mockResolvedValue({});
  });

  it('validates project ids through the api grammar', () => {
    expect(isValidProjectId('proj-1')).toBe(true);
    expect(isValidProjectId('stage-1')).toBe(false);
  });

  it('fetchTasks stores the list and clears errors', async () => {
    api.listTasks.mockResolvedValue([{ id: 't1' }]);
    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(result.current.tasks).toEqual([{ id: 't1' }]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tasksError).toBeNull();
  });

  it('fetchTasks defaults lean and honors the persisted toggle', async () => {
    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(api.listTasks).toHaveBeenCalledWith('proj-1', { includeCompleted: false });

    window.localStorage.setItem('kainbain:showCompleted', 'true');
    const { result: full } = renderHook(() => useTaskBoard());
    await act(async () => {
      await full.current.fetchTasks('proj-1');
    });
    expect(api.listTasks).toHaveBeenCalledWith('proj-1', { includeCompleted: true });
  });

  it('fetchTasks passes an explicit scope and reuses it for refreshes', async () => {
    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('proj-1', { includeCompleted: true });
    });
    expect(api.listTasks).toHaveBeenLastCalledWith('proj-1', { includeCompleted: true });
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    expect(api.listTasks).toHaveBeenLastCalledWith('proj-1', { includeCompleted: true });
  });

  it('fetchTasks ignores invalid project ids without fetching', async () => {
    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('stage-1');
    });
    expect(api.listTasks).not.toHaveBeenCalled();
  });

  it('upsertTask prepends unknown tasks and replaces known ones', () => {
    const { result } = renderHook(() => useTaskBoard());
    act(() => {
      result.current.upsertTask({ id: 't1', goal: 'a' });
    });
    act(() => {
      result.current.upsertTask({ id: 't1', goal: 'b' });
    });
    expect(result.current.tasks).toEqual([{ id: 't1', goal: 'b' }]);
    expect(result.current.upsertTask(null)).toBe(false);
  });

  it('moveTask optimistically retargets then reconciles', async () => {
    api.listTasks.mockResolvedValue([{ id: 't1', currentStageId: 's2' }]);
    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });
    await act(async () => {
      await result.current.moveTask('proj-1', 't1', 's3');
    });
    expect(api.moveTask).toHaveBeenCalledWith('proj-1', 't1', 's3');
    // Reconcile refetch lands the server state.
    expect(result.current.tasks).toEqual([{ id: 't1', currentStageId: 's2' }]);
  });

  it('fetchTasks sweeps local drafts whose task is no longer on the board', async () => {
    const now = Date.now();
    window.localStorage.setItem(
      'kainbain:task-draft:gone',
      JSON.stringify({ value: 'orphan goal', updatedAt: now, projectId: 'proj-1' }),
    );
    window.localStorage.setItem(
      'kainbain:task-draft:live',
      JSON.stringify({ value: 'live goal', updatedAt: now, projectId: 'proj-1' }),
    );
    api.listTasks.mockResolvedValue([{ id: 'live' }]);

    const { result } = renderHook(() => useTaskBoard());
    await act(async () => {
      await result.current.fetchTasks('proj-1');
    });

    expect(window.localStorage.getItem('kainbain:task-draft:gone')).toBeNull();
    expect(window.localStorage.getItem('kainbain:task-draft:live')).not.toBeNull();
  });
});
