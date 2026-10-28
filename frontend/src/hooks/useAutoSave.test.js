import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';

describe('useAutoSave Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces and automatically invokes onSave after 600ms of inactivity', async () => {
    const onSave = vi.fn().mockResolvedValue('ok');
    const { rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'initial' },
    });

    expect(onSave).not.toHaveBeenCalled();

    // Change value
    rerender({ val: 'updated text' });
    expect(onSave).not.toHaveBeenCalled();

    // Advance 300ms (not yet 600ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance remaining 300ms (total 600ms)
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('updated text');
  });

  it('coalesces rapid consecutive changes into a single save with the latest value', async () => {
    const onSave = vi.fn().mockResolvedValue('ok');
    const { rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'a' },
    });

    // Rapid keystrokes
    rerender({ val: 'ab' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender({ val: 'abc' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender({ val: 'abcd' });
    expect(onSave).not.toHaveBeenCalled();

    // Wait full 600ms from last change
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('abcd');
  });

  it('triggers immediate save on handleBlur without waiting for 600ms timer', async () => {
    const onSave = vi.fn().mockResolvedValue('ok');
    const { result, rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'initial' },
    });

    rerender({ val: 'dirty value' });
    expect(onSave).not.toHaveBeenCalled();

    // Invoke blur immediately
    await act(async () => {
      result.current.handleBlur();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('dirty value');

    // Ensure timer does not fire again later
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('tracks isSaving and updates lastSaved timestamp', async () => {
    let resolveSave;
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result, rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'v1' },
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastSaved).toBeNull();
    expect(result.current.isDirty).toBe(false);

    rerender({ val: 'v2' });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      resolveSave('done');
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastSaved).toBeInstanceOf(Date);
    expect(result.current.isDirty).toBe(false);
  });

  it('handles save errors gracefully and sets error state', async () => {
    const errorObj = new Error('Network save error');
    const onSave = vi.fn().mockRejectedValue(errorObj);
    const onError = vi.fn();

    const { result, rerender } = renderHook(
      ({ val }) => useAutoSave(val, onSave, { delay: 600, onError }),
      { initialProps: { val: 'initial' } },
    );

    rerender({ val: 'failed change' });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBe(errorObj);
    expect(onError).toHaveBeenCalledWith(errorObj, 'failed change');
  });

  it('allows manual save with saveNow', async () => {
    const onSave = vi.fn().mockResolvedValue('manual ok');
    const { result } = renderHook(() => useAutoSave('current val', onSave, { delay: 600 }));

    await act(async () => {
      await result.current.saveNow('explicit val');
    });

    expect(onSave).toHaveBeenCalledWith('explicit val');
  });

  it('resetBaseline re-anchors the saved value without saving', async () => {
    const onSave = vi.fn().mockResolvedValue('ok');
    const { result, rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'entity-a-text' },
    });

    // The edited entity changes underneath the hook (task switch in a mounted
    // editor): the old baseline would mark the new text dirty and schedule a
    // spurious save of unchanged text.
    rerender({ val: 'entity-b-text' });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.resetBaseline('entity-b-text');
    });
    expect(result.current.isDirty).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels pending debounced save when cancel is called', async () => {
    const onSave = vi.fn().mockResolvedValue('ok');
    const { result, rerender } = renderHook(({ val }) => useAutoSave(val, onSave, { delay: 600 }), {
      initialProps: { val: 'init' },
    });

    rerender({ val: 'changed' });

    act(() => {
      vi.advanceTimersByTime(300);
      result.current.cancel();
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
