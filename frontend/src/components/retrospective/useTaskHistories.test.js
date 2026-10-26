import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskHistories } from './useTaskHistories';
import { api } from '../../services/api';
import {
  retrospectiveTaskFixtures,
  retrospectiveHydratedTaskFixture,
} from './__fixtures__/index.js';

vi.mock('../../services/api', () => ({
  api: { listTasks: vi.fn(), getTask: vi.fn() },
}));

/***
 * MARK: useTaskHistories tests
 * @description Locks the histories data contract: summaries load on mount,
 *   errors surface as text, and row expansion hydrates one full task
 *   (cached; summary shown while loading, kept on hydration failure).
 ***/
describe('useTaskHistories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTasks.mockResolvedValue(retrospectiveTaskFixtures);
    api.getTask.mockResolvedValue(retrospectiveHydratedTaskFixture);
  });

  it('loads summaries on mount', async () => {
    const { result } = renderHook(() => useTaskHistories({ projectId: 'proj-1' }));
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(api.listTasks).toHaveBeenCalledWith('proj-1');
    expect(result.current.loading).toBe(false);
    expect(result.current.tasks).toHaveLength(4);
    expect(result.current.error).toBeNull();
  });

  it('surfaces load failures as an error', async () => {
    api.listTasks.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTaskHistories({ projectId: 'proj-1' }));
    await act(async () => {});
    expect(result.current.tasks).toEqual([]);
    expect(result.current.error).toMatch(/offline/);
    expect(result.current.loading).toBe(false);
  });

  it('hydrates one full task on expand and caches it', async () => {
    const { result } = renderHook(() => useTaskHistories({ projectId: 'proj-1' }));
    await act(async () => {});
    await act(async () => {
      await result.current.toggleExpanded('task-failed-2');
    });
    expect(result.current.expandedId).toBe('task-failed-2');
    expect(api.getTask).toHaveBeenCalledWith('proj-1', 'task-failed-2');
    expect(result.current.expandedTask.history).toHaveLength(2);
    await act(async () => {
      await result.current.toggleExpanded('task-failed-2');
    });
    expect(result.current.expandedId).toBeNull();
    await act(async () => {
      await result.current.toggleExpanded('task-failed-2');
    });
    // Second expansion serves the cache — no second fetch.
    expect(api.getTask).toHaveBeenCalledTimes(1);
  });

  it('keeps the summary row when hydration fails', async () => {
    api.getTask.mockRejectedValueOnce(new Error('gone'));
    const { result } = renderHook(() => useTaskHistories({ projectId: 'proj-1' }));
    await act(async () => {});
    await act(async () => {
      await result.current.toggleExpanded('task-failed-2');
    });
    expect(result.current.expandedId).toBe('task-failed-2');
    expect(result.current.expandedTask.id).toBe('task-failed-2');
    expect(result.current.expanding).toBe(false);
  });
});
