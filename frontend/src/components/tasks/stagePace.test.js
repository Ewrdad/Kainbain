import { expect, test, describe } from 'vitest';
import {
  PACE_BANDS,
  compareStageAge,
  describePace,
  elapsedStageSeconds,
  formatAvgDuration,
  formatStageAge,
  paceStatus,
  shouldShowPace,
} from './stagePace';

/***
 * MARK: stagePace tests
 * @description Black-box tests for the per-stage age and pace-band helpers
 * behind the task-card age readout and green/amber/red pace colours.
 ***/

const NOW = Date.parse('2026-09-30T12:00:00Z');
const at = (secondsBeforeNow) => new Date(NOW - secondsBeforeNow * 1000).toISOString();

describe('elapsedStageSeconds', () => {
  test('measures seconds since enteredStageAt', () => {
    expect(elapsedStageSeconds({ enteredStageAt: at(90) }, NOW)).toBe(90);
  });

  test('falls back through updatedAt, createdAt, then timestamp', () => {
    expect(elapsedStageSeconds({ updatedAt: at(60) }, NOW)).toBe(60);
    expect(elapsedStageSeconds({ createdAt: at(30) }, NOW)).toBe(30);
    expect(elapsedStageSeconds({ timestamp: at(10) }, NOW)).toBe(10);
  });

  test('prefers enteredStageAt over the fallbacks', () => {
    expect(elapsedStageSeconds({ enteredStageAt: at(5), updatedAt: at(500) }, NOW)).toBe(5);
  });

  test('returns 0 for missing, invalid, or future timestamps (clock skew)', () => {
    expect(elapsedStageSeconds({}, NOW)).toBe(0);
    expect(elapsedStageSeconds(null, NOW)).toBe(0);
    expect(elapsedStageSeconds({ enteredStageAt: 'not-a-date' }, NOW)).toBe(0);
    expect(elapsedStageSeconds({ enteredStageAt: at(-60) }, NOW)).toBe(0);
  });

  test('never returns NaN', () => {
    expect(elapsedStageSeconds({ enteredStageAt: at(10) }, NaN)).toBe(0);
    expect(elapsedStageSeconds({ enteredStageAt: at(10) }, undefined)).toBeGreaterThanOrEqual(0);
  });
});

describe('paceStatus', () => {
  test('exposes the tunable amber boundary', () => {
    expect(PACE_BANDS.nearRatio).toBe(0.75);
  });

  test('under when elapsed is below 75% of the average', () => {
    expect(paceStatus(74, 100)).toBe('under');
    expect(paceStatus(0, 100)).toBe('under');
  });

  test('near when elapsed is between 75% and 100% of the average', () => {
    expect(paceStatus(75, 100)).toBe('near');
    expect(paceStatus(99, 100)).toBe('near');
    expect(paceStatus(100, 100)).toBe('near');
  });

  test('over when elapsed passes the average', () => {
    expect(paceStatus(101, 100)).toBe('over');
    expect(paceStatus(500, 100)).toBe('over');
  });

  test('unknown when there is no usable average', () => {
    expect(paceStatus(10, 0)).toBe('unknown');
    expect(paceStatus(10, -5)).toBe('unknown');
    expect(paceStatus(10, null)).toBe('unknown');
    expect(paceStatus(10, undefined)).toBe('unknown');
    expect(paceStatus(10, NaN)).toBe('unknown');
  });

  test('unknown when elapsed is not a number', () => {
    expect(paceStatus(NaN, 100)).toBe('unknown');
    expect(paceStatus(undefined, 100)).toBe('unknown');
  });
});

describe('shouldShowPace', () => {
  const idle = { status: 'in_stage' };

  test('shows for running tasks', () => {
    expect(shouldShowPace(idle, { isRunning: true, isReview: false })).toBe(true);
  });

  test('shows for human-review tasks', () => {
    expect(shouldShowPace(idle, { isRunning: false, isReview: true })).toBe(true);
  });

  test('hides for idle tasks that are neither running nor in review', () => {
    expect(shouldShowPace(idle, { isRunning: false, isReview: false })).toBe(false);
    expect(shouldShowPace(idle, {})).toBe(false);
    expect(shouldShowPace(idle)).toBe(false);
  });

  test('treats auto-retrying tasks as running work', () => {
    expect(
      shouldShowPace(
        { status: 'failed', autoRetrying: true },
        { isRunning: false, isReview: false },
      ),
    ).toBe(true);
  });

  test.each([
    ['failed status', { status: 'failed' }],
    ['failure reason without retry', { status: 'in_stage', failureReason: 'boom' }],
    ['interrupted flag', { status: 'in_stage', wasInterrupted: true }],
    ['interrupted status', { status: 'interrupted' }],
    ['blocked verdict', { status: 'in_stage', isBlocked: true }],
    ['paused status', { status: 'paused' }],
    ['completed status', { status: 'completed' }],
    ['legacy done status', { status: 'done' }],
  ])('hides pace for %s even while running or in review', (_label, task) => {
    expect(shouldShowPace(task, { isRunning: true, isReview: false })).toBe(false);
    expect(shouldShowPace(task, { isRunning: false, isReview: true })).toBe(false);
  });

  test('never throws on missing task', () => {
    expect(shouldShowPace(null, { isRunning: true })).toBe(true);
    expect(shouldShowPace(undefined, {})).toBe(false);
  });
});

describe('compareStageAge', () => {
  test('sorts oldest-in-stage first', () => {
    const old = { id: 'old', enteredStageAt: at(300) };
    const young = { id: 'young', enteredStageAt: at(30) };
    expect(compareStageAge(old, young, NOW)).toBeLessThan(0);
    expect(compareStageAge(young, old, NOW)).toBeGreaterThan(0);
    expect([young, old].sort((a, b) => compareStageAge(a, b, NOW)).map((t) => t.id)).toEqual([
      'old',
      'young',
    ]);
  });

  test('ties keep insertion order (stable comparator returns 0)', () => {
    const a = { id: 'a', enteredStageAt: at(60) };
    const b = { id: 'b', enteredStageAt: at(60) };
    expect(compareStageAge(a, b, NOW)).toBe(0);
  });

  test('tasks without timestamps sort as newest', () => {
    const known = { id: 'known', enteredStageAt: at(60) };
    const unknown = { id: 'unknown' };
    expect(compareStageAge(unknown, known, NOW)).toBeGreaterThan(0);
  });
});

describe('formatStageAge', () => {
  test('formats seconds, minutes, hours, days compactly', () => {
    expect(formatStageAge({ enteredStageAt: at(45) }, NOW)).toBe('45s');
    expect(formatStageAge({ enteredStageAt: at(45 * 60) }, NOW)).toBe('45m');
    expect(formatStageAge({ enteredStageAt: at(3 * 3600) }, NOW)).toBe('3h');
    expect(formatStageAge({ enteredStageAt: at(2 * 86400) }, NOW)).toBe('2d');
  });

  test('floors partial units and never shows negative age', () => {
    expect(formatStageAge({ enteredStageAt: at(90) }, NOW)).toBe('1m');
    expect(formatStageAge({}, NOW)).toBe('0s');
    expect(formatStageAge({ enteredStageAt: at(-30) }, NOW)).toBe('0s');
  });
});

describe('formatAvgDuration', () => {
  test('formats sub-minute and multi-minute durations', () => {
    expect(formatAvgDuration(45)).toBe('45s');
    expect(formatAvgDuration(100)).toBe('1m 40s');
    expect(formatAvgDuration(150)).toBe('2m 30s');
  });

  test('returns a placeholder for unusable values', () => {
    expect(formatAvgDuration(0)).toBe('--');
    expect(formatAvgDuration(-3)).toBe('--');
    expect(formatAvgDuration(NaN)).toBe('--');
  });
});

describe('describePace', () => {
  test('explains the band with elapsed versus average', () => {
    const over = describePace(150, 100);
    expect(over.title).toMatch(/over/i);
    expect(over.description).toContain('2m 30s');
    expect(over.description).toContain('1m 40s');
  });

  test('under and near bands name their meaning', () => {
    expect(describePace(10, 100).title).toMatch(/under/i);
    expect(describePace(80, 100).title).toMatch(/near|close/i);
  });

  test('unknown average stays neutral with no colour claim', () => {
    const unknown = describePace(50, 0);
    expect(unknown.title).toMatch(/no .*average|neutral|unknown/i);
    expect(unknown.description).not.toMatch(/green|amber|red/i);
  });
});
