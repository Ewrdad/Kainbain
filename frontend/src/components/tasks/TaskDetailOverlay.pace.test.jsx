import { expect, test, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TaskDetailOverlay } from './TaskDetailOverlay';
import '@testing-library/jest-dom';

/***
 * MARK: TaskDetailOverlay pace tests
 * @description Verifies the inspector history tab shows a live elapsed row
 * for the current stage plus per-row stage-average hints, while closed rows
 * keep their stored durations. Kept in its own file so parallel branches
 * extending TaskDetailOverlay.test.jsx do not conflict.
 ***/

beforeEach(() => {
  window.localStorage.clear();
});

const stages = [
  { id: '1', name: 'Idea', type: 'agent' },
  { id: '2', name: 'Review', type: 'human' },
];

// One sibling whose history yields a 120s Idea sample, so the stage average
// hint is deterministic (avg 2m 0s).
const siblingTasks = (() => {
  const entered = Date.now() - 3600 * 1000;
  return [
    {
      id: 'sibling-1',
      goal: 'Earlier work',
      currentStageId: '2',
      history: [
        { timestamp: new Date(entered).toISOString(), action: 'Created in stage 1' },
        { timestamp: new Date(entered + 120 * 1000).toISOString(), action: 'Advanced to stage 2' },
      ],
    },
  ];
})();

const openTask = {
  id: 't1',
  goal: 'Work in progress',
  title: 'Work in progress',
  status: 'in_stage',
  currentStageId: '1',
  enteredStageAt: new Date(Date.now() - 90 * 1000).toISOString(),
  history: [{ timestamp: '2026-01-01', action: 'Created and placed in stage 1' }],
  timeline: [{ timestamp: '14:00', stage: 'Idea', duration: '1m', status: 'Success' }],
};

function openHistory(task, overrides = {}) {
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    tasks: siblingTasks,
    ...overrides,
  });
  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
}

test('current-stage row shows live elapsed time with the stage average', () => {
  openHistory(openTask);
  // Partial matchers: the row renders timestamp, separator, and duration as
  // adjacent text nodes inside one span.
  expect(screen.getByText(/1m in stage/)).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
});

test('closed rows keep stored durations and gain an average hint', () => {
  openHistory(openTask);
  // Stored closed-row duration survives next to the live row and the hints.
  expect(screen.getByText(/1m in stage/)).toBeInTheDocument();
  expect(screen.getByText(/14:00/)).toBeInTheDocument();
  // Both the live Idea row and the closed Idea row carry the 120s average
  // (matched by the hint's title attribute for precision).
  expect(screen.getAllByTitle(/Stage average.*2m 0s/)).toHaveLength(2);
});

test('completed tasks show history only, with no live current-stage row', () => {
  openHistory({ ...openTask, status: 'completed' });
  expect(screen.queryByText(/\d+[smhd] in stage/)).not.toBeInTheDocument();
  expect(screen.queryByText('Active')).not.toBeInTheDocument();
  expect(screen.getByText(/14:00/)).toBeInTheDocument();
});

test('stages without samples show no average hint', () => {
  renderWithKainBain(<TaskDetailOverlay task={openTask} onClose={() => {}} />, {
    stages,
    tasks: [],
  });
  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText(/1m in stage/)).toBeInTheDocument();
  expect(screen.queryByTitle(/Stage average/)).not.toBeInTheDocument();
});
