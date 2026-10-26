import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectedTask } from './useSelectedTask';

vi.mock('../services/api', () => ({
  api: { getTask: vi.fn() },
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: useSelectedTask tests
 * @description Pins inspector selection after the provider extraction: fresh
 * board overlay wins, same-task reselection keeps the snapshot, and detail
 * hydration merges the full task.
 ***/
describe('useSelectedTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTask.mockResolvedValue(null);
  });

  it('returns the snapshot when the board has no fresher entry', () => {
    const { result } = renderHook(() =>
      useSelectedTask({ tasksList: [], activeProjectId: 'proj-1' }),
    );
    act(() => {
      result.current.setSelectedTask({ id: 't1', goal: 'old' });
    });
    expect(result.current.selectedTask).toEqual({ id: 't1', goal: 'old' });
  });

  it('overlays the freshest board entry for the same id', () => {
    const board = [{ id: 't1', goal: 'fresh', status: 'running' }];
    const { result } = renderHook(() =>
      useSelectedTask({ tasksList: board, activeProjectId: 'proj-1' }),
    );
    act(() => {
      result.current.setSelectedTask({ id: 't1', goal: 'stale' });
    });
    expect(result.current.selectedTask).toMatchObject({ id: 't1', goal: 'fresh' });
  });

  it('same-task reselection keeps the existing snapshot object', () => {
    const snapshot = { id: 't1', goal: 'G' };
    const { result } = renderHook(() =>
      useSelectedTask({ tasksList: [], activeProjectId: 'proj-1' }),
    );
    act(() => {
      result.current.setSelectedTask(snapshot);
    });
    const first = result.current.selectedTaskSnapshot;
    act(() => {
      result.current.setSelectedTask({ id: 't1', goal: 'compact-row' });
    });
    expect(result.current.selectedTaskSnapshot).toBe(first);
  });

  it('hydrates detail for the selected task', async () => {
    api.getTask.mockResolvedValue({ id: 't1', goal: 'G', history: ['h1'] });
    const { result } = renderHook(() =>
      useSelectedTask({ tasksList: [], activeProjectId: 'proj-1' }),
    );
    act(() => {
      result.current.setSelectedTask({ id: 't1' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(result.current.selectedTaskSnapshot).toMatchObject({
      id: 't1',
      history: ['h1'],
    });
  });
});
