// Cross-surface agreement for task 072e2cfa: given one engine snapshot and
// task list, the desktop observability header and the compact mobile header
// must name the SAME running task and stage. They used to disagree after a
// manual stage move (the header read the stranded engine stage while the card
// and board showed the task's actual stage).
import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard } from './ObservabilityDashboard';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    observabilityStatus: vi.fn().mockResolvedValue({
      status: 'ok',
      observability: {
        stats: {
          total: 1,
          completed: 0,
          failed: 0,
          running: 1,
          waitingHuman: 0,
          paused: 0,
          inStage: 0,
          blocked: 0,
          queueDepth: 1,
          successRate: 100,
          failureRate: 0,
        },
        // A stranded engine snapshot: the task was moved to Catchup, but the
        // snapshot still names the merge stage it left.
        engineState: {
          status: 'running',
          activeTaskId: 't1',
          activeProjectId: 'proj-1',
          activeProjectName: 'Proj',
          activeStageId: 'merge',
          activeStageName: 'Merge and deploy',
          activeStageType: 'merge',
        },
        queue: [],
        activeTask: {
          id: 't1',
          projectId: 'proj-1',
          title: 'Task',
          goal: 'Task',
          currentStageId: '5',
          currentStageName: 'Catchup',
          status: 'in_stage',
        },
        recentCompleted: [],
        recentFailed: [],
      },
    }),
  },
}));

const stages = [
  { id: '5', name: 'Catchup', type: 'agent' },
  { id: 'merge', name: 'Merge and deploy', type: 'merge' },
];
const strandedEngine = {
  status: 'running',
  activeTaskId: 't1',
  activeProjectId: 'proj-1',
  activeProjectName: 'Proj',
  activeStageId: 'merge',
  activeStageName: 'Merge and deploy',
  activeStageType: 'merge',
};
const task = {
  id: 't1',
  projectId: 'proj-1',
  title: 'Task',
  goal: 'Task',
  currentStageId: '5',
  currentStageName: 'Catchup',
  status: 'in_stage',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.sessionStorage.clear();
});

test('desktop and compact mobile headers agree on the running task stage', async () => {
  const desktop = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: strandedEngine,
    tasks: [task],
    stages,
  });
  await act(async () => {});
  const desktopBadge = screen.getByTestId('engine-state-badge');
  expect(desktopBadge).toHaveTextContent('ACTIVE: Catchup');
  expect(desktopBadge).not.toHaveTextContent('Merge and deploy');
  desktop.unmount();

  window.sessionStorage.setItem('kainbain:observability:compact', '1');
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: strandedEngine,
    tasks: [task],
    stages,
  });
  await act(async () => {});
  const mobileBadge = screen.getByTestId('mobile-engine-state');
  expect(mobileBadge).toHaveTextContent('ACTIVE: Catchup');
  expect(mobileBadge).not.toHaveTextContent('Merge and deploy');

  // One agreed label across both surfaces.
  expect(mobileBadge.textContent).toBe(desktopBadge.textContent);
});
