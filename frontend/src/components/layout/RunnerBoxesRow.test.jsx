import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { renderWithKainBain } from '../../testUtils';
import { RunnerBoxesRow } from './RunnerBoxesRow';

/***
 * MARK: RunnerBoxesRow tests
 * @description The row: 1-4 entries render as list items with per-runner
 * test ids; 0 or 5+ render null so the parent falls back to the single-task
 * view. The row scrolls inside its container and never grows the bar.
 ***/

function entry(runnerId, statusWord = 'running') {
  return {
    runnerId,
    runnerLabel: runnerId,
    taskId: `task-${runnerId}`,
    task: { id: `task-${runnerId}`, title: `Work ${runnerId}` },
    taskTitleFirstLine: `Work ${runnerId}`,
    stageName: 'Plan',
    statusWord,
  };
}

test('renders one list item per entry with per-runner test ids', () => {
  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('alpha'), entry('bravo')]} onOpenTask={() => {}} />,
    {},
  );
  const row = screen.getByTestId('runner-boxes-row');
  expect(row).toHaveAttribute('role', 'list');
  expect(row).toHaveAttribute('aria-label', 'Live runners');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByTestId('runner-box-alpha')).toBeInTheDocument();
  expect(screen.getByTestId('runner-box-bravo')).toBeInTheDocument();
});

test('clicks forward the clicked runner task', () => {
  const onOpenTask = vi.fn();
  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('alpha'), entry('bravo')]} onOpenTask={onOpenTask} />,
    {},
  );
  fireEvent.click(screen.getByTestId('runner-box-bravo'));
  expect(onOpenTask).toHaveBeenCalledTimes(1);
  expect(onOpenTask).toHaveBeenCalledWith({ id: 'task-bravo', title: 'Work bravo' });
});

test('four entries render; five and zero render null (fallback)', () => {
  const { unmount } = renderWithKainBain(
    <RunnerBoxesRow entries={[entry('a'), entry('b'), entry('c'), entry('d')]} />,
    {},
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  unmount();

  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]} />,
    {},
  );
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Live runners' })).not.toBeInTheDocument();
});

test('zero and non-array entries render null', () => {
  const { unmount } = renderWithKainBain(<RunnerBoxesRow entries={[]} />, {});
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
  unmount();

  renderWithKainBain(<RunnerBoxesRow entries={null} />, {});
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
});

test('junk items are dropped so the row and the gate never disagree', () => {
  const { unmount } = renderWithKainBain(<RunnerBoxesRow entries={[null, 'junk']} />, {});
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
  unmount();

  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('alpha'), null]} onOpenTask={() => {}} />,
    {},
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByTestId('runner-box-alpha')).toBeInTheDocument();
});

test('duplicate runner ids render both boxes without key collision', () => {
  const onOpenTask = vi.fn();
  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('alpha'), entry('alpha')]} onOpenTask={onOpenTask} />,
    {},
  );
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  // Both boxes stay clickable and forward their own task.
  fireEvent.click(screen.getAllByTestId('runner-box-alpha')[1]);
  expect(onOpenTask).toHaveBeenCalledTimes(1);
});

test('the row is scroll-contained so it cannot cover transport controls', () => {
  renderWithKainBain(
    <RunnerBoxesRow entries={[entry('a'), entry('b'), entry('c'), entry('d')]} />,
    {},
  );
  const row = screen.getByTestId('runner-boxes-row');
  expect(row.className).toContain('overflow-x-auto');
  expect(row.className).toContain('min-w-0');
  for (const item of screen.getAllByRole('listitem')) {
    expect(item.className).toContain('shrink-0');
  }
});
