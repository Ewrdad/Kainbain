import { expect, test, describe, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

/***
 * MARK: useNow tests
 * @description Verifies the shared board tick: immediate now, periodic
 * updates on fake timers, and no ticking while the tab is hidden.
 ***/

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('useNow', () => {
  test('returns the current time immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { result } = renderHook(() => useNow(60000));
    expect(result.current).toBe(Date.parse('2026-09-30T12:00:00Z'));
  });

  test('ticks forward on the given interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { result } = renderHook(() => useNow(60000));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current).toBe(Date.parse('2026-09-30T12:00:30Z') + 30000);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current).toBe(Date.parse('2026-09-30T12:02:00Z'));
  });

  test('pauses ticking while the tab is hidden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    const { result } = renderHook(() => useNow(60000));
    act(() => {
      vi.advanceTimersByTime(60000 * 5);
    });
    expect(result.current).toBe(Date.parse('2026-09-30T12:00:00Z'));
  });

  test('every subscriber shares a single interval', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const first = renderHook(() => useNow(60000));
    const second = renderHook(() => useNow(60000));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
    setIntervalSpy.mockRestore();
  });

  test('defaults to a 60s interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(59999);
    });
    expect(result.current).toBe(Date.parse('2026-09-30T12:00:00Z'));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(Date.parse('2026-09-30T12:01:00Z'));
  });
});
