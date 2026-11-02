// Run in the lighter node environment: pure header-mode contract, no DOM needs.
// @vitest-environment node
import { expect, test, describe } from 'vitest';
import { resolveMobileHeaderMode } from './mobileHeaderMode';

const STAGES = [{ id: '5', name: 'Catchup', type: 'agent' }];
const TASK = { id: 't1', title: 'Build user auth', currentStageId: '5' };

describe('resolveMobileHeaderMode', () => {
  test('runners live + running: pill off, chip names task + stage', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ runnerId: 'local-alpha', taskId: 't1' }],
      registry: new Map([['local-alpha', {}]]),
      activeTask: TASK,
      stages: STAGES,
      engineState: { status: 'running', activeStageName: 'Build' },
    });
    expect(mode.showRunnerRows).toBe(true);
    expect(mode.showEnginePill).toBe(false);
    expect(mode.activeChip).toEqual({
      taskName: 'Build user auth',
      stageName: 'Catchup',
      label: 'Build user auth · Catchup',
    });
  });

  test('fleet registered but between assignments: pill stays off (fleet-idle rows state)', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [],
      registry: new Map([['local-alpha', {}]]),
      activeTask: TASK,
      stages: STAGES,
      engineState: { status: 'idle' },
    });
    expect(mode.showRunnerRows).toBe(true);
    expect(mode.showEnginePill).toBe(false);
  });

  test('no runners configured: pill on, legacy single-task display preserved', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [],
      registry: new Map(),
      activeTask: TASK,
      stages: STAGES,
      engineState: { status: 'running', activeStageName: 'Build' },
    });
    expect(mode.showRunnerRows).toBe(false);
    expect(mode.showEnginePill).toBe(true);
    expect(mode.activeChip?.label).toBe('Build user auth · Catchup');
  });

  test('checkpoint/paused with runners shown: pill off, per-runner state is the signal', () => {
    for (const status of ['checkpoint', 'waiting_human', 'paused']) {
      const mode = resolveMobileHeaderMode({
        assignments: [{ runnerId: 'local-alpha', taskId: 't1' }],
        registry: [],
        activeTask: TASK,
        stages: STAGES,
        engineState: { status },
      });
      expect(mode.showEnginePill).toBe(false);
    }
  });

  test('idle with no runners: pill on and chip falls back with no task', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [],
      registry: [],
      activeTask: null,
      stages: [],
      engineState: {},
    });
    expect(mode.showRunnerRows).toBe(false);
    expect(mode.showEnginePill).toBe(true);
    expect(mode.activeChip).toBeNull();
  });

  test('chip is null without a task name; stage alone never invents one', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ runnerId: 'r1' }],
      activeTask: null,
      stages: [],
      engineState: { status: 'running', activeStageName: 'Build' },
    });
    expect(mode.activeChip).toBeNull();
    expect(mode.showEnginePill).toBe(false);
  });

  test('registry accepts a list or a count, not just a Map', () => {
    expect(
      resolveMobileHeaderMode({ assignments: [], registry: [{ runnerId: 'r1' }] })
        .showEnginePill,
    ).toBe(false);
    expect(resolveMobileHeaderMode({ assignments: [], registry: 2 }).showEnginePill).toBe(
      false,
    );
    expect(resolveMobileHeaderMode({ assignments: [], registry: 0 }).showEnginePill).toBe(
      true,
    );
  });

  test('chip falls back to the goal first line when the task has no title', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ runnerId: 'r1' }],
      activeTask: { id: 't2', goal: '# Ship the widget\nSecond line' },
      stages: [],
      engineState: {},
    });
    expect(mode.activeChip?.taskName).toBe('Ship the widget');
    expect(mode.activeChip?.label).toBe('Ship the widget');
  });

  test('assignments without a runnerId never count as fleet presence', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ taskId: 't1' }, null],
      registry: [],
      activeTask: TASK,
      stages: STAGES,
      engineState: { status: 'running' },
    });
    expect(mode.showRunnerRows).toBe(false);
    expect(mode.showEnginePill).toBe(true);
  });

  test('missing inputs fail safe to the pill fallback, never a crash', () => {
    expect(resolveMobileHeaderMode()).toEqual({
      showRunnerRows: false,
      showEnginePill: true,
      activeChip: null,
    });
    expect(resolveMobileHeaderMode(null)).toEqual({
      showRunnerRows: false,
      showEnginePill: true,
      activeChip: null,
    });
    const nulls = resolveMobileHeaderMode({
      assignments: null,
      registry: null,
      activeTask: null,
      stages: null,
      engineState: null,
    });
    expect(nulls.showEnginePill).toBe(true);
    expect(nulls.activeChip).toBeNull();
  });

  test('unknown registry shapes and counts count as no fleet (pill stays visible)', () => {
    for (const registry of ['local-alpha', { size: 5 }, -1, 0.5, 2.5, NaN, Infinity]) {
      const mode = resolveMobileHeaderMode({ assignments: [], registry });
      expect(mode.showRunnerRows).toBe(false);
      expect(mode.showEnginePill).toBe(true);
    }
  });

  test('non-array assignments and stages never crash the resolver', () => {
    const mode = resolveMobileHeaderMode({
      assignments: 'local-alpha',
      registry: [],
      activeTask: TASK,
      stages: 'Catchup',
      engineState: { status: 'running' },
    });
    expect(mode.showRunnerRows).toBe(false);
    expect(mode.showEnginePill).toBe(true);
    expect(mode.activeChip?.taskName).toBe('Build user auth');
  });

  test('a numeric stage name still renders, like the pill does', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ runnerId: 'r1' }],
      activeTask: TASK,
      stages: [{ id: '5', name: 7, type: 'agent' }],
      engineState: {},
    });
    expect(mode.activeChip).toEqual({
      taskName: 'Build user auth',
      stageName: '7',
      label: 'Build user auth · 7',
    });
  });

  test('a non-text stage name falls back to the task-only chip', () => {
    const mode = resolveMobileHeaderMode({
      assignments: [{ runnerId: 'r1' }],
      activeTask: TASK,
      stages: [{ id: '5', name: { text: 'Catchup' }, type: 'agent' }],
      engineState: {},
    });
    expect(mode.activeChip).toEqual({
      taskName: 'Build user auth',
      stageName: null,
      label: 'Build user auth',
    });
  });
});
