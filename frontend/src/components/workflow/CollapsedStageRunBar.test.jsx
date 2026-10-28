import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsedStageRunBar } from './CollapsedStageRunBar';
import '@testing-library/jest-dom';

/***
 * MARK: CollapsedStageRunBar tests
 * @description Colocated tests for the slim bar that replaces a run of stages
 *   hidden by the tag filter: hidden count label, active-task aggregation
 *   across hidden stages, expand/collapse toggle wiring, and singular/plural
 *   wording.
 ***/

const entry = {
  kind: 'collapsed',
  id: 'collapsed-s2-s3',
  stages: [
    { id: 's2', name: 'Build', type: 'agent', tags: ['Dev'] },
    { id: 's3', name: 'Test', type: 'ci', tags: ['Dev', 'QA'] },
  ],
};

const analytics = {
  byStage: {
    s2: { activeTasksCount: 2 },
    s3: { activeTasksCount: 3 },
  },
};

function renderBar(overrides = {}) {
  const onToggle = vi.fn();
  const utils = render(
    <CollapsedStageRunBar
      entry={entry}
      isExpanded={false}
      onToggle={onToggle}
      colStyle={{ width: '48px' }}
      stageAnalytics={analytics}
      {...overrides}
    />,
  );
  return { onToggle, ...utils };
}

test('renders the hidden stage count and aggregates active tasks', () => {
  renderBar();
  expect(screen.getByTestId('collapsed-stage-run')).toBeInTheDocument();
  expect(screen.getByText('2 stages hidden')).toBeInTheDocument();
  expect(screen.getByTestId('collapsed-stage-run-tasks')).toHaveTextContent('5');
});

test('singular wording for a single hidden stage', () => {
  renderBar({ entry: { ...entry, id: 'collapsed-s2', stages: [entry.stages[0]] } });
  expect(screen.getByText('1 stage hidden')).toBeInTheDocument();
});

test('expand toggle calls onToggle and reflects aria state', () => {
  const { onToggle } = renderBar();
  const button = screen.getByRole('button', { name: 'Expand 2 collapsed stages' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('expanded state flips the accessible label', () => {
  renderBar({ isExpanded: true });
  expect(screen.getByRole('button', { name: 'Collapse 2 hidden stages' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('missing analytics degrades to a zero task count', () => {
  renderBar({ stageAnalytics: undefined });
  expect(screen.getByTestId('collapsed-stage-run-tasks')).toHaveTextContent('0');
});

test('empty stage list renders a zeroed bar without crashing', () => {
  renderBar({ entry: { kind: 'collapsed', id: 'collapsed-empty', stages: [] } });
  expect(screen.getByText('0 stages hidden')).toBeInTheDocument();
});
