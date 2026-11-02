import React from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueueOrderList } from './QueueOrderList';

test('renders ordered position badges', () => {
  render(
    <QueueOrderList
      items={[
        { id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1 },
        { id: 'b', title: 'B', projectName: 'P', currentStageName: 'Work', queueOrder: 2 },
      ]}
      engineState={{ status: 'idle' }}
    />,
  );
  expect(screen.getByText('#1')).toBeInTheDocument(); // not exact maybe '#1' with #
  expect(screen.getByTestId('queue-item-a')).toBeInTheDocument();
  expect(screen.getByTestId('queue-item-b')).toBeInTheDocument();
});

test('row click activates handler', () => {
  const onSelectTask = vi.fn();
  render(
    <QueueOrderList
      items={[{ id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1 }]}
      engineState={{ status: 'idle' }}
      onSelectTask={onSelectTask}
    />,
  );
  fireEvent.click(screen.getByTestId('queue-item-a'));
  expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
});

test('blocked reason renders in badge', () => {
  render(
    <QueueOrderList
      items={[{ id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1, priorityReason: 'Blocked by dep' }]}
      engineState={{ status: 'idle' }}
    />,
  );
  expect(screen.getByText('Blocked by dep')).toBeInTheDocument();
});
