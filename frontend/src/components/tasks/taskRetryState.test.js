// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, expect, it, test } from 'vitest';
import {
  TASK_RETRY_STATES,
  retryStateOf,
  isRetryingTask,
  retryProgressLabel,
  retryWaitLabel,
  clearRetryState,
  setRetryScheduled,
  isRetryStuck,
  hasLiveRerunFlag,
  isRetryInProgress,
  isTaskSettledStatus,
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


/***
 * MARK: taskRetryState unit tests
 * @description "Retrying" must mean a same-stage in-place retry: a task whose
 *   failback moved it to another stage is normal in-progress work, not a
 *   retry. Covers older-backend payloads (autoRetrying only) and current
 *   payloads that also carry autoIterating.
 ***/
describe('isRetryInProgress', () => {
  it('is true for a same-stage in-place retry (current stage equals the failed stage)', () => {
    expect(
      isRetryInProgress({
        autoRetrying: true,
        currentStageId: '2',
        lastError: { stageId: '2', message: 'boom' },
      }),
    ).toBe(true);
  });

  it('is true when no failed stage is recorded (transient blip clears lastError)', () => {
    expect(isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: null })).toBe(true);
    expect(isRetryInProgress({ autoRetrying: true, currentStageId: '2' })).toBe(true);
    expect(isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: {} })).toBe(true);
  });

  it('is false when the failback moved the task to a different stage', () => {
    expect(
      isRetryInProgress({
        autoRetrying: true,
        currentStageId: '1',
        lastError: { stageId: '2', message: 'boom' },
      }),
    ).toBe(false);
  });

  it('is false when the backend marked the re-run as a cross-stage auto iteration', () => {
    expect(
      isRetryInProgress({
        autoRetrying: true,
        autoIterating: true,
        currentStageId: '1',
        lastError: { stageId: '2' },
      }),
    ).toBe(false);
    // autoIterating wins even if a stale lastError claims the current stage.
    expect(
      isRetryInProgress({
        autoRetrying: true,
        autoIterating: true,
        currentStageId: '2',
        lastError: { stageId: '2' },
      }),
    ).toBe(false);
  });

  it('is false whenever autoRetrying is not set, whatever the other fields say', () => {
    expect(isRetryInProgress({ currentStageId: '2', lastError: { stageId: '2' } })).toBe(false);
    expect(isRetryInProgress({ autoRetrying: false, currentStageId: '2', lastError: { stageId: '2' } })).toBe(false);
    expect(isRetryInProgress({ autoRetrying: 1, currentStageId: '2' })).toBe(false);
  });

  it('compares stage ids as strings (numeric vs string ids still match)', () => {
    expect(
      isRetryInProgress({ autoRetrying: true, currentStageId: 2, lastError: { stageId: '2' } }),
    ).toBe(true);
    expect(
      isRetryInProgress({ autoRetrying: true, currentStageId: '3', lastError: { stageId: 2 } }),
    ).toBe(false);
  });

  it('treats a missing current stage as an unprovable move (keeps RETRYING)', () => {
    expect(isRetryInProgress({ autoRetrying: true, lastError: { stageId: '2' } })).toBe(true);
  });

  it('never throws on missing task', () => {
    expect(isRetryInProgress(null)).toBe(false);
    expect(isRetryInProgress(undefined)).toBe(false);
    expect(isRetryInProgress({})).toBe(false);
  });

  it('is false for any settled status even with a stale autoRetrying flag (the 99709f bug)', () => {
    for (const status of ['completed', 'done', 'failed', 'aborted', 'cancelled', 'paused', 'interrupted', 'waiting_human', 'blocked', 'FAILED', 'Paused']) {
      expect(
        isRetryInProgress({ autoRetrying: true, status, currentStageId: '2', lastError: { stageId: '2' } }),
      ).toBe(false);
    }
  });

  it('allows unknown or missing status through (in-memory payloads classify by flags)', () => {
    expect(
      isRetryInProgress({ autoRetrying: true, status: 'running_agent', currentStageId: '2', lastError: { stageId: '2' } }),
    ).toBe(true);
    expect(isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: { stageId: '2' } })).toBe(true);
  });
});

describe('hasLiveRerunFlag', () => {
  it('is true when either re-run flag is set, regardless of status', () => {
    expect(hasLiveRerunFlag({ autoRetrying: true })).toBe(true);
    expect(hasLiveRerunFlag({ autoIterating: true })).toBe(true);
    expect(hasLiveRerunFlag({ status: 'failed', autoRetrying: true })).toBe(true);
  });

  it('is false without flags or on missing tasks', () => {
    expect(hasLiveRerunFlag({ status: 'failed' })).toBe(false);
    expect(hasLiveRerunFlag({ autoRetrying: false, autoIterating: false })).toBe(false);
    expect(hasLiveRerunFlag(null)).toBe(false);
    expect(hasLiveRerunFlag(undefined)).toBe(false);
  });
});

describe('isTaskSettledStatus', () => {
  it('is true for every settled status, case-insensitively', () => {
    for (const status of ['completed', 'done', 'failed', 'aborted', 'cancelled', 'paused', 'interrupted', 'waiting_human', 'blocked', 'FAILED', 'Paused']) {
      expect(isTaskSettledStatus({ status })).toBe(true);
    }
  });

  it('is false for live or unknown statuses and for missing tasks', () => {
    for (const status of ['in_stage', 'running_agent', 'queued', '', undefined]) {
      expect(isTaskSettledStatus({ status })).toBe(false);
    }
    expect(isTaskSettledStatus(null)).toBe(false);
    expect(isTaskSettledStatus(undefined)).toBe(false);
    expect(isTaskSettledStatus({})).toBe(false);
  });
});
