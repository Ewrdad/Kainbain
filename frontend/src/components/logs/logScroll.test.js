import { describe, expect, test } from 'vitest';
import {
  STICK_TO_BOTTOM_THRESHOLD_PX,
  OVERFLOW_EPSILON_PX,
  shouldFollowScroll,
  isNearBottom,
  contentOverflows,
} from './logScroll';

describe('logScroll helpers', () => {
  test('short content: never follow', () => {
    expect(shouldFollowScroll({ scrollTop: 0, scrollHeight: 50, clientHeight: 100 })).toBe(false);
    expect(contentOverflows({ scrollHeight: 50, clientHeight: 100 })).toBe(false);
  });

  test('overflow + at bottom: follow', () => {
    expect(shouldFollowScroll({ scrollTop: 100, scrollHeight: 200, clientHeight: 100 })).toBe(true);
    // threshold boundary
    expect(
      shouldFollowScroll({
        scrollTop: 100 - STICK_TO_BOTTOM_THRESHOLD_PX,
        scrollHeight: 200,
        clientHeight: 100,
      }),
    ).toBe(true);
  });

  test('overflow + scrolled up: do not follow', () => {
    expect(shouldFollowScroll({ scrollTop: 0, scrollHeight: 200, clientHeight: 100 })).toBe(false);
  });

  test('threshold boundary one past -> false', () => {
    expect(
      shouldFollowScroll({
        scrollTop: 100 - STICK_TO_BOTTOM_THRESHOLD_PX - 1,
        scrollHeight: 200,
        clientHeight: 100,
      }),
    ).toBe(false);
  });

  test('overflow epsilon boundary', () => {
    expect(contentOverflows({ scrollHeight: 100 + OVERFLOW_EPSILON_PX, clientHeight: 100 })).toBe(
      false,
    );
    expect(
      contentOverflows({ scrollHeight: 100 + OVERFLOW_EPSILON_PX + 1, clientHeight: 100 }),
    ).toBe(true);
  });

  test('invalid inputs fail safe (false)', () => {
    expect(shouldFollowScroll({ scrollTop: NaN, scrollHeight: 200, clientHeight: 100 })).toBe(
      false,
    );
    expect(shouldFollowScroll({})).toBe(false);
    expect(isNearBottom({ scrollTop: 0, scrollHeight: NaN, clientHeight: 100 })).toBe(false);
  });
});
