import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  IMAGE_RETRY_DELAYS_MS,
  getImageFailureStats,
  resetImageFailureStats,
  reportImageFailure,
  useImageRetry,
} from './imageRetry';

/***
 * MARK: imageRetry tests
 * @description Pins the shared image-load retry contract: bounded backoff
 *   retries, latch with manual recovery, visibility/online revalidation, src
 *   resets, and the headless failure record every renderer reports through.
 ***/
describe('imageRetry failure record', () => {
  beforeEach(() => {
    resetImageFailureStats();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetImageFailureStats();
  });

  it('starts empty and records each failure with its classification triple', () => {
    expect(getImageFailureStats()).toEqual({ count: 0, lastFailure: null });
    reportImageFailure({
      src: '/projects/p/tasks/t/images/a.png',
      component: 'md-image',
      attempt: 1,
      hasTaskContext: true,
    });
    const stats = getImageFailureStats();
    expect(stats.count).toBe(1);
    expect(stats.lastFailure).toMatchObject({
      src: '/projects/p/tasks/t/images/a.png',
      component: 'md-image',
      attempt: 1,
      hasTaskContext: true,
    });
    expect(typeof stats.lastFailure.at).toBe('string');
    expect(console.warn).toHaveBeenCalledWith('[task-image] load failed', stats.lastFailure);
  });

  it('marks context-absent renders so bucket (a) stays distinguishable', () => {
    reportImageFailure({ src: 'assets/a.png', component: 'md-image', attempt: 1 });
    expect(getImageFailureStats().lastFailure.hasTaskContext).toBe(false);
  });
});

describe('useImageRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetImageFailureStats();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetImageFailureStats();
  });

  const setup = (props = {}) =>
    renderHook(() =>
      useImageRetry({
        src: 'http://api.test/projects/p/tasks/t/images/a.png',
        component: 'md-image',
        hasTaskContext: true,
        ...props,
      }),
    );

  it('retries automatically with backoff, then latches with the failure recorded', () => {
    expect(IMAGE_RETRY_DELAYS_MS).toEqual([1500, 3000, 6000]);
    const { result } = setup();
    expect(result.current.failed).toBe(false);

    // Three bounded automatic attempts, one per backoff delay.
    for (let attempt = 0; attempt < IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      act(() => {
        result.current.markFailed();
      });
      expect(result.current.failed).toBe(true);
      act(() => {
        vi.advanceTimersByTime(IMAGE_RETRY_DELAYS_MS[attempt]);
      });
      expect(result.current.failed).toBe(false);
      expect(result.current.retryKey).toBe(attempt + 1);
    }

    // Budget spent: the next failure latches (no more timers).
    act(() => {
      result.current.markFailed();
    });
    expect(result.current.failed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.failed).toBe(true);
    expect(getImageFailureStats().count).toBe(IMAGE_RETRY_DELAYS_MS.length + 1);
    expect(getImageFailureStats().lastFailure).toMatchObject({
      component: 'md-image',
      hasTaskContext: true,
    });
  });

  it('manual retry restarts the automatic budget', () => {
    const { result } = setup();
    for (let attempt = 0; attempt <= IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      act(() => {
        result.current.markFailed();
      });
      act(() => {
        vi.advanceTimersByTime(60000);
      });
    }
    expect(result.current.failed).toBe(true);

    act(() => {
      result.current.retry();
    });
    expect(result.current.failed).toBe(false);

    // Fresh budget: the next failure schedules an automatic retry again.
    act(() => {
      result.current.markFailed();
    });
    expect(result.current.failed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(IMAGE_RETRY_DELAYS_MS[0]);
    });
    expect(result.current.failed).toBe(false);
  });

  it('revalidates a latched image when the browser comes back online', () => {
    const { result } = setup();
    act(() => {
      result.current.markFailed();
    });
    // Exhaust the budget so the image latches.
    for (let attempt = 0; attempt < IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      act(() => {
        vi.advanceTimersByTime(IMAGE_RETRY_DELAYS_MS[attempt]);
      });
      act(() => {
        result.current.markFailed();
      });
    }
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.failed).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.failed).toBe(false);
  });

  it('revalidates a latched image when the tab becomes visible', () => {
    const { result } = setup();
    act(() => {
      result.current.markFailed();
    });
    for (let attempt = 0; attempt < IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      act(() => {
        vi.advanceTimersByTime(IMAGE_RETRY_DELAYS_MS[attempt]);
      });
      act(() => {
        result.current.markFailed();
      });
    }
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.failed).toBe(true);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.failed).toBe(false);
  });

  it('ignores visibility changes while hidden and online events while healthy', () => {
    const { result } = setup();
    const healthyKey = result.current.retryKey;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.retryKey).toBe(healthyKey);
  });

  it('resets to a clean attempt when the source changes', () => {
    const { result, rerender } = renderHook(
      ({ src }) => useImageRetry({ src, component: 'md-image', hasTaskContext: true }),
      { initialProps: { src: 'http://api.test/a.png' } },
    );
    act(() => {
      result.current.markFailed();
    });
    expect(result.current.failed).toBe(true);
    rerender({ src: 'http://api.test/b.png' });
    expect(result.current.failed).toBe(false);
    expect(result.current.retryKey).toBe(0);
  });
});
