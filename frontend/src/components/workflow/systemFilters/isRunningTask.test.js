// Run in the lighter node environment: pure predicate logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { isRunningTask } from './isRunningTask';

/***
 * MARK: isRunningTask tests
 * @description Unit tests for the `!running` predicate: it reuses the
 *   `isTaskRunning` engine-owner lock (genuinely executing right now), so a
 *   stale `running_*` label without ownership never counts while the
 *   no-snapshot fallback trusts the label (isolated renders).
 ***/

const RUNNING_ENGINE = { status: 'running', activeTaskId: 't1' };

describe('isRunningTask', () => {
  test('engine owner under a running engine counts as running', () => {
    expect(
      isRunningTask({ id: 't1', status: 'running_agent' }, { engineState: RUNNING_ENGINE }),
    ).toBe(true);
  });

  test('stale running_* label without engine ownership never counts', () => {
    expect(
      isRunningTask({ id: 't2', status: 'running_agent' }, { engineState: RUNNING_ENGINE }),
    ).toBe(false);
  });

  test('owner under an idle engine is not running', () => {
    expect(
      isRunningTask(
        { id: 't1', status: 'running_agent' },
        { engineState: { status: 'idle', activeTaskId: 't1' } },
      ),
    ).toBe(false);
  });

  test('agent loop running also marks the owner as running', () => {
    expect(
      isRunningTask(
        { id: 't1', status: 'in_stage' },
        { engineState: { status: 'idle', activeTaskId: 't1' }, isAgentRunning: true },
      ),
    ).toBe(true);
  });

  test('no engine snapshot trusts the label (isolated-render fallback)', () => {
    expect(isRunningTask({ id: 't9', status: 'running_ci' }, undefined)).toBe(true);
    expect(isRunningTask({ id: 't9', status: 'running_ci' }, {})).toBe(true);
    expect(isRunningTask({ id: 't9', status: 'in_stage' }, undefined)).toBe(false);
  });

  test('nullish tasks never count', () => {
    expect(isRunningTask(null, { engineState: RUNNING_ENGINE })).toBe(false);
    expect(isRunningTask(undefined, { engineState: RUNNING_ENGINE })).toBe(false);
  });
});
