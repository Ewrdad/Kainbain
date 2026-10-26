import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePendingTaskSave } from './usePendingTaskSave';

/***
 * MARK: usePendingTaskSave tests
 * @description Pins the editor-flush gating: register/has/flush round-trip,
 * no-op when empty, and clearing on unmount-style null registration.
 ***/
describe('usePendingTaskSave', () => {
  it('reports no flush until one is registered', () => {
    const { result } = renderHook(() => usePendingTaskSave());
    expect(result.current.hasPendingTaskSaveFlush()).toBe(false);
  });

  it('flushes the registered function and reports presence', async () => {
    const { result } = renderHook(() => usePendingTaskSave());
    let flushed = 0;
    act(() => {
      result.current.setPendingTaskSaveFlush(async () => {
        flushed += 1;
      });
    });
    expect(result.current.hasPendingTaskSaveFlush()).toBe(true);
    await act(async () => {
      await result.current.flushPendingTaskSave();
    });
    expect(flushed).toBe(1);
  });

  it('no-ops flush when no editor is open and clears on null', async () => {
    const { result } = renderHook(() => usePendingTaskSave());
    await act(async () => {
      await result.current.flushPendingTaskSave();
    });
    act(() => {
      result.current.setPendingTaskSaveFlush(() => {});
    });
    expect(result.current.hasPendingTaskSaveFlush()).toBe(true);
    act(() => {
      result.current.setPendingTaskSaveFlush(null);
    });
    expect(result.current.hasPendingTaskSaveFlush()).toBe(false);
  });

  it('propagates a failing flush so callers can stop', async () => {
    const { result } = renderHook(() => usePendingTaskSave());
    act(() => {
      result.current.setPendingTaskSaveFlush(async () => {
        throw new Error('save failed');
      });
    });
    await expect(
      act(async () => {
        await result.current.flushPendingTaskSave();
      }),
    ).rejects.toThrow('save failed');
  });
});
