import { describe, expect, test } from 'vitest';
import {
  TASK_RETRY_STATES,
  retryStateOf,
  isRetryingTask,
  retryProgressLabel,
  retryWaitLabel,
  clearRetryState,
  setRetryScheduled,
  isRetryStuck,
} from './taskRetryState';

/***
 * MARK: taskRetryState tests
 * @description Locks the frontend retry labels: a parked failed task never
 *   reads RETRYING, a scheduled retry names itself with attempt x/y and a
 *   countdown, and manual retries stay distinguishable from automatic ones.
 ***/

const NOW = Date.parse('2026-10-31T00:00:00.000Z');
const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();

describe('retryStateOf', () => {
  test('null task is none', () => {
    expect(retryStateOf(null)).toEqual({
      state: 'none',
      attempt: 0,
      maxAttempts: 0,
      nextRetryAt: null,
      hasRetryableSchedule: false,
    });
  });

  test('legacy autoRetrying maps to scheduled', () => {
    expect(retryStateOf({ autoRetrying: true, status: 'in_stage' }).state).toBe(
      TASK_RETRY_STATES.SCHEDULED,
    );
  });

  test('parked failed task with a lingering flag is exhausted, not retrying', () => {
    const task = { status: 'failed', autoRetrying: true };
    expect(retryStateOf(task).state).toBe(TASK_RETRY_STATES.EXHAUSTED);
    expect(isRetryingTask(task)).toBe(false);
  });
});

describe('retryProgressLabel', () => {
  test('scheduled retry shows the scheduled variant with counts', () => {
    expect(
      retryProgressLabel({
        status: 'in_stage',
        retryState: 'scheduled',
        retryAttempt: 2,
        retryMaxAttempts: 5,
      }),
    ).toBe('RETRYING (scheduled) 2/5');
  });

  test('running retry shows the plain variant', () => {
    expect(retryProgressLabel({ status: 'in_stage', retryState: 'running' })).toBe('RETRYING');
  });

  test('manual retry is distinguishable', () => {
    expect(
      retryProgressLabel({
        status: 'in_stage',
        retryState: 'scheduled',
        lastRetrySource: 'operator',
      }),
    ).toBe('RETRYING (manual)');
  });

  test('parked task has no retry label', () => {
    expect(retryProgressLabel({ status: 'failed', retryState: 'exhausted' })).toBe('');
    expect(retryProgressLabel({ status: 'in_stage', retryState: 'none' })).toBe('');
  });
});

describe('retryWaitLabel', () => {
  test('scheduled retry counts down', () => {
    expect(
      retryWaitLabel({ status: 'in_stage', retryState: 'scheduled', nextRetryAt: at(12000) }, NOW),
    ).toBe('in 12s');
  });

  test('overdue retry reads due now', () => {
    expect(
      retryWaitLabel({ status: 'in_stage', retryState: 'scheduled', nextRetryAt: at(-1000) }, NOW),
    ).toBe('due now');
  });

  test('unknown deadline renders nothing, never NaN', () => {
    expect(retryWaitLabel({ status: 'in_stage', retryState: 'scheduled' }, NOW)).toBe('');
    expect(
      retryWaitLabel(
        { status: 'in_stage', retryState: 'scheduled', nextRetryAt: 'not-a-date' },
        NOW,
      ),
    ).toBe('');
  });
});

describe('clearRetryState / setRetryScheduled', () => {
  test('clear removes every flag but preserves history', () => {
    const task = {
      status: 'in_stage',
      autoRetrying: true,
      retryState: 'scheduled',
      nextRetryAt: at(60000),
      failureReason: 'boom',
    };
    clearRetryState(task);
    expect(task.autoRetrying).toBe(false);
    expect(task.retryState).toBe('none');
    expect(task.nextRetryAt).toBeNull();
    expect(task.failureReason).toBe('boom');
  });

  test('setRetryScheduled arms the display state', () => {
    const task = { status: 'in_stage' };
    setRetryScheduled(task, { attempt: 1, maxAttempts: 3, nextRetryAt: at(5000) });
    expect(isRetryingTask(task)).toBe(true);
    expect(retryProgressLabel(task)).toBe('RETRYING (scheduled) 1/3');
  });
});

describe('isRetryStuck', () => {
  test('long-overdue scheduled retry is stuck; fresh one is not', () => {
    expect(
      isRetryStuck({ status: 'in_stage', retryState: 'scheduled', nextRetryAt: at(-120000) }, NOW),
    ).toBe(true);
    expect(
      isRetryStuck({ status: 'in_stage', retryState: 'scheduled', nextRetryAt: at(-2000) }, NOW),
    ).toBe(false);
  });
});
