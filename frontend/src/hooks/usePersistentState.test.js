import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

describe('usePersistentState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the default when storage is empty', () => {
    const { result } = renderHook(() => usePersistentState('kainbain:test:empty', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('restores a pre-seeded value (refresh simulation)', () => {
    window.localStorage.setItem('kainbain:test:seeded', JSON.stringify('hello'));
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:seeded', 'fallback'),
    );
    expect(result.current[0]).toBe('hello');
  });

  it('survives a simulated reload: set, unmount, remount', () => {
    const { result, unmount } = renderHook(() =>
      usePersistentState('kainbain:test:reload', ''),
    );
    act(() => {
      result.current[1]('persisted-value');
    });
    unmount();
    const { result: next } = renderHook(() =>
      usePersistentState('kainbain:test:reload', ''),
    );
    expect(next.current[0]).toBe('persisted-value');
  });

  it('falls back to default on corrupt JSON', () => {
    window.localStorage.setItem('kainbain:test:corrupt', 'not-json{{{');
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:corrupt', 'safe-default'),
    );
    expect(result.current[0]).toBe('safe-default');
  });

  it('falls back to default when validation fails', () => {
    window.localStorage.setItem('kainbain:test:validated', JSON.stringify('bogus'));
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:validated', 'all', {
        validate: (v) => ['all', 'failed', 'human'].includes(v),
      }),
    );
    expect(result.current[0]).toBe('all');
  });

  it('writes synchronously on change when debounceMs is 0', () => {
    const { result } = renderHook(() => usePersistentState('kainbain:test:sync', ''));
    act(() => {
      result.current[1]('typed');
    });
    expect(window.localStorage.getItem('kainbain:test:sync')).toBe(
      JSON.stringify('typed'),
    );
  });

  it('debounces writes and flushes the latest value on unmount', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      usePersistentState('kainbain:test:debounced', '', { debounceMs: 800 }),
    );
    act(() => {
      result.current[1]('a');
    });
    act(() => {
      result.current[1]('ab');
    });
    // Debounced: nothing written yet.
    expect(window.localStorage.getItem('kainbain:test:debounced')).toBeNull();
    // Unmount before the timer fires: latest value must still be flushed.
    unmount();
    expect(window.localStorage.getItem('kainbain:test:debounced')).toBe(
      JSON.stringify('ab'),
    );
  });

  it('writes debounced value after the delay elapses', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:delay', '', { debounceMs: 800 }),
    );
    act(() => {
      result.current[1]('settled');
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(window.localStorage.getItem('kainbain:test:delay')).toBe(
      JSON.stringify('settled'),
    );
  });

  it('clear() removes the key and resets to default', () => {
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:clear', 'default'),
    );
    act(() => {
      result.current[1]('custom');
    });
    expect(result.current[0]).toBe('custom');
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toBe('default');
    expect(window.localStorage.getItem('kainbain:test:clear')).toBeNull();
  });

  it('tolerates quota errors without throwing', () => {
    window.localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => usePersistentState('kainbain:test:quota', ''));
    expect(() =>
      act(() => {
        result.current[1]('value');
      }),
    ).not.toThrow();
    expect(result.current[0]).toBe('value');
  });

  it('tolerates unreadable storage by using defaults', () => {
    window.localStorage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:unreadable', 'default'),
    );
    expect(result.current[0]).toBe('default');
  });

  it('syncs across tabs when syncAcrossTabs is true', () => {
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:synced', 'a', { syncAcrossTabs: true }),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'kainbain:test:synced',
          newValue: JSON.stringify('b'),
        }),
      );
    });
    expect(result.current[0]).toBe('b');
  });

  it('ignores cross-tab events when syncAcrossTabs is false', () => {
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:local', 'a'),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'kainbain:test:local',
          newValue: JSON.stringify('b'),
        }),
      );
    });
    expect(result.current[0]).toBe('a');
  });

  it('re-reads when the key changes (per-task keys never bleed across tasks)', () => {
    window.localStorage.setItem('kainbain:test:task-B', JSON.stringify('filter-b'));
    const { result, rerender } = renderHook(
      ({ storageKey }) => usePersistentState(storageKey, ''),
      { initialProps: { storageKey: 'kainbain:test:task-A' } },
    );
    act(() => {
      result.current[1]('filter-a');
    });
    expect(result.current[0]).toBe('filter-a');
    rerender({ storageKey: 'kainbain:test:task-B' });
    expect(result.current[0]).toBe('filter-b');
  });

  it('supports lazy default initializers', () => {
    const { result } = renderHook(() =>
      usePersistentState('kainbain:test:lazy', () => 'computed'),
    );
    expect(result.current[0]).toBe('computed');
  });
});
