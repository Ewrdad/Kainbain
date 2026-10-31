import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRouteTask } from './useRouteTask';

/***
 * MARK: createDeferred
 * @description Builds a manually-resolvable promise so tests can hold a
 *   fetch in flight and settle it in a controlled order.
 * @example const pending = createDeferred(); pending.resolve({ id: 't1' });
 * @returns {{ promise: Promise, resolve: Function, reject: Function }}
 ***/
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const firstTask = { id: 'task-1', title: 'Untitled Task' };
const secondTask = { id: 'task-2', title: 'Second task' };

describe('useRouteTask', () => {
  it('returns the board-list record matching the route id without fetching', () => {
    const getTask = vi.fn();
    const { result } = renderHook(() =>
      useRouteTask({
        routeTaskId: 'task-2',
        tasks: [firstTask, secondTask],
        activeProjectId: 'p1',
        getTask,
      }),
    );
    expect(result.current).toEqual({ task: secondTask, loading: false });
    expect(getTask).not.toHaveBeenCalled();
  });

  it('fetches a route task missing from the list and returns the fetched record', async () => {
    const fetched = { id: 'task-9', title: 'Fresh task' };
    const getTask = vi.fn(async () => fetched);
    const { result } = renderHook(() =>
      useRouteTask({ routeTaskId: 'task-9', tasks: [firstTask], activeProjectId: 'p1', getTask }),
    );
    await waitFor(() => {
      expect(result.current).toEqual({ task: fetched, loading: false });
    });
    expect(getTask).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledWith('p1', 'task-9');
  });

  it('reports loading (and never another task) while the fetch is pending', () => {
    const pending = createDeferred();
    const getTask = vi.fn(() => pending.promise);
    const { result } = renderHook(() =>
      useRouteTask({ routeTaskId: 'task-9', tasks: [firstTask], activeProjectId: 'p1', getTask }),
    );
    expect(result.current).toEqual({ task: null, loading: true });
  });

  it('returns null (Not Found) when the fetch rejects or returns nothing', async () => {
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    const { result: rejected } = renderHook(() =>
      useRouteTask({ routeTaskId: 'task-9', tasks: [firstTask], activeProjectId: 'p1', getTask: failing }),
    );
    await waitFor(() => {
      expect(rejected.current).toEqual({ task: null, loading: false });
    });

    const empty = vi.fn(async () => null);
    const { result: emptyResult } = renderHook(() =>
      useRouteTask({ routeTaskId: 'task-9', tasks: [firstTask], activeProjectId: 'p1', getTask: empty }),
    );
    await waitFor(() => {
      expect(emptyResult.current).toEqual({ task: null, loading: false });
    });
  });

  it('ignores a record whose id does not match the route id', async () => {
    const getTask = vi.fn(async () => ({ id: 'other', title: 'Wrong' }));
    const { result } = renderHook(() =>
      useRouteTask({ routeTaskId: 'task-9', tasks: [], activeProjectId: 'p1', getTask }),
    );
    await waitFor(() => {
      expect(result.current).toEqual({ task: null, loading: false });
    });
  });

  it('ignores a stale response after the route id changes', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const getTask = vi.fn((_projectId, taskId) =>
      taskId === 'task-a' ? first.promise : second.promise,
    );
    const { result, rerender } = renderHook(
      ({ routeTaskId }) => useRouteTask({ routeTaskId, tasks: [], activeProjectId: 'p1', getTask }),
      { initialProps: { routeTaskId: 'task-a' } },
    );
    await waitFor(() => expect(getTask).toHaveBeenCalledWith('p1', 'task-a'));

    rerender({ routeTaskId: 'task-b' });
    await waitFor(() => expect(getTask).toHaveBeenCalledWith('p1', 'task-b'));

    await act(async () => {
      first.resolve({ id: 'task-a', title: 'Stale' });
    });
    expect(result.current).toEqual({ task: null, loading: true });

    const fresh = { id: 'task-b', title: 'Fresh' };
    await act(async () => {
      second.resolve(fresh);
    });
    expect(result.current).toEqual({ task: fresh, loading: false });
  });

  it('prefers the live list record once the task arrives via the board list', async () => {
    const snapshot = { id: 'task-9', title: 'Snapshot' };
    const live = { id: 'task-9', title: 'Live' };
    const getTask = vi.fn(async () => snapshot);
    const { result, rerender } = renderHook(
      ({ tasks }) => useRouteTask({ routeTaskId: 'task-9', tasks, activeProjectId: 'p1', getTask }),
      { initialProps: { tasks: [firstTask] } },
    );
    await waitFor(() => expect(result.current.task).toBe(snapshot));
    rerender({ tasks: [firstTask, live] });
    expect(result.current).toEqual({ task: live, loading: false });
  });

  it('falls back to the first board task only when there is no route id', () => {
    const getTask = vi.fn();
    const { result } = renderHook(() =>
      useRouteTask({ routeTaskId: null, tasks: [firstTask, secondTask], activeProjectId: 'p1', getTask }),
    );
    expect(result.current).toEqual({ task: firstTask, loading: false });
    expect(getTask).not.toHaveBeenCalled();
  });

  it('keeps prop and context selections ahead of the route lookup', () => {
    const getTask = vi.fn();
    const { result: fromProp } = renderHook(() =>
      useRouteTask({ propTask: secondTask, ctxSelectedTask: firstTask, routeTaskId: 'task-9', getTask }),
    );
    expect(fromProp.current.task).toBe(secondTask);
    const { result: fromContext } = renderHook(() =>
      useRouteTask({ ctxSelectedTask: firstTask, routeTaskId: 'task-9', getTask }),
    );
    expect(fromContext.current.task).toBe(firstTask);
    expect(getTask).not.toHaveBeenCalled();
  });
});
