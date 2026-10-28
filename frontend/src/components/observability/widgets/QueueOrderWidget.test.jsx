import React from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueueOrderWidget } from './QueueOrderWidget';

test('empty queue reads as idle-waiting while the scheduler runs', () => {
  render(
    <QueueOrderWidget scheduledQueue={[]} engineState={{ status: 'idle' }} schedulerRunning />,
  );
  expect(screen.getByText('Queue is Clear')).toBeInTheDocument();
  expect(screen.getByText(/waiting for work/i)).toBeInTheDocument();
});

test('empty queue reads as stopped only when the scheduler is explicitly off', () => {
  render(
    <QueueOrderWidget
      scheduledQueue={[]}
      engineState={{ status: 'idle' }}
      schedulerRunning={false}
    />,
  );
  expect(screen.getByText('Scheduler Stopped')).toBeInTheDocument();
  expect(screen.queryByText('Queue is Clear')).not.toBeInTheDocument();
});

test('empty queue defaults to idle-waiting when scheduler state is unknown', () => {
  render(<QueueOrderWidget scheduledQueue={[]} engineState={{ status: 'idle' }} />);
  expect(screen.getByText('Queue is Clear')).toBeInTheDocument();
  expect(screen.queryByText('Scheduler Stopped')).not.toBeInTheDocument();
});

test('queued items still render when work exists', () => {
  render(
    <QueueOrderWidget
      scheduledQueue={[
        {
          id: 'task-1',
          title: 'Do things',
          projectName: 'P',
          currentStageName: 'Work',
          queueOrder: 1,
        },
      ]}
      engineState={{ status: 'idle' }}
      schedulerRunning
    />,
  );
  expect(screen.getByTestId('queue-item-task-1')).toBeInTheDocument();
});

test('only the engine owner renders active with a stale runner present', () => {
  // The reported bug: two tasks look running at once. The stale task sits
  // at queue head (idx 0) so the old idx-0 fallback crowned it alongside
  // the real engine owner.
  const { container } = render(
    <QueueOrderWidget
      scheduledQueue={[
        {
          id: 'task-b',
          title: 'Stale runner',
          projectName: 'P',
          currentStageName: 'Work',
          queueOrder: 1,
          status: 'running_agent',
        },
        {
          id: 'task-a',
          title: 'Engine owner',
          projectName: 'P',
          currentStageName: 'Work',
          queueOrder: 2,
          status: 'running_agent',
        },
        {
          id: 'task-c',
          title: 'Queued work',
          projectName: 'P',
          currentStageName: 'Work',
          queueOrder: 3,
          status: 'in_stage',
        },
      ]}
      engineState={{ status: 'running', activeTaskId: 'task-a' }}
      schedulerRunning
    />,
  );
  const activeItems = Array.from(container.querySelectorAll('[data-testid^="queue-item-"]')).filter(
    (el) => el.className.includes('border-emerald-500'),
  );
  expect(activeItems).toHaveLength(1);
  expect(activeItems[0].getAttribute('data-testid')).toBe('queue-item-task-a');
});
