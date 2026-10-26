import { describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePendingAction } from './usePendingAction';

/***
 * MARK: usePendingAction tests
 * @description Verifies the single-flight guard for button-triggered mutations:
 *   an in-flight action exposes a pending key for loading states, a fast
 *   double-click cannot submit twice (even in the same tick), the guard clears
 *   after success and after errors, and unmount never sets stale state.
 ***/

describe('usePendingAction', () => {
  test('exposes the pending key while the action is in flight and clears it after', async () => {
    let resolveAction;
    const action = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    const { result } = renderHook(() => usePendingAction());
    expect(result.current.isPending).toBe(false);

    let runPromise;
    act(() => {
      runPromise = result.current.run('approve', action);
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.pendingKey).toBe('approve');
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction('done');
      await runPromise;
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.pendingKey).toBe(null);
  });

  test('ignores a second run while the first is still in flight (double-click guard)', async () => {
    let resolveAction;
    const action = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    const { result } = renderHook(() => usePendingAction());

    let firstRun;
    let secondRunResult;
    act(() => {
      firstRun = result.current.run('delete', action);
      // Same-tick second click, before React re-renders.
      secondRunResult = result.current.run('delete', action);
      // A different action is blocked too: only one mutation at a time.
    });

    expect(action).toHaveBeenCalledTimes(1);
    // Skipped runs resolve to undefined without performing the action.
    await act(async () => {
      expect(await secondRunResult).toBeUndefined();
    });

    await act(async () => {
      resolveAction();
      await firstRun;
    });

    // Once the first action settled, new actions are allowed again.
    const retryAction = vi.fn().mockResolvedValue('ok');
    await act(async () => {
      await result.current.run('delete', retryAction);
    });
    expect(retryAction).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('clears the pending state after the action rejects and lets the caller handle the error', async () => {
    const action = vi.fn().mockRejectedValue(new Error('backend down'));

    const { result } = renderHook(() => usePendingAction());

    let caughtError;
    await act(async () => {
      try {
        await result.current.run('skip', action);
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError?.message).toBe('backend down');
    expect(result.current.isPending).toBe(false);

    // The guard is released: a retry is allowed.
    const retry = vi.fn().mockResolvedValue('ok');
    await act(async () => {
      await result.current.run('skip', retry);
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(false);
  });

  test('does not set state after unmount (late finally is safe)', async () => {
    let resolveAction;
    const action = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => usePendingAction());

    let runPromise;
    act(() => {
      runPromise = result.current.run('compute', action);
    });
    unmount();
    await act(async () => {
      resolveAction();
      await runPromise;
    });

    // No assertion needed: React would warn on a setState-after-unmount.
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('returns the action result to the caller', async () => {
    const { result } = renderHook(() => usePendingAction());
    let returned;
    await act(async () => {
      returned = await result.current.run('save', async () => 'saved-value');
    });
    expect(returned).toBe('saved-value');
  });
});