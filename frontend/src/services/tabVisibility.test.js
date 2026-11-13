// @vitest-environment jsdom
import { describe, expect, test, vi, afterEach } from 'vitest';
import { isTabVisible, subscribeTabVisible } from './tabVisibility';

/***
 * MARK: tabVisibility tests
 * @description Pins the shared background-tab contract every foreground
 *   poller relies on: hidden tabs read hidden (so ticks skip their reads),
 *   anything else reads visible (so polling never stalls outside a real
 *   background tab), catch-up callbacks fire on visibility/focus signals
 *   while visible and stay silent while hidden, and unsubscribe stops them.
 ***/

const visibilityDescriptor = () => Object.getOwnPropertyDescriptor(document, 'visibilityState');

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

const realDescriptor = visibilityDescriptor();

afterEach(() => {
  if (realDescriptor) {
    Object.defineProperty(document, 'visibilityState', realDescriptor);
  } else {
    setVisibility('visible');
  }
  vi.restoreAllMocks();
});

describe('isTabVisible', () => {
  test('hidden reads hidden; visible and prerender read visible', () => {
    setVisibility('hidden');
    expect(isTabVisible()).toBe(false);
    setVisibility('visible');
    expect(isTabVisible()).toBe(true);
    // Prerender must never stall polling: only a real background tab pauses.
    setVisibility('prerender');
    expect(isTabVisible()).toBe(true);
  });
});

describe('subscribeTabVisible', () => {
  test('fires on visibilitychange and focus while visible, stays silent while hidden', () => {
    setVisibility('visible');
    const onVisible = vi.fn();
    const stop = subscribeTabVisible(onVisible);
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      expect(onVisible).toHaveBeenCalledTimes(2);

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      expect(onVisible).toHaveBeenCalledTimes(2);

      // Return fires again immediately: the catch-up refresh never waits
      // for the next poll tick.
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(onVisible).toHaveBeenCalledTimes(3);
    } finally {
      stop();
    }
  });

  test('unsubscribe stops both signals', () => {
    setVisibility('visible');
    const onVisible = vi.fn();
    const stop = subscribeTabVisible(onVisible);
    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(onVisible).not.toHaveBeenCalled();
  });

  test('a non-function callback never throws', () => {
    setVisibility('visible');
    const stop = subscribeTabVisible(null);
    try {
      expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    } finally {
      stop();
    }
  });
});
