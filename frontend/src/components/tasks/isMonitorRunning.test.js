// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { isMonitorRunning } from './isMonitorRunning';

describe('isMonitorRunning selector', () => {
  test('running engine status means monitoring is active', () => {
    expect(isMonitorRunning({ status: 'running' }, false)).toBe(true);
    expect(isMonitorRunning({ status: 'running', activeTaskId: 't1' }, false)).toBe(true);
  });

  test('agent loop running means monitoring is active even without engine status', () => {
    expect(isMonitorRunning({ status: 'idle' }, true)).toBe(true);
    expect(isMonitorRunning({}, true)).toBe(true);
    expect(isMonitorRunning(null, true)).toBe(true);
    expect(isMonitorRunning(undefined, true)).toBe(true);
  });

  test('idle, paused, and checkpoint engines without the agent loop are not running', () => {
    expect(isMonitorRunning({ status: 'idle' }, false)).toBe(false);
    expect(isMonitorRunning({ status: 'paused' }, false)).toBe(false);
    expect(isMonitorRunning({ status: 'checkpoint' }, false)).toBe(false);
    expect(isMonitorRunning({ status: 'waiting_human' }, false)).toBe(false);
    expect(isMonitorRunning({}, false)).toBe(false);
    expect(isMonitorRunning(null, false)).toBe(false);
    expect(isMonitorRunning(undefined, false)).toBe(false);
  });

  test('missing agent flag defaults to not running', () => {
    expect(isMonitorRunning({ status: 'idle' })).toBe(false);
    expect(isMonitorRunning({ status: 'running' })).toBe(true);
  });

  test('matches the legacy inline predicate it replaces', () => {
    const legacy = (engineState, isAgentRunning) => {
      const engineStatus = engineState?.status || (isAgentRunning ? 'running' : 'idle');
      return engineStatus === 'running' || isAgentRunning;
    };
    const engines = [
      undefined,
      null,
      {},
      { status: 'running' },
      { status: 'idle' },
      { status: 'paused' },
      { status: 'checkpoint' },
      { status: 'waiting_human' },
    ];
    for (const engine of engines) {
      for (const flag of [true, false, undefined]) {
        expect(Boolean(isMonitorRunning(engine, flag))).toBe(Boolean(legacy(engine, flag)));
      }
    }
  });
});
