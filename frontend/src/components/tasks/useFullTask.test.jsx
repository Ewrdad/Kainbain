import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFullTask } from './useFullTask';

describe('useFullTask', () => {
  it('returns the prop task untouched when it already carries logs', async () => {
    const getTask = vi.fn();
    const task = { id: 't1', logEntries: [{ id: 'log-1', text: 'old' }] };
    const { result } = renderHook(() => useFullTask({ task, activeProjectId: 'p1', getTask }));
    expect(result.current).toBe(task);
    expect(getTask).not.toHaveBeenCalled();
  });

  it('hydrates log history for board summaries without refetching failures', async () => {
    const full = { id: 't1', logEntries: [{ id: 'log-9', text: 'persisted' }] };
    const getTask = vi.fn(async () => full);
    const { result } = renderHook(() =>
      useFullTask({ task: { id: 't1', goal: 'x' }, activeProjectId: 'p1', getTask }),
    );
    await waitFor(() => {
      expect(result.current.logEntries).toEqual(full.logEntries);
    });
    expect(getTask).toHaveBeenCalledWith('p1', 't1');
  });

  it('falls back to the prop task when hydration fails or is unavailable', async () => {
    const task = { id: 't1', goal: 'x' };
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result: r1 } = renderHook(() =>
      useFullTask({ task, activeProjectId: 'p1', getTask: failing }),
    );
    await waitFor(() => {
      expect(r1.current).toBe(task);
    });

    const { result: r2 } = renderHook(() => useFullTask({ task, activeProjectId: 'p1' }));
    expect(r2.current).toBe(task);
  });
});
