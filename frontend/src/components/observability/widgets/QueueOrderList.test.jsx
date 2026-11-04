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

test('exactly one item is active: engine activeTaskId drives the single-active invariant', () => {
  const { container } = render(
    <QueueOrderList
      items={[
        { id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1 },
        { id: 'b', title: 'B', projectName: 'P', currentStageName: 'Work', queueOrder: 2 },
      ]}
      engineState={{ status: 'running', activeTaskId: 'b' }}
    />,
  );
  const active = screen.getByTestId('queue-item-b');
  const idle = screen.getByTestId('queue-item-a');
  expect(active.className).toContain('bg-emerald-950/30');
  expect(idle.className).not.toContain('bg-emerald-950/30');
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
});

test('waiting-human reason renders with waiting treatment', () => {
  render(
    <QueueOrderList
      items={[{ id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1, status: 'waiting_human', waitingReason: 'Needs approval' }]}
      engineState={{ status: 'idle' }}
    />,
  );
  expect(screen.getByText('Needs approval')).toBeInTheDocument();
  expect(screen.getByTestId('queue-item-a').className).toContain('bg-amber-950/20');
});

test('rows without a selection handler stay plain divs (monitor parity: no dead buttons)', () => {
  render(
    <QueueOrderList
      items={[{ id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1 }]}
      engineState={{ status: 'idle' }}
    />,
  );
  const row = screen.getByTestId('queue-item-a');
  expect(row.tagName).toBe('DIV');
  expect(row).not.toHaveAttribute('role');
  expect(row).not.toHaveAttribute('tabindex');
  expect(row.className).not.toContain('cursor-pointer');
});

test('rows with a handler are keyboard-operable buttons', () => {
  const onSelectTask = vi.fn();
  render(
    <QueueOrderList
      items={[{ id: 'a', title: 'A', projectName: 'P', currentStageName: 'Work', queueOrder: 1 }]}
      engineState={{ status: 'idle' }}
      onSelectTask={onSelectTask}
    />,
  );
  const row = screen.getByTestId('queue-item-a');
  expect(row).toHaveAttribute('role', 'button');
  expect(row).toHaveAttribute('tabindex', '0');
  fireEvent.keyDown(row, { key: 'Enter' });
  expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  fireEvent.keyDown(row, { key: ' ' });
  expect(onSelectTask).toHaveBeenCalledTimes(2);
});

test('empty state renders inside the scroll container', () => {
  render(<QueueOrderList items={[]} engineState={{ status: 'idle' }} />);
  const group = screen.getByRole('group', { name: 'Queue order list' });
  expect(group).toHaveTextContent('Queue is Clear');
});
