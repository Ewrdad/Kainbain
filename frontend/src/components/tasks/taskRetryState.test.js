// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isRetryInProgress } from './taskRetryState';

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
});
