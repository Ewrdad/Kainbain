import { describe, expect, test } from 'vitest';
import { msToMinutes, minutesToMs, secsToMinutes, minutesToSecs } from './timeoutUnits';

/***
 * MARK: timeoutUnits tests
 * @description Pins the presentation-layer ms<->minutes (and secs<->minutes)
 *   conversion: the four stage defaults round-trip exactly, fractional legacy
 *   values survive, blanks stay blank (follow-the-default), long decimals
 *   are trimmed for display without corrupting the persisted value, and no
 *   input — blank, garbage, or non-finite — ever produces NaN.
 ***/

describe('msToMinutes', () => {
  test.each([
    [1800000, 30],
    [60000, 1],
    [300000, 5],
    [90000, 1.5],
    [250, 0.004167],
  ])('displays %i ms as %s min', (ms, minutes) => {
    expect(msToMinutes(ms)).toBe(minutes);
  });

  test('trims repeating decimals for display', () => {
    expect(msToMinutes(111111)).toBe(1.85185);
    expect(msToMinutes(100000)).toBe(1.666667);
  });

  test('blank and unset stay blank (follow the default)', () => {
    expect(msToMinutes('')).toBe('');
    expect(msToMinutes(null)).toBe('');
    expect(msToMinutes(undefined)).toBe('');
  });

  test('zero displays as zero', () => {
    expect(msToMinutes(0)).toBe(0);
  });

  test('unparseable stored values display as blank, never NaN', () => {
    expect(msToMinutes('abc')).toBe('');
    expect(msToMinutes('Infinity')).toBe('');
    expect(msToMinutes(NaN)).toBe('');
    expect(msToMinutes(Infinity)).toBe('');
    for (const value of [msToMinutes('abc'), msToMinutes(NaN)]) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

describe('minutesToMs', () => {
  test.each([
    ['30', 1800000],
    ['1', 60000],
    ['5', 300000],
    ['1.5', 90000],
    [2, 120000],
    ['0.5', 30000],
  ])('persists %s min as %i ms', (minutes, ms) => {
    expect(minutesToMs(minutes)).toBe(ms);
  });

  test('rounds long decimals to whole milliseconds', () => {
    expect(minutesToMs('1.85185')).toBe(111111);
  });

  test('blank and unset stay blank (clear = follow the default)', () => {
    expect(minutesToMs('')).toBe('');
    expect(minutesToMs('   ')).toBe('');
    expect(minutesToMs(null)).toBe('');
    expect(minutesToMs(undefined)).toBe('');
  });

  test('unparseable input parses to blank, never NaN (fail-safe draft)', () => {
    for (const bad of ['abc', '-', '.', 'Infinity', 'NaN', '1.2.3', '']) {
      const out = minutesToMs(bad);
      expect(out).toBe('');
      expect(Number.isNaN(out)).toBe(false);
    }
    expect(Number.isNaN(minutesToMs(NaN))).toBe(false);
    expect(minutesToMs(NaN)).toBe('');
    expect(minutesToMs(Infinity)).toBe('');
  });

  test('surrounding whitespace is tolerated', () => {
    expect(minutesToMs('  2  ')).toBe(120000);
  });
});

describe('ms round-trip fidelity', () => {
  test.each([1800000, 60000, 300000, 90000, 111111, 250])(
    'stored %i ms survives a display/edit cycle',
    (ms) => {
      expect(minutesToMs(String(msToMinutes(ms)))).toBe(ms);
    },
  );
});

describe('secsToMinutes / minutesToSecs', () => {
  test('converts the harness default exactly', () => {
    expect(secsToMinutes(600)).toBe(10);
    expect(minutesToSecs('10')).toBe(600);
  });

  test('fractional minutes round-trip', () => {
    expect(secsToMinutes(90)).toBe(1.5);
    expect(minutesToSecs('1.5')).toBe(90);
  });

  test('blank stays blank', () => {
    expect(secsToMinutes('')).toBe('');
    expect(secsToMinutes(null)).toBe('');
    expect(secsToMinutes(undefined)).toBe('');
    expect(minutesToSecs('')).toBe('');
    expect(minutesToSecs(null)).toBe('');
    expect(minutesToSecs(undefined)).toBe('');
  });

  test('unparseable input never produces NaN on either side', () => {
    for (const bad of ['abc', '-', '.', 'Infinity']) {
      expect(secsToMinutes(bad)).toBe('');
      expect(minutesToSecs(bad)).toBe('');
      expect(Number.isNaN(secsToMinutes(bad))).toBe(false);
      expect(Number.isNaN(minutesToSecs(bad))).toBe(false);
    }
    expect(minutesToSecs(NaN)).toBe('');
    expect(secsToMinutes(NaN)).toBe('');
  });

  test('seconds round-trip fidelity, including sub-minute values', () => {
    for (const secs of [600, 90, 30, 1]) {
      expect(minutesToSecs(String(secsToMinutes(secs)))).toBe(secs);
    }
  });
});
