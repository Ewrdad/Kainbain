import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useGlassesRefreshTick } from './useGlassesRefreshTick.js';

/***
 * MARK: useGlassesRefreshTick tests
 * @description Guards the glasses auto-refresh beat: steady ticks, pause
 *   while hidden or paused, no overlapping in-flight refreshes, and timer
 *   cleanup on unmount.
 ***/

function Probe({ onRefresh, paused }) {
  useGlassesRefreshTick(onRefresh, { intervalMs: 5000, paused });
  return null;
}

describe('useGlassesRefreshTick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls refresh on every beat', () => {
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} paused={false} />);
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('pauses the beat while paused', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<Probe onRefresh={onRefresh} paused />);
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    rerender(<Probe onRefresh={onRefresh} paused={false} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('skips ticks while the tab is hidden', () => {
    const onRefresh = vi.fn();
    let visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    render(<Probe onRefresh={onRefresh} paused={false} />);
    visibility = 'hidden';
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    visibility = 'visible';
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('never overlaps a refresh still in flight', async () => {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const onRefresh = vi.fn().mockReturnValue(pending);
    render(<Probe onRefresh={onRefresh} paused={false} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await pending;
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('stops the timer on unmount', () => {
    const onRefresh = vi.fn();
    const { unmount } = render(<Probe onRefresh={onRefresh} paused={false} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
