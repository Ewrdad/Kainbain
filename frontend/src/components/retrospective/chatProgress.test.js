import { describe, it, expect } from 'vitest';
import {
  CHAT_PROGRESS_TAIL_MAX_CHARS,
  CHAT_PROGRESS_TRUNCATED_MARKER,
  truncateProgressTail,
  formatChatElapsed,
  elapsedSecondsSince,
  newChatTurnId,
  readChatProgressEvent,
} from './chatProgress.js';

/***
 * MARK: chatProgress helper tests
 * @description Pins the pure seams behind long-running turns: the tail
 *   truncation idiom (parity with the server's `truncateOutputTail`), the
 *   elapsed copy (turns run with no timeout, so no budget copy exists),
 *   turn-id uniqueness, and defensive progress-frame parsing.
 ***/
describe('truncateProgressTail', () => {
  it('passes short text through and bounds long text behind the marker', () => {
    expect(truncateProgressTail('short')).toBe('short');
    expect(truncateProgressTail('')).toBe('');
    expect(truncateProgressTail(null)).toBe('');
    expect(truncateProgressTail(undefined)).toBe('');
    const bounded = truncateProgressTail('a'.repeat(100), 20);
    expect(bounded.length).toBeLessThanOrEqual(20);
    expect(bounded.startsWith(`${CHAT_PROGRESS_TRUNCATED_MARKER}\n`)).toBe(true);
    expect(bounded.endsWith('aaaaa')).toBe(true);
    expect(truncateProgressTail('abcdef', 4)).toBe('cdef');
  });

  it('shares the truncation idiom with the server tail (parity pin)', () => {
    expect(CHAT_PROGRESS_TAIL_MAX_CHARS).toBe(2000);
    expect(CHAT_PROGRESS_TRUNCATED_MARKER).toBe('[…truncated…]');
  });
});

describe('formatChatElapsed', () => {
  it('reads seconds under a minute and minutes beyond', () => {
    expect(formatChatElapsed(0)).toBe('0s elapsed');
    expect(formatChatElapsed(5)).toBe('5s elapsed');
    expect(formatChatElapsed(30)).toBe('30s elapsed');
    expect(formatChatElapsed(59)).toBe('59s elapsed');
    expect(formatChatElapsed(60)).toBe('1m 0s elapsed');
    expect(formatChatElapsed(90)).toBe('1m 30s elapsed');
    expect(formatChatElapsed(750)).toBe('12m 30s elapsed');
  });

  it('clamps garbage to zero', () => {
    expect(formatChatElapsed(-3)).toBe('0s elapsed');
    expect(formatChatElapsed(NaN)).toBe('0s elapsed');
    expect(formatChatElapsed('nope')).toBe('0s elapsed');
  });
});

describe('elapsedSecondsSince', () => {
  it('measures elapsed seconds from a start timestamp', () => {
    const base = 1_000_000;
    expect(elapsedSecondsSince(base, base)).toBe(0);
    expect(elapsedSecondsSince(base, base + 500)).toBe(0);
    expect(elapsedSecondsSince(base, base + 5000)).toBe(5);
    expect(elapsedSecondsSince(base, base + 5999)).toBe(5);
    expect(elapsedSecondsSince(base, base + 20000)).toBe(20);
    expect(elapsedSecondsSince(base, base + 60000)).toBe(60);
  });

  it('composes with formatChatElapsed across minute boundaries', () => {
    const base = 1_000_000;
    expect(formatChatElapsed(elapsedSecondsSince(base, base))).toBe('0s elapsed');
    expect(formatChatElapsed(elapsedSecondsSince(base, base + 5000))).toBe('5s elapsed');
    expect(formatChatElapsed(elapsedSecondsSince(base, base + 60000))).toBe('1m 0s elapsed');
    expect(formatChatElapsed(elapsedSecondsSince(base, base + 90000))).toBe('1m 30s elapsed');
    expect(formatChatElapsed(elapsedSecondsSince(base, base + 750000))).toBe('12m 30s elapsed');
  });

  it('clamps future timestamps (clock skew) and invalid inputs to zero', () => {
    const base = 1_000_000;
    // Future start time (skew)
    expect(elapsedSecondsSince(base + 5000, base)).toBe(0);
    // Missing or invalid inputs
    expect(elapsedSecondsSince(null, base)).toBe(0);
    expect(elapsedSecondsSince(undefined, base)).toBe(0);
    expect(elapsedSecondsSince('nope', base)).toBe(0);
    expect(elapsedSecondsSince(NaN, base)).toBe(0);
    expect(elapsedSecondsSince(0, base)).toBe(0);
    expect(elapsedSecondsSince(-100, base)).toBe(0);
    expect(elapsedSecondsSince(base, NaN)).toBe(0);
    expect(elapsedSecondsSince(base, 'nope')).toBe(0);
  });

  it('rejects non-numeric shapes instead of coercing them into a clock', () => {
    const base = 1_000_000;
    // Booleans/objects/arrays must never become a start time: Number(true)
    // is 1 and would otherwise render a huge phantom elapsed.
    expect(elapsedSecondsSince(true, base)).toBe(0);
    expect(elapsedSecondsSince(false, base)).toBe(0);
    expect(elapsedSecondsSince({}, base)).toBe(0);
    expect(elapsedSecondsSince([base], base)).toBe(0);
    expect(elapsedSecondsSince('', base)).toBe(0);
    expect(elapsedSecondsSince('   ', base)).toBe(0);
    expect(elapsedSecondsSince(base, true)).toBe(0);
  });

  it('still accepts numeric strings (e.g. storage round-trips)', () => {
    const base = 1_000_000;
    expect(elapsedSecondsSince(String(base), base + 5000)).toBe(5);
    expect(elapsedSecondsSince(base, String(base + 5000))).toBe(5);
  });
});

describe('newChatTurnId', () => {
  it('generates unique non-empty ids', () => {
    const first = newChatTurnId();
    const second = newChatTurnId();
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
  });
});

describe('readChatProgressEvent', () => {
  it('accepts well-formed frames', () => {
    expect(readChatProgressEvent({ turnId: 't1', tail: 'warming up' })).toEqual({
      turnId: 't1',
      tail: 'warming up',
    });
  });

  it('rejects malformed frames instead of trusting them', () => {
    expect(readChatProgressEvent(null)).toBeNull();
    expect(readChatProgressEvent(undefined)).toBeNull();
    expect(readChatProgressEvent('nope')).toBeNull();
    expect(readChatProgressEvent({})).toBeNull();
    expect(readChatProgressEvent({ turnId: 't1' })).toBeNull();
    expect(readChatProgressEvent({ tail: 'x' })).toBeNull();
    expect(readChatProgressEvent({ turnId: '', tail: 'x' })).toBeNull();
    expect(readChatProgressEvent({ turnId: 't1', tail: '' })).toBeNull();
    expect(readChatProgressEvent({ turnId: 42, tail: 'x' })).toBeNull();
    expect(readChatProgressEvent({ turnId: 't1', tail: 42 })).toBeNull();
  });
});
