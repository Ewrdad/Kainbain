import { expect, test } from 'vitest';

import { selectRunnerEntries } from './selectRunnerEntries';

/***
 * MARK: selectRunnerEntries tests
 * @description Runner identity resolution: explicit runner association
 * groups by runner; plain queue data yields no entries (graceful
 * degradation to the single-task view, never queued tasks as runners).
 ***/

test('empty or missing input yields no entries', () => {
  expect(selectRunnerEntries({ tasks: [], stages: [], engineState: {} })).toEqual([]);
  expect(selectRunnerEntries()).toEqual([]);
  expect(selectRunnerEntries({ tasks: null })).toEqual([]);
});

test('tasks without runner association yield no entries', () => {
  // Ordinary queue data (even across two pipelines) is NOT runner data:
  // the bar keeps the legacy single-task view instead of misrepresenting
  // queued tasks as live runners.
  const tasks = [
    { id: 't-a1', workflowId: 'wf-a', status: 'in_stage', title: 'Alpha' },
    { id: 't-b1', workflowId: 'wf-b', status: 'in_stage', title: 'Beta' },
  ];
  expect(
    selectRunnerEntries({ tasks, stages: [], engineState: { status: 'running', activeTaskId: 't-a1' } }),
  ).toEqual([]);
});

test('tasks sharing a runnerId form one entry naming the freshest open task', () => {
  const tasks = [
    {
      id: 't-old',
      runnerId: 'bravo',
      status: 'in_stage',
      title: 'Old work',
      updatedAt: '2026-10-27T00:00:01Z',
    },
    {
      id: 't-new',
      runnerId: 'bravo',
      status: 'in_stage',
      title: 'New work',
      updatedAt: '2026-10-27T00:00:02Z',
    },
  ];
  const [entry] = selectRunnerEntries({ tasks, stages: [], engineState: { status: 'idle' } });
  expect(entry.runnerId).toBe('bravo');
  expect(entry.runnerLabel).toBe('bravo');
  expect(entry.taskId).toBe('t-new');
  expect(entry.taskTitleFirstLine).toBe('New work');
  expect(entry.statusWord).toBe('queued');
});

test('distinct runners yield sorted entries with names, stages, and words', () => {
  const stages = [{ id: '1', name: 'Plan', type: 'agent' }];
  const tasks = [
    {
      id: 't1',
      runnerId: 'zulu',
      runnerName: 'Zulu box',
      currentStageId: '1',
      status: 'failed',
      title: 'Broken',
    },
    {
      id: 't2',
      runnerId: 'alpha',
      currentStageId: '1',
      status: 'in_stage',
      goal: '# Ship it\nbody',
    },
  ];
  const engineState = { status: 'running', activeTaskId: 't2' };
  const entries = selectRunnerEntries({ tasks, stages, engineState, isAgentRunning: true });
  expect(entries.map((entry) => entry.runnerId)).toEqual(['alpha', 'zulu']);
  const [alpha, zulu] = entries;
  expect(alpha.runnerLabel).toBe('alpha');
  expect(alpha.taskId).toBe('t2');
  // Goal markdown renders as its first line with the heading stripped.
  expect(alpha.taskTitleFirstLine).toBe('Ship it');
  expect(alpha.stageName).toBe('Plan');
  expect(alpha.statusWord).toBe('running');
  // Settled task state wins over the running engine.
  expect(zulu.runnerLabel).toBe('Zulu box');
  expect(zulu.statusWord).toBe('failed');
  expect(zulu.stageName).toBe('Plan');
});

test('the engine owner wins over recency inside its runner group', () => {
  const tasks = [
    { id: 't-fresh', runnerId: 'b', status: 'in_stage', title: 'Fresh', updatedAt: '2026-10-27T00:00:02Z' },
    { id: 't-owner', runnerId: 'b', status: 'running_agent', title: 'Owner', updatedAt: '2026-10-27T00:00:01Z' },
  ];
  const [entry] = selectRunnerEntries({
    tasks,
    stages: [],
    engineState: { status: 'running', activeTaskId: 't-owner' },
  });
  expect(entry.taskId).toBe('t-owner');
  expect(entry.statusWord).toBe('running');
});

test('object-shaped runner fields and blank ids behave', () => {
  const tasks = [
    { id: 't1', runner: { id: 'b1', name: 'Bravo One' }, status: 'in_stage', title: 'Work' },
    { id: 't2', runnerId: '   ', status: 'in_stage', title: 'No runner' },
    null,
    'junk',
  ];
  const entries = selectRunnerEntries({ tasks, stages: [], engineState: { status: 'idle' } });
  expect(entries).toHaveLength(1);
  expect(entries[0].runnerId).toBe('b1');
  expect(entries[0].runnerLabel).toBe('Bravo One');
});

test('a later group task can supply the display name', () => {
  const tasks = [
    { id: 't1', runnerId: 'b1', status: 'in_stage', title: 'One' },
    { id: 't2', runnerId: 'b1', runnerName: 'Bravo', status: 'in_stage', title: 'Two' },
  ];
  const [entry] = selectRunnerEntries({ tasks, stages: [], engineState: { status: 'idle' } });
  expect(entry.runnerLabel).toBe('Bravo');
});

test('stage falls back to the task stage name when the stage list misses', () => {
  const tasks = [
    { id: 't1', runnerId: 'b', currentStageId: '9', stageName: 'Custom', status: 'in_stage', title: 'Work' },
  ];
  const [entry] = selectRunnerEntries({ tasks, stages: [], engineState: { status: 'idle' } });
  expect(entry.stageName).toBe('Custom');
});
