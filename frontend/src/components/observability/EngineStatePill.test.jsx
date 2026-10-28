import React from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EngineStatePill } from './EngineStatePill';
import '@testing-library/jest-dom';

const stages = [
  { id: '5', name: 'Catchup', type: 'agent' },
  { id: 'merge', name: 'Merge and deploy', type: 'merge' },
];

const strandedEngine = {
  status: 'running',
  activeTaskId: 't1',
  activeStageId: 'merge',
  activeStageName: 'Merge and deploy',
  activeStageType: 'merge',
};

test('running pill names the active task stage, not a stranded engine stage', () => {
  render(
    <EngineStatePill
      engineState={strandedEngine}
      activeTask={{ id: 't1', currentStageId: '5' }}
      stages={stages}
      isRunning
      testId="engine-state-badge"
    />,
  );
  // Task 072e2cfa: the header kept reading the stage the task left.
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('ACTIVE: Catchup');
  expect(screen.getByTestId('engine-state-badge')).not.toHaveTextContent('Merge and deploy');
});

test('running pill keeps the engine stage when no task context resolves one', () => {
  render(
    <EngineStatePill
      engineState={strandedEngine}
      activeTask={null}
      stages={stages}
      isRunning
      testId="engine-state-badge"
    />,
  );
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('ACTIVE: Merge and deploy');
});

test('running pill falls back to RUNNING when nothing names a stage', () => {
  render(
    <EngineStatePill engineState={{ status: 'running' }} isRunning testId="engine-state-badge" />,
  );
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('ACTIVE: RUNNING');
});

test('non-running states are unaffected by stage resolution', () => {
  render(
    <EngineStatePill
      engineState={{ status: 'idle' }}
      activeTask={{ id: 't1', currentStageId: '5' }}
      stages={stages}
      isRunning={false}
      isCheckpoint
      testId="engine-state-badge"
    />,
  );
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('CHECKPOINT');
});

test('paused and stopped/idle labels stay intact', () => {
  const { unmount } = render(
    <EngineStatePill engineState={{ status: 'paused' }} isPaused testId="engine-state-badge" />,
  );
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('PAUSED');
  unmount();
  render(
    <EngineStatePill
      engineState={{ status: 'idle' }}
      schedulerRunning={false}
      testId="engine-state-badge"
    />,
  );
  expect(screen.getByTestId('engine-state-badge')).toHaveTextContent('STOPPED');
});
